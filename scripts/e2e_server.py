"""Launch an isolated development API; never reuse the normal preview data."""
import os
from pathlib import Path
import secrets
import signal
import sys
import tempfile


def stop(signum, frame):
    raise KeyboardInterrupt


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, stop)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
    with tempfile.TemporaryDirectory(prefix="bintrest-e2e-") as directory:
        os.environ["BINTREST_E2E_DIR"] = directory
        os.environ["DJANGO_SETTINGS_MODULE"] = "config.e2e_settings"
        os.environ["DJANGO_SECRET_KEY"] = secrets.token_urlsafe(64)
        os.environ["DJANGO_DEBUG"] = "1"
        import django
        from django.core.management import call_command

        django.setup()
        call_command("migrate", interactive=False, verbosity=0)
        call_command("seed_demo")
        try:
            call_command("runserver", "127.0.0.1:8001", use_reloader=False)
        except KeyboardInterrupt:
            pass
