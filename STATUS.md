# UCAS status — 30 Oct 2026

**Deployed (`main`): UCAS 1.7.0 with Chrome Companion 0.2.** The branch `feat/companion-p1` holds the unreleased **2.0.0**: it is not merged or deployed yet.

## What 2.0.0 adds

- **Empty first run:** no sample courses or pre-filled semester. A first-run panel offers sync from Moodle or adding a course by hand. Profiles from older releases are untouched (schema 4, no migration).
- **Chrome Companion 0.5.0:** per-course scan report, Office files, files up to **200 MiB** (larger ones saved as a Moodle link), per-file results with retry, one sign-in message on an expired session, and assignment due dates plus the student's own submitted state.
- **Long lectures:** PDFs are read up to 200 pages / 350,000 characters for search and cards, with a note when a file is cut ("قُرئت أول 200 صفحة من 250").
- **AI requests stay capped** at the first 60,000 characters, the same limit as the Edge Function, and the consent shows the exact course name, file name and pages that will be sent.
- **ZIP backups (format v2).** Older app versions cannot restore v2 backups; v1 JSON backups still restore.
- **CI gate:** "UCAS quality checks" runs unit, browser and upgrade tests; `pages.yml` deploys only after it passes, once Pages is switched to GitHub Actions.
- Planned in 2.0 before release: the loading screen (logo assembles, name appears, both move into place).

## Upgrade test

`npm run test:upgrade` serves the old release from git on `127.0.0.1:8098` (default `main`, or `UPGRADE_FROM=<ref>`), switches the same address to the working tree, and checks that the courses, grade rows and settings the old release wrote are identical after the upgrade, raw rows included. Set `CHROME_PATH` on Windows and macOS. CI runs it on every push and pull request to main.

## Verified

- Live run on the owner's own UCAS Moodle account, with the owner present and signing in by hand (30 Oct 2026): extension connection, sync (10 courses linked in 111 s), assignment due dates and submitted state (checked by the owner), file scan (15 files), scan report (checked by the owner), import of 4 PDFs, opening a file, and re-import without duplicates all passed.
- Unit, browser and upgrade tests pass locally on Windows with Chrome.

## Not verified yet

- No student has used the app yet.
- Step 10 of the live run (study cards from an imported PDF) showed zero cards with no message; the same PDF gives 7 cards when tested alone. Unexplained; to be reproduced on the next live run.
- Expired Moodle session on the live site (step 12).
- A real Android phone, Safari on iPhone, and files over 35 MB from Moodle.

## Right after the 2.0 deploy

1. Two-device sync trial with the owner present (`docs/testing/SYNC_TWO_DEVICES.md`).
2. Conditional: if it fails because the sync migration `20261028211000_personal_sync_and_ai.sql` is not applied in production, apply it with the owner's approval, then repeat the trial.

## بعد 2.0

Deferred by the owner until after the 2.0 release:

- Student trial on phones (the owner will try it with friends after publishing; the HTTPS tunnel plan is no longer needed for it). Sheets: `docs/testing/STUDENT_TRIAL.md`, including the long-lecture timing on Android (add a progress indicator if opening the study screen takes over 2 s).
- Live run step 12 (expired session) and the step 10 reproduction.
- Navigation simplification and hiding unused features, decided from the trial results.
- Splitting `js/app.js`; recording decisions in `docs/DECISIONS.md`.
- Caching PDF.js for offline use, Moodle courses whose sections live on separate pages, forum attachments.
- Clean-up: the 10 old ESLint warnings and the stale `tests/smoke.py`.
- AI Edge Function hardening (production change, needs separate approval): strip line breaks from the course and file names, and neutralise the lecture-text delimiter inside the text (security review m4).
- Publish the Moodle Companion on the Chrome Web Store, so students install and update it without Developer mode.
- An in-app warning when the installed Companion is older than the site needs. Today only the scan report shows the extension version, plus a hint for versions before 0.3.0.
- Sync account switching (A → B → A) on the same browser can restore a previously deleted file. Account-scoped pending Storage deletions do not provide full isolation of the shared local study records; use one account per browser profile until this is addressed.
- Clearing this device's data does not delete the cloud copy; the next sync downloads it again.
- Bound the number of per-file sync problems shown in Settings and add retry backoff after 2.0.
