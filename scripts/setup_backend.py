"""Create a development environment file without exposing or overwriting secrets."""
import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[1]
target = root / "backend" / ".env"
if target.exists():
    print("backend/.env already exists; left unchanged.")
else:
    text = (target.parent / ".env.example").read_text(encoding="utf-8")
    target.write_text(text.replace("DJANGO_SECRET_KEY=", "DJANGO_SECRET_KEY=" + secrets.token_urlsafe(64), 1), encoding="utf-8")
    print("Created backend/.env with a fresh development secret.")
