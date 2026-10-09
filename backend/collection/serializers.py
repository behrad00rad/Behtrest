def author_data(user):
    return {"id": user.pk, "username": user.username, "display_name": user.profile.display_name, "avatar": user.profile.avatar.url if user.profile.avatar else None}


def post_data(post):
    return {"id": post.pk, "title": post.title, "description": post.description,
            "image": post.image.url, "thumbnail": post.thumbnail.url if post.thumbnail else post.image.url,
            "width": post.image_width or 480, "height": post.image_height or 640,
            "alt_text": post.alt_text, "source_url": post.source_url,
            "tags": [tag.name for tag in post.tags.all()], "owner": author_data(post.owner), "created_at": post.created_at.isoformat()}


def comment_data(comment):
    return {"id": comment.pk, "text": comment.text, "author": author_data(comment.author), "created_at": comment.created_at.isoformat(), "updated_at": comment.updated_at.isoformat()}


def board_data(board):
    cover = board.cover
    if cover is None or not cover.owner.is_active or not board.saved_posts.filter(post=cover).exists():
        saved = board.saved_posts.filter(post__owner__is_active=True).select_related("post").order_by("-created_at", "-id").first()
        cover = saved.post if saved else None
    return {"id": board.pk, "name": board.name, "description": board.description, "is_private": board.is_private,
            "owner": board.owner.username, "cover_post_id": cover.pk if cover else None,
            "cover": (cover.thumbnail.url if cover.thumbnail else cover.image.url) if cover else None,
            "post_count": board.saved_posts.filter(post__owner__is_active=True).count()}
