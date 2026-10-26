from django.db import transaction
from django.core.cache import cache
from django.db.models import Count, Q
from django.utils import timezone
from django.http import Http404
from django.shortcuts import get_object_or_404

from common.api import endpoint, success, ApiError
from .models import PinLike, PinEvent, SavedPost
from .pagination import paginate
from .serializers import post_data, viewer_likes
from .pin_events import record_event, session_hash
from .recommender import Candidate, related_score, rank_feed, user_weights, adjust_weights, decay
from .ranked_pagination import ranked_page


def visible_pins(user):
    from .views import posts_query
    query = posts_query()
    if user.is_authenticated:
        from messaging.models import Block
        query = query.exclude(owner_id__in=Block.objects.filter(user=user).values('target_id')).exclude(owner_id__in=Block.objects.filter(target=user).values('user_id'))
    return viewer_likes(query, user)


@endpoint(['POST', 'DELETE'], authenticated=True, rate=(60, 60))
def like(request, pk):
    if request.data:
        raise ApiError('invalid_input', 'No fields are needed to toggle a like.')
    with transaction.atomic():
        pin = get_object_or_404(visible_pins(request.user).select_for_update(), pk=pk)
        if request.method == 'POST':
            _, created = PinLike.objects.get_or_create(user=request.user, pin=pin)
            if created:
                record_event(request.user, pin, 'like', request)
        else:
            previous = PinLike.objects.filter(user=request.user, pin=pin).first()
            if previous:
                now = timezone.now()
                adjust_weights(request.user, pin, -decay(3, (now - previous.created_at).total_seconds() / 86400), now)
                previous.delete()
        pin.refresh_from_db(fields=['like_count'])
        return success({'liked': request.method == 'POST', 'like_count': pin.like_count})


@endpoint(['GET'], authenticated=True)
def liked(request, username):
    # Likes are a private collection, like the owner's private boards.
    if request.user.username != username.lower():
        raise Http404
    query = PinLike.objects.filter(user=request.user, pin__in=visible_pins(request.user)).select_related('pin__owner__profile').prefetch_related('pin__tags')
    items, cursor = paginate(query, request, {'kind': 'liked', 'user': request.user.pk})
    return success({'items': [post_data(item.pin, liked=True) for item in items], 'next_cursor': cursor})


@endpoint(['POST'], authenticated=True, rate=(180, 60))
def event(request, pk):
    kind = request.data.get('type')
    if set(request.data) != {'type'} or kind not in ('view', 'click', 'hide'):
        raise ApiError('invalid_event', 'Choose view, click or hide. Likes and saves are recorded by their own actions.')
    pin = get_object_or_404(visible_pins(request.user), pk=pk)
    _, created = record_event(request.user, pin, kind, request)
    return success({'recorded': created, 'hidden': kind == 'hide'})


def discovery_query(user):
    query = visible_pins(user)
    if user.is_authenticated:
        query = query.exclude(pk__in=PinEvent.objects.filter(user=user, type='hide').values('pin_id'))
    return query


def candidates(query, *, boards=False):
    # Bounded union gives both older popular pins and fresh discoveries a chance.
    newest = list(query.order_by('-created_at', '-id').values_list('id', flat=True)[:500])
    popular = list(query.order_by('-like_count', '-created_at', '-id').values_list('id', flat=True)[:500])
    posts = list(query.filter(pk__in=set(newest + popular)).annotate(saved_total=Count('saves', filter=Q(saves__board__is_private=False, saves__board__owner__is_active=True), distinct=True)))
    board_ids = {}
    if boards:
        for pin_id, board_id in SavedPost.objects.filter(post_id__in=[post.pk for post in posts], board__is_private=False, board__owner__is_active=True).values_list('post_id', 'board_id'):
            board_ids.setdefault(pin_id, set()).add(board_id)
    return [Candidate(post.pk, post.owner_id, frozenset(tag.name for tag in post.tags.all()), post.created_at, post.like_count, post.saved_total, frozenset(board_ids.get(post.pk, ()))) for post in posts]


@endpoint(['GET'])
def related(request, pk):
    source = get_object_or_404(visible_pins(request.user), pk=pk)
    query = discovery_query(request.user).exclude(pk=pk)
    identity = session_hash(request) if request.user.is_authenticated else 'anonymous'
    if request.user.is_authenticated:
        query = query.exclude(pk__in=PinEvent.objects.filter(user=request.user, session_hash=identity, type__in=['view', 'click']).values('pin_id'))
    ids = None
    if not request.GET.get('cursor'):
        key = f'pin-related:v1:{pk}'
        ids = cache.get(key)
        if ids is None:
            # Cache only public, unpersonalized scores; privacy filtering happens on every page.
            from .views import posts_query
            pool = candidates(posts_query(), boards=True)
            source_boards = frozenset(SavedPost.objects.filter(post=source, board__is_private=False, board__owner__is_active=True).values_list('board_id', flat=True))
            item = Candidate(source.pk, source.owner_id, frozenset(tag.name for tag in source.tags.all()), source.created_at, boards=source_boards)
            now = timezone.now()
            ids = [pin.id for pin in sorted((pin for pin in pool if pin.id != pk), key=lambda pin: (related_score(item, pin, now), pin.id), reverse=True)]
            cache.set(key, ids, 180)
    return success(ranked_page(request, query, {'kind': 'related', 'pin': pk, 'session': identity}, ids))


def personalized_feed(request):
    query = discovery_query(request.user)
    ids = None
    if not request.GET.get('cursor'):
        now = timezone.now()
        weights = user_weights(request.user, now)
        seen_tags = set(weights)
        if request.user.is_authenticated:
            seen_tags.update(PinEvent.objects.filter(user=request.user).values_list('pin__tags__name', flat=True).distinct())
        ids = rank_feed(candidates(query), weights, seen_tags, now)
    return success(ranked_page(request, query, {'kind': 'personalized', 'user': request.user.pk if request.user.is_authenticated else 0}, ids))
