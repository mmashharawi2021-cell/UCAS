---
paths:
  - "companion-extension/**"
  - "js/companion.js"
  - "js/companion-files.js"
  - "js/moodle.js"
  - "js/moodle-connect.js"
  - "js/mhtml.js"
  - "moodle-connect.html"
  - "docs/MOODLE_CONNECT.md"
  - "tests/companion*"
  - "tests/moodle*"
---

# Area: Moodle integration (Chrome Companion, MHT import, OAuth connector)

- Owner: the `ucas-moodle-integration` subagent. Reviewer: `ucas-security` for any change to extension permissions, message or sender checks, URL validation, or what crosses from Moodle to the site.
- Skill: `lecture-processing` for anything that ends up in the study library.
- Never run tests or agents against the live moodle.ucas.edu.ps. Fixtures and fake extension messages prove logic only. Live results come from the student's own run.
- A changed extension needs a version bump in `companion-extension/manifest.json` and its README. Keep the site working with the previous extension version.
