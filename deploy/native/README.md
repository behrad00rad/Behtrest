# Small VPS production deployment

Live preview: https://behtrest.behrad.xyz (Cloudflare proxied, origin HTTPS). This uses the existing nginx installation and isolated systemd units; Docker, Vite, Node and frontend build tooling are not installed for this app on the server.

## Paths and services

Web Push setup and privacy/delivery details: [WEB-PUSH.md](../../docs/WEB-PUSH.md). The optional `behtrest-push.timer` starts bounded one-shot delivery jobs instead of an additional idle worker. Keep its VAPID private key in `/etc/behtrest`, outside releases; the daily backup pauses push delivery as well as the API and moderation writers.

- `/srv/behtrest/releases/<release>`: root-owned versioned source, precompiled frontend, model and curated images; `current` selects the release.
- `/srv/behtrest/venv`: pinned production Python dependencies, installed from wheels without compilation.
- `/etc/behtrest/preview.env`: root-owned 0640 runtime configuration, readable by the isolated `behtrest` service account; never committed.
- `/var/lib/behtrest`: separate SQLite database, public normalized media, private quarantine, static files and private backups. No local-development database was copied.
- `behtrest-api`: one Uvicorn worker, loopback port 8092, 256 MB memory soft limit / 384 MB hard limit, 60% of one CPU maximum.
- `behtrest-moderation`: one CPU model worker, 256/384 MB, 30% CPU maximum, lower scheduling priority, telemetry disabled.
- Redis: loopback only, logical database 1, 64 MB data budget and 128 MB service memory ceiling. Messages and accounts remain durable in SQLite.

nginx serves built assets/media directly and proxies API, pin metadata and WebSocket routes. `nginx.conf` preserves the existing ACME webroot and dedicated certificate. Only Cloudflare's official edge networks may supply client IPs; direct clients cannot spoof that header. The IP lists were checked against https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6 on October 27, 2026; review when Cloudflare changes them. Keep Cloudflare SSL mode Full (strict).

Hosted-demo signup needs only username and a six-character password, or one-click guest entry. No email delivery/recovery is provided for synthetic demo addresses. Normal production still requires SMTP. Cookie security, CSRF, ownership checks, rate limits and image quarantine remain enabled. This is an isolated public demo, not the production user database.

## Operations

```sh
systemctl status behtrest-api behtrest-moderation
systemctl show behtrest-api behtrest-moderation redis-server -p MemoryCurrent -p MemoryPeak -p CPUUsageNSec -p NRestarts
curl -fsS https://behtrest.behrad.xyz/api/ready/
journalctl -u behtrest-api -u behtrest-moderation --since '10 minutes ago'
```

Build the frontend locally or in CI. Upload a checksummed release archive that excludes credentials, local databases and user/test uploads. Preserve the database/media, validate migrations and production settings, switch only the Behtrest `current` symlink, restart its units and check HTTPS. Do not restart or modify LilCusin. Before an upgrade, create a verified backup; schema rollback may require restoring the matching data, not just selecting old source.

`behtrest-backup.timer` runs daily around 03:00 UTC. It locks maintenance, stops both application writers, creates a verified database/media backup, restarts both services even on failure, and retains approximately seven days of its own `daily-*.zip` files. The app pauses briefly. `behtrest-maintenance.timer` runs cleanup around 03:15 UTC with the same lock. Timers are persistent across reboot. Private backups are under `/var/lib/behtrest/backups`, mode 0700; archives are mode 0600. An encrypted off-server destination is still needed: same-server backups do not cover server loss.

The original hostname placeholder config is backed up in `/var/backups/behtrest/nginx-placeholder.conf`. Reverting it hides the app without deleting data. Never restore another hostname's configuration or delete shared nginx/certificate state.

## Initial acceptance

Verified October 27, 2026: HTTPS readiness; 375/768/1440 browser journeys (hostname mapped to origin locally because system DNS had not propagated); separate public HTTPS readiness through Cloudflare from the VPS; guest and simple signup; secure HTTP-only sessions; loaded curated images; WSS chat handshake; a benign upload quarantined then approved by the real worker. All verification accounts and uploads were removed: 18 curated pins, zero other pins remained. Local Words/download test posts were also removed without deleting other local uploads. Backup creation and maintenance were exercised; all Behtrest and LilCusin units remained active.

After browser/upload checks, cgroup memory was approximately 61 MB API, 96 MB moderation and 6.4 MB Redis (about 163 MB combined; before backup restarts). This is a short acceptance sample, not sustained-load capacity. Nginx was already shared with other apps. No additional Node or development server was running on the VPS.

Final five-second idle sample after backup: about 128 MB combined API/worker/Redis, with approximately 0.8% of one CPU in total; roughly 1 GB remained available on the host. The larger approximately 163 MB observation above followed browser/upload acceptance. These short samples do not establish concurrent-user capacity. Existing certificate-renewal automation includes the dedicated hostname certificate.
