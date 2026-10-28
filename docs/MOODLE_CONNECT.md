# UCAS Moodle Connect — OAuth implementation and activation gate

## Implemented
- Dedicated `moodle-connect.html` view, linked from Moodle and Import center.
- Browser OAuth 2.0 Authorization Code **Public Client** + S256 PKCE, 10-minute transaction and exact state verification, one-time callback processing, removal of authorization codes from URL.
- Tokens retained **in memory only**, never in IndexedDB, browser storage, URL, service worker, GitHub or logs. Losing the tab requires reconnecting. Refresh token, when issued, is memory-only.
- Read-only course API retrieval, parse/validate remote data, deduplicate without overwriting existing UCAS study records. An automatic 15-minute refresh is possible while the authorized tab is open; no background service or server scheduling is claimed.
- All OAuth endpoints are restricted to exactly `https://moodle.ucas.edu.ps`, allowlisted via config and fetch with CORS; no credentials or arbitrary URLs.
- If not configured, connect is disabled with a truthful explanation; existing manual HTML/MHT/text/ICS/file import remains available.

## Required external approval — NOT VERIFIED

The university's Moodle login page is public, but **its Moodle version, OAuth 2.0 client registration, CORS and REST course endpoints are not verified**. No client ID or token has been supplied or fabricated. Moodle 5.3's OAuth 2 clients are separate from Moodle's existing "log in with Google" OAuth services; older Moodle versions may require a different integration the university must approve.

UCAS Moodle administrator must:
1. Confirm Moodle supports OAuth 2 clients for external apps and register a **Public Client** with Authorization Code + PKCE S256.
2. Register the exact callback `https://mmashharawi2021-cell.github.io/UCAS/moodle-connect.html`.
3. Approve **read-only** API scope(s) to list only the student's courses; check scope names and API routes in the university's own Swagger/API documentation. Do not guess the routes.
4. Provide the nonsecret client ID, same-origin authorization/token paths, approved course-list path and authorized scopes; configure the allowlisted CORS origin `https://mmashharawi2021-cell.github.io`.
5. Update `js/moodle-connect-config.js` in a reviewed PR. **Do not put client secrets, personal credentials or user tokens in that file.**
6. Test with an authorized test student, check request CSRF/state, PKCE, permissions, CORS, session expiry, reconnect, failed API response and duplication; protect the user data by backup first.

## Not implemented / not falsely claimed
- No live account linkage until the university provides approval/configuration.
- No download of protected lecture files, assignments, grades or course completions. These require specifically approved API routes, scopes, privacy review and robust data mapping.
- No background sync when the tab is closed; GitHub Pages does not run scheduled backend jobs.
- No guaranteed browser cross-origin token exchange until Moodle CORS permits it. If CORS is denied, a separately approved authenticated backend proxy is required. Never collect student Moodle passwords as a workaround.
- Disconnect clears the local in-memory tokens; **revocation at Moodle** must be handled in the university's authorized OAuth client management until a verified revocation endpoint is made available.

References:
- https://docs.moodle.org/503/en/OAuth_2_clients
- https://docs.moodle.org/503/en/REST_API_tokens
- https://moodledev.io/docs/5.3/guides/rest/style
