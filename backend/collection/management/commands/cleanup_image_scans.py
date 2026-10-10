from datetime import timedelta
from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from collection.models import ImageScan
from collection.image_moderation import storage


class Command(BaseCommand):
    help = "Prune approved/canceled previews after 7 days and orphaned quarantine files after 24 hours."

    def handle(self, *args, **options):
        now = timezone.now()
        with transaction.atomic():
            for scan in ImageScan.objects.filter(status__in=['approved', 'canceled'], updated_at__lt=now - timedelta(days=7)):
                for field in ('original', 'thumbnail'):
                    name = getattr(scan, field)
                    if name:
                        try: storage().delete(name)
                        except OSError: continue
                        setattr(scan, field, '')
                scan.save(update_fields=['original', 'thumbnail'])
        referenced = {name for pair in ImageScan.objects.values_list('original', 'thumbnail') for name in pair if name}
        root = Path(settings.PRIVATE_MEDIA_ROOT).resolve()
        for file in (root / 'quarantine').rglob('*'):
            if file.is_symlink() or not file.is_file(): continue
            resolved = file.resolve()
            if not resolved.is_relative_to(root): continue
            name = resolved.relative_to(root).as_posix()
            if name not in referenced and now.timestamp() - file.stat().st_mtime > 86400:
                try: file.unlink()
                except OSError: pass
        self.stdout.write('Image quarantine cleanup complete; pending/review/rejected evidence retained.')
