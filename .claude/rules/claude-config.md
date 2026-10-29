---
paths:
  - ".claude/**"
  - "CLAUDE.md"
  - "AGENTS.md"
  - ".agents/skills/**"
  - ".github/agents/**"
  - "scripts/sync-claude.mjs"
---

# Area: AI development configuration

- Edit UCAS skills in `.agents/skills/`, then run `npm run sync:claude` to refresh `.claude/skills/`. Never edit the mirrors.
- `.claude/ai-kit/` holds verbatim, hash-checked copies of AI-DEVELOPMENT-KIT. Change them only through the kit, then run `npm run sync:claude -- --kit ../AI-DEVELOPMENT-KIT`. UCAS-specific kit settings go in `.claude/ai-kit/ucas/`.
- Subagent files need `name` and `description` and a least-privilege `tools` list without `Agent`. Their `skills` must exist in `.claude/skills/`.
- `tests/agent-config.test.mjs` checks all of this.
- Never add a project `.mcp.json` or MCP credentials without the owner's approval (`.claude/ai-kit/ucas/MCP.md`).
