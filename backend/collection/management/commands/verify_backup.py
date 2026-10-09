from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from common.backups import verify_backup, restore_backup


class Command(BaseCommand):
    help = "Verify checksums, database integrity, and media references; optionally restore into an empty directory."

    def add_arguments(self, parser):
        parser.add_argument("archive", type=Path)
        parser.add_argument("--restore-to", type=Path)

    def handle(self, *args, **options):
        try:
            manifest = verify_backup(options["archive"])
            if options["restore_to"]:
                restore_backup(options["archive"], options["restore_to"])
        except Exception as error:
            raise CommandError(f"Backup verification failed: {error}") from error
        self.stdout.write(self.style.SUCCESS(f"Backup verified: {len(manifest['files'])} files."))
