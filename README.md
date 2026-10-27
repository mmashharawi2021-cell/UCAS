# UCAS Academic Bridge — v0.1 (local-first prototype)

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
