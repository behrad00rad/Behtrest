import os
from pathlib import Path
import subprocess
import sys

from django.test import SimpleTestCase


class HostedPreviewConfigurationTests(SimpleTestCase):
    def check_settings(self, module):
        env = {**os.environ, 'DJANGO_SETTINGS_MODULE': module,
               'DJANGO_SECRET_KEY': 'configuration-test-only-' + 'x' * 60,
               'BEHTREST_DOMAIN': 'preview.example.com',
               'FRONTEND_ORIGIN': 'https://preview.example.com',
               'EMAIL_HOST': '', 'DEFAULT_FROM_EMAIL': 'demo@example.com'}
        return subprocess.run([sys.executable, '-c',
            'from django.conf import settings; '
            'assert not settings.DEBUG; '
            'assert settings.SESSION_COOKIE_SECURE and settings.CSRF_COOKIE_SECURE; '
            'assert settings.PREVIEW_MODE; '
            'assert settings.EMAIL_BACKEND == "django.core.mail.backends.dummy.EmailBackend"; '
            'assert settings.AUTH_PASSWORD_VALIDATORS[0]["OPTIONS"]["min_length"] == 6'],
            cwd=Path(__file__).resolve().parents[1], env=env,
            capture_output=True, text=True)

    def test_hosted_preview_has_secure_cookies_and_needs_no_smtp(self):
        result = self.check_settings('config.preview_production')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_normal_production_still_requires_smtp(self):
        result = self.check_settings('config.production')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Configure EMAIL_HOST and DEFAULT_FROM_EMAIL', result.stderr)
