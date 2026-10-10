from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.http import Http404, FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from common.api import ApiError, endpoint, success
from messaging.models import Message, Attachment, Block
from messaging.services import member
from .activity import blocked, emit
from .models import Follow, ActivityNotification, ActivitySettings, ContentReport, ModerationLog, Post, Comment
from .pagination import paginate
from .serializers import author_data


def validate(data, allowed):
    if set(data) - set(allowed):
        raise ApiError("invalid_input", "Only the documented fields may be changed.")


def text(data, key):
    value = data.get(key, "")
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= 1000:
        raise ApiError("invalid_input", "Provide a reason between 1 and 1000 characters.")
    return value.strip()


@endpoint(["POST", "DELETE"], authenticated=True, rate=(30, 60))
@transaction.atomic
def follow(request, username):
    validate(request.data, [])
    target = get_object_or_404(get_user_model(), username=username.lower(), is_active=True)
    if target.pk == request.user.pk:
        raise ApiError("self_follow", "You cannot follow yourself.")
    if request.method == "POST":
        if blocked(request.user.pk, target.pk):
            raise ApiError("blocked", "Following is unavailable for this account.", 403)
        edge, created = Follow.objects.get_or_create(follower=request.user, target=target)
        if created:
            emit(target, request.user, "follow", f"follow:{edge.pk}")
    else:
        Follow.objects.filter(follower=request.user, target=target).delete()
    return success({"following": request.method == "POST"})


@endpoint(["GET"], authenticated=True)
def follow_list(request, username, direction):
    target = get_object_or_404(get_user_model(), username=username.lower(), is_active=True)
    query = Follow.objects.filter(target=target, follower__is_active=True) if direction == "followers" else Follow.objects.filter(follower=target, target__is_active=True)
    query = query.select_related("follower__profile", "target__profile")
    items, cursor = paginate(query, request, ["follows", target.pk, direction])
    return success({"items": [author_data(edge.follower if direction == "followers" else edge.target) for edge in items], "next_cursor": cursor})


def notification_data(item):
    actor = item.actor if item.actor and item.actor.is_active else None
    post = item.post if item.post and not item.post.is_hidden and item.post.owner.is_active else None
    path = f"/posts/{post.pk}" if post else f"/u/{actor.username}" if actor and item.kind == "follow" else None
    return {"id": item.pk, "kind": item.kind, "actor": author_data(actor) if actor else None, "post_title": post.title if post else None, "path": path, "read": item.read_at is not None, "created_at": item.created_at.isoformat()}


@endpoint(["GET", "POST"], authenticated=True, rate=(60, 60))
def notifications(request):
    query = ActivityNotification.objects.filter(recipient=request.user)
    blocked_ids = Block.objects.filter(user=request.user).values('target_id')
    blocking_ids = Block.objects.filter(target=request.user).values('user_id')
    query = query.exclude(actor_id__in=blocked_ids).exclude(actor_id__in=blocking_ids)
    if request.method == "POST":
        validate(request.data, ["id", "through_id"])
        value = request.data.get("id", request.data.get("through_id"))
        if type(value) is not int or value <= 0 or len(request.data) != 1:
            raise ApiError("invalid_input", "Choose a notification or an inbox boundary.")
        if "id" in request.data:
            get_object_or_404(query, pk=value)
            query = query.filter(pk=value)
        else:
            query = query.filter(pk__lte=value)
        query.filter(read_at__isnull=True).update(read_at=timezone.now())
        return success({"read": True})
    unread_only = request.GET.get("unread", "0")
    if unread_only not in ("0", "1"):
        raise ApiError("invalid_filter", "Choose all or unread notifications.")
    unread = query.filter(read_at__isnull=True).count()
    latest_id = query.order_by("-id").values_list("id", flat=True).first()
    if unread_only == "1": query = query.filter(read_at__isnull=True)
    query = query.select_related("actor__profile", "post__owner")
    items, cursor = paginate(query, request, ["notifications", request.user.pk, unread_only])
    return success({"items": [notification_data(item) for item in items], "next_cursor": cursor, "unread": unread, "latest_id": latest_id})


@endpoint(["GET", "PATCH"], authenticated=True, rate=(30, 60))
def notification_settings(request):
    prefs, _ = ActivitySettings.objects.get_or_create(user=request.user)
    fields = ["follows", "comments", "saves", "pins"]
    if request.method == "PATCH":
        validate(request.data, fields)
        if any(type(value) is not bool for value in request.data.values()):
            raise ApiError("invalid_input", "Notification preferences must be true or false.")
        for key, value in request.data.items(): setattr(prefs, key, value)
        prefs.save()
    return success({key: getattr(prefs, key) for key in fields})


@endpoint(["POST"], authenticated=True, rate=(10, 3600))
def report(request):
    validate(request.data, ["kind", "target_id", "reason"])
    kind, pk = request.data.get("kind"), request.data.get("target_id")
    reason = text(request.data, "reason")
    if kind not in ("post", "comment", "user", "message") or type(pk) is not int or pk <= 0:
        raise ApiError("invalid_target", "Choose valid content to report.")
    if kind == "post":
        obj = get_object_or_404(Post, pk=pk, is_hidden=False, owner__is_active=True)
        owner, evidence = obj.owner, f"{obj.title}\n{obj.description}"
    elif kind == "comment":
        obj = get_object_or_404(Comment, pk=pk, is_hidden=False, post__is_hidden=False, author__is_active=True, post__owner__is_active=True)
        owner, evidence = obj.author, obj.text
    elif kind == "user":
        owner = get_object_or_404(get_user_model(), pk=pk, is_active=True)
        evidence = owner.username
    else:
        obj = get_object_or_404(Message, pk=pk, is_hidden=False, deleted_at__isnull=True)
        own = member(request.user, obj.conversation_id)
        if pk <= own.joined_after_id: raise Http404
        owner, evidence = obj.sender, obj.text
    item, created = ContentReport.objects.get_or_create(reporter=request.user, kind=kind, target_id=pk, defaults={"target_user": owner, "reason": reason, "evidence": evidence})
    return success({"id": item.pk, "reported": True}, 201 if created else 200)


def moderator(request):
    if not request.user.is_staff or not request.user.has_perm("collection.review_reports"):
        raise ApiError("forbidden", "You do not have access to moderation.", 403)


def report_data(item):
    media = None
    if item.kind == "post":
        post = Post.objects.filter(pk=item.target_id).first()
        if post: media = post.image.url
    if item.kind == "message" and Attachment.objects.filter(message_id=item.target_id).exists():
        media = f"/api/moderation/{item.pk}/media/"
    return {"id": item.pk, "kind": item.kind, "target_id": item.target_id, "target_username": item.target_user.username if item.target_user else None, "reporter": item.reporter.username if item.reporter else None, "reason": item.reason, "evidence": item.evidence, "status": item.status, "created_at": item.created_at.isoformat(), "media_url": media}


@endpoint(["GET"], authenticated=True)
def moderation_media(request, pk):
    moderator(request)
    item = get_object_or_404(ContentReport, pk=pk, kind="message")
    attachment = get_object_or_404(Attachment, message_id=item.target_id)
    from messaging.views import private_storage
    storage = private_storage()
    if not storage.exists(attachment.name): raise Http404
    response = FileResponse(storage.open(attachment.name, "rb"), content_type="image/webp")
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Disposition"] = 'inline; filename="reported-image.webp"'
    return response


@endpoint(["GET"], authenticated=True)
def moderation_queue(request):
    moderator(request)
    status = request.GET.get("status", "open")
    if status not in ("open", "actioned", "dismissed", "all"):
        raise ApiError("invalid_filter", "Choose a valid report status.")
    query = ContentReport.objects.select_related("target_user", "reporter")
    if status != "all": query = query.filter(status=status)
    items, cursor = paginate(query, request, ["moderation", status])
    return success({"items": [report_data(item) for item in items], "next_cursor": cursor})


@endpoint(["GET", "POST"], authenticated=True, rate=(30, 60))
@transaction.atomic
def moderate(request, pk):
    moderator(request)
    item = get_object_or_404(ContentReport.objects.select_for_update().select_related("target_user"), pk=pk)
    if request.method == "GET":
        logs = ModerationLog.objects.filter(report=item).select_related("moderator").order_by("-id")[:100]
        return success({**report_data(item), "history": [{"id": log.pk, "action": log.action, "reason": log.reason, "moderator": log.moderator.username if log.moderator else None, "created_at": log.created_at.isoformat()} for log in logs]})
    validate(request.data, ["action", "reason"])
    reason, action = text(request.data, "reason"), request.data.get("action")
    if action not in ("dismiss", "reopen", "hide", "restore", "suspend", "restore_account"):
        raise ApiError("invalid_action", "Choose a valid moderation action.")
    if action in ("hide", "restore"):
        model = {"post": Post, "comment": Comment, "message": Message}.get(item.kind)
        if model is None: raise ApiError("invalid_action", "Use an account action for this report.")
        obj = get_object_or_404(model.objects.select_for_update(), pk=item.target_id)
        obj.is_hidden = action == "hide"
        obj.save(update_fields=["is_hidden"])
        if item.kind == "message":
            from messaging.services import notify
            notify(obj.conversation_id)
    elif action in ("suspend", "restore_account"):
        owner = get_object_or_404(get_user_model().objects.select_for_update(), pk=item.target_user_id)
        if owner.is_staff or owner.is_superuser or owner.pk == request.user.pk:
            raise ApiError("protected_account", "Staff accounts cannot be changed from the report queue.", 403)
        owner.is_active = action == "restore_account"
        owner.save(update_fields=["is_active"])
        if action == "suspend":
            from django.contrib.sessions.models import Session
            for session in Session.objects.filter(expire_date__gt=timezone.now()).iterator():
                if session.get_decoded().get("_auth_user_id") == str(owner.pk):
                    session.delete()
    item.status = "dismissed" if action == "dismiss" else "open" if action == "reopen" else "actioned"
    item.save(update_fields=["status", "updated_at"])
    if item.kind == "message":
        from messaging.models import Report
        Report.objects.filter(message_id=item.target_id, user_id=item.reporter_id).update(resolved=item.status != "open")
    ModerationLog.objects.create(report=item, moderator=request.user, action=action, reason=reason)
    return success(report_data(item))
