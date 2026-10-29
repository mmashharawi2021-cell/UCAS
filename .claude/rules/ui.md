---
paths:
  - "index.html"
  - "moodle-connect.html"
  - "*.css"
  - "manifest.webmanifest"
  - "js/app.js"
  - "js/ui.js"
  - "js/features/**"
  - "assets/**"
---

# Area: UI, RTL and PWA screens

- Owner: you for small edits, or the `ucas-frontend` subagent for a multi-file UI task. Reviewer: `ucas-qa` when layout or behaviour changes.
- Skills: `ucas-design-system`, plus `pwa-offline-regression` if sw.js or module imports change.
- Checks: `npm run check` and `tests/mobile-layout.mjs`, plus the browser test for the touched feature. Keep `esc()` on every dynamic string, add new modules to the `sw.js` SHELL, and don't let any viewport overflow horizontally.
