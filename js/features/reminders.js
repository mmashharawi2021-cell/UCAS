// Phase 5 — reminders.
// 1) Phone calendar export (.ics with alarms): real reminders even when the site is closed.
// 2) In-app notifications while the app is open (tasks, exams, lectures in the next hours).
// Push notifications to a closed app need a push server; not part of this static site.
import { buildCalendar } from '../lib/ics-export.js?v=1.6.0';
import { todaySlots } from '../lib/timetable.js?v=1.6.0';

const KEY = 'reminder-settings';
const DEFAULTS = { minutes: 60, inApp: true, semesterEnd: '' };
const timers = new Map();
const fired = new Set();

function settings(ctx) {
  return { ...DEFAULTS, ...(ctx.setting(KEY) || {}) };
}

function exportModal(ctx) {
  const { modal, ic, esc, state } = ctx;
  const s = settings(ctx);
  const options = [15, 30, 60, 120, 1440]
    .map(
      m =>
        `<option value="${m}" ${Number(s.minutes) === m ? 'selected' : ''}>${m === 1440 ? 'قبل يوم' : m >= 60 ? `قبل ${m / 60} ساعة` : `قبل ${m} دقيقة`}</option>`,
    )
    .join('');
  modal(
    'إضافة المواعيد إلى تقويم الهاتف',
    `<form id="calendar-export-form"><p class="muted tiny">يُنشأ ملف تقويم (ICS). افتحه على هاتفك ليضيف المواعيد إلى تطبيق التقويم مع تنبيهات تعمل حتى والموقع مغلق. أعد التصدير بعد أي تعديل.</p><label class="toggle-line"><input type="checkbox" name="tasks" checked/> مواعيد تسليم التكليفات <span class="pill">${state.tasks.filter(t => !t.done && t.due).length}</span></label><label class="toggle-line"><input type="checkbox" name="exams" checked/> الامتحانات (مع تنبيه قبل يوم) <span class="pill">${state.exams.length}</span></label><label class="toggle-line"><input type="checkbox" name="schedule" ${state.schedule.length ? 'checked' : 'disabled'}/> المحاضرات الأسبوعية <span class="pill">${state.schedule.length}</span></label><div class="form-grid"><div class="field"><label for="cal-until">نهاية الفصل (لتكرار المحاضرات)</label><input id="cal-until" class="input" type="date" name="semesterEnd" value="${esc(s.semesterEnd)}"/></div><div class="field"><label for="cal-alarm">التنبيه</label><select id="cal-alarm" class="select" name="minutes">${options}</select></div></div><button class="primary-btn" type="submit">${ic('calendar')} إنشاء ملف التقويم</button></form>`,
  );
}

function settingsPanel(ctx) {
  const { ic, esc } = ctx;
  const s = settings(ctx);
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  return `<div class="panel"><h2>التذكيرات</h2><ul class="bullet-list"><li><strong>تقويم الهاتف (موصى به):</strong> صدّر مواعيدك إلى تطبيق التقويم لتصلك التنبيهات حتى والموقع مغلق.</li><li><strong>داخل التطبيق:</strong> تنبيه قبل موعد التسليم أو الامتحان أو المحاضرة ما دام الموقع مفتوحًا.</li></ul><form id="reminder-settings-form" class="form-grid"><div class="field"><label for="rem-min">التنبيه قبل (دقيقة)</label><input id="rem-min" class="input" type="number" min="5" max="1440" name="minutes" value="${esc(s.minutes)}"/></div><label class="toggle-line"><input type="checkbox" name="inApp" ${s.inApp ? 'checked' : ''}/> تنبيهات داخل التطبيق</label><button class="outline-btn" type="submit">حفظ</button></form><div class="row-actions" style="margin-top:12px"><button class="primary-btn" data-act="calendar-export">${ic('calendar')} تصدير إلى تقويم الهاتف</button>${permission === 'default' ? `<button class="outline-btn" data-action="request-notifications">${ic('bell')} السماح بالإشعارات</button>` : ''}</div>${permission === 'denied' ? '<p class="tiny wrong-text">الإشعارات مرفوضة في إعدادات المتصفح؛ ستظهر التنبيهات داخل الصفحة فقط.</p>' : ''}<p class="muted tiny">للإشعارات والتطبيق مغلق تمامًا، فعّل القسم التالي.</p></div>`;
}

function notify(ctx, id, title, body) {
  if (fired.has(id)) return;
  fired.add(id);
  try {
    localStorage.setItem('ucas-reminders-fired', JSON.stringify([...fired].slice(-200)));
  } catch {
    /* storage blocked */
  }
  if ('Notification' in window && Notification.permission === 'granted')
    navigator.serviceWorker?.ready
      .then(reg => reg.showNotification(title, { body, tag: id, icon: 'assets/icon-192.png' }))
      .catch(() => new Notification(title, { body }));
  ctx.toast(`${title} — ${body}`);
}

/** Schedule in-app reminders for anything due in the next 12 hours. */
function schedule(ctx) {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  const s = settings(ctx);
  if (!s.inApp) return;
  const lead = Math.max(5, Number(s.minutes) || 60) * 60000;
  const now = Date.now();
  const horizon = now + 12 * 3600000;
  const items = [];
  for (const t of ctx.state.tasks)
    if (!t.done && t.due)
      items.push({
        id: `task-${t.id}-${t.due}`,
        at: new Date(t.due).getTime(),
        title: `موعد تسليم: ${t.title}`,
        body: ctx.courseName(t.courseId),
      });
  for (const e of ctx.state.exams)
    items.push({
      id: `exam-${e.id}-${e.date}`,
      at: new Date(e.date).getTime(),
      title: `امتحان: ${e.title}`,
      body: ctx.courseName(e.courseId),
    });
  for (const slot of todaySlots(ctx.state.schedule).filter(x => x.status === 'upcoming')) {
    const at = new Date();
    const [h, m] = slot.start.split(':').map(Number);
    at.setHours(h, m, 0, 0);
    items.push({
      id: `slot-${slot.id}-${at.toDateString()}`,
      at: at.getTime(),
      title: `محاضرة: ${ctx.courseName(slot.courseId)}`,
      body: `الساعة ${slot.start}${slot.room ? ` · ${slot.room}` : ''}`,
      lead: Math.min(lead, 15 * 60000),
    });
  }
  for (const item of items) {
    if (!Number.isFinite(item.at) || item.at < now || item.at > horizon + lead) continue;
    const fireAt = item.at - (item.lead ?? lead);
    const delay = Math.max(0, fireAt - now);
    if (delay > 12 * 3600000) continue;
    timers.set(
      item.id,
      setTimeout(() => notify(ctx, item.id, item.title, item.body), delay),
    );
  }
}

export const settingsPanels = [settingsPanel];

export function start(ctx) {
  try {
    for (const id of JSON.parse(localStorage.getItem('ucas-reminders-fired') || '[]'))
      fired.add(id);
  } catch {
    /* storage blocked */
  }
  schedule(ctx);
  // Re-plan regularly so new tasks/exams are picked up without a reload.
  setInterval(() => schedule(ctx), 10 * 60000);
  window.addEventListener('ucas-data-changed', () => schedule(ctx));
}

export const actions = {
  'calendar-export': (el, ctx) => exportModal(ctx),
};

export const forms = {
  'calendar-export-form': async (form, ctx) => {
    const fd = new FormData(form);
    const minutes = Number(fd.get('minutes')) || 60;
    const semesterEnd = String(fd.get('semesterEnd') || '');
    if (fd.get('schedule') && !semesterEnd)
      throw new Error('حدد نهاية الفصل لتكرار المحاضرات حتى ذلك التاريخ');
    await ctx.saveSetting(KEY, { ...settings(ctx), minutes, semesterEnd });
    const { text, count } = buildCalendar({
      tasks: fd.get('tasks') ? ctx.state.tasks : [],
      exams: fd.get('exams') ? ctx.state.exams : [],
      schedule: fd.get('schedule') ? ctx.state.schedule : [],
      courseName: ctx.courseName,
      alarmMinutes: minutes,
      semesterEnd: semesterEnd || null,
    });
    if (!count) throw new Error('لا توجد مواعيد قادمة لتصديرها');
    const result = await ctx.deliverFile(
      'ucas-mawa3id.ics',
      text,
      'text/calendar',
      'مواعيدي الدراسية',
    );
    ctx.closeModal();
    await ctx.refresh();
    if (result !== 'cancelled')
      ctx.toast(`تم تجهيز ${count} موعد. افتح الملف لإضافته إلى تقويم هاتفك.`);
  },
  'reminder-settings-form': async (form, ctx) => {
    const fd = new FormData(form);
    await ctx.saveSetting(KEY, {
      ...settings(ctx),
      minutes: Math.min(1440, Math.max(5, Number(fd.get('minutes')) || 60)),
      inApp: !!fd.get('inApp'),
    });
    await ctx.refresh();
    schedule(ctx);
    ctx.toast('تم حفظ إعدادات التذكير');
  },
};
