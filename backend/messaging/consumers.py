import asyncio
import time
from importlib import import_module

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings
from django.contrib.auth import HASH_SESSION_KEY, SESSION_KEY
from .models import Membership
from .services import blocked, preferences


class ChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        self.last_event = 0
        self.heartbeat = None
        if not self.user.is_authenticated or not await self.valid_session():
            await self.close(code=4401)
            return
        if not await self.admit():
            await self.close(code=4429)
            return
        self.group = f"chat_user_{self.user.pk}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.mark_presence()
        self.heartbeat = asyncio.create_task(self.check_session())
        await self.send_json({"type": "connected"})

    @database_sync_to_async
    def admit(self):
        from common.api import consume_limit
        return not settings.API_RATE_LIMITS_ENABLED or not consume_limit("chat_socket", str(self.user.pk), 20, 60)

    @database_sync_to_async
    def valid_session(self):
        session = import_module(settings.SESSION_ENGINE).SessionStore(session_key=self.scope["session"].session_key)
        from django.contrib.auth import get_user_model
        user = get_user_model().objects.filter(pk=self.user.pk, is_active=True).first()
        return bool(user and str(session.get(SESSION_KEY)) == str(user.pk) and session.get(HASH_SESSION_KEY) == user.get_session_auth_hash())

    async def check_session(self):
        try:
            while True:
                await asyncio.sleep(15)
                if not await self.valid_session():
                    await self.close(code=4401)
                    return
                await self.channel_layer.group_add(self.group, self.channel_name)
                await self.mark_presence()
        except asyncio.CancelledError:
            pass

    async def disconnect(self, code):
        if self.heartbeat:
            self.heartbeat.cancel()
        if hasattr(self, "group"):
            await self.channel_layer.group_discard(self.group, self.channel_name)
            await self.mark_presence(remove=True)

    @database_sync_to_async
    def mark_presence(self, remove=False):
        from django.core.cache import cache
        # Presence is approximate and expires after unexpected disconnects.
        key = f"chat_online_{self.user.pk}"
        now = time.time()
        connections = {name: timestamp for name, timestamp in (cache.get(key) or {}).items() if now - timestamp < 40}
        if remove: connections.pop(self.channel_name, None)
        else: connections[self.channel_name] = now
        cache.set(key, connections, 40)

    @database_sync_to_async
    def audience(self, conversation_id):
        own = Membership.objects.filter(user=self.user, conversation_id=conversation_id, active=True, accepted=True).select_related("conversation").first()
        if not own:
            return []
        peers = own.conversation.memberships.filter(active=True, accepted=True, user__is_active=True).exclude(user=self.user).select_related("user")
        return [item.user_id for item in peers if not blocked(self.user.pk, item.user_id)]

    @database_sync_to_async
    def presence(self, user_ids):
        from django.core.cache import cache
        from django.contrib.auth import get_user_model
        return [{"user_id": user.pk, "online": bool(preferences(user).show_presence and any(time.time() - timestamp < 40 for timestamp in (cache.get(f"chat_online_{user.pk}") or {}).values()))} for user in get_user_model().objects.filter(pk__in=user_ids)]

    async def receive(self, text_data=None, bytes_data=None, **kwargs):
        if bytes_data is not None or text_data is None or len(text_data) > 1024:
            await self.close(code=4400)
            return
        try:
            await super().receive(text_data=text_data, **kwargs)
        except (ValueError, TypeError, KeyError):
            await self.close(code=4400)

    async def receive_json(self, content, **kwargs):
        if not isinstance(content, dict) or not await self.valid_session():
            await self.close(code=4401)
            return
        if time.monotonic() - self.last_event < 0.5:
            return
        self.last_event = time.monotonic()
        conversation_id = content.get("conversation_id")
        if not isinstance(conversation_id, int) or isinstance(conversation_id, bool):
            return
        peers = await self.audience(conversation_id)
        if content.get("type") == "presence":
            await self.send_json({"type": "presence", "conversation_id": conversation_id, "members": await self.presence(peers)})
        elif content.get("type") == "typing" and isinstance(content.get("active"), bool):
            for user_id in peers:
                await self.channel_layer.group_send(f"chat_user_{user_id}", {"type": "chat.typing", "conversation_id": conversation_id, "user_id": self.user.pk, "active": content["active"]})

    @database_sync_to_async
    def may_receive(self, conversation_id):
        return Membership.objects.filter(user=self.user, conversation_id=conversation_id, active=True).exists()

    async def chat_refresh(self, event):
        if not await self.valid_session():
            await self.close(code=4401)
        elif await self.may_receive(event["conversation_id"]):
            await self.send_json({**event, "type": "refresh"})

    async def chat_typing(self, event):
        if await self.valid_session() and event["user_id"] in await self.audience(event["conversation_id"]):
            await self.send_json({**event, "type": "typing"})
