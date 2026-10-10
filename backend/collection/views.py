import re

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils.text import slugify

from accounts.models import Profile
from accounts.views import serialize_user
from common.api import ApiError, endpoint, success, validate_form
from common.media import delete_files, prepare_image, store_images
from .forms import BoardForm, CommentForm, PostMetadataForm
from .models import Board, Comment, Post, SavedPost, Tag
from .pagination import paginate
from .serializers import author_data, board_data, comment_data, post_data
from .models import Follow
from .activity import emit


def posts_query():
    return Post.objects.filter(owner__is_active=True, is_hidden=False).select_related('owner__profile').prefetch_related('tags')


def require_user(request):
    if not request.user.is_authenticated:
        raise ApiError('authentication_required', 'Please sign in to continue.', 401)


def validate_keys(data, allowed):
    if set(data) - set(allowed):
        raise ApiError('invalid_input', 'Only the documented fields may be changed.')


def tags_from_input(value):
    if not isinstance(value, str) or len(value) > 400:
        raise ApiError('invalid_tags', 'Use up to 8 comma-separated tags, each at most 40 characters.')
    tags = []
    for item in value.split(','):
        if not item.strip():
            continue
        tag = slugify(item.strip())
        if not tag or len(tag) > 40:
            raise ApiError('invalid_tags', 'Each tag must have between 1 and 40 letters or numbers.')
        if tag not in tags:
            tags.append(tag)
    if len(tags) > 8:
        raise ApiError('invalid_tags', 'Use at most 8 tags.')
    return tags


def assign_tags(post, tags):
    post.tags.set([Tag.objects.get_or_create(name=name)[0] for name in tags])


def apply_form(obj, data, form_class, fields):
    values = {field: data.get(field, getattr(obj, field)) for field in fields}
    for field, value in values.items():
        if field != 'is_private' and not isinstance(value, str):
            raise ApiError('invalid_input', f'{field} must be text.')
    if 'is_private' in values and not isinstance(values['is_private'], bool):
        raise ApiError('invalid_input', 'is_private must be a JSON boolean.')
    form = validate_form(form_class(values, instance=obj))
    for field, value in form.cleaned_data.items():
        setattr(obj, field, value)
    return obj


def visible_board(request, pk, *, owner_only=False):
    board = get_object_or_404(Board.objects.select_related('owner', 'cover__owner'), pk=pk, owner__is_active=True)
    if owner_only:
        require_user(request)
    if (owner_only or board.is_private) and (not request.user.is_authenticated or board.owner_id != request.user.pk):
        raise Http404
    return board


@endpoint(['GET'])
def feed(request):
    query = posts_query()
    text = request.GET.get('q', '').strip()
    tag = request.GET.get('tag', '').strip().lower()
    owner = request.GET.get('owner', '').strip().lower()
    sort = request.GET.get('sort', 'newest')
    following = request.GET.get('following', '0')
    if following not in ('0', '1'):
        raise ApiError('invalid_filter', 'Choose the discovery or following feed.')
    if following == '1':
        require_user(request)
        query = query.filter(owner_id__in=Follow.objects.filter(follower=request.user).values('target_id'))
        from messaging.models import Block
        query = query.exclude(owner_id__in=Block.objects.filter(user=request.user).values('target_id')).exclude(owner_id__in=Block.objects.filter(target=request.user).values('user_id'))
    if sort not in ('newest', 'oldest'):
        raise ApiError('invalid_filter', 'Choose newest or oldest pins.')
    if len(text) > 100 or len(tag) > 40 or len(owner) > 150:
        raise ApiError('invalid_filter', 'Search text or filters are too long.')
    if tag and not re.fullmatch(r'[a-z0-9_-]{1,40}', tag):
        raise ApiError('invalid_filter', 'Choose a valid tag.')
    if text:
        query = query.filter(Q(title__icontains=text) | Q(description__icontains=text) | Q(tags__name__icontains=text) | Q(owner__username__icontains=text) | Q(owner__profile__display_name__icontains=text)).distinct()
    if tag:
        query = query.filter(tags__name=tag)
    if owner:
        query = query.filter(owner__username=owner)
    items, cursor = paginate(query, request, {'kind': 'feed', 'q': text, 'tag': tag, 'owner': owner, 'sort': sort, 'following': request.user.pk if following == '1' else None}, ascending=sort == 'oldest')
    return success({'items': [post_data(post) for post in items], 'next_cursor': cursor})


@endpoint(['POST'], authenticated=True, rate=(30, 60), multipart=True)
def create_post(request):
    fields = ('title', 'description', 'alt_text', 'source_url')
    validate_keys(request.data, (*fields, 'tags'))
    if set(request.FILES) != {'image'} or len(request.FILES.getlist('image')) != 1:
        raise ApiError('invalid_image', 'Choose exactly one image.')
    post = apply_form(Post(owner=request.user), request.data, PostMetadataForm, fields)
    tags = tags_from_input(request.data.get('tags', ''))
    prepared = prepare_image(request.FILES['image'])
    names, width, height = store_images(prepared, request.user.pk)
    try:
        with transaction.atomic():
            post.image, post.thumbnail = names
            post.image_width, post.image_height = width, height
            post.full_clean(exclude=['tags'])
            post.save()
            assign_tags(post, tags)
            for edge in Follow.objects.filter(target=request.user, follower__is_active=True).select_related('follower'):
                emit(edge.follower, request.user, 'pin', f'pin:{post.pk}', post)
    except Exception:
        delete_files(names)
        raise
    return success(post_data(post), 201)


@endpoint(['GET', 'PATCH', 'DELETE'], rate=(30, 60))
def post_owner_actions(request, pk):
    post = get_object_or_404(posts_query(), pk=pk)
    if request.method == 'GET':
        return success(post_data(post))
    require_user(request)
    if post.owner_id != request.user.pk:
        raise Http404
    if request.method == 'DELETE':
        with transaction.atomic():
            post.delete()
        return success({'deleted': True})
    fields = ('title', 'description', 'alt_text', 'source_url')
    validate_keys(request.data, (*fields, 'tags'))
    if not request.data:
        raise ApiError('invalid_input', 'Provide a field to update.')
    tags = tags_from_input(request.data['tags']) if 'tags' in request.data else None
    post = apply_form(post, request.data, PostMetadataForm, fields)
    with transaction.atomic():
        post.full_clean(exclude=['image', 'thumbnail', 'tags'])
        post.save()
        if tags is not None:
            assign_tags(post, tags)
    post.refresh_from_db()
    return success(post_data(post))


@endpoint(['GET', 'POST'], rate=(30, 60))
def comments(request, pk):
    post = get_object_or_404(Post, pk=pk, owner__is_active=True, is_hidden=False)
    if request.method == 'GET':
        query = post.comments.filter(author__is_active=True, is_hidden=False).select_related('author__profile')
        items, cursor = paginate(query, request, {'kind': 'comments', 'post': pk}, ascending=True)
        return success({'items': [comment_data(item) for item in items], 'next_cursor': cursor})
    require_user(request)
    validate_keys(request.data, ('text',))
    comment = apply_form(Comment(author=request.user, post=post), request.data, CommentForm, ('text',))
    comment.full_clean()
    with transaction.atomic():
        comment.save()
        emit(post.owner, request.user, 'comment', f'comment:{comment.pk}', post)
    return success(comment_data(comment), 201)


@endpoint(['PATCH', 'DELETE'], authenticated=True, rate=(30, 60))
def comment_owner_actions(request, pk):
    comment = get_object_or_404(Comment.objects.select_related('author__profile'), pk=pk, author=request.user, is_hidden=False, post__is_hidden=False)
    if request.method == 'DELETE':
        comment.delete()
        return success({'deleted': True})
    validate_keys(request.data, ('text',))
    if not request.data:
        raise ApiError('invalid_input', 'Provide a comment to update.')
    apply_form(comment, request.data, CommentForm, ('text',)).full_clean()
    comment.save()
    return success(comment_data(comment))


@endpoint(['GET', 'POST'], rate=(30, 60))
def boards(request):
    if request.method == 'POST':
        require_user(request)
        validate_keys(request.data, ('name', 'description', 'is_private'))
        board = apply_form(Board(owner=request.user), request.data, BoardForm, ('name', 'description', 'is_private'))
        board.full_clean()
        board.save()
        return success(board_data(board), 201)
    owner = request.GET.get('owner', '').strip().lower()
    if not owner:
        require_user(request)
        owner = request.user.username
    query = Board.objects.filter(owner__username=owner, owner__is_active=True).select_related('owner', 'cover__owner')
    if not request.user.is_authenticated or request.user.username != owner:
        query = query.filter(is_private=False)
    text = request.GET.get('q', '').strip()
    privacy = request.GET.get('privacy', 'all')
    if len(text) > 100 or privacy not in ('all', 'public', 'private'):
        raise ApiError('invalid_filter', 'Choose a valid board search and visibility.')
    if text:
        query = query.filter(Q(name__icontains=text) | Q(description__icontains=text))
    if privacy != 'all':
        query = query.filter(is_private=privacy == 'private')
    items, cursor = paginate(query, request, {'kind': 'boards', 'owner': owner, 'q': text, 'privacy': privacy, 'viewer': request.user.pk if request.user.is_authenticated else None})
    return success({'items': [board_data(item) for item in items], 'next_cursor': cursor})


@endpoint(['GET'])
def board_detail(request, pk):
    return success(board_data(visible_board(request, pk)))


@endpoint(['PATCH', 'DELETE'], authenticated=True, rate=(30, 60))
def board_owner_actions(request, pk):
    board = visible_board(request, pk, owner_only=True)
    if request.method == 'DELETE':
        board.delete()
        return success({'deleted': True})
    validate_keys(request.data, ('name', 'description', 'is_private', 'cover_post_id'))
    if not request.data:
        raise ApiError('invalid_input', 'Provide a board field to update.')
    apply_form(board, request.data, BoardForm, ('name', 'description', 'is_private'))
    if 'cover_post_id' in request.data:
        cover_id = request.data['cover_post_id']
        if cover_id is not None:
            if not isinstance(cover_id, int) or isinstance(cover_id, bool):
                raise ApiError('invalid_cover', 'Choose a post saved in this board.')
            saved = get_object_or_404(SavedPost.objects.select_related('post'), board=board, post_id=cover_id, post__owner__is_active=True, post__is_hidden=False)
            board.cover = saved.post
        else:
            board.cover = None
    board.full_clean()
    board.save()
    return success(board_data(board))


@endpoint(['GET'])
def board_posts(request, pk):
    board = visible_board(request, pk)
    query = board.saved_posts.filter(post__owner__is_active=True, post__is_hidden=False).select_related('post__owner__profile').prefetch_related('post__tags')
    text = request.GET.get('q', '').strip()
    sort = request.GET.get('sort', 'newest')
    if len(text) > 100 or sort not in ('newest', 'oldest'):
        raise ApiError('invalid_filter', 'Choose a valid pin search and sort order.')
    if text:
        query = query.filter(Q(post__title__icontains=text) | Q(post__description__icontains=text) | Q(post__tags__name__icontains=text)).distinct()
    items, cursor = paginate(query, request, {'kind': 'board-posts', 'board': pk, 'q': text, 'sort': sort}, ascending=sort == 'oldest')
    return success({'items': [post_data(item.post) for item in items], 'next_cursor': cursor})


@endpoint(['POST'], authenticated=True, rate=(30, 60))
def save_to_board(request, pk):
    board = visible_board(request, pk, owner_only=True)
    validate_keys(request.data, ('post_id',))
    post_id = request.data.get('post_id')
    if not isinstance(post_id, int) or isinstance(post_id, bool):
        raise ApiError('invalid_post', 'Choose a valid post.')
    post = get_object_or_404(Post, pk=post_id, owner__is_active=True, is_hidden=False)
    with transaction.atomic():
        saved, created = SavedPost.objects.get_or_create(board=board, post=post)
        if created and not board.is_private:
            emit(post.owner, request.user, 'save', f'save:{saved.pk}', post)
    return success({'id': saved.pk, 'post_id': post.pk, 'board_id': board.pk}, 201 if created else 200)


@endpoint(['DELETE'], authenticated=True, rate=(30, 60))
def remove_from_board(request, pk, post_pk):
    board = visible_board(request, pk, owner_only=True)
    get_object_or_404(SavedPost, board=board, post_id=post_pk).delete()
    if board.cover_id == post_pk:
        board.cover = None
        board.save(update_fields=['cover'])
    return success({'deleted': True})


@endpoint(['DELETE'], authenticated=True, rate=(30, 60))
def saved_post_owner_actions(request, pk):
    saved = get_object_or_404(SavedPost, pk=pk, board__owner=request.user)
    if saved.board.cover_id == saved.post_id:
        Board.objects.filter(pk=saved.board_id).update(cover=None)
    saved.delete()
    return success({'deleted': True})


@endpoint(['GET'])
def profile_detail(request, username):
    user = get_object_or_404(get_user_model().objects.select_related('profile'), username=username.lower(), is_active=True)
    board_query = user.boards.all()
    if not request.user.is_authenticated or request.user.pk != user.pk:
        board_query = board_query.filter(is_private=False)
    return success({**author_data(user), 'bio': user.profile.bio, 'post_count': user.posts.filter(is_hidden=False).count(), 'board_count': board_query.count(), 'follower_count': user.follower_edges.filter(follower__is_active=True).count(), 'following_count': user.following_edges.filter(target__is_active=True).count(), 'is_following': request.user.is_authenticated and Follow.objects.filter(follower=request.user, target=user).exists()})


@endpoint(['POST'], authenticated=True, rate=(30, 60), multipart=True)
def avatar_upload(request):
    validate_keys(request.data, ())
    if set(request.FILES) != {'image'} or len(request.FILES.getlist('image')) != 1:
        raise ApiError('invalid_image', 'Choose exactly one avatar image.')
    profile = request.user.profile
    previous = profile.avatar.name
    names, _, _ = store_images(prepare_image(request.FILES['image'], avatar=True), request.user.pk, avatar=True)
    try:
        with transaction.atomic():
            changed = Profile.objects.filter(pk=profile.pk, avatar=previous).update(avatar=names[0])
            if not changed:
                raise ApiError('conflict', 'Your avatar changed in another request. Please try again.', 409)
            transaction.on_commit(lambda: delete_files([previous]))
    except Exception:
        delete_files(names)
        raise
    profile.avatar = names[0]
    return success({'user': serialize_user(request.user)})


@endpoint(['DELETE'], authenticated=True, rate=(30, 60))
def avatar_delete(request):
    profile = request.user.profile
    previous = profile.avatar.name
    with transaction.atomic():
        changed = Profile.objects.filter(pk=profile.pk, avatar=previous).update(avatar='')
        if not changed:
            raise ApiError('conflict', 'Your avatar changed in another request. Please try again.', 409)
        transaction.on_commit(lambda: delete_files([previous]))
    profile.avatar = ''
    return success({'user': serialize_user(request.user)})


@endpoint(['GET'])
def people_search(request):
    text = request.GET.get('q', '').strip()
    if not text or len(text) > 100:
        raise ApiError('invalid_search', 'Enter between 1 and 100 characters.')
    query = get_user_model().objects.filter(is_active=True).filter(Q(username__icontains=text) | Q(profile__display_name__icontains=text)).select_related('profile')
    items, cursor = paginate(query, request, {'kind': 'people', 'q': text}, date_field='date_joined')
    return success({'items': [author_data(user) for user in items], 'next_cursor': cursor})


@endpoint(['GET'])
def tag_list(request):
    return success({'items': list(Tag.objects.filter(posts__owner__is_active=True, posts__is_hidden=False).distinct().order_by('name').values_list('name', flat=True)[:100])})
