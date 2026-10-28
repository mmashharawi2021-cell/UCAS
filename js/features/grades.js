// Phase 3 — grade book per course and weighted average (GPA).
import {
  DEFAULT_COMPONENTS,
  DEFAULT_PASS_MARK,
  courseMark,
  courseResult,
  gpa,
  neededForTarget,
  rating,
} from '../lib/grades.js?v=1.7.0';
import {
  UCAS_FALL_2026,
  matchCourse,
  semesterSummary,
  combinedPrevious,
  passedHours,
  suggestNextSemester,
} from '../lib/semester.js?v=1.7.0';

const SETTINGS_KEY = 'gpa-settings';
const SEMESTER_KEY = 'current-semester';
const HISTORY_KEY = 'semesters';

function history(ctx) {
  const list = ctx.setting(HISTORY_KEY);
  return Array.isArray(list) ? list : [];
}

/** Hours/average before the current term: entered by hand + archived semesters. */
function previous(ctx) {
  const s = settings(ctx);
  return combinedPrevious({ hours: s.previousHours, average: s.previousAverage }, history(ctx));
}

function settings(ctx) {
  return {
    passMark: DEFAULT_PASS_MARK,
    previousHours: '',
    previousAverage: '',
    ...(ctx.setting(SETTINGS_KEY) || {}),
  };
}

function entry(ctx, courseId) {
  return (
    ctx.state.grades.find(g => g.id === courseId) || {
      id: courseId,
      courseId,
      hours: '',
      finalMark: '',
      target: '',
      components: DEFAULT_COMPONENTS.map(c => ({ ...c, score: '', max: c.weight })),
    }
  );
}

const fmt = n => (n === null || n === undefined ? '—' : `${Number(n).toFixed(n % 1 ? 1 : 0)}`);

function courseCard(ctx, course) {
  const { esc, ic } = ctx;
  const e = entry(ctx, course.id);
  const s = settings(ctx);
  const result = courseResult(e.components);
  const mark = courseMark(e);
  const need = e.target ? neededForTarget(e.components, Number(e.target)) : undefined;
  const field = (name, value, attrs = '') =>
    `<input class="input grade-input" ${attrs} value="${esc(value ?? '')}" data-act-change="grade-field" data-course="${esc(course.id)}" data-field="${name}"/>`;
  return `<article class="panel grade-card" data-card="${esc(course.id)}"><div class="grade-head"><div class="grow"><h3>${course.code ? `<span class="code-pill">${esc(course.code)}</span> ` : ''}${esc(course.title)}</h3><p class="muted tiny">${
    mark !== null
      ? `العلامة النهائية: <strong>${fmt(mark)}</strong> · ${rating(mark, s.passMark)}`
      : result.weightEntered
        ? `حتى الآن: ${fmt(result.earned)} من ${fmt(result.weightEntered)} (${fmt(result.percent)}%)`
        : 'لم تُدخل علامات بعد'
  }</p></div><label class="hours-field">الساعات ${field('hours', e.hours, 'type="number" min="0" max="12" step="1" inputmode="numeric" aria-label="الساعات المعتمدة"')}</label></div><div class="grade-table" role="table"><div class="grade-row grade-header" role="row"><span>المكوّن</span><span>الوزن %</span><span>علامتك</span><span>من</span><span></span></div>${e.components
    .map(
      (c, i) =>
        `<div class="grade-row" role="row"><input class="input grade-input" value="${esc(c.name)}" data-act-change="grade-component" data-course="${esc(course.id)}" data-index="${i}" data-field="name" aria-label="اسم المكوّن"/><input class="input grade-input" type="number" min="0" max="100" value="${esc(c.weight)}" data-act-change="grade-component" data-course="${esc(course.id)}" data-index="${i}" data-field="weight" aria-label="الوزن"/><input class="input grade-input" type="number" min="0" step="0.25" value="${esc(c.score)}" data-act-change="grade-component" data-course="${esc(course.id)}" data-index="${i}" data-field="score" aria-label="علامتك" inputmode="decimal"/><input class="input grade-input" type="number" min="1" step="0.25" value="${esc(c.max)}" data-act-change="grade-component" data-course="${esc(course.id)}" data-index="${i}" data-field="max" aria-label="العلامة القصوى"/><button class="btn-mini" data-act="grade-remove-component" data-course="${esc(course.id)}" data-index="${i}" aria-label="حذف المكوّن">${ic('close', 14)}</button></div>`,
    )
    .join(
      '',
    )}</div>${Math.abs(result.weightTotal - 100) > 0.01 && e.components.length ? `<p class="tiny wrong-text">مجموع الأوزان ${fmt(result.weightTotal)}% وليس 100%.</p>` : ''}<div class="grade-foot"><button class="subtle-btn" data-act="grade-add-component" data-course="${esc(course.id)}">${ic('plus', 15)} مكوّن</button><label>العلامة النهائية الرسمية (إن وُجدت) ${field('finalMark', e.finalMark, 'type="number" min="0" max="100" step="0.5" inputmode="decimal"')}</label><label>هدفي ${field('target', e.target, 'type="number" min="0" max="100" inputmode="numeric"')}</label></div>${
    need === undefined || mark !== null
      ? ''
      : need === null
        ? `<p class="tiny wrong-text">الهدف ${esc(e.target)} غير ممكن بالعلامات المتبقية.</p>`
        : need === 0
          ? `<p class="tiny correct-text">حققت هدفك ${esc(e.target)} بالفعل.</p>`
          : `<p class="tiny">لتحقيق ${esc(e.target)} تحتاج <strong>${fmt(need)}%</strong> في المكوّنات المتبقية.</p>`
  }</article>`;
}

function summary(ctx) {
  const { state, stat } = ctx;
  const s = settings(ctx);
  const result = gpa(
    state.courses.map(c => entry(ctx, c.id)),
    previous(ctx),
  );
  return `<div class="stats-grid" id="gpa-summary">${stat('percent', fmt(result.semester), 'المعدل الفصلي')}${stat('award', result.semester === null ? '—' : rating(result.semester, s.passMark), 'التقدير')}${stat('book', result.semesterHours, 'ساعات محسوبة')}${stat('chart', fmt(result.cumulative), 'المعدل التراكمي')}</div>`;
}

function render(ctx) {
  const { state, intro, esc } = ctx;
  const s = settings(ctx);
  return `${intro('العلامات والمعدل', 'سجّل علامات كل مساق لتعرف معدلك الفصلي والتراكمي وما تحتاجه في النهائي')}${summary(ctx)}${semesterPanel(ctx)}<div class="grades-grid">${state.courses
    .map(c => courseCard(ctx, c))
    .join(
      '',
    )}</div>${historyPanel(ctx)}<form id="gpa-settings-form" class="panel gpa-settings"><h3>قبل استخدام المنصة</h3><p class="muted tiny">الساعات والمعدل التراكمي حتى نهاية آخر فصل لم تسجّله هنا. الفصول التي تؤرشفها تُضاف تلقائيًا.</p><div class="form-grid"><div class="field"><label for="prev-hours">ساعات مجتازة سابقًا</label><input id="prev-hours" class="input" type="number" min="0" name="previousHours" value="${esc(s.previousHours)}"/></div><div class="field"><label for="prev-avg">المعدل التراكمي السابق</label><input id="prev-avg" class="input" type="number" min="0" max="100" step="0.01" name="previousAverage" value="${esc(s.previousAverage)}"/></div><div class="field"><label for="pass-mark">علامة النجاح</label><input id="pass-mark" class="input" type="number" min="0" max="100" name="passMark" value="${esc(s.passMark)}"/></div></div><button class="outline-btn" type="submit">حفظ</button><p class="muted tiny">المعدل محسوب بالنسبة المئوية ومرجّح بالساعات المعتمدة. تحقق دائمًا من لوائح الكلية؛ هذه ليست علامات رسمية.</p></form>`;
}

function semesterPanel(ctx) {
  const { esc, ic, state } = ctx;
  const s = settings(ctx);
  const name = ctx.setting(SEMESTER_KEY) || 'الفصل الحالي';
  const hours = state.courses.reduce((sum, c) => sum + (Number(entry(ctx, c.id).hours) || 0), 0);
  const passed = passedHours({ hours: s.previousHours }, history(ctx), s.passMark);
  const needsAverage = Number(s.previousHours) > 0 && s.previousAverage === '';
  return `<div class="panel semester-panel"><div class="semester-head"><div class="grow"><h3>${ic('calendar', 17)} ${esc(name)}</h3><p class="muted tiny">${state.courses.length} مساقات · ${hours} ساعة مسجلة · ${passed} ساعة مجتازة قبل هذا الفصل</p></div><div class="row-actions"><button class="outline-btn" data-action="add-course">${ic('plus', 15)} مساق</button><button class="outline-btn" data-act="semester-archive">${ic('download', 15)} إنهاء الفصل</button></div></div>${needsAverage ? `<p class="tiny wrong-text">أدخل معدلك التراكمي السابق في الأسفل ليظهر المعدل التراكمي.</p>` : ''}</div>`;
}

function historyPanel(ctx) {
  const { esc } = ctx;
  const list = history(ctx);
  if (!list.length) return '';
  return `<div class="panel"><h3>الفصول السابقة</h3>${list
    .slice()
    .reverse()
    .map(
      h =>
        `<details class="accordion"><summary>${esc(h.name)} <span class="pill">${h.hours} ساعة · ${fmt(h.average)}</span></summary><div class="accordion-body">${h.courses
          .map(
            c =>
              `<div class="item-row"><div><h4>${esc(c.title)}</h4><p>${esc(c.code || '')} · ${c.hours} ساعة</p></div><span class="pill">${fmt(c.mark)}</span></div>`,
          )
          .join('')}</div></details>`,
    )
    .join('')}</div>`;
}

/** One-time: fill the Fall 2026/2027 plan (codes, credit hours, passed hours). */
async function seedPlan(ctx) {
  const plan = UCAS_FALL_2026;
  if (ctx.setting(`seed-${plan.key}`)) return;
  for (const c of plan.courses) {
    const course = matchCourse(ctx.state.courses, c.title);
    if (!course) continue;
    if (!course.code) await ctx.putDefault('courses', { ...course, code: c.code });
    const e = entry(ctx, course.id);
    if (!e.hours) await ctx.putDefault('grades', { ...e, hours: String(c.hours) });
  }
  const s = settings(ctx);
  if (!s.previousHours)
    await ctx.saveDefaultSetting(SETTINGS_KEY, { ...s, previousHours: String(plan.previousHours) });
  if (!ctx.setting(SEMESTER_KEY)) await ctx.saveDefaultSetting(SEMESTER_KEY, plan.name);
  await ctx.saveDefaultSetting(`seed-${plan.key}`, true);
  await ctx.refresh();
}

export function start(ctx) {
  seedPlan(ctx).catch(err => console.warn('seed', err));
}

async function update(ctx, courseId, change) {
  const e = structuredClone(entry(ctx, courseId));
  change(e);
  await ctx.put('grades', e);
  const i = ctx.state.grades.findIndex(g => g.id === courseId);
  if (i >= 0) ctx.state.grades[i] = e;
  else ctx.state.grades.push(e);
}

/** Redraw one course card and the summary without losing where the user is typing. */
function redraw(ctx, courseId) {
  const active = document.activeElement;
  const key = active?.dataset?.course
    ? `[data-course="${CSS.escape(active.dataset.course)}"][data-field="${active.dataset.field}"]${active.dataset.index ? `[data-index="${active.dataset.index}"]` : ''}`
    : null;
  const course = ctx.state.courses.find(c => c.id === courseId);
  const card = document.querySelector(`[data-card="${CSS.escape(courseId)}"]`);
  if (card && course) card.outerHTML = courseCard(ctx, course);
  const stats = document.getElementById('gpa-summary');
  if (stats) stats.outerHTML = summary(ctx);
  if (key) document.querySelector(key)?.focus();
}

function homeWidget(ctx) {
  const { state, ic } = ctx;
  if (!state.grades.length) return '';
  const s = settings(ctx);
  const result = gpa(
    state.courses.map(c => entry(ctx, c.id)),
    previous(ctx),
  );
  if (result.semester === null) return '';
  return `<div class="widget"><div class="widget-head"><h3>${ic('percent', 17)} المعدل الفصلي</h3><button class="link" data-go="grades">العلامات</button></div><div class="widget-figure">${fmt(result.semester)}</div><p class="muted tiny">${rating(result.semester, s.passMark)} · ${result.semesterHours} ساعة</p></div>`;
}

export const pages = [
  { id: 'grades', title: 'العلامات والمعدل', label: 'العلامات والمعدل', icon: 'percent', render },
];
export const homeWidgets = [homeWidget];

export const actions = {
  'semester-archive': (el, ctx) => {
    const { modal, esc, ic } = ctx;
    const current = ctx.setting(SEMESTER_KEY) || 'الفصل الحالي';
    const missing = ctx.state.courses.filter(c => courseMark(entry(ctx, c.id)) === null).length;
    modal(
      'إنهاء الفصل الدراسي',
      `<form id="semester-archive-form"><p class="muted tiny">سيُحفظ «${esc(current)}» بعلاماته في سجل الفصول، وتُخفى مساقاته من القوائم (ملفاتها وملاحظاتها تبقى محفوظة). ثم تضيف مساقات الفصل الجديد.</p>${missing ? `<div class="notice warn">${missing} مساق بدون علامة نهائية؛ لن يدخل في المعدل.</div>` : ''}<div class="field"><label for="next-sem">اسم الفصل الجديد</label><input id="next-sem" class="input" name="next" required maxlength="60" value="${esc(suggestNextSemester(current))}" placeholder="مثال: الفصل الثاني 2026/2027"/></div><button class="primary-btn" type="submit">${ic('check')} أرشفة وبدء الفصل الجديد</button></form>`,
    );
  },
  'grade-add-component': async (el, ctx) => {
    await update(ctx, el.dataset.course, e =>
      e.components.push({ name: 'مكوّن', weight: 10, score: '', max: 10 }),
    );
    ctx.render();
  },
  'grade-remove-component': async (el, ctx) => {
    await update(ctx, el.dataset.course, e => e.components.splice(Number(el.dataset.index), 1));
    ctx.render();
  },
};

export const changes = {
  'grade-field': async (el, ctx) => {
    const field = el.dataset.field;
    if (!['hours', 'finalMark', 'target'].includes(field)) return;
    await update(ctx, el.dataset.course, e => (e[field] = el.value));
    redraw(ctx, el.dataset.course);
  },
  'grade-component': async (el, ctx) => {
    const field = el.dataset.field;
    if (!['name', 'weight', 'score', 'max'].includes(field)) return;
    await update(ctx, el.dataset.course, e => {
      const c = e.components[Number(el.dataset.index)];
      if (c) c[field] = field === 'name' ? el.value.slice(0, 60) : el.value;
    });
    redraw(ctx, el.dataset.course);
  },
};

export const forms = {
  'semester-archive-form': async (form, ctx) => {
    const next = String(new FormData(form).get('next') || '').trim();
    if (!next) throw new Error('اكتب اسم الفصل الجديد');
    const current = ctx.setting(SEMESTER_KEY) || 'الفصل الحالي';
    const summaryRow = semesterSummary(current, ctx.state.courses, ctx.state.grades);
    await ctx.saveSetting(HISTORY_KEY, [...history(ctx), summaryRow]);
    for (const c of ctx.state.courses)
      await ctx.put('courses', { ...c, archived: true, semester: current });
    await ctx.saveSetting(SEMESTER_KEY, next);
    ctx.closeModal();
    await ctx.refresh();
    ctx.toast(`أُرشف ${current}. أضف مساقات ${next}.`);
  },
  'gpa-settings-form': async (form, ctx) => {
    const fd = new FormData(form);
    await ctx.saveSetting(SETTINGS_KEY, {
      previousHours: String(fd.get('previousHours') || ''),
      previousAverage: String(fd.get('previousAverage') || ''),
      passMark: Number(fd.get('passMark')) || DEFAULT_PASS_MARK,
    });
    await ctx.refresh();
    ctx.toast('تم حفظ الإعدادات');
  },
};
