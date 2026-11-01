# AI-DEVELOPMENT-KIT: the subset pinned for UCAS

The kit stays a separate, reusable package outside this repository (here `../AI-DEVELOPMENT-KIT`, version 1.0.0). Nothing in this repository edits it. This folder holds verbatim copies of only the kit files UCAS uses. `manifest.json` records their SHA-256, and `npm run sync:claude` and `tests/agent-config.test.mjs` fail if a copy changes.

- Update: change the kit, then run `npm run sync:claude -- --kit ../AI-DEVELOPMENT-KIT`, review the diff and commit it with the kit version.
- Paths in kit files are relative to this folder. For example, `06-SECURITY/SECURITY-POLICY.md` means `.claude/ai-kit/06-SECURITY/SECURITY-POLICY.md`. Kit `04-SKILLS` are installed in `.claude/skills/`.
- UCAS-specific settings for the kit live in `ucas/` and are editable:
  - `PROJECT-PROFILE.yml`
  - `SELECTION.md`, the catalog seen from UCAS
  - `MCP.md`

## Not copied, and why

- `00-START-HERE` except `QUICK-START.md`: kit installation docs.
- `03-SUB-AGENTS`: the roles UCAS needs are merged into `.claude/agents/`.
- `09-WORKFLOWS`: the method is in `CLAUDE.md`, under Orchestration.
- `11-REFERENCE`: several of its links point to unverified domains.
- `PROJECT-BOOTSTRAP`: UCAS already has `CLAUDE.md` and `AGENTS.md`.
- `tools`: kit maintenance only.

## Kit skills not installed

- `security-review`: a project skill with this name replaces Claude Code's built-in `/security-review`. The `ucas-security` agent and the `supabase-rls-audit` skill cover it.
- `release-readiness`: UCAS has its own, project-specific skill with the same name.
- `performance-testing`: covered by `load-performance-audit`.
- `frontend-quality`: covered by `ucas-design-system`. Its UI-state and data-leak checks are in the `ucas-frontend` agent.
- `project-discovery`: covered by the orchestration flow in `CLAUDE.md` and the owner's user-level planning skills.
- `gis-design`: UCAS has no map or GIS feature.
- The GIS role is not installed for the same reason.
