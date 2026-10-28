# UCAS Premium 2.0 — Engineering Blueprint

Status: incremental foundation only, not a completed Premium release or a paid subscription tier.

## Product scope

A personal local-first RTL academic workspace, compatible with existing IndexedDB records and offline functionality. Login is optional for cloud features. Keep privileged keys off the public frontend.

## Architecture

Browser: HTML/CSS/JavaScript modules + IndexedDB + service worker.
Optional Supabase: account sync with private file storage; group membership/chat; push.
AI: explicit consent -> authenticated Edge Function -> Gemini; no direct browser secret.
Delivery: GitHub Actions unit, browser and lint checks -> GitHub Pages after review.

## Phases and acceptance

| Phase | Change | Required verification |
| --- | --- | --- |
| 0 | Baseline inventory, privacy data flows, branch, security notes | Existing CI green, rollback recorded |
| 1 | Next task/exam/resume dashboard, responsive course rail, tokens | Navigation works, mobile 320–768px overflow test, keyboard review |
| 2 | Split large app module, partial rendering, offline migrations and backup | All existing browser tests, recovery and two-device conflict tests |
| 3 | AI retrieval with filename/page citations, question quality and planner | Verified references, uncertainty handling, injection/consent tests |
| 4 | RLS review, API abuse and load testing on authorized staging | Cross-account isolation, budget limits, outage recovery |
| 5 | Measured monitored rollout with rollback | LCP <=2.5s, INP <=200ms, CLS <=0.1 at p75 where measurable, Lighthouse accessibility >=95 |

Performance values are release targets, not measurements.

## AI client / agents / sub-agents / skills / MCP

A coordinator agent assigns bounded work to: UI/UX agent, frontend agent, backend/Supabase agent, academic-AI agent, security agent, QA agent, performance agent and DevOps agent.

Reusable skill specifications:
- ucas-design-system: responsive RTL and accessibility
- academic-source-validator: check source-derived claims and references
- lecture-processing: file import/metadata/sections
- exam-quality-audit: question correctness and difficulty
- supabase-rls-audit: isolation test matrix
- pwa-offline-regression: update and offline behavior
- load-performance-audit: measured staging load
- release-readiness: CI, changelog, rollback

These are proposed skills and roles, not installed agents. Optional MCP links: GitHub, Supabase, Figma, browser testing, explicitly authorized Google Drive. Use least privilege and do not grant agents unattended write access to production data or secrets.

## Security gates

Verify Supabase deployed policies, secret scanning, JWT and authorization, XSS and CORS, upload bounds, AI prompt injection, cost quota, privacy and deletion policies, concurrent sync, back-up restore, offline availability. Follow OWASP ASVS. Production stress tests require authorization and rate limits.

## Hosting

Keep GitHub Pages for the static UI and Supabase Free when within quotas. AI calls require gated server-side quota and global budget. Benchmark before promising scale.

## Explicitly deferred

Full app replatforming, mandatory accounts, public multi-tenant launch, paid plans, E2EE, AI page citations, conflict-aware sync and a completed design overhaul.
