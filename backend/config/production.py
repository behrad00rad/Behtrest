"""Single-host Docker deployment behind the private Caddy reverse proxy."""
import os
import re
from pathlib import Path
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured
from .settings import *  # noqa: F403

DEBUG = False
if len(SECRET_KEY) < 50 or SECRET_KEY.startswith("django-insecure-"):  # noqa: F405
    raise ImproperlyConfigured("Production needs a random DJANGO_SECRET_KEY of at least 50 characters.")
domain = os.environ.get("BINTREST_DOMAIN", "").strip().lower()
origin = os.environ.get("FRONTEND_ORIGIN", "")
parsed = urlsplit(origin)
if not domain or len(domain) > 253 or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in domain.split(".")):
    raise ImproperlyConfigured("BINTREST_DOMAIN must be a single hostname without a port.")
if parsed.scheme != "https" or parsed.hostname != domain or parsed.path or parsed.query or parsed.fragment or parsed.username:
    raise ImproperlyConfigured("FRONTEND_ORIGIN must be the HTTPS origin for BINTREST_DOMAIN.")
FRONTEND_ORIGIN = origin
ALLOWED_HOSTS = [domain, "localhost", "127.0.0.1"]
CSRF_TRUSTED_ORIGINS = [origin]
DATA_ROOT = Path(os.environ.get("BINTREST_DATA_ROOT", "/data"))
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": DATA_ROOT / "db.sqlite3", "OPTIONS": {"timeout": 20, "transaction_mode": "IMMEDIATE"}}}
MEDIA_ROOT = DATA_ROOT / "media"
PRIVATE_MEDIA_ROOT = DATA_ROOT / "private_media"
CHAT_ALLOWED_ORIGINS = [origin]
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
CHANNEL_LAYERS = {"default": {"BACKEND": "channels_redis.core.RedisChannelLayer", "CONFIG": {"hosts": [REDIS_URL]}}}
CACHES = {"default": {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": REDIS_URL}}
STATIC_ROOT = Path(os.environ.get("BINTREST_STATIC_ROOT", "/static"))
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = True
# Safe only because backend has no published port and Caddy overwrites proxy headers.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False
# This deployment owns one hostname, not every subdomain or a preload commitment.
SILENCED_SYSTEM_CHECKS = ["security.W005", "security.W021"]
SECURE_REFERRER_POLICY = "same-origin"
BINTREST_TRUST_PROXY = True
MIDDLEWARE = ["common.middleware.ProxyClientAddress", *MIDDLEWARE]  # noqa: F405
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "1") == "1"
EMAIL_USE_SSL = os.environ.get("EMAIL_USE_SSL", "0") == "1"
EMAIL_TIMEOUT = 15
if EMAIL_USE_TLS and EMAIL_USE_SSL:
    raise ImproperlyConfigured("Use either SMTP STARTTLS or implicit SSL, not both.")
if not EMAIL_HOST or "localhost" in DEFAULT_FROM_EMAIL:  # noqa: F405
    raise ImproperlyConfigured("Configure EMAIL_HOST and DEFAULT_FROM_EMAIL for production reset delivery.")
LOGGING = {
    "version": 1, "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "{levelname} {name}: {message}", "style": "{"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": "WARNING"},
    # No request bodies, credentials, tokens, or access URLs in application logs.
    "loggers": {"django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False}},
}
