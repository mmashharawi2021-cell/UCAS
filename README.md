# UCAS Academic Bridge — v0.7 (local-first prototype)

Arabic RTL single-user study dashboard. A **working offline-first web prototype** implementing the initial UI and local storage, **not** an integration with private Moodle sessions. No account, tracking, remote server, or API keys.

## Run locally

Node.js installed:

```bash
npx http-server . -a 127.0.0.1 -p 8080 -c-1
```

Or with Python:

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

Visit `http://localhost:8080` from the same computer. Do **not** open `index.html` via `file://`, since browser modules and IndexedDB usage are better supported over localhost. No `npm install` is needed for this functional prototype.

## Implemented

- Responsive Arabic RTL layout, navy/white identity, desktop collapsible sidebar and mobile bottom navigation
- Auto/light/dark theme; seven course titles already configured (only titles, no invented lectures or grades)
- Course cards, expandable lecture modules, course completion checkboxes
- Import PDF/DOCX/PPTX/TXT/MD files into IndexedDB, with SHA-256 duplicate detection
- Native in-page PDF preview and text preview; office files are stored, open/download available, no fake DOCX/PPTX preview
- Import web video/lecture links and open safely, no scraping of protected course pages
- Import single events from `.ics`; warns about recurrence/timezone limitations
- Tasks, due dates, completion status, weekly overview and in-app upcoming alerts
- Sample original GIS practice questions, one question at a time, marking and local attempt history
- Progress analytics (activity metrics, not official grades)
- Local export/import of backup JSON, including file blobs, and deletion of all local data
- Installable manifest and local service worker for caching web shell
- AI floating button displays truthful disabled state; Google Drive direct OAuth is not connected

## Scope limitations

**Not built yet:** Next.js/TypeScript production architecture, shadcn/Tailwind migration, Google Drive Picker/OAuth, AI backend and RAG, Moodle API, recurring ICS expansion, native DOCX/PPTX in-page previews, real scheduled notifications, automated data migration and deployment pipeline.

Reason for no Next.js compile at this stage: dependency registry was unreachable in execution environment; the user gets a fully running dependency-free prototype rather than non-verifiable Next source. Next milestone is migrating tested UI to approved Next.js/TypeScript stack when npm is available.

## Security and privacy

- Do not enter Moodle passwords or private tokens. Open the official site separately.
- Saved local data is accessible to other people who can access the browser profile; backup is unencrypted.
- All data stays in the device's IndexedDB. Cloud syncing is absent. Clearing site data may destroy files.
- Only import permitted class materials. PDFs are displayed with browser's native viewer.
- Browser-supplied HTML and data are escaped before insertion into UI; saved URLs are limited to HTTP(S).
- No AI key is embedded in the browser.
- Service worker caches public shell files only, not user data.

## Testing

Automated browser tests provided in `tests/smoke.py`; run after starting server and installing Playwright and Chromium. This v0.1 does not constitute production security or accessibility certification.


## v0.2 improvements (2026-10-27)

- Local DOCX/PPTX text preview in supported browsers using ZIP/XML + DecompressionStream (not original Office layout). Extracted document text is not sent to a server.
- Local editable question bank for all courses, optional answer explanation and cited lecture reference, and one-question-at-a-time quizzes.
- Quiz draft persistence across reloads, answer retention on Previous/Next, resume/discard, saved results linked to courses.
- Per-course progress metrics: completed resources, tasks, quiz attempts and average practice score (not official grades).
- Cache version v2 and network-first navigation to propagate GitHub Pages updates while keeping offline shell fallback.

Limitations: Office preview needs browser support for deflate-raw; encrypted/ZIP64 Office files and large parts are not supported. User data remains local and backups must be kept. There is no live Moodle, Google Drive OAuth or external AI integration.


## v0.3.0 — Motion and Moodle-first import

- Light fade-in and blur between sections, interactive button/card hover and press states, modal backdrop blur, and toast fade-out. `prefers-reduced-motion` is honored.
- Dedicated **Moodle UCAS** page with official login link, explicit steps and a local-only form to paste *course content the student is allowed to copy*. Saves the text as a `.txt` resource for its selected course, with duplicate detection.
- Moodle tab is the default in Import Center; shortcuts to file, ICS and links remain available.
- **No direct Moodle authentication, scraping or automatic synchronization.** This is a student-controlled import path, not a claim of direct API access. Never paste passwords, access tokens or other students' private data.
- Static PWA cache version bumped to v3; user files remain in the same IndexedDB database.

The website's GitHub Pages code is public. IndexedDB study notes stay locally in each browser profile, but anyone with access to that profile can read them. Back up before clearing website storage.


## Chrome Android: import Moodle MHT / MHTML (v0.4.1)

- On your phone, open a **course page** in the official Moodle site and use Chrome **Save page**. Chrome may save `.mht` or `.mhtml` instead of `.html`.
- In UCAS Academic Bridge, open **Moodle UCAS → Import course page**, select that file, review the extracted activities, choose the target course and import.
- Only the HTML component is decoded in the browser. Raw MHT, embedded images, passwords and session tokens are **not** saved or uploaded. Activity links are limited to approved UCAS URLs with only numeric activity IDs.
- Maximum MHT file: 25 MB, extracted HTML: 4 MB. This is a local manual import, not automatic Moodle syncing or access to protected attachments.


## v0.5 — Google Drive-assisted study import (October 28, 2026)

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


## v0.6 — Course study and grounded offline practice (28 October 2026)

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


## v0.7 — PDF source-text search (28 October 2026)

The per-course study assistant now searches imported **text PDFs** as well as TXT, DOCX and PPTX. PDF extracts are processed in the browser; matches display the PDF filename and page number. Extraction is capped at **45 pages**, **120,000 characters** and a **35 MB file**. Documents with scanned images but no selectable text are not processed; OCR remains outside the release.

On first PDF search, the browser downloads a **pinned Mozilla PDF.js v4.10.38** library from Cloudflare cdnjs, so internet access is required for first use and when not cached. The selected PDF content is supplied to PDF.js in memory and is **not uploaded to a website or AI provider**. There is no paid OpenAI integration. Source text is treated as untrusted, and browsing/course files stay in local IndexedDB. The source is under `js/pdf-text.js`, with test coverage in `tests/pdf.test.mjs` and `tests/pdf-browser.mjs`.

**Future AI gateway:** read `docs/SECURE_AI_GATEWAY.md`. A static public GitHub Pages website must not hold an OpenAI API key or expose an unrestricted paid endpoint. No authorization mechanism or backend was deployed.

## v0.7.3 — Experimental Arabic/English OCR recovery (28 Oct 2026)

- If text extraction fails or the PDF contains no readable text, the study panel now offers **تجربة OCR للملف** after checking the course's imported documents. OCR runs **only on user request**. It renders up to three PDF pages in memory on the device and passes canvases to Tesseract.js 7.0.0 in-browser.
- The browser downloads the pinned OCR engine and Arabic/English language packs from public CDNs. These downloads require internet, can be large, may take time and use battery; the PDF bytes/canvases are not sent to those CDNs.
- Results are **unverified** and labeled as such. They are **never used to automatically generate correct answers for multiple-choice tests**. The user must compare the extracted text with the original file.
- OCR data is temporary in the current study session, not uploaded or saved as a new source. Use the normal downloaded/original files for long-term accuracy.
- OCR is experimental on Android and requires a browser with Canvas/WebWorkers/WebAssembly. A positive browser smoke test covers **button availability and safety**; unit tests simulate OCR recognition. The exact Arabic PDF shown in the user's screenshots has not been tested as an uploaded file.
- There is no new login and no paid AI service.
