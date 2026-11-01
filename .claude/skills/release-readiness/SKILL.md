---
name: release-readiness
description: Review UCAS release CI, student-data safety, documentation, PWA version consistency, deployment and rollback.
---
# Workflow

1. Inspect the PR diff and risks in IndexedDB, cloud sync, Supabase and consent.
2. Require format, lint, Node unit and Playwright browser test success on the exact PR head commit.
3. Verify update-sensitive version stamps and backup/restore migration strategy.
4. Check secret scan, privacy notices, architecture and changelog reflect implemented behavior.
5. Confirm an authorized reviewer approved production changes; never self-approve risky SQL or access-control changes.
6. After merge, independently confirm GitHub Pages deploy completed successfully before announcing the live URL.
7. Provide regression rollback procedure and unresolved blockers.

Deliver: pass/block verdict with evidence links, exact commit and deployment status.
