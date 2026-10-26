#!/bin/bash
set -euo pipefail
exec 9>/run/behtrest-maintenance.lock
flock -n 9 || exit 0
set -a
. /etc/behtrest/preview.env
set +a
cd /srv/behtrest/current/backend
trap 'systemctl start behtrest-api behtrest-moderation' EXIT
systemctl stop behtrest-api behtrest-moderation
target="/var/lib/behtrest/backups/daily-$(date -u +%Y%m%dT%H%M%SZ).zip"
runuser -u behtrest --preserve-environment -- /srv/behtrest/venv/bin/python manage.py backup_v2 "$target" --offline
find /var/lib/behtrest/backups -maxdepth 1 -type f -name 'daily-*.zip' -mtime +7 -delete
