#!/bin/bash
set -euo pipefail
exec 9>/run/behtrest-maintenance.lock
flock -n 9 || exit 0
set -a
. /etc/behtrest/preview.env
set +a
cd /srv/behtrest/current/backend
for command in cleanup_image_scans cleanup_media chat_cleanup; do
    runuser -u behtrest --preserve-environment -- /srv/behtrest/venv/bin/python manage.py "$command"
done
