# Bintrest

A blue, dark-themed Pinterest-inspired app, originally built by Amirhossein Ghazanfari Rad at age 13 as a CS50x final project.

[Original video demo](https://youtu.be/EODyZn-WkIM) · [Original README](docs/README-original.md) · [V2 task plan](TASKS.md)

## Why I made it

At the time, I wanted a dark theme for Pinterest because using its bright interface was annoying. Blue was my favorite color, so I made my own version with blue accents instead of red. I built it for fun and to put what I learned in CS50x into practice.

Connecting React, a Python API, a database, accounts, image uploads, and comments was part of learning to build a complete application. The original code represents where I was as a programmer at 13, including its unfinished features and mistakes.

## History

- **Original project:** built at age 13 for CS50x. The project folder references the 2022 course; the exact completion date has not been confirmed.
- **October 9, 2026:** revisited the project, initialized a local Git repository, and planned a second version using Django and React.

The original README is preserved verbatim in `docs/README-original.md`, including its wording and acknowledgments. Original source remains in `btrest/`. V2 implementation has not started.

## Original version (v1)

**Stack:** React 18, Tailwind CSS, DaisyUI, ejected Create React App, Flask, and SQLite through the CS50 SQL library.

Features include registration/login, JPG/PNG image posts with titles and descriptions, a masonry-style feed, experimental infinite scrolling, post details, comments, and basic profile information.

Known limitations:

- The backend trusts browser-provided identity and does not enforce authenticated ownership.
- Password handling uses a homemade SHA-256 scheme.
- Registration responses and the default avatar URL contain bugs.
- Infinite scrolling repeats the full feed rather than fetching new pages.
- Search, saved posts, full profiles, notifications, and messaging are unfinished.
- API addresses are hardcoded to localhost; error handling and upload validation are incomplete.

V1 is a historical learning prototype and is not ready for public deployment.

## Repository layout

```text
btrest/back/             Original Flask API and local data
btrest/front/            Original React app and build configuration
docs/README-original.md  Unedited original project description
TASKS.md                 Proposed V2 tasks and completion criteria
```

The supplied database and generated frontend build remain locally available but are excluded from Git, along with dependencies, Python bytecode, and runtime uploads. The database has not been inspected for personal data.

## Running the original app

These are expected commands from the source, not a verified setup guide. Frontend dependencies and the Flask, Flask-CORS, and CS50 packages were missing during review. Reproducing V1 is the first implementation task.

Backend, in a virtual environment with `flask`, `flask-cors`, and `cs50` installed:

```powershell
cd btrest/back
python app.py
```

Frontend, in another terminal:

```powershell
cd btrest/front
npm ci
npm start
```

The source expects the API at `http://127.0.0.1:5000` and frontend at `http://localhost:3000`. The backend needs its local database and image directory. Avoid real credentials with V1.

## Planned second version

Preserve the dark/blue identity while rebuilding the backend with Django and modernizing React with Vite. Start with authenticated accounts, safe image posts, comments, pagination, profiles, boards, saves, and search.

Use one backend and one frontend, same-origin session authentication with CSRF protection, and SQLite for initial development. Production storage choices will depend on deployment requirements.

[V2 tasks](TASKS.md) describe the sequence, acceptance criteria, and deferred ideas. Implementation waits until the task plan has been reviewed.

## Acknowledgments

Thank you to Harvard for CS50x, the CS50x Rasht team, and Mr. Tavasoli for helping me learn computer science. These acknowledgments carry forward from the original README.
