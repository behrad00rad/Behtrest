import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from common.api import ApiError
from collection.serializers import author_data
from .models import Block, ChatSettings, Membership, Message


def preferences(user):
    return ChatSettings.objects.get_or_create(user=user)[0]


def blocked(first, second):
    return Block.objects.filter(Q(user_id=first, target_id=second) | Q(user_id=second, target_id=first)).exists()


def member(user, conversation_id):
    return get_object_or_404(Membership.objects.select_related("conversation"), user=user, conversation_id=conversation_id, active=True)


def visible_messages(membership):
    return Message.objects.filter(conversation=membership.conversation, id__gt=membership.joined_after_id).select_related("sender__profile", "pin__owner__profile", "reply").prefetch_related("reactions")


def can_send(membership):
    if not membership.accepted:
        raise ApiError("request_pending", "Accept this conversation before replying.", 403)
    others = membership.conversation.memberships.filter(active=True).exclude(user=membership.user)
    if membership.conversation.kind == "direct":
        other = others.first()
        if not other or blocked(membership.user_id, other.user_id):
            raise ApiError("contact_unavailable", "This person is not available for messages.", 403)
        if not other.accepted and membership.conversation.messages.exists():
            raise ApiError("request_pending", "Wait for your message request to be accepted.", 403)
    elif not others.filter(accepted=True).exists():
        # Groups can still store messages for their pending invitees.
        return


def notify(conversation_id, sender_id=None):
    users = list(Membership.objects.filter(conversation_id=conversation_id, active=True).values_list("user_id", flat=True))
    def dispatch():
        layer = get_channel_layer()
        for user_id in users:
            try:
                async_to_sync(layer.group_send)(f"chat_user_{user_id}", {"type": "chat.refresh", "conversation_id": conversation_id, "sender_id": sender_id})
            except Exception:
                logging.getLogger(__name__).warning("Live chat notification unavailable; clients will resynchronize.")
    transaction.on_commit(dispatch)


def message_data(message, viewer):
    attachment = getattr(message, "attachment", None)
    pin = message.pin
    unavailable = message.deleted_at or message.is_hidden
    return {
        "id": message.pk, "conversation_id": message.conversation_id,
        "client_id": str(message.client_id), "sender": author_data(message.sender),
        "text": "" if unavailable else message.text,
        "created_at": message.created_at.isoformat(),
        "edited_at": message.edited_at.isoformat() if message.edited_at else None,
        "deleted": bool(unavailable),
        "reply": {"id": message.reply_id, "text": "Message deleted" if (message.reply.deleted_at or message.reply.is_hidden) else message.reply.text[:150]} if message.reply and not unavailable else None,
        "pin": {"id": pin.pk, "title": pin.title, "thumbnail": pin.thumbnail.url if pin.thumbnail else pin.image.url} if pin and not pin.is_hidden and pin.owner.is_active and not unavailable else None,
        "attachment": {"id": attachment.pk, "url": f"/api/chat/attachments/{attachment.pk}/", "width": attachment.width, "height": attachment.height} if attachment and not unavailable else None,
        "reactions": [{"emoji": reaction.emoji, "user_id": reaction.user_id} for reaction in message.reactions.all()] if not unavailable else [],
    }


def conversation_data(membership):
    conversation = membership.conversation
    members = list(conversation.memberships.filter(active=True, user__is_active=True).select_related("user__profile"))
    last = visible_messages(membership).order_by("-id").first()
    try:
        can_send(membership)
        writable = True
    except ApiError:
        writable = False
    details = []
    for item in members:
        pref = preferences(item.user)
        details.append({**author_data(item.user), "role": item.role, "accepted": item.accepted, "last_read_id": item.last_read_id if pref.show_read_receipts or item.user_id == membership.user_id else None, "last_delivered_id": item.last_delivered_id})
    return {
        "id": conversation.pk, "kind": conversation.kind, "title": conversation.title,
        "members": details, "accepted": membership.accepted, "role": membership.role,
        "muted": membership.muted, "archived": membership.archived,
        "can_send": writable,
        "blocked": conversation.kind == "direct" and any(blocked(membership.user_id, item.user_id) for item in members if item.user_id != membership.user_id),
        "unread": visible_messages(membership).filter(id__gt=membership.last_read_id).exclude(sender=membership.user).count(),
        "first_unread_id": visible_messages(membership).filter(id__gt=membership.last_read_id).exclude(sender=membership.user).order_by("id").values_list("id", flat=True).first(),
        "last_read_id": membership.last_read_id,
        "last_message": message_data(last, membership.user) if last else None,
        "updated_at": conversation.updated_at.isoformat(),
    }
