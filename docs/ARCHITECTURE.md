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
| `js/ui.js` | Shared helpers: `esc()`, `ic()` and the icon set. |
| `js/features/*.js` | One module per student feature (timetable, notes, focus timer, exams, grades, report, share, reminders), plugged in through `js/features/index.js`. |
| `js/lib/*.js` | Pure logic for those features (no DOM, no storage) — this is where unit tests point. |
| `js/boot.js` | Classic script loaded before the app: if the app fails to start after an update, clears old service workers/caches and reloads once. |
| `sw.js` | Service worker: network-first for pages and static files (cache = offline fallback). Caches the app shell only. |

## Rendering model

`state` (in `app.js`) holds everything the UI shows. `refresh()` reloads it from IndexedDB, then `render()` rebuilds the page HTML. User text is **always** passed through `esc()` before going into a template; file text is inserted with `textContent`. Keep both rules for any new UI.

Event handling is delegated from `document` using `data-*` attributes (`data-go`, `data-action`, `data-view-resource`, …). To add a button, give it a `data-action="…"` and add a `case` in `handleClick`.

## Feature modules

`js/features/index.js` documents the hooks a feature module can export: `pages`, `homeWidgets`, `courseTabs`, `courseActionButtons`, `settingsPanels`, `actions` (clicks on `[data-act]`), `changes` (`[data-act-change]`), `forms` (submit by form id), `start(ctx)` and `onQuizFinished`. Features receive a `ctx` object from `app.js` (state, render/refresh, storage functions, UI helpers) and never import `app.js`.

To add a feature: put the logic in `js/lib/<name>.js` with unit tests, the UI in `js/features/<name>.js`, register it in `js/features/index.js`, add both files to `SHELL` in `sw.js` (a test enforces this), and add new stores in `store.js` if needed.

> Forms: read a form's id with `form.getAttribute('id')` — a field named `id` inside the form shadows `form.id`.

## Data model (IndexedDB `ucas-academic-bridge`, version 4)

| Store | Key | Notes |
| --- | --- | --- |
| `courses` | `id` | `{ id, title, code, createdAt }` |
| `resources` | `id` | Files and links. **Metadata only**: `{ id, kind: 'file'\|'link', name, type, size, courseId, module, hash, url?, hasFile, addedAt, completed }`. Index: `courseId`. |
| `files` | `id` | `{ id, blob }` — content of the resource with the same `id`. |
| `tasks` | `id` | Assignments/due dates. Index: `courseId`. |
| `events` | `id` | Imported calendar events. |
| `attempts` | `id` | Quiz results. Index: `courseId`. |
| `progress` | `id` | Progress records. |
| `schedule` | `id` | Weekly lectures `{ courseId, day (0=Sun), start, end, type, room, lecturer }`. Index: `courseId`. |
| `notes` | `id` | `{ courseId, title, body, color, lecture, pinned, createdAt, updatedAt }`. Index: `courseId`. |
| `sessions` | `id` | Study timer sessions `{ courseId, kind, minutes, startedAt, endedAt }`. Index: `courseId`. |
| `exams` | `id` | `{ courseId, title, type, date, duration, room, topics }`. Index: `courseId`. |
| `grades` | course id | `{ hours, components[{name, weight, score, max}], finalMark, target }`. |
| `reviews` | question key | Leitner record `{ courseId, q (snapshot), box, due, right, wrong }`. Index: `courseId`. |
| `tombstones` | `store:id` | Deletion markers for sync (local only, pruned after 90 days). |
| `settings` | `id` | Key/value rows: `seeded`, `question-bank`, `quiz-draft`, `last-backup`, … |

Every write is stamped with `_mtime` (`put(store, row, { mtime })`; defaults use `mtime: 0` so real edits always win) and every delete leaves a tombstone; `js/cloud/sync.js` uses them for two-way sync.

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
