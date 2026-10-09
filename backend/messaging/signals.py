import logging
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver
from .models import Attachment

@receiver(post_delete, sender=Attachment)
def remove_attachment(sender, instance, **kwargs):
    def cleanup():
        try:
            FileSystemStorage(location=settings.PRIVATE_MEDIA_ROOT).delete(instance.name)
        except OSError:
            logging.getLogger(__name__).warning("Private image cleanup will be retried by chat_cleanup.")
    transaction.on_commit(cleanup)
