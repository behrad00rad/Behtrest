import time
from django.core.management.base import BaseCommand
from collection.image_moderation import Detector, run_one


class Command(BaseCommand):
    help = "Process private image checks with a local CPU model; never download at runtime."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")

    def handle(self, *args, **options):
        detector = Detector()
        self.stdout.write("Local image moderation worker ready (CPU, one image at a time).")
        while True:
            worked = run_one(detector)
            if options["once"]: break
            if not worked: time.sleep(2)
