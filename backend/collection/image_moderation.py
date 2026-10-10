"""Private upload quarantine and durable CPU moderation jobs. No runtime network calls."""
import hashlib
import io
import uuid
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from django.db import transaction
from django.db.models import Q, Sum
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from PIL import Image

from common.api import ApiError, endpoint, success
from common.media import store_images, delete_files
from .models import ImageScan, Post, ContentReport, Follow, ImageQuotaLock, ImageUploadUsage
from .activity import emit

MODEL_SHA256 = "c15d8273adad2d0a92f014cc69ab2d6c311a06777a55545f2c4eb46f51911f0f"
LABELS = ("FEMALE_GENITALIA_COVERED", "FACE_FEMALE", "BUTTOCKS_EXPOSED", "FEMALE_BREAST_EXPOSED", "FEMALE_GENITALIA_EXPOSED", "MALE_BREAST_EXPOSED", "ANUS_EXPOSED", "FEET_EXPOSED", "BELLY_COVERED", "FEET_COVERED", "ARMPITS_COVERED", "ARMPITS_EXPOSED", "FACE_MALE", "BELLY_EXPOSED", "MALE_GENITALIA_EXPOSED", "ANUS_COVERED", "FEMALE_BREAST_COVERED", "BUTTOCKS_COVERED")
BLOCK_LABELS = {"BUTTOCKS_EXPOSED", "FEMALE_BREAST_EXPOSED", "MALE_BREAST_EXPOSED", "FEMALE_GENITALIA_EXPOSED", "ANUS_EXPOSED", "MALE_GENITALIA_EXPOSED"}


def storage():
    return FileSystemStorage(location=settings.PRIVATE_MEDIA_ROOT)


@transaction.atomic
def enqueue(owner, prepared, *, post=None, profile=None):
    original, thumb, width, height = prepared
    quota, _ = ImageQuotaLock.objects.get_or_create(pk=1)
    ImageQuotaLock.objects.select_for_update().get(pk=quota.pk)
    usage, _ = ImageUploadUsage.objects.get_or_create(owner=owner, day=timezone.now().date())
    if usage.uploads >= settings.IMAGE_UPLOADS_PER_DAY:
        raise ApiError("upload_quota", "You have reached today's image upload limit. Try again tomorrow.", 429)
    pending = ImageScan.objects.filter(owner=owner, status__in=["pending", "scanning", "review"])
    if profile: pending = pending.exclude(profile=profile)
    if pending.count() >= settings.IMAGE_PENDING_PER_USER:
        raise ApiError("upload_quota", "Too many images are awaiting checks. Wait for them to finish or remove an upload.", 429)
    store = storage()
    # Account for uploads created before stored-byte tracking was introduced.
    for existing in ImageScan.objects.filter(stored_bytes=0).exclude(original=""):
        size = sum(store.size(name) for name in [existing.original, existing.thumbnail] if name and store.exists(name))
        ImageScan.objects.filter(pk=existing.pk).update(stored_bytes=size)
    size = len(original) + len(thumb)
    total = ImageScan.objects.aggregate(size=Sum("stored_bytes"))["size"] or 0
    user_total = ImageScan.objects.filter(owner=owner).aggregate(size=Sum("stored_bytes"))["size"] or 0
    if total + size > settings.IMAGE_QUARANTINE_TOTAL_BYTES or user_total + size > settings.IMAGE_QUARANTINE_USER_BYTES:
        raise ApiError("upload_quota", "Image storage is full. Remove old uploads or contact an administrator.", 429)
    usage.uploads += 1
    usage.normalized_bytes += size
    usage.save()
    names = []
    try:
        prefix = f"quarantine/{owner.pk}/{uuid.uuid4().hex}"
        names.append(store.save(prefix + ".webp", ContentFile(original)))
        names.append(store.save(prefix + "-thumb.webp", ContentFile(thumb)))
        if profile:
            ImageScan.objects.filter(profile=profile, status__in=["pending", "scanning", "review", "rejected"]).update(status="canceled", token=None)
        return ImageScan.objects.create(owner=owner, post=post, profile=profile, original=names[0], thumbnail=names[1], width=width, height=height, stored_bytes=size)
    except Exception:
        for name in names: store.delete(name)
        raise


def scan_data(scan):
    return {"id": scan.pk, "status": scan.status, "post_id": scan.post_id, "preview": f"/api/image-scans/{scan.pk}/image/", "message": {"pending": "Processing your image. Only you can see it until it passes the check.", "scanning": "Checking your image. Only you can see it for now.", "review": "Your image needs moderator review before it can be published.", "rejected": "This image was blocked by our no-nudity policy. You can request a review.", "approved": "Image approved.", "canceled": "This upload was replaced or removed."}.get(scan.status, "Processing image.")}


@endpoint(['GET'], authenticated=True)
def processing_queue(request):
    from .social import moderator
    from .pagination import paginate
    moderator(request)
    query = ImageScan.objects.filter(status__in=['pending', 'scanning']).select_related('owner')
    items, cursor = paginate(query, request, ['image-processing'])
    return success({'items': [{**scan_data(item), 'username': item.owner.username, 'created_at': item.created_at.isoformat(), 'retrying': bool(item.error)} for item in items], 'next_cursor': cursor})


@endpoint(['POST'], authenticated=True, rate=(30, 60))
@transaction.atomic
def request_review(request, pk):
    from .social import moderator, report_data
    moderator(request)
    scan = get_object_or_404(ImageScan.objects.select_for_update(), pk=pk)
    if scan.status in ['approved', 'canceled']: raise Http404
    report, _ = ContentReport.objects.get_or_create(kind='image', target_id=scan.pk, reporter=None, defaults={'target_user': scan.owner, 'reason': 'Moderator opened a pending image for review.', 'evidence': str(scan.scores)})
    return success(report_data(report))


@endpoint(["GET"], authenticated=True)
def scan_status(request, pk):
    scan = get_object_or_404(ImageScan, pk=pk, owner=request.user)
    from accounts.views import serialize_user
    return success({**scan_data(scan), "user": serialize_user(request.user)})


@endpoint(["GET"], authenticated=True)
def preview(request, pk):
    scan = get_object_or_404(ImageScan, pk=pk)
    reviewer = request.user.is_staff and request.user.has_perm("collection.review_reports")
    if scan.owner_id != request.user.pk and not reviewer: raise Http404
    name = scan.thumbnail if request.GET.get('thumbnail') == '1' else scan.original
    if not name or not storage().exists(name): raise Http404
    response = FileResponse(storage().open(name, "rb"), content_type="image/webp")
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response


@endpoint(["POST"], authenticated=True, rate=(10, 3600))
@transaction.atomic
def appeal(request, pk):
    scan = get_object_or_404(ImageScan, pk=pk, owner=request.user, status="rejected")
    ContentReport.objects.get_or_create(kind="image", target_id=scan.pk, reporter=None, defaults={"target_user": scan.owner, "reason": "Uploader requested review of a blocked image.", "evidence": str(scan.scores)})
    ContentReport.objects.filter(kind="image", target_id=scan.pk).update(status="open")
    return success({"requested": True})


class Detector:
    def __init__(self):
        import onnxruntime as ort
        path = Path(settings.IMAGE_MODERATION_MODEL)
        if hashlib.sha256(path.read_bytes()).hexdigest() != MODEL_SHA256:
            raise ValueError("Model checksum mismatch")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        options.add_session_config_entry("session.intra_op.allow_spinning", "0")
        self.session = ort.InferenceSession(str(path), sess_options=options, providers=["CPUExecutionProvider"])

    def predict(self, data):
        import numpy as np
        # Square padding, RGB, 0..1 NCHW input follows the detector's input contract.
        with Image.open(io.BytesIO(data)) as source:
            image = source.convert("RGB")
            side = max(image.size)
            padded = Image.new("RGB", (side, side))
            padded.paste(image, (0, 0))
            pixels = np.asarray(padded.resize((320, 320), Image.Resampling.BILINEAR), dtype=np.float32) / 255.0
        tensor = np.transpose(pixels, (2, 0, 1))[None]
        output = self.session.run(None, {self.session.get_inputs()[0].name: tensor})[0]
        if output.shape != (1, 22, 2100) or not np.isfinite(output).all():
            raise ValueError("Unexpected detector output")
        # Only the winning category for each candidate contributes to the policy.
        classes = output[0, 4:, :]
        winners = classes.argmax(axis=0)
        return {label: float(classes[index, winners == index].max(initial=0)) for index, label in enumerate(LABELS) if label in BLOCK_LABELS}


def decision(scores):
    if any(not isinstance(value, (int, float)) or not 0 <= value <= 1 for value in scores.values()):
        raise ValueError("Invalid confidence")
    value = max(scores.values(), default=0)
    if not 0 <= value <= 1: raise ValueError("Invalid confidence")
    return "rejected" if value >= settings.IMAGE_MODERATION_REJECT else "review" if value >= settings.IMAGE_MODERATION_REVIEW else "approved"


@transaction.atomic
def finish(pk, token, status, scores):
    scan = ImageScan.objects.select_for_update().filter(pk=pk, token=token, status="scanning").first()
    if not scan: return
    if status == "approved": publish(scan)
    else:
        if scan.post_id: Post.objects.filter(pk=scan.post_id).update(moderation_status=status)
        ContentReport.objects.get_or_create(kind="image", target_id=scan.pk, reporter=None, defaults={"target_user": scan.owner, "reason": "Automatic image check: " + status, "evidence": str(scores), "status": "open" if status == "review" else "actioned"})
    scan.status, scan.scores, scan.token, scan.lease, scan.error = status, scores, None, None, ""
    scan.save()


def publish(scan):
    if scan.status == "approved": return
    if scan.status == "canceled": raise ValueError("Upload was canceled")
    store = storage()
    with store.open(scan.original, "rb") as original, store.open(scan.thumbnail, "rb") as thumb:
        prepared = original.read(), thumb.read(), scan.width, scan.height
    names, _, _ = store_images(prepared, scan.owner_id, avatar=bool(scan.profile_id))
    try:
        if scan.post_id:
            Post.objects.filter(pk=scan.post_id).update(image=names[0], thumbnail=names[1], moderation_status="approved")
            post = Post.objects.get(pk=scan.post_id)
            if not post.is_hidden:
                for edge in Follow.objects.filter(target_id=scan.owner_id, follower__is_active=True).select_related("follower"):
                    emit(edge.follower, scan.owner, "pin", f"pin:{post.pk}", post)
        elif scan.profile_id:
            from accounts.models import Profile
            profile = Profile.objects.select_for_update().get(pk=scan.profile_id)
            previous = profile.avatar.name
            profile.avatar = names[0]
            profile.save(update_fields=["avatar"])
            transaction.on_commit(lambda: delete_files([previous]))
        scan.status = "approved"
    except Exception:
        delete_files(names)
        raise


def run_one(detector):
    now = timezone.now()
    with transaction.atomic():
        scan = ImageScan.objects.filter(Q(status="pending") | Q(status="scanning", lease__lt=now)).filter(Q(retry_at__isnull=True) | Q(retry_at__lte=now)).order_by("id").first()
        if not scan: return False
        token = uuid.uuid4()
        scan.status, scan.token, scan.lease = "scanning", token, now + timedelta(minutes=5)
        scan.attempts += 1
        scan.save()
    try:
        with storage().open(scan.original, "rb") as file: scores = detector.predict(file.read())
        finish(scan.pk, token, decision(scores), scores)
    except Exception:
        # Fail closed; no image bytes/filenames or model details are logged to users.
        ImageScan.objects.filter(pk=scan.pk, token=token, status="scanning").update(status="pending", token=None, lease=None, error="scan_unavailable", retry_at=now + timedelta(seconds=min(300, 2 ** min(scan.attempts, 8))))
    return True
