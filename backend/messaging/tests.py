import json
import tempfile
import uuid
from io import BytesIO
from pathlib import Path
from PIL import Image
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, TransactionTestCase, override_settings
from asgiref.sync import async_to_sync
from asgiref.testing import ApplicationCommunicator
from .models import Membership, Message, ChatSettings, Attachment

@override_settings(API_RATE_LIMITS_ENABLED=False, PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class ChatTests(TestCase):
    def setUp(self):
        self.users = [get_user_model().objects.create_user(username=name, email=f"{name}@example.invalid", password="testing-chat") for name in ["alice", "bob", "outsider"]]
        self.alice, self.bob, self.outsider = self.users
        self.client.force_login(self.alice)
        self.pk = self.api("/conversations/", "post", {"username": "bob"}, 201)["id"]

    def api(self, path, method="get", data=None, status=200):
        response = getattr(self.client, method)("/api/chat" + path, data=json.dumps(data or {}), content_type="application/json") if method != "get" else self.client.get("/api/chat" + path)
        self.assertEqual(response.status_code, status, response.content)
        return response.json().get("data", response.json().get("error"))

    def send(self, text="hello", **extra):
        return self.api(f"/conversations/{self.pk}/messages/", "post", {"text": text, "client_id": str(uuid.uuid4()), **extra}, 201)

    def accept(self):
        self.client.force_login(self.bob)
        self.api(f"/conversations/{self.pk}/", "patch", {"accept": True})
        self.client.force_login(self.alice)

    def test_request_allows_one_message_before_acceptance(self):
        self.send()
        self.api(f"/conversations/{self.pk}/messages/", "post", {"text": "spam", "client_id": str(uuid.uuid4())}, 403)
        self.accept(); self.send("accepted")

    def test_idempotent_retry_and_invalid_identifiers(self):
        payload = {"text": "once", "client_id": str(uuid.uuid4())}
        first = self.api(f"/conversations/{self.pk}/messages/", "post", payload, 201)
        second = self.api(f"/conversations/{self.pk}/messages/", "post", payload)
        self.assertEqual(first["id"], second["id"]); self.assertEqual(Message.objects.count(), 1)
        self.api(f"/conversations/{self.pk}/messages/", "post", {"client_id": str(uuid.uuid4()), "pin_id": "bad"}, 400)

    def test_outsider_cannot_read_or_write(self):
        m = self.send(); self.client.force_login(self.outsider)
        for path in [f"/conversations/{self.pk}/", f"/conversations/{self.pk}/messages/", f"/messages/{m['id']}/"]: self.api(path, status=404)
        self.api(f"/conversations/{self.pk}/messages/", "post", {"text": "no", "client_id": str(uuid.uuid4())}, 404)

    def test_replies_reactions_edits_and_tombstone(self):
        self.accept(); m = self.send(); reply = self.send("reply", reply_id=m["id"])
        self.assertEqual(reply["reply"]["text"], "hello")
        self.client.force_login(self.bob)
        self.api(f"/messages/{m['id']}/", "patch", {"text": "forged"}, 404)
        self.api(f"/messages/{m['id']}/reactions/", "post", {"emoji": "❤️"})
        self.client.force_login(self.alice)
        self.api(f"/messages/{m['id']}/", "patch", {"text": "edited"})
        deleted = self.api(f"/messages/{m['id']}/", "delete")
        self.assertTrue(deleted["deleted"]); self.assertEqual(deleted["text"], ""); self.assertEqual(deleted["reactions"], [])
        self.assertEqual(self.api(f"/messages/{reply['id']}/")["reply"]["text"], "Message deleted")

    def test_blocking_and_unblocking(self):
        self.accept(); m = self.send()
        self.client.force_login(self.bob); self.api("/blocks/", "post", {"username": "alice"})
        self.client.force_login(self.alice)
        self.api(f"/conversations/{self.pk}/messages/", "post", {"text": "no", "client_id": str(uuid.uuid4())}, 403)
        self.api(f"/messages/{m['id']}/reactions/", "post", {"emoji": "👍"}, 403)
        self.client.force_login(self.bob); self.api("/blocks/", "delete", {"username": "alice"})
        self.client.force_login(self.alice); self.send("available")

    def test_privacy_and_receipts_monotonic(self):
        self.accept(); m = self.send(); n = self.send("second")
        self.client.force_login(self.bob)
        self.api(f"/conversations/{self.pk}/receipts/", "post", {"message_id": n["id"], "read": True})
        self.api(f"/conversations/{self.pk}/receipts/", "post", {"message_id": m["id"], "read": True})
        self.assertEqual(Membership.objects.get(user=self.bob, conversation_id=self.pk).last_read_id, n["id"])
        self.api("/settings/", "patch", {"show_read_receipts": False})
        self.client.force_login(self.alice)
        bob = next(x for x in self.api(f"/conversations/{self.pk}/")["members"] if x["id"] == self.bob.pk)
        self.assertIsNone(bob["last_read_id"])

    def test_group_roles_join_boundary_removal_and_leave(self):
        c = self.api("/conversations/", "post", {"usernames": "bob", "title": "Ideas"}, 201)
        self.pk = c["id"]; old = self.send("before invitation")
        self.api(f"/conversations/{self.pk}/members/", "post", {"username": "outsider"})
        self.client.force_login(self.outsider)
        self.api(f"/conversations/{self.pk}/", "patch", {"accept": True})
        self.assertEqual(self.api(f"/conversations/{self.pk}/messages/")["items"], [])
        self.api(f"/messages/{old['id']}/", status=404)
        self.api(f"/conversations/{self.pk}/members/", "delete", {"username": "alice"}, 404)
        self.client.force_login(self.alice)
        self.api(f"/conversations/{self.pk}/", "patch", {"leave": True}, 400)
        self.api(f"/conversations/{self.pk}/members/", "patch", {"username": "outsider", "role": "admin"})
        self.api(f"/conversations/{self.pk}/", "patch", {"leave": True})
        self.api(f"/conversations/{self.pk}/messages/", status=404)

    def test_images_require_membership_and_delete_private_file(self):
        self.accept()
        with tempfile.TemporaryDirectory() as root, override_settings(PRIVATE_MEDIA_ROOT=root):
            stream = BytesIO(); Image.new("RGB", (12, 16), "blue").save(stream, format="PNG")
            response = self.client.post(f"/api/chat/conversations/{self.pk}/attachments/", {"image": SimpleUploadedFile("blue.png", stream.getvalue(), "image/png")})
            self.assertEqual(response.status_code, 201, response.content); image = response.json()["data"]
            self.client.force_login(self.bob); self.api(f"/attachments/{image['id']}/", status=404)
            self.client.force_login(self.alice); m = self.send("image", attachment_id=image["id"])
            self.client.force_login(self.bob); response = self.client.get(image["url"]); self.assertEqual(response.status_code, 200); response.close()
            self.client.force_login(self.outsider); self.api(f"/attachments/{image['id']}/", status=404)
            self.client.force_login(self.alice)
            with self.captureOnCommitCallbacks(execute=True): self.api(f"/messages/{m['id']}/", "delete")
            self.assertFalse(list(Path(root).rglob("*.webp")))

    def test_search_archive_mute_and_report(self):
        self.accept(); m = self.send("find blueberry")
        self.assertEqual(len(self.api(f"/conversations/{self.pk}/messages/?q=blueberry")["items"]), 1)
        self.api(f"/conversations/{self.pk}/", "patch", {"archived": True, "muted": True})
        self.assertEqual(self.api("/conversations/")["items"], [])
        self.assertEqual(len(self.api("/conversations/?folder=archive")["items"]), 1)
        self.client.force_login(self.bob); self.api(f"/messages/{m['id']}/report/", "post", {"reason": "Test report"}, 201)

    def test_contact_policy_and_authentication(self):
        ChatSettings.objects.update_or_create(user=self.outsider, defaults={"contact_policy": "nobody"})
        self.api("/conversations/", "post", {"username": "outsider"}, 403)
        self.client.logout(); self.api("/summary/", status=401)

@override_settings(API_RATE_LIMITS_ENABLED=False, PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"], CHAT_ALLOWED_ORIGINS=["http://localhost:5173"])
class SocketTests(TransactionTestCase):
    def test_session_origin_and_logout_revocation(self):
        user = get_user_model().objects.create_user(username="socket", email="socket@example.invalid", password="testing-chat")
        self.client.force_login(user)
        cookie = f"sessionid={self.client.cookies['sessionid'].value}".encode()
        from config.asgi import application
        async def exercise():
            def app(origin, cookies): return ApplicationCommunicator(application, {"type": "websocket", "path": "/ws/chat/", "headers": [(b"origin", origin), (b"cookie", cookies)], "query_string": b""})
            bad = app(b"https://hostile.invalid", cookie); await bad.send_input({"type": "websocket.connect"}); self.assertEqual((await bad.receive_output())["type"], "websocket.close"); await bad.send_input({"type": "websocket.disconnect", "code": 1000}); await bad.wait()
            anon = app(b"http://localhost:5173", b""); await anon.send_input({"type": "websocket.connect"}); self.assertEqual((await anon.receive_output())["type"], "websocket.close"); await anon.wait()
            good = app(b"http://localhost:5173", cookie); await good.send_input({"type": "websocket.connect"}); self.assertEqual((await good.receive_output())["type"], "websocket.accept"); await good.receive_output()
            from channels.db import database_sync_to_async
            await database_sync_to_async(self.client.logout)()
            await good.send_input({"type": "websocket.receive", "text": json.dumps({"type": "presence", "conversation_id": 1})})
            self.assertEqual((await good.receive_output())["type"], "websocket.close")
            await good.send_input({"type": "websocket.disconnect", "code": 1000}); await good.wait()
        async_to_sync(exercise)()
