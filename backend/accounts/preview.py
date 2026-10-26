"""Sample starter collections for fresh playground members. No shared identities."""
import uuid

from django.contrib.auth import get_user_model
from django.db import transaction
from django.conf import settings


def is_guest_user(user):
    return bool(settings.PREVIEW_MODE and user.is_authenticated and user.username.startswith('guest_') and not user.has_usable_password())


def starter_content(user):
    from collection.models import Board, Follow, Post, SavedPost
    from messaging.models import Conversation, Membership, Message

    with transaction.atomic():
        board, _ = Board.objects.get_or_create(owner=user, name='Weekend inspiration', defaults={'description': 'A few ideas to get you started. Save, remove, or add your own.'})
        posts = Post.objects.filter(owner__username__startswith='preview_', is_hidden=False, moderation_status='approved').order_by('id')[:6]
        for post in posts:
            SavedPost.objects.get_or_create(board=board, post=post)
        guide = get_user_model().objects.filter(username='preview_maya').first()
        if guide:
            Follow.objects.get_or_create(follower=user, target=guide)
            key = ':'.join(str(pk) for pk in sorted([user.pk, guide.pk]))
            chat, created = Conversation.objects.get_or_create(direct_key=key, defaults={'kind': 'direct'})
            if created:
                Membership.objects.create(conversation=chat, user=user, accepted=True)
                Membership.objects.create(conversation=chat, user=guide, accepted=True)
                Message.objects.create(conversation=chat, sender=guide, client_id=uuid.uuid4(), text='Welcome to the Behtrest preview! This is a sample conversation, not a live person. Try saving a pin, making a board, or sharing an idea here.')
