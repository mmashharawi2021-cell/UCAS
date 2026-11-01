# UCAS security policy

Report vulnerabilities privately to the repository maintainer; use GitHub private vulnerability reporting if enabled. Never post user files, secret keys, access tokens or working exploit examples in public issues.

## Trust boundaries

The frontend and GitHub Pages are public. Never expose Supabase service-role, Gemini or private web-push keys in HTML/JavaScript. IndexedDB and local backups (ZIP or legacy JSON) are not encrypted at rest by the application. Supabase RLS and storage policies must be verified on the deployed project, not assumed from migrations.

The Gemini Edge Function requires an authenticated allowed email, quota checks and a server-held API key. User consent is an additional UI control and does not replace server authorization.

## Premium production checklist

- Verify Supabase RLS across anonymous, owner and other-user test sessions.
- Run security advisors and dependency/secret scanning; review CSP and CORS.
- Test injection, upload limits, access control, AI request quota and harmful prompt content handling.
- Test offline updates, encrypted-backup migration plan, concurrent-sync recovery and rollback.
- Maintain minimal permissions for GitHub Actions and connected AI agents.
