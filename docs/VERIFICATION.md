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
