# UCAS — AI clients, agents, skills and MCP workflow

## What is included

The repository contains AGENTS.md guidance, six Copilot-compatible custom agent profiles under .github/agents and eight Agent Skills under .agents/skills. These are executable-by-compatible-client *instruction packages*, not running cloud services or preauthorized production automations.

## Client adoption

- GitHub Copilot-compatible clients: select an agent from the project's .github/agents definitions when your plan/client supports custom agents.
- Agent-Skills-compatible clients: discover and explicitly load relevant .agents/skills definitions.
- ChatGPT Work or other clients: use repository docs/skills as instructions where supported, respecting tool permissions; this repository does not install them into your ChatGPT account automatically.
- An MCP connector is only active when separately installed, authenticated and authorized by the user. Do not commit MCP bearer tokens or config files containing secrets.

## Practical review flow

1. Orchestrator checks scope, existing architecture and risks.
2. Frontend or Academic AI role implements a narrowly scoped branch.
3. Security role reviews threat boundaries (read-only) and reports critical issues.
4. QA role checks unit/mobile/offline coverage and reproduces failures.
5. Release role reviews CI, changelog, versioning and rollback before approval.
6. Owner reviews and authorizes merge; Pages deployment success is verified separately.

## Claude Code (configured in this repository)

- `CLAUDE.md` imports AGENTS.md and the always-on AI-DEVELOPMENT-KIT policies, and defines the orchestration table: who owns each kind of task and who reviews it independently.
- `.claude/agents/` defines eight subagents with least-privilege tools and preloaded skills: ucas-frontend, ucas-academic-ai, ucas-security, ucas-qa, ucas-release, ucas-backend-supabase, ucas-moodle-integration, ucas-performance. Claude delegates to them from their descriptions; none can start further agents.
- `.claude/rules/` holds path-scoped rules that load only when Claude works on matching files, so each area brings its own owner, reviewer and checks.
- `.claude/skills/` is the mirror of `.agents/skills` plus the kit skills stack-selection, architecture-review and database-rls. `npm run sync:claude` refreshes it.
- `.claude/ai-kit/` holds hash-checked copies of the kit files UCAS uses, and the UCAS profile, catalog view and MCP plan in `ucas/`.
- `.claude/settings.json` blocks reading `.env` and study backups and asks before commit, push, gh, dependency installs and Supabase CLI commands. No MCP server is enabled.
- These files take effect when Claude Code is started in this folder. They guide the model and make permissions stricter; they don't replace CI, reviews or the owner's approval.

## Important limitations

Agent profiles and skill Markdown alone do not install IDE clients, provision server credentials, deploy Gemini or create background processes. The planned complete AI retrieval system, security audit and production load testing remain separate development work.
