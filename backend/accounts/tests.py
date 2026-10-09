import json
import re

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import Client, TestCase, override_settings

from .models import Profile, RateLimitBucket

PASSWORD = "Cerulean!Garden947"


@override_settings(API_RATE_LIMITS_ENABLED=False)
class AccountTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.token = self.client.get("/api/auth/session/").json()["data"]["csrfToken"]

    def send(self, path, data, client=None, token=None, method="post"):
        return getattr(client or self.client, method)(path, json.dumps(data), content_type="application/json", HTTP_X_CSRFTOKEN=token or self.token)

    def register(self, **overrides):
        data = {"username": "BlueStudio", "email": "Blue@Example.com", "password1": PASSWORD, "password2": PASSWORD}
        response = self.send("/api/auth/register/", data | overrides)
        if response.status_code == 201:
            self.token = response.json()["data"]["csrfToken"]
        return response

    def test_registration_creates_profile_hashes_password_and_rotates_session(self):
        old_csrf = self.token
        response = self.register()
        self.assertEqual(response.status_code, 201, response.content)
        user = get_user_model().objects.get(username="bluestudio")
        self.assertEqual(user.email, "blue@example.com")
        self.assertTrue(user.check_password(PASSWORD))
        self.assertNotEqual(user.password, PASSWORD)
        self.assertTrue(Profile.objects.filter(user=user).exists())
        self.assertNotEqual(old_csrf, self.token)
        self.assertEqual(self.client.get("/api/auth/session/").json()["data"]["user"]["id"], user.pk)
        self.assertTrue(self.client.cookies["sessionid"]["httponly"])
        self.assertEqual(self.client.cookies["sessionid"]["samesite"], "Lax")

    def test_registration_requires_csrf(self):
        response = self.client.post("/api/auth/register/", {}, content_type="application/json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"]["code"], "csrf_failed")
        self.assertFalse(get_user_model().objects.exists())

    def test_duplicate_username_and_email_are_case_insensitive(self):
        self.register()
        response = self.register(username="BLUESTUDIO", email="other@example.com")
        self.assertEqual(response.status_code, 400)
        self.assertIn("username", response.json()["error"]["fields"])
        response = self.register(username="other", email="BLUE@EXAMPLE.COM")
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json()["error"]["fields"])
        self.assertEqual(get_user_model().objects.count(), 1)

    def test_weak_password_mismatch_and_missing_email_are_rejected(self):
        for values in ({"password1": "123", "password2": "123"}, {"password2": "different"}, {"email": ""}):
            response = self.register(**values)
            self.assertEqual(response.status_code, 400)
        self.assertFalse(get_user_model().objects.exists())

    def test_password_size_is_bounded(self):
        response = self.register(password1="x" * 1025, password2="x" * 1025)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(get_user_model().objects.exists())

    def test_login_and_logout_have_server_managed_identity(self):
        user = get_user_model().objects.create_user("blue", "blue@example.com", PASSWORD)
        self.client.cookies["auth"] = "1"
        self.client.cookies["user_id"] = str(user.pk)
        self.assertIsNone(self.client.get("/api/auth/session/").json()["data"]["user"])
        bad = self.send("/api/auth/login/", {"username": "blue", "password": "wrong"})
        self.assertEqual(bad.status_code, 401)
        response = self.send("/api/auth/login/", {"username": "BLUE", "password": PASSWORD})
        self.assertEqual(response.status_code, 200)
        self.token = response.json()["data"]["csrfToken"]
        logout = self.send("/api/auth/logout/", {})
        self.assertEqual(logout.status_code, 200)
        self.assertIsNone(self.client.get("/api/auth/session/").json()["data"]["user"])

    def test_inactive_account_cannot_login(self):
        get_user_model().objects.create_user("blue", "blue@example.com", PASSWORD, is_active=False)
        self.assertEqual(self.send("/api/auth/login/", {"username": "blue", "password": PASSWORD}).status_code, 401)

    def test_profile_requires_session_and_rejects_forged_owner(self):
        self.assertEqual(self.send("/api/auth/profile/", {"bio": "Hello"}, method="patch").status_code, 401)
        self.register()
        response = self.send("/api/auth/profile/", {"user_id": 999, "bio": "Hello"}, method="patch")
        self.assertEqual(response.status_code, 400)
        response = self.send("/api/auth/profile/", {"bio": "Hello"}, method="patch")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["user"]["profile"]["bio"], "Hello")

    def test_json_and_http_method_errors(self):
        response = self.client.post("/api/auth/login/", "broken", content_type="application/json", HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(response.json()["error"]["code"], "invalid_json")
        self.assertEqual(self.send("/api/auth/login/", []).status_code, 400)
        self.assertEqual(self.send("/api/auth/login/", {"username": []}).status_code, 400)
        self.assertEqual(self.client.get("/api/auth/login/").status_code, 405)

    def test_health_and_session_envelopes(self):
        self.assertEqual(self.client.get("/api/health/").json()["data"]["status"], "ok")
        response = self.client.get("/api/auth/session/")
        self.assertIn("no-store", response["Cache-Control"])
        self.assertTrue(self.client.cookies["csrftoken"]["httponly"])

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_reset_is_generic_one_use_and_invalidates_existing_sessions(self):
        self.register()
        user = get_user_model().objects.get(username="bluestudio")
        other = Client(enforce_csrf_checks=True)
        other.force_login(user)
        response = self.send("/api/auth/password-reset/", {"email": user.email})
        unknown = self.send("/api/auth/password-reset/", {"email": "unknown@example.com"})
        self.assertEqual(response.json(), unknown.json())
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("http://localhost:5173/reset-password/", mail.outbox[0].body)
        uid, token = re.search(r"/reset-password/([^/\s]+)/([^\s]+)", mail.outbox[0].body).groups()
        values = {"uid": uid, "token": token, "new_password1": "Another!BlueGarden857", "new_password2": "Another!BlueGarden857"}
        confirmed = self.send("/api/auth/password-reset/confirm/", values)
        self.assertEqual(confirmed.status_code, 200, confirmed.content)
        self.token = confirmed.json()["data"]["csrfToken"]
        user.refresh_from_db()
        self.assertTrue(user.check_password(values["new_password1"]))
        self.assertIsNone(other.get("/api/auth/session/").json()["data"]["user"])
        self.assertIsNone(self.client.get("/api/auth/session/").json()["data"]["user"])
        self.assertEqual(self.send("/api/auth/password-reset/confirm/", values).status_code, 400)

    def test_invalid_reset_tokens_are_handled(self):
        for values in ({}, {"uid": [], "token": {}}, {"uid": "%%%", "token": "bad"}, {"uid": "MQ", "token": "x" * 200}):
            self.assertEqual(self.send("/api/auth/password-reset/confirm/", values).status_code, 400)


class RateLimitTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.token = self.client.get("/api/auth/session/").json()["data"]["csrfToken"]

    def attempt(self, username="nonexistent", ip="127.0.0.1"):
        return self.client.post("/api/auth/login/", json.dumps({"username": username, "password": PASSWORD}), content_type="application/json", HTTP_X_CSRFTOKEN=self.token, REMOTE_ADDR=ip)

    def test_ip_throttle_survives_new_sessions_and_ignores_spoofed_forwarding(self):
        for index in range(10):
            self.assertEqual(self.attempt(f"missing{index}").status_code, 401)
        self.client = Client(enforce_csrf_checks=True)
        self.token = self.client.get("/api/auth/session/").json()["data"]["csrfToken"]
        response = self.attempt("another")
        self.assertEqual(response.status_code, 429)
        self.assertGreater(int(response["Retry-After"]), 0)
        self.assertEqual(response.json()["error"]["code"], "rate_limited")
        self.assertFalse(any("127.0.0.1" in value for value in RateLimitBucket.objects.values_list("key", flat=True)))

    def test_account_throttle_survives_changing_ip(self):
        for index in range(10):
            self.assertEqual(self.attempt("SameAccount", f"192.0.2.{index}").status_code, 401)
        self.assertEqual(self.attempt("SAMEACCOUNT", "192.0.2.100").status_code, 429)

    def test_write_throttle(self):
        user = get_user_model().objects.create_user("blue", "blue@example.com", PASSWORD)
        self.client.force_login(user)
        self.token = self.client.get("/api/auth/session/").json()["data"]["csrfToken"]
        for index in range(30):
            response = self.client.patch("/api/auth/profile/", json.dumps({"bio": f"Update {index}"}), content_type="application/json", HTTP_X_CSRFTOKEN=self.token)
            self.assertEqual(response.status_code, 200)
        response = self.client.patch("/api/auth/profile/", json.dumps({"bio": "Too many"}), content_type="application/json", HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(response.status_code, 429)
