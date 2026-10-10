"""Offline V2 SQLite/media archives, with integrity checks before restore."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sqlite3
import tempfile
from contextlib import closing
from datetime import datetime, timezone
from zipfile import ZipFile, ZIP_DEFLATED


def digest(stream):
    checksum = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b""):
        checksum.update(block)
    return checksum.hexdigest()


def check_database(path, media_names):
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as database:
        if database.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("SQLite integrity check failed.")
        if database.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Database has invalid foreign keys.")
        database.execute("SELECT COUNT(*) FROM django_migrations").fetchone()
        names = [name for pair in database.execute("SELECT image, thumbnail FROM collection_post") for name in pair if name]
        names.extend(row[0] for row in database.execute("SELECT avatar FROM accounts_profile") if row[0])
        if database.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='messaging_attachment'").fetchone():
            private = [row[0] for row in database.execute("SELECT name FROM messaging_attachment")]
            if any("private_media/" + name not in media_names for name in private):
                raise ValueError("A private chat image is missing from the backup.")
        if any("media/" + name not in media_names for name in names):
            raise ValueError("An image referenced by the database is missing from the backup.")


def create_backup(database_path, media_root, output, private_root=None):
    database_path, media_root, output = map(lambda p: Path(p).resolve(), (database_path, media_root, output))
    if not database_path.is_file():
        raise ValueError("V2 database does not exist; refusing to create an empty backup.")
    if output.exists() or not output.parent.is_dir():
        raise ValueError("Choose a new backup filename in an existing directory.")
    if output.is_relative_to(media_root):
        raise ValueError("Backups must be outside the media directory.")
    media = []
    if private_root:
        private_root = Path(private_root).resolve()
        if output.is_relative_to(private_root): raise ValueError("Backups must be outside private media.")
        for path in sorted(private_root.rglob("*")):
            if path.is_symlink(): raise ValueError("Private media symlinks cannot be backed up.")
            if path.is_file(): media.append((path, "private_media/" + path.relative_to(private_root).as_posix()))
    for path in sorted(media_root.rglob("*")):
        if path.is_symlink():
            raise ValueError("Media symlinks cannot be backed up.")
        if path.is_file():
            media.append((path, "media/" + path.relative_to(media_root).as_posix()))
    with tempfile.TemporaryDirectory(prefix="behtrest-backup-") as temporary:
        snapshot = Path(temporary) / "db.sqlite3"
        with closing(sqlite3.connect(database_path.as_uri() + "?mode=ro", uri=True)) as source, closing(sqlite3.connect(snapshot)) as destination:
            source.backup(destination)
        check_database(snapshot, {name for _, name in media})
        entries = [(snapshot, "db.sqlite3"), *media]
        manifest = {"format": 2 if private_root else 1, "created_at": datetime.now(timezone.utc).isoformat(), "files": {}}
        descriptor, partial = tempfile.mkstemp(prefix=".behtrest-", suffix=".partial", dir=output.parent)
        os.close(descriptor)
        try:
            with ZipFile(partial, "w", compression=ZIP_DEFLATED) as archive:
                for path, name in entries:
                    with path.open("rb") as stream:
                        manifest["files"][name] = digest(stream)
                    archive.write(path, name)
                archive.writestr("manifest.json", json.dumps(manifest, indent=2))
            verify_backup(Path(partial))
            os.chmod(partial, 0o600)
            os.link(partial, output)  # Atomic publication; cannot overwrite an existing backup.
        finally:
            Path(partial).unlink(missing_ok=True)
    return len(entries)


def verify_backup(path):
    with ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or "manifest.json" not in names:
            raise ValueError("Duplicate members or missing manifest.")
        if archive.getinfo("manifest.json").file_size > 1024 * 1024:
            raise ValueError("Backup manifest is too large.")
        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("format") not in {1, 2} or not isinstance(manifest.get("files"), dict):
            raise ValueError("Unsupported backup format.")
        if set(names) != {"manifest.json", *manifest["files"]} or "db.sqlite3" not in names:
            raise ValueError("Archive and manifest do not match.")
        for name, checksum in manifest["files"].items():
            parts = PurePosixPath(name).parts
            if PurePosixPath(name).as_posix() != name or "\\" in name or ":" in name or name.startswith("/") or ".." in parts or not (name == "db.sqlite3" or name.startswith("media/") or name.startswith("private_media/")):
                raise ValueError("Unsafe archive member.")
            with archive.open(name) as stream:
                if digest(stream) != checksum:
                    raise ValueError("Backup checksum mismatch.")
        with tempfile.TemporaryDirectory(prefix="behtrest-restore-check-") as temporary:
            snapshot = Path(temporary) / "db.sqlite3"
            with archive.open("db.sqlite3") as source, snapshot.open("wb") as destination:
                import shutil
                shutil.copyfileobj(source, destination)
            check_database(snapshot, set(names))
    return manifest


def restore_backup(path, target):
    """Restore only into a new empty directory, never over a working database."""
    manifest = verify_backup(path)
    target = Path(target).resolve()
    if target.exists() and (not target.is_dir() or any(entry.name not in {"media", "private_media"} or not entry.is_dir() or entry.is_symlink() or any(entry.iterdir()) for entry in target.iterdir())):
        raise ValueError("Restore target must be a new or empty directory.")
    target.mkdir(parents=True, exist_ok=True)
    with ZipFile(path) as archive:
        for name in manifest["files"]:
            output = target / name
            output.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(name) as source, output.open("xb") as destination:
                import shutil
                shutil.copyfileobj(source, destination)
            output.chmod(0o600 if name == "db.sqlite3" or name.startswith("private_media/") else 0o644)
    (target / "media").mkdir(exist_ok=True)
    return len(manifest["files"])
