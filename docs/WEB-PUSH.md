# Web Push notifications

Messages has an explicit **Enable notifications** button. Permission is requested only after a tap. Once enabled, the same button opens per-device switches for messages, message requests/group invitations, new followers, and new pins from followed accounts. New-pin alerts default off. The conversation name links to the other person's profile in direct chats; group headings remain unchanged.

On iPhone/iPad, add Behtrest to the Home Screen and open that installed app before enabling notifications (iOS/iPadOS 16.4+). HTTPS, browser support, device permission, and the OS's notification/Focus settings are required. Lock-screen delivery is best-effort, not guaranteed. Unsupported/denied states explain the next step; in-app unread counts remain available.

## Delivery and privacy

- `POST /api/push/subscriptions/` stores the current device's endpoint/encryption keys and preferences; GET returns the public VAPID key and only the authenticated owner's device preferences; DELETE revokes only that owner's matching endpoint. Session authentication, CSRF and registration rate limits apply. Five devices per account maximum.
- Only known HTTPS browser push-service hosts are accepted. Private/loopback/custom endpoints, credentials and nonstandard ports are rejected. Endpoints and keys are sensitive: never log or expose them in telemetry.
- Existing message/activity events create a durable SQLite outbox. Delivery rechecks active membership, mute/archive, block, unread position, account status, follow status and pin moderation. Message text is never included in a push payload.
- Notification tags group alerts by conversation or pin author. Existing activity settings are respected. Disable controls remove the device subscription; sign-out also unsubscribes the browser. Account switches revoke the previous local subscription rather than silently transferring it.
- Retries use bounded exponential delay, max five attempts. Expired provider subscriptions (404/410) are removed; outbox entries expire after a day and device registrations after 90 days without refresh. Opening Messages reads status; changing preferences refreshes the registration.
- The service worker handles notifications and links only. It does not cache pages, API responses or private media. Notification links are restricted to this origin.

## Configuration and operation

The approved backend dependency is `pywebpush`, with pinned transitive versions in `backend/requirements-lock.txt`. No frontend dependencies were added.

Configure persistent VAPID P-256 keys: `BEHTREST_PUSH_PUBLIC_KEY` is the URL-safe, unpadded base64 uncompressed public point; `BEHTREST_PUSH_PRIVATE_KEY` is the path to a private PEM file readable only by root/the app group; `BEHTREST_PUSH_SUBJECT` is a contact `mailto:` or HTTPS URL. Keep the private key and environment file outside the repository and preserve them across releases. Changing the key requires users to re-enable notifications.

For native hosting, install `deploy/native/behtrest-push.service` and `.timer`, reload systemd and enable/start the timer. It runs `manage.py send_push` every 15 seconds after the previous run, with no permanent idle process; each run has a 20-second work budget, five-second request timeout, 128 MB memory cap and 20% CPU cap. Do not run concurrent drain commands. The backup script pauses this timer and any running delivery job along with the other Behtrest writers.

Without configured keys, subscription creation reports unavailable and event hooks skip queuing. Other hosting setups must schedule the same command serially. Check the timer status, failed unit state, aggregate outbox count/oldest age and public readiness; never dump subscriptions or payloads to diagnose delivery.

## Verification boundaries

Backend tests cover encryption through the real library with transport mocked, API validation/ownership/CSRF, message API idempotence, requests, opt-in new pins, mute/block/read/moderation checks, retries and expired subscriptions. Browser tests at 375/768/1440 cover the opt-in UI, simulated subscription/preferences, dialog focus/Esc, unsupported-device guidance, no horizontal overflow and chat-to-profile navigation. They do not prove Apple/Google delivery or physical-phone lock-screen behavior.
