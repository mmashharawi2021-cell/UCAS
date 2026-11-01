---
paths:
  - "js/store.js"
  - "js/lib/zip.js"
  - "js/cloud/sync.js"
  - "js/boot.js"
  - "sw.js"
---

# Area: student data safety (IndexedDB, backups, migrations, service worker)

- These files can lose student data. Make the smallest change you can and keep old data readable: the existing IndexedDB versions and the legacy backup formats.
- Reviewer: the `ucas-qa` subagent, which runs `tests/storage-browser.mjs`, `tests/upgrade-browser.mjs` where possible, and the unit tests. Skill: `pwa-offline-regression`.
- A schema change needs a new IndexedDB version with an upgrade path and a browser test that upgrades from the previous version. Never test with real backups.
