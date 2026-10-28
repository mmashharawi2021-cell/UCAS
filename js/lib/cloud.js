// Pure helpers for the online features (study groups and push). No network here.

export function validateNickname(value) {
  const name = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (name.length < 2) return { ok: false, error: 'الاسم المستعار قصير جدًا (حرفان على الأقل)' };
  if (name.length > 30) return { ok: false, error: 'الاسم المستعار أطول من 30 حرفًا' };
  if (/[<>]/.test(name)) return { ok: false, error: 'لا تستخدم الرموز < >' };
  return { ok: true, value: name };
}

const CODE_ALPHABET = /^[A-HJ-NP-Z2-9]{8}$/;

/** Normalise what a student typed or pasted (a code or a whole invite link). */
export function normalizeInviteCode(input) {
  const raw = String(input ?? '').trim();
  const fromLink = /[?&]join=([A-Za-z0-9-]+)/.exec(raw);
  const code = (fromLink ? fromLink[1] : raw).toUpperCase().replace(/[\s-]/g, '');
  return CODE_ALPHABET.test(code) ? code : null;
}

export function formatInviteCode(code) {
  return String(code || '').replace(/^(.{4})(.{4})$/, '$1-$2');
}

export function inviteLink(code, base) {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('join', code);
  return url.toString();
}

/** Read ?join=CODE or ?group=ID from the current URL. */
export function readLaunchParams(href) {
  try {
    const url = new URL(href);
    const join = normalizeInviteCode(url.searchParams.get('join') || '');
    const group = url.searchParams.get('group');
    return {
      join,
      group: /^[0-9a-f-]{36}$/i.test(group || '') ? group : null,
    };
  } catch {
    return { join: null, group: null };
  }
}

export function validateMessage(value) {
  const body = String(value ?? '').trim();
  if (!body) return { ok: false, error: '' };
  if (body.length > 2000) return { ok: false, error: 'الرسالة أطول من 2000 حرف' };
  return { ok: true, value: body };
}

/** Arabic, user-facing text for errors coming back from Supabase or the browser. */
export function friendlyError(err) {
  const text = `${err?.code || ''} ${err?.error_code || ''} ${err?.message || err || ''}`;
  if (/anonymous_provider_disabled|Anonymous sign-ins are disabled/i.test(text))
    return 'الدخول بالاسم المستعار غير مفعّل بعد على الخادم. أبلغ مسؤول المنصة.';
  if (/set a nickname/i.test(text)) return 'اختر اسمًا مستعارًا أولًا';
  if (/invalid invite code/i.test(text)) return 'رمز الدعوة غير صحيح';
  if (/group is full/i.test(text)) return 'المجموعة ممتلئة (200 عضو)';
  if (/group limit/i.test(text)) return 'وصلت للحد الأقصى من المجموعات التي يمكنك إنشاؤها';
  if (/over_email_send_rate_limit|email rate limit/i.test(text))
    return 'تجاوزت حد إرسال الرسائل (حوالي رسالتين في الساعة). انتظر قليلًا ثم أعد المحاولة.';
  if (/email_address_invalid|invalid email/i.test(text)) return 'البريد الإلكتروني غير صالح';
  if (/slow down/i.test(text)) return 'أرسلت رسائل كثيرة بسرعة. انتظر دقيقة.';
  if (/too many reminders/i.test(text)) return 'عدد التذكيرات كبير جدًا';
  if (/over_request_rate_limit|rate limit|429/i.test(text))
    return 'طلبات كثيرة من هذا الجهاز. حاول بعد قليل.';
  if (/Failed to fetch|NetworkError|network|Load failed|dynamically imported/i.test(text))
    return 'لا يوجد اتصال بالإنترنت أو تعذر الوصول إلى الخادم';
  if (/JWT|session|not signed in/i.test(text)) return 'انتهت الجلسة. أعد فتح الصفحة.';
  return 'تعذرت العملية. حاول مرة أخرى.';
}

export function messageTime(iso, now = new Date()) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const sameDay = d.toDateString() === new Date(now).toDateString();
  return new Intl.DateTimeFormat(
    'ar',
    sameDay
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
  ).format(d);
}

/** Base64url → Uint8Array, for PushManager.subscribe({ applicationServerKey }). */
export function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

/**
 * Reminder rows to keep on the server for push while the app is closed:
 * tasks, exams and lectures in the next `days`. `local_key` makes the sync idempotent.
 * Only titles/times are uploaded — never notes, files or marks.
 */
export function reminderRows({
  tasks = [],
  exams = [],
  schedule = [],
  courseName = () => '',
  leadMinutes = 60,
  now = new Date(),
  days = 14,
}) {
  const rows = [];
  const start = new Date(now).getTime();
  const end = start + days * 86400000;
  const lead = Math.max(5, Number(leadMinutes) || 60) * 60000;
  const add = (key, at, title, body, leadMs = lead) => {
    const fire = at - leadMs;
    if (!Number.isFinite(at) || fire <= start || at > end) return;
    rows.push({
      local_key: key.slice(0, 200),
      fire_at: new Date(fire).toISOString(),
      title: title.slice(0, 200),
      body: (body || '').slice(0, 300),
    });
  };
  for (const t of tasks)
    if (!t.done && t.due)
      add(
        `task:${t.id}:${t.due}`,
        new Date(t.due).getTime(),
        `موعد تسليم: ${t.title}`,
        courseName(t.courseId),
      );
  for (const e of exams) {
    const at = new Date(e.date).getTime();
    add(`exam:${e.id}:${e.date}`, at, `امتحان: ${e.title}`, courseName(e.courseId));
    add(
      `exam-day:${e.id}:${e.date}`,
      at,
      `غدًا امتحان: ${e.title}`,
      courseName(e.courseId),
      24 * 3600000,
    );
  }
  for (const s of schedule) {
    const [h, m] = String(s.start).split(':').map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(m)) continue;
    for (let d = 0; d <= days; d++) {
      const day = new Date(now);
      day.setDate(day.getDate() + d);
      if (day.getDay() !== s.day) continue;
      day.setHours(h, m, 0, 0);
      add(
        `slot:${s.id}:${day.toDateString()}`,
        day.getTime(),
        `محاضرة: ${courseName(s.courseId) || 'محاضرة'}`,
        `الساعة ${s.start}${s.room ? ` · ${s.room}` : ''}`,
        Math.min(lead, 15 * 60000),
      );
    }
  }
  return rows.slice(0, 250);
}
