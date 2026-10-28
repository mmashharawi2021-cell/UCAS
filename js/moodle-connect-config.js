// Public OAuth client registration provided by UCAS Moodle administration.
// IMPORTANT: NEVER put a client secret, student password, or access token here.
// OAuth 2.0 public client + Authorization Code with PKCE (Moodle 5.3+).
// The default is deliberately disabled until UCAS approves and registers the app.
export const MOODLE_CONNECT = Object.freeze({
  origin: 'https://moodle.ucas.edu.ps',
  clientId: '',
  authorizePath: '',
  tokenPath: '',
  coursesPath: '',
  scopes: '',
});
// Redirect URI to register: https://mmashharawi2021-cell.github.io/UCAS/moodle-connect.html
