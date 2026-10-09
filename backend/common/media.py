"""Bounded decoding and canonical WebP output; client filenames are never used."""
import io
import uuid
import warnings

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image, ImageOps, UnidentifiedImageError

from .api import ApiError, failure

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 20_000_000
MAX_DIMENSION = 8192


class UploadLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith("/api/"):
            try:
                length = int(request.META.get("CONTENT_LENGTH") or 0)
            except ValueError:
                return failure("bad_request", "Invalid content length.")
            if length > MAX_UPLOAD_BYTES + 1024 * 1024:
                return failure("request_too_large", "Choose an image smaller than 8 MB.", 413)
        return self.get_response(request)


def prepare_image(upload, *, avatar=False):
    if not upload:
        raise ApiError("validation_error", "Choose an image to upload.", fields={"image": ["An image is required."]})
    if upload.size > MAX_UPLOAD_BYTES:
        raise ApiError("image_too_large", "Choose an image smaller than 8 MB.", 413)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(upload) as probe:
                if probe.format not in {"JPEG", "PNG", "WEBP"} or getattr(probe, "n_frames", 1) != 1:
                    raise ApiError("invalid_image", "Choose a still JPG, PNG, or WebP image.")
                if max(probe.size) > MAX_DIMENSION or probe.width * probe.height > MAX_PIXELS:
                    raise ApiError("image_dimensions", "Image must be at most 8192 pixels per side and 20 megapixels.")
                probe.verify()
            upload.seek(0)
            with Image.open(upload) as source:
                source.load()
                oriented = ImageOps.exif_transpose(source)
                image = oriented.convert("RGBA" if "A" in oriented.getbands() or "transparency" in oriented.info else "RGB")
                if avatar:
                    image = ImageOps.fit(image, (256, 256), method=Image.Resampling.LANCZOS)
                else:
                    image.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
                # A fresh image prevents EXIF/GPS/text metadata from being retained.
                clean = Image.new(image.mode, image.size)
                clean.paste(image)
                thumbnail = clean.copy()
                thumbnail.thumbnail((640, 640), Image.Resampling.LANCZOS)
                result = []
                for item in (clean, thumbnail):
                    buffer = io.BytesIO()
                    item.save(buffer, format="WEBP", quality=88, method=4)
                    result.append(buffer.getvalue())
                return result[0], result[1], clean.width, clean.height
    except ApiError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ApiError("invalid_image", "We couldn’t read that image. Choose a valid JPG, PNG, or WebP.")


def store_images(prepared, owner_id, *, avatar=False):
    original, thumbnail, width, height = prepared
    prefix = f"{'avatars' if avatar else 'posts'}/{owner_id}/{uuid.uuid4().hex}"
    saved = []
    try:
        saved.append(default_storage.save(prefix + ".webp", ContentFile(original)))
        if not avatar:
            saved.append(default_storage.save(prefix + "-thumb.webp", ContentFile(thumbnail)))
        return saved, width, height
    except Exception:
        delete_files(saved)
        raise


def delete_files(names):
    for name in names:
        if name:
            try:
                default_storage.delete(name)
            except OSError:
                # Database deletion must not be undone by a temporary storage
                # outage. Keep a durable retry record for failed file removal.
                from collection.models import MediaCleanup
                MediaCleanup.objects.get_or_create(name=name)
