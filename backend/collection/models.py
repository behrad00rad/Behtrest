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
    moderation_status = models.CharField(max_length=12, default="approved", db_index=True)
    is_hidden = models.BooleanField(default=False, db_index=True)
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


class ImageScan(TimestampedModel):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    post = models.OneToOneField(Post, null=True, blank=True, on_delete=models.CASCADE, related_name="image_scan")
    profile = models.ForeignKey("accounts.Profile", null=True, blank=True, on_delete=models.CASCADE)
    original = models.CharField(max_length=300)
    thumbnail = models.CharField(max_length=300, blank=True)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    status = models.CharField(max_length=12, default="pending", db_index=True)
    attempts = models.PositiveIntegerField(default=0)
    lease = models.DateTimeField(null=True, blank=True)
    token = models.UUIDField(null=True, blank=True)
    retry_at = models.DateTimeField(null=True, blank=True)
    scores = models.JSONField(default=dict)
    error = models.CharField(max_length=80, blank=True)


class Comment(TimestampedModel):
    is_hidden = models.BooleanField(default=False, db_index=True)
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


class Follow(models.Model):
    follower = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="following_edges")
    target = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="follower_edges")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["follower", "target"], name="unique_follow"), models.CheckConstraint(condition=~Q(follower=F("target")), name="no_self_follow")]


class ActivitySettings(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    follows = models.BooleanField(default=True)
    comments = models.BooleanField(default=True)
    saves = models.BooleanField(default=True)
    pins = models.BooleanField(default=True)


class ActivityNotification(models.Model):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="activity_notifications")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    kind = models.CharField(max_length=10)
    event_key = models.CharField(max_length=120)
    post = models.ForeignKey(Post, on_delete=models.SET_NULL, null=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["recipient", "event_key"], name="unique_activity_event")]
        indexes = [models.Index(fields=["recipient", "-created_at", "-id"], name="activity_inbox_idx")]


class ContentReport(models.Model):
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="content_reports")
    kind = models.CharField(max_length=10, choices=[("post", "Pin"), ("comment", "Comment"), ("message", "Message"), ("user", "Account")])
    target_id = models.PositiveBigIntegerField()
    target_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="reports_against")
    reason = models.CharField(max_length=1000)
    evidence = models.TextField(blank=True)
    status = models.CharField(max_length=10, default="open", choices=[("open", "Open"), ("dismissed", "Dismissed"), ("actioned", "Actioned")])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["reporter", "kind", "target_id"], name="unique_content_report")]
        permissions = [("review_reports", "Review reports and moderate content")]


class ModerationLog(models.Model):
    report = models.ForeignKey(ContentReport, on_delete=models.SET_NULL, null=True)
    moderator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=20)
    reason = models.CharField(max_length=1000)
    created_at = models.DateTimeField(auto_now_add=True)
