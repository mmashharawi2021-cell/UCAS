# UCAS view of the repository catalog

Use with the `stack-selection` skill, `../01-REPOSITORIES/SELECTION-POLICY.md` and `../01-REPOSITORIES/CATALOG.json` when a change seems to need a new library, tool or service. The catalog lists candidates, not dependencies: every entry has `license_verified: false` and `security_audited: false`. Check the license, release, maintenance and security status first, then record an ADR and get the owner's approval before installing anything.

| Need in UCAS | Catalog entry | Status for UCAS |
| --- | --- | --- |
| Browser and E2E tests | Playwright | In use (`playwright-core`, pinned in package.json) |
| Accessibility checks | axe-core | Candidate for Phase 5 browser tests (new devDependency, needs approval) |
| Front-end performance budget | Lighthouse CI | Candidate, local runs only |
| Load tests | Grafana k6 | Local or authorized staging only; never GitHub Pages, Supabase, Gemini or Moodle |
| Secret scanning | Gitleaks | Candidate CI gate |
| Dependency vulnerabilities | OSV Scanner | Candidate CI gate (package-lock.json now exists) |
| Static analysis | Semgrep | Candidate CI gate |
| DAST | OWASP ZAP | Baseline only, against a local or owned staging copy |
| Backend | Supabase | In use for optional features |
| UI frameworks and helpers | React, Vite, Tailwind CSS, shadcn/ui, Recharts, TanStack Query, Zod | Not adopted: the app stays Vanilla JS with no build step |
| Maps | MapLibre, PostGIS | Not applicable |
| AI coding clients | Goose, Cline, Codex CLI and others | Not needed: Claude Code is the client |
| Agent frameworks | Mastra, LangGraph, CrewAI and others | Not needed: orchestration uses Claude Code subagents |
| Skill collections | Superpowers | Already installed at the owner's user level; don't add it again |
| Skill collections | Anthropic Skills | Format reference only |
| Skill collections | Other skill collections | Not needed; `evaluate_link` entries are unverified |
| MCP servers | See `MCP.md` | Not enabled |
