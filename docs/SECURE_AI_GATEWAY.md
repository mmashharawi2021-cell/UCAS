# UCAS — Gemini AI gateway: current state and controls

## Implemented in source code

The frontend sends an authenticated request to the Supabase AI Edge Function. The backend validates a non-anonymous email session, checks AI_ALLOWED_EMAILS, keeps GEMINI_API_KEY server-side, enforces a per-user daily quota and truncates selected lecture input to 60,000 characters. It sends a prompt, course metadata, selected lecture text and/or student question to Gemini.

The Premium UI requires explicit per-course/per-lecture in-memory consent before each AI task can be invoked. Changing lecture or course resets consent. This only applies once the server is deployed/configured correctly; deployment and secrets have not been inspected.

## Limitations

Existing output is not guaranteed to contain valid page-specific citations. The model may supplement absent source content with general knowledge. Do not treat generated source labels as verified references. Academic text can include personal data or hostile embedded instructions; minimize and redact content where possible.

## Production gate

1. Verify Supabase deployed function, private keys, CORS, JWT validation and email allowlist.
2. Test anonymous and unauthorized callers, missing/invalid consent, oversized payload, invalid JSON, quota exhaustion and provider failure.
3. Add validated filename + page/slide retrieval, "not in source" uncertainty and prompt-injection resistance.
4. Add global budget caps, privacy/retention/deletion rules and an operational kill switch.
5. Keep offline study, search and quizzes available when AI is down.
