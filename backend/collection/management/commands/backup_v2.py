from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from common.backups import create_backup


class Command(BaseCommand):
    help = "Back up the V2 SQLite database and media after stopping all writers."

    def add_arguments(self, parser):
        parser.add_argument("output", type=Path)
        parser.add_argument("--offline", action="store_true", help="Acknowledge that all application writers are stopped.")

    def handle(self, *args, **options):
        if not options["offline"]:
            raise CommandError("Stop application writers, then pass --offline for a consistent database/media pair.")
        if settings.DATABASES["default"]["ENGINE"] != "django.db.backends.sqlite3":
            raise CommandError("This command supports only the V2 SQLite deployment.")
        try:
            count = create_backup(settings.DATABASES["default"]["NAME"], settings.MEDIA_ROOT, options["output"])
        except (ValueError, OSError) as error:
            raise CommandError(str(error)) from error
        self.stdout.write(self.style.SUCCESS(f"Verified backup created: {count} files."))
