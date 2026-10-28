import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Lower
from django.utils import timezone


def post_image_path(instance, filename):
    return f"posts/{instance.owner_id}/{uuid.uuid4().hex}.{filename.rsplit('.', 1)[-1].lower()}"


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Post(TimestampedModel):
    type = models.CharField(max_length=16, default="pin", choices=[("pin", "Pin"), ("text_card", "Words")])
    text_card_config = models.JSONField(default=dict, blank=True)
    text_content = models.CharField(max_length=280, blank=True)
    allow_download = models.BooleanField(default=True)
    like_count = models.PositiveIntegerField(default=0)
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


class PinLike(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='pin_likes')
    pin = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='likes')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'pin'], name='unique_pin_like')]
        indexes = [models.Index(fields=['user', '-created_at', '-id'], name='pin_like_user_date')]


class PinEvent(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='pin_events')
    pin = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='events')
    type = models.CharField(max_length=5, choices=[(name, name) for name in ('view', 'click', 'like', 'save', 'hide')])
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    session_hash = models.CharField(max_length=64, db_index=True)
    dedupe_key = models.CharField(max_length=64, unique=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(type__in=['view', 'click', 'like', 'save', 'hide']), name='valid_pin_event_type')]
        indexes = [models.Index(fields=['user', 'type', '-created_at'], name='pin_event_user_type_date')]


class UserTagInterest(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tag_interests')
    tag = models.CharField(max_length=40)
    weight = models.FloatField(default=0)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'tag'], name='unique_user_tag_interest')]


class ImageScan(TimestampedModel):
    stored_bytes = models.PositiveBigIntegerField(default=0)
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


class ImageQuotaLock(models.Model):
    """Singleton row serializes quota checks across upload workers."""
    pass


class ImageUploadUsage(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    day = models.DateField()
    uploads = models.PositiveIntegerField(default=0)
    normalized_bytes = models.PositiveBigIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["owner", "day"], name="unique_image_upload_day")]


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


class CommentLike(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="comment_likes")
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE, related_name="likes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "comment"], name="unique_comment_like")]


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


class PushSubscription(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    endpoint = models.URLField(max_length=2048, unique=True)
    p256dh = models.CharField(max_length=100)
    auth = models.CharField(max_length=32)
    messages = models.BooleanField(default=True)
    requests = models.BooleanField(default=True)
    follows = models.BooleanField(default=True)
    pins = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)


class PushDelivery(models.Model):
    subscription = models.ForeignKey(PushSubscription, on_delete=models.CASCADE)
    kind = models.CharField(max_length=10)
    target_id = models.PositiveBigIntegerField()
    event_key = models.CharField(max_length=120)
    attempts = models.PositiveSmallIntegerField(default=0)
    available_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["subscription", "event_key"], name="unique_push_delivery")]
        indexes = [models.Index(fields=["available_at", "id"], name="push_due_idx")]


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
