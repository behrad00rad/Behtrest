# Bintrest 0.3.0 release candidate

Prepared October 9, 2026 for local review. Tag: `v0.3.0-rc1`.

The complete V2 journey now has automated desktop/mobile verification. This candidate adds accessibility fixes, reliable avatar editing, CI, production configuration, a portable HTTPS Docker topology, database readiness, and checked backup/restore tools. The original age-13 CS50x project, README, and `legacy-v1` snapshot remain preserved.

## Review artifacts

- [Task record](../TASKS.md): tasks 1–9 complete; task 10 deferred; task 11 prepared with container runtime verification pending.
- [Verification](VERIFICATION.md): backend, browser, accessibility, frontend, and recovery evidence.
- [Deployment](DEPLOYMENT.md): target architecture, environment, SMTP, storage, backups, restore drill, monitoring, upgrades, and rollback.
- [CI](../.github/workflows/verify.yml): tests and container smoke verification.

## Publishing gate

Container builds and the HTTPS smoke job must pass on an available Docker engine. The local engine was unavailable; Compose syntax and Django production preflight passed. No remote CI run is claimed. Configure the actual domain/server/SMTP delivery and verify a real email before publishing. Use a fresh V2 database unless the separate legacy import task is explicitly approved.

No deployment or legacy-data import is included in this candidate. Retain this release's source revision alongside production backups.
