# Project status — v0.8.0 (28 October 2026)

Working, offline-first static web app published from `main` via GitHub Pages. Release history: [CHANGELOG.md](CHANGELOG.md).

## Quality gates

- Unit tests (`npm test`): ICS, Moodle/MHTML parsing, Drive links, study search, PDF/OCR helpers, static checks, version consistency, PWA icons.
- Browser tests (`npm run test:browser`, CI): mobile layout 320–768px, storage migration + backup round-trip + data-protection UI, study assistant, PDF search.
- CI on every push/PR: syntax, Prettier, ESLint, unit tests; Playwright tests on PRs and relevant pushes.

## Roadmap (suggested order)

1. **Split `js/app.js`** into page modules (`js/pages/*.js`) and shared UI helpers; it is still ~1,900 lines.
2. **Partial re-rendering** so typing, scroll position and focus survive state changes.
3. **Home page on mobile**: compact horizontal course list instead of six full cards; global search across course text.
4. **Accessibility audit** (keyboard focus in modals, contrast in dark mode, screen-reader labels for icon buttons).
5. **Optional encrypted backup** (password-derived key with Web Crypto).
6. **Cloud sync (opt-in)** and **AI gateway** — only with a backend; follow `docs/SECURE_AI_GATEWAY.md`. Never put keys in this repository.

## Known limitations

- First PDF search / OCR needs internet to download PDF.js / Tesseract.js (cached afterwards).
- ICS: single events only; recurrence and arbitrary time zones are not expanded.
- No scheduled notifications while the app is closed.
- Storage persistence is granted at the browser's discretion; installed PWAs are usually granted it. Keep backups.
