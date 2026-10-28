---
name: supabase-rls-audit
description: Audit UCAS Supabase role-based access, Row Level Security, storage isolation and Edge Function authorization without production changes.
---
# Workflow

1. Read migrations, client/API code and current Supabase security docs. Do not assume migrations are deployed.
2. Build a matrix for anonymous, signed-in owner, unrelated signed-in user and privileged backend identity.
3. Validate SELECT, INSERT, UPDATE and DELETE for profiles, groups, memberships, chat, sync_records and private file objects.
4. Verify user_id ownership in USING and WITH CHECK; consider anonymous identities that still hold authenticated Postgres role.
5. Review exposed SECURITY DEFINER RPCs and EXECUTE grants, JWT verification, secrets and AI email allowlist.
6. Run read-only advisors/inspection when authorized. No destructive SQL or high-volume testing on production.
7. Report proof of isolation and remaining unverified cases.

Deliver: severity-ranked findings, policy/file location, safe reproduction and proposed patch for review.
