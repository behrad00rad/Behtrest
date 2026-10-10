# Messaging

Added October 9, 2026, after the user approved direct and group messaging. The original age-13 CS50x project remains preserved in `btrest/` and `legacy-v1`.

## Behavior

- Open Messages from navigation, Message from a profile, or Share in chat from a pin.
- New contacts default to requests. A sender can send one introductory message until the recipient accepts. Choose Everyone, Message requests, or Nobody new in Chat privacy. Changing this setting affects new conversations/invitations, not existing ones.
- Groups have 2–20 people. Admins rename, invite/remove members, and promote/demote admins. The last accepted admin transfers the role before leaving when members/invitees remain, or removes pending invitations first. New/reinvited members see messages sent after their latest invitation, not earlier history.
- Text is limited to 4,000 characters. Share a pin, one still JPG/PNG/WebP image, or both. Images use the existing 8 MB/dimension limits and have metadata stripped. Replies, six emoji reactions, editing, and deletion are supported. Deletion leaves a tombstone and removes its attachments/reactions; replies show “Message deleted.”
- Sent means persisted; Delivered means fetched by the recipient's chat screen; Read means fetched while that conversation is visible and accepted. These are per-person watermarks, not proof someone read every word. Group bubbles indicate whether any peer delivered/read; the API exposes individual receipts subject to privacy preferences.
- Search conversations or their message text. Mute hides unread badge contribution and browser notifications. Archive moves a conversation to Archive; sending brings it back to the sender's inbox.
- Blocking stops direct-message writes, direct typing/presence, and invitations made by that person. Existing shared groups remain visible; you may leave them. Unblocking restores an existing direct conversation when both memberships are active.
- A report copies the selected message text/reason for staff review in Django admin. Staff can resolve reports; there is no general chat-content admin browser. Reports do not automatically delete content or notify the reported person.
- Browser notifications are opt-in, require browser permission and an open Behtrest tab, and use a generic preview. They are not background push notifications after the browser/tab closes. Unread counts remain available in-app.

## Delivery and privacy

REST writes commit to SQLite before live events are broadcast. A UUID unique per conversation/sender prevents duplicate messages after lost responses, simultaneous retries, or reconnects. The composer keeps an uncertain send intact until retried. Clients refresh the displayed history on reconnect, including edits/deletions, and also poll every 15 seconds if live delivery is unavailable.

One authenticated personal WebSocket uses Django Channels. Origin validation prevents other sites from connecting with cookies. Every event re-checks the session; periodic checks revoke idle sockets after logout/password changes within 15 seconds. Subscription notifications contain identifiers, not message bodies; REST performs membership checks. Typing events expire in the client. Presence expires after roughly 40 seconds and supports multiple tabs. Online status is approximate and respects user preferences.

Private images are in `PRIVATE_MEDIA_ROOT`, not `MEDIA_ROOT`. The authenticated attachment endpoint checks active membership and invitation boundaries and sends `Cache-Control: private, no-store`. Leaving/removal revokes downloads. Unsent uploads expire after 24 hours when `chat_cleanup` runs. Backups include private images and messages. This is server-stored messaging over HTTPS; end-to-end encryption, calls, voice notes, and email/push delivery are separate future features.

## Operations

Use the README's Uvicorn command for development; `manage.py runserver` does not serve WebSockets. Development uses an in-process channel layer/cache. Production Compose adds Redis, Uvicorn, `/ws/` proxy routing, and persistent private media under `/data`. Keep one ASGI worker with SQLite; larger scale needs a database and presence/concurrency design review.

Apply migrations, restart the API/frontend proxy, and run `python backend/manage.py test accounts collection messaging`. Browser tests run against disposable ASGI/React servers with two independent accounts. See `VERIFICATION.md` for current results. Docker runtime verification remains pending on an available engine.
