from django.db.models import Q
from messaging.models import Block
from .models import ActivityNotification, ActivitySettings


def blocked(a, b):
    return Block.objects.filter(Q(user_id=a, target_id=b) | Q(user_id=b, target_id=a)).exists()


def emit(recipient, actor, kind, event_key, post=None):
    if recipient.pk == actor.pk or not recipient.is_active or blocked(recipient.pk, actor.pk):
        return
    prefs, _ = ActivitySettings.objects.get_or_create(user=recipient)
    if not getattr(prefs, {"follow": "follows", "comment": "comments", "save": "saves", "pin": "pins"}[kind]):
        return
    event, created = ActivityNotification.objects.get_or_create(recipient=recipient, event_key=event_key, defaults={"actor": actor, "kind": kind, "post": post})
    if created and kind in ("follow", "pin"):
        from .push import enqueue
        enqueue(recipient.pk, "follows" if kind == "follow" else "pins", event.pk, event_key)
