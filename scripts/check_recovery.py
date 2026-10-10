"""Exercise V2 migrations → synthetic data → offline backup → verified restore."""
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
from contextlib import closing


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
    with tempfile.TemporaryDirectory(prefix="behtrest-recovery-drill-") as directory:
        root = Path(directory)
        os.environ["DJANGO_SETTINGS_MODULE"] = "config.e2e_settings"
        os.environ["BEHTREST_E2E_DIR"] = directory
        os.environ["DJANGO_SECRET_KEY"] = secrets.token_urlsafe(64)
        os.environ["DJANGO_DEBUG"] = "1"
        import django
        from django.core.management import call_command
        from django.db import connections

        django.setup()
        try:
            call_command("migrate", interactive=False, verbosity=0)
            call_command("seed_demo")
            from django.contrib.auth import get_user_model
            from common.media import prepare_image
            from django.core.files.uploadedfile import SimpleUploadedFile
            from collection.image_moderation import enqueue
            from collection.models import Post
            fixture = Path(__file__).resolve().parents[1] / 'frontend' / 'e2e' / 'fixtures' / 'blue.png'
            post = Post.objects.order_by('id').first()
            scan = enqueue(post.owner, prepare_image(SimpleUploadedFile('fixture.png', fixture.read_bytes())), profile=post.owner.profile)
            archive = root / "backup.zip"
            restored = root / "restored"
            call_command("backup_v2", str(archive), offline=True)
            call_command("verify_backup", str(archive), restore_to=restored)
            with closing(sqlite3.connect(restored / "db.sqlite3")) as database:
                assert database.execute("SELECT COUNT(*) FROM collection_post").fetchone()[0] == 24
                assert database.execute("SELECT COUNT(*) FROM collection_board").fetchone()[0] == 4
                assert database.execute("SELECT COUNT(*) FROM collection_savedpost").fetchone()[0] == 24
                assert database.execute("SELECT COUNT(*) FROM collection_imagescan WHERE status='pending'").fetchone()[0] == 1
            assert len(list((restored / "media").rglob("*.webp"))) == 48
            assert (restored / 'private_media' / scan.original).is_file()
            print("Fresh migrations, 24 synthetic pins, 4 boards, 24 saves, and 48 media files recovered successfully.")
        finally:
            connections.close_all()
