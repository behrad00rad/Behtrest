"""Isolated local playground. Never uses the normal app's database or uploads."""
from .settings import *  # noqa: F403

PREVIEW_MODE = True
PREVIEW_ROOT = BASE_DIR.parent / '.local' / 'preview'  # noqa: F405
PREVIEW_ROOT.mkdir(parents=True, exist_ok=True)
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': PREVIEW_ROOT / 'db.sqlite3', 'OPTIONS': {'timeout': 20, 'transaction_mode': 'IMMEDIATE'}}}
MEDIA_ROOT = PREVIEW_ROOT / 'media'
PRIVATE_MEDIA_ROOT = PREVIEW_ROOT / 'private_media'
DEBUG = True
ALLOWED_HOSTS = ['127.0.0.1', 'localhost', 'testserver']
FRONTEND_ORIGIN = 'http://127.0.0.1:5175'
CSRF_TRUSTED_ORIGINS = [FRONTEND_ORIGIN, 'http://localhost:5175']
CHAT_ALLOWED_ORIGINS = CSRF_TRUSTED_ORIGINS
# Cookie paths cannot separate ports. Separate names protect the normal login.
SESSION_COOKIE_NAME = 'behtrest_preview_session'
CSRF_COOKIE_NAME = 'behtrest_preview_csrf'
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
AUTH_PASSWORD_VALIDATORS = [{'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 6}}]
IMAGE_MODERATION_ENABLED = False
