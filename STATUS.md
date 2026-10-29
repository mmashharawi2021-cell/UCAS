# UCAS status — 30 Oct 2026

**Deployed (`main`): UCAS 1.7.0 with Chrome Companion 0.2.** The branch `feat/companion-p1` adds unreleased work on top: it is not merged or deployed, and its version stamp is still 1.7.0.

On the branch, the Chrome Companion is **0.5.0**:

- It scans the student's permitted Moodle lecture resources (including folder/page/book attachments and files embedded in pages) and returns a per-course scan report.
- It transfers the files the student selects, up to **200 MiB per file**, in 512 KiB chunks into UCAS's local IndexedDB library. Larger files, or files the browser has no room for, are saved as a link to their Moodle page.
- DOCX, PPTX and XLSX files transfer. Each file gets its own result, and **إعادة محاولة** retries only the failed ones. An expired Moodle session stops the run with one sign-in message.
- During sync it reads each assignment's due date and the student's own submitted state, so UCAS can warn about overdue work and work due soon.

The student must install the updated extension and explicitly choose the files to download. No passwords, cookies, grade records, other students' data or tokens are read or transferred. Moodle can refuse downloads, and browser storage quotas apply.

Backups are now a ZIP (format v2). Older app versions cannot restore v2 backups, while v1 JSON backups still restore.

## Upgrade test (the most important check)

`npm run test:upgrade` runs `tests/upgrade-browser.mjs` with one command:

- It serves the old release straight from git on `127.0.0.1:8098`. The default is `main`; set `UPGRADE_FROM=<ref>` for another release.
- It saves a file with that release, switches the same address to the working tree, and checks that the new release opens with the file intact and the IndexedDB schema at version 4.
- Set `CHROME_PATH` to the local Chrome on Windows and macOS. Port 8098 must be free.

It is not in CI yet, which is planned after 2.0.

## Not verified yet

- No live UCAS Moodle account has been used end to end. All Moodle tests use simulated pages and messages.
- No student has used the app yet.
- Desktop files do not appear on Android automatically. Optional cloud sync is separate.
