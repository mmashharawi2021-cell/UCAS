# UCAS Academic Bridge — v1.7.0

منصة دراسية شخصية عربية (RTL) لطلاب الكلية الجامعية للعلوم التطبيقية: تنظيم المساقات والمحاضرات والتكليفات والاختبارات التدريبية، وتعمل دون إنترنت ودون حساب.

A local-first, offline-capable Arabic study dashboard. Static HTML/CSS/JS (ES modules), no build step, no tracking. Study data stays in the browser's IndexedDB; optional study groups, push notifications, email-account cloud sync and Gemini AI requests use a Supabase backend ([supabase/README.md](supabase/README.md)).

## Quick start

```bash
npm start            # or: python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://localhost:8080`. Do not open `index.html` via `file://` (modules, IndexedDB and the service worker need http(s)).

## Development

```bash
npm install          # dev tools only: Prettier, ESLint, playwright-core
npm run check        # format check + lint + unit tests (same as CI)
npm run format       # auto-format
npm run serve:test   # serve on 127.0.0.1:8099, then in another terminal:
CHROME_PATH=/path/to/chrome npm run test:browser
```

Read **[CONTRIBUTING.md](CONTRIBUTING.md)** before your first change and **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for how the code is organised.

## Mobile UX 1.4

- On mobile the home page shows concise priorities, two fully visible course cards, and an expandable section for secondary widgets, calendars and reports.
- The menu has a dedicated close button and scrollable items, and no navigation option is permanently hidden.
- Additional stylesheet `mobile-ux.css` remains part of the PWA's offline shell.

## Premium UI 2.0

- A redesigned study home with a real completion ring and practical navigation, redesigned course library with instant filtering, and a Gemini study workspace inside each course.
- Styles in `premium-v2.css` are versioned, cached for offline use and layered above the original `styles.css`.

## Moodle Companion 0.5 — Assignment deadlines (unreleased, branch only)

- During sync the extension reads each assignment's due date and the student's own submitted state. UCAS updates existing Moodle tasks and marks submitted ones done.
- The tasks page, a home-page banner, the bell and a sidebar badge warn about overdue work and work due within two weeks.

## Moodle Companion 0.4 — 200 MiB per file (unreleased, branch only)

- The per-file limit rises from 35 MiB to 200 MiB, with 512 KiB transfer chunks and a 40-minute download timeout.
- Larger files, or files the browser has no room for, are saved as a link to their Moodle activity or course page.

## Moodle Companion 0.3 — Scan report, Office files and retry

- After **فحص ملفات المساقات**, a per-course report explains courses without files. It is built from counts only and lists:
  - the activity types on the course page (links, forums, assignments…);
  - the content pages that could not be opened;
  - files in unsupported formats and untrusted links that were skipped.
  - With extension 0.2 the site falls back to the activity links saved by the last sync and asks for an update.
- DOCX, PPTX and XLSX files with their standard MIME types now transfer; 0.2.0 refused them as unsafe.
- Embed, frame and pop-up resources download through Moodle's `redirect=1` link. Files embedded in pages are discovered.
- Each selected file gets its own result: added, updated, unchanged, failed with a reason, or not transferred.
  - **إعادة محاولة** re-runs only the files that didn't transfer.
  - An expired Moodle session stops the run once, with a sign-in message, instead of failing every file.
- Longer timeouts for slow connections, with messages that name the step that timed out. Leftover transfer tabs are closed automatically.
- The extension source now lives in `companion-extension/`; `npm run pack:companion` builds the distributable ZIP in `dist/`.
- Live verification on a real UCAS Moodle account is still pending. The automated tests use simulated Moodle pages and messages only.

## Moodle Companion 0.2 — Download real lecture attachments

- Desktop Chrome extension can now **discover attachments** in the student's visible Moodle resource activities and folder/page/book materials after official login. It does not read submissions, grades, cookies, passwords or HTML source.
- In the Moodle page, click **فحص ملفات المساقات** to inspect the catalog and select files; then **استيراد الملفات المحددة إلى UCAS** to transfer bytes in bounded chunks directly to local IndexedDB. No Moodle files are published to GitHub.
- Supports PDF/DOC/DOCX/PPT/PPTX/XLS/XLSX/TXT/MD/CSV/ZIP/PNG/JPG/WEBP up to 200 MiB per file (larger files, or files the browser has no room for, are saved as a link to their Moodle page); uses SHA-256 to deduplicate content and update matching sources without losing study completion.
- Downloads are always explicit; opt-in hourly course metadata scan does **not** download files. Chrome must remain open with an authenticated Moodle session; available materials depend on the university site's normal access rules. Files are local to the desktop unless optional account sync is separately configured.
- The current extension is 0.5.0 (on this branch; 0.2.0 on `main`). The old 0.1.0 does not support file transfer.

## UCAS Moodle Companion (optional desktop Chrome extension)

- A separate Chrome Manifest V3 extension scans the student's own Moodle dashboard and visible course activity links after **official Moodle sign-in**. No Moodle API credentials, passwords, cookie access or OAuth authorization are used.
- Moodle page snapshots are sanitized to course names/IDs and allowlisted activity links. An opt-in hourly scan runs only when desktop Chrome is running with an authenticated Moodle session.
- From the Moodle UCAS page, click **مزامنة من Moodle** to import course/activity metadata into local UCAS IndexedDB. New courses are matched to existing study courses without overwriting study materials.
- Metadata sync never downloads files; attachments are transferred only on explicit selection (Companion 0.2, above). No grade collection. Moodle may require reauthentication, and a page-theme change may break extraction.
- **Chrome on Android does not support regular extensions**; desktop Chrome is required. Installing the unpacked extension is a one-time action per computer (updating an unpacked extension requires updating its folder).
- The ZIP of the extension is distributed to the site owner separately; it must not contain personal MHT data or login tokens.

## Moodle Connect (official OAuth, gated)

- Dedicated OAuth Authorization Code + PKCE connector with a student-controlled session, read-only course import and no passwords stored.
- The connection is **not active** without UCAS Moodle administrator registration, scopes, endpoint configuration and CORS approval. Existing manual imports continue working.
- [Activation guide](docs/MOODLE_CONNECT.md).

## Features

- Responsive RTL layout, light/dark/auto theme, desktop sidebar and mobile bottom navigation; installable PWA.
- Courses with modules, resources and completion tracking.
- Import: PDF/DOCX/PPTX/TXT/MD files, web links, Google Drive links and files picked from Drive, Moodle course pages saved as MHT/MHTML or pasted text, `.ics` calendar events.
- In-app previews: PDF (native viewer), text, DOCX/PPTX text extraction.
- Per-course study assistant: local search over TXT/MD/DOCX/PPTX and text PDFs with page references; optional in-browser OCR (Arabic/English) for scanned PDFs; flashcards and definition quizzes from `Term: definition` lines.
- Tasks, weekly view, in-app reminders; practice question bank and quiz history; progress metrics.
- Data protection: persistent-storage request, storage usage meter, backup reminder, ZIP backup/restore with per-file checksums (files included; legacy JSON backups still restore).
- **Timetable**, **lecture notes** with highlights, **Pomodoro study timer** with per-course study time.
- **Exam dates with countdown**, **timed mock exams**, **smart review** of wrong answers, **question import** (text/CSV).
- **Grade book and weighted average** (semester and cumulative), **weekly report**.
- **Course packs** to share notes/questions with classmates; **phone-calendar export** with reminders.
- **Personal:** semester plan pre-filled (codes, credit hours), semester archive with cumulative average, **sync between your devices** (email link), **AI lecture assistant** (Gemini: summaries, exam questions, Q&A), code blocks with highlighting in notes.
- **Study groups** with live chat (nickname only, invite code/link) and **push notifications** while the app is closed (optional, online).

## Not included (by design or not built yet)

- UCAS itself never asks for Moodle credentials and has no active Moodle API access (Moodle Connect is gated); Moodle data arrives only via the optional desktop Companion or manual MHT/text import. No Google Drive OAuth/auto-sync.
- Companion file import has not yet been verified end-to-end against a live UCAS Moodle account.
- No guaranteed source-grounded AI citations or multi-file retrieval yet; existing Gemini function requires deployment verification and a security review — see [docs/SECURE_AI_GATEWAY.md](docs/SECURE_AI_GATEWAY.md).
- No recurring ICS *import*.

## Security & privacy

- Never enter Moodle passwords or tokens in the app. Only import material you are allowed to copy.
- Core study data is local-first in IndexedDB. Optional sync uploads study records and files to an account-private Supabase bucket; groups store metadata and chat; AI sends the selected lecture text and question to Gemini after explicit consent. An unlocked browser profile can expose local study data. Backups are unencrypted.
- Clearing site data deletes everything — keep backups.
- PDF.js and Tesseract.js are loaded from pinned public CDN versions on first use and process content locally unless the user chooses cloud sync or explicitly invokes the AI assistant. Do not share Moodle credentials.
- Never commit API keys, personal study files or backups to this public repository.

## Docs

- [CHANGELOG.md](CHANGELOG.md) — release history
- [CONTRIBUTING.md](CONTRIBUTING.md) — workflow, conventions, release checklist
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — modules, data model, service worker
- [docs/PRIVACY_DATA_FLOWS.md](docs/PRIVACY_DATA_FLOWS.md) — data flows and controls
- [docs/PREMIUM_BLUEPRINT.md](docs/PREMIUM_BLUEPRINT.md) — Premium roadmap and release gates
- [docs/AI_WORKFLOW.md](docs/AI_WORKFLOW.md) — AI client, agents, subagents, skills and MCP usage
- [SECURITY.md](SECURITY.md) — security reporting and protection checklist
- [دليل_التشغيل.md](دليل_التشغيل.md) — دليل الاستخدام بالعربية
