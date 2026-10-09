from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver
from accounts.models import Profile
from common.media import delete_files
from .models import Post


@receiver(post_delete, sender=Post)
def remove_post_images(sender, instance, **kwargs):
    names = [instance.image.name, instance.thumbnail.name]
    transaction.on_commit(lambda: delete_files(names))


@receiver(post_delete, sender=Profile)
def remove_avatar(sender, instance, **kwargs):
    names = [instance.avatar.name]
    transaction.on_commit(lambda: delete_files(names))
