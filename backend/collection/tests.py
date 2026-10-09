import json
import io
import tempfile

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import Client, TestCase, override_settings
from PIL import Image

from accounts.models import Profile
from .models import Board, Comment, Post, SavedPost


class MediaTestCase(TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        override = override_settings(MEDIA_ROOT=directory.name)
        override.enable()
        self.addCleanup(override.disable)

    def image(self):
        buffer = io.BytesIO()
        Image.new("RGB", (4, 4), "blue").save(buffer, "PNG")
        return SimpleUploadedFile("fixture.png", buffer.getvalue(), content_type="image/png")


@override_settings(API_RATE_LIMITS_ENABLED=False)
class OwnershipTests(MediaTestCase):
    def setUp(self):
        super().setUp()
        User = get_user_model()
        self.owner = User.objects.create_user("owner", "owner@example.com", "Example!Garden945")
        self.other = User.objects.create_user("other", "other@example.com", "Example!Garden945")
        self.post = Post.objects.create(owner=self.owner, title="Blue", image=self.image())
        self.comment = Comment.objects.create(author=self.owner, post=self.post, text="Nice")
        self.board = Board.objects.create(owner=self.owner, name="Inspiration", is_private=True)
        self.saved = SavedPost.objects.create(board=self.board, post=self.post)
        self.client = Client(enforce_csrf_checks=True)
        self.client.force_login(self.other)
        self.token = self.client.get("/api/auth/session/").json()["data"]["csrfToken"]

    def send(self, path, method="patch", data=None):
        return getattr(self.client, method)(path, json.dumps(data or {}), content_type="application/json", HTTP_X_CSRFTOKEN=self.token)

    def login_owner(self):
        self.client.force_login(self.owner)
        self.token = self.client.get("/api/auth/session/").json()["data"]["csrfToken"]

    def test_other_user_cannot_edit_or_delete_owned_records(self):
        for path, values in ((f"/api/posts/{self.post.pk}/", {"title": "Stolen"}), (f"/api/comments/{self.comment.pk}/", {"text": "Stolen"}), (f"/api/boards/{self.board.pk}/manage/", {"name": "Stolen"})):
            self.assertEqual(self.send(path, data=values).status_code, 404)
            self.assertEqual(self.send(path, "delete").status_code, 404)
        self.assertEqual(self.send(f"/api/saves/{self.saved.pk}/", "delete").status_code, 404)
        self.post.refresh_from_db()
        self.assertEqual(self.post.title, "Blue")

    def test_anonymous_writes_are_rejected_even_with_legacy_cookies(self):
        self.client.logout()
        self.client.cookies["user_id"] = str(self.owner.pk)
        self.client.cookies["auth"] = "1"
        self.token = self.client.get("/api/auth/session/").json()["data"]["csrfToken"]
        self.assertEqual(self.send(f"/api/posts/{self.post.pk}/", data={"title": "Stolen"}).status_code, 401)

    def test_owner_can_edit_records_and_remove_save(self):
        self.login_owner()
        for path, values in ((f"/api/posts/{self.post.pk}/", {"title": "Updated"}), (f"/api/comments/{self.comment.pk}/", {"text": "Updated"}), (f"/api/boards/{self.board.pk}/manage/", {"is_private": False})):
            response = self.send(path, data=values)
            self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.send(f"/api/saves/{self.saved.pk}/", "delete").status_code, 200)
        self.assertFalse(SavedPost.objects.filter(pk=self.saved.pk).exists())

    def test_owner_can_delete_records(self):
        self.login_owner()
        self.assertEqual(self.send(f"/api/comments/{self.comment.pk}/", "delete").status_code, 200)
        self.assertEqual(self.send(f"/api/posts/{self.post.pk}/", "delete").status_code, 200)
        self.assertFalse(SavedPost.objects.filter(pk=self.saved.pk).exists())
        self.assertEqual(self.send(f"/api/boards/{self.board.pk}/manage/", "delete").status_code, 200)

    def test_private_board_is_hidden_from_other_users_and_anonymous(self):
        path = f"/api/boards/{self.board.pk}/"
        self.assertEqual(self.client.get(path).status_code, 404)
        self.client.logout()
        self.assertEqual(self.client.get(path).status_code, 404)
        self.login_owner()
        self.assertEqual(self.client.get(path).status_code, 200)

    def test_forged_ownership_and_invalid_fields_fail(self):
        self.login_owner()
        path = f"/api/posts/{self.post.pk}/"
        self.assertEqual(self.send(path, data={"title": "New", "user_id": self.other.pk}).status_code, 400)
        self.assertEqual(self.send(path, data={"image": "unsafe.png"}).status_code, 400)
        self.assertEqual(self.send(path, data={"title": " "}).status_code, 400)
        self.assertEqual(self.send(f"/api/boards/{self.board.pk}/manage/", data={"is_private": "false"}).status_code, 400)

    def test_mutations_require_csrf_even_when_authenticated(self):
        self.login_owner()
        response = self.client.patch(f"/api/posts/{self.post.pk}/", json.dumps({"title": "New"}), content_type="application/json")
        self.assertEqual(response.status_code, 403)


class ModelTests(MediaTestCase):
    def setUp(self):
        super().setUp()
        self.user = get_user_model().objects.create_user("blue", "blue@example.com", "Example!Garden945")
        self.post = Post.objects.create(owner=self.user, title="Blue", image=self.image())
        self.board = Board.objects.create(owner=self.user, name="Inspiration")

    def test_duplicate_saves_are_prevented(self):
        SavedPost.objects.create(board=self.board, post=self.post)
        with self.assertRaises(IntegrityError), transaction.atomic():
            SavedPost.objects.create(board=self.board, post=self.post)

    def test_board_name_is_unique_per_owner_case_insensitively(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Board.objects.create(owner=self.user, name="INSPIRATION")

    def test_invalid_foreign_key_is_prevented(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Comment.objects.create(author=self.user, post_id=999999, text="Invalid")
            transaction.get_connection().check_constraints()

    def test_case_insensitive_identity_constraints(self):
        for values in ({"username": "BLUE", "email": "different@example.com"}, {"username": "different", "email": "BLUE@EXAMPLE.COM"}):
            with self.assertRaises(IntegrityError), transaction.atomic():
                get_user_model().objects.create(**values, password="!")

    def test_models_are_registered_in_admin(self):
        for model in (get_user_model(), Profile, Post, Comment, Board, SavedPost):
            self.assertIn(model, admin.site._registry)

    def test_admin_staff_can_load_models(self):
        self.user.is_staff = self.user.is_superuser = True
        self.user.save()
        self.client.force_login(self.user)
        for path in ("/admin/", "/admin/accounts/user/", "/admin/collection/post/", "/admin/collection/board/"):
            self.assertEqual(self.client.get(path).status_code, 200)

    def test_demo_command_is_repeatable_and_uses_unusable_passwords(self):
        with tempfile.TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            call_command("seed_demo", verbosity=0)
            call_command("seed_demo", verbosity=0)
            self.assertEqual(Post.objects.filter(owner__username__startswith="demo_").count(), 6)
            self.assertEqual(Board.objects.filter(owner__username__startswith="demo_").count(), 4)
            self.assertFalse(get_user_model().objects.get(username="demo_blue").has_usable_password())
