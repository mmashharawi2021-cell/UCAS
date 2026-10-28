// Email account for syncing the student's own devices (phone ↔ laptop).
// Sign-in is a magic link sent by Supabase; nothing else is needed on the device.
import { getClient, hasStoredSession, CloudError } from '../cloud/client.js?v=1.2.0';
import { syncNow, syncUser, lastSyncedAt } from '../cloud/sync.js?v=1.2.0';
import { friendlyError } from '../lib/cloud.js?v=1.2.0';

const s = { user: null, checked: false, busy: false, progress: '', sentTo: '', lastResult: null };
let ctxRef = null;
let timer = null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const redirectTo = () => location.origin + location.pathname;

function when(iso) {
  if (!iso) return 'لم تتم بعد';
  return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

async function refreshUser() {
  try {
    const session = await syncUser();
    s.user = session?.user || null;
  } catch {
    s.user = null;
  }
  s.checked = true;
}

async function runSync(ctx, { quiet = false } = {}) {
  if (!s.user || s.busy) return;
  s.busy = true;
  s.progress = 'جاري المزامنة…';
  if (!quiet) ctx.render();
  try {
    const stats = await syncNow(msg => {
      s.progress = msg;
      const el = document.getElementById('sync-progress');
      if (el) el.textContent = msg;
    });
    s.lastResult = stats;
    s.busy = false;
    if (stats.pulled || stats.filesDown) await ctx.refresh();
    else if (!quiet) ctx.render();
    if (!quiet)
      ctx.toast(
        `تمت المزامنة: ${stats.pulled} وارد · ${stats.pushed} صادر${stats.filesUp || stats.filesDown ? ` · ملفات ${stats.filesUp}↑ ${stats.filesDown}↓` : ''}`,
      );
  } catch (err) {
    s.busy = false;
    console.warn('sync', err);
    if (!quiet) {
      ctx.render();
      ctx.toast(err instanceof CloudError ? err.message : friendlyError(err), true);
    }
  }
}

function schedule(ctx, delay = 15000) {
  if (!s.user) return;
  clearTimeout(timer);
  timer = setTimeout(() => runSync(ctx, { quiet: true }), delay);
}

function panel(ctx) {
  const { ic, esc } = ctx;
  let body;
  if (!s.checked && hasStoredSession()) body = `<p class="muted tiny">جاري التحقق من الحساب…</p>`;
  else if (s.user)
    body = `<p class="tiny correct-text">${ic('check', 14)} متصل: <bdi>${esc(s.user.email)}</bdi></p><p class="muted tiny">آخر مزامنة: ${esc(when(lastSyncedAt(s.user.id)))}. تتم المزامنة تلقائيًا عند كل تغيير وعند فتح المنصة.</p>${s.busy ? `<p class="tiny" id="sync-progress">${esc(s.progress)}</p>` : ''}<div class="row-actions"><button class="primary-btn" data-act="sync-now" ${s.busy ? 'disabled' : ''}>${ic('rotate', 15)} مزامنة الآن</button><button class="outline-btn" data-act="sync-signout">تسجيل الخروج</button></div>`;
  else if (s.sentTo)
    body = `<div class="notice info">أرسلنا رابط الدخول إلى <bdi>${esc(s.sentTo)}</bdi>. افتح الرابط <strong>على هذا الجهاز</strong> (قد يصل إلى الرسائل غير المرغوبة). كرر ذلك على جهازك الآخر بنفس البريد.</div><button class="link" data-act="sync-reset">بريد آخر</button>`;
  else
    body = `<p class="muted tiny">سجّل ببريدك على جوالك واللابتوب لتصبح بياناتك متطابقة عليهما: المساقات والملفات والملاحظات والمهام والعلامات والجدول. تُحفظ نسخة في حسابك الخاص (Supabase) لا يصل إليها غيرك، وتبقى المنصة تعمل دون إنترنت.</p><form id="sync-email-form" class="sync-form"><input class="input" type="email" name="email" required autocomplete="email" placeholder="you@example.com" dir="ltr" aria-label="البريد الإلكتروني"/><button class="primary-btn" type="submit">${ic('link', 15)} أرسل رابط الدخول</button></form>`;
  return `<div class="panel sync-panel"><h2>المزامنة بين أجهزتي</h2>${body}</div>`;
}

export const settingsPanels = [panel];

export function start(ctx) {
  ctxRef = ctx;
  const hash = location.hash;
  const fromLink =
    /access_token|error_description|type=(magiclink|signup|email_change|recovery)/.test(hash);
  if (fromLink) {
    const error = /error_description=([^&]+)/.exec(hash);
    getClient()
      .then(sb => sb.auth.getSession())
      .then(async () => {
        history.replaceState(null, '', location.pathname + location.search);
        await refreshUser();
        if (error)
          ctx.toast(`تعذر الدخول: ${decodeURIComponent(error[1].replace(/\+/g, ' '))}`, true);
        else if (s.user) {
          ctx.toast(`تم تسجيل الدخول: ${s.user.email}`);
          await runSync(ctx);
        }
        ctx.render();
      })
      .catch(err => ctx.toast(friendlyError(err), true));
  } else if (hasStoredSession()) {
    refreshUser().then(() => {
      if (s.user) runSync(ctx, { quiet: true });
    });
  } else s.checked = true;

  window.addEventListener('ucas-data-changed', () => schedule(ctx));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) runSync(ctx, { quiet: true });
    else schedule(ctx, 1000);
  });
}

/** Shared with the AI assistant: the signed-in email account (or null). */
export function accountUser() {
  return s.user;
}

export const actions = {
  'sync-now': (el, ctx) => runSync(ctx),
  'sync-reset': (el, ctx) => {
    s.sentTo = '';
    ctx.render();
  },
  'sync-signout': async (el, ctx) => {
    if (!confirm('تسجيل الخروج يوقف المزامنة على هذا الجهاز (بياناتك تبقى عليه). متابعة؟')) return;
    const sb = await getClient();
    await sb.auth.signOut();
    s.user = null;
    ctx.render();
  },
};

export const forms = {
  'sync-email-form': async (form, ctx) => {
    const email = String(new FormData(form).get('email') || '')
      .trim()
      .toLowerCase();
    if (!EMAIL.test(email)) throw new Error('اكتب بريدًا صحيحًا');
    const sb = await getClient();
    const { data } = await sb.auth.getSession();
    const current = data.session?.user;
    let error;
    if (current?.is_anonymous) {
      // Keep the nickname account (groups, push) by attaching the email to it.
      ({ error } = await sb.auth.updateUser({ email }, { emailRedirectTo: redirectTo() }));
      if (error && /already|exists|registered/i.test(error.message || error.code || ''))
        error = 'switch';
    }
    if (!current?.is_anonymous || error === 'switch')
      ({ error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo(), shouldCreateUser: true },
      }));
    if (error) throw new CloudError(error);
    s.sentTo = email;
    ctx.render();
  },
};
