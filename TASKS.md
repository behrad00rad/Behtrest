# Bintrest V2 task plan

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

## Deferred ideas

- Following users and a following feed.
- Reporting/moderation before opening registration broadly.
- Notifications and collaborative boards.
- Personal notes on saves and drag-and-drop organization.
- Related posts by tag, color browsing, and duplicate-image detection.
- Optional automatic tagging.
- Messaging and complex recommendations only if usage justifies them.

## Review checkpoint

The user approved tasks 1–9 and 11. Task 9 is complete; task 11 is prepared with container runtime verification still pending. Task 10 is deferred. No public deployment is authorized. The original completion year remains unconfirmed; do not turn the 2022 course-folder reference into a claimed completion date.
