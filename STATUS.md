# UCAS 1.7.0 — Moodle course file import

The Chrome Companion 0.2 extension can scan the student's permitted Moodle lecture resource links (including folder/page/book attachments), preview a file catalog, transfer selected supported attachments as bounded chunks, and store them in UCAS's local IndexedDB library. The user must update the extension and click to consent to downloading. The old 0.1.0 extension has no file transfer API. No passwords, cookies, grade records, private submissions or tokens are read or transferred. The Moodle system can refuse downloads, and 35 MiB/file and browser storage quotas apply.

Desktop local files do not automatically appear on Android; optional authorized cloud sync is separate. No live authenticated UCAS Moodle test account was available for end-to-end verification.
