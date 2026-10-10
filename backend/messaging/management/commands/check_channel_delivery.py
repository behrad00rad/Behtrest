import asyncio
import uuid
from channels.layers import get_channel_layer
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Verify the configured channel layer sends and receives a group event."

    def handle(self, *args, **options):
        async def check():
            layer = get_channel_layer()
            channel = await layer.new_channel()
            group = 'smoke.' + uuid.uuid4().hex
            try:
                await layer.group_add(group, channel)
                await layer.group_send(group, {'type': 'smoke.event', 'marker': group})
                event = await asyncio.wait_for(layer.receive(channel), timeout=5)
                if event.get('marker') != group: raise ValueError('Channel marker mismatch')
            finally: await layer.group_discard(group, channel)
        asyncio.run(check())
        self.stdout.write('Configured channel-layer group delivery passed.')
