# Architecture

Static site, no build step. `index.html` loads `js/app.js` as an ES module; every other module is imported from there. Hosted on GitHub Pages.

## Modules

| File | Responsibility |
| --- | --- |
| `js/app.js` | State, page rendering (template strings), event delegation (`handleClick` / `handleSubmit` / `handleChange`), study panel, quizzes. |
| `js/store.js` | IndexedDB access, schema/migrations, storage persistence, backup/restore. **The only module that touches IndexedDB.** |
| `js/study.js` | Offline search, flashcards and definition quizzes over imported course text. Pure functions + `loadCourseText`. |
| `js/pdf-text.js` | Text extraction from text PDFs via pinned PDF.js (CDN, lazy). |
| `js/ocr.js` | Optional OCR for scanned PDFs via pinned Tesseract.js (CDN, lazy, user action only). |
| `js/office.js` | DOCX/PPTX text extraction (ZIP + XML, `DecompressionStream`). |
| `js/moodle.js`, `js/mhtml.js` | Parse pasted Moodle text and saved MHT/MHTML course pages. No network. |
| `js/drive.js` | File validation for imports and Google Drive link normalisation. |
| `js/ics.js` | Minimal single-event `.ics` parser. |
| `sw.js` | Service worker: network-first pages, stale-while-revalidate static files. Caches the app shell only. |

## Rendering model

`state` (in `app.js`) holds everything the UI shows. `refresh()` reloads it from IndexedDB, then `render()` rebuilds the page HTML. User text is **always** passed through `esc()` before going into a template; file text is inserted with `textContent`. Keep both rules for any new UI.

Event handling is delegated from `document` using `data-*` attributes (`data-go`, `data-action`, `data-view-resource`, …). To add a button, give it a `data-action="…"` and add a `case` in `handleClick`.

## Data model (IndexedDB `ucas-academic-bridge`, version 2)

| Store | Key | Notes |
| --- | --- | --- |
| `courses` | `id` | `{ id, title, code, createdAt }` |
| `resources` | `id` | Files and links. **Metadata only**: `{ id, kind: 'file'\|'link', name, type, size, courseId, module, hash, url?, hasFile, addedAt, completed }`. Index: `courseId`. |
| `files` | `id` | `{ id, blob }` — content of the resource with the same `id`. |
| `tasks` | `id` | Assignments/due dates. Index: `courseId`. |
| `events` | `id` | Imported calendar events. |
| `attempts` | `id` | Quiz results. Index: `courseId`. |
| `progress` | `id` | Progress records. |
| `settings` | `id` | Key/value rows: `seeded`, `question-bank`, `quiz-draft`, `last-backup`, … |

`store.js` hides the resources/files split: `put('resources', { …, blob })` writes both stores in one transaction; `get('resources', id)` returns the record with its `blob`; `all('resources')` returns metadata only; `getFile(id)` returns just the blob; `remove`/`replaceAll` keep both stores consistent.

### Changing the schema

1. Bump `VERSION` in `store.js`.
2. In `onupgradeneeded`, add the new stores/indexes and a migration guarded by `event.oldVersion`.
3. Add a browser test that creates the previous version and checks the migration (see `tests/storage-browser.mjs`).
4. Keep the backup format readable by older versions, or bump the backup `version` and keep accepting the old one in `restore()`.

## Releases

The version number lives in four places and a unit test enforces they match: `package.json`, `APP_VERSION` in `js/app.js`, `VERSION` in `sw.js`, and the `?v=` query strings in `index.html`. Changing `sw.js` is what makes installed copies update.

## External code

Only two third-party libraries, both loaded lazily from pinned CDN URLs and allowed by the CSP in `index.html`: PDF.js 4.10.38 (cdnjs) and Tesseract.js 7.0.0 (jsDelivr). Any new external origin must be added to the CSP deliberately.
