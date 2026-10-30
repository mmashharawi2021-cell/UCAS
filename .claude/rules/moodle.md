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
- One limited exception: a run on the live moodle.ucas.edu.ps is allowed only when every condition below holds. Unattended, scheduled or CI runs stay forbidden there, as does any run the owner is not present for.
  - The owner explicitly approves that specific run. Approval of an earlier run does not carry over.
  - It uses the owner's own account, with the owner present and signing in by hand.
  - It only reads: nothing is clicked or submitted inside Moodle.
  - It runs at a normal usage pace.
  - No cookies or session data are saved.
- A changed extension needs a version bump in `companion-extension/manifest.json` and its README. Keep the site working with the previous extension version.
