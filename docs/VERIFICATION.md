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

The password-reset confirmation is covered by backend tests; a real user's password was not changed. No deployment, V1 data import, upload API, live feed, or full board UI was performed.

![V2 desktop sign-in](screenshots/v2-login-desktop.jpg)

![V2 mobile sign-in](screenshots/v2-login-mobile.jpg)
