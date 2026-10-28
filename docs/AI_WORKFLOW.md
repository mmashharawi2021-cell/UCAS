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

## Important limitations

Agent profiles and skill Markdown alone do not install IDE clients, provision server credentials, deploy Gemini or create background processes. The planned complete AI retrieval system, security audit and production load testing remain separate development work.
