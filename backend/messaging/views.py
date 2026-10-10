import uuid

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from django.db import transaction
from django.db.models import Q, F
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.conf import settings
from common.api import ApiError, endpoint, success
from common.media import prepare_image
from collection.pagination import paginate
from collection.views import validate_keys
from collection.models import Post
from .models import Attachment, Block, Conversation, Membership, Message, Reaction, Report
from .services import blocked, can_send, conversation_data, member, message_data, notify, preferences, visible_messages


def text(data, key, maximum, required=False):
    value = data.get(key, "")
    if not isinstance(value, str) or len(value) > maximum or (required and not value.strip()):
        raise ApiError("invalid_input", f"Use {'1–' if required else 'up to '}{maximum} characters for {key}.")
    return value.strip()


def user_by_name(value):
    if not isinstance(value, str):
        raise ApiError("invalid_input", "Choose a username.")
    return get_object_or_404(get_user_model(), username=value.strip().lower(), is_active=True)


def private_storage():
    return FileSystemStorage(location=settings.PRIVATE_MEDIA_ROOT, file_permissions_mode=0o600, directory_permissions_mode=0o700)


@endpoint(["GET", "POST"], authenticated=True, rate=(30, 60))
def conversations(request):
    if request.method == "GET":
        folder = request.GET.get("folder", "inbox")
        query = Membership.objects.filter(user=request.user, active=True).select_related("conversation")
        if folder == "requests": query = query.filter(accepted=False)
        elif folder == "archive": query = query.filter(accepted=True, archived=True)
        elif folder == "inbox": query = query.filter(accepted=True, archived=False)
        else: raise ApiError("invalid_filter", "Choose inbox, requests, or archive.")
        q = request.GET.get("q", "").strip()
        if len(q) > 100: raise ApiError("invalid_filter", "Search must be at most 100 characters.")
        if q:
            query = query.filter(Q(conversation__title__icontains=q) | Q(conversation__memberships__user__username__icontains=q) | Q(conversation__memberships__user__profile__display_name__icontains=q)).distinct()
        # Live refresh moves conversations with recent activity to the top.
        candidates = Conversation.objects.filter(id__in=query.values("conversation_id"))
        items, cursor = paginate(candidates, request, ["chat", request.user.pk, folder, q], date_field="updated_at")
        own = {item.conversation_id: item for item in query.filter(conversation_id__in=[item.pk for item in items])}
        return success({"items": [conversation_data(own[item.pk]) for item in items], "next_cursor": cursor})
    validate_keys(request.data, ["username", "usernames", "title"])
    if "username" in request.data:
        target = user_by_name(request.data["username"])
        if target == request.user or blocked(request.user.pk, target.pk) or preferences(target).contact_policy == "nobody":
            raise ApiError("contact_unavailable", "This person is not available for messages.", 403)
        key = ":".join(map(str, sorted([request.user.pk, target.pk])))
        with transaction.atomic():
            conversation, created = Conversation.objects.get_or_create(direct_key=key, defaults={"kind": "direct"})
            if created:
                Membership.objects.create(conversation=conversation, user=request.user, accepted=True)
                Membership.objects.create(conversation=conversation, user=target, accepted=preferences(target).contact_policy == "everyone")
            membership = member(request.user, conversation.pk)
        notify(conversation.pk)
        return success(conversation_data(membership), 201 if created else 200)
    names = [name.strip() for name in text(request.data, "usernames", 1500, True).split(",") if name.strip()]
    title = text(request.data, "title", 100, True)
    targets = {user.pk: user for user in map(user_by_name, names)}
    targets.pop(request.user.pk, None)
    if not 1 <= len(targets) <= 19:
        raise ApiError("invalid_members", "Groups need 2–20 people.")
    if any(blocked(request.user.pk, target.pk) or preferences(target).contact_policy == "nobody" for target in targets.values()):
        raise ApiError("contact_unavailable", "A selected person is not available for invitations.", 403)
    with transaction.atomic():
        conversation = Conversation.objects.create(kind="group", title=title)
        own = Membership.objects.create(conversation=conversation, user=request.user, role="admin", accepted=True)
        for target in targets.values(): Membership.objects.create(conversation=conversation, user=target, accepted=preferences(target).contact_policy == "everyone")
    notify(conversation.pk)
    return success(conversation_data(own), 201)


@endpoint(["GET", "PATCH"], authenticated=True, rate=(30, 60))
def conversation(request, pk):
    own = member(request.user, pk)
    if request.method == "PATCH":
        validate_keys(request.data, ["muted", "archived", "title", "accept", "leave"])
        with transaction.atomic():
            own = get_object_or_404(Membership.objects.select_for_update(), pk=own.pk, active=True)
            for field in ["muted", "archived"]:
                if field in request.data:
                    if not isinstance(request.data[field], bool): raise ApiError("invalid_input", f"{field} must be true or false.")
                    setattr(own, field, request.data[field])
            if "accept" in request.data:
                if request.data["accept"] is not True: raise ApiError("invalid_input", "Use accept: true.")
                own.accepted = True
            if "title" in request.data:
                if own.role != "admin" or own.conversation.kind != "group" or not own.accepted: raise Http404
                own.conversation.title = text(request.data, "title", 100, True)
                own.conversation.save(update_fields=["title", "updated_at"])
            if request.data.get("leave") is True:
                others = own.conversation.memberships.filter(active=True).exclude(pk=own.pk)
                if own.role == "admin" and others.exists() and not others.filter(role="admin", accepted=True).exists():
                    raise ApiError("transfer_admin", "Make another member an admin before leaving.")
                own.active = False
            elif "leave" in request.data: raise ApiError("invalid_input", "Use leave: true.")
            own.save()
        notify(pk)
        if not own.active: return success({"left": True})
    return success(conversation_data(own))


@endpoint(["POST", "PATCH", "DELETE"], authenticated=True, rate=(30, 60))
def members(request, pk):
    own = member(request.user, pk)
    if own.role != "admin" or not own.accepted or own.conversation.kind != "group": raise Http404
    validate_keys(request.data, ["username", "role"])
    target = user_by_name(request.data.get("username"))
    with transaction.atomic():
        Conversation.objects.select_for_update().get(pk=pk)
        own = member(request.user, pk)
        if own.role != "admin" or not own.accepted: raise Http404
        if request.method == "POST":
            if blocked(request.user.pk, target.pk) or preferences(target).contact_policy == "nobody": raise ApiError("contact_unavailable", "This person is not available for invitations.", 403)
            if Membership.objects.filter(conversation_id=pk, user=target, active=True).exists(): return success(conversation_data(own))
            if Membership.objects.filter(conversation_id=pk, active=True).count() >= 20: raise ApiError("group_full", "A group can have up to 20 people.")
            latest = Message.objects.filter(conversation_id=pk).order_by("-id").first()
            membership, created = Membership.objects.get_or_create(conversation_id=pk, user=target, defaults={"joined_after_id": latest.pk if latest else 0})
            if not created and membership.active: return success(conversation_data(own))
            membership.active = True
            membership.accepted = preferences(target).contact_policy == "everyone"
            membership.role = "member"
            membership.joined_after_id = latest.pk if latest else 0
            membership.last_read_id = membership.joined_after_id
            membership.last_delivered_id = membership.joined_after_id
            membership.save()
        else:
            membership = get_object_or_404(Membership, conversation_id=pk, user=target, active=True)
            if request.method == "PATCH":
                role = request.data.get("role")
                if role not in ["admin", "member"] or not membership.accepted: raise ApiError("invalid_role", "Choose an accepted member and admin or member role.")
                if membership.role == "admin" and role == "member" and not Membership.objects.filter(conversation_id=pk, active=True, accepted=True, role="admin").exclude(pk=membership.pk).exists(): raise ApiError("last_admin", "A group needs an admin.")
                membership.role = role
            else:
                if membership.pk == own.pk: raise ApiError("leave_group", "Use Leave conversation to remove yourself.")
                membership.active = False
            membership.save()
    notify(pk)
    return success(conversation_data(own))


@endpoint(["GET", "POST"], authenticated=True, rate=(60, 60))
def messages(request, pk):
    own = member(request.user, pk)
    query = visible_messages(own)
    if request.method == "GET":
        q = request.GET.get("q", "").strip()
        if len(q) > 100: raise ApiError("invalid_filter", "Search must be at most 100 characters.")
        if q: query = query.filter(text__icontains=q, deleted_at__isnull=True, is_hidden=False)
        if request.GET.get("around"):
            try: anchor_id = int(request.GET["around"])
            except ValueError: raise ApiError("invalid_filter", "Choose a valid message.")
            if q: raise ApiError("invalid_filter", "Clear search before jumping to a message.")
            anchor = get_object_or_404(query, pk=anchor_id)
            # Seek to the anchor; the signed older-history cursor remains usable normally.
            query = query.filter(id__lte=anchor.pk)
        items, cursor = paginate(query, request, ["messages", pk, request.user.pk, own.joined_after_id, q])
        return success({"items": [message_data(item, request.user) for item in items], "next_cursor": cursor})
    validate_keys(request.data, ["text", "client_id", "pin_id", "reply_id", "attachment_id"])
    for key in ["pin_id", "reply_id", "attachment_id"]:
        if key in request.data and (not isinstance(request.data[key], int) or isinstance(request.data[key], bool) or request.data[key] <= 0): raise ApiError("invalid_input", f"{key} must be a positive integer.")
    try: client_id = uuid.UUID(str(request.data.get("client_id")))
    except (ValueError, TypeError, AttributeError): raise ApiError("invalid_client_id", "A unique message identifier is required.")
    existing = query.filter(sender=request.user, client_id=client_id).first()
    if existing: return success(message_data(existing, request.user))
    content = text(request.data, "text", 4000)
    with transaction.atomic():
        Conversation.objects.select_for_update().get(pk=pk)
        own = member(request.user, pk)
        existing = visible_messages(own).filter(sender=request.user, client_id=client_id).first()
        if existing: return success(message_data(existing, request.user))
        can_send(own)
        pin = get_object_or_404(Post, pk=request.data["pin_id"], owner__is_active=True, is_hidden=False) if request.data.get("pin_id") else None
        reply = get_object_or_404(query, pk=request.data["reply_id"]) if request.data.get("reply_id") else None
        attachment = get_object_or_404(Attachment, pk=request.data["attachment_id"], conversation_id=pk, uploader=request.user, message__isnull=True) if request.data.get("attachment_id") else None
        if not content and not pin and not attachment: raise ApiError("empty_message", "Write a message or attach an image or pin.")
        item = Message.objects.create(conversation_id=pk, sender=request.user, client_id=client_id, text=content, pin=pin, reply=reply)
        if attachment:
            attachment.message = item
            attachment.save(update_fields=["message"])
        Conversation.objects.filter(pk=pk).update(updated_at=timezone.now())
        own.archived = False
        own.save(update_fields=["archived"])
    notify(pk, request.user.pk)
    return success(message_data(visible_messages(own).get(pk=item.pk), request.user), 201)


@endpoint(["GET"], authenticated=True)
def shared_media(request, pk):
    own = member(request.user, pk)
    kind = request.GET.get("kind", "all")
    if kind not in ("all", "photos", "pins"):
        raise ApiError("invalid_filter", "Choose photos, pins, or all shared items.")
    query = visible_messages(own).filter(deleted_at__isnull=True, is_hidden=False)
    photos = Q(attachment__isnull=False)
    pins = Q(pin__isnull=False, pin__owner__is_active=True, pin__is_hidden=False)
    query = query.filter(photos if kind == "photos" else pins if kind == "pins" else photos | pins).select_related("attachment")
    items, cursor = paginate(query, request, ["shared-media", pk, request.user.pk, own.joined_after_id, kind])
    return success({"items": [message_data(item, request.user) for item in items], "next_cursor": cursor})


@endpoint(["GET", "PATCH", "DELETE"], authenticated=True, rate=(60, 60))
@transaction.atomic
def message_actions(request, pk):
    item = get_object_or_404(Message, pk=pk)
    own = member(request.user, item.conversation_id)
    if item.pk <= own.joined_after_id: raise Http404
    if request.method == "GET": return success(message_data(visible_messages(own).get(pk=pk), request.user))
    if item.sender_id != request.user.pk: raise Http404
    validate_keys(request.data, ["text"])
    if request.method == "PATCH":
        contact_write(own)
        if item.deleted_at or item.is_hidden: raise Http404
        item.text = text(request.data, "text", 4000, True)
        item.edited_at = timezone.now()
    else:
        item.text = ""
        item.pin = None
        item.reply = None
        item.deleted_at = timezone.now()
        item.reactions.all().delete()
        attachment = getattr(item, "attachment", None)
        if attachment: attachment.delete()
    item.save()
    notify(item.conversation_id)
    return success(message_data(visible_messages(own).get(pk=pk), request.user))


@endpoint(["POST", "DELETE"], authenticated=True, rate=(60, 60))
def reactions(request, pk):
    item = get_object_or_404(Message, pk=pk, deleted_at__isnull=True, is_hidden=False)
    own = member(request.user, item.conversation_id)
    if not own.accepted or pk <= own.joined_after_id: raise Http404
    contact_write(own)
    validate_keys(request.data, ["emoji"])
    emoji = request.data.get("emoji")
    if emoji not in ["❤️", "👍", "😂", "✨", "😮", "😢"]: raise ApiError("invalid_reaction", "Choose one of the available reactions.")
    if request.method == "POST": Reaction.objects.get_or_create(message=item, user=request.user, emoji=emoji)
    else: Reaction.objects.filter(message=item, user=request.user, emoji=emoji).delete()
    notify(item.conversation_id)
    return success(message_data(visible_messages(own).get(pk=pk), request.user))


@endpoint(["POST"], authenticated=True, rate=(120, 60))
def receipts(request, pk):
    own = member(request.user, pk)
    validate_keys(request.data, ["message_id", "read"])
    message_id = request.data.get("message_id")
    if not isinstance(message_id, int) or isinstance(message_id, bool): raise ApiError("invalid_input", "Choose a message identifier.")
    item = get_object_or_404(visible_messages(own), pk=message_id)
    if "read" in request.data and not isinstance(request.data["read"], bool): raise ApiError("invalid_input", "read must be true or false.")
    fields = {"last_delivered_id": item.pk}
    if request.data.get("read") and own.accepted: fields["last_read_id"] = item.pk
    changed = sum(Membership.objects.filter(pk=own.pk, **{f"{field}__lt": value}).update(**{field: value}) for field, value in fields.items())
    if changed: notify(pk)
    return success({"received": True})


@endpoint(["POST"], authenticated=True, rate=(15, 60), multipart=True)
def attachment_upload(request, pk):
    own = member(request.user, pk)
    can_send(own)
    validate_keys(request.data, [])
    if set(request.FILES) != {"image"}: raise ApiError("invalid_image", "Choose one image.")
    original, thumbnail, width, height = prepare_image(request.FILES["image"])
    storage = private_storage()
    name = storage.save(f"chat/{pk}/{uuid.uuid4().hex}.webp", ContentFile(original))
    try: attachment = Attachment.objects.create(conversation_id=pk, uploader=request.user, name=name, width=width, height=height)
    except Exception:
        storage.delete(name)
        raise
    return success({"id": attachment.pk, "url": f"/api/chat/attachments/{attachment.pk}/", "width": width, "height": height}, 201)


@endpoint(["GET"], authenticated=True)
def attachment_download(request, pk):
    attachment = get_object_or_404(Attachment.objects.select_related("message"), pk=pk)
    own = member(request.user, attachment.conversation_id)
    if attachment.message:
        if attachment.message.deleted_at or attachment.message.is_hidden or attachment.message_id <= own.joined_after_id: raise Http404
    elif attachment.uploader_id != request.user.pk: raise Http404
    storage = private_storage()
    if not storage.exists(attachment.name): raise Http404
    response = FileResponse(storage.open(attachment.name, "rb"), content_type="image/webp")
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Disposition"] = 'inline; filename="chat-image.webp"'
    return response


@endpoint(["GET", "PATCH"], authenticated=True, rate=(30, 60))
def chat_settings(request):
    pref = preferences(request.user)
    fields = ["contact_policy", "show_presence", "show_read_receipts", "browser_notifications"]
    if request.method == "PATCH":
        validate_keys(request.data, fields)
        for field, value in request.data.items():
            if field == "contact_policy":
                if value not in ["everyone", "requests", "nobody"]: raise ApiError("invalid_policy", "Choose everyone, requests, or nobody.")
            elif not isinstance(value, bool): raise ApiError("invalid_input", f"{field} must be true or false.")
            setattr(pref, field, value)
        pref.save()
    return success({field: getattr(pref, field) for field in fields})


@endpoint(["GET", "POST", "DELETE"], authenticated=True, rate=(30, 60))
def blocks(request):
    if request.method == "GET":
        from collection.serializers import author_data
        return success({"items": [author_data(item.target) for item in Block.objects.filter(user=request.user).select_related("target__profile")]})
    validate_keys(request.data, ["username"])
    target = user_by_name(request.data.get("username"))
    if target == request.user: raise ApiError("invalid_target", "Choose another person.")
    if request.method == "POST": Block.objects.get_or_create(user=request.user, target=target)
    else: Block.objects.filter(user=request.user, target=target).delete()
    common = Conversation.objects.filter(memberships__user=request.user, kind="direct").filter(memberships__user=target)
    for item in common: notify(item.pk)
    return success({"blocked": request.method == "POST"})


@endpoint(["POST"], authenticated=True, rate=(10, 3600))
def reports(request, pk):
    item = get_object_or_404(Message, pk=pk)
    own = member(request.user, item.conversation_id)
    if pk <= own.joined_after_id: raise Http404
    validate_keys(request.data, ["reason"])
    report, created = Report.objects.get_or_create(user=request.user, message=item, defaults={"reason": text(request.data, "reason", 1000, True), "evidence": item.text})
    from collection.models import ContentReport
    ContentReport.objects.get_or_create(reporter=request.user, kind="message", target_id=item.pk, defaults={"target_user": item.sender, "reason": report.reason, "evidence": report.evidence})
    return success({"reported": True}, 201 if created else 200)


def contact_write(own):
    if not own.accepted: raise ApiError("request_pending", "Accept this conversation first.", 403)
    if own.conversation.kind == "direct":
        peer = own.conversation.memberships.filter(active=True).exclude(pk=own.pk).first()
        if not peer or blocked(own.user_id, peer.user_id): raise ApiError("contact_unavailable", "This person is not available for messages.", 403)


@endpoint(["GET"], authenticated=True)
def summary(request):
    memberships = Membership.objects.filter(user=request.user, active=True)
    unread = sum(visible_messages(item).filter(id__gt=item.last_read_id).exclude(sender=request.user).count() for item in memberships.filter(accepted=True, muted=False, archived=False))
    return success({"unread": unread, "requests": memberships.filter(accepted=False).count()})
