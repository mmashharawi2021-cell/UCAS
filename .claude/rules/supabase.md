---
paths:
  - "supabase/**"
  - "js/cloud/**"
  - "js/lib/cloud.js"
  - "js/features/account.js"
  - "js/features/groups.js"
  - "js/features/push.js"
---

# Area: optional cloud (Supabase Auth, sync, Storage, Edge Functions)

- Owner: the `ucas-backend-supabase` subagent. Reviewer: `ucas-security`, always for RLS, Storage, RPC or Edge Function changes.
- Skills: `database-rls` for design and `supabase-rls-audit` for review.
- Code and SQL here are not the deployed state. Never run the Supabase CLI, migrations or queries against the production project without the owner's approval. New migrations go in new timestamped files with rollback notes.
- Cloud stays optional: study keeps working offline without an account, and only the publishable key may appear in the browser.
