"""Ownership gates for existing records; uploads, feeds, and board creation come later."""
from django.shortcuts import get_object_or_404
from common.api import ApiError, endpoint, success, validate_form
from .forms import BoardForm, CommentForm, PostMetadataForm
from .models import Board, Comment, Post, SavedPost


def update_record(request, obj, form_class, fields):
    if not request.data or set(request.data) - set(fields):
        raise ApiError("invalid_input", "Only the documented editable fields may be changed.")
    if "is_private" in request.data and not isinstance(request.data["is_private"], bool):
        raise ApiError("invalid_input", "is_private must be a JSON boolean.")
    values = {field: request.data.get(field, getattr(obj, field)) for field in fields}
    form = validate_form(form_class(values, instance=obj))
    # Also validate model constraints with ownership included.
    for field, value in form.cleaned_data.items():
        setattr(obj, field, value)
    obj.full_clean(exclude=["image"] if isinstance(obj, Post) else None)
    obj.save()
    return success({"id": obj.pk, **{field: getattr(obj, field) for field in fields}})


@endpoint(["PATCH", "DELETE"], authenticated=True, rate=(30, 60))
def post_owner_actions(request, pk):
    post = get_object_or_404(Post, pk=pk, owner=request.user)
    if request.method == "DELETE":
        post.delete()
        return success({"deleted": True})
    return update_record(request, post, PostMetadataForm, ("title", "description"))


@endpoint(["PATCH", "DELETE"], authenticated=True, rate=(30, 60))
def comment_owner_actions(request, pk):
    comment = get_object_or_404(Comment, pk=pk, author=request.user)
    if request.method == "DELETE":
        comment.delete()
        return success({"deleted": True})
    return update_record(request, comment, CommentForm, ("text",))


@endpoint(["GET"])
def board_detail(request, pk):
    board = get_object_or_404(Board, pk=pk)
    if board.is_private and (not request.user.is_authenticated or board.owner_id != request.user.pk):
        from django.http import Http404
        raise Http404
    return success({"id": board.pk, "name": board.name, "description": board.description, "is_private": board.is_private, "owner": board.owner.username})


@endpoint(["PATCH", "DELETE"], authenticated=True, rate=(30, 60))
def board_owner_actions(request, pk):
    board = get_object_or_404(Board, pk=pk, owner=request.user)
    if request.method == "DELETE":
        board.delete()
        return success({"deleted": True})
    return update_record(request, board, BoardForm, ("name", "description", "is_private"))


@endpoint(["DELETE"], authenticated=True, rate=(30, 60))
def saved_post_owner_actions(request, pk):
    saved = get_object_or_404(SavedPost, pk=pk, board__owner=request.user)
    saved.delete()
    return success({"deleted": True})
