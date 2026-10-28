import { MOODLE_CONNECT as config } from './moodle-connect-config.js?v=1.7.0';
import {
  configReady,
  MOODLE_ORIGIN,
  safeMoodleEndpoint,
  base64url,
  pkceChallenge,
  authorizationURL,
  normalizeMoodleCourses,
  planCourseImport,
} from './moodle-connect-core.js?v=1.7.0';
import { all, put, makeId, initialize } from './store.js?v=1.7.0';

// Tokens are NEVER persisted to IndexedDB/localStorage, a service worker or a URL.
// The university must approve an OAuth PUBLIC client, PKCE, CORS and read-only scopes.
const $ = id => document.getElementById(id);
const CALLBACK = location.origin + location.pathname;
const PENDING = 'ucas-moodle-pkce-v1';
let credentials = null;
let courses = [];
let busy = false;
let timer = null;
let message = '';

function showStatus(label, detail) {
  $('connection-state').textContent = label;
  $('connection-detail').textContent = detail;
}
function render() {
  const ready = configReady(config);
  $('connect').disabled = !ready || busy;
  $('connect').hidden = !!credentials;
  $('sync').hidden = !credentials;
  $('sync').disabled = busy;
  $('disconnect').hidden = !credentials;
  if (busy) showStatus('جاري المعالجة…', message);
  else if (credentials)
    showStatus('مرتبط مؤقتًا', message || 'يمكن استيراد المساقات المتاحة ضمن صلاحيات حسابك.');
  else if (ready)
    showStatus(
      'جاهز للتفويض',
      message || 'لم يتم الاتصال بعد. سيُفتح تسجيل الدخول على موقع الجامعة الرسمي.',
    );
  else
    showStatus(
      'بانتظار موافقة الجامعة',
      'لم تُسجّل UCAS بعد كتطبيق OAuth معتمد لدى Moodle. تم تجهيز الربط التقني لكن لا يمكن استخدامه قبل الحصول على Client ID والمسارات والصلاحيات الرسمية.',
    );
  $('count').textContent = String(courses.length);
  const list = $('courses');
  list.replaceChildren();
  if (!courses.length) {
    const p = document.createElement('p');
    p.className = 'detail';
    p.textContent = 'لا توجد مساقات مستوردة من الاتصال الحالي.';
    list.append(p);
    return;
  }
  for (const course of courses) {
    const row = document.createElement('div');
    row.className = 'course';
    const title = document.createElement('strong');
    title.textContent = course.title;
    const meta = document.createElement('span');
    meta.textContent = course.code || 'مساق Moodle';
    row.append(title, meta);
    list.append(row);
  }
}
function randomString(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}
function clearPending() {
  sessionStorage.removeItem(PENDING);
}
async function connect() {
  if (!configReady(config)) return;
  const state = randomString(32);
  const verifier = randomString(48);
  const challenge = await pkceChallenge(verifier);
  sessionStorage.setItem(PENDING, JSON.stringify({ state, verifier, at: Date.now() }));
  location.assign(authorizationURL(config, CALLBACK, state, challenge));
}
async function exchange(values) {
  const uri = safeMoodleEndpoint(config.tokenPath, config.origin);
  if (!uri) throw Error('عنوان رمز Moodle غير مُعتمد');
  const body = new URLSearchParams(values);
  const response = await fetch(uri, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok)
    throw Error('رفض Moodle طلب التفويض أو تعذر تبادل رمز OAuth (' + response.status + ')');
  const payload = await response.json();
  if (payload.token_type?.toLowerCase() !== 'bearer' || !payload.access_token)
    throw Error('لم يرجع Moodle رمز وصول صالحًا');
  credentials = {
    access: payload.access_token,
    refresh: payload.refresh_token || null,
    expires: Date.now() + Math.max(30, Number(payload.expires_in || 3600)) * 1000,
  };
}
async function accessToken() {
  if (!credentials) throw Error('لم يتم ربط حساب Moodle');
  if (Date.now() < credentials.expires - 60000) return credentials.access;
  if (!credentials.refresh) throw Error('انتهت صلاحية الجلسة؛ أعد الربط');
  await exchange({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: credentials.refresh,
  });
  return credentials.access;
}
async function callback() {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!code && !error) return;
  // Erase the authorization code from URL before asynchronous operations/logging.
  history.replaceState(null, '', CALLBACK);
  const stored = sessionStorage.getItem(PENDING);
  clearPending();
  if (!stored) throw Error('جلسة OAuth غير متوقعة أو قديمة. ابدأ الربط مرة أخرى.');
  let pending;
  try {
    pending = JSON.parse(stored);
  } catch {
    throw Error('طلب التفويض غير صالح');
  }
  if (
    !pending ||
    Date.now() - pending.at > 600000 ||
    !/^[A-Za-z0-9_-]{64}$/.test(pending.verifier) ||
    !/^[A-Za-z0-9_-]+$/.test(pending.state) ||
    url.searchParams.get('state') !== pending.state
  )
    throw Error('تعذر التحقق من حالة OAuth. لم تُقبل بيانات تسجيل الدخول.');
  if (error) throw Error('رفض Moodle التفويض أو ألغاه المستخدم.');
  if (!configReady(config)) throw Error('إعداد ربط Moodle غير مكتمل');
  await exchange({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    code_verifier: pending.verifier,
    redirect_uri: CALLBACK,
  });
  message = 'تم التفويض رسميًا لهذه الجلسة. جارٍ فحص المساقات المسموح بها.';
  await sync();
}
async function sync() {
  if (!credentials || busy) return;
  busy = true;
  message = 'استرجاع المساقات المسموح بها من واجهة الجامعة…';
  render();
  try {
    const token = await accessToken();
    const endpoint = safeMoodleEndpoint(config.coursesPath, config.origin);
    if (!endpoint) throw Error('مسار المساقات غير مُعتمد');
    const resp = await fetch(endpoint, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!resp.ok)
      throw Error('لا تتوفر صلاحية قراءة المساقات أو المسار غير صحيح (' + resp.status + ')');
    const payload = await resp.json();
    const discovered = normalizeMoodleCourses(payload);
    await initialize();
    const existing = await all('courses');
    const additions = planCourseImport(discovered, existing);
    for (const course of additions) {
      await put('courses', {
        id: makeId(),
        title: course.title,
        code: course.code,
        moodleId: course.moodleId,
        origin: 'moodle-oauth',
        createdAt: new Date().toISOString(),
      });
    }
    courses = discovered;
    message =
      'عُثر على ' +
      discovered.length +
      ' مساق؛ أُضيف ' +
      additions.length +
      ' جديد دون استبدال بيانات مساقاتك الحالية.';
  } catch (err) {
    message = 'تعذرت المزامنة: ' + (err?.message || 'راجع اتصال Moodle وصلاحيات API/CORS');
  } finally {
    busy = false;
    render();
  }
}
function disconnect() {
  credentials = null;
  clearPending();
  courses = [];
  message = 'تم فصل الاتصال من هذه الصفحة. البيانات التي استوردتها سابقًا تبقى محليًا.';
  render();
}
$('connect').addEventListener('click', () =>
  connect().catch(e => {
    message = e.message;
    render();
  }),
);
$('sync').addEventListener('click', () => sync());
$('disconnect').addEventListener('click', disconnect);
(async () => {
  // Prevent OAuth callback from being served from an unexpected origin.
  if (config.origin !== MOODLE_ORIGIN) throw Error('عنوان خدمة Moodle غير معتمد');
  render();
  try {
    await callback();
  } catch (e) {
    credentials = null;
    message = e.message;
    render();
  }
  timer = setInterval(
    () => {
      if (credentials && !document.hidden && navigator.onLine) sync();
    },
    15 * 60 * 1000,
  );
})().catch(e => {
  message = e.message;
  render();
});
window.addEventListener('pagehide', () => {
  if (timer) clearInterval(timer);
  credentials = null;
});
