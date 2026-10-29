# Changelog — UCAS Academic Bridge

## Unreleased

- Moodle Companion 0.4.0:
  - The per-file limit rises from 35 MiB to 200 MiB, with 512 KiB transfer chunks and a 40-minute download timeout.
  - Larger files, or files the browser has no room for, are saved as a link to their Moodle activity or course page. That page address is the only Moodle address the site receives.
- Moodle Companion 0.3.0 (source added in `companion-extension/`):
  - Accepts Office Open XML files that 0.2.0 refused because their MIME type contains "xml". Markup and script types are matched exactly and still refused.
  - Waits for each course page to load before reading it, retries while the page script loads, and stops the whole scan with one message when the Moodle session has expired.
  - Downloads embed, frame and pop-up resources through `redirect=1`, with a fallback to the resource page's own file link. Discovers files embedded in pages.
  - Returns a counts-only report per course; the service worker sanitizes it again before the site sees it.
  - Closes transfer tabs left behind by timed-out downloads.
- Site:
  - Per-course scan report (`js/lib/moodle-diagnostics.js`), including a fallback for extension 0.2.
  - Per-file transfer results with retry; one sign-in message for an expired session.
  - Step-specific timeouts and messages (file scan 10 min, file download 8 min).
- Tests:
  - Service-worker unit tests with a fake Chrome API (`tests/companion-extension.test.mjs`).
  - A content-script browser test on simulated Moodle pages with network access blocked (`tests/companion-extension-browser.mjs`).
  - Diagnostics unit tests, and site tests for the report and retry.

- Backups are now a stored ZIP (format v2): files are written as raw entries instead of base64 inside one JSON string, so large libraries no longer hit the browser string limit (420 MB of files failed as JSON with "Invalid string length" and succeeded as ZIP in local Chrome testing). Restore verifies a CRC-32 per file and stays all-or-nothing; legacy v1 JSON backups still restore. Older app versions cannot read v2 backups.
- Browser tests run on Windows/macOS Chrome (Web Share fallback), CI installs from package-lock.json and runs the full browser suite on every push to main.
- Claude Code configuration (CLAUDE.md, .claude/agents wrappers) and documentation fixes for Moodle Companion file import.

## v1.7.0 — Moodle course file transfer (29 Oct 2026)

- Add file-catalog preview and explicit selected-file transfer from Chrome Moodle Companion 0.2 to IndexedDB study library.
- Add chunked transfer, progress and cancellation, 35 MiB per-file guard, quota checks, SHA-256 deduplication and source updates.
- Discover resources and folder/page/book attachments with an authenticated student session; do not collect private grades, submissions, cookies, session secrets or arbitrary URLs.
- Provide separate desktop Chrome extension ZIP; previous Chrome Companion 0.1 must be updated.

## v1.7.0 — Desktop Moodle Companion integration (29 Oct 2026)

- Added Chrome extension bridge on the Moodle and Import pages; import sanitized course and activity metadata from an authenticated browser session.
- Added duplicate-safe local course matching and assignment-link import without fabricating due dates.
- Added opt-in hourly snapshot scans in the extension while desktop Chrome and Moodle session are active; imports when UCAS is opened.
- Explicitly clarify that Chrome Android, grades, and protected lecture-file downloads are not supported by this extension release.

## v1.7.0 — Moodle Connect integration foundation (29 Oct 2026)

- Add a dedicated read-only Moodle Connect page with OAuth 2 public client + PKCE state verification and no local token persistence.
- Add student-course synchronization with validation and duplicate prevention, when university-approved OAuth and REST API are configured.
- Keep the connect button disabled until UCAS Moodle grants official client ID/scopes/endpoints/CORS. No Moodle passwords or unsupported credential workarounds.
- Preserve manual imports, offline support and backup data, add OAuth validators and security documentation.

## v1.4.0 — Mobile usability refinement (29 Oct 2026)

- Reduce mobile header and homepage hero height; preserve accessible controls.
- Convert the secondary home dashboard (calendar, progress, focus, exams, recent sources, Moodle) into a native expandable section on phones, open by default on desktop.
- Display two complete, compact course cards on home instead of cropped horizontal cards, with access to the full course library.
- Condense quick actions, statistics, upcoming tasks and the optional backup reminder without hiding crucial data.
- Provide a clear close button, scrollable sidebar navigation, and hide the bottom bar while the drawer is open.
- Maintain offline caches and student data, with expanded mobile and browser regression tests.

## v1.4.0 — Premium UI 2.0 (29 Oct 2026)

- Rebuild the home experience with a prominent editorial study hero, actual resource-completion ring, prominent shortcuts, structured priorities, courses and activity feeds.
- Redesign course cards, course library, summary and responsive layout with instant local course filtering.
- Rebuild Gemini course tab into a study studio: source controls, summary/test actions, example prompts, accessible chat composer and guest onboarding.
- Preserve explicit consent before cloud requests, local-first data handling, existing course navigation and academic workflows.
- Add a separate versioned Premium design stylesheet to the PWA offline shell and expand mobile/browser regression tests.

This is a substantial visible UI redesign, not a claim of completed production security/load auditing.

## v1.2.0 — Premium foundation (28 Oct 2026)

- Added a live dashboard with next assignment, upcoming exam, resume-course action and real source progress.
- Added a compact touch-friendly mobile course rail and Premium design refinements.
- Added explicit, source-specific opt-in before sending lecture text or questions to Gemini.
- Corrected privacy copy and documented optional Supabase cloud processing and security boundaries.
- Expanded unit and browser regression tests. Full Premium features and production security/load audits remain separate stages.

## v1.1.0 — Personal study (28 Oct 2026)

- **Your Fall 2026/2027 plan pre-filled:** course codes (GISS 2307 …), credit hours (19) and 55 previously passed hours; codes shown on course cards. Written as defaults that never override a real edit.
- **Semesters:** "إنهاء الفصل" archives the term with its marks into a history, hides its courses (files and notes kept) and starts the next term; cumulative average combines the hours/average entered before using the app with every archived term. "Add course" now takes a code and credit hours.
- **Sync between your devices** (email magic link): every change is timestamped locally (IndexedDB v4 adds deletion markers); last-write-wins two-way sync of all study data, lecture files in a private Storage bucket; automatic on changes, on open and when leaving the app. Nickname-only accounts cannot sync. An existing nickname account is upgraded in place by adding the email (groups/push kept).
- **AI lecture assistant (Google Gemini)**, course tab «مساعد AI»: summarise a lecture (save as a note), generate exam questions (add to the question bank, so they feed mock exams and smart review), ask questions. The key lives only in Supabase secrets; only allowed emails; 60 calls/day; only the selected lecture's text is sent.
- **Code in notes:** fenced ``` blocks are syntax-highlighted (Python/JS/SQL/C-like) with a copy button, every token escaped.
- Fixed: an empty "previous average" no longer counts as 0 in the cumulative average.
- Tests: `tests/personal.test.mjs`; `tests/personal-browser.mjs` runs two browsers (phone + laptop) against one simulated server.


## v1.0.1 — Upgrade fix (28 Oct 2026)

- **Fixed:** after updating, phones that had opened an older version could show «تعذر تشغيل التخزين المحلي» because the browser mixed the new app with an old cached `store.js`.
- Every module import now carries the release version (`./store.js?v=1.0.1`), so two releases can never be mixed. `npm run stamp` applies it; a unit test enforces it.
- Service worker: static files are now network-first (cache only when offline).
- New `js/boot.js` guard: if the app fails to start online, it removes old service workers and caches, re-downloads the app files and reloads once.
- New `tests/upgrade-browser.mjs`: opens an old release under its service worker, switches the server to the new release and checks the app starts with data intact (verified from v0.7.3 and v1.0.0).


## v1.0.0 — Study groups and push notifications (28 Oct 2026)

- **مجموعات الدراسة (Study groups):** nickname-only accounts (anonymous sign-in), create a group for a course, invite classmates with an 8-character code or a `?join=` link (WhatsApp share), live chat with realtime updates, leave/delete group. Explicit consent screen lists what goes online.
- **Push notifications while the app is closed:** opt-in from Settings; reminders for deadlines, exams (plus one day before) and lectures in the next 14 days, and new group messages. Only reminder titles/times are uploaded; reminders are re-synced automatically when local data changes; one tap disables and deletes them from the server.
- **Backend (Supabase):** six tables with row-level security, invite/join functions, rate limits, `push` edge function (VAPID keys generated server-side, secret never leaves the database), `pg_cron` every minute. See `supabase/README.md`.
- Security verified live with three real accounts: outsiders can't see or post to groups, can't spoof profiles or read the push secret; members see only group-mates' nicknames.
- Service worker shows push notifications and opens the right page on tap. CSP allows only this project's Supabase origin.
- Tests: `tests/cloud.test.mjs` (incl. a guard that no service-role key is ever in browser code) and `tests/groups-browser.mjs` (full UI flow against an in-memory Supabase stand-in).


## v0.9.0 — Student features (28 Oct 2026)

**Daily study**
- **Timetable** (جدول المحاضرات): weekly lectures with room, lecturer and type; today highlighted; overlap warnings; weekly hours per course; "today's lectures" card on Home.
- **Lecture notes** (ملاحظاتي, new course tab): colour highlights, pin, search, share; safe mini-formatting (`**bold**`, `==highlight==`, `- bullets`) applied after escaping.
- **Pomodoro study timer** (مؤقت المذاكرة): 25/5/15 presets, per-course study time, daily streak; survives reloads and screen-off; notification when a session ends.

**Exam preparation**
- **Exam dates** with live countdown and urgency colours.
- **Timed mock exam**: all questions on one page, sticky timer, auto-submit at zero, answers saved as you go.
- **Smart review** (Leitner boxes 0→1→3→7→14→30 days): every wrong answer from practice quizzes and mock exams comes back until mastered.
- **Question import** from pasted text (Arabic `س:` / `أ)` / `الإجابة:` format) or CSV, with preview, error report and duplicate skipping.

**Academic tracking**
- **Grade book & average** (العلامات والمعدل): weighted components per course, official final mark override, target → "you need X% in the rest", semester and cumulative averages weighted by credit hours, configurable pass mark.
- **Weekly report**: study time, tasks done/overdue, practice results, notes, exams next week; share as text or print to PDF.

**Sharing & reminders**
- **Course packs**: share a course's notes, questions, timetable and exam dates as a small file (WhatsApp/Drive/…) and import a classmate's pack with validation and de-duplication. No files, marks or history are ever included.
- **Phone calendar export** (.ics with alarms, weekly lecture recurrence until semester end): reminders work even when the site is closed.
- **In-app reminders** before deadlines, exams and lectures while the app is open.

**Platform**
- IndexedDB v3: `schedule`, `notes`, `sessions`, `exams`, `grades`, `reviews` stores (indexed by course). Backups include them; backups from v0.8 still restore.
- New `js/features/` (one module per feature, plugged in through a small registry) and `js/lib/` (pure, unit-tested logic). Shared UI helpers moved to `js/ui.js`.
- Five-item bottom bar on phones: Home, Timetable, Courses, Exams, More.
- Tests: 9 new unit-test groups and an end-to-end browser test covering every feature.

**Not included (needs a server):** live study groups/chat between students, push notifications while the app is fully closed.


## v0.8.0 — Data safety, performance and developer setup (28 Oct 2026)

**Data safety**
- Requests persistent storage (`navigator.storage.persist()`) after the first file import and from a new **حماية البيانات والمساحة** panel in Settings, so the browser does not silently evict study files when the device is low on space.
- Settings now shows storage used/available, persistence state and the date of the last backup.
- Home shows a backup reminder when there is data and no backup in the last 7 days.
- Clear messages when the database is upgraded in another tab or blocked by an old tab.
- Theme preference no longer crashes the app when `localStorage` is blocked.

**Performance**
- IndexedDB schema v2: file contents moved to a separate `files` store. Lists, search and dashboards no longer load file blobs; a file is read only when opened, downloaded, searched or OCR'd. Existing v1 data is migrated automatically on first load.
- `courseId` indexes on resources, tasks and attempts, plus a `byCourse()` helper.
- Backup encodes files with the browser's native `FileReader` instead of building huge strings. The backup file format is unchanged (still version 1), so old and new versions can restore each other's backups.

**PWA**
- PNG icons 192/512, a maskable icon and an `apple-touch-icon` for reliable install on Android and iOS.
- Service worker uses stale-while-revalidate for static files, and its cache name follows the app version.

**Developer setup**
- Code formatted with Prettier; ESLint flat config; `.editorconfig`.
- `npm run check` (format + lint + unit tests), `npm run test:browser`, `npm start`.
- CI runs format check, lint and unit tests on every push/PR; browser tests now also run on PRs and include the new storage migration test.
- New `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`; README rewritten; history moved here.

---

## Earlier releases

### v0.2 improvements (2026-10-27)

- Local DOCX/PPTX text preview in supported browsers using ZIP/XML + DecompressionStream (not original Office layout). Extracted document text is not sent to a server.
- Local editable question bank for all courses, optional answer explanation and cited lecture reference, and one-question-at-a-time quizzes.
- Quiz draft persistence across reloads, answer retention on Previous/Next, resume/discard, saved results linked to courses.
- Per-course progress metrics: completed resources, tasks, quiz attempts and average practice score (not official grades).
- Cache version v2 and network-first navigation to propagate GitHub Pages updates while keeping offline shell fallback.

Limitations: Office preview needs browser support for deflate-raw; encrypted/ZIP64 Office files and large parts are not supported. User data remains local and backups must be kept. There is no live Moodle, Google Drive OAuth or external AI integration.


### v0.3.0 — Motion and Moodle-first import

- Light fade-in and blur between sections, interactive button/card hover and press states, modal backdrop blur, and toast fade-out. `prefers-reduced-motion` is honored.
- Dedicated **Moodle UCAS** page with official login link, explicit steps and a local-only form to paste *course content the student is allowed to copy*. Saves the text as a `.txt` resource for its selected course, with duplicate detection.
- Moodle tab is the default in Import Center; shortcuts to file, ICS and links remain available.
- **No direct Moodle authentication, scraping or automatic synchronization.** This is a student-controlled import path, not a claim of direct API access. Never paste passwords, access tokens or other students' private data.
- Static PWA cache version bumped to v3; user files remain in the same IndexedDB database.

The website's GitHub Pages code is public. IndexedDB study notes stay locally in each browser profile, but anyone with access to that profile can read them. Back up before clearing website storage.


### Chrome Android: import Moodle MHT / MHTML (v0.4.1)

- On your phone, open a **course page** in the official Moodle site and use Chrome **Save page**. Chrome may save `.mht` or `.mhtml` instead of `.html`.
- In UCAS Academic Bridge, open **Moodle UCAS → Import course page**, select that file, review the extracted activities, choose the target course and import.
- Only the HTML component is decoded in the browser. Raw MHT, embedded images, passwords and session tokens are **not** saved or uploaded. Activity links are limited to approved UCAS URLs with only numeric activity IDs.
- Maximum MHT file: 25 MB, extracted HTML: 4 MB. This is a local manual import, not automatic Moodle syncing or access to protected attachments.


### v0.5 — Google Drive-assisted study import (October 28, 2026)

The central **Google Drive** tab is now usable in the browser without a UCAS account:
- Open Google Drive in a separate official browser tab.
- Select PDF/DOCX/PPTX/TXT/MD documents from the device's file picker. On supported Android devices, the system picker can show Google Drive as a source. If it is unavailable, first download the file from the Drive app.
- Choose the UCAS course and module; import into IndexedDB, with SHA-256 duplicate checks and 30 files/35 MB per-file caps.
- Paste a Google Drive or Google Docs/Slides/Sheets link; normalize it to a canonical HTTPS URL, strip query parameters and fragments, and store it as a course reference locally.
- Existing local resource/quiz/task storage is unchanged; no new sign-in or paid API.

**Limits**: This release does NOT browse a Drive account, auto-sync Drive folders, download private Drive files by URL, or connect to Moodle. True Google Picker/OAuth integration needs a configured Google Cloud project, restricted credentials and explicit user authorization. The Drive link stores a pointer, not the file content; users need their normal Google access to open it. Avoid storing shared links to sensitive materials in a shared browser profile.

### Acceptance test on Android
1. Open UCAS > مركز الاستيراد > Google Drive.
2. Choose a PDF from Android Files (select Google Drive as the source if offered); select a course and import.
3. Open the course and view the imported file.
4. Open the same import form and re-import to confirm duplicate detection.
5. Paste an allowed Google Drive file or Docs URL, save it in the course, then open it using the browser. File import and link saving remain completely separate.


### v0.6 — Course study and grounded offline practice (28 October 2026)

- The assistant button inside each course now opens a **local source-study panel**.
- A user-initiated search reads locally imported TXT/MD and extracts text from DOCX/PPTX (when supported by the browser), returning **literal source excerpts with filename and module**. It does not generate factual answers.
- Supports study flashcards and basic multiple-choice practice **only when imported sources contain clear \`Term: definition\` lines**. These are mechanical drafts; verify scientific accuracy before treating them as exam preparation.
- A separate, explicit copy action lets the user paste a query and source excerpts into ChatGPT. There is **no automatic file upload** or ChatGPT API integration in the website.
- PDF remains **view-only** in this release: scanned and text PDFs are not searched by the local study tool. Source links without locally stored text are also excluded from search.
- No sign-in, no external AI credentials, no background cloud processing. Private study data stays in this browser profile.

### Using the course study tool
1. Import a readable TXT, DOCX, or PPTX into a course through the Import Center.
2. Open **مساقاتي**, select the same course, tap the floating **المساعد الذكي** button.
3. Search for a topic. Inspect the displayed excerpts and source file names.
4. Optional: reveal definition flashcards, create simple definition practice, or copy selected excerpts to ChatGPT yourself.

### Security and functional limitations
The project is a publicly hosted static web application; **the locally imported content is not committed to the public repository**. Other people with access to the same browser profile can potentially access the local database. No automatic Moodle or Google Drive OAuth sync is implemented. Real OpenAI-generated answers would require a private, authenticated API gateway that does not expose paid service keys to visitors. The new study features deliberately do not make misleading claims about AI.


### v0.7 — PDF source-text search (28 October 2026)

The per-course study assistant now searches imported **text PDFs** as well as TXT, DOCX and PPTX. PDF extracts are processed in the browser; matches display the PDF filename and page number. Extraction is capped at **45 pages**, **120,000 characters** and a **35 MB file**. Documents with scanned images but no selectable text are not processed; OCR remains outside the release.

On first PDF search, the browser downloads a **pinned Mozilla PDF.js v4.10.38** library from Cloudflare cdnjs, so internet access is required for first use and when not cached. The selected PDF content is supplied to PDF.js in memory and is **not uploaded to a website or AI provider**. There is no paid OpenAI integration. Source text is treated as untrusted, and browsing/course files stay in local IndexedDB. The source is under `js/pdf-text.js`, with test coverage in `tests/pdf.test.mjs` and `tests/pdf-browser.mjs`.

**Future AI gateway:** read `docs/SECURE_AI_GATEWAY.md`. A static public GitHub Pages website must not hold an OpenAI API key or expose an unrestricted paid endpoint. No authorization mechanism or backend was deployed.

### v0.7.3 — Experimental Arabic/English OCR recovery (28 Oct 2026)

- If text extraction fails or the PDF contains no readable text, the study panel now offers **تجربة OCR للملف** after checking the course's imported documents. OCR runs **only on user request**. It renders up to three PDF pages in memory on the device and passes canvases to Tesseract.js 7.0.0 in-browser.
- The browser downloads the pinned OCR engine and Arabic/English language packs from public CDNs. These downloads require internet, can be large, may take time and use battery; the PDF bytes/canvases are not sent to those CDNs.
- Results are **unverified** and labeled as such. They are **never used to automatically generate correct answers for multiple-choice tests**. The user must compare the extracted text with the original file.
- OCR data is temporary in the current study session, not uploaded or saved as a new source. Use the normal downloaded/original files for long-term accuracy.
- OCR is experimental on Android and requires a browser with Canvas/WebWorkers/WebAssembly. A positive browser smoke test covers **button availability and safety**; unit tests simulate OCR recognition. The exact Arabic PDF shown in the user's screenshots has not been tested as an uploaded file.
- There is no new login and no paid AI service.

---

## Historical development status (v0.1–v0.7)

Latest: v0.7 — searchable PDF text with page references, 28 October 2026

### Latest: v0.5 — Drive-assisted import, 28 October 2026

## v0.4.1 — Moodle MHT/MHTML import from mobile Chrome

- Accepts `.mht` and `.mhtml` plus `.html` and `.htm`.
- Parses multipart Chrome snapshots in-browser and discards raw archives.
- Adds MIME extraction unit tests and PWA cache v5.
- Direct Moodle API connection is still not available.

### Development status — 27 October 2026

## Completed — implementation batch 1

- Native, dependency-free browser application prototype (v0.1.0)
- Responsive Arabic RTL shell and all agreed navigation destinations
- Seven default course titles; real user content must be imported
- IndexedDB local data schema, file blob persistence, structured backup and atomic restore
- File/link/ICS imports, basic duplicate checks, PDF preview, practical task and quiz flows
- Theme preference, progress indicators, and PWA shell
- Six source-level/logic automated tests passed

## Environment blockers

- npm registry DNS/network blocked (`EAI_AGAIN`). This prevents installing Next.js/Tailwind and building the **approved production stack** now.
- Chromium via Playwright blocked navigation to `localhost` and even `file://` (`ERR_BLOCKED_BY_ADMINISTRATOR`). Browser screenshot and end-to-end UI verification therefore **not completed** here.
- A Playwright smoke script is supplied to rerun on a machine with browser access.

## Deferred — not completed

- Production migration to Next.js + TypeScript + Tailwind/shadcn/ui
- Cloud Drive Picker OAuth, Moodle service API (not assumed available to students)
- Secured AI backend/RAG and prompt-grounding
- Full native Office preview, advanced ICS recurrence/timezones, actual scheduled notifications
- Mobile Safari/Chrome and desktop browser QA + accessibility/performance audits
- Public hosting and paid integrations (not authorized)

## GitHub repository

Project source is prepared for publication to the user-provided public GitHub source repository. GitHub Pages and application hosting are not enabled; repository visibility alone makes source code public, not the application website. Do not commit user-uploaded study files, backups, credentials, or API keys.

## Next approved milestone

Execute browser QA locally, address issues, then migrate the verified components to Next.js once dependencies are installable. Do not deploy or activate paid APIs without separate authorization.

## v0.2 milestone
Office DOCX/PPTX text preview, saved quiz drafts and local question bank, detailed per-course progress, cache update. Deployment depends on GitHub commit and Pages build.


### v0.3.0 — motion and Moodle prioritization
- Implemented: page Fade + Blur, click/hover effects, modals, toasts, reduced motion support.
- Implemented: dedicated Moodle screen, manual text import into coursework, shortcuts to files/ICS/links, duplicate protection.
- Verified: Node unit and static tests. Automated browser access to localhost blocked by environment policy (ERR_BLOCKED_BY_ADMINISTRATOR); manual phone/browser acceptance remains outstanding.
- Not implemented: Moodle API or auto sync, remote auth, external AI integration.


## v0.5 — Drive-assisted import: implemented

- New central Google Drive tab with native Android file chooser and canonical Drive links.
- Course-specific saving of selected PDF/DOCX/PPTX/TXT/MD files; file size/count limits, hash-based deduplication.
- Google Drive, Docs, Slides and Sheets links can be saved as local references; URL parameters are removed.
- Mobile-first layout; no passwords, OAuth tokens or academic files committed to GitHub.
- New unit tests for Drive URL validation and file constraints. CI runs syntax checks and all tests.

**Not implemented:** Google Drive OAuth Picker automatic browsing and cloud synchronization; AI backend/automatic quizzes from uploaded lectures; direct Moodle API. Initial v0.4 MHT importer remains but is not a development priority. Test Android system picker availability on user device; Chrome version and installed document providers affect it.


## v0.7 verification

- Added bounded, browser-side PDF text reading with cited page numbers in study excerpts.
- PDF.js v4.10.38 is loaded from a pinned third-party CDN when first needed; offline-first PDF search is not yet guaranteed.
- GitHub Actions includes a real PDF browser extraction smoke test and unit tests for no-text scanned PDFs, bounds, and course isolation.
- Scanned PDFs/OCR and AI-generated answers remain unsupported. The secure AI integration boundary is documented at `docs/SECURE_AI_GATEWAY.md`; no gateway or credential has been configured.

## v0.7.3 — experimental OCR recovery

- Optional Arabic+English OCR for first 3 PDF pages on-device when normal text extraction fails.
- The browser loads the engine and language packs from pinned Tesseract CDNs; user-initiated only, no automatic network upload of PDF data.
- OCR passages are marked unverified and excluded from definition-based answer keys.
- Unit tests and Chrome UI smoke test validate fallback controls. Real-world recognition on the user's Arabic summary PDF remains unverified because the original PDF was not uploaded.
