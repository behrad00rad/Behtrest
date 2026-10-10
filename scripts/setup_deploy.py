"""Create a private production environment file; never overwrite existing secrets."""
import argparse
from pathlib import Path
import secrets
import re


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--domain", required=True)
    parser.add_argument("--email-host", required=True)
    parser.add_argument("--from-email", required=True)
    options = parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z0-9.-]+", options.domain) or not re.fullmatch(r"[a-zA-Z0-9.-]+", options.email_host):
        parser.error("Use hostnames without ports, paths, or whitespace.")
    if any(character in options.from_email for character in '\r\n"$'):
        parser.error("Invalid sender email.")
    target = Path(__file__).resolve().parents[1] / "deploy" / ".env"
    content = f'''BEHTREST_DOMAIN={options.domain}
FRONTEND_ORIGIN=https://{options.domain}
DJANGO_SECRET_KEY={secrets.token_urlsafe(64)}
EMAIL_HOST={options.email_host}
EMAIL_PORT=587
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EMAIL_USE_TLS=1
EMAIL_USE_SSL=0
DEFAULT_FROM_EMAIL="{options.from_email}"
'''
    try:
        with target.open("x", encoding="utf-8") as stream:
            stream.write(content)
        target.chmod(0o600)
    except FileExistsError:
        parser.error("deploy/.env already exists; edit it directly to preserve its secret.")
    print("Created deploy/.env. Set your SMTP credentials before deployment.")


if __name__ == "__main__":
    main()
