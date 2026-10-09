"""Disposable CI-only environment: loopback ports and synthetic configuration."""
from pathlib import Path
import secrets

target = Path(__file__).resolve().parents[1] / "deploy" / ".env"
with target.open("x", encoding="utf-8") as stream:
    stream.write(f'''BINTREST_DOMAIN=localhost
FRONTEND_ORIGIN=https://localhost:8443
DJANGO_SECRET_KEY={secrets.token_urlsafe(64)}
EMAIL_HOST=smtp.example.invalid
DEFAULT_FROM_EMAIL=Bintrest <preview@example.invalid>
BINTREST_BIND_ADDRESS=127.0.0.1
BINTREST_HTTP_PORT=8080
BINTREST_HTTPS_PORT=8443
''')
