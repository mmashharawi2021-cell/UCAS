# UCAS Academic Bridge — v1.1.0

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

## Features

- Responsive RTL layout, light/dark/auto theme, desktop sidebar and mobile bottom navigation; installable PWA.
- Courses with modules, resources and completion tracking.
- Import: PDF/DOCX/PPTX/TXT/MD files, web links, Google Drive links and files picked from Drive, Moodle course pages saved as MHT/MHTML or pasted text, `.ics` calendar events.
- In-app previews: PDF (native viewer), text, DOCX/PPTX text extraction.
- Per-course study assistant: local search over TXT/MD/DOCX/PPTX and text PDFs with page references; optional in-browser OCR (Arabic/English) for scanned PDFs; flashcards and definition quizzes from `Term: definition` lines.
- Tasks, weekly view, in-app reminders; practice question bank and quiz history; progress metrics.
- Data protection: persistent-storage request, storage usage meter, backup reminder, JSON backup/restore (files included).
- **Timetable**, **lecture notes** with highlights, **Pomodoro study timer** with per-course study time.
- **Exam dates with countdown**, **timed mock exams**, **smart review** of wrong answers, **question import** (text/CSV).
- **Grade book and weighted average** (semester and cumulative), **weekly report**.
- **Course packs** to share notes/questions with classmates; **phone-calendar export** with reminders.
- **Personal:** semester plan pre-filled (codes, credit hours), semester archive with cumulative average, **sync between your devices** (email link), **AI lecture assistant** (Gemini: summaries, exam questions, Q&A), code blocks with highlighting in notes.
- **Study groups** with live chat (nickname only, invite code/link) and **push notifications** while the app is closed (optional, online).

## Not included (by design or not built yet)

- No Moodle login, API access or scraping; no Google Drive OAuth/auto-sync.
- No guaranteed source-grounded AI citations or multi-file retrieval yet; existing Gemini function requires deployment verification and a security review — see [docs/SECURE_AI_GATEWAY.md](docs/SECURE_AI_GATEWAY.md).
- No recurring ICS *import*.

## Security & privacy

- Never enter Moodle passwords or tokens in the app. Only import material you are allowed to copy.
- Core study data is local-first in IndexedDB. Optional sync uploads study records and files to an account-private Supabase bucket; groups store metadata and chat; AI sends the selected lecture text and question to Gemini after explicit consent. An unlocked browser profile can expose local study data. JSON backups are unencrypted.
- Clearing site data deletes everything — keep backups.
- PDF.js and Tesseract.js are loaded from pinned public CDN versions on first use and process content locally unless the user chooses cloud sync or explicitly invokes the AI assistant. Do not share Moodle credentials.
- Never commit API keys, personal study files or backups to this public repository.

## Docs

- [CHANGELOG.md](CHANGELOG.md) — release history
- [CONTRIBUTING.md](CONTRIBUTING.md) — workflow, conventions, release checklist
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — modules, data model, service worker
- [docs/PRIVACY_DATA_FLOWS.md](docs/PRIVACY_DATA_FLOWS.md) — data flows and controls
- [docs/PREMIUM_BLUEPRINT.md](docs/PREMIUM_BLUEPRINT.md) — Premium roadmap and release gates
- [SECURITY.md](SECURITY.md) — security reporting and protection checklist
- [دليل_التشغيل.md](دليل_التشغيل.md) — دليل الاستخدام بالعربية
