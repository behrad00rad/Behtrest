import hashlib
import json
from pathlib import Path
import sqlite3
import os
import subprocess
import sys
import tempfile
from contextlib import closing
from unittest.mock import patch
from zipfile import ZipFile

from django.test import SimpleTestCase, TestCase, override_settings
from django.db import OperationalError
from django.http import HttpResponse
from django.test.client import RequestFactory
from common.backups import create_backup, verify_backup, restore_backup
from common.middleware import ProxyClientAddress


class OperationsTests(SimpleTestCase):
    def test_production_configuration_fails_closed(self):
        environment = {**os.environ, "DJANGO_SECRET_KEY": "synthetic-production-test-" * 4, "BEHTREST_DOMAIN": "behtrest.example.invalid", "FRONTEND_ORIGIN": "https://behtrest.example.invalid", "EMAIL_HOST": "smtp.example.invalid", "DEFAULT_FROM_EMAIL": "preview@example.invalid"}
        script = "import config.production as s; assert not s.DEBUG; assert s.SESSION_COOKIE_SECURE and s.CSRF_COOKIE_SECURE and s.SECURE_SSL_REDIRECT; assert '*' not in s.ALLOWED_HOSTS"
        backend = Path(__file__).resolve().parents[1]
        result = subprocess.run([sys.executable, "-c", script], cwd=backend, env=environment, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        for changes in ({"DJANGO_SECRET_KEY": "weak"}, {"FRONTEND_ORIGIN": "http://behtrest.example.invalid"}, {"FRONTEND_ORIGIN": "https://other.example.invalid"}, {"BEHTREST_DOMAIN": "*"}, {"EMAIL_HOST": ""}, {"EMAIL_USE_TLS": "1", "EMAIL_USE_SSL": "1"}):
            with self.subTest(changes=changes):
                result = subprocess.run([sys.executable, "-c", script], cwd=backend, env={**environment, **changes}, capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("ImproperlyConfigured", result.stderr)

    def test_proxy_header_is_ignored_without_explicit_trust(self):
        request = RequestFactory().get("/", REMOTE_ADDR="127.0.0.1", HTTP_X_BEHTREST_CLIENT_IP="192.0.2.42")
        ProxyClientAddress(lambda request: HttpResponse())(request)
        self.assertEqual(request.META["REMOTE_ADDR"], "127.0.0.1")

    @override_settings(BEHTREST_TRUST_PROXY=True)
    def test_proxy_address_validation(self):
        middleware = ProxyClientAddress(lambda request: HttpResponse())
        request = RequestFactory().get("/", HTTP_X_BEHTREST_CLIENT_IP="2001:db8::42")
        self.assertEqual(middleware(request).status_code, 200)
        self.assertEqual(request.META["REMOTE_ADDR"], "2001:db8::42")
        request = RequestFactory().get("/", HTTP_X_BEHTREST_CLIENT_IP="192.0.2.42, 127.0.0.1")
        self.assertEqual(middleware(request).status_code, 400)


class BackupTests(SimpleTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="behtrest-backup-test-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.database = self.root / "source.sqlite3"
        self.media = self.root / "media"
        self.media.mkdir()
        (self.media / "pin.webp").write_bytes(b"synthetic media fixture")
        with closing(sqlite3.connect(self.database)) as database:
            database.executescript("""
                CREATE TABLE django_migrations (id INTEGER PRIMARY KEY);
                CREATE TABLE collection_post (image TEXT, thumbnail TEXT);
                CREATE TABLE accounts_profile (avatar TEXT);
                INSERT INTO collection_post VALUES ('pin.webp', '');
            """)
            database.commit()
        self.archive = self.root / "backup.zip"

    def test_round_trip_and_refuses_overwriting_data(self):
        self.assertEqual(create_backup(self.database, self.media, self.archive), 2)
        self.assertEqual(len(verify_backup(self.archive)["files"]), 2)
        target = self.root / "restored"
        (target / "media").mkdir(parents=True)  # Fresh Docker volume's empty media mount.
        restore_backup(self.archive, target)
        self.assertEqual((target / "media/pin.webp").read_bytes(), b"synthetic media fixture")
        with closing(sqlite3.connect(target / "db.sqlite3")) as database:
            self.assertEqual(database.execute("SELECT image FROM collection_post").fetchone()[0], "pin.webp")
        with self.assertRaises(ValueError):
            restore_backup(self.archive, target)
        with self.assertRaises(ValueError):
            create_backup(self.database, self.media, self.archive)

    def test_missing_media_prevents_a_false_success(self):
        (self.media / "pin.webp").unlink()
        with self.assertRaisesRegex(ValueError, "missing"):
            create_backup(self.database, self.media, self.archive)
        self.assertFalse(self.archive.exists())

    def test_private_chat_media_round_trip_and_missing_reference(self):
        private = self.root / "private_media"
        (private / "chat/1").mkdir(parents=True)
        (private / "chat/1/image.webp").write_bytes(b"private synthetic image")
        with closing(sqlite3.connect(self.database)) as database:
            database.execute("CREATE TABLE messaging_attachment (name TEXT)")
            database.execute("INSERT INTO messaging_attachment VALUES ('chat/1/image.webp')")
            database.commit()
        self.assertEqual(create_backup(self.database, self.media, self.archive, private), 3)
        restore_backup(self.archive, self.root / "restored")
        self.assertEqual((self.root / "restored/private_media/chat/1/image.webp").read_bytes(), b"private synthetic image")
        (private / "chat/1/image.webp").unlink()
        with self.assertRaisesRegex(ValueError, "private chat image"):
            create_backup(self.database, self.media, self.root / "missing.zip", private)

    def test_tampering_and_path_traversal_are_rejected(self):
        create_backup(self.database, self.media, self.archive)
        broken = self.root / "broken.zip"
        with ZipFile(self.archive) as source, ZipFile(broken, "w") as destination:
            for name in source.namelist():
                destination.writestr(name, b"changed" if name == "media/pin.webp" else source.read(name))
        with self.assertRaisesRegex(ValueError, "checksum"):
            verify_backup(broken)
        unsafe = self.root / "unsafe.zip"
        manifest = {"format": 1, "files": {"db.sqlite3": hashlib.sha256(b"x").hexdigest(), "media/../../escape": hashlib.sha256(b"x").hexdigest()}}
        with ZipFile(unsafe, "w") as archive:
            archive.writestr("manifest.json", json.dumps(manifest))
            archive.writestr("db.sqlite3", b"x")
            archive.writestr("media/../../escape", b"x")
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            verify_backup(unsafe)


class ReadinessTests(TestCase):
    def test_database_readiness_and_outage(self):
        self.assertEqual(self.client.get("/api/ready/").status_code, 200)
        with patch("common.api.connection.cursor", side_effect=OperationalError("offline")):
            self.assertEqual(self.client.get("/api/ready/").status_code, 503)
