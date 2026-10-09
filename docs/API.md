# V2 API foundation

All paths below are under `/api/`. Requests and responses use JSON. Success: `{"data": ...}`. Errors: `{"error":{"code":"...","message":"...","fields":{"field":["message"]}}}`; `fields` is included only when applicable.

## Browser authentication

1. GET `auth/session/` to obtain the current user (or null) and `csrfToken`.
2. Include `X-CSRFToken` on writes and send session cookies to the same origin.
3. Replace the token with the returned `csrfToken` after registration, login, logout, or password reset.

The session cookie and CSRF cookie are HTTP-only. The frontend obtains the masked CSRF token through the session endpoint, not by reading cookies. Session responses are not cacheable. Production cookies are secure when `DJANGO_DEBUG=0`.

User data: `id`, `username`, `email`, and `profile` with `display_name` and `bio`. Email is exposed only in the signed-in user's own session response. Usernames/emails are normalized to lowercase and have case-insensitive database uniqueness constraints.

| Method | Path | Fields | Result |
| --- | --- | --- | --- |
| GET | `health/` | — | Service status |
| GET | `auth/session/` | — | User or null, CSRF token |
| POST | `auth/register/` | username, email, password1, password2 | Creates account/profile and signs in; HTTP 201 |
| POST | `auth/login/` | username, password | Signs in |
| POST | `auth/logout/` | empty object | Ends authenticated session |
| PATCH | `auth/profile/` | display_name and/or bio | Updates only the session user's profile |
| POST | `auth/password-reset/` | email | Generic response regardless of account existence |
| POST | `auth/password-reset/confirm/` | uid, token, new_password1, new_password2 | Consumes reset token and invalidates previous sessions |

Passwords use Django's password handling and validators, a minimum of 10 characters, and a maximum API input length of 1024. Development reset emails appear only in the Django terminal; the link points to `/reset-password/<uid>/<token>` on `FRONTEND_ORIGIN`. Tokens expire after one hour. Database compare-and-swap prevents the same token from updating the password twice.

## Ownership gates

These endpoints operate on existing records to establish permissions in task 4. Record creation, upload processing, feed retrieval, and complete collection UI remain tasks 5–8.

| Method | Path | Editable fields / behavior |
| --- | --- | --- |
| PATCH, DELETE | `posts/<id>/` | Owner only; title, description |
| PATCH, DELETE | `comments/<id>/` | Author only; text |
| GET | `boards/<id>/` | Public board metadata, or private metadata for its owner |
| PATCH, DELETE | `boards/<id>/manage/` | Owner only; name, description, is_private (JSON boolean) |
| DELETE | `saves/<id>/` | Board owner only |

Writes derive ownership from the server session. Fields such as `user_id`, `owner_id`, and `author_id` are rejected. Unauthorized ownership queries return 404, anonymous writes return 401, failed CSRF returns 403, unsupported methods return 405, and rate limits return 429 with `Retry-After`.

Post image cleanup and upload lifecycle handling are deferred to task 5. Do not use these foundational endpoints as a public image service yet.

## Rate limiting

Counters live in the database, use atomic increments, and survive session changes and Django restarts. Keys are hashes; raw IP addresses, usernames, and emails are not stored in rate-limit records. Fixed windows may allow adjacent-window bursts.

- Registration and reset-email requests: 5 per hour per IP and per account identifier.
- Login and reset confirmation: 10 per 5 minutes per IP; login also limits by username across IPs.
- Other write endpoints: 30 per minute per IP, per endpoint.

Only `REMOTE_ADDR` is trusted. Before deployment behind a reverse proxy, configure an authoritative client-address strategy and edge rate limiting; do not blindly trust browser-supplied forwarding headers. Until then, proxied users may share a backend IP bucket. Clean expired counters with `python manage.py cleanup_rate_limits`.

The Django admin uses Django's staff/permission system. It is a trusted administration interface, separate from owner-only public API access.

## Same-origin routing

Vite proxies `/api/`, `/admin/`, `/static/`, and `/media/` to Django in development and preview. Use one browser origin throughout an account flow. Production hosting should serve the built SPA with fallback to `index.html`, route these backend prefixes to Django, and configure `FRONTEND_ORIGIN`, allowed hosts, and HTTPS. No permissive CORS is enabled.
