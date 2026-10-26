import hashlib
import json
import uuid

from django.core import signing
from django.core.cache import cache

from common.api import ApiError
from .serializers import post_data


def ranked_page(request, query, scope, ids=None):
    """A user/session-bound ordered snapshot: scores cannot shift between pages."""
    owner = request.user.pk if request.user.is_authenticated else 0
    digest = hashlib.sha256(json.dumps(scope, sort_keys=True).encode()).hexdigest()
    try:
        size = int(request.GET.get('page_size', 18))
        if not 1 <= size <= 36:
            raise ValueError
    except ValueError:
        raise ApiError('invalid_page_size', 'Page size must be between 1 and 36.')
    cursor = request.GET.get('cursor', '')
    if cursor:
        try:
            if len(cursor) > 1500:
                raise ValueError
            data = signing.loads(cursor, salt='behtrest.ranked', max_age=3600)
            token, offset = data['token'], data['offset']
            if data['scope'] != digest or data['owner'] != owner or not isinstance(offset, int) or offset < 0 or not isinstance(token, str) or len(token) != 32:
                raise ValueError
            ordered = cache.get(f'pin-ranking:{token}')
            if ordered is None or offset > len(ordered):
                raise ValueError
        except (signing.BadSignature, ValueError, KeyError, TypeError):
            raise ApiError('invalid_cursor', 'This feed expired or changed. Refresh to explore again.')
    else:
        ordered = list(dict.fromkeys(ids or []))
        token, offset = uuid.uuid4().hex, 0
        cache.set(f'pin-ranking:{token}', ordered, 3600)
    items = []
    while len(items) < size and offset < len(ordered):
        chunk = ordered[offset:offset + size * 2]
        available = {item.pk: item for item in query.filter(pk__in=chunk)}
        for pk in chunk:
            offset += 1
            if pk in available:
                items.append(available[pk])
                if len(items) == size:
                    break
    has_more = offset < len(ordered) and query.filter(pk__in=ordered[offset:]).exists()
    next_cursor = signing.dumps({'token': token, 'offset': offset, 'scope': digest, 'owner': owner}, salt='behtrest.ranked', compress=True) if has_more else None
    return {'items': [post_data(item) for item in items], 'next_cursor': next_cursor}
