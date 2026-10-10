import json
import tempfile
import uuid
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.files.base import ContentFile
from django.test import Client, override_settings
from messaging.models import Attachment, Block, Conversation, Membership, Message
from messaging.views import private_storage
from .models import ActivityNotification, ActivitySettings, Board, Comment, ContentReport, Follow, ModerationLog, Post, SavedPost
from .tests import MediaTestCase


@override_settings(API_RATE_LIMITS_ENABLED=False, PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class SocialTests(MediaTestCase):
    def setUp(self):
        super().setUp()
        users = get_user_model()
        self.alice = users.objects.create_user("social_alice", email="alice@example.invalid", password="testing")
        self.bob = users.objects.create_user("social_bob", email="bob@example.invalid", password="testing")
        self.other = users.objects.create_user("social_other", email="other@example.invalid", password="testing")
        self.staff = users.objects.create_user("social_staff", email="staff@example.invalid", password="testing", is_staff=True)
        self.staff.user_permissions.add(Permission.objects.get(codename="review_reports"))
        self.post = Post.objects.create(owner=self.alice, title="Social blue", image=self.image())
        self.client = Client(enforce_csrf_checks=True)
        self.login(self.bob)

    def login(self, user):
        self.client.force_login(user)
        self.csrf = self.client.get("/api/auth/session/").json()["data"]["csrfToken"]

    def api(self, path, method="get", data=None, status=200):
        response = self.client.get("/api" + path) if method == "get" else getattr(self.client, method)("/api" + path, json.dumps(data or {}), content_type="application/json", HTTP_X_CSRFTOKEN=self.csrf)
        self.assertEqual(response.status_code, status, response.content)
        return response.json().get("data", response.json().get("error"))

    def report(self, kind="post", pk=None):
        return self.api("/reports/", "post", {"kind": kind, "target_id": pk or self.post.pk, "reason": "Please review this content"}, 201)["id"]

    def decide(self, pk, action):
        return self.api(f"/moderation/{pk}/", "post", {"action": action, "reason": "Reviewed against community rules"})

    def test_follow_idempotence_counts_lists_and_unfollow(self):
        self.api("/profiles/social_alice/follow/", "post")
        self.api("/profiles/social_alice/follow/", "post")
        self.assertEqual(Follow.objects.count(), 1)
        self.assertEqual(ActivityNotification.objects.count(), 1)
        profile = self.api("/profiles/social_alice/")
        self.assertTrue(profile["is_following"])
        self.assertEqual(profile["follower_count"], 1)
        self.assertEqual(self.api("/profiles/social_alice/followers/")["items"][0]["username"], "social_bob")
        self.api("/profiles/social_bob/follow/", "post", status=400)
        self.api("/profiles/social_alice/follow/", "delete")
        self.assertFalse(self.api("/profiles/social_alice/")["is_following"])

    def test_follow_csrf_and_ownership_fail_closed(self):
        response = self.client.post("/api/profiles/social_alice/follow/", "{}", content_type="application/json")
        self.assertEqual(response.status_code, 403)
        self.api("/profiles/social_alice/follow/", "post", {"user_id": self.other.pk}, 400)
        self.client.logout()
        self.csrf = self.client.get("/api/auth/session/").json()["data"]["csrfToken"]
        self.api("/profiles/social_alice/follow/", "post", status=401)
        self.api("/feed/?following=1", status=401)

    def test_following_feed_visibility_blocks_and_cursor_scope(self):
        Post.objects.create(owner=self.other, title="Not followed", image=self.image())
        for i in range(3): Post.objects.create(owner=self.alice, title=f"Followed {i}", image=self.image())
        self.api("/profiles/social_alice/follow/", "post")
        page = self.api("/feed/?following=1&page_size=1")
        self.assertEqual(page["items"][0]["owner"]["id"], self.alice.pk)
        cursor = page["next_cursor"]
        self.login(self.other)
        self.api(f"/feed/?following=1&cursor={cursor}", status=400)
        self.login(self.bob)
        Block.objects.create(user=self.alice, target=self.bob)
        self.assertEqual(self.api("/feed/?following=1")["items"], [])
        self.api("/profiles/social_alice/follow/", "post", status=403)

    def test_comments_and_public_saves_notify_without_private_saves(self):
        self.api(f"/posts/{self.post.pk}/comments/", "post", {"text": "A thought"}, 201)
        private = Board.objects.create(owner=self.bob, name="Secret", is_private=True)
        public = Board.objects.create(owner=self.bob, name="Public", is_private=False)
        self.api(f"/boards/{private.pk}/saves/", "post", {"post_id": self.post.pk}, 201)
        self.assertEqual(ActivityNotification.objects.filter(kind="save").count(), 0)
        self.api(f"/boards/{public.pk}/saves/", "post", {"post_id": self.post.pk}, 201)
        self.api(f"/boards/{public.pk}/saves/", "post", {"post_id": self.post.pk})
        self.assertEqual(ActivityNotification.objects.filter(kind="save").count(), 1)
        self.login(self.alice)
        page = self.api("/notifications/")
        self.assertEqual(page["unread"], 2)
        self.assertEqual({x["kind"] for x in page["items"]}, {"save", "comment"})
        self.assertNotIn("Secret", json.dumps(page))

    def test_preferences_self_notifications_and_blocks(self):
        self.login(self.alice)
        self.api("/notifications/settings/", "patch", {"comments": False})
        self.api("/notifications/settings/", "patch", {"comments": "false"}, 400)
        self.api(f"/posts/{self.post.pk}/comments/", "post", {"text": "Own comment"}, 201)
        self.login(self.bob)
        self.api(f"/posts/{self.post.pk}/comments/", "post", {"text": "Disabled"}, 201)
        self.assertEqual(ActivityNotification.objects.count(), 0)
        self.api("/profiles/social_alice/follow/", "post")
        Block.objects.create(user=self.alice, target=self.bob)
        self.login(self.alice)
        self.assertEqual(self.api("/notifications/")["unread"], 0)

    def test_new_pins_notify_followers(self):
        self.api("/profiles/social_alice/follow/", "post")
        self.login(self.alice)
        response = self.client.post("/api/posts/", {"title": "A new idea", "image": self.image()}, HTTP_X_CSRFTOKEN=self.csrf)
        self.assertEqual(response.status_code, 201, response.content)
        self.login(self.bob)
        self.assertEqual(self.api("/notifications/")["items"][0]["kind"], "pin")

    def test_read_ownership_boundary_and_cursor(self):
        one = ActivityNotification.objects.create(recipient=self.bob, actor=self.alice, kind="follow", event_key="one")
        two = ActivityNotification.objects.create(recipient=self.bob, actor=self.alice, kind="follow", event_key="two")
        self.api("/notifications/", "post", {"through_id": one.pk})
        self.assertEqual(self.api("/notifications/?unread=1")["items"][0]["id"], two.pk)
        self.login(self.other)
        self.api("/notifications/", "post", {"id": two.pk}, 404)
        self.login(self.bob)
        self.api("/notifications/", "post", {"through_id": True}, 400)
        cursor = self.api("/notifications/?page_size=1")["next_cursor"]
        self.login(self.alice)
        self.api(f"/notifications/?cursor={cursor}", status=400)

    def test_reports_dedupe_and_preserve_evidence(self):
        pk = self.report()
        repeat = self.api("/reports/", "post", {"kind": "post", "target_id": self.post.pk, "reason": "Again"})
        self.assertEqual(repeat["id"], pk)
        self.post.title = "Changed"; self.post.save()
        self.assertIn("Social blue", ContentReport.objects.get(pk=pk).evidence)
        self.api("/moderation/", status=403)
        self.login(self.staff)
        self.assertEqual(self.api("/moderation/")["items"][0]["id"], pk)

    def test_staff_requires_explicit_review_permission(self):
        self.other.is_staff = True; self.other.save()
        self.login(self.other)
        self.api("/moderation/", status=403)
        self.assertFalse(self.api("/auth/session/")["user"]["can_moderate"])
        self.assertEqual(self.client.get("/admin/messaging/report/").status_code, 403)
        self.login(self.staff)
        self.assertEqual(self.client.get("/admin/messaging/report/").status_code, 200)

    def test_pin_hide_restore_covers_search_and_notifications(self):
        board = Board.objects.create(owner=self.bob, name="Cover", cover=self.post)
        SavedPost.objects.create(board=board, post=self.post)
        self.api(f"/posts/{self.post.pk}/comments/", "post", {"text": "Comment"}, 201)
        pk = self.report(); self.login(self.staff)
        self.decide(pk, "hide")
        self.api(f"/posts/{self.post.pk}/", status=404)
        self.api(f"/posts/{self.post.pk}/comments/", status=404)
        self.assertEqual(self.api("/feed/?q=Social")["items"], [])
        self.assertIsNone(self.api(f"/boards/{board.pk}/")["cover"])
        self.assertEqual(self.api(f"/boards/{board.pk}/posts/")["items"], [])
        self.login(self.alice)
        notification = self.api("/notifications/")["items"][0]
        self.assertIsNone(notification["path"])
        self.assertIsNone(notification["post_title"])
        self.login(self.staff); self.decide(pk, "restore")
        self.api(f"/posts/{self.post.pk}/")
        self.assertEqual(len(self.api(f"/moderation/{pk}/")["history"]), 2)

    def test_comment_moderation_and_report_audit(self):
        comment = Comment.objects.create(author=self.alice, post=self.post, text="Reported comment")
        pk = self.report("comment", comment.pk); self.login(self.staff)
        self.decide(pk, "hide")
        self.assertEqual(self.api(f"/posts/{self.post.pk}/comments/")["items"], [])
        self.decide(pk, "dismiss"); self.decide(pk, "reopen"); self.decide(pk, "restore")
        self.assertEqual(ModerationLog.objects.filter(report_id=pk).count(), 4)
        self.assertEqual(len(self.api(f"/posts/{self.post.pk}/comments/")["items"]), 1)

    def test_suspension_revokes_session_and_protects_staff(self):
        pk = self.report("user", self.alice.pk)
        alice_client = Client(); alice_client.force_login(self.alice)
        self.login(self.staff); self.decide(pk, "suspend")
        self.assertIsNone(alice_client.get("/api/auth/session/").json()["data"]["user"])
        self.api("/profiles/social_alice/", status=404)
        self.decide(pk, "restore_account")
        self.api("/profiles/social_alice/")
        self.assertIsNone(alice_client.get("/api/auth/session/").json()["data"]["user"])
        self.login(self.bob); staff_report = self.report("user", self.staff.pk)
        self.login(self.staff)
        self.api(f"/moderation/{staff_report}/", "post", {"action": "suspend", "reason": "No lockout"}, 403)

    def test_message_report_boundary_media_hide_and_restore(self):
        conversation = Conversation.objects.create(kind="group", title="Test group")
        Membership.objects.create(conversation=conversation, user=self.alice, accepted=True)
        Membership.objects.create(conversation=conversation, user=self.bob, accepted=True)
        msg = Message.objects.create(conversation=conversation, sender=self.alice, text="Photo", client_id=uuid.uuid4())
        Membership.objects.create(conversation=conversation, user=self.other, accepted=True, joined_after_id=msg.pk)
        with tempfile.TemporaryDirectory() as root, override_settings(PRIVATE_MEDIA_ROOT=root):
            name = private_storage().save("chat/reported.webp", ContentFile(b"private-test-image"))
            attachment = Attachment.objects.create(conversation=conversation, uploader=self.alice, message=msg, name=name, width=10, height=10)
            pk = self.report("message", msg.pk)
            self.login(self.other)
            self.api("/reports/", "post", {"kind": "message", "target_id": msg.pk, "reason": "Not visible"}, 404)
            self.api(f"/moderation/{pk}/media/", status=403)
            self.login(self.staff)
            response = self.client.get(f"/api/moderation/{pk}/media/")
            self.assertEqual(response.status_code, 200); response.close()
            self.decide(pk, "hide")
            self.login(self.bob)
            self.api(f"/chat/attachments/{attachment.pk}/", status=404)
            self.assertEqual(self.api(f"/chat/conversations/{conversation.pk}/media/")["items"], [])
            self.assertTrue(self.api(f"/chat/messages/{msg.pk}/")["deleted"])
            self.login(self.staff); self.decide(pk, "restore")
            self.login(self.bob)
            self.assertEqual(len(self.api(f"/chat/conversations/{conversation.pk}/media/")["items"]), 1)

    def test_report_invalid_target_and_decision_reason(self):
        self.api("/reports/", "post", {"kind": "board", "target_id": 1, "reason": "Private"}, 400)
        pk = self.report(); self.login(self.staff)
        self.api(f"/moderation/{pk}/", "post", {"action": "hide", "reason": " "}, 400)
        self.assertEqual(ModerationLog.objects.count(), 0)
