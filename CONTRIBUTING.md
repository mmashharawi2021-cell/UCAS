# Contributing

## Setup

Requirements: Node.js 22+, Python 3 (for the static server), Chrome/Chromium for browser tests.

```bash
npm install
npm start                  # http://localhost:8080
```

## Workflow

1. Branch from `main`: `feature/<name>`, `fix/<name>` or `chore/<name>`.
2. Make the change; keep pull requests focused.
3. Run `npm run format` then `npm run check` (format check + lint + unit tests).
4. If you touched UI, storage or the service worker, run the browser tests:
   ```bash
   npm run serve:test &
   CHROME_PATH=/usr/bin/google-chrome npm run test:browser
   ```
5. Open a pull request into `main`. CI must be green before merging.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `perf:`, `docs:`, `test:`, `chore:`, `style:`.

## Rules that must not be broken

- **Escape user content.** Use `esc()` for anything interpolated into HTML; use `textContent` for file text.
- **IndexedDB only through `js/store.js`.** Schema changes need a version bump, a migration and a migration test (see `docs/ARCHITECTURE.md`).
- **No secrets in the browser.** The site is public; never add API keys or tokens. AI features go through a server gateway as described in `docs/SECURE_AI_GATEWAY.md`.
- **No credential handling for Moodle or Google.** No login forms, cookies or tokens for third-party sites.
- **New external origins** (CDNs, APIs) must be pinned and added to the CSP in `index.html`.
- **Honest UI.** Do not label features as AI, sync or official grades unless they are.

## Adding a feature

See "Feature modules" in `docs/ARCHITECTURE.md`: pure logic in `js/lib/` (with unit tests), UI in `js/features/`, register it in `js/features/index.js`, and list both files in `SHELL` in `sw.js`.

## Release checklist

1. Update `version` in `package.json`, then run `npm run stamp` — it writes the version into every module import, `APP_VERSION`, the service worker and `index.html` (unit tests fail if anything is out of sync).
2. If a new file is part of the app shell, add it to `SHELL` in `sw.js`.
3. Add an entry at the top of `CHANGELOG.md`.
4. Merge to `main`; GitHub Pages publishes automatically.

## Project layout

```
index.html, styles.css, sw.js, manifest.webmanifest
js/            application modules (see docs/ARCHITECTURE.md)
assets/        icons
tests/         *.test.mjs = Node unit tests; *-browser.mjs, mobile-layout.mjs = Playwright tests
docs/          architecture and design notes
```
