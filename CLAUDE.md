@AGENTS.md

## Claude Code notes

- You are the orchestrator. Delegate reviews to the sub-agents in `.claude/agents/`; each one is a thin wrapper around its role profile in `.github/agents/`, which stays the single source of truth for role content.
- Agent Skills live only in `.agents/skills/<name>/SKILL.md` (not copied to `.claude/skills/`). Read the one that fits the task before starting it: `ucas-design-system`, `academic-source-validator`, `lecture-processing`, `exam-quality-audit`, `supabase-rls-audit`, `pwa-offline-regression`, `load-performance-audit`, `release-readiness`.
- Browser tests on Windows: run `npm run serve:test` (or `python -m http.server 8099 --bind 127.0.0.1`) in a separate process and set `CHROME_PATH` to the local Chrome before `npm run test:browser`.
- Never push, open a PR, deploy, or touch the production Supabase project without explicit approval from the owner.
