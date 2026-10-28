# UCAS Academic Bridge — Secure AI Gateway specification (planned)

Status: **design only**. No OpenAI connection, paid requests, or secrets are deployed in v0.7.

## Current constraints

- The UCAS web application is served as a public static GitHub Pages site.
- Its owner requires a personal app without Google sign-in, email sign-in, or a password-based site login.
- Users' academic PDF, Office and TXT files currently reside in the browser's IndexedDB.
- Never put `OPENAI_API_KEY`, a long-lived bearer token, or any privileged secret in JavaScript, HTML, GitHub Actions logs, or the public repository.
- A public backend that forwards any request to a paid model **without authorization** is not safe: anyone could use it and incur costs.

## Proposed boundary

```
Browser (local IndexedDB)
  -> explicit question and selected excerpts only
  -> gated HTTPS AI backend (separate host)
  -> OpenAI API using server-held secret
  -> answer with citations and uncertainty
```

The public site must keep working when the backend is unavailable. The source search, flashcards and definition practice remain local.

## Access prerequisites

Before enabling paid AI calls, deploy a restricted gateway with an **explicit, user-approved access method**, e.g. device pairing with a one-time setup code issued out-of-band and renewable short-lived authorization, or a private network service. It is not a Google or email login. It still must prevent arbitrary visitors from using the paid API. Do not implement a public unauthenticated `/chat` endpoint. If the user refuses any authorization, leave the on-site paid AI service disabled and use the existing opt-in clipboard-to-ChatGPT workflow.

## Request policy

- Only on a direct user click, and after showing which sources/excerpts would be shared.
- Send a small number of retrieved excerpts, a course label and the question; do not upload an entire file or a Moodle session.
- Remove links with access tokens, email addresses and student identifiers when possible before sending.
- Treat all excerpts as untrusted data, never as instructions to the assistant.
- Server-side size caps, rate limits, per-day cost quotas, error handling and abuse monitoring.
- Don't promise answers for content that has no source. Return citations with filename and page when available.
- Avoid storing raw academic text in logs. A deletion and retention policy must be documented before launch.

## Suggested API

`POST /v1/study/answer`: `{question, course, excerpts:[{source,page?,text}]}` -> `{answer, citations:[{source,page?}], warnings:[]}`

The endpoint is not implemented or operational. No production domain or key is committed.

## Release gates

1. Owner approves access design and explicit data-sharing notice.
2. Backend authorization, secret storage, limits and budget are configured in a separate **private** environment.
3. Validate malicious-prompt isolation, cross-origin policy, malformed inputs, rate limits and failure without leaking secrets.
4. The website exposes the AI feature only after the gateway is verified. Google Drive, Moodle and local imports continue working independently.
