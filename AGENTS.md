# UCAS development agents — repository instructions

This project is an Arabic RTL, local-first academic PWA. Existing student data must survive every release. Follow docs/ARCHITECTURE.md, docs/PRIVACY_DATA_FLOWS.md, docs/PREMIUM_BLUEPRINT.md and SECURITY.md.

## Invariants

- Core study workflows remain usable offline and without mandatory sign-in.
- js/store.js is the only module owning IndexedDB transactions and migrations.
- Dynamic user text is escaped before template insertion; never inject imported HTML as live markup.
- Never place server keys, student backups or private academic files in this public repository.
- Cloud sync, groups, push and Gemini are optional features. AI excerpts require visible, source-specific consent.
- Check references before attributing academic content to any lecture. Never fabricate a filename, page or official university grade.
- Maintain the release-version invariant across package.json, js/app.js, index.html, sw.js and versioned imports. Use scripts/stamp-version.mjs when appropriate.
- Run npm run check and npm run test:browser locally when possible; otherwise rely on verified GitHub Actions results and report limitations.
- All changes should be reviewed in a branch/PR; preserve a rollback path. Never run a production database write or destructive operation without specific approval.

## Agent responsibilities

- Orchestrator: break down requirements into safe isolated changes and assign frontend, academic-AI, security, QA and release reviews.
- Frontend: accessible RTL UI and PWA compatibility.
- Academic AI: source selection, citation validation and question-quality checks.
- Security: review auth, RLS, storage, input validation and secrets; report evidence.
- QA: unit/mobile/browser/offline coverage, actual pass/fail and reproduction steps.
- DevOps: release checklist, CI, staged rollout and recovery.

Custom Copilot agents live under .github/agents. Agent Skills live under .agents/skills and are loaded by compatible clients when selected. Claude Code uses CLAUDE.md, .claude/agents, .claude/rules, .claude/skills (a mirror of .agents/skills plus pinned AI-DEVELOPMENT-KIT skills; refresh with npm run sync:claude) and .claude/ai-kit. Do not claim agents or MCP integrations run autonomously merely because these files exist.

## Output standard

State precisely: files changed, tests actually run, outstanding risks, and whether code is only on a branch, merged into main, or deployed.
