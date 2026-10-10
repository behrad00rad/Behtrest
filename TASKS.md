# Behtrest V2 task plan

Status: tasks 1–9 completed on October 9, 2026. Task 11's deployment candidate is prepared; container runtime verification remains pending. Task 10 remains deferred. Tasks 9 and 11 were explicitly approved. See docs/VERIFICATION.md for evidence.

## Preparation completed

- [x] Initialize a local Git repository on main.
- [x] Preserve the original README verbatim.
- [x] Document the origin story, age, historical context, and limitations.
- [x] Exclude local data, dependencies, secrets, and generated files from Git.
- [x] Write this plan for review before implementation.

## Approach

Preserve `btrest/` as V1. Build V2 in new `backend/` and `frontend/` directories using Django and React/Vite/TypeScript. Retain Tailwind and the dark/blue identity. Use Django sessions, CSRF protection, same-origin API routing, and SQLite initially. Complete tasks in order with focused verification. Do not publish or deploy without a deployment request.

## 1. Reproduce and document V1

- [x] Inventory source, schema, media references, and dependencies without exposing account data.
- [x] Set up isolated dependencies and attempt to run the original app; record commands and blockers.
- [x] Record working user flows, failures, and visual references.
- [x] Review tracked files, create an initial source commit, and tag the legacy snapshot.

**Done when:** the original source is recoverable and its behavior/setup is documented. Never modify the only copy of the legacy database.

## 2. Create the V2 foundation

- [x] Scaffold Django and React/Vite/TypeScript in new directories.
- [x] Add dependency manifests, environment examples, and startup commands.
- [x] Configure development API proxying and define production same-origin routing.
- [x] Define JSON response/error conventions and API routes.
- [x] Add a responsive application shell and dark/blue design tokens.

**Done when:** a fresh setup runs both services and the frontend calls a backend health endpoint; secrets remain outside source control.

## 3. Build models and migrations

- [x] Define the user model before initial migrations; add Profile, Post, Comment, Board, and SavedPost.
- [x] Add ownership, timestamps, foreign keys, indexes, and uniqueness constraints.
- [x] Configure Django admin and synthetic demo-data generation.

**Done when:** fresh migrations work, invalid relationships and duplicate saves are prevented, and demo content appears in admin.

## 4. Implement authentication and permissions

- [x] Implement registration, login, logout, current-user lookup, and password reset.
- [x] Use Django password handling, sessions, CSRF protection, and backend validation.
- [x] Derive ownership from authenticated requests and enforce owner-only edits/deletes.
- [x] Add rate limits for authentication and writes; remove sensitive logging.
- [x] Build account screens and session-aware navigation.

**Done when:** account flows work, anonymous writes and forged identities fail, and one user cannot modify another user's resources. Verify CSRF protection. Test reset emails through development email output; production delivery comes later.

## 5. Implement image posts

- [x] Validate image contents, file size and dimensions; use safe unique filenames and correct content types.
- [x] Generate thumbnails, record dimensions, and handle failed uploads/deleted media.
- [x] Implement post creation, detail, editing, and deletion APIs.
- [x] Build upload preview/progress, validation feedback, and post detail screens.

**Done when:** valid images render, invalid files are rejected, ownership is enforced, and failed writes/deletions do not leave inconsistent records or media.

## 6. Build the feed and comments

- [x] Implement deterministic cursor pagination with duplicate/overlapping-request prevention.
- [x] Build responsive masonry cards, reserved image space, and lazy loading.
- [x] Add loading, empty, retry, error, and end-of-feed states.
- [x] Implement comment creation, editing, and deletion with permissions.
- [x] Clean up listeners/requests and handle route changes correctly.

**Done when:** scrolling advances through real pages without repeating the feed, new inserts do not disrupt pagination, and comment ownership is enforced.

## 7. Complete profiles, boards, and saves

- [x] Add profile editing, safe avatar uploads, and uploaded-post lists.
- [x] Implement public/private boards, owner controls, and board covers.
- [x] Implement saving/removing posts and enforce private-board access.

**Done when:** users organize posts into boards, profiles show real content, and other users cannot access private collections.

## 8. Add search, tags, and source links

- [x] Add tags and optional validated source URLs.
- [x] Search titles/descriptions, tags, and usernames with pagination and basic filters.
- [x] Add no-result feedback and appropriate database indexes.

**Done when:** seeded content is discoverable with stable pagination and validated parameters, without requiring an external search service.

## 9. Polish and verify

- [x] Review mobile layouts, keyboard access, labels, focus, contrast, and alternative text.
- [x] Replace placeholders with working controls and consistent feedback.
- [x] Add meaningful backend tests for auth, ownership, private boards, uploads, and pagination.
- [x] Add an end-to-end registration → upload → comment → save → profile → logout test.
- [x] Add CI for tests, frontend builds, and appropriate static checks.

**Done when:** the main journey passes automated checks and desktop/mobile visual review. Tests never mutate the legacy database.

## 10. Resolve legacy data migration

- [ ] Inspect the V1 database/media read-only and produce a migration report.
- [ ] Identify missing images, inconsistent profiles, and records needing cleanup.
- [ ] Implement optional import with dry-run reporting, validation, and rollback strategy.
- [ ] Plan password resets for legacy accounts rather than treating old hashes as Django hashes.

**Done when:** migration is tested on copies, originals remain untouched, and real-account retention/import is reviewed before execution. V2 also works with synthetic data alone.

## 11. Prepare deployment and documentation

- [x] Document HTTPS, secure cookies, allowed hosts, environment settings, static/media handling, and email delivery.
- [x] Choose hosting, production database, and media storage for the actual target: a portable single Linux Docker host, SQLite, and persistent filesystem media, as selected by the user.
- [x] Document backups, restore checks, logging, and health checks.
- [x] Update the README with verified setup, screenshots, architecture, and the V1-to-V2 story.
- [x] Run available local checks and prepare a release candidate for review.
- [ ] Run container builds and HTTPS smoke verification on an available Docker engine (CI job supplied; local engine unavailable). Confirm before publishing.

**Done when:** deployment instructions are concrete, checks pass, and recovery is documented. Publishing requires a deployment request.

## Messaging (approved October 9, 2026)

- [x] 12. Add conversations, memberships, messages, reactions, receipts, privacy, blocks/reports, and migrations.
- [x] 13. Implement permission-checked APIs, persistent UUID sends, message requests, group roles/invitations, and history search.
- [x] 14. Add Channels/ASGI delivery, session/origin validation, reconnect sync, typing, and approximate presence.
- [x] 15. Build responsive inbox/conversation screens, profile contact buttons, and pin sharing.
- [x] 16. Add private images, replies/reactions, editing/deletion, unread receipts, mute/archive, block/report, and privacy controls.
- [x] 17. Add in-app unread indicators and opt-in browser notifications.
- [x] 18. Prepare Redis/Uvicorn Docker routing, private media cleanup, backups/restore, and operating docs.
- [x] 19. Complete backend tests and desktop/mobile reliability/accessibility journeys; final migration/build checks recorded in `docs/VERIFICATION.md`.

## Messages UX rebuild (approved October 9, 2026)

- [x] Replace the chat layout with a complete inbox/conversation workspace and a reachable mobile composer.
- [x] Add working partial-username/name search, recipient selection, and searchable group invitations.
- [x] Group messages, add date separators and contextual actions, and improve composer/attachment/request feedback.
- [x] Improve feed hierarchy and desktop/mobile navigation while preserving the blue theme and project history.
- [x] Verify desktop/mobile messaging and the existing account/collection journeys, accessibility, production build, and formatting. See `docs/VERIFICATION.md` for the final runs and mobile layout repair.

## Product polish 1–4 (approved October 9, completed October 10, 2026)

- [x] 1. Improve pin details, save/share controls, full-image viewing, comment actions, and mobile layout.
- [x] 2. Improve profiles and boards, searchable collections, visibility filters, and an explicit Organize mode for covers/removal.
- [x] 3. Add a dedicated search screen, tag discovery, tag filters, newest/oldest ordering, and useful result/empty states.
- [x] 4. Add per-conversation session drafts, retry recovery after reload, unread/latest navigation, and permission-checked shared photos/pins.

Draft text and retry metadata are stored in the current browser tab and cleared on sign-out. Unuploaded image files cannot survive a reload. Verification is recorded in `docs/VERIFICATION.md`.

## Minimal visual redesign (approved October 10, 2026)

- [x] Replace decorative card borders and pill shapes with tonal surfaces and small control radii.
- [x] Apply charcoal/off-white/indigo colors across navigation, collections, pin details, forms, and messaging.
- [x] Flatten profile and chat frames; preserve visible keyboard focus and validation feedback.

## Further ideas

### Visual adjustment, October 10, 2026

Restored rounded corners at the user's request: 10px controls and 14px images, panels, and message bubbles. Replaced the muted charcoal/indigo palette with deep navy backgrounds and saturated blue actions while retaining contrast-based separation.

- Collaborative boards.
- Personal notes on saves and drag-and-drop organization.
- Related posts by tag, color browsing, and duplicate-image detection.
- Optional automatic tagging.
- Complex recommendations only if usage justifies them.

## Community improvements 3, 5, 6 (approved October 10, 2026)

- [x] 3. Reporting, a permission-checked queue, reversible content/account decisions, and decision history.
- [x] 5. Follows, follower/following lists, and a paginated following feed respecting blocks.
- [x] 6. Activity notifications, unread controls, preferences, and private-save/block safeguards.
- [x] Rename the current product to Behtrest while preserving original source/history and browser draft/environment compatibility.

See `docs/COMMUNITY.md` for behavior and moderator setup and `docs/VERIFICATION.md` for checks.

## Local image moderation (approved October 10, 2026)

- [x] Commit and push the Behtrest/community checkpoint before implementation (`78e8db2`).
- [x] Package a pinned CPU model and runtime with announced download sizes and no runtime internet dependency.
- [x] Add private upload quarantine, owner previews/status, a durable background worker, lease/retry recovery, and approval-only public visibility.
- [x] Apply the user's no-nudity rule to public pins and avatars; support human review, rejection appeals, and stalled-upload handling.
- [x] Preserve pending assets in verified backups and add cleanup/deployment/operation documentation.
- [x] Verify backend rules and desktop/mobile workflows with the real local worker. Private chat automatic screening remains outside this implementation pending the separate preference.

See `docs/IMAGE-MODERATION.md` and `docs/VERIFICATION.md`. Existing public uploads are not retroactively scanned.

## Referral controls and operating safeguards (approved October 10, 2026)

- [x] Commit and push local image moderation and referral-registration checkpoint (`557ef1e`).
- [x] Add audited in-app registration settings, per-member allowances, invite disablement and code replacement.
- [x] Add daily upload, pending-image and quarantine-storage quotas; retain usage across upload deletion.
- [x] Add worker heartbeat health and local labeled-corpus evaluation tools.
- [x] Verify backend and desktop/mobile referral journeys, recovery, builds and migrations.
- [x] Diagnose the CI Redis ownership failure and run Redis as its unprivileged image user.
- [ ] Complete Linux container HTTPS/Redis/worker-restart/persistence CI verification after the fix.

Representative nudity calibration samples are not bundled. Detection thresholds remain unchanged pending actual validation data. Private chat screening, retroactive scans, SMTP delivery and legacy import remain separate work.

## Review checkpoint

The user approved tasks 1–9 and 11. Task 9 is complete; task 11 is prepared with container runtime verification still pending. Task 10 is deferred. No public deployment is authorized. The original completion year remains unconfirmed; do not turn the 2022 course-folder reference into a claimed completion date.
