import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
# Existing installations may still use the former environment prefix.
for env_name, env_value in list(os.environ.items()):
    if env_name.startswith("BINTREST_"):
        os.environ.setdefault("BEHTREST_" + env_name[len("BINTREST_"):], env_value)
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    raise ImproperlyConfigured("Run python scripts/setup_backend.py to create backend/.env first.")
DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173").rstrip("/")
CSRF_TRUSTED_ORIGINS = [FRONTEND_ORIGIN]
INSTALLED_APPS = [
    "django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes",
    "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles",
    "accounts.apps.AccountsConfig", "collection.apps.CollectionConfig", "messaging.apps.MessagingConfig", "channels",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "common.media.UploadLimitMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [BASE_DIR / "templates"], "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request", "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
CHAT_ALLOWED_ORIGINS = [FRONTEND_ORIGIN, "http://127.0.0.1:5173", "http://localhost:5173"] if DEBUG else [FRONTEND_ORIGIN]
PRIVATE_MEDIA_ROOT = BASE_DIR / "private_media"
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3", "OPTIONS": {"timeout": 20, "transaction_mode": "IMMEDIATE"}}}
AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "Behtrest <hello@localhost>")
PASSWORD_RESET_TIMEOUT = 3600
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_HTTPONLY = True
CSRF_FAILURE_VIEW = "common.api.csrf_failure"
SESSION_COOKIE_AGE = 60 * 60 * 24 * 7
DATA_UPLOAD_MAX_MEMORY_SIZE = 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FILES = 1
DATA_UPLOAD_MAX_NUMBER_FIELDS = 20
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
# Rate buckets are persisted in SQLite, shared by all Django workers.
# REMOTE_ADDR is authoritative; forwarding headers are deliberately not trusted.
API_RATE_LIMITS_ENABLED = True
# Only config.preview_settings enables passwordless guest access.
PREVIEW_MODE = False
IMAGE_MODERATION_ENABLED = os.environ.get("BEHTREST_IMAGE_MODERATION", "0") == "1"
IMAGE_UPLOADS_PER_DAY = int(os.environ.get("BEHTREST_IMAGE_UPLOADS_PER_DAY", "100"))
IMAGE_PENDING_PER_USER = int(os.environ.get("BEHTREST_IMAGE_PENDING_PER_USER", "20"))
IMAGE_QUARANTINE_USER_BYTES = int(os.environ.get("BEHTREST_IMAGE_QUARANTINE_USER_MB", "256")) * 1024 * 1024
IMAGE_QUARANTINE_TOTAL_BYTES = int(os.environ.get("BEHTREST_IMAGE_QUARANTINE_TOTAL_MB", "2048")) * 1024 * 1024
if min(IMAGE_UPLOADS_PER_DAY, IMAGE_PENDING_PER_USER, IMAGE_QUARANTINE_USER_BYTES, IMAGE_QUARANTINE_TOTAL_BYTES) < 1:
    raise ValueError("Image quota limits must be positive.")
IMAGE_MODERATION_MODEL = os.environ.get("BEHTREST_IMAGE_MODEL", str(BASE_DIR / "models" / "nudenet-320.onnx"))
IMAGE_MODERATION_REVIEW = float(os.environ.get("BEHTREST_IMAGE_REVIEW", "0.65"))
IMAGE_MODERATION_REJECT = float(os.environ.get("BEHTREST_IMAGE_REJECT", "0.75"))
if not 0 <= IMAGE_MODERATION_REVIEW < IMAGE_MODERATION_REJECT <= 1:
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured('Image moderation thresholds must satisfy 0 <= review < reject <= 1.')

FRONTEND_DIST = Path(os.environ.get('BEHTREST_FRONTEND_DIST', BASE_DIR.parent / 'frontend' / 'dist'))
