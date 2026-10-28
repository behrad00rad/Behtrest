"""Opt-in Web Push. Durable outbox; no network calls in request transactions."""
import base64
import json
from datetime import timedelta
from urllib.parse import urlsplit

from django.conf import settings
from django.utils import timezone
from common.api import ApiError, endpoint, success
from .models import PushDelivery, PushSubscription

KINDS = ("messages", "requests", "follows", "pins")


def configured():
    return bool(settings.WEB_PUSH_PUBLIC_KEY and settings.WEB_PUSH_PRIVATE_KEY)


def validate_endpoint(value):
    if not isinstance(value, str) or len(value) > 2048:
        raise ApiError("invalid_subscription", "Invalid push subscription.")
    try:
        url = urlsplit(value)
        host = url.hostname or ""
        allowed = host in {"fcm.googleapis.com", "updates.push.services.mozilla.com"} or any(
            host.endswith("." + domain) for domain in ("push.apple.com", "notify.windows.com"))
        if url.scheme != "https" or url.port not in (None, 443) or url.username or url.password or url.fragment or not allowed:
            raise ValueError()
    except ValueError:
        raise ApiError("invalid_subscription", "Unsupported push service.")
    return value


def key(value, size):
    try:
        if not isinstance(value, str) or len(value) > 100:
            raise ValueError()
        raw = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
        if len(raw) != size:
            raise ValueError()
        if size == 65:
            from cryptography.hazmat.primitives.asymmetric import ec
            ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), raw)
        return value
    except ValueError:
        raise ApiError("invalid_subscription", "Invalid push encryption key.")


@endpoint(["GET", "POST", "DELETE"], authenticated=True, rate=(30, 3600))
def subscriptions(request):
    if request.method == "GET":
        sub = PushSubscription.objects.filter(user=request.user, endpoint=request.GET.get("endpoint", "")).first()
        return success({"enabled": configured(), "public_key": settings.WEB_PUSH_PUBLIC_KEY,
            "preferences": {name: getattr(sub, name) for name in KINDS} if sub else None})
    address = validate_endpoint(request.data.get("endpoint"))
    if request.method == "DELETE":
        PushSubscription.objects.filter(user=request.user, endpoint=address).delete()
        return success({"enabled": False})
    if not configured():
        raise ApiError("push_unavailable", "Notifications are not configured yet.", 503)
    prefs = {name: request.data.get(name, name != "pins") for name in KINDS}
    if any(type(value) is not bool for value in prefs.values()):
        raise ApiError("invalid_input", "Notification preferences must be true or false.")
    if PushSubscription.objects.filter(user=request.user).exclude(endpoint=address).count() >= 5:
        raise ApiError("device_limit", "Notifications support up to five devices per account.")
    PushSubscription.objects.update_or_create(endpoint=address, defaults={
        "user": request.user, "p256dh": key(request.data.get("p256dh"), 65),
        "auth": key(request.data.get("auth"), 16), **prefs})
    from messaging.services import preferences
    pref = preferences(request.user)
    pref.browser_notifications = True
    pref.save(update_fields=["browser_notifications"])
    return success({"enabled": True, **prefs})


def enqueue(user_id, kind, target_id, event_key):
    if not configured():
        return
    for sub in PushSubscription.objects.filter(user_id=user_id, **{kind: True}):
        PushDelivery.objects.get_or_create(subscription=sub, event_key=event_key,
            defaults={"kind": kind, "target_id": target_id})


def chat_event(conversation_id, sender_id, message_id=None):
    from messaging.models import Membership
    from messaging.services import blocked
    for member in Membership.objects.filter(conversation_id=conversation_id, active=True, muted=False,
            archived=False, user__is_active=True).exclude(user_id=sender_id):
        if blocked(member.user_id, sender_id):
            continue
        if message_id:
            kind = "messages" if member.accepted else "requests"
            enqueue(member.user_id, kind, message_id, f"message:{message_id}")
        elif not member.accepted:
            enqueue(member.user_id, "requests", conversation_id, f"invite:{conversation_id}")


def payload(job):
    """Recheck permissions at delivery, including blocks, reads and moderation."""
    sub = job.subscription
    if not sub.user.is_active or not getattr(sub, job.kind):
        return None
    if job.kind in ("messages", "requests"):
        from messaging.models import Membership, Message
        from messaging.services import blocked, preferences
        if not preferences(sub.user).browser_notifications:
            return None
        if job.event_key.startswith("message:"):
            msg = Message.objects.filter(pk=job.target_id, deleted_at=None, is_hidden=False, sender__is_active=True).first()
            if not msg:
                return None
            conversation_id, sender_id = msg.conversation_id, msg.sender_id
        else:
            conversation_id, sender_id = job.target_id, None
        member = Membership.objects.filter(user=sub.user, conversation_id=conversation_id,
            active=True, muted=False, archived=False).first()
        if not member or (sender_id and (member.last_read_id >= job.target_id or member.joined_after_id >= job.target_id)):
            return None
        others = Membership.objects.filter(conversation_id=conversation_id, active=True, user__is_active=True).exclude(user=sub.user)
        if not others.exists() or any(blocked(sub.user_id, other.user_id) for other in others):
            return None
        if job.kind == "requests" and member.accepted:
            return None
        body = "You have a new message." if member.accepted else "You have a new message request or group invitation."
        return {"title": "Behtrest", "body": body, "url": f"/messages/{conversation_id}", "tag": f"chat-{conversation_id}"}
    from .activity import blocked
    from .models import ActivityNotification, ActivitySettings, Follow
    event = ActivityNotification.objects.filter(pk=job.target_id, recipient=sub.user, read_at=None).select_related("actor", "post__owner").first()
    if not event or not event.actor or not event.actor.is_active or blocked(sub.user_id, event.actor_id):
        return None
    pref = ActivitySettings.objects.filter(user=sub.user).first()
    if pref and not getattr(pref, job.kind):
        return None
    if job.kind == "pins":
        post = event.post
        if not post or post.is_hidden or post.moderation_status != "approved" or not post.owner.is_active or not Follow.objects.filter(follower=sub.user, target=event.actor).exists():
            return None
        return {"title": "Behtrest", "body": "Someone you follow shared a new pin.", "url": f"/pin/{post.pk}", "tag": f"pin-author-{event.actor_id}"}
    if not Follow.objects.filter(follower=event.actor, target=sub.user).exists():
        return None
    return {"title": "Behtrest", "body": "You have a new follower.", "url": f"/u/{event.actor.username}", "tag": "new-followers"}


def drain(limit=50):
    from pywebpush import webpush, WebPushException
    from requests.exceptions import RequestException
    if not configured():
        return 0
    now = timezone.now()
    PushSubscription.objects.filter(updated_at__lt=now - timedelta(days=90)).delete()
    PushDelivery.objects.filter(created_at__lt=now - timedelta(days=1)).delete()
    count = 0
    for job in PushDelivery.objects.filter(available_at__lte=now).select_related("subscription__user").order_by("pk")[:limit]:
        data = payload(job)
        if not data:
            job.delete()
            continue
        try:
            webpush(subscription_info={"endpoint": validate_endpoint(job.subscription.endpoint), "keys": {
                "p256dh": job.subscription.p256dh, "auth": job.subscription.auth}}, data=json.dumps(data),
                vapid_private_key=settings.WEB_PUSH_PRIVATE_KEY, vapid_claims={"sub": settings.WEB_PUSH_SUBJECT},
                ttl=3600, timeout=5, headers={"Urgency": "normal"})
        except (WebPushException, RequestException) as error:
            response = getattr(error, "response", None)
            status = response.status_code if response is not None else None
            if status in (404, 410):
                job.subscription.delete()
                continue
            job.attempts += 1
            if job.attempts < 5:
                job.available_at = now + timedelta(seconds=60 * 2 ** job.attempts)
                job.save(update_fields=["attempts", "available_at"])
                continue
        except ApiError:
            job.subscription.delete()
            continue
        job.delete()
        count += 1
    return count
