from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand
from collection.models import MediaCleanup


class Command(BaseCommand):
    help = "Retry file deletions deferred during a temporary storage failure."

    def handle(self, *args, **options):
        count = 0
        for item in MediaCleanup.objects.all().iterator():
            try:
                default_storage.delete(item.name)
            except OSError:
                continue
            item.delete()
            count += 1
        self.stdout.write(f"Removed {count} files; {MediaCleanup.objects.count()} still pending.")
