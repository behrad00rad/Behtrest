# Portable deployment candidate

Prepared October 9, 2026. Target: a small Linux server running Docker Engine and Compose, one hostname, one Django service, SQLite, and local persistent media. The user selected a portable Docker setup. No server, DNS record, account, or public site has been provisioned. Legacy import is task 10 and remains deferred.

Local preflight validates Django production settings and Compose syntax. The local Docker engine is unavailable, so container builds and HTTPS smoke checks must pass in the supplied CI job or on a Docker host before publishing this candidate.

## Architecture and storage

```text
Browser → HTTPS Caddy → /api and /admin → Gunicorn → Django → SQLite
                      → /media       → normalized image files
                      → /static      → collected Django/admin files
                      → other paths  → built React SPA
```

Only Caddy publishes ports. Django runs as UID/GID 10001 with a read-only application filesystem and a private port. Vite is used only to build the frontend; the production container serves its compiled files.

Compose volumes under the default project name `bintrest`:

| Volume | Purpose |
| --- | --- |
| `bintrest_data` | `/data/db.sqlite3` and `/data/media`; Caddy reads media, Django writes |
| `bintrest_static` | Collected admin assets; rebuilt with each release |
| `bintrest_backups` | Verified database/media ZIP archives; also copy them off the server |
| `bintrest_caddy_data` | TLS certificate state |
| `bintrest_caddy_config` | Caddy runtime configuration |

SQLite and filesystem media suit this initial single-host target. Use one Gunicorn worker with four threads. Watch write contention, disk growth, and latency; a larger deployment should introduce PostgreSQL and object storage through a separate migration. Do not run multiple hosts against this SQLite file or place it on a network filesystem.

## Configure and start

On the Linux host, install Docker Engine/Compose from the official vendor instructions. Allow inbound TCP 80/443; restrict SSH to your administrative access. Point the intended domain's DNS records at that server, including correct IPv6 routing if an AAAA record exists. Caddy obtains and renews HTTPS certificates automatically for the configured public hostname.

From the repository root, create a separate production environment:

```sh
python3 scripts/setup_deploy.py --domain bintrest.example.com --email-host smtp.example.com --from-email 'Bintrest <hello@example.com>'
```

Replace the example domain/sender with yours, then edit ignored `deploy/.env` to set SMTP credentials. The script generates a fresh random secret and refuses to overwrite an existing file. Keep this file outside Git and back it up separately with restricted access. Never use the development secret in production.

| Setting | Purpose |
| --- | --- |
| `BINTREST_DOMAIN` | Single hostname, without scheme, path, or port |
| `FRONTEND_ORIGIN` | Matching HTTPS origin used for reset links and CSRF |
| `DJANGO_SECRET_KEY` | Random secret of at least 50 characters |
| `EMAIL_HOST`, `EMAIL_PORT` | SMTP delivery host; port 587 by default |
| `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | SMTP credentials |
| `EMAIL_USE_TLS`, `EMAIL_USE_SSL` | STARTTLS or implicit SSL; never both |
| `DEFAULT_FROM_EMAIL` | Sender verified by your email provider |

Quote SMTP credentials in `.env`; use single quotes for literal values containing `$` or `#`. Configure SPF/DKIM/DMARC with the chosen email provider and test delivery to an address you control. Production refuses console email and localhost senders; it does not prove SMTP reachability at startup.

From `deploy/`:

```sh
docker compose build
docker compose run --rm backend python manage.py check --deploy --fail-level WARNING
docker compose run --rm backend python manage.py migrate --noinput
docker compose run --rm backend python manage.py collectstatic --noinput
docker compose up -d --wait
docker compose exec backend python manage.py createsuperuser
```

Visit your HTTPS domain and register a new V2 account. Check `/admin/`, request a password reset, and verify the email's HTTPS link. Synthetic demo data is optional and is not imported automatically. Public publishing still requires a deployment request.

## Security and routing

Production forces HTTPS and uses secure HTTP-only session/CSRF cookies, explicit allowed hosts, a matching trusted origin, MIME sniffing protection, frame denial, a referrer policy, and a frontend content security policy. Django and Caddy set one-year HSTS for the selected hostname. Subdomains and preload are deliberately excluded; Django's `security.W005` and `security.W021` checks are silenced with an explanatory comment because this configuration does not claim control of other hostnames or make a preload commitment.

The backend's proxy headers are trusted only within this private Docker topology. Caddy overwrites `X-Forwarded-Proto` and `X-Bintrest-Client-IP`; validated client IPs keep API rate limits separate per client. Never publish the Django port, accept this header directly from the internet, or put another proxy/CDN in front without revisiting this trust boundary. Django admin login has a separate permission system; add appropriate edge throttling if the admin is exposed broadly.

Uploads are re-encoded as still WebP files; both services limit request sizes. Caddy serves images as files and never executes uploads. Private boards hide collections, while pins and their media remain public. Source links open in a separate tab without opener access. Missing API routes return JSON errors rather than the SPA; deep frontend links use the SPA fallback.

## Backups and recovery

Initial recovery target: daily backups (up to 24 hours of data loss), plus a backup before each upgrade. Keep seven daily and four weekly copies, encrypted off-server. A ZIP is not encrypted; these archives contain account hashes, profile information, and images. Keep permissions restricted. A volume on the same server is not a disaster-recovery copy.

Stop writers to capture a consistent database/media pair. In `deploy/`, choose a new filename:

```sh
docker compose stop web backend
docker compose run --rm --no-deps backend python manage.py backup_v2 /backups/bintrest-2026-10-09.zip --offline
docker compose run --rm --no-deps backend python manage.py verify_backup /backups/bintrest-2026-10-09.zip
docker compose up -d --wait
docker compose cp backend:/backups/bintrest-2026-10-09.zip /srv/secure-backups/bintrest-2026-10-09.zip
chmod 600 /srv/secure-backups/bintrest-2026-10-09.zip
```

Create `/srv/secure-backups` with restricted permissions first. Record the release commit alongside each archive and transfer an encrypted copy to your backup destination. Check each command's exit status; if a backup fails, restart the original services and investigate before an upgrade. `--offline` acknowledges that writers are stopped; the command cannot detect services running elsewhere.

The backup uses SQLite's snapshot API, then validates database integrity, foreign keys, media references, and per-file SHA-256 checksums. It rejects missing referenced media and never overwrites an existing archive. Verification does not mutate the source database. Secrets and TLS state are separate backups.

`python3 scripts/check_recovery.py` runs a complete disposable recovery drill from the repository root: fresh migrations, synthetic seeding, backup, verification, restore, and restored record/media counts. It does not use either normal database.

Test restore at least monthly and before relying on the first production backup. On the same host, use separate fresh volumes and the original backup volume:

```sh
docker compose -p bintrest-restore run --rm --no-deps -v bintrest_backups:/restore-input:ro backend python manage.py verify_backup /restore-input/bintrest-2026-10-09.zip --restore-to /data
```

This checks and restores into the new `bintrest-restore_data` volume. Restore refuses existing data; a fresh volume with an empty `media/` directory is allowed. Traversal names, duplicate members, and changed checksums are rejected. It never restores over the live database.

For a full recovery drill, run the matching Git revision on a separate hostname or loopback ports with a separate environment file (`BINTREST_ENV_FILE`), collect static assets, start that project, then verify login, images, comments, and boards. Inspect restored counts without exposing personal records. Do not start a second project with the production ports/domain or copy a backup into an actively written volume. Adopt the verified restored volume only during an explicit cutover with the original services stopped. A rollback must restore the matching database/media backup if migrations changed the schema; checking out older source alone is insufficient.

## Operations and upgrades

- `/api/health/` is process liveness; `/api/ready/` verifies database access and migrations-table availability and returns 503 on a database outage. Docker uses readiness; external monitoring should also fetch the HTTPS frontend. Neither probe proves email delivery, free disk space, or every migration's schema compatibility.
- Inspect `docker compose ps` and `docker compose logs --tail 100 backend web` for startup/errors. Docker log files rotate at 10 MB with three files per service. Request bodies, passwords, and reset links are not access-logged. Add monitoring for disk space, backup age, 5xx responses, and certificate renewal.
- Run `docker compose exec backend python manage.py cleanup_media` daily for failed file deletions, and `cleanup_rate_limits` and `clearsessions` daily for expired records. Schedule these through your host's normal operations tooling; no machine schedule is installed by this repository.
- Before upgrading: confirm CI is green, record the current commit/image IDs, take an offline verified backup, stop services, checkout the reviewed release, rebuild, run production checks/migrations/collectstatic, then start with `--wait` and perform the main journey. Keep the previous release and backup until verification completes.

## Local container verification

The CI `containers` job builds both images, runs production checks/migrations/collectstatic, starts an isolated stack on loopback ports 8080/8443, and checks HTTPS readiness, SPA routing, static assets, secure CSRF cookies, and JSON errors. It uses a synthetic SMTP hostname and sends no mail. Caddy's localhost certificate is accepted only by the CI smoke probe; public deployment must use a valid certificate.

To reproduce on a disposable Docker host, run `python3 scripts/prepare_container_smoke.py` in a clean checkout, then the container job's commands in `.github/workflows/verify.yml`. That script refuses to overwrite `deploy/.env`. Do not use its synthetic environment for public hosting.

References: [Django deployment checklist](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/), [Django proxy HTTPS settings](https://docs.djangoproject.com/en/5.2/ref/settings/#secure-proxy-ssl-header), [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).
