# Project status — Premium foundation (October 2026)

Target: v1.2.0, initially in a development branch. The earlier v1.1.0 introduced account sync and Gemini alongside groups and push.

## Implemented in the Premium foundation branch

- Home dashboard displays upcoming assignment, exam, resume-course shortcut and actual local source completion, without a new network call.
- Mobile home courses use a horizontally scrollable card rail; the full course listing is unchanged.
- AI source/question transfers require explicit in-memory user consent; consent resets upon source/course change.
- Data notices distinguish default local IndexedDB from optional Supabase groups, sync, push and Gemini processing.
- Tests guard the consent behavior and mobile dashboard rendering.

## Still requires verification or development

The deployed UCAS Supabase project has not been independently audited. Full Premium UI redesign, AI page-level citations, sync conflict resolution, encrypted local backups, Lighthouse measurements, penetration tests and representative load tests remain outstanding. Existing web CI tests are necessary but not sufficient.

See docs/PREMIUM_BLUEPRINT.md, docs/PRIVACY_DATA_FLOWS.md and docs/SECURE_AI_GATEWAY.md.
