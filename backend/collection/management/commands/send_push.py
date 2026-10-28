import time
from django.core.management.base import BaseCommand
from collection.push import drain


class Command(BaseCommand):
    help = "Drain Web Push outbox (run once per timer; do not run concurrently)."

    def handle(self, *args, **options):
        started = time.monotonic()
        # Bound idle and busy runs; retries persist in the outbox.
        total = 0
        while time.monotonic() - started < 20:
            sent = drain(limit=1)
            total += sent
            if not sent:
                break
        self.stdout.write(f"Push deliveries processed: {total}")
