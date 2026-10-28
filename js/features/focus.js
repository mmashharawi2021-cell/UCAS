// Phase 1 — Pomodoro study timer with per-course study time.
// The running timer is stored as absolute timestamps in settings, so it survives
// reloads, screen-off and background tabs.
import {
  PRESETS,
  clock,
  formatMinutes,
  minutesByCourse,
  streakDays,
  validTimer,
  weekRange,
} from '../lib/focus.js?v=1.1.0';

const KEY = 'focus-timer';
let ticker = null;
let ctxRef = null;
let selectedMode = 'focus';
let selectedCourse = '';

function timer(ctx) {
  const t = ctx.setting(KEY);
  return validTimer(t) ? t : null;
}

function remaining(t, now = Date.now()) {
  return t.pausedRemaining ?? Math.max(0, t.endsAt - now);
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function render(ctx) {
  const { state, intro, ic, esc, courseOption, courseName, sectionHead, noData } = ctx;
  const t = timer(ctx);
  const mode = t?.mode || selectedMode;
  const ms = t ? remaining(t) : PRESETS[mode].minutes * 60000;
  const week = minutesByCourse(state.sessions, weekRange(new Date()));
  const today = minutesByCourse(state.sessions, todayRange());
  const streak = streakDays(state.sessions);
  const max = Math.max(1, ...Object.values(week.byCourse));
  const recent = state.sessions
    .slice()
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    .slice(0, 6);
  const controls = !t
    ? `<button class="primary-btn big-btn" data-act="focus-start">${ic('play')} ابدأ</button>`
    : t.pausedRemaining != null
      ? `<button class="primary-btn big-btn" data-act="focus-resume">${ic('play')} استئناف</button><button class="outline-btn" data-act="focus-stop">إنهاء</button>`
      : `<button class="outline-btn big-btn" data-act="focus-pause">${ic('pause')} إيقاف مؤقت</button><button class="outline-btn" data-act="focus-stop">إنهاء</button>`;
  return `${intro('مؤقت المذاكرة', 'تقنية بومودورو: 25 دقيقة تركيز ثم استراحة قصيرة. يُسجَّل وقت المذاكرة لكل مساق تلقائيًا')}<div class="focus-layout"><div class="panel focus-panel ${t ? `running mode-${esc(t.mode)}` : ''}"><div class="tabs focus-modes">${Object.entries(
    PRESETS,
  )
    .map(
      ([k, p]) =>
        `<button class="tab ${mode === k ? 'active' : ''}" data-act="focus-mode" data-mode="${k}" ${t ? 'disabled' : ''}>${p.label} ${p.minutes}</button>`,
    )
    .join(
      '',
    )}</div><div class="focus-clock" data-focus-clock role="timer" aria-live="off">${clock(ms)}</div><p class="muted tiny focus-course">${t ? (t.courseId ? esc(courseName(t.courseId)) : 'بدون مساق محدد') : ''}</p>${
    t
      ? ''
      : `<div class="field focus-select"><label for="focus-course">ماذا ستذاكر؟</label><select id="focus-course" class="select" data-act-change="focus-course"><option value="">بدون مساق محدد</option>${courseOption(selectedCourse)}</select></div>`
  }<div class="row-actions focus-controls">${controls}</div></div><div class="card-stack"><div class="stats-grid two">${ctx.stat('timer', formatMinutes(today.total), 'مذاكرة اليوم')}${ctx.stat('clock', formatMinutes(week.total), 'مذاكرة هذا الأسبوع')}${ctx.stat('award', `${streak} يوم`, 'أيام متتالية')}${ctx.stat('check', state.sessions.filter(s => (s.kind || 'focus') === 'focus').length, 'جلسة تركيز')}</div></div></div>${sectionHead('وقت المذاكرة لكل مساق هذا الأسبوع')}<div class="panel">${
    Object.keys(week.byCourse).length
      ? Object.entries(week.byCourse)
          .sort((a, b) => b[1] - a[1])
          .map(
            ([id, m]) =>
              `<div><div class="bar-row"><strong>${esc(id ? courseName(id) : 'بدون مساق')}</strong><span class="muted">${formatMinutes(m)}</span></div><div class="progress-track"><div style="width:${Math.round((m / max) * 100)}%"></div></div></div>`,
          )
          .join('')
      : noData('لا جلسات هذا الأسبوع', 'ابدأ أول جلسة تركيز من الأعلى', 'timer')
  }</div>${
    recent.length
      ? `${sectionHead('آخر الجلسات')}<div class="panel">${recent
          .map(
            s =>
              `<div class="item-row"><div><h4>${esc(s.courseId ? courseName(s.courseId) : 'بدون مساق')}</h4><p>${ctx.fmtDate(s.startedAt)}</p></div><span class="pill ${(s.kind || 'focus') === 'focus' ? 'success' : ''}">${PRESETS[s.kind || 'focus']?.label || ''} · ${formatMinutes(s.minutes)}</span></div>`,
          )
          .join('')}</div>`
      : ''
  }`;
}

function homeWidget(ctx) {
  const { state, ic } = ctx;
  const week = minutesByCourse(state.sessions, weekRange(new Date()));
  const t = timer(ctx);
  return `<div class="widget"><div class="widget-head"><h3>${ic('timer', 17)} المذاكرة</h3><button class="link" data-go="focus">المؤقت</button></div><div class="widget-figure">${formatMinutes(week.total)}</div><p class="muted tiny">هذا الأسبوع · ${streakDays(state.sessions)} يوم متتالٍ</p>${t ? `<p class="tiny"><strong data-focus-clock>${clock(remaining(t))}</strong> ${t.pausedRemaining != null ? 'متوقف مؤقتًا' : 'جلسة جارية'}</p>` : `<button class="outline-btn" data-act="focus-start">${ic('play', 15)} جلسة تركيز 25 د</button>`}</div>`;
}

async function save(ctx, value) {
  await ctx.saveSetting(KEY, value);
  await ctx.refresh();
  syncTicker(ctx);
}

async function recordSession(ctx, t, minutes) {
  if (minutes < 1) return;
  await ctx.put('sessions', {
    id: ctx.makeId(),
    courseId: t.courseId || '',
    kind: t.mode,
    minutes: Math.round(minutes),
    startedAt: new Date(t.startedAt).toISOString(),
    endedAt: new Date().toISOString(),
  });
}

function notify(ctx, title, body) {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* not supported */
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready
      .then(reg => reg.showNotification(title, { body, icon: 'assets/icon-192.png', tag: 'focus' }))
      .catch(() => new Notification(title, { body }));
  }
  ctx.toast(`${title} — ${body}`);
}

async function complete(ctx, t) {
  await recordSession(ctx, t, (t.endsAt - t.startedAt) / 60000);
  const focusCount = ctx.state.sessions.filter(s => (s.kind || 'focus') === 'focus').length + 1;
  selectedMode = t.mode === 'focus' ? (focusCount % 4 === 0 ? 'long' : 'short') : 'focus';
  selectedCourse = t.courseId || '';
  await save(ctx, null);
  notify(
    ctx,
    t.mode === 'focus' ? 'أحسنت! انتهت جلسة التركيز' : 'انتهت الاستراحة',
    t.mode === 'focus' ? `خذ ${PRESETS[selectedMode].label}` : 'جاهز لجلسة تركيز جديدة؟',
  );
}

function tick() {
  const ctx = ctxRef;
  if (!ctx) return;
  const t = timer(ctx);
  if (!t) return syncTicker(ctx);
  const ms = remaining(t);
  document.querySelectorAll('[data-focus-clock]').forEach(el => (el.textContent = clock(ms)));
  if (t.pausedRemaining == null && ms <= 0) {
    clearInterval(ticker);
    ticker = null;
    complete(ctx, t).catch(console.error);
  }
}

function syncTicker(ctx) {
  ctxRef = ctx;
  const t = timer(ctx);
  const running = t && t.pausedRemaining == null;
  if (running && !ticker) ticker = setInterval(tick, 1000);
  if (!running && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
  if (running) tick();
}

export const pages = [
  { id: 'focus', title: 'مؤقت المذاكرة', label: 'مؤقت المذاكرة', icon: 'timer', render },
];
export const homeWidgets = [homeWidget];

export function start(ctx) {
  syncTicker(ctx);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
}

export const actions = {
  'focus-mode': (el, ctx) => {
    if (PRESETS[el.dataset.mode]) selectedMode = el.dataset.mode;
    ctx.render();
  },
  'focus-start': async (el, ctx) => {
    const now = Date.now();
    const course =
      document.getElementById('focus-course')?.value ??
      (selectedCourse || ctx.state.courseId || '');
    const mode = el.closest('.widget') ? 'focus' : selectedMode;
    await save(ctx, {
      mode,
      courseId: course,
      startedAt: now,
      endsAt: now + PRESETS[mode].minutes * 60000,
    });
    if ('Notification' in window && Notification.permission === 'default')
      Notification.requestPermission().catch(() => {});
  },
  'focus-pause': async (el, ctx) => {
    const t = timer(ctx);
    if (t) await save(ctx, { ...t, pausedRemaining: remaining(t) });
  },
  'focus-resume': async (el, ctx) => {
    const t = timer(ctx);
    if (!t) return;
    const now = Date.now();
    const elapsed = t.endsAt - t.startedAt - t.pausedRemaining;
    const { pausedRemaining, ...rest } = t;
    await save(ctx, { ...rest, startedAt: now - elapsed, endsAt: now + pausedRemaining });
  },
  'focus-stop': async (el, ctx) => {
    const t = timer(ctx);
    if (!t) return;
    const studied = (t.endsAt - t.startedAt - remaining(t)) / 60000;
    if (t.mode === 'focus' && studied >= 1) await recordSession(ctx, t, studied);
    await save(ctx, null);
    ctx.toast(
      studied >= 1 && t.mode === 'focus'
        ? `سُجّلت ${Math.round(studied)} دقيقة مذاكرة`
        : 'تم إنهاء المؤقت',
    );
  },
};

export const changes = {
  'focus-course': el => {
    selectedCourse = el.value;
  },
};
