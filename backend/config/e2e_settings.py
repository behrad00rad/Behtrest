"""Only the browser-test launcher supplies this disposable data directory."""
import os
from pathlib import Path

from .settings import *  # noqa: F403

TEST_ROOT = Path(os.environ["BINTREST_E2E_DIR"])
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": TEST_ROOT / "test.sqlite3", "OPTIONS": {"timeout": 20, "transaction_mode": "IMMEDIATE"}}}
MEDIA_ROOT = TEST_ROOT / "media"
PRIVATE_MEDIA_ROOT = TEST_ROOT / "private_media"
CHAT_ALLOWED_ORIGINS = ["http://127.0.0.1:5174"]
DEBUG = True
API_RATE_LIMITS_ENABLED = False
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
FRONTEND_ORIGIN = "http://127.0.0.1:5174"
CSRF_TRUSTED_ORIGINS = [FRONTEND_ORIGIN]
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
