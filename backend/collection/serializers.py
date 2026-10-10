def author_data(user):
    return {"id": user.pk, "username": user.username, "display_name": user.profile.display_name, "avatar": user.profile.avatar.url if user.profile.avatar else None}


def post_data(post):
    scan = getattr(post, 'image_scan', None) if post.moderation_status != 'approved' else None
    image = f'/api/image-scans/{scan.pk}/image/' if scan else post.image.url
    return {"id": post.pk, "title": post.title, "description": post.description,
            "image": image, "thumbnail": image + '?thumbnail=1' if scan else post.thumbnail.url if post.thumbnail else image,
            "moderation_status": post.moderation_status, "scan_id": scan.pk if scan else None,
            "width": post.image_width or 480, "height": post.image_height or 640,
            "alt_text": post.alt_text, "source_url": post.source_url,
            "tags": [tag.name for tag in post.tags.all()], "owner": author_data(post.owner), "created_at": post.created_at.isoformat()}


def comment_data(comment):
    return {"id": comment.pk, "text": comment.text, "author": author_data(comment.author), "created_at": comment.created_at.isoformat(), "updated_at": comment.updated_at.isoformat()}


def board_data(board):
    cover = board.cover
    if cover is None or cover.is_hidden or cover.moderation_status != 'approved' or not cover.owner.is_active or not board.saved_posts.filter(post=cover).exists():
        saved = board.saved_posts.filter(post__owner__is_active=True, post__is_hidden=False, post__moderation_status='approved').select_related("post").order_by("-created_at", "-id").first()
        cover = saved.post if saved else None
    return {"id": board.pk, "name": board.name, "description": board.description, "is_private": board.is_private,
            "owner": board.owner.username, "cover_post_id": cover.pk if cover else None,
            "cover": (cover.thumbnail.url if cover.thumbnail else cover.image.url) if cover else None,
            "post_count": board.saved_posts.filter(post__owner__is_active=True, post__is_hidden=False, post__moderation_status='approved').count()}
