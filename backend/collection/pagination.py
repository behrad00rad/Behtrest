import hashlib
import json

from django.core import signing
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from common.api import ApiError


def paginate(queryset, request, scope, *, date_field="created_at", ascending=False):
    """Signed keyset cursor and a snapshot cutoff; inserts cannot repeat earlier pages."""
    scope_hash = hashlib.sha256(json.dumps(scope, sort_keys=True).encode()).hexdigest()
    try:
        size = int(request.GET.get("page_size", 18))
        if not 1 <= size <= 36:
            raise ValueError
    except ValueError:
        raise ApiError("invalid_page_size", "Page size must be between 1 and 36.")
    cursor = request.GET.get("cursor", "")
    snapshot = timezone.now()
    if cursor:
        try:
            if len(cursor) > 1500:
                raise ValueError
            data = signing.loads(cursor, salt="bintrest.cursor", max_age=86400)
            snapshot = parse_datetime(data["snapshot"])
            date = parse_datetime(data["date"])
            pk = data["id"]
            if data["scope"] != scope_hash or not isinstance(pk, int) or not date or not snapshot or timezone.is_naive(date) or timezone.is_naive(snapshot):
                raise ValueError
        except (signing.BadSignature, ValueError, KeyError, TypeError):
            raise ApiError("invalid_cursor", "This page link expired or does not match the current filters.")
        comparison = "gt" if ascending else "lt"
        queryset = queryset.filter(Q(**{f"{date_field}__{comparison}": date}) | Q(**{date_field: date, f"id__{comparison}": pk}))
    queryset = queryset.filter(**{f"{date_field}__lte": snapshot})
    prefix = "" if ascending else "-"
    items = list(queryset.order_by(prefix + date_field, prefix + "id")[:size + 1])
    has_more = len(items) > size
    items = items[:size]
    next_cursor = None
    if has_more:
        last = items[-1]
        next_cursor = signing.dumps({"snapshot": snapshot.isoformat(), "date": getattr(last, date_field).isoformat(), "id": last.pk, "scope": scope_hash}, salt="bintrest.cursor", compress=True)
    return items, next_cursor
