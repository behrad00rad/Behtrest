# Hosted preview and resource budget

The isolated demo now uses 18 site-owner-supplied moodboard images in `preview/`. The JSON catalog contains authored titles, descriptions, alt text and tags. Existing normalization retains aspect ratios, produces WebP thumbnails and removes metadata. Sample downloads are disabled. Source links identify the supplied Pinterest board; original creators and reuse rights are not verified. Confirm publication rights before public hosting.

Seeding is repeatable and refuses normal settings. Only exact legacy catalog sources belonging to verified fictional accounts are replaced; user uploads remain untouched. The local launcher needs no photo download anymore.

## Hosted setup

Copy `deploy/.env.preview.example` to ignored `deploy/.env.preview`. Set the actual domain, HTTPS origin, SMTP credentials and a fresh random DJANGO_SECRET_KEY. Install the pinned model with `python scripts/setup_image_model.py` before building. Configure DNS and allow 80/443. Never reuse production volumes or secrets.

From `deploy/`, set `BEHTREST_ENV_FILE=.env.preview` in the shell. Use this prefix for every operation, including backup/restore:

```sh
docker compose -p behtrest-preview --env-file .env.preview -f compose.yaml -f compose.preview.yaml ...
```

Replace `...` with these operations in order:

```sh
build
run --rm backend python manage.py check --deploy --fail-level WARNING
run --rm backend python manage.py migrate --noinput
run --rm backend python manage.py collectstatic --noinput
run --rm backend python manage.py seed_preview
up -d --wait
```

Hosted preview inherits production HTTPS, secure cookies, CSRF, SMTP, quotas and moderation. It enables one-click guest entry and username/password signup (minimum six characters), with no email, referral code or password confirmation. Preview skips the first-run interests dialog; interests remain editable in Settings. Separate cookie names and project volumes isolate the demo. Guest contributions are persistent and shared; use fictional information. Passwordless guests have no recovery. No automatic account reset is installed.

Check HTTPS readiness, guest entry, all images, save/boards, Words publication, upload screening, chat and restart persistence. Follow DEPLOYMENT.md backup procedures with this same project prefix; stop both backend and moderation for consistent offline backups. Schedule daily backups and existing cleanup_image_scans, cleanup_media and chat_cleanup commands. Reset only deliberately after backup; never silently delete real accounts.

## Measure resources

Run on the Docker host from the repository root:

```sh
python scripts/measure_deployment.py --project behtrest-preview --samples 6 --interval 10 --output idle-resources.json
python scripts/measure_deployment.py --project behtrest-preview --samples 30 --interval 2 --output active-resources.json
```

During the active run, browse from two sessions, upload several photos and publish a Words card. Reports capture Docker CPU, RAM/limit, network and block I/O. Sampling may miss brief peaks; this is not a capacity guarantee. Keep reports outside Git.

Existing savings: one API worker; one single-thread CPU moderation worker; SQLite; normalized WebP/thumbnails; lazy/offscreen cards; compressed static assets; capped logs. Production serves built assets through Caddy with no Vite or Node process. Build images in CI/off-server to avoid build peaks on the live host. The two Dockerfiles currently build the frontend separately; this is build overhead, not runtime overhead. Redis has a 128 MB data budget and moderation a 1 GB ceiling, not reservation. Reduce limits only after an active benchmark.

October 27 local Windows idle working sets: API approximately 101 MB, moderation 116 MB, preview Vite 266 MB. These are not Linux container or load-test measurements. Docker engine unavailable locally: container benchmarks, HTTPS acceptance and actual deployment remain pending.
