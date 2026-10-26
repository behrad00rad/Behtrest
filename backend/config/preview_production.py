"""HTTPS guest demo: production security and its own Compose volumes/project."""
from .production import *  # noqa: F403

PREVIEW_MODE = True
PREVIEW_CURATED = True
PREVIEW_CURATED_ROOT = BASE_DIR / 'preview'  # noqa: F405
SESSION_COOKIE_NAME = 'behtrest_preview_session'
CSRF_COOKIE_NAME = 'behtrest_preview_csrf'
# Secure cookies and CSRF remain active; signup matches the local guest demo.
AUTH_PASSWORD_VALIDATORS = [{'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 6}}]
