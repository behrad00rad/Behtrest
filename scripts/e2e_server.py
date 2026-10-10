"""Launch an isolated development API; never reuse the normal preview data."""
import os
from pathlib import Path
import secrets
import signal
import sys
import tempfile
import subprocess


def stop(signum, frame):
    raise KeyboardInterrupt


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, stop)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
    with tempfile.TemporaryDirectory(prefix="behtrest-e2e-") as directory:
        os.environ["BEHTREST_E2E_DIR"] = directory
        os.environ["DJANGO_SETTINGS_MODULE"] = "config.e2e_settings"
        os.environ["DJANGO_SECRET_KEY"] = secrets.token_urlsafe(64)
        os.environ["DJANGO_DEBUG"] = "1"
        import django
        from django.core.management import call_command

        django.setup()
        call_command("migrate", interactive=False, verbosity=0)
        call_command("seed_demo")
        # Only this isolated, temporary test database gets a moderator account.
        from django.contrib.auth import get_user_model
        get_user_model().objects.create_superuser("e2e_moderator", "moderator@example.invalid", "Moderation!TestGarden29")
        worker = None
        if os.environ.get('BEHTREST_E2E_MODERATE') == '1':
            worker = subprocess.Popen([sys.executable, str(Path(__file__).resolve().parents[1] / 'backend' / 'manage.py'), 'moderate_images'])
        try:
            import uvicorn
            uvicorn.run("config.asgi:application", host="127.0.0.1", port=8001, access_log=False)
        except KeyboardInterrupt:
            pass
        finally:
            if worker:
                worker.terminate()
                worker.wait(timeout=15)
            from django.db import connections
            connections.close_all()
