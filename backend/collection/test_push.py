import base64
import json
import uuid
from unittest.mock import patch
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from django.contrib.auth import get_user_model
from django.test import TestCase, Client, override_settings
from messaging.models import Block, ChatSettings, Conversation, Membership, Message
from .models import ActivityNotification, Follow, Post, PushDelivery, PushSubscription
from .push import chat_event, drain, enqueue, payload


@override_settings(WEB_PUSH_PUBLIC_KEY="public", WEB_PUSH_PRIVATE_KEY="private", API_RATE_LIMITS_ENABLED=False)
class PushTests(TestCase):
    def setUp(self):
        self.alice = get_user_model().objects.create_user(username="push_alice", email="push-alice@example.invalid")
        self.bob = get_user_model().objects.create_user(username="push_bob", email="push-bob@example.invalid")
        self.client.force_login(self.bob)
        public = ec.generate_private_key(ec.SECP256R1()).public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        encode = lambda data: base64.urlsafe_b64encode(data).rstrip(b"=").decode()
        self.data = {"endpoint": "https://fcm.googleapis.com/fcm/send/test", "p256dh": encode(public), "auth": encode(b"a" * 16)}
        self.sub = PushSubscription.objects.create(user=self.bob, **self.data)
        ChatSettings.objects.create(user=self.bob, browser_notifications=True)
        self.chat = Conversation.objects.create(kind="direct", direct_key="test")
        Membership.objects.create(conversation=self.chat, user=self.alice, accepted=True)
        self.member = Membership.objects.create(conversation=self.chat, user=self.bob, accepted=True)

    def post(self, data, method="post"):
        return getattr(self.client, method)("/api/push/subscriptions/", json.dumps(data), content_type="application/json")

    def message(self):
        msg = Message.objects.create(conversation=self.chat, sender=self.alice, client_id=uuid.uuid4(), text="Private content")
        chat_event(self.chat.pk, self.alice.pk, msg.pk)
        return PushDelivery.objects.get()

    def test_subscription_validation_ownership_and_csrf(self):
        self.assertEqual(self.post({**self.data, "pins": True}).status_code, 200)
        self.sub.refresh_from_db(); self.assertTrue(self.sub.pins)
        prefs = self.client.get("/api/push/subscriptions/", {"endpoint": self.sub.endpoint}).json()["data"]["preferences"]
        self.assertTrue(prefs["pins"])
        for address in ("http://fcm.googleapis.com/x", "https://localhost/x", "https://fcm.googleapis.com.evil.test/x", "https://fcm.googleapis.com:8443/x", "https://u@fcm.googleapis.com/x"):
            self.assertEqual(self.post({**self.data, "endpoint": address}).status_code, 400)
        self.assertEqual(self.post({**self.data, "auth": "bad"}).status_code, 400)
        self.assertEqual(self.post({**self.data, "p256dh": base64.urlsafe_b64encode(b"x" * 65).decode()}).status_code, 400)
        self.client.force_login(self.alice)
        self.assertEqual(self.post({"endpoint": self.sub.endpoint}, "delete").status_code, 200)
        self.assertTrue(PushSubscription.objects.exists())
        self.assertIsNone(self.client.get("/api/push/subscriptions/", {"endpoint": self.sub.endpoint}).json()["data"]["preferences"])
        csrf = Client(enforce_csrf_checks=True); csrf.force_login(self.bob)
        self.assertEqual(csrf.post("/api/push/subscriptions/", json.dumps(self.data), content_type="application/json").status_code, 403)
        self.client.logout()
        self.assertEqual(self.client.get("/api/push/subscriptions/").status_code, 401)

    def test_message_private_payload_and_delivery(self):
        job = self.message()
        self.assertNotIn("Private content", json.dumps(payload(job)))
        with patch("pywebpush.webpush") as send:
            self.assertEqual(drain(), 1)
            args = send.call_args.kwargs
            self.assertEqual(json.loads(args["data"])["url"], f"/messages/{self.chat.pk}")
            self.assertEqual(args["timeout"], 5)
        self.assertFalse(PushDelivery.objects.exists())

    def test_muted_blocked_read_deleted_and_disabled_drop(self):
        job = self.message()
        for field in ("muted", "archived"):
            setattr(self.member, field, True); self.member.save(); self.assertIsNone(payload(job))
            setattr(self.member, field, False); self.member.save()
        Block.objects.create(user=self.bob, target=self.alice)
        self.assertIsNone(payload(job)); Block.objects.all().delete()
        self.member.last_read_id = job.target_id; self.member.save(); self.assertIsNone(payload(job))
        self.member.last_read_id = 0; self.member.save()
        ChatSettings.objects.filter(user=self.bob).update(browser_notifications=False)
        self.assertIsNone(payload(job))
        ChatSettings.objects.filter(user=self.bob).update(browser_notifications=True)
        Message.objects.filter(pk=job.target_id).update(is_hidden=True)
        self.assertIsNone(payload(job))

    def test_requests_and_idempotence(self):
        self.member.accepted = False; self.member.save()
        chat_event(self.chat.pk, self.alice.pk)
        chat_event(self.chat.pk, self.alice.pk)
        self.assertEqual(PushDelivery.objects.count(), 1)
        job = PushDelivery.objects.get()
        self.assertEqual(job.kind, "requests")
        self.assertIsNotNone(payload(job))
        self.member.accepted = True; self.member.save(); self.assertIsNone(payload(job))

    def test_message_api_enqueues_only_once(self):
        self.client.force_login(self.alice)
        data = {"text": "Hello", "client_id": str(uuid.uuid4())}
        path = f"/api/chat/conversations/{self.chat.pk}/messages/"
        self.assertEqual(self.client.post(path, json.dumps(data), content_type="application/json").status_code, 201)
        self.assertEqual(self.client.post(path, json.dumps(data), content_type="application/json").status_code, 200)
        self.assertEqual(PushDelivery.objects.count(), 1)

    def test_real_library_encrypts_payload_without_network(self):
        from py_vapid import Vapid02
        from pywebpush import webpush
        vapid = Vapid02(); vapid.generate_keys()
        job = self.message()
        with patch("requests.post") as send:
            send.return_value.status_code = 201
            webpush(subscription_info={"endpoint": self.sub.endpoint, "keys": {
                "p256dh": self.sub.p256dh, "auth": self.sub.auth}},
                data=json.dumps(payload(job)), vapid_private_key=vapid,
                vapid_claims={"sub": "mailto:test@example.invalid"}, timeout=5)
            args = send.call_args.kwargs
            self.assertNotIn(b"new message", args["data"])
            self.assertTrue(args["headers"]["authorization"].startswith("vapid "))

    def test_post_requires_opt_in_follow_and_approved_content(self):
        post = Post.objects.create(owner=self.alice, title="Hello", image="test.jpg", image_width=100, image_height=100)
        event = ActivityNotification.objects.create(recipient=self.bob, actor=self.alice, kind="pin", post=post, event_key="pin-test")
        enqueue(self.bob.pk, "pins", event.pk, event.event_key)
        self.assertFalse(PushDelivery.objects.exists())
        self.sub.pins = True; self.sub.save()
        Follow.objects.create(follower=self.bob, target=self.alice)
        enqueue(self.bob.pk, "pins", event.pk, event.event_key)
        job = PushDelivery.objects.get()
        self.assertIsNotNone(payload(job))
        post.is_hidden = True; post.save(); self.assertIsNone(payload(job))
        post.is_hidden = False; post.save()
        Follow.objects.all().delete(); self.assertIsNone(payload(job))

    def test_expired_subscription_removed_transient_retried(self):
        from pywebpush import WebPushException
        from requests import Response
        self.message()
        response = Response(); response.status_code = 503
        with patch("pywebpush.webpush", side_effect=WebPushException("Unavailable", response=response)):
            drain()
        job = PushDelivery.objects.get(); self.assertEqual(job.attempts, 1)
        from django.utils import timezone
        job.available_at = timezone.now(); job.save()
        response.status_code = 410
        with patch("pywebpush.webpush", side_effect=WebPushException("Gone", response=response)):
            drain()
        self.assertFalse(PushSubscription.objects.exists())
        self.assertFalse(PushDelivery.objects.exists())
