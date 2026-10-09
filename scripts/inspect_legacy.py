"""Inspect V1 metadata read-only and prepare an ignored, isolated runtime copy."""
import hashlib
import json
import shutil
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "btrest" / "back"
TARGET = ROOT / ".local" / "legacy-runtime"


def main():
    original = SOURCE / "main.db"
    before = hashlib.sha256(original.read_bytes()).hexdigest()
    TARGET.mkdir(parents=True, exist_ok=True)
    report = {"tables": {}, "media": {}}
    with sqlite3.connect(original.as_uri() + "?mode=ro", uri=True) as source:
        tables = source.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
        for (table,) in tables:
            quoted = '"' + table.replace('"', '""') + '"'
            report["tables"][table] = {
                "columns": [row[1:3] for row in source.execute(f"PRAGMA table_info({quoted})")],
                "rows": source.execute(f"SELECT COUNT(*) FROM {quoted}").fetchone()[0],
                "foreign_keys": len(source.execute(f"PRAGMA foreign_key_list({quoted})").fetchall()),
            }
        if "posts" in report["tables"]:
            urls = source.execute("SELECT url FROM posts").fetchall()
            report["media"]["post_references"] = len(urls)
            report["media"]["missing_post_images"] = sum(
                not any((SOURCE / "images" / f"{url.split('id=')[-1]}.{ext}").is_file()
                        for ext in ("jpg", "png"))
                for (url,) in urls if isinstance(url, str)
            )
        with sqlite3.connect(TARGET / "main.db") as dest:
            source.backup(dest)
    for filename in ("app.py", "byper.py"):
        shutil.copy2(SOURCE / filename, TARGET / filename)
    shutil.copytree(SOURCE / "images", TARGET / "images", dirs_exist_ok=True)
    report["original_unchanged"] = before == hashlib.sha256(original.read_bytes()).hexdigest()
    (TARGET / "inspection.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
