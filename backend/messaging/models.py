from django.conf import settings
from django.db import models
from django.db.models import Q


class Conversation(models.Model):
    kind = models.CharField(max_length=6, choices=[("direct", "Direct"), ("group", "Group")])
    title = models.CharField(max_length=100, blank=True)
    direct_key = models.CharField(max_length=50, unique=True, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Membership(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_memberships")
    role = models.CharField(max_length=6, default="member", choices=[("admin", "Admin"), ("member", "Member")])
    active = models.BooleanField(default=True)
    accepted = models.BooleanField(default=False)
    muted = models.BooleanField(default=False)
    archived = models.BooleanField(default=False)
    joined_after_id = models.PositiveBigIntegerField(default=0)
    last_read_id = models.PositiveBigIntegerField(default=0)
    last_delivered_id = models.PositiveBigIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["conversation", "user"], name="chat_unique_member")]


class Message(models.Model):
    is_hidden = models.BooleanField(default=False)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_messages")
    client_id = models.UUIDField()
    text = models.CharField(max_length=4000, blank=True)
    pin = models.ForeignKey("collection.Post", null=True, blank=True, on_delete=models.SET_NULL)
    reply = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["conversation", "sender", "client_id"], name="chat_idempotent_message")]
        indexes = [models.Index(fields=["conversation", "-id"], name="chat_message_history")]


class Attachment(models.Model):
    uploader = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE)
    message = models.OneToOneField(Message, null=True, blank=True, on_delete=models.CASCADE, related_name="attachment")
    name = models.CharField(max_length=255, unique=True)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)


class Reaction(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="reactions")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    emoji = models.CharField(max_length=12)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["message", "user", "emoji"], name="chat_unique_reaction")]


class ChatSettings(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_settings")
    contact_policy = models.CharField(max_length=8, default="requests", choices=[("everyone", "Everyone"), ("requests", "Requests"), ("nobody", "Nobody")])
    show_presence = models.BooleanField(default=True)
    show_read_receipts = models.BooleanField(default=True)
    browser_notifications = models.BooleanField(default=False)


class Block(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_blocks")
    target = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="blocked_by")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "target"], name="chat_unique_block"), models.CheckConstraint(condition=~Q(user=models.F("target")), name="chat_no_self_block")]


class Report(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    message = models.ForeignKey(Message, on_delete=models.CASCADE)
    reason = models.CharField(max_length=1000)
    evidence = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "message"], name="chat_unique_report")]
