# V2 API

Following, activity notifications, reports, and moderation endpoints are documented in [COMMUNITY.md](COMMUNITY.md).
Background image scan, private preview, appeal, and processing-queue endpoints are documented in [IMAGE-MODERATION.md](IMAGE-MODERATION.md).

All paths below are under `/api/`. Requests and responses use JSON, except image uploads which use multipart form data and pin downloads which return an attachment stream. Success: `{"data": ...}`. Errors: `{"error":{"code":"...","message":"...","fields":{"field":["message"]}}}`; `fields` is included only when applicable.

## Browser authentication

1. GET `auth/session/` to obtain the current user (or null) and `csrfToken`.
2. Include `X-CSRFToken` on writes and send session cookies to the same origin.
3. Replace the token with the returned `csrfToken` after registration, login, logout, or password reset.

The session cookie and CSRF cookie are HTTP-only. The frontend obtains the masked CSRF token through the session endpoint, not by reading cookies. Session responses are not cacheable. Production cookies are secure when `DJANGO_DEBUG=0`.

User data: `id`, `username`, `email`, and `profile` with `display_name` and `bio`. Email is exposed only in the signed-in user's own session response. Usernames/emails are normalized to lowercase and have case-insensitive database uniqueness constraints.

| Method | Path | Fields | Result |
| --- | --- | --- | --- |
| GET | `health/` | — | Service status |
| GET | `ready/` | — | Database readiness; 503 when unavailable |
| GET | `auth/session/` | — | User or null, CSRF token |
| POST | `auth/register/` | username, email, password1, password2 | Creates account/profile and signs in; HTTP 201 |
| POST | `auth/login/` | username, password | Signs in |
| POST | `auth/logout/` | empty object | Ends authenticated session |
| PATCH | `auth/profile/` | display_name and/or bio | Updates only the session user's profile |
| POST | `auth/password-reset/` | email | Generic response regardless of account existence |
| POST | `auth/password-reset/confirm/` | uid, token, new_password1, new_password2 | Consumes reset token and invalidates previous sessions |

Passwords use Django's password handling and validators, a minimum of 10 characters, and a maximum API input length of 1024. Development reset emails appear only in the Django terminal; the link points to `/reset-password/<uid>/<token>` on `FRONTEND_ORIGIN`. Tokens expire after one hour. Database compare-and-swap prevents the same token from updating the password twice.

## Ownership gates

Writes require a session and CSRF token. Public collection reads expose only active users' content.

| Method | Path | Editable fields / behavior |
| --- | --- | --- |
| GET, PATCH, DELETE | `posts/<id>/` | Public read; owner writes: title, description, alt_text, source_url, tags, allow_download (JSON boolean) |
| PATCH, DELETE | `comments/<id>/` | Author only; text |
| GET | `boards/<id>/` | Public board metadata, or private metadata for its owner |
| PATCH, DELETE | `boards/<id>/manage/` | Owner only; name, description, is_private (JSON boolean), cover_post_id (saved pin ID or null) |
| DELETE | `saves/<id>/` | Board owner only |

Writes derive ownership from the server session. Fields such as `user_id`, `owner_id`, and `author_id` are rejected. Unauthorized ownership queries return 404, anonymous writes return 401, failed CSRF returns 403, unsupported methods return 405, and rate limits return 429 with `Retry-After`.

## Collections and uploads

| Method | Path | Fields / filters |
| --- | --- | --- |
| GET | `feed/` | q, tag, owner (username), page_size, cursor |
| POST | `posts/` | Multipart image, title, description, alt_text, source_url, tags |
| GET, POST | `posts/<id>/comments/` | Paginated read; JSON text for creation |
| GET, POST | `boards/` | Paginated read (optional owner); create with name, description, is_private |
| GET | `boards/<id>/posts/` | Paginated saved pins; private board owner only |
| POST | `boards/<id>/saves/` | post_id; idempotent save, owner only |
| DELETE | `boards/<id>/saves/<post_id>/` | Remove pin and clear its manual cover, owner only |
| GET | `profiles/<username>/` | Public profile and counts; no email; private board counts only for self |
| POST | `profile/avatar/` | Multipart image; replaces signed-in user's avatar |
| DELETE | `profile/avatar/remove/` | Removes signed-in user's avatar |
| GET | `people/` | q, page_size, cursor; username and display-name search |
| GET | `tags/` | Tags used by active users' pins |

Paginated results contain `items` and `next_cursor`. Page size defaults to 18, maximum 36. Signed cursors expire after one day and are bound to query filters and visibility. Ordering uses timestamps and IDs; each traversal retains a cutoff so newer inserts do not disturb subsequent pages. Comments run oldest first; other lists run newest first. Changing filters requires a fresh cursor.

Tags are a comma-separated string on writes, at most eight distinct normalized tags of 40 characters each; reads return an array. Source links allow HTTP/HTTPS without embedded credentials; the server does not fetch them. Basic search uses database queries rather than an external search service.

Images must be still JPEG, PNG, or WebP, at most 8 MB, 20 million pixels, and 8192 pixels on either axis. Processing verifies contents, applies orientation, strips metadata, and writes a UUID-named WebP (maximum 2400 pixels) plus a 640-pixel thumbnail. Avatars are cropped to 256 square pixels. Responses include dimensions and media URLs. The overall upload request has a 9 MB guard before CSRF parsing.

Failed creation cleans newly written files. Successful deletion or avatar replacement schedules cleanup after the database commit; storage failures enter `MediaCleanup`. Run `python backend/manage.py cleanup_media` periodically to retry. Removing a board or save does not remove the source pin. Private boards hide their metadata and saved collection from other users; pins themselves are public.

## Rate limiting

Counters live in the database, use atomic increments, and survive session changes and Django restarts. Keys are hashes; raw IP addresses, usernames, and emails are not stored in rate-limit records. Fixed windows may allow adjacent-window bursts.

- Registration and reset-email requests: 5 per hour per IP and per account identifier.
- Login and reset confirmation: 10 per 5 minutes per IP; login also limits by username across IPs.
- Other write endpoints: 30 per minute per IP, per endpoint.

Development trusts only `REMOTE_ADDR`. The supplied private Docker topology overwrites and validates `X-Behtrest-Client-IP` at Caddy before assigning the backend client address. Never expose its Django port directly or trust a browser-supplied proxy header. Additional proxies require a reviewed address strategy. Clean expired counters with `python manage.py cleanup_rate_limits`.

The Django admin uses Django's staff/permission system. It is a trusted administration interface, separate from owner-only public API access.

## Same-origin routing

Vite proxies `/api/`, `/admin/`, `/static/`, `/media/`, and WebSockets at `/ws/` to Django/ASGI in development and preview. Use one browser origin throughout an account flow. Production hosting serves the built SPA with fallback to `index.html`, routes API/admin/WebSockets to ASGI, and serves only public media/static prefixes as files. Configure `FRONTEND_ORIGIN`, allowed hosts, and HTTPS. No permissive CORS is enabled.

Messaging endpoints live under `/api/chat/`: conversations, group members, messages, receipts, private attachment upload/download, settings, blocks, reports, and unread summary. Writes are CSRF protected. Messages/reactions allow 60 writes/minute, receipts 120, image uploads 15, reports 10/hour; other chat writes allow 30/minute per IP/endpoint. WebSocket connection attempts allow 20/minute per authenticated user. See [MESSAGING.md](MESSAGING.md) for membership, retry, and privacy behavior.

The portable implementation is described in [DEPLOYMENT.md](DEPLOYMENT.md). Readiness checks database access and the migrations table; it does not replace storage, email, or full journey monitoring.


## Pin detail actions (October 26, 2026)

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `pins/<id>/download` (also trailing slash) | Stored full-size image as an attachment; slugified title plus stored extension; private/no-store; 30 requests/minute per client IP |
| GET | `pins/<id>/metadata/` | Public approved pin metadata used for initial-HTML OG/Twitter tags; hidden/pending/inactive-owner pins return 404 |
| POST, DELETE | `comments/<id>/likes/` | Authenticated, CSRF-protected, idempotent like/unlike; returns liked and like_count; 60 writes/minute per client IP |

Pins serialize `allow_download`, default true. Multipart creation accepts `allow_download=true` or `false`; omission retains true. Owner JSON edits accept a boolean, not a string. Disabled downloads, hidden/pending pins and blocked-owner visibility failures return 404 from the download endpoint. The downloaded image is the normalized full-size stored file, not the thumbnail or discarded raw upload. ASGI downloads yield bounded 64 KiB chunks.

Comments are returned latest-first, with `total` on the page and `liked`/`like_count` on each item. Text is trimmed, requires at least two characters, and identical comments from the same account are rejected for 60 seconds. Board-save responses include `created`: Undo is offered only when this save created a row, so it cannot delete a save that already existed.

`GET /pin/<id>` is an HTML route outside `/api/`; see [deployment integration](DEPLOYMENT.md) and [pin detail behavior](PIN-DETAIL.md).
