# Latest: v0.5 — Drive-assisted import, 28 October 2026

## v0.4.1 — Moodle MHT/MHTML import from mobile Chrome

- Accepts `.mht` and `.mhtml` plus `.html` and `.htm`.
- Parses multipart Chrome snapshots in-browser and discards raw archives.
- Adds MIME extraction unit tests and PWA cache v5.
- Direct Moodle API connection is still not available.

# Development status — 27 October 2026

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
