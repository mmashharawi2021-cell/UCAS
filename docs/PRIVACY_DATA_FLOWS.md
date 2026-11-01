# UCAS — Privacy and data flows

Reviewed for October 2026 repository source. Describes implementation intent, not proof of deployed backend policy configuration.

## Default local mode

Courses, files, tasks, notes, quizzes, exams, grades and progress are held in IndexedDB in this browser profile. The PWA caches public app files only, not personal study documents. Local backups (ZIP; older JSON backups still restore) contain academic data and files and are **unencrypted**. Browser site-data deletion may erase local study material.

## Optional cloud features

| Feature | Trigger | Remotely handled information |
| --- | --- | --- |
| Groups | User accepts group activation, creates or joins a group | Nickname, group metadata, messages and optional push subscriptions in Supabase |
| Sync | User signs in with email link and initiates/schedules sync | Academic records and files in an account-scoped Supabase database and private bucket |
| Gemini assistant | User selects a lecture, checks explicit consent, clicks an AI task | Task type or question, actual course name, file name and selected lecture text (up to 60,000 characters) sent to Supabase, then Gemini; a free question without a file sends only task type and question |
| Push | User grants browser permission and enables service | Push endpoints and limited message/reminder metadata |
| PDF/OCR | User triggers a relevant parser for first time | Third-party scripts load from pinned CDNs; local parsing does not inherently upload documents |

Changing lecture or course resets AI consent. A question without a chosen lecture still requires consent before sending text. AI responses can be wrong. No Moodle login credentials are required by this site.

## Precautions

- Do not enter Moodle passwords, personal IDs or private access links into AI questions or group chats.
- An unlocked browser profile can access local data; backups are plaintext and should be protected by the user.
- Cloud sync is not end-to-end encrypted and uses last-write-wins client modification timestamps; conflicts require testing.
- SQL migration policy definitions do not establish that deployed Supabase RLS has been audited. Verify with isolated test accounts.
- A retention and deletion policy for cloud/AI data, plus operational provider terms, must be verified before broader launch.
