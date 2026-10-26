import hashlib
import uuid

from django.db import transaction
from django.utils import timezone

from .models import PinEvent


def session_hash(request):
    identity = request.session.session_key or 'authenticated-api'
    return hashlib.sha256(f'{request.user.pk}:{identity}'.encode()).hexdigest()


def record_event(user, pin, kind, request):
    now = timezone.now()
    session = session_hash(request)
    seconds = {'view': 600, 'click': 30, 'save': 86400, 'hide': 0}.get(kind)
    bucket = int(now.timestamp()) // seconds if seconds else 0
    identity = uuid.uuid4().hex if kind == 'like' else f'{user.pk}:{pin.pk}:{kind}:{session if kind in ("view", "click") else "all"}:{bucket}'
    key = hashlib.sha256(identity.encode()).hexdigest()
    with transaction.atomic():
        event, created = PinEvent.objects.get_or_create(dedupe_key=key, defaults={'user': user, 'pin': pin, 'type': kind, 'session_hash': session, 'created_at': now})
        if created:
            from .recommender import EVENT_WEIGHTS, adjust_weights
            adjust_weights(user, pin, EVENT_WEIGHTS[kind], now)
    return event, created
