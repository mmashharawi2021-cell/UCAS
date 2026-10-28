# Changelog — UCAS Academic Bridge

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
