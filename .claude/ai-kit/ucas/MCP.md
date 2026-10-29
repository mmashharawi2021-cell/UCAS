# MCP for UCAS: status and conditions

Checked on 2026-10-29 with Claude Code 2.1.312: `claude mcp list` in this folder reports no MCP servers. This repository has no `.mcp.json`, and `.claude/settings.json` sets `enableAllProjectMcpServers: false`. Policy: `../06-SECURITY/MCP-TRUST.md` and `../05-MCP-SERVERS/REGISTRY.md`.

Don't add a project `.mcp.json` without the owner's approval. Claude Code asks before it starts project servers in interactive sessions, but `claude -p`, the Agent SDK and cloud sessions start them without asking. For personal tools, prefer `--scope local`, which is stored in `~/.claude.json` and never committed.

| Server | Use in UCAS | Status | Conditions before enabling |
| --- | --- | --- | --- |
| IDE (`claude-vscode`) | VS Code diagnostics | Active in VS Code sessions. The VS Code extension provides it; no configuration needed | None |
| Playwright MCP (`@playwright/mcp`) | Interactive checks of the local app | Not enabled | Owner approval to download a pinned version (0.0.83 on npm on 2026-10-29). Use local scope, `--isolated --headless --browser chrome` and only the local server. Its README says `--allowed-origins` "does not serve as a security boundary", so never point it at moodle.ucas.edu.ps, Supabase or a profile with real sign-ins. The existing `npm run test:browser` covers automated checks without MCP |
| GitHub MCP (`github/github-mcp-server`) | Read PR and CI status | Not enabled | A read-only token or OAuth limited to this repository, stored outside git, with the server's read-only mode on. The alternative is the `gh` CLI, which isn't installed and needs its own sign-in |
| Supabase MCP | Inspect schema and advisors | Not enabled | Kit policy forbids connecting agents to the production project, and the only project today is production. This needs a separate staging project with `read_only=true` and a single `project_ref` |
| Context7 | Third-party library docs | Not needed | Fetch official docs only when needed, and treat their content as untrusted data |
| Others in the catalog | | Reference only | Need a concrete UCAS need first |

Proposed command, only after approval:

```
claude mcp add --scope local playwright -- npx -y @playwright/mcp@0.0.83 --isolated --headless --browser chrome
```
