from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver
from accounts.models import Profile
from common.media import delete_files
from .models import Post, ImageScan


@receiver(post_delete, sender=Post)
def remove_post_images(sender, instance, **kwargs):
    names = [instance.image.name, instance.thumbnail.name]
    transaction.on_commit(lambda: delete_files(names))


@receiver(post_delete, sender=Profile)
def remove_avatar(sender, instance, **kwargs):
    names = [instance.avatar.name]
    transaction.on_commit(lambda: delete_files(names))


@receiver(post_delete, sender=ImageScan)
def remove_quarantine(sender, instance, **kwargs):
    from .image_moderation import storage
    names = [instance.original, instance.thumbnail]
    def cleanup():
        for name in names:
            if name:
                try: storage().delete(name)
                except OSError: pass  # Durable sweep removes orphaned quarantine files.
    transaction.on_commit(cleanup)
