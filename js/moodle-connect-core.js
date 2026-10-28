// Pure validators for Moodle public OAuth and read-only student course import.
export const MOODLE_ORIGIN = 'https://moodle.ucas.edu.ps';

export function safeMoodleEndpoint(path, origin = MOODLE_ORIGIN) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return null;
  try {
    const u = new URL(path, origin);
    if (u.origin !== MOODLE_ORIGIN || u.protocol !== 'https:' ||
        u.username || u.password || u.hash || u.search || !u.pathname.startsWith('/')) return null;
    return u.href;
  } catch {
    return null;
  }
}

export function configReady(c) {
  return !!(c && c.origin === MOODLE_ORIGIN &&
    /^[a-zA-Z0-9_.-]{4,180}$/.test(c.clientId || '') &&
    safeMoodleEndpoint(c.authorizePath, c.origin) &&
    safeMoodleEndpoint(c.tokenPath, c.origin) &&
    safeMoodleEndpoint(c.coursesPath, c.origin) &&
    typeof c.scopes === 'string' &&
    /^[a-zA-Z0-9:_ .-]{3,250}$/.test(c.scopes.trim()));
}

export function base64url(bytes) {
  const raw = Array.from(bytes, b => String.fromCharCode(b)).join('');
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function pkceChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
}

export function authorizationURL(c, redirect, state, challenge) {
  if (!configReady(c)) throw new Error('يتطلب الربط تسجيل تطبيق رسمي من الجامعة');
  const u = new URL(safeMoodleEndpoint(c.authorizePath, c.origin));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', c.clientId);
  u.searchParams.set('redirect_uri', redirect);
  u.searchParams.set('scope', c.scopes.trim());
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.href;
}

function rawCourseList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    for (const key of ['courses', 'data', 'items', 'results']) {
      if (Array.isArray(payload[key])) return payload[key];
    }
  }
  throw new Error('صيغة المساقات غير مدعومة؛ راجع مسار Moodle REST API مع الجامعة');
}

export function normalizeMoodleCourses(payload) {
  const rows = rawCourseList(payload);
  if (rows.length > 300) throw new Error('عدد كبير من المساقات؛ لا يمكن استيرادها دفعة واحدة');
  const seen = new Set();
  return rows.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const id = String(item.id ?? item.courseid ?? '');
    const name = String(item.fullname ?? item.fullName ?? item.name ?? '').trim().slice(0, 160);
    const code = String(item.shortname ?? item.shortName ?? item.code ?? '').trim().slice(0, 60);
    if (!/^\d{1,12}$/.test(id) || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ moodleId: id, title: name, code }];
  });
}

export function planCourseImport(remote, local) {
  const all = Array.isArray(local) ? local : [];
  return remote.filter(item => !all.some(existing =>
    existing.moodleId === item.moodleId ||
    (existing.code && item.code && existing.code.trim().toLowerCase() === item.code.toLowerCase()) ||
    (existing.title && existing.title.trim() === item.title)));
}
