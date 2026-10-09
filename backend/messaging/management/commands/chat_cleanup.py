from datetime import timedelta
from pathlib import Path
import time
from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone
from messaging.models import Attachment

class Command(BaseCommand):
    help = "Remove chat uploads abandoned for 24 hours and old unreferenced private files."

    def handle(self, *args, **options):
        expired = Attachment.objects.filter(message__isnull=True, created_at__lt=timezone.now() - timedelta(hours=24))
        count = expired.count()
        expired.delete()
        root = Path(settings.PRIVATE_MEDIA_ROOT).resolve()
        referenced = set(Attachment.objects.values_list("name", flat=True))
        if root.exists():
            for path in (root / "chat").rglob("*.webp"):
                if path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root) and path.relative_to(root).as_posix() not in referenced and path.stat().st_mtime < time.time() - 86400:
                    path.unlink()
                    count += 1
        self.stdout.write(f"Removed {count} abandoned chat uploads.")
