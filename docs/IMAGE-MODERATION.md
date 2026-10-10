# Local background image moderation

Public pin and avatar uploads are normalized and stored in private quarantine. The request returns an owner-only preview immediately after normal upload/image validation; it does not load a model or run inference. One separate CPU worker checks each image and publishes it if approved. Pending/review/rejected pins are excluded from public feeds, search, tags, profiles/counts, boards/covers, comments, pin sharing, and follower notifications. Owner profiles include their own pending pins. Existing avatars remain public until a replacement passes; replacements and avatar removal cancel earlier jobs. Owners can recover pending avatar status after reload.

The current rule blocks detected exposed breasts (including male chests), buttocks, genitalia, and anus, regardless of sexual context. Shirtless photos can therefore be flagged. Covered body parts, faces, feet, and bare stomachs are not blocked by these labels. This is a configurable detection policy, not a guarantee of catching every instance: small/obscured nudity, drawings, and unusual images can be missed. Real-world threshold calibration is still needed; reports and human review remain available. Private chat photos are not automatically scanned in this implementation; existing chat reporting/moderation remains available. Existing public uploads are grandfathered and have not been retroactively scanned.

## Setup and offline operation

From the repository root, using the project virtual environment:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-lock.txt
.\.venv\Scripts\python.exe scripts/setup_image_model.py
.\.venv\Scripts\python.exe backend/manage.py migrate
```

The setup command explicitly downloads the pinned NudeNet 3.4.2 package (~10.6 MB), extracts its 12.2 MB ONNX model, and verifies its SHA-256. Model/license provenance is in `backend/models/README.md` and `NUDENET-LICENSE`. Dependencies include CPU ONNX Runtime and NumPy; no GPU packages are required. Transfer the installed runtime/container image and model to the domestic server beforehand. Requests and inference perform no international network calls.

Set `BEHTREST_IMAGE_MODERATION=1` in ignored `backend/.env`, restart the API, and run another terminal:

```powershell
.\.venv\Scripts\python.exe backend/manage.py moderate_images
```

Local development defaults to disabled until explicitly enabled. Production defaults to enabled. Turning the feature off affects new uploads; it never publishes existing pending uploads. `--once` processes at most one eligible job for operating checks.

Docker Compose includes a separate `moderation` service using the backend image, shared persistent data, one CPU and a 1 GB memory limit. Run model setup **before** building; builds reject missing/mismatched model files. No download occurs at container startup. Runtime container verification still requires an available Docker engine.

## Decisions and recovery

Default highest relevant confidence: below `0.35` approves, `0.35–0.75` enters review, and `0.75` or greater rejects. Configure `BEHTREST_IMAGE_REVIEW` / `BEHTREST_IMAGE_REJECT` after calibration. The model is pinned by digest. CPU inference uses one thread, keeps one model session loaded, and processes one image at a time.

Jobs persist in SQLite with a five-minute lease and unique claim token. Expired claims can be retried; stale workers cannot apply a decision. Scan failures remain private with bounded retry backoff. A missing or invalid model prevents worker startup; uploads stay private. In Moderation, **Images awaiting processing** permits authorized staff to inspect and approve/reject stalled uploads manually. Flagged images enter the report queue with confidence evidence. Rejected owners can request review; human decisions require reasons and enter the audit history. Approval publishes files and sends follower activity once. Account suspension is not automated.

Quarantine originals and thumbnails are included and checked by V2 backups. Stop **both the API and moderation worker** before an offline backup/restore, then restart both. Queue state survives restarts/restores. Keep a pre-upgrade backup; rolling back to older code requires restoring compatible data rather than running old code against pending uploads.

Run `python backend/manage.py cleanup_image_scans` periodically. Approved/canceled private previews expire after seven days; unreferenced quarantine files expire after 24 hours. Pending/review/rejected evidence is retained until its pin/profile is deleted or the upload is canceled and cleaned up. Daily usage records expire after 30 days.

## Upload quotas and worker health

When moderation is enabled, defaults allow 100 public-pin/avatar uploads per account per UTC day, 20 pending/scanning/review images per account, 256 MiB of referenced quarantine files per account, and 2 GiB globally. Normalized originals and thumbnails both count, including retained approved previews and rejected evidence. Avatar replacement can replace an existing queued avatar at the queue limit, but still consumes a daily upload and retained storage. Deleted uploads do not reset daily usage. Failed requests consume nothing. Quota checks serialize across workers and return HTTP 429 with a useful message before quarantine files are written.

Configure `BEHTREST_IMAGE_UPLOADS_PER_DAY`, `BEHTREST_IMAGE_PENDING_PER_USER`, `BEHTREST_IMAGE_QUARANTINE_USER_MB`, and `BEHTREST_IMAGE_QUARANTINE_TOTAL_MB` with positive integers. Existing quarantine files are accounted for when the first new upload is checked. These limits cover moderation quarantine, not total public-media/chat disk usage; monitor free disk space and run cleanup. Old approved public content and private chat attachments are not automatically screened or included in these quotas.

The Docker worker reports health from a heartbeat after model initialization. A heartbeat older than two minutes marks it unhealthy; process crashes are restarted by Compose. An unhealthy state requires investigation and is not an automatic publication or rejection decision.

## Local calibration

Create a JSON manifest beside your locally held, appropriately labeled test images:

```json
[
  {"id": "ordinary-photo", "file": "photo.jpg", "expected": "allow"},
  {"id": "policy-example", "file": "example.jpg", "expected": "block"}
]
```

Run `python backend/manage.py evaluate_image_model path/to/manifest.json --output path/to/report.json`. Optional `--review 0.35 --reject 0.75` compares candidate thresholds without changing production configuration. The report contains decisions, relevant confidence scores, inference/preparation time, false rejections, blocked images approved, and review rate. Files must be inside the manifest directory; nothing is downloaded, uploaded or published. Missing classes produce null rates rather than a misleading zero.

Use separate calibration and validation samples covering actual site content, drawings, small/obscured subjects and nonsexual nudity under the site's policy. Tune using calibration samples and check the untouched validation set before changing environment thresholds. A benign-fixture run verifies tooling, not nudity-detection accuracy. No representative labeled corpus is bundled, and the current thresholds remain uncalibrated defaults.

## API additions

- GET `/api/image-scans/<id>/`: owner-only status, message, preview, and current user.
- GET `/api/image-scans/<id>/image/`: private original; `?thumbnail=1` selects the thumbnail. Only owner or authorized moderator; no-store.
- POST `/api/image-scans/<id>/appeal/`: owner requests review of a rejected image.
- GET `/api/moderation/images/`: paginated processing queue, moderators only.
- POST `/api/image-scans/<id>/review/`: moderator opens a pending image report.
- Existing moderation decisions add `approve_image` and `reject_image` for image reports.

Pin responses include `moderation_status` and `scan_id`. Avatar uploads return HTTP 202 with `{user, scan}` when enabled; session user data includes `profile.avatar_scan` while unresolved. Writes require CSRF and existing permission/rate checks.
