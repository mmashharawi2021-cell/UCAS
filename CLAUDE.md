@AGENTS.md

## Claude Code notes

- You are the orchestrator. Delegate bounded work and independent reviews to the subagents in `.claude/agents/`. Where a role also has a profile in `.github/agents/`, that profile stays the source for the role's content, and the Claude agent adds the kit role, tools and skills.
- The source of truth for UCAS Agent Skills is `.agents/skills/<name>/SKILL.md`. `npm run sync:claude` mirrors them into `.claude/skills/`, where Claude Code discovers them, alongside three kit skills. Never edit the mirrors. Read the skill that fits a task before starting it: `ucas-design-system`, `academic-source-validator`, `lecture-processing`, `exam-quality-audit`, `supabase-rls-audit`, `pwa-offline-regression`, `load-performance-audit`, `release-readiness`, and from the kit `stack-selection`, `architecture-review`, `database-rls`.
- Browser tests on Windows: run `npm run serve:test` (or `python -m http.server 8099 --bind 127.0.0.1`) in a separate process and set `CHROME_PATH` to the local Chrome before `npm run test:browser`.
- Never push, open a PR, deploy, or touch the production Supabase project without explicit approval from the owner.

## AI development system (AI-DEVELOPMENT-KIT 1.0.0)

The kit is a separate package (`../AI-DEVELOPMENT-KIT`), never edited from this repository. `.claude/ai-kit/` pins verbatim, hash-checked copies of the parts UCAS uses; see `.claude/ai-kit/README.md`.

Kit paths such as `01-REPOSITORIES/…`, `06-SECURITY/…`, `07-TESTING/…` and `10-PROJECT-CONFIG/…` mean `.claude/ai-kit/…`. Kit `04-SKILLS` are installed in `.claude/skills/`. The filled project profile is `.claude/ai-kit/ucas/PROJECT-PROFILE.yml`. Where kit and UCAS rules differ, follow the stricter one.

Always-on kit policies:

@.claude/ai-kit/AGENTS.md
@.claude/ai-kit/06-SECURITY/SECURITY-POLICY.md
@.claude/ai-kit/07-TESTING/QUALITY-GATES.md
@.claude/ai-kit/02-AI-AGENTS/AGENT-CONTRACT.md

## Orchestration

Method (`.claude/ai-kit/02-AI-AGENTS/ORCHESTRATOR.md`): Discovery → Scope → Design → Delegation → Implementation → Review → Release.

| Task | Owner | Independent reviewer | Skills |
| --- | --- | --- | --- |
| UI, RTL, CSS, mobile | you or `ucas-frontend` | `ucas-qa` | ucas-design-system, pwa-offline-regression |
| Moodle Companion, MHT import, OAuth connector | `ucas-moodle-integration` | `ucas-security` | lecture-processing |
| Supabase, sync, auth, RLS, Edge Functions | `ucas-backend-supabase` | `ucas-security` | database-rls, supabase-rls-audit |
| Academic AI, extraction, citations, questions | you | `ucas-academic-ai` | academic-source-validator, exam-quality-audit |
| IndexedDB, backups, migrations, service worker | you | `ucas-qa` | pwa-offline-regression |
| Performance, memory, load plans | `ucas-performance` | `ucas-qa` | load-performance-audit |
| CI, versions, changelog, release | you | `ucas-release` | release-readiness |
| New dependency, tool or architecture decision | you (built-in Plan agent for design) | `ucas-security` for supply chain | stack-selection, architecture-review |

- Owner's standing rule: the specialist subagents do the work. Give implementation to the matching engineer agent and review to the matching reviewer; you plan, brief, check evidence and report which agent did what. Keep only trivial one-line fixes yourself. Each task gets one owner and at most one independent reviewer, with at most two skills loaded.
- Path-scoped rules in `.claude/rules/` load when you touch an area. They restate that area's owner, reviewer and checks.
- Use the built-in Explore agent for wide searches. Give a specialised agent a bounded brief: goal, files, constraints and the tests to run. It reports back in the AGENT-CONTRACT order. Subagents have restricted tools and can't start further agents.
- For multi-step work, start from `.claude/ai-kit/10-PROJECT-CONFIG/TASK.template.md`. Record approved decisions as ADRs (`DECISION-LOG.template.md`) in `docs/DECISIONS.md`.
- New library, tool or service: use `stack-selection` with `.claude/ai-kit/ucas/SELECTION.md` and the catalog. Never install from the catalog without the owner's approval.
- Report tests as PASS, FAIL, NOT_RUN or NOT_APPLICABLE. Simulated Moodle or Supabase results never count as live verification.

## Approvals (always ask the owner first)

Get the owner's approval before any of these:
- installing or updating dependencies
- enabling MCP servers or new external services
- git commit, push, PR, merge or tag
- deployment
- production Supabase data or settings
- anything run against the live Moodle
- load tests

`.claude/settings.json` turns the riskiest commands into permission prompts and blocks reads of `.env` files and study backups.

## MCP

No MCP server is configured for this project. `claude mcp list` reports none, and there is no `.mcp.json`. In VS Code sessions, the extension's IDE tools (diagnostics) are available. Candidates and their conditions are in `.claude/ai-kit/ucas/MCP.md`. Don't create `.mcp.json` without approval: `claude -p` and cloud sessions start project servers without asking.
