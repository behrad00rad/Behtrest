# Tasks 1–4 verification

Verified October 9, 2026 on Windows, Python 3.12, and Node 24.21.0.

## Automated checks

```powershell
# From repository root
.\.venv\Scripts\python.exe backend/manage.py check
.\.venv\Scripts\python.exe backend/manage.py makemigrations --check --dry-run
.\.venv\Scripts\python.exe backend/manage.py test accounts collection
cd frontend
npm run build
```

- Django system check: no issues.
- Migration drift: no changes detected.
- Fresh database migrations: applied successfully.
- Backend tests: 29 passed. Each run uses Django's separate test database and temporary image storage.
- React/TypeScript production build: passed.
- Demo command: repeated successfully in tests without duplicating synthetic records; demo accounts have unusable passwords by default.
- Legacy dependencies and build: reproduced; existing warnings documented in `LEGACY.md`.

Coverage includes password hashing/validation, account normalization, profile creation, forged-cookie rejection, owner-only edits/deletes, private-board visibility, JSON/method errors, CSRF enforcement, IP/account/write throttles, unique saves/boards/users, foreign keys, Django admin views, and reset email generation/token consumption/session invalidation.

## Browser checks

- Registered a synthetic local account through React and reached the signed-in home screen.
- Incorrect password produced useful feedback; a valid password signed in.
- Logout returned to login and remained logged out after a full reload.
- Signed-in home displayed the backend health result as connected.
- Password-reset request displayed its generic success state; no external email was sent.
- Reviewed sign-in and registration at desktop and mobile widths (1280 and 390 pixels).
- Saved V1 login/registration and V2 sign-in screenshots in `docs/screenshots/`.

The password-reset confirmation is covered by backend tests; a real user's password was not changed. This first milestone did not include deployment, V1 data import, uploads, or collections.

![V2 desktop sign-in](screenshots/v2-login-desktop.jpg)

![V2 mobile sign-in](screenshots/v2-login-mobile.jpg)

## Tasks 5–8 verification

Verified October 9, 2026 using the same commands above:

- 47 backend tests passed in the final run, including the repeatable 24-post demo seed.
- Django system checks and migration drift checks passed.
- TypeScript and Vite production build passed after formatting.
- Added tests cover normalized image contents and thumbnails, orientation/metadata removal, invalid/oversized uploads, CSRF and ownership, failed storage/database writes, transaction rollback, durable deletion retries, and avatar replacement/removal.
- Collection tests cover equal-timestamp cursor ordering, inserted-post exclusion, cursor signatures/filter scope, comment ownership, private-board visibility, idempotent saves, board covers, tag limits, source URL validation, search, and public profile privacy.

Browser checks with a synthetic local account confirmed image selection/preview and publication, metadata and source rendering, comment creation, saving into a newly created private board, selecting its cover, profile editing and uploaded-pin display, pin search, and people search. The feed advanced beyond its first page. Reviewed feed layouts at 1280 × 900 and 390 × 844; saved screenshots below. Destructive actions and avatar lifecycle are covered by backend tests.

The browser journey was manual; a repeatable end-to-end test and CI remain task 9. All runtime test accounts, images, and V2 database records are ignored by Git. V1 source and data remain untouched; no import or deployment was performed.

![V2 desktop feed](screenshots/v2-feed-desktop.jpg)

![V2 mobile feed](screenshots/v2-feed-mobile.jpg)

## Tasks 9 and 11 release candidate

Verified October 9, 2026:

- Backend: 54 tests in the final suite. Backup tests round-trip into a separate empty directory, validate image references/checksums, reject missing media and tampered/traversal archives, and refuse overwriting data. Production tests reject weak secrets, HTTP/mismatched origins, wildcard hosts, and incompatible/missing SMTP configuration.
- Both Playwright desktop and mobile journeys passed using installed Edge. Each run starts Django against a new temporary database/media directory on port 8001 and Vite on 5174. Chromium's download endpoint returned a regional 403; no browser download workaround was used. CI installs bundled Chromium.
- Browser coverage: registration, upload preview/publication, comments, native dialog Escape/focus restoration, private-board creation/save/cover, profile and avatar updates, stable multi-page feed without duplicate cards, pin/people search, simulated API failure/retry/no-results, logout/reload, and private-board rejection after logout.
- Axe WCAG 2 A/AA and 2.1 A/AA rules passed on registration, feed, detail, save dialog, board, profile/boards, and people results at desktop/mobile dimensions. The test checks horizontal document overflow and captures screenshots. Automated accessibility checks do not prove complete accessibility.
- Polished low-contrast footnote text, underlined account links, decorative mobile artwork, labels for hidden mobile navigation text, textarea/select focus, selected filters, dialog focus restoration, and profile refresh behavior that previously interrupted avatar editing.
- Frontend formatting, TypeScript/Vite build, Python compilation, Django system checks, and migration drift checks passed.
- Docker Compose configuration validation passed using an ignored synthetic environment. Production `check --deploy --fail-level WARNING` passed, with only two intentionally silenced HSTS policy checks (`security.W005` and `security.W021`), documented in `DEPLOYMENT.md`.
- The disposable recovery script passed fresh migrations → seeding → backup → verified restore, recovering 24 pins, 4 boards, 24 saves, and 48 normalized image/thumbnail files.

CI is configured for backend checks/tests, frontend formatting/build, browser journeys, and container build/HTTPS smoke checks. No repository remote was pushed and no CI run is claimed. Docker Desktop's engine was unavailable locally despite a startup attempt; the container job must run on an available engine before publishing. SMTP credentials, real delivery, DNS, and a live server have not been configured or tested.

Task 9 is complete. Task 11 is prepared for review with container runtime verification pending. Task 10 and public deployment remain deferred; V1 data/source were not changed.

![Verified desktop feed](screenshots/v2-verified-feed-desktop.png)

![Verified mobile feed](screenshots/v2-verified-feed-mobile.png)
