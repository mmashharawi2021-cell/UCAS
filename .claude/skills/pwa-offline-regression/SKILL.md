---
name: pwa-offline-regression
description: Verify UCAS PWA service-worker updates, offline startup, IndexedDB upgrades and backup integrity.
---
# Workflow

1. Compare package version with app.js APP_VERSION, sw.js VERSION, index query versions and JS module imports.
2. Verify sw.js shell contains every imported feature module and that old caches cannot strand a mixed release.
3. Test new installation, upgrade from prior release and offline open after at least one successful network visit.
4. Seed sample courses, documents, quizzes and notes; verify they survive upgrade, save/restore and service-worker recovery.
5. Check no user files are stored in service-worker caches and no cloud account is mandatory to study.
6. Run unit and browser tests; report precise browser/environment and unavailable scenarios.

Deliver: results by scenario and rollback steps if a regression occurs.
