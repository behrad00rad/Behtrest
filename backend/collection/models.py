import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Lower


def post_image_path(instance, filename):
    return f"posts/{instance.owner_id}/{uuid.uuid4().hex}.{filename.rsplit('.', 1)[-1].lower()}"


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Post(TimestampedModel):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="posts")
    title = models.CharField(max_length=200)
    description = models.TextField(max_length=5000, blank=True)
    image = models.ImageField(upload_to=post_image_path, width_field="image_width", height_field="image_height")
    image_width = models.PositiveIntegerField(null=True, blank=True)
    image_height = models.PositiveIntegerField(null=True, blank=True)
    thumbnail = models.ImageField(upload_to="thumbnails/", blank=True)
    alt_text = models.CharField(max_length=500, blank=True)
    source_url = models.URLField(max_length=500, blank=True)
    tags = models.ManyToManyField("Tag", blank=True, related_name="posts")

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [models.Index(fields=["owner", "-created_at", "-id"], name="post_owner_created_idx"), models.Index(fields=["-created_at", "-id"], name="post_feed_created_idx")]
        constraints = [models.CheckConstraint(condition=~Q(title=""), name="post_title_required")]

    def __str__(self):
        return self.title


class Comment(TimestampedModel):
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="comments")
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments")
    text = models.TextField(max_length=2000)

    class Meta:
        ordering = ("created_at", "id")
        indexes = [models.Index(fields=["post", "created_at", "id"], name="comment_post_created_idx")]
        constraints = [models.CheckConstraint(condition=~Q(text=""), name="comment_text_required")]

    def __str__(self):
        return f"Comment by {self.author_id} on {self.post_id}"


class Board(TimestampedModel):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="boards")
    name = models.CharField(max_length=100)
    description = models.CharField(max_length=500, blank=True)
    is_private = models.BooleanField(default=False)
    cover = models.ForeignKey(Post, null=True, blank=True, on_delete=models.SET_NULL, related_name="cover_for_boards")

    class Meta:
        ordering = ("-updated_at", "-id")
        constraints = [
            models.UniqueConstraint(Lower("name"), F("owner"), name="board_unique_owner_name"),
            models.CheckConstraint(condition=~Q(name=""), name="board_name_required"),
        ]

    def __str__(self):
        return self.name


class SavedPost(TimestampedModel):
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="saved_posts")
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="saves")

    class Meta:
        ordering = ("-created_at", "-id")
        constraints = [models.UniqueConstraint(fields=("board", "post"), name="saved_post_unique_board_post")]

    def __str__(self):
        return f"Post {self.post_id} in board {self.board_id}"


class Tag(models.Model):
    name = models.SlugField(max_length=40, unique=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name


class MediaCleanup(models.Model):
    name = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
