# Preview playground

A separate demonstration app with 24 reviewed photographs, four fictional creators, public boards, comments, starter saves, and a clearly labeled sample conversation. Photography is credited in each pin description with a link to its original source. Photos come from [Lorem Picsum](https://picsum.photos/), which provides Unsplash photography and author/source metadata.

The normal app keeps its existing database, media, account validation and referral policy. Guest access is disabled there. No existing accounts or synthetic fixtures are replaced. The earlier mobile CSS fix remains in the working tree.

## Start locally

Install the normal project dependencies first, then run from the repository root:

```powershell
.\.venv\Scripts\python.exe scripts/fetch_preview_photos.py
.\.venv\Scripts\python.exe scripts/preview_server.py
```

In a second terminal:

```powershell
cd frontend
$env:API_PROXY_TARGET='http://127.0.0.1:8002'
npm run dev -- --port 5175
```

Open **http://127.0.0.1:5175/login**. Choose **Explore as a guest**, or create a preview account with a username and a password of at least six characters. Preview signup does not ask for an email, password confirmation or referral code. Usernames and ownership checks still apply. Sample creators have unusable passwords; guests are ordinary users with no administrator permissions.

Each new guest gets a unique identity, a starter board, a follow, and a sample conversation. Reloading preserves their session. Signing out ends guest access; choosing guest again creates a fresh identity. A preview account with a password can sign back in. Guest accounts are not automatically deleted; this local playground is persistent and shared, so public contributions are visible to other visitors. Use fictional data. The sample conversation does not generate replies.

State is stored only under ignored `.local/preview/`; downloaded source photos and metadata are under `.local/preview-photos/`. Separate session/CSRF cookie names keep normal and preview logins independent even on the same hostname. The photo fetcher runs only during setup; requests serve local normalized WebP images and thumbnails. Seeding is repeatable and refuses normal settings.

The normal development login links to port 5175. For a built normal frontend, set `VITE_PREVIEW_URL` to the preview login URL at build time. A built frontend omits that link unless configured. The preview API must use `config.preview_settings`; setting a frontend URL alone never enables guest authentication.

This is a local preview, not a publicly deployed service. Public hosting needs a separate demo database/storage, HTTPS, secure cookies, host/origin configuration, upload/moderation policy and a cleanup/reset schedule. Do not publish these localhost/debug settings as production settings. Preview signup sends no email and does not support email-based account recovery.

## Focused verification

```powershell
cd backend
..\.venv\Scripts\python.exe manage.py test accounts.test_preview accounts.tests accounts.test_referrals
```

The tests use disposable test databases and cover disabled normal-app guest access, CSRF, separate unprivileged guest identities, simple preview registration, unchanged normal account/referral rules, starter content and repeatable credited photo seeding.

Verified October 26, 2026: all 26 focused backend tests passed; frontend formatting and production build passed; Django checks, migration drift and diff whitespace checks passed. Local Edge journeys passed at 390px and 1440px: guest entry, all 24 lazy-loaded photos, saving to the starter board, sample conversation and message send, composer viewport bounds, sign-out, and two-field signup. Login Axe A/AA checks and cross-port session isolation passed in both journeys; signup also fits at 320px. Screenshots were inspected. Browser-driver timing/selector issues in the initial verification script were corrected before the final passing runs. Physical-phone behavior and the full existing browser/backend suites were not rerun. Nothing was publicly deployed or committed.
