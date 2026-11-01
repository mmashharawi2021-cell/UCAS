---
paths:
  - "package.json"
  - "package-lock.json"
  - "scripts/**"
  - ".github/workflows/**"
  - "CHANGELOG.md"
  - "STATUS.md"
---

# Area: release, CI and versioning

- Reviewer: the `ucas-release` subagent before a branch is called ready or a version is announced. Skill: `release-readiness`.
- Change the version only with `scripts/stamp-version.mjs` after editing package.json. Dependency changes need the owner's approval, and the lockfile must be updated with them.
- Git commit, push and tag, gh, and deployment need the owner's explicit approval; `.claude/settings.json` makes them ask.
