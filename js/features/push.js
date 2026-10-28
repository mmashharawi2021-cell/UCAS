// Push notifications that arrive while the app is closed (optional, online).
// The browser subscribes with the server's public VAPID key; the server keeps only
// the subscription and the titles/times of upcoming reminders, synced from this device.
import { cloudSession } from './groups.js?v=1.6.0';
import { run, CloudError } from '../cloud/client.js?v=1.6.0';
import { reminderRows, urlBase64ToUint8Array } from '../lib/cloud.js?v=1.6.0';

const FLAG = 'ucas-push-endpoint';
let syncTimer = null;

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function enabledEndpoint() {
  try {
    return localStorage.getItem(FLAG) || '';
  } catch {
    return '';
  }
}
function setEnabled(endpoint) {
  try {
    if (endpoint) localStorage.setItem(FLAG, endpoint);
    else localStorage.removeItem(FLAG);
  } catch {
    /* storage blocked */
  }
}
function isIOSBrowserTab() {
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches
  );
}

function leadMinutes(ctx) {
  return Number(ctx.setting('reminder-settings')?.minutes) || 60;
}

async function syncReminders(ctx) {
  if (!enabledEndpoint()) return;
  const { sb, user } = await cloudSession();
  const rows = reminderRows({
    tasks: ctx.state.tasks,
    exams: ctx.state.exams,
    schedule: ctx.state.schedule,
    courseName: ctx.courseName,
    leadMinutes: leadMinutes(ctx),
  }).map(r => ({ ...r, user_id: user.id }));
  if (rows.length)
    await run(sb.from('scheduled_reminders').upsert(rows, { onConflict: 'user_id,local_key' }));
  // Remove pending reminders that no longer exist locally (deleted/edited/done).
  const pending = await run(
    sb
      .from('scheduled_reminders')
      .select('id, local_key')
      .is('sent_at', null)
      .gt('fire_at', new Date().toISOString()),
  );
  const keep = new Set(rows.map(r => r.local_key));
  const stale = pending.filter(p => !keep.has(p.local_key)).map(p => p.id);
  if (stale.length) await run(sb.from('scheduled_reminders').delete().in('id', stale));
  return rows.length;
}

function scheduleSync(ctx) {
  if (!enabledEndpoint()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(
    () => syncReminders(ctx).catch(err => console.warn('push sync', err)),
    4000,
  );
}

function panel(ctx) {
  const { ic } = ctx;
  const on = !!enabledEndpoint();
  const denied = 'Notification' in window && Notification.permission === 'denied';
  let body;
  if (!supported())
    body = `<p class="muted tiny">هذا المتصفح لا يدعم الإشعارات والتطبيق مغلق. استخدم تصدير التقويم بدلًا منها.</p>`;
  else if (isIOSBrowserTab())
    body = `<p class="muted tiny">على iPhone: أضف المنصة إلى الشاشة الرئيسية (مشاركة ← إضافة إلى الشاشة الرئيسية) ثم افتحها من الأيقونة لتفعيل الإشعارات.</p>`;
  else if (denied)
    body = `<p class="tiny wrong-text">الإشعارات مرفوضة في إعدادات المتصفح لهذا الموقع. اسمح بها من إعدادات الموقع ثم عُد هنا.</p>`;
  else if (on)
    body = `<p class="tiny correct-text">${ic('check', 14)} مفعّلة على هذا الجهاز: تذكيرات التكليفات والامتحانات والمحاضرات للأسبوعين القادمين، ورسائل مجموعاتك.</p><div class="row-actions"><button class="outline-btn" data-act="push-test">${ic('bell', 15)} تحديث التذكيرات الآن</button><button class="danger-btn" data-act="push-disable">إيقاف</button></div>`;
  else
    body = `<p class="muted tiny">تصلك التنبيهات حتى والمتصفح مغلق. يُرسَل إلى الخادم فقط: عنوان التذكير ووقته (مثل «امتحان: النصفي»)، ولا يُرسل أي ملف أو علامة أو ملاحظة. يتطلب إنترنت وحسابًا باسم مستعار (نفس حساب مجموعات الدراسة).</p><button class="primary-btn" data-act="push-enable">${ic('bell')} تفعيل الإشعارات والتطبيق مغلق</button>`;
  return `<div class="panel push-panel"><h2>إشعارات والتطبيق مغلق</h2>${body}</div>`;
}

export const settingsPanels = [panel];

export function start(ctx) {
  window.addEventListener('ucas-data-changed', () => scheduleSync(ctx));
}

export const actions = {
  'push-enable': async (el, ctx) => {
    el.disabled = true;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('لم تُمنح صلاحية الإشعارات');
      try {
        localStorage.setItem('ucas-cloud-consent', '1');
      } catch {
        /* ignore */
      }
      const { sb } = await cloudSession();
      const key = await run(sb.rpc('get_vapid_public_key'));
      if (!key) throw new Error('الخادم غير جاهز للإشعارات بعد');
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }));
      const json = sub.toJSON();
      await run(
        sb
          .from('push_subscriptions')
          .upsert(
            { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
            { onConflict: 'endpoint' },
          ),
      );
      setEnabled(json.endpoint);
      const count = await syncReminders(ctx);
      ctx.render();
      ctx.toast(`تم التفعيل. ${count} تذكير قادم سيصلك كإشعار.`);
    } catch (err) {
      ctx.toast(err instanceof CloudError ? err.message : err.message || 'تعذر التفعيل', true);
    } finally {
      el.disabled = false;
    }
  },
  'push-test': async (el, ctx) => {
    try {
      const count = await syncReminders(ctx);
      ctx.toast(`تمت المزامنة: ${count} تذكير قادم`);
    } catch (err) {
      ctx.toast(err.message, true);
    }
  },
  'push-disable': async (el, ctx) => {
    try {
      const endpoint = enabledEndpoint();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      await sub?.unsubscribe();
      const { sb } = await cloudSession();
      if (endpoint) await run(sb.from('push_subscriptions').delete().eq('endpoint', endpoint));
      await run(sb.from('scheduled_reminders').delete().is('sent_at', null));
      setEnabled('');
      ctx.render();
      ctx.toast('تم إيقاف الإشعارات وحذف التذكيرات من الخادم');
    } catch (err) {
      ctx.toast(err.message, true);
    }
  },
};
