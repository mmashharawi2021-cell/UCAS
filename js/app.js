import {
  initialize,
  all,
  get,
  getFile,
  put,
  remove,
  makeId,
  backup,
  restore,
  requestPersistence,
  storageStatus,
  exportStores,
} from './store.js?v=1.4.0';
import { features } from './features/index.js?v=1.4.0';
import { normalizeCode } from './lib/semester.js?v=1.4.0';
import { DEFAULT_COMPONENTS } from './lib/grades.js?v=1.4.0';

const APP_VERSION = '1.4.0';
const BACKUP_REMINDER_DAYS = 7;
import { esc, ic } from './ui.js?v=1.4.0';
import { parseICS } from './ics.js?v=1.4.0';
import { previewOffice } from './office.js?v=1.4.0';
import { cleanMoodlePaste, readMoodleCourseFile } from './moodle.js?v=1.4.0';
import { validateStudyFiles, parseDriveReference, normalizeDriveTitle } from './drive.js?v=1.4.0';
import {
  loadCourseText,
  searchStudySources,
  extractReviewCards,
  extractPassageCards,
  buildDefinitionQuiz,
  formatChatGPTStudyPrompt,
} from './study.js?v=1.4.0';
import { extractPdfText } from './pdf-text.js?v=1.4.0';
import { readPDFWithOCR } from './ocr.js?v=1.4.0';

const titles = {
  home: 'الرئيسية',
  courses: 'مساقاتي',
  moodle: 'ربط Moodle',
  import: 'مركز الاستيراد',
  quizzes: 'الاختبارات التدريبية',
  tasks: 'التكليفات والتقويم',
  progress: 'التقدم الدراسي',
  settings: 'الإعدادات',
  search: 'نتائج البحث',
  ...Object.fromEntries(features.pages.map(p => [p.id, p.title])),
};
const coursesSymbols = ['database', 'layers', 'globe', 'map', 'lightbulb', 'briefcase', 'code'];
function fmtDate(x) {
  if (!x) return 'بدون موعد';
  const raw = String(x);
  const naive = /^\d{4}-\d{2}-\d{2}T[0-9:]+$/.test(raw);
  const d = new Date(raw);
  return Number.isNaN(d.getTime())
    ? esc(raw)
    : new Intl.DateTimeFormat('ar-PS', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: naive ? 'UTC' : 'Asia/Hebron',
      }).format(naive ? new Date(raw + 'Z') : d);
}
function fmtTime(x) {
  if (!x) return '';
  const d = new Date(x);
  return Number.isNaN(d.getTime())
    ? ''
    : new Intl.DateTimeFormat('ar-PS', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Hebron',
      }).format(d);
}
function formatSize(n) {
  return n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;
}
function safeUrl(str) {
  try {
    let u = new URL(str);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}
const state = {
  page: 'home',
  courses: [],
  allCourses: [],
  resources: [],
  tasks: [],
  events: [],
  attempts: [],
  progress: [],
  settings: [],
  courseId: null,
  courseTab: 'lessons',
  importTab: 'drive',
  collapsed: false,
  mobileMenu: false,
  homeExtrasOpen: false,
  query: '',
  activeQuiz: null,
  quizDraft: null,
  questionBank: [],
  notice: null,
  mode: 'auto',
  moodlePreview: null,
  moodleSelectedCourseId: null,
  moodleImportFile: null,
  moodleImportError: null,
  storage: { usage: null, quota: null, persisted: false, supported: false },
  // v0.9 study features
  schedule: [],
  notes: [],
  sessions: [],
  exams: [],
  grades: [],
  reviews: [],
};
const STUDY_STORES = ['schedule', 'notes', 'sessions', 'exams', 'grades', 'reviews'];
function questionsForCourse(courseId) {
  const index = state.courses.findIndex(c => c.id === courseId);
  return index < 0 ? [] : sampleAndPersonalQuestions(index);
}
function closeModal() {
  document.querySelector('.modal-backdrop')?.remove();
}
/** Offer a generated file: native share sheet when possible (phones), else download. */
async function deliverFile(name, text, type, shareTitle = '') {
  const file = new File([text], name, { type });
  if (shareTitle && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: shareTitle });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}
// Everything a feature page (js/features/*) may use. Keep this surface small and stable.
const ctx = {
  state,
  esc,
  ic,
  intro,
  sectionHead,
  stat,
  noData,
  toast,
  modal,
  closeModal,
  render,
  refresh,
  go,
  put,
  get,
  all,
  remove,
  makeId,
  courseOption,
  courseName,
  fmtDate,
  questionsForCourse,
  deliverFile,
  saveQuestionBank: async bank => {
    state.questionBank = bank;
    await put('settings', { id: 'question-bank', value: bank });
  },
  setting: id => state.settings.find(s => s.id === id)?.value,
  saveSetting: (id, value) => put('settings', { id, value }),
  // Defaults written with mtime 0 never override a real edit synced from another device.
  putDefault: (store, value) => put(store, value, { mtime: 0 }),
  /** Readable text of one imported file (TXT/MD/DOCX/PPTX/text PDF), extracted on this device. */
  extractText: async id => {
    const r = await get('resources', id);
    if (!r?.blob) throw new Error('الملف غير محفوظ على هذا الجهاز');
    const data = await loadCourseText([r], r.courseId, previewOffice, {
      pdfPreview: extractPdfText,
    });
    if (data.documents[0]?.text?.trim()) return data.documents[0].text;
    throw new Error(
      data.unsupported.length
        ? 'صيغة هذا الملف غير مدعومة للقراءة'
        : data.errors[0] || 'لم يُعثر على نص قابل للقراءة (قد يكون PDF مصوّرًا)',
    );
  },
  saveDefaultSetting: (id, value) => put('settings', { id, value }, { mtime: 0 }),
};
let viewURL = null;
function courseName(id) {
  return (state.allCourses || state.courses).find(c => c.id === id)?.title || 'غير مصنّف';
}
function courseOption(selected) {
  return state.courses
    .map(
      c =>
        `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.title)}</option>`,
    )
    .join('');
}
function completedResources(courseId) {
  return state.resources.filter(r => r.courseId === courseId && r.completed).length;
}
function progressForCourse(id) {
  const total = state.resources.filter(r => r.courseId === id).length;
  return total ? Math.round((completedResources(id) * 100) / total) : 0;
}
function taskDone() {
  return state.tasks.filter(t => t.done).length;
}
function courseAttempts(id) {
  return state.attempts.filter(
    a => a.courseId === id || (!a.courseId && a.title?.includes(courseName(id))),
  );
}
function avgScore(attempts) {
  const valid = attempts.filter(a => a.total > 0);
  return valid.length
    ? Math.round(valid.reduce((sum, a) => sum + (a.correct / a.total) * 100, 0) / valid.length)
    : null;
}
function sampleAndPersonalQuestions(courseIndex) {
  return [
    ...questions.filter(q => q.courseIndex === courseIndex),
    ...state.questionBank.filter(q => q.courseId === state.courses[courseIndex]?.id),
  ];
}
function quizDraftValid(draft) {
  return !!(
    draft &&
    Array.isArray(draft.questions) &&
    draft.questions.length > 0 &&
    Number.isInteger(draft.pos) &&
    draft.pos >= 0 &&
    draft.pos < draft.questions.length &&
    draft.answers &&
    typeof draft.answers === 'object'
  );
}

function pending() {
  return state.tasks.filter(t => !t.done);
}
async function refresh() {
  [
    state.courses,
    state.resources,
    state.tasks,
    state.events,
    state.attempts,
    state.progress,
    state.settings,
  ] = await Promise.all(
    ['courses', 'resources', 'tasks', 'events', 'attempts', 'progress', 'settings'].map(all),
  );
  // Archived courses (finished semesters) stay in the database but leave the lists.
  state.allCourses = state.courses;
  state.courses = state.allCourses.filter(c => !c.archived);
  const study = await Promise.all(STUDY_STORES.map(all));
  STUDY_STORES.forEach((name, i) => (state[name] = study[i]));
  state.storage = await storageStatus();
  state.questionBank = Array.isArray(state.settings.find(s => s.id === 'question-bank')?.value)
    ? state.settings.find(s => s.id === 'question-bank').value
    : [];
  const draft = state.settings.find(s => s.id === 'quiz-draft')?.value;
  state.quizDraft = quizDraftValid(draft) ? draft : null;
  render();
  window.dispatchEvent(new CustomEvent('ucas-data-changed'));
}
function navFor(id) {
  const page = features.pages.find(p => p.id === id);
  return page ? [{ id: page.id, icon: page.icon, label: page.label || page.title }] : [];
}
function navItems() {
  return [
    { id: 'home', icon: 'home', label: 'الرئيسية' },
    ...navFor('schedule'),
    { id: 'courses', icon: 'book', label: 'مساقاتي' },
    ...navFor('focus'),
    ...navFor('exams'),
    { id: 'quizzes', icon: 'quiz', label: 'اختباراتي' },
    { id: 'tasks', icon: 'calendar', label: 'التكليفات والتقويم' },
    ...navFor('grades'),
    ...navFor('report'),
    ...navFor('groups'),
    { id: 'progress', icon: 'chart', label: 'التقدم الدراسي' },
    { id: 'import', icon: 'upload', label: 'مركز الاستيراد' },
    { id: 'moodle', icon: 'cloud', label: 'Moodle UCAS' },
    { id: 'settings', icon: 'settings', label: 'الإعدادات' },
  ];
}
function layout(content) {
  const selected = state.page === 'course' ? 'courses' : state.page;
  return `<div data-page="${esc(state.page)}" class="shell ${state.collapsed ? 'collapsed' : ''} ${state.mobileMenu ? 'mobile-open' : ''}">
<aside class="sidebar" aria-label="التنقل الرئيسي" ${state.mobileMenu ? 'data-open="true"' : ''}><div class="logo"><img width="39" height="39" src="assets/icon.svg" alt=""/><div class="logo-text"><div class="logo-title">UCAS <span class="premium-logo-word">STUDIO</span></div><div class="logo-sub">مساحة التعلم الأكاديمي</div></div><button class="mobile-menu-close" data-action="close-menu" aria-label="إغلاق القائمة">${ic('close', 19)}</button></div><span class="sidebar-section">القائمة الرئيسية</span><nav class="nav-group">${navItems()
    .map(
      n =>
        `<button data-go="${n.id}" title="${n.label}" class="nav-btn ${selected === n.id ? 'active' : ''}" ${selected === n.id ? 'aria-current="page"' : ''}>${ic(n.icon)}<span>${n.label}</span></button>`,
    )
    .join(
      '',
    )}</nav><div class="nav-footer">${ic('shield', 15)}<br>البيانات الدراسية محليًا افتراضيًا<br>الخدمات السحابية اختيارية</div></aside>
${state.mobileMenu ? `<button class="mobile-menu-overlay" data-action="close-menu" aria-label="إغلاق القائمة"></button>` : ''}
<div class="main-area"><header class="topbar"><div class="top-leading"><button class="icon-button" data-action="toggle-menu" aria-label="فتح أو طي القائمة">${ic('menu')}</button><div class="page-head"><div><h2>${state.page === 'course' ? 'تفاصيل المساق' : titles[state.page] || 'المركز الأكاديمي'}</h2><p>UCAS / ACADEMIC STUDIO</p></div></div></div><div class="top-actions"><div class="search-wrap">${ic('search')}<input aria-label="بحث في المصادر والمساقات" id="global-search" placeholder="ابحث عن مساق أو محاضرة..." value="${esc(state.query)}"/></div><button class="icon-button" data-action="search" aria-label="بحث">${ic('search')}</button><button class="icon-button" data-action="notifications" aria-label="التنبيهات">${ic('bell')}</button><button class="icon-button" data-action="theme" aria-label="تبديل المظهر">${ic(state.mode === 'dark' ? 'sun' : 'moon')}</button><span class="avatar desktop-only" aria-label="وضع شخصي">U</span></div></header><main class="content"><div class="page-stage">${content}</div></main></div><nav class="mobile-nav" aria-label="التنقل السفلي">${[
    { id: 'home', icon: 'home', label: 'الرئيسية' },
    { id: 'schedule', icon: 'grid', label: 'جدولي' },
    { id: 'courses', icon: 'book', label: 'مساقاتي' },
    { id: 'exams', icon: 'award', label: 'امتحاناتي' },
    { id: 'more', icon: 'menu', label: 'المزيد' },
  ]
    .map(
      n =>
        `<button class="${selected === n.id ? 'active' : ''}" data-${n.id === 'more' ? 'action="toggle-menu"' : `go="${n.id}"`}>${ic(n.icon)}<span>${n.label}</span></button>`,
    )
    .join('')}</nav></div>`;
}
function intro(title, subtitle, right = '') {
  return `<div class="page-intro"><div><div class="eyebrow">UCAS ACADEMIC BRIDGE</div><h1>${title}</h1><p>${subtitle}</p></div>${right}</div>`;
}
function sectionHead(title, action = '') {
  return `<div class="section-head"><h2>${title}</h2>${action}</div>`;
}
function stat(icon, value, label) {
  return `<div class="stat-card"><div class="stat-icon">${ic(icon)}</div><div><div class="val">${value}</div><div class="desc">${label}</div></div></div>`;
}
function courseCard(c, i) {
  const resources = state.resources.filter(r => r.courseId === c.id);
  const done = resources.filter(r => r.completed).length;
  const pct = progressForCourse(c.id);
  const openTasks = state.tasks.filter(t => t.courseId === c.id && !t.done).length;
  return `<article class="course-card premium-course-card" data-course-searchable="${esc(`${c.title} ${c.code || ''}`.toLowerCase())}">
    <div class="premium-course-top"><span class="premium-course-index">${String(i + 1).padStart(2, '0')}</span><span class="premium-course-tag">${c.code ? esc(c.code) : 'مساق دراسي'}</span></div>
    <div class="premium-course-symbol">${ic(coursesSymbols[i % coursesSymbols.length])}</div>
    <h3>${esc(c.title)}</h3>
    <p class="premium-course-meta">${resources.length} مصدر دراسي <span aria-hidden="true">·</span> ${openTasks} تكليف معلّق</p>
    <div class="premium-course-progress"><div class="premium-course-progress-caption"><span>التقدم في المساق</span><strong>${pct}%</strong></div><div class="progress-track" role="progressbar" aria-label="إنجاز ${esc(c.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div style="width:${pct}%"></div></div></div>
    <button class="premium-course-open" data-course="${esc(c.id)}" aria-label="فتح ${esc(c.title)}">فتح مساحة المساق <span aria-hidden="true">${ic('chevron')}</span></button>
  </article>`;
}
function noData(title, subtitle, icon = 'folder') {
  return `<div class="empty-state">${ic(icon, 31)}<strong>${title}</strong><p>${subtitle}</p></div>`;
}
function weekly() {
  const today = new Date();
  const first = new Date(today);
  first.setDate(today.getDate() - today.getDay());
  const names = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  return `<div class="week-grid">${names
    .map((n, i) => {
      const d = new Date(first);
      d.setDate(first.getDate() + i);
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const count =
        state.events.filter(e => (e.date || '').startsWith(ymd)).length +
        state.tasks.filter(t => (t.due || '').startsWith(ymd) && !t.done).length;
      return `<div class="week-day ${d.toDateString() === today.toDateString() ? 'today' : ''} ${count ? 'events' : ''}"><span>${n}</span><strong>${d.getDate()}</strong><span>${count ? `${count} حدث` : '—'}</span></div>`;
    })
    .join('')}</div>`;
}
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(i ? 1 : 0)} ${units[i]}`;
}
function lastBackupAt() {
  return state.settings.find(s => s.id === 'last-backup')?.value || null;
}
function backupIsDue() {
  if (!state.resources.length && !state.tasks.length && !state.attempts.length) return false;
  const last = lastBackupAt();
  if (!last) return true;
  return Date.now() - new Date(last).getTime() > BACKUP_REMINDER_DAYS * 86400000;
}
function backupReminder() {
  if (!backupIsDue()) return '';
  const last = lastBackupAt();
  const when = last
    ? `آخر نسخة احتياطية: ${esc(new Date(last).toLocaleDateString('ar'))}.`
    : 'لم تُنشئ أي نسخة احتياطية بعد.';
  return `<div class="notice warn backup-reminder" role="status"><strong>${ic('download')} احمِ ملفاتك</strong><p>${when} بياناتك محفوظة على هذا المتصفح فقط وقد تُفقد عند مسح بيانات الموقع.</p><button class="primary-btn" data-action="export">${ic('download')} تنزيل نسخة احتياطية الآن</button></div>`;
}
function storagePanel() {
  const st = state.storage;
  const pct = st.quota ? Math.min(100, Math.round((st.usage / st.quota) * 100)) : 0;
  const status = !st.supported
    ? 'المتصفح لا يدعم إدارة التخزين.'
    : st.persisted
      ? 'التخزين الدائم مفعّل: لن يحذف المتصفح بياناتك تلقائيًا عند امتلاء المساحة.'
      : 'التخزين غير محمي: قد يحذف المتصفح بياناتك تلقائيًا عند امتلاء مساحة الجهاز.';
  const last = lastBackupAt();
  return `<div class="panel storage-panel"><h2>حماية البيانات والمساحة</h2><p class="muted tiny" style="margin:8px 0">${status}</p><div class="progress-track" role="progressbar" aria-label="المساحة المستخدمة" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div style="width:${pct}%"></div></div><p class="muted tiny" style="margin:8px 0 14px">المستخدم: <bdi dir="ltr">${formatBytes(st.usage)}</bdi> من <bdi dir="ltr">${formatBytes(st.quota)}</bdi> متاحة للموقع${last ? ` · آخر نسخة احتياطية: ${esc(new Date(last).toLocaleString('ar'))}` : ' · لا توجد نسخة احتياطية بعد'}</p>${st.supported && !st.persisted ? `<button class="outline-btn" data-action="persist-storage">${ic('check')} طلب تخزين دائم</button>` : ''}</div>`;
}
function premiumOverview() {
  const nextTask = pending()
    .filter(t => t.due && Number.isFinite(new Date(t.due).getTime()))
    .sort((a, b) => a.due.localeCompare(b.due))[0];
  const nextExam = state.exams
    .filter(e => e.date && new Date(e.date).getTime() >= Date.now())
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  const latest = state.resources
    .filter(r => r.courseId)
    .slice()
    .sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')))[0];
  const focusCourse = state.courses.find(c => c.id === latest?.courseId) || state.courses[0];
  const total = state.resources.length;
  const complete = state.resources.filter(r => r.completed).length;
  const completion = total ? Math.round((complete / total) * 100) : 0;
  return `<section class="premium-focus" aria-labelledby="premium-focus-title">
    <div class="premium-focus-head"><div><span class="premium-kicker">STUDY WORKSPACE</span><h2 id="premium-focus-title">مساحة الدراسة اليوم</h2><p>خطوات عملية من بياناتك المسجلة داخل المنصة</p></div><span class="premium-edition">PREMIUM</span></div>
    <div class="premium-focus-grid">
      <article class="premium-focus-card"><div class="premium-card-title">${ic('calendar')} <span>التكليف التالي</span></div><h3>${nextTask ? esc(nextTask.title) : 'لا يوجد تكليف مجدول'}</h3><p>${nextTask ? `${esc(courseName(nextTask.courseId))} · ${fmtDate(nextTask.due)}` : 'أضف موعدًا لتظهر أولوياتك هنا'}</p><button class="premium-text-link" data-go="tasks">فتح التكليفات ${ic('chevron', 14)}</button></article>
      <article class="premium-focus-card"><div class="premium-card-title">${ic('award')} <span>الامتحان القادم</span></div><h3>${nextExam ? esc(nextExam.title) : 'لا يوجد امتحان قادم'}</h3><p>${nextExam ? `${esc(courseName(nextExam.courseId))} · ${fmtDate(nextExam.date)}` : 'أضف مواعيد الامتحانات لتخطيط المراجعة'}</p><button class="premium-text-link" data-go="exams">مركز الامتحانات ${ic('chevron', 14)}</button></article>
      <article class="premium-focus-card premium-resume"><div class="premium-card-title">${ic('book')} <span>واصل التعلم</span></div><h3>${focusCourse ? esc(focusCourse.title) : 'ابدأ بإضافة مساق'}</h3><p>${focusCourse ? 'افتح المحاضرات والملاحظات والمساعد الدراسي لهذا المساق' : 'نظم مساقاتك ومحاضراتك من مكان واحد'}</p><button class="premium-text-link" ${focusCourse ? `data-course="${esc(focusCourse.id)}"` : 'data-go="courses"'}>متابعة الدراسة ${ic('chevron', 14)}</button></article>
    </div>
    <div class="premium-progress"><div><strong>إنجاز المصادر الدراسية</strong><span>${complete} من ${total} · ${completion}%</span></div><div class="progress-track" role="progressbar" aria-label="إنجاز المصادر الدراسية" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${completion}"><div style="width:${completion}%"></div></div></div>
  </section>`;
}
function homePage() {
  const upcoming = pending()
    .filter(t => t.due)
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 3);
  const recent = state.resources
    .slice()
    .sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')))
    .slice(0, 3);
  const date = new Date().toLocaleDateString('ar-PS', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const total = state.resources.length;
  const done = state.resources.filter(r => r.completed).length;
  const percentage = total ? Math.round((done / total) * 100) : 0;
  return `<section class="hero premium-hero" aria-labelledby="premium-hero-title">
    <div class="premium-hero-copy"><div class="premium-hero-date">${ic('calendar', 15)} ${esc(date)} <span class="premium-hero-divider" aria-hidden="true"></span> مساحة دراستك</div><div class="premium-hero-eyebrow">UCAS · YOUR ACADEMIC SPACE</div><h1 id="premium-hero-title">كل خطوة اليوم<br><em>تقرّبك من هدفك</em></h1><p>مساقاتك ومحاضراتك وتكليفاتك في مساحة هادئة، مصممة للتركيز والإنجاز</p>
    <div class="premium-hero-buttons"><button class="primary-btn" data-go="courses">${ic('book')} متابعة المساقات</button><button class="outline-btn" data-go="import">${ic('plus')} إضافة محاضرة</button></div></div>
    <div class="premium-hero-score" aria-label="إنجاز المصادر ${percentage}%"><div class="premium-score-ring" style="--score:${percentage}%"><div><strong>${percentage}%</strong><span>إنجاز المصادر</span></div></div><p>${done} من ${total} مصدر مكتمل</p><span>تقدمك محسوب من بياناتك</span></div>
  </section>
  <div class="premium-action-bar" aria-label="إجراءات سريعة">
    <button data-go="schedule">${ic('calendar')} <span>جدولي</span></button>
    <button data-go="quizzes">${ic('quiz')} <span>اختبار سريع</span></button>
    <button data-go="tasks">${ic('check')} <span>التكليفات</span></button>
    <button data-go="progress">${ic('chart')} <span>إنجازي</span></button>
  </div>
  ${backupReminder()}
  <div class="stats-grid premium-stats">${stat('book', state.courses.length, 'مساق دراسي')}${stat('file', state.resources.length, 'مصدر ومحاضرة')}${stat('calendar', pending().length, 'تكليف قيد المتابعة')}${stat('quiz', state.attempts.length, 'محاولة اختبار')}</div>
  ${sectionHead('مساحة الأولويات', '<span class="premium-section-hint">ابدأ بالأهم</span>')}${premiumOverview()}
  ${sectionHead('مساقاتي', `<button class="link" data-go="courses">جميع المساقات ${ic('chevron', 14)}</button>`)}
  <div class="course-grid home-courses">${state.courses.slice(0, 6).map(courseCard).join('') || noData('ابدأ مساقك الأول', 'أضف مساقًا لتنظيم محاضراتك', 'book')}</div>
  <details class="premium-home-extras" ${matchMedia('(max-width: 860px)').matches && !state.homeExtrasOpen ? '' : 'open'}><summary>${ic('grid', 18)} المزيد من الأدوات والتقارير <span class="premium-extra-hint">المواعيد والمصادر والمذاكرة والتقدم</span></summary><div class="premium-home-extras-body"><div class="premium-home-lower"><div>${sectionHead('المواعيد القريبة', `<button class="link" data-go="tasks">التقويم</button>`)}<div class="panel premium-feed">${upcoming.length ? upcoming.map(t => `<div class="item-row"><div><h4>${esc(t.title)}</h4><p>${esc(courseName(t.courseId))}</p></div><span class="pill warn">${fmtDate(t.due)}</span></div>`).join('') : noData('لا توجد مواعيد قريبة', 'أضف التكليفات والمواعيد لتظهر هنا', 'calendar')}</div></div>
  <div>${sectionHead('أحدث المصادر', `<button class="link" data-go="import">إضافة مصدر</button>`)}<div class="panel premium-feed">${recent.length ? recent.map(r => resourceRow(r, true)).join('') : noData('مكتبتك جاهزة', 'أضف أول محاضرة أو رابط', 'folder')}</div></div></div>
  ${features.homeWidgets(ctx)}
  <div class="premium-footer-grid"><div>${sectionHead('تقويمي الأسبوعي')}<div class="panel">${weekly()}</div></div><div>${sectionHead('نظرة على تقدمي')}<div class="panel">${progressBars()}</div></div></div>
  <div class="moodle-shortcut"><div><strong>${ic('cloud')} Moodle UCAS</strong><p>يمكنك استيراد المصادر يدويًا دون مشاركة كلمة مرور الجامعة.</p></div><button class="outline-btn" data-go="moodle">مركز Moodle ${ic('chevron', 14)}</button></div></div></details>`;
}
function progressBars() {
  const total = state.resources.length;
  const completed = state.resources.filter(r => r.completed).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const taskPct = state.tasks.length ? Math.round((taskDone() / state.tasks.length) * 100) : 0;
  const quizPct = state.attempts.length
    ? Math.round(
        state.attempts.reduce((s, a) => s + (a.correct / a.total) * 100, 0) / state.attempts.length,
      )
    : 0;
  return `<div class="bar-graph">${[
    ['المحاضرات والمصادر', pct, `${completed}/${total}`],
    ['التكليفات المكتملة', taskPct, `${taskDone()}/${state.tasks.length}`],
    ['متوسط الاختبارات التدريبية', quizPct, `${state.attempts.length} محاولة`],
  ]
    .map(
      ([title, value, desc]) =>
        `<div><div class="bar-row"><strong>${title}</strong><span class="muted">${desc} — ${value}%</span></div><div class="progress-track"><div style="width:${value}%"></div></div></div>`,
    )
    .join(
      '',
    )}</div><div class="notice" style="margin-top:16px">هذه مؤشرات للنشاط داخل المنصة، وليست علامات جامعية رسمية.</div>`;
}
function coursesPage() {
  const totalResources = state.resources.filter(r =>
    state.courses.some(c => c.id === r.courseId),
  ).length;
  return `<section class="premium-library-intro"><div class="premium-library-copy"><span class="premium-kicker">MY LEARNING LIBRARY</span><h1>مكتبة مساقاتي</h1><p>مساحة واحدة لجميع محاضراتك وملاحظاتك وملفاتك الدراسية</p><div class="premium-library-counters"><span><strong>${state.courses.length}</strong> مساقات</span><span><strong>${totalResources}</strong> مصادر محفوظة</span></div></div><div class="premium-library-art" aria-hidden="true">${ic('book', 70)}</div></section>
  <div class="premium-library-toolbar"><label class="premium-library-search">${ic('search', 17)}<input id="course-filter" type="search" placeholder="ابحث باسم المساق أو رمزه..." autocomplete="off" aria-label="تصفية المساقات"/></label><button class="primary-btn" data-action="add-course">${ic('plus')} إضافة مساق</button></div>
  <div class="premium-library-label"><h2>جميع المساقات</h2><span id="course-filter-count" role="status">${state.courses.length} مساقات</span></div>
  <div class="course-grid premium-library-grid">${state.courses.map(courseCard).join('')}</div>
  <p class="premium-library-empty" id="course-filter-empty" hidden>لا توجد مساقات تطابق البحث</p>`;
}
function resourceRow(r, compact = false) {
  const mime = r.type || '';
  const type =
    r.kind === 'link'
      ? 'link'
      : mime.includes('pdf')
        ? 'file'
        : r.name?.toLowerCase().endsWith('.pptx')
          ? 'layers'
          : 'file';
  return `<div class="item-row"><div style="display:flex;gap:11px;align-items:center;min-width:0"><span class="file-badge">${ic(type)}</span><div style="min-width:0"><h4 style="overflow-wrap:anywhere">${esc(r.name)}</h4><p>${esc(courseName(r.courseId))} · ${r.kind === 'link' ? 'رابط' : `${formatSize(r.size || 0)} · ملف محلي`}</p></div></div><div class="row-actions">${!compact ? `<label class="toggle tiny"><input type="checkbox" data-complete-resource="${esc(r.id)}" ${r.completed ? 'checked' : ''}/> أنجزت</label>` : ''}<button class="btn-mini" data-view-resource="${esc(r.id)}">${r.kind === 'link' ? 'فتح الرابط' : 'عرض'}</button>${!compact ? `<button class="btn-mini" data-delete-resource="${esc(r.id)}" aria-label="حذف">${ic('trash', 15)}</button>` : ''}</div></div>`;
}
function coursePage() {
  const c = state.courses.find(c => c.id === state.courseId);
  if (!c) return coursesPage();
  const idx = state.courses.indexOf(c);
  const resources = state.resources.filter(r => r.courseId === c.id);
  const tasks = state.tasks.filter(t => t.courseId === c.id);
  const groups = Object.groupBy
    ? Object.groupBy(resources, r => r.module || 'مصادر المساق')
    : resources.reduce((a, r) => ((a[r.module || 'مصادر المساق'] ??= []).push(r), a), {});
  const tab = state.courseTab;
  return `<button class="back-line" data-go="courses">${ic('arrow', 15)} العودة للمساقات</button><div class="course-detail-hero"><div class="course-symbol">${ic(coursesSymbols[idx % coursesSymbols.length])}</div><div class="grow"><div class="breadcrumbs">المساقات / تفاصيل المساق${c.code ? ` · <bdi>${esc(c.code)}</bdi>` : ''}</div><h1>${esc(c.title)}</h1><p class="muted tiny">${resources.length} مصدر · ${tasks.length} تكليف · ${progressForCourse(c.id)}% إنجاز</p></div>${features.courseActions(ctx, c)}</div><div class="tabs"><button class="tab ${tab === 'lessons' ? 'active' : ''}" data-tab="lessons">المحاضرات والملفات</button><button class="tab ${tab === 'tasks' ? 'active' : ''}" data-tab="tasks">التكليفات</button>${features.courseTabs.map(t => `<button class="tab ${tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}<button class="tab ${tab === 'about' ? 'active' : ''}" data-tab="about">نظرة عامة</button></div>${
    features.courseTabs.some(t => t.id === tab)
      ? features.courseTabs.find(t => t.id === tab).render(ctx, c)
      : tab === 'lessons'
        ? `<div class="page-intro"><div><h2>وحدات ومحاضرات المساق</h2><p>الملفات مرتبة بحسب الوحدة أو اسم المحاضرة عند الاستيراد</p></div><button class="primary-btn" data-go="import">${ic('plus')} إضافة محاضرة</button></div>${
            Object.keys(groups).length
              ? Object.entries(groups)
                  .map(
                    ([module, items], i) =>
                      `<details class="accordion" ${i === 0 ? 'open' : ''}><summary>${ic('folder')} ${esc(module)} <span class="pill">${items.length} مصدر</span> <span class="chevron">${ic('chevron', 16)}</span></summary><div class="accordion-body">${items.map(r => resourceRow(r)).join('')}</div></details>`,
                  )
                  .join('')
              : noData(
                  'لا توجد محاضرات مستوردة',
                  'انتقل إلى مركز الاستيراد وأضف مصادر هذا المساق',
                  'folder',
                )
          }`
        : tab === 'tasks'
          ? `<div class="page-intro"><div><h2>تكليفات هذا المساق</h2></div><button class="primary-btn" data-action="add-task">${ic('plus')} تكليف جديد</button></div>${tasks.length ? tasks.map(taskRow).join('') : noData('لا توجد تكليفات', 'يمكنك إضافة تكليف يدويًا', 'calendar')}`
          : `<div class="panel">${progressBars()}<div class="divider"></div><p class="muted tiny">لا يوجد ربط مباشر بجلسة Moodle. محتوى هذه الصفحة مما استوردته أنت فقط.</p></div>`
  }<button class="ai-fab" data-action="assistant">${ic('bot')} المساعد الذكي</button>`;
}

function moodleHTMLForm() {
  const p = state.moodlePreview;
  const selected = state.moodleSelectedCourseId || state.courseId || '';
  return `<div class="moodle-html-import"><div class="notice info"><strong>استيراد صفحة مساق Moodle (MHT / MHTML / HTML)</strong><p>افتح المساق على موقع الجامعة بعد تسجيل الدخول هناك، واحفظ الصفحة من Chrome بصيغة MHT أو MHTML، أو بصيغة HTML من الحاسوب، ثم اختر الملف هنا. نفحص الصفحة محليًا ونستخرج أسماء الأنشطة والروابط الآمنة فقط؛ لا نحفظ نسخة HTML الخام أو رموز الجلسة. هذه ليست مزامنة تلقائية.</p></div>
 <div class="moodle-html-grid"><div class="field"><label for="moodle-html-file">ملف صفحة المساق (MHT أو HTML)</label><input class="input" type="file" id="moodle-html-file" accept=".html,.htm,.mht,.mhtml,text/html,multipart/related"/>${state.moodleImportFile ? `<p class="muted tiny">آخر ملف تم فحصه: ${esc(state.moodleImportFile)}</p>` : ''}</div><div class="field"><label for="moodle-html-course">المساق المراد الربط به</label><select id="moodle-html-course" class="select"><option value="">اختر المساق</option>${courseOption(selected)}</select></div></div>
 ${state.moodleImportError ? `<div class="notice info" role="alert"><strong>تعذر استيراد الملف:</strong> ${esc(state.moodleImportError)}<p>تأكد من فتح صفحة المساق نفسه بعد تسجيل الدخول وظهور المحاضرات، ثم احفظها من Chrome. يمكنك إعادة اختيار الملف هنا.</p></div>` : ''}
 ${p ? `<div class="moodle-preview" aria-live="polite"><div class="panel-heading"><h3>معاينة المستخرج: ${esc(p.courseTitle)}</h3><span class="pill">${p.resources.length} عنصر</span></div><p class="muted tiny">راجع العناصر قبل استيرادها. العناصر دون رابط ستُحفظ كملاحظات نصية، ولن تُحمّل صفحات Moodle المحمية تلقائيًا.</p><div class="moodle-preview-list">${p.resources.map((item, i) => `<label class="moodle-preview-item"><input type="checkbox" data-moodle-item="${i}" checked/><span><strong>${esc(item.title)}</strong><small>${esc(item.module)} · ${item.kind === 'link' ? 'رابط نشاط Moodle' : item.kind === 'summary' ? 'ملخص وحدة' : 'ملاحظة'}</small></span></label>`).join('')}</div><button class="primary-btn" type="button" data-action="moodle-import-preview">${ic('upload')} استيراد العناصر المحددة إلى المساق</button></div>` : `<div class="moodle-empty"><strong>لم تختر ملف MHT أو HTML بعد</strong><p class="muted tiny">يمكنك أيضًا استخدام نسخ النصوص أو استيراد الملفات وICS بالطريقة المعتادة.</p></div>`}
 </div>`;
}
function moodleImportForm() {
  return `<form id="moodle-form" class="moodle-import-form"><div class="notice info">ألصق نص محاضرة أو تعليمات تكليف تملك صلاحية الاطلاع عليها. تُحفظ نسخة نصية في متصفحك فقط. لا تلصق كلمات مرور أو رموز وصول أو بيانات زملائك.</div><div class="form-grid"><div class="field"><label for="moodle-course">المساق</label><select id="moodle-course" class="select" name="courseId" required><option value="">اختر المساق</option>${courseOption(state.courseId)}</select></div><div class="field"><label for="moodle-title">عنوان المادة</label><input id="moodle-title" class="input" name="title" maxlength="150" required placeholder="مثال: المحاضرة الثانية — مفهوم قواعد البيانات"/></div></div><div class="field"><label for="moodle-text">النص المنسوخ من Moodle</label><textarea id="moodle-text" name="content" class="textarea" maxlength="120000" rows="8" required placeholder="انسخ النص الدراسي من صفحة المساق أو المحاضرة في Moodle ثم ألصقه هنا..."></textarea><p class="muted tiny">لا يُجلب أي محتوى محمي تلقائيًا؛ أنت تحدد ما يُحفظ.</p></div><button class="primary-btn" type="submit">${ic('plus')} حفظ المادة داخل المساق</button></form>`;
}
function moodlePage() {
  const count = state.resources.filter(r => r.origin?.startsWith('moodle')).length;
  return `${intro('Moodle UCAS', 'استيراد آمن من حساب طالب عادي، دون كلمة مرور داخل منصتنا', `<a class="primary-btn" href="https://moodle.ucas.edu.ps/login/index.php" target="_blank" rel="noopener noreferrer">${ic('external')} فتح Moodle الرسمي</a>`)}<div class="moodle-status"><div class="moodle-status-icon">${ic('shield', 24)}</div><div><strong>الاستيراد من Moodle متاح بإذن المستخدم</strong><p>لا توجد مزامنة API مؤكدة مع حساب UCAS، ولا تصل هذه الواجهة إلى جلسة الجامعة. احتفظ بملفاتك داخل المتصفح بعد اختيارك لها.</p></div><span class="pill">${count} مصدر Moodle</span></div><div class="moodle-steps"><div><span>١</span><strong>الدخول الرسمي</strong><p>افتح مساقك في Moodle UCAS وسجّل الدخول هناك فقط.</p></div><div><span>٢</span><strong>تصدير محتوى مسموح</strong><p>احفظ صفحة المساق MHT من هاتفك أو HTML من الحاسوب أو نزّل المحاضرات أو ملف تقويم ICS.</p></div><div><span>٣</span><strong>المعاينة والاستيراد</strong><p>اختر العناصر التي تريد حفظها محليًا داخل مساقك.</p></div></div><div class="panel"><div class="panel-heading"><h3>استيراد صفحة المساق</h3><span class="pill">جديد</span></div>${moodleHTMLForm()}</div><div class="panel" style="margin-top:18px"><div class="panel-heading"><h3>استيراد نص من Moodle</h3><button class="link" data-go="import">مركز الاستيراد ${ic('chevron', 14)}</button></div>${moodleImportForm()}</div><div class="quick-actions"><button class="quick-action" data-action="moodle-files">${ic('upload')}<div><strong>ملفات المحاضرات</strong><p class="muted tiny">PDF وDOCX وPPTX</p></div></button><button class="quick-action" data-action="moodle-ics">${ic('calendar')}<div><strong>تقويم Moodle</strong><p class="muted tiny">ملف ICS من بوابة الجامعة</p></div></button><button class="quick-action" data-action="moodle-links">${ic('link')}<div><strong>روابط المواد</strong><p class="muted tiny">روابط مسموح بها</p></div></button></div>`;
}
function driveImportPanel(options) {
  return (
    "<div class='drive-import'><div class='drive-hero'><div class='drive-hero-icon'>☁</div><div><h2>مصادرك من Google Drive</h2><p>اختر ملفات مساقاتك من منتقي الملفات على الهاتف. عند ظهور Google Drive كمصدر، يمكنك اختيار الملفات منه مباشرة. لا تحتاج إلى تسجيل دخول في منصة UCAS.</p></div></div>" +
    "<div class='notice info'><strong>كيف تعمل هذه الطريقة؟</strong><p>الاستيراد يتم من الملفات التي تختارها أنت؛ لا تستطيع المنصة تصفح حساب Drive أو مزامنته تلقائيًا. إن لم يظهر Drive في منتقي ملفات Android، افتح Drive ونزّل الملف ثم حدده هنا. لا تُرسل الملفات إلى خادم.</p></div>" +
    "<a class='outline-btn drive-open-link' href='https://drive.google.com/drive/u/0/my-drive' target='_blank' rel='noopener noreferrer'>فتح Google Drive</a>" +
    "<div class='drive-panel'><div class='drive-label'>1. استيراد ملفات من Drive أو الجهاز</div><form id='drive-file-form'><div class='upload-zone'><strong>اختيار ملفات PDF وWord وPowerPoint</strong><p>الحد الأقصى 30 ملفًا في المرة الواحدة، و35 MB لكل ملف</p><input type='file' name='files' id='drive-files' accept='.pdf,.docx,.pptx,.txt,.md' multiple required></div><div class='form-grid'><div class='field'><label for='drive-course'>المساق المستهدف</label><select class='select' name='courseId' id='drive-course' required>" +
    options +
    "</select></div><div class='field'><label for='drive-module'>اسم المحاضرة / الوحدة</label><input class='input' id='drive-module' name='module' placeholder='مثال: المحاضرة الثانية'></div></div><button class='primary-btn' type='submit'>حفظ الملفات المختارة محليًا</button></form></div>" +
    "<div class='drive-panel'><div class='drive-label'>2. حفظ رابط Google Drive أو Docs</div><p class='muted tiny'>يُحفظ الرابط داخل المساق فقط؛ لا يستورد محتوى المستند أو يتجاوز صلاحيات Google.</p><form id='drive-link-form'><div class='field'><label for='drive-link-url'>رابط المستند أو الملف أو المجلد</label><input id='drive-link-url' class='input' name='url' type='url' placeholder='https://drive.google.com/file/d/...' required></div><div class='field'><label for='drive-link-name'>اسم المصدر (اختياري)</label><input id='drive-link-name' class='input' name='name' maxlength='180' placeholder='اسم المحاضرة أو المرجع'></div><div class='form-grid'><div class='field'><label for='drive-link-course'>المساق</label><select class='select' id='drive-link-course' name='courseId' required>" +
    options +
    "</select></div><div class='field'><label for='drive-link-module'>الوحدة</label><input class='input' id='drive-link-module' name='module' placeholder='مصادر Google Drive'></div></div><button class='outline-btn' type='submit'>حفظ الرابط في المساق</button></form></div></div>"
  );
}
function importPage() {
  let tab = state.importTab;
  let options = `<option value="">اختر المساق</option>${courseOption()}`;
  return `${intro('مركز الاستيراد', 'استورد ملفات الدراسة وروابط Google Drive إلى مساقاتك دون تسجيل دخول للمنصة')}<div class="notice info" style="margin-bottom:22px">المسار الموصى به الآن: Google Drive أو ملفات الجهاز. استيراد MHT من Moodle مؤجل مؤقتًا. جميع المصادر المستوردة تُحفظ في متصفحك، ولا تتم مزامنة الملفات تلقائيًا مع حساب Google.</div><div class="quick-actions"><button class="quick-action" data-import-tab="drive">${ic('cloud')}<div><strong>Google Drive</strong><p class="muted tiny">اختيار ملفات وحفظ الروابط</p></div></button><button class="quick-action" data-import-tab="files">${ic('upload')}<div><strong>رفع ملفات</strong><p class="muted tiny">PDF وDOCX وPPTX وTXT</p></div></button><button class="quick-action" data-import-tab="links">${ic('link')}<div><strong>روابط المحاضرات</strong><p class="muted tiny">روابط الويب والفيديو</p></div></button><button class="quick-action" data-import-tab="ics">${ic('calendar')}<div><strong>تقويم ICS</strong><p class="muted tiny">استيراد الأحداث والمواعيد</p></div></button></div><div class="tabs" style="margin-top:25px"><button class="tab ${tab === 'drive' ? 'active' : ''}" data-import-tab="drive">Google Drive</button><button class="tab ${tab === 'files' ? 'active' : ''}" data-import-tab="files">الملفات</button><button class="tab ${tab === 'links' ? 'active' : ''}" data-import-tab="links">الروابط</button><button class="tab ${tab === 'ics' ? 'active' : ''}" data-import-tab="ics">تقويم ICS</button><button class="tab ${tab === 'moodle' ? 'active' : ''}" data-import-tab="moodle">Moodle</button></div><div class="panel">${tab === 'moodle' ? `${moodleHTMLForm()}<div class="divider"></div>${moodleImportForm()}` : tab === 'files' ? `<form id="file-form"><div class="upload-zone">${ic('cloud')}<strong>ارفع ملفات المحاضرات والمراجع</strong><p>تظل الملفات محفوظة محليًا في متصفح هذا الجهاز</p><input id="source-files" name="files" type="file" multiple accept=".pdf,.docx,.pptx,.txt,.md" required/></div><div class="form-grid"><div class="field"><label for="file-course">المساق</label><select class="select" id="file-course" name="courseId" required>${options}</select></div><div class="field"><label for="file-module">الوحدة / المحاضرة</label><input id="file-module" class="input" name="module" placeholder="مثال: المحاضرة الأولى"/></div></div><button class="primary-btn" type="submit">${ic('upload')} حفظ الملفات في المكتبة</button></form>` : tab === 'links' ? `<form id="link-form"><div class="field"><label>عنوان المحاضرة أو المصدر</label><input class="input" name="name" required maxlength="180"/></div><div class="field"><label>رابط المصدر (HTTPS)</label><input class="input" type="url" name="url" required placeholder="https://..."/></div><div class="form-grid"><div class="field"><label>المساق</label><select class="select" name="courseId" required>${options}</select></div><div class="field"><label>الوحدة / المحاضرة</label><input class="input" name="module"/></div></div><button class="primary-btn" type="submit">${ic('plus')} حفظ الرابط</button></form>` : tab === 'ics' ? `<form id="ics-form"><div class="field"><label>اختر ملف تقويم ICS</label><input class="input" type="file" name="calendar" accept=".ics,text/calendar" required/></div><div class="notice warn" style="margin-bottom:15px">يدعم الاستيراد الحالي الأحداث الفردية. الأحداث المتكررة RRULE والمناطق الزمنية غير القياسية تحتاج معالجة إضافية قبل الاعتماد عليها كمواعيد نهائية.</div><button class="primary-btn" type="submit">${ic('calendar')} استيراد المواعيد</button></form>` : `${driveImportPanel(options)}`}</div>${sectionHead('ملفاتي المستوردة')}<div class="panel">${
    state.resources.length
      ? state.resources
          .slice()
          .reverse()
          .slice(0, 7)
          .map(r => resourceRow(r))
          .join('')
      : noData('لا توجد ملفات بعد', 'المكتبة فارغة إلى حين استيراد أول مصدر', 'folder')
  }</div>`;
}
function taskRow(t) {
  return `<article class="task-card"><label><input class="check-task" type="checkbox" data-toggle-task="${esc(t.id)}" ${t.done ? 'checked' : ''} aria-label="وضع مكتمل"/></label><div class="grow"><strong style="${t.done ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(t.title)}</strong><p>${esc(courseName(t.courseId))} · ${fmtDate(t.due)}</p></div><div class="row-actions"><span class="pill ${t.done ? 'success' : 'warn'}">${t.done ? 'مكتمل' : 'قيد الإنجاز'}</span><button class="btn-mini" data-delete-task="${esc(t.id)}" aria-label="حذف">${ic('trash', 16)}</button></div></article>`;
}
function tasksPage() {
  const taskList = state.tasks
    .slice()
    .sort(
      (a, b) =>
        (a.done === b.done ? 0 : a.done ? 1 : -1) ||
        (a.due || '9999').localeCompare(b.due || '9999'),
    );
  return `${intro('التكليفات والمواعيد', 'قائمة منظمة بمهامك ومواعيد التسليم', `<button class="primary-btn" data-action="add-task">${ic('plus')} تكليف جديد</button>`)}<div class="split-layout"><div><div class="panel-heading"><h3>قائمة التكليفات</h3><span class="pill">${pending().length} غير مكتمل</span></div><div class="card-stack">${taskList.length ? taskList.map(taskRow).join('') : noData('لا توجد تكليفات', 'أضف مهمة جديدة يدويًا أو استورد تقويم ICS', 'calendar')}</div></div><div><div class="panel"><div class="panel-heading"><h3>هذا الأسبوع</h3></div>${weekly()}</div><div class="panel" style="margin-top:17px"><div class="panel-heading"><h3>أحداث التقويم المستوردة</h3><span class="pill">${state.events.length}</span></div>${
    state.events.length
      ? state.events
          .slice()
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
          .slice(0, 12)
          .map(
            e =>
              `<div class="item-row"><div><h4>${esc(e.title)}</h4><p>${fmtDate(e.date)} ${e.recurring ? '· حدث متكرر (غير موسّع)' : ''}</p></div>${ic('calendar', 16)}</div>`,
          )
          .join('')
      : noData('لا توجد أحداث مستوردة', 'ارفع ملف ICS من مركز الاستيراد', 'calendar')
  }</div></div></div>`;
}
const questions = [
  {
    courseIndex: 0,
    question: 'أي مرحلة من مراحل إدارة المشروع تُحدَّد فيها الأهداف وأصحاب المصلحة الأساسيون؟',
    choices: ['البدء', 'الإغلاق', 'الرقابة', 'التنفيذ'],
    answer: 0,
    why: 'تحديد الهدف وأصحاب المصلحة من أنشطة مرحلة البدء العامة.',
  },
  {
    courseIndex: 0,
    question: 'ما الغرض الأساسي من خطة المشروع؟',
    choices: [
      'استبدال جمع البيانات',
      'تحديد الأنشطة والموارد والجدول الزمني',
      'إلغاء المتابعة',
      'ضمان عدم حدوث أي مخاطر',
    ],
    answer: 1,
    why: 'خطة المشروع تنظم الأعمال والموارد والزمن والمخاطر، ولا تضمن انعدام المشكلات.',
  },
  {
    courseIndex: 1,
    question: 'ما الوصف الأدق للمفتاح الأساسي (Primary Key) في قاعدة البيانات؟',
    choices: [
      'يسمح بتكرار معرف السجل',
      'يعرّف كل سجل بشكل فريد',
      'يستخدم لتنسيق الخرائط فقط',
      'يحدد لغة الواجهة',
    ],
    answer: 1,
    why: 'المفتاح الأساسي يستخدم لتعريف الصفوف دون تكرار.',
  },
  {
    courseIndex: 1,
    question: 'ما المقصود بالـ Spatial Index؟',
    choices: [
      'فهرسة مكانية لتحسين أداء الاستعلامات الجغرافية',
      'تحويل جدول إلى صورة',
      'تنسيق حجم الخط',
      'إنشاء مستخدم جديد',
    ],
    answer: 0,
    why: 'يساعد الفهرس المكاني في تسريع الاستعلامات الهندسية المكانية.',
  },
  {
    courseIndex: 2,
    question: 'ما الذي يميّز الاستشعار عن بعد عادةً؟',
    choices: [
      'ضرورة الملامسة المباشرة لكل جسم',
      'جمع بيانات عن الأهداف دون تماس مباشر',
      'عدم استخدام الأقمار الصناعية',
      'عدم الحاجة إلى تفسير البيانات',
    ],
    answer: 1,
    why: 'الاستشعار عن بعد يجمع معلومات عبر مستشعرات دون تماس مباشر مع الهدف.',
  },
  {
    courseIndex: 2,
    question: 'ما الفائدة العامة من استخدام نطاقات طيفية متعددة؟',
    choices: [
      'زيادة مساحة الشاشة',
      'تمييز الخصائص المختلفة للأهداف',
      'إلغاء جميع الأخطاء',
      'تحويل كل الصور إلى متجهات تلقائيًا',
    ],
    answer: 1,
    why: 'تختلف استجابة المواد الطيفية، مما يساعد على تمييزها.',
  },
];
function quizzesPage() {
  const quiz = state.activeQuiz;
  if (quiz) {
    const question = quiz.questions[quiz.pos];
    if (!question) {
      const correct = quiz.questions.reduce(
        (sum, q, i) => sum + (q.answer === quiz.answers[i] ? 1 : 0),
        0,
      );
      return `${intro('نتيجة الاختبار', 'نتائج تدريبية من أسئلة عامة أو أسئلة أضفتها بنفسك، وليست علامات UCAS')}<div class="panel result-panel"><div class="eyebrow">اكتمل الاختبار</div><h1 class="result-score">${correct} / ${quiz.questions.length}</h1><p class="muted">${Math.round((correct / quiz.questions.length) * 100)}% إجابات صحيحة</p><div class="divider"></div>${quiz.questions.map((q, i) => `<div class="review-answer"><strong>${esc(q.question)}</strong><p class="tiny ${q.answer === quiz.answers[i] ? 'correct-text' : 'wrong-text'}">${q.answer === quiz.answers[i] ? 'إجابة صحيحة' : 'إجابة غير صحيحة'} · الإجابة: ${esc(q.choices[q.answer])}</p><p class="tiny muted">${esc(q.why || 'لا يوجد تفسير مدخل')}</p>${q.source ? `<p class="tiny muted">المرجع: ${esc(q.source)}</p>` : ''}</div>`).join('')}<button class="primary-btn" data-action="finish-quiz">العودة للاختبارات</button></div>`;
    }
    return `${intro('اختبار تدريبي', 'تُحفظ إجاباتك محليًا أثناء التقدم بالسؤال، ويمكنك استكمال الاختبار لاحقًا')}<div class="panel quiz-panel"><div class="panel-heading"><h3>${esc(quiz.title)}</h3><span class="pill">السؤال ${quiz.pos + 1} من ${quiz.questions.length}</span></div><div class="progress-track"><div style="width:${(quiz.pos / quiz.questions.length) * 100}%"></div></div><div class="quiz-question">${esc(question.question)}</div><fieldset class="quiz-options"><legend class="tiny muted">اختر إجابة واحدة</legend>${question.choices.map((ch, i) => `<label class="answer-choice"><input type="radio" name="quiz-answer" value="${i}" ${quiz.answers[quiz.pos] === i ? 'checked' : ''}/><span>${esc(ch)}</span></label>`).join('')}</fieldset><div class="row-actions quiz-nav"><button class="outline-btn" data-action="prev-question" ${quiz.pos === 0 ? 'disabled' : ''}>السابق</button><button class="primary-btn" data-action="next-question">${quiz.pos === quiz.questions.length - 1 ? 'إظهار النتائج' : 'السؤال التالي'} ${ic('chevron', 15)}</button></div><p class="tiny muted">الإجابات محفوظة محليًا بعد اختيارها. يمكنك الرجوع دون فقد الاختيار.</p></div>`;
  }
  return `${intro('الاختبارات التدريبية', 'اختبر معلوماتك في كل مساق باستخدام الأسئلة المتوفرة أو أسئلتك الخاصة')}<div class="notice info" style="margin-bottom:23px">الأسئلة العامة أمثلة تدريبية مستقلة عن Moodle. ويمكنك إضافة أسئلة من مراجع المحاضرات بنفسك، دون إرسال أي معلومات لخادم خارجي.</div>${quizDraftValid(state.quizDraft) ? `<div class="panel draft-panel"><div><strong>لديك اختبار غير مكتمل</strong><p class="muted tiny">${esc(state.quizDraft.title)} — السؤال ${state.quizDraft.pos + 1} من ${state.quizDraft.questions.length}</p></div><div class="row-actions"><button class="primary-btn" data-action="resume-quiz">متابعة الاختبار</button><button class="outline-btn" data-action="discard-quiz">حذف المسودة</button></div></div>` : ''}<div class="course-grid">${state.courses
    .map((c, i) => {
      const count = sampleAndPersonalQuestions(i).length;
      return `<div class="course-card"><div class="course-symbol">${ic(coursesSymbols[i % coursesSymbols.length])}</div><h3>${esc(c.title)}</h3><p class="muted tiny">${count} سؤال متاح · ${courseAttempts(c.id).length} محاولة محفوظة</p><div class="row-actions"><button class="primary-btn" data-start-quiz="${i}" ${count ? '' : 'disabled'}>بدء الاختبار ${ic('chevron', 16)}</button><button class="outline-btn" data-add-question="${esc(c.id)}">${ic('plus', 14)} إضافة سؤال</button></div></div>`;
    })
    .join('')}</div>${sectionHead('سجل المحاولات')}<div class="panel">${
    state.attempts.length
      ? state.attempts
          .slice()
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
          .map(
            a =>
              `<div class="item-row"><div><h4>${esc(a.title)}</h4><p>${fmtDate(a.date)}</p></div><span class="pill success">${a.correct}/${a.total}</span></div>`,
          )
          .join('')
      : noData('لم تُجرَ اختبارات بعد', 'ابدأ أحد الاختبارات التدريبية لحفظ نتيجته', 'quiz')
  }</div>`;
}
function progressPage() {
  return `${intro('التقدم الدراسي', 'قياسات نشاطك داخل المنصة فقط')}<div class="stats-grid">${stat('book', state.courses.length, 'مساقات مسجلة')}${stat('check', state.resources.filter(r => r.completed).length, 'مصادر مكتملة')}${stat('calendar', taskDone(), 'تكليفات مكتملة')}${stat('quiz', state.attempts.length, 'اختبارات تدريبية')}</div><div class="panel"><h2 style="margin-bottom:20px">مؤشرات الإنجاز</h2>${progressBars()}</div>${sectionHead('التقدم بحسب المساق')}<div class="panel">${state.courses
    .map(c => {
      const resources = state.resources.filter(r => r.courseId === c.id),
        done = resources.filter(r => r.completed).length;
      const tasks = state.tasks.filter(t => t.courseId === c.id),
        taskDoneCount = tasks.filter(t => t.done).length;
      const attempts = courseAttempts(c.id),
        score = avgScore(attempts);
      return `<div class="course-progress-card"><div class="bar-row"><strong>${esc(c.title)}</strong><span>${progressForCourse(c.id)}%</span></div><div class="progress-track"><div style="width:${progressForCourse(c.id)}%"></div></div><div class="metrics-row"><span>المصادر المكتملة: ${done}/${resources.length}</span><span>المهام المنجزة: ${taskDoneCount}/${tasks.length}</span><span>الاختبارات: ${attempts.length} محاولة</span><span>متوسط الإجابات الصحيحة: ${score === null ? 'لا توجد نتائج' : score + '%'}</span></div></div>`;
    })
    .join('')}</div>`;
}
function settingsPage() {
  return `${intro('الإعدادات', 'التحكم في المظهر والنسخ الاحتياطي والخصوصية')}<div class="card-stack">${storagePanel()}${features.settingsPanels(ctx)}<div class="panel"><h2>المظهر</h2><p class="muted tiny" style="margin:9px 0">اختر الوضع المناسب لك. سيُحفظ التفضيل على الجهاز.</p><div class="tabs">${[
    ['auto', 'حسب الجهاز'],
    ['light', 'فاتح'],
    ['dark', 'داكن'],
  ]
    .map(
      ([v, t]) =>
        `<button data-set-theme="${v}" class="tab ${state.mode === v ? 'active' : ''}">${t}</button>`,
    )
    .join(
      '',
    )}</div></div><div class="panel"><h2>النسخ الاحتياطي</h2><p class="muted tiny" style="margin:8px 0 16px">صدّر ملفاتك وبياناتك ونتائج اختباراتك في نسخة JSON. قد تكون النسخة كبيرة حسب حجم الملفات المحفوظة.</p><div class="row-actions"><button class="primary-btn" data-action="export">${ic('download')} تنزيل نسخة احتياطية</button><label class="outline-btn" style="cursor:pointer">${ic('upload')} استعادة نسخة <input id="restore-file" type="file" accept=".json,application/json" style="display:none"/></label></div><p class="muted tiny" style="margin-top:10px">الاستعادة تستبدل بيانات النسخة الحالية. احفظ نسخة احتياطية قبل الاستعادة.</p></div><div class="panel"><h2>خصوصية البيانات</h2><ul class="bullet-list"><li>تعمل الوظائف الدراسية الأساسية محليًا دون حساب. تحفظ الملفات والملاحظات أولًا في متصفح هذا الجهاز.</li><li>عند تفعيل المزامنة بحساب بريد إلكتروني، تُرفع بيانات الدراسة والملفات إلى مساحة سحابية خاصة بالحساب عبر Supabase.</li><li>عند استخدام مجموعات الدراسة، تُرسل أسماء المجموعات والاسم المستعار والرسائل إلى Supabase لعرضها لأعضاء المجموعة.</li><li>عند استخدام مساعد Gemini وبعد موافقتك، يُرسل نص المحاضرة المحددة وسؤالك إلى الخدمة لمعالجته؛ لا تُرسل الملفات تلقائيًا بمجرد استيرادها.</li><li>لا يطلب الموقع كلمة مرور Moodle ولا ينفذ مزامنة مباشرة معه. النسخ الاحتياطية JSON غير مشفرة حاليًا؛ احفظها بمكان آمن.</li><li>عند مسح بيانات الموقع قد تفقد البيانات المحلية. راجع <a href="https://github.com/mmashharawi2021-cell/UCAS/blob/main/docs/PRIVACY_DATA_FLOWS.md" target="_blank" rel="noopener noreferrer">شرح تدفقات البيانات</a> قبل تفعيل الخدمات السحابية.</li></ul><button class="danger-btn" data-action="clear-data">${ic('trash')} حذف بيانات المنصة من هذا الجهاز</button></div><div class="notice">الإصدار الحالي: ${APP_VERSION} — الدراسة المحلية افتراضيًا، والمزامنة والمجموعات وميزات AI خدمات سحابية اختيارية.</div></div>`;
}
function searchPage() {
  const q = state.query.trim().toLowerCase();
  const cc = state.courses.filter(c => c.title.toLowerCase().includes(q));
  const rr = state.resources.filter(r => r.name.toLowerCase().includes(q));
  const tt = state.tasks.filter(t => t.title.toLowerCase().includes(q));
  return `${intro('نتائج البحث', `البحث عن: ${esc(state.query)}`)}${sectionHead(`المساقات (${cc.length})`)}<div class="course-grid">${cc.map(courseCard).join('') || noData('لا يوجد تطابق', 'جرّب كلمة أخرى', 'search')}</div>${sectionHead(`المصادر (${rr.length})`)}<div class="panel">${rr.map(r => resourceRow(r)).join('') || noData('لا يوجد تطابق', 'لا توجد ملفات مطابقة', 'search')}</div>${sectionHead(`التكليفات (${tt.length})`)}<div class="card-stack">${tt.map(taskRow).join('') || noData('لا يوجد تطابق', 'لا توجد مهام مطابقة', 'search')}</div>`;
}
function render() {
  let content =
    state.page === 'home'
      ? homePage()
      : state.page === 'courses'
        ? coursesPage()
        : state.page === 'moodle'
          ? moodlePage()
          : state.page === 'course'
            ? coursePage()
            : state.page === 'import'
              ? importPage()
              : state.page === 'tasks'
                ? tasksPage()
                : state.page === 'quizzes'
                  ? quizzesPage()
                  : state.page === 'progress'
                    ? progressPage()
                    : state.page === 'settings'
                      ? settingsPage()
                      : features.pages.some(p => p.id === state.page)
                        ? features.pages.find(p => p.id === state.page).render(ctx)
                        : searchPage();
  document.getElementById('app').innerHTML = layout(content);
}
let pendingNavigation = null;
function changeView(update) {
  if (pendingNavigation !== null) clearTimeout(pendingNavigation);
  const stage = document.querySelector('.page-stage');
  if (!stage || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }
  stage.classList.add('is-leaving');
  pendingNavigation = setTimeout(() => {
    pendingNavigation = null;
    update();
  }, 135);
}
function go(page) {
  changeView(() => {
    state.page = page;
    state.mobileMenu = false;
    state.activeQuiz = null;
    state.query = '';
    render();
    scrollTo({ top: 0, behavior: 'instant' });
  });
}
function toast(msg, error = false) {
  document.querySelector('.toast')?.remove();
  let box = document.createElement('div');
  box.className = `toast ${error ? 'error' : ''}`;
  box.setAttribute('role', 'status');
  box.textContent = msg;
  document.body.appendChild(box);
  setTimeout(() => {
    box.classList.add('is-hiding');
    setTimeout(() => box.remove(), 240);
  }, 3950);
}
function modal(title, body, wide = false) {
  document.querySelector('.modal-backdrop')?.remove();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h2>${esc(title)}</h2><button class="icon-button" data-action="close-modal" aria-label="إغلاق">${ic('close')}</button></div>${body}</div>`;
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) backdrop.remove();
  });
  document.body.appendChild(backdrop);
  backdrop.querySelector('input:not([type="hidden"]),textarea,select,button')?.focus();
}
async function displayResource(id) {
  const r = await get('resources', id);
  if (!r) return toast('المصدر غير موجود', true);
  if (r.kind === 'link') {
    const link = safeUrl(r.url);
    if (link) window.open(link, '_blank', 'noopener,noreferrer');
    return;
  }
  if (!r.blob) return toast('لا يوجد ملف محفوظ لهذا المصدر', true);
  if (viewURL) URL.revokeObjectURL(viewURL);
  viewURL = URL.createObjectURL(r.blob);
  const isPdf = r.name.toLowerCase().endsWith('.pdf');
  const isText = r.name.toLowerCase().endsWith('.txt') || r.name.toLowerCase().endsWith('.md');
  let markup = `<div class="row-actions" style="margin-bottom:15px"><button class="outline-btn" data-action="download-resource" data-id="${esc(id)}">${ic('download')} تنزيل الملف</button><button class="outline-btn" data-action="open-resource" data-id="${esc(id)}">${ic('external')} فتح في تبويب جديد</button></div>`;
  if (isPdf)
    markup += `<iframe class="file-frame" title="${esc(r.name)}" src="${esc(viewURL)}"></iframe>`;
  else if (isText)
    markup += `<pre style="white-space:pre-wrap;word-break:break-word;max-height:60vh;overflow:auto;font-family:inherit" id="text-preview"></pre>`;
  else if (/\.(docx|pptx)$/i.test(r.name))
    markup += `<div class="office-preview" id="office-preview" role="status">جاري استخراج معاينة النص من المستند محليًا…</div>`;
  else
    markup += `<div class="notice info">معاينة هذه الصيغة غير مدعومة. يمكنك تنزيل الملف أو فتحه في تطبيق مناسب.</div>`;
  modal(r.name, markup, true);
  if (isText)
    document.getElementById('text-preview').textContent = (await r.blob.text()).slice(0, 150000);
  if (/\.(docx|pptx)$/i.test(r.name)) {
    const slot = document.getElementById('office-preview');
    try {
      const preview = await previewOffice(
        r.blob instanceof File ? r.blob : new File([r.blob], r.name, { type: r.type }),
      );
      if (!slot?.isConnected) return;
      slot.replaceChildren();
      const note = document.createElement('p');
      note.className = 'muted tiny';
      note.textContent = preview.truncated
        ? 'تم عرض أول 120 ألف حرف فقط من الملف.'
        : 'معاينة نصية فقط؛ قد تختلف عن تنسيق المستند الأصلي.';
      const pre = document.createElement('pre');
      pre.className = 'office-text';
      pre.textContent = preview.text || 'لم يُعثر على نص داخل المستند.';
      slot.append(note, pre);
    } catch (err) {
      if (slot?.isConnected) {
        slot.textContent =
          'تعذرت المعاينة: ' + err.message + ' — يمكنك تنزيل الملف وفتحه بالتطبيق المناسب.';
        slot.classList.add('notice', 'warn');
      }
    }
  }
}
function addTaskModal() {
  modal(
    'تكليف جديد',
    `<form id="task-form"><div class="field"><label>عنوان التكليف</label><input class="input" name="title" maxlength="180" required placeholder="عنوان المهمة"/></div><div class="form-grid"><div class="field"><label>المساق</label><select class="select" name="courseId" required><option value="">اختر المساق</option>${courseOption(state.courseId)}</select></div><div class="field"><label>موعد التسليم</label><input class="input" type="datetime-local" name="due"/></div></div><div class="field"><label>ملاحظات (اختياري)</label><textarea class="textarea" name="notes"></textarea></div><button class="primary-btn" type="submit">${ic('check')} حفظ التكليف</button></form>`,
  );
}
function addCourseModal() {
  modal(
    'إضافة مساق',
    `<form id="course-form"><div class="field"><label for="course-title">اسم المساق</label><input id="course-title" class="input" name="title" required maxlength="180" placeholder="اسم المساق الجامعي"/></div><div class="form-grid"><div class="field"><label for="course-code">رمز المساق</label><input id="course-code" class="input" name="code" maxlength="12" placeholder="GISS 3301" dir="ltr"/></div><div class="field"><label for="course-hours">الساعات المعتمدة</label><input id="course-hours" class="input" type="number" name="hours" min="0" max="12" value="3"/></div></div><button class="primary-btn" type="submit">${ic('plus')} إضافة المساق</button></form>`,
  );
}

const studySession = {
  courseId: null,
  documents: [],
  matches: [],
  cards: [],
  question: '',
  ocrBusy: false,
};
function assistantModal() {
  const c = state.courses.find(x => x.id === state.courseId);
  if (!c) return toast('اختر مساقًا أولًا', true);
  Object.assign(studySession, {
    courseId: c.id,
    documents: [],
    matches: [],
    cards: [],
    question: '',
    lastLoad: null,
    ocrBusy: false,
  });
  const html = [
    '<div class="notice info"><strong>مراجعة محلية من ملفات المساق</strong><p>ابحث داخل PDF النصي وTXT وDOCX وPPTX. ستظهر مقتطفات موثقة بأسماء الملفات ورقم صفحة PDF، مع الحفاظ على لغة النص الأصلية الإنجليزية أو العربية. يعتمد PDF.js على تحميل مكتبة برمجية خارجية عند أول استخدام، لكن بيانات الملفات لا تُرفع إلى خادم. إذا لم تُقرأ حروف PDF العربية بصورة سليمة، يمكنك اختيار OCR لأول ثلاث صفحات؛ يتطلب تنزيل حزم اللغة ويعمل محليًا على جهازك، وقد يستغرق وقتًا. راجع النتائج قبل الاعتماد عليها.</p></div>',
    '<form id="study-search-form" class="study-search-form"><div class="field"><label for="study-query">ما الموضوع الذي تريد مراجعته؟</label><input class="input" id="study-query" name="query" maxlength="200" placeholder="مثال: إدارة المشاريع" required></div><button type="submit" class="primary-btn">البحث في ملفات المساق</button></form>',
    '<div id="study-results" class="study-results" aria-live="polite"><p class="muted tiny">اكتب كلمة أو سؤالًا لعرض المقتطفات التي تتضمنه.</p></div>',
    '<div class="study-actions"><button type="button" class="outline-btn" data-action="study-cards">بطاقات مراجعة من المحاضرات</button><button type="button" class="outline-btn" data-action="study-start-quiz">اختبار من التعريفات</button><button type="button" class="outline-btn" data-action="study-copy" disabled>نسخ المقتطفات إلى ChatGPT</button></div>',
    '<p class="muted tiny">النسخ إلى ChatGPT لا يحدث إلا عند ضغطك على الزر. الاختبارات محلية ومبنية على التعريفات النصية؛ راجع صحتها من المصدر.</p>',
  ].join('');
  modal('مساعد الدراسة — ' + c.title, html, true);
}
async function loadStudyDocumentsForCurrentCourse() {
  if (!state.courseId || studySession.courseId !== state.courseId)
    throw new Error('افتح المساق المطلوب أولًا');
  if (studySession.documents.length) return studySession.documents;
  // Resource lists hold metadata only; load file contents for this course on demand.
  const courseFiles = await Promise.all(
    state.resources
      .filter(r => r.courseId === state.courseId && r.kind === 'file' && r.hasFile)
      .map(r => get('resources', r.id)),
  );
  const data = await loadCourseText(courseFiles.filter(Boolean), state.courseId, previewOffice, {
    pdfPreview: extractPdfText,
  });
  studySession.documents = data.documents;
  studySession.lastLoad = data;
  return data.documents;
}
function appendStudyNotice(target, message) {
  const element = document.createElement('p');
  element.className = 'muted tiny';
  element.textContent = message;
  target.appendChild(element);
}
function appendOCROptions(slot) {
  if (!slot || studySession.ocrBusy) return;
  const available = state.resources.filter(
    r =>
      r.courseId === studySession.courseId &&
      r.kind === 'file' &&
      /\.pdf$/i.test(r.name || '') &&
      (r.hasFile || r.blob),
  );
  const missing = available
    .filter(r => !studySession.documents.some(d => d.id === r.id))
    .slice(0, 3);
  if (!missing.length) return;
  const panel = document.createElement('div');
  panel.className = 'study-ocr-options';
  const title = document.createElement('strong');
  title.textContent = 'ملفات PDF تحتاج قراءة بديلة';
  const note = document.createElement('p');
  note.className = 'muted tiny';
  note.textContent =
    'OCR اختياري على هذا الجهاز لأول 3 صفحات من كل ملف. يحتاج الإنترنت لتنزيل مكتبات العربية والإنجليزية وقد يستهلك البطارية. النتائج غير مدققة ولن تُستخدم تلقائيًا لإجابات الاختبارات.';
  panel.append(title, note);
  for (const file of missing) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'outline-btn';
    button.dataset.action = 'study-ocr';
    button.dataset.id = file.id;
    button.textContent = 'تجربة OCR للملف: ' + file.name;
    panel.appendChild(button);
  }
  slot.appendChild(panel);
}
async function runStudyOCR(resourceId) {
  if (studySession.ocrBusy) return;
  const r = state.resources.find(
    x =>
      x.id === resourceId &&
      x.courseId === studySession.courseId &&
      x.kind === 'file' &&
      /\.pdf$/i.test(x.name || '') &&
      (x.hasFile || x.blob),
  );
  if (!r) return toast('ملف PDF غير متاح أو لا يخص هذا المساق', true);
  studySession.ocrBusy = true;
  const slot = document.getElementById('study-results');
  const progress = document.createElement('div');
  progress.className = 'notice info';
  progress.setAttribute('role', 'status');
  progress.textContent = 'جاري تجهيز OCR…';
  slot?.prepend(progress);
  const buttons = [...document.querySelectorAll('[data-action="study-ocr"]')];
  buttons.forEach(b => (b.disabled = true));
  try {
    const pdfBlob = r.blob || (await getFile(r.id));
    if (!pdfBlob) throw new Error('الملف غير محفوظ على هذا الجهاز');
    const result = await readPDFWithOCR(pdfBlob, {
      onProgress: message => {
        if (progress.isConnected) progress.textContent = message;
      },
    });
    const doc = {
      id: r.id,
      name: r.name,
      module: r.module || 'مصادر المساق',
      text: result.text,
      pages: result.pages,
      needsReview: true,
    };
    studySession.documents = studySession.documents.filter(d => d.id !== r.id).concat([doc]);
    if (studySession.lastLoad?.errors)
      studySession.lastLoad.errors = studySession.lastLoad.errors.filter(
        e => !e.startsWith(r.name + ' ('),
      );
    const question = studySession.question;
    studySession.ocrBusy = false;
    if (question) await runStudySearch(question);
    else await renderStudyCards();
    const current = document.getElementById('study-results');
    if (current)
      appendStudyNotice(
        current,
        'نجح استخراج OCR من ' +
          result.pages.length +
          ' صفحة من ' +
          r.name +
          '، لكن النص قد يحتوي أخطاء؛ راجعه مقابل صفحات الملف الأصلي.',
      );
  } catch (err) {
    progress.textContent = 'تعذر OCR: ' + String(err?.message || err);
    buttons.forEach(b => (b.disabled = false));
    studySession.ocrBusy = false;
  }
}

async function runStudySearch(query) {
  const slot = document.getElementById('study-results');
  if (!slot) return;
  slot.textContent = 'جاري فحص ملفات المساق المحفوظة محليًا…';
  try {
    await loadStudyDocumentsForCurrentCourse();
    const matches = searchStudySources(query, studySession.documents, 7);
    studySession.matches = matches;
    studySession.question = query;
    slot.replaceChildren();
    if (!matches.length)
      appendStudyNotice(
        slot,
        'لا توجد مقتطفات مطابقة. جرّب كلمة أخرى أو استورد PDF نصيًا أو ملف Word أو PowerPoint أو TXT.',
      );
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i],
        article = document.createElement('article');
      article.className = 'study-match';
      const source = document.createElement('strong');
      source.dir = 'auto';
      source.textContent = '[' + (i + 1) + '] ' + m.source;
      const module = document.createElement('small');
      module.className = 'muted';
      module.textContent = m.module + (m.page ? ' · صفحة ' + m.page : '');
      const excerpt = document.createElement('p');
      excerpt.dir = 'auto';
      excerpt.textContent = m.excerpt;
      if (m.needsReview) {
        const note = document.createElement('small');
        note.textContent = 'OCR — نص غير مدقق';
        article.appendChild(note);
      }
      article.append(source, module, excerpt);
      slot.appendChild(article);
    }
    const data = studySession.lastLoad;
    if (data?.unsupported.length)
      appendStudyNotice(
        slot,
        'لم يتم تحليل نص ' +
          data.unsupported.length +
          ' ملف بصيغة غير مدعومة؛ يمكن عرضها من مكتبة المساق.',
      );
    if (data?.errors.length)
      appendStudyNotice(slot, 'تعذرت قراءة بعض الملفات: ' + data.errors.slice(0, 2).join('، '));
    if (data?.totalFileCount > data?.limit)
      appendStudyNotice(
        slot,
        'تم فحص أول ' + data.limit + ' مصدر فقط لتقليل استهلاك الذاكرة على الهاتف.',
      );
    appendOCROptions(slot);
    const copy = document.querySelector('[data-action="study-copy"]');
    if (copy) copy.disabled = !matches.length;
  } catch (error) {
    studySession.matches = [];
    slot.textContent = 'تعذر البحث: ' + String(error?.message || error);
  }
}
async function renderStudyCards() {
  const slot = document.getElementById('study-results');
  if (!slot) return;
  slot.textContent = 'جاري إعداد بطاقات المراجعة من الملفات…';
  try {
    await loadStudyDocumentsForCurrentCourse();
    const definitions = extractReviewCards(studySession.documents, 12);
    const fallback = definitions.length === 0;
    const cards = fallback ? extractPassageCards(studySession.documents, 10) : definitions;
    studySession.cards = cards;
    slot.replaceChildren();
    const copy = document.querySelector('[data-action="study-copy"]');
    if (fallback) {
      studySession.matches = cards.map(c => ({
        sourceId: null,
        source: c.source,
        module: c.module,
        excerpt: c.definition,
        page: c.page,
      }));
      studySession.question =
        'اشرح أفكار المقتطفات التالية من المحاضرة، ثم اقترح أسئلة تدريبية مع الاستشهاد بالمصادر.';
      if (copy) copy.disabled = !cards.length;
    }
    if (!cards.length) {
      appendStudyNotice(
        slot,
        'لم نجد نصوصًا كافية لإعداد بطاقات. استورد PDF نصيًا أو ملف TXT أو Word أو PowerPoint، وتأكد من ربطه بهذا المساق.',
      );
      const details = studySession.lastLoad;
      if (details?.errors?.length)
        appendStudyNotice(
          slot,
          'تعذرت قراءة بعض الملفات: ' + details.errors.slice(0, 2).join('، '),
        );
      appendOCROptions(slot);
      return;
    }
    if (fallback)
      appendStudyNotice(
        slot,
        'لم تظهر تعريفات صريحة، لذا هذه بطاقات مقتطفات حرفية من المحاضرة وليست تعريفات أو ملخصات منشأة بالذكاء الاصطناعي.',
      );
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i],
        article = document.createElement('article');
      article.className = 'study-match';
      const title = document.createElement('strong');
      title.dir = 'auto';
      title.textContent = c.term;
      const source = document.createElement('small');
      source.className = 'muted';
      source.dir = 'auto';
      source.textContent = c.source + ' / ' + c.module + (c.page ? ' · صفحة ' + c.page : '');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'outline-btn';
      button.dataset.action = 'study-reveal';
      button.dataset.index = String(i);
      button.setAttribute('aria-expanded', 'false');
      button.textContent = fallback ? 'عرض المقتطف' : 'إظهار التعريف';
      const answer = document.createElement('p');
      answer.className = 'study-answer';
      answer.dir = 'auto';
      answer.hidden = true;
      article.append(title, source, button, answer);
      if (c.needsReview) {
        const warning = document.createElement('small');
        warning.textContent = 'OCR — راجع النص مقابل الملف الأصلي';
        article.appendChild(warning);
      }
      slot.appendChild(article);
    }
    appendOCROptions(slot);
  } catch (error) {
    slot.textContent = 'تعذر إعداد بطاقات المراجعة: ' + String(error?.message || error);
  }
}
async function startStudyDefinitionQuiz() {
  try {
    await loadStudyDocumentsForCurrentCourse();
    const questions = buildDefinitionQuiz(extractReviewCards(studySession.documents, 24), 8);
    if (questions.length < 4) {
      const slot = document.getElementById('study-results');
      if (slot)
        appendStudyNotice(
          slot,
          'لا يمكن إعداد اختبار اختيار من متعدد موثوق من النصوص الحالية؛ يتطلب 4 تعريفات صريحة على الأقل. يمكنك عرض بطاقات المقتطفات والبحث في المحاضرة بدلًا من ذلك.',
        );
      return toast('تحتاج إلى 4 تعريفات صريحة على الأقل لإنشاء اختبار الاختيار من متعدد.', true);
    }
    if (quizDraftValid(state.quizDraft) && !confirm('سيتم استبدال مسودة اختبارك الحالي. هل تتابع؟'))
      return;
    state.activeQuiz = {
      courseId: state.courseId,
      title: 'مراجعة تعريفات المساق — ' + courseName(state.courseId),
      questions,
      pos: 0,
      answers: {},
    };
    state.page = 'quizzes';
    document.querySelector('.modal-backdrop')?.remove();
    await saveQuizDraft();
    render();
    scrollTo(0, 0);
  } catch (error) {
    toast('تعذر إعداد الاختبار: ' + String(error?.message || error), true);
  }
}
async function copyStudyPrompt() {
  if (!studySession.matches.length) return toast('ابحث عن موضوع أولًا', true);
  const prompt = formatChatGPTStudyPrompt(
    courseName(studySession.courseId),
    studySession.question,
    studySession.matches,
  );
  try {
    await navigator.clipboard.writeText(prompt);
    toast('تم نسخ المقتطفات. يمكنك لصقها بنفسك في ChatGPT.');
  } catch {
    toast('المتصفح لم يسمح بالنسخ؛ جرّب Chrome أو HTTPS.', true);
  }
}

function dueNotifications() {
  let now = Date.now();
  let due = pending().filter(
    t =>
      t.due &&
      new Date(t.due).getTime() - now >= 0 &&
      new Date(t.due).getTime() - now < 7 * 86400000,
  );
  let events = state.events.filter(
    e =>
      e.date &&
      new Date(e.date).getTime() - now >= 0 &&
      new Date(e.date).getTime() - now < 7 * 86400000,
  );
  modal(
    'التنبيهات داخل الموقع',
    `<div class="notice info">المواعيد المعروضة مستوردة أو مدخلة يدويًا، ويجب مراجعتها في Moodle قبل التسليم.</div>${due.map(t => `<div class="item-row"><div><h4>${esc(t.title)}</h4><p>${fmtDate(t.due)}</p></div>${ic('calendar')}</div>`).join('')}${events.map(e => `<div class="item-row"><div><h4>${esc(e.title)}</h4><p>${fmtDate(e.date)}</p></div>${ic('calendar')}</div>`).join('')}${due.length + events.length ? '' : noData('لا توجد مواعيد خلال الأسبوع القادم', 'يمكنك إضافة مهام أو استيراد تقويم', 'bell')}`,
  );
}
async function saveQuizDraft() {
  if (!state.activeQuiz || state.activeQuiz.pos >= state.activeQuiz.questions.length) return;
  state.quizDraft = structuredClone(state.activeQuiz);
  await put('settings', { id: 'quiz-draft', value: state.quizDraft });
}
async function startQuiz(courseIndex) {
  const qs = sampleAndPersonalQuestions(courseIndex);
  const c = state.courses[courseIndex];
  if (!qs.length) return toast('أضف سؤالًا إلى هذا المساق أولًا', true);
  if (
    quizDraftValid(state.quizDraft) &&
    !confirm('هناك اختبار غير مكتمل. بدء اختبار جديد سيستبدل مسودته. هل تريد المتابعة؟')
  )
    return;
  state.activeQuiz = {
    courseId: c?.id,
    title: `تدريب — ${c?.title || 'GIS'}`,
    questions: qs,
    pos: 0,
    answers: {},
  };
  state.page = 'quizzes';
  await saveQuizDraft();
  render();
}
async function nextQuestion() {
  const quiz = state.activeQuiz;
  if (!quiz) return;
  const selected = document.querySelector('input[name="quiz-answer"]:checked');
  if (!selected) return toast('اختر إجابة أولًا', true);
  quiz.answers[quiz.pos] = Number(selected.value);
  quiz.pos++;
  if (quiz.pos === quiz.questions.length) {
    const correct = quiz.questions.reduce(
      (sum, q, i) => sum + (q.answer === quiz.answers[i] ? 1 : 0),
      0,
    );
    await put('attempts', {
      id: makeId(),
      courseId: quiz.courseId,
      title: quiz.title,
      date: new Date().toISOString(),
      correct,
      total: quiz.questions.length,
      answers: quiz.answers,
    });
    await features.quizFinished(quiz, ctx);
    await remove('settings', 'quiz-draft');
    state.quizDraft = null;
    state.attempts = await all('attempts');
  } else await saveQuizDraft();
  render();
}
function addQuestionModal(courseId) {
  modal(
    'إضافة سؤال تدريبي',
    `<form id="question-form"><input type="hidden" name="courseId" value="${esc(courseId)}"/><div class="field"><label>نص السؤال</label><textarea class="textarea" name="question" maxlength="600" required></textarea></div><div class="form-grid">${[0, 1, 2, 3].map(i => `<div class="field"><label>الخيار ${i + 1}</label><input class="input" name="choice${i}" maxlength="300" required/></div>`).join('')}</div><div class="field"><label>الإجابة الصحيحة</label><select class="select" name="answer">${[0, 1, 2, 3].map(i => `<option value="${i}">الخيار ${i + 1}</option>`).join('')}</select></div><div class="field"><label>تفسير الإجابة (اختياري)</label><textarea class="textarea" name="why" maxlength="700"></textarea></div><div class="field"><label>مرجع السؤال (اختياري)</label><input class="input" name="source" maxlength="220" placeholder="اسم المحاضرة والصفحة"/></div><button class="primary-btn" type="submit">حفظ السؤال في بنك الأسئلة المحلي</button></form>`,
  );
}
async function handleClick(e) {
  const link = e.target.closest(
    '[data-act],[data-go],[data-course],[data-tab],[data-import-tab],[data-action],[data-view-resource],[data-delete-resource],[data-delete-task],[data-start-quiz],[data-add-question],[data-set-theme]',
  );
  if (!link) return;
  const d = link.dataset;
  if (d.act) {
    await features.click(d.act, link, ctx, e);
    return;
  }
  if (d.go) {
    go(d.go);
    return;
  }
  if (d.course) {
    changeView(() => {
      state.courseId = d.course;
      state.courseTab = 'lessons';
      state.page = 'course';
      render();
      scrollTo(0, 0);
    });
    return;
  }
  if (d.tab) {
    state.courseTab = d.tab;
    render();
    return;
  }
  if (d.importTab) {
    state.importTab = d.importTab;
    render();
    return;
  }
  if (d.viewResource) {
    await displayResource(d.viewResource);
    return;
  }
  if (d.deleteResource) {
    if (!confirm('حذف هذا المصدر من المكتبة المحلية؟')) return;
    await remove('resources', d.deleteResource);
    await refresh();
    toast('حُذف المصدر');
    return;
  }
  if (d.deleteTask) {
    if (!confirm('حذف التكليف؟')) return;
    await remove('tasks', d.deleteTask);
    await refresh();
    toast('حُذف التكليف');
    return;
  }
  if (d.startQuiz !== undefined) {
    await startQuiz(Number(d.startQuiz));
    return;
  }
  if (d.addQuestion) {
    addQuestionModal(d.addQuestion);
    return;
  }
  if (d.setTheme) {
    setTheme(d.setTheme);
    return;
  }
  switch (d.action) {
    case 'toggle-menu':
      if (matchMedia('(max-width:860px)').matches) state.mobileMenu = !state.mobileMenu;
      else state.collapsed = !state.collapsed;
      render();
      break;
    case 'close-menu':
      state.mobileMenu = false;
      render();
      break;
    case 'moodle-import-preview': {
      const p = state.moodlePreview;
      const courseId = document.querySelector('#moodle-html-course')?.value;
      if (!p?.resources?.length) throw Error('اختر ملف HTML أولًا');
      if (!state.courses.some(c => c.id === courseId))
        return toast('اختر المساق قبل الاستيراد', true);
      const checked = [...document.querySelectorAll('[data-moodle-item]:checked')].map(el =>
        Number(el.dataset.moodleItem),
      );
      if (!checked.length) return toast('اختر نشاطًا واحدًا على الأقل', true);
      state.moodleSelectedCourseId = courseId;
      const sourceItems = checked.map(i => p.resources[i]).filter(Boolean);
      let added = 0,
        skipped = 0;
      for (const item of sourceItems) {
        const duplicate = state.resources.some(
          r =>
            r.courseId === courseId &&
            r.origin === 'moodle-html' &&
            r.module === item.module &&
            r.name === (item.kind === 'link' ? item.title : item.title + '.txt') &&
            (item.kind !== 'link' || r.url === item.url),
        );
        if (duplicate) {
          skipped++;
          continue;
        }
        if (item.kind === 'link')
          await put('resources', {
            id: makeId(),
            kind: 'link',
            origin: 'moodle-html',
            name: item.title,
            courseId,
            module: item.module,
            url: item.url,
            addedAt: new Date().toISOString(),
            completed: false,
          });
        else {
          const blob = new Blob([item.text], { type: 'text/plain' });
          await put('resources', {
            id: makeId(),
            kind: 'file',
            origin: 'moodle-html',
            name: item.title + '.txt',
            courseId,
            module: item.module,
            type: 'text/plain',
            blob,
            size: blob.size,
            addedAt: new Date().toISOString(),
            completed: false,
          });
        }
        added++;
      }
      state.moodlePreview = null;
      await refresh();
      toast(`تم استيراد ${added} مصدر، وتجاهل ${skipped} مكرر. لم يُحفظ ملف HTML الخام.`);
      break;
    }
    case 'moodle-files':
      state.importTab = 'files';
      go('import');
      break;
    case 'moodle-ics':
      state.importTab = 'ics';
      go('import');
      break;
    case 'moodle-links':
      state.importTab = 'links';
      go('import');
      break;
    case 'add-course':
      addCourseModal();
      break;
    case 'add-task':
      addTaskModal();
      break;
    case 'assistant':
      assistantModal();
      break;
    case 'study-cards':
      await renderStudyCards();
      break;
    case 'study-ocr':
      await runStudyOCR(d.id);
      break;
    case 'study-start-quiz':
      await startStudyDefinitionQuiz();
      break;
    case 'study-copy':
      await copyStudyPrompt();
      break;
    case 'study-reveal': {
      const card = studySession.cards[Number(d.index)];
      if (!card) break;
      const answer = link.parentElement.querySelector('.study-answer');
      if (!answer) break;
      const show = answer.hidden;
      answer.hidden = !show;
      answer.textContent = show ? card.definition : '';
      link.setAttribute('aria-expanded', String(show));
      link.textContent = show
        ? card.kind === 'passage'
          ? 'إخفاء المقتطف'
          : 'إخفاء التعريف'
        : card.kind === 'passage'
          ? 'عرض المقتطف'
          : 'إظهار التعريف';
      break;
    }
    case 'notifications':
      dueNotifications();
      break;
    case 'theme':
      setTheme(state.mode === 'dark' ? 'light' : 'dark');
      break;
    case 'search':
      modal(
        'البحث في المساقات والمصادر',
        `<form id="search-form"><div class="field"><label>كلمة البحث</label><input name="query" class="input" required placeholder="اسم مساق أو محاضرة أو تكليف" autofocus/></div><button class="primary-btn" type="submit">${ic('search')} بحث</button></form>`,
      );
      break;
    case 'close-modal':
      document.querySelector('.modal-backdrop')?.remove();
      break;
    case 'resume-quiz':
      if (quizDraftValid(state.quizDraft)) {
        state.activeQuiz = structuredClone(state.quizDraft);
        state.page = 'quizzes';
        render();
      }
      break;
    case 'discard-quiz':
      if (!confirm('حذف مسودة الاختبار غير المكتمل؟')) break;
      await remove('settings', 'quiz-draft');
      state.quizDraft = null;
      state.activeQuiz = null;
      render();
      break;
    case 'next-question':
      await nextQuestion();
      break;
    case 'prev-question':
      if (state.activeQuiz?.pos > 0) {
        state.activeQuiz.pos--;
        await saveQuizDraft();
        render();
      }
      break;
    case 'finish-quiz':
      state.activeQuiz = null;
      render();
      break;
    case 'download-resource':
    case 'open-resource': {
      const r = await get('resources', d.id);
      if (!r?.blob) return;
      const u = URL.createObjectURL(r.blob);
      const a = document.createElement('a');
      a.href = u;
      if (d.action === 'download-resource') a.download = r.name;
      else a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 60000);
      break;
    }
    case 'persist-storage': {
      const result = await requestPersistence();
      await refresh();
      toast(
        result.persisted
          ? 'تم تفعيل التخزين الدائم لهذا الموقع'
          : 'رفض المتصفح التخزين الدائم. ثبّت التطبيق على الشاشة الرئيسية ثم أعد المحاولة، واحتفظ بنسخ احتياطية.',
        !result.persisted,
      );
      break;
    }
    case 'export':
      try {
        const data = await backup();
        const file = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ucas-bridge-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        await put('settings', { id: 'last-backup', value: new Date().toISOString() });
        await refresh();
        toast('تم تجهيز النسخة الاحتياطية');
      } catch (err) {
        toast(`تعذر النسخ الاحتياطي: ${err.message}`, true);
      }
      break;
    case 'request-notifications':
      if (!('Notification' in window)) return toast('المتصفح لا يدعم الإشعارات', true);
      if (!isSecureContext) return toast('تحتاج إشعارات المتصفح إلى HTTPS أو localhost', true);
      {
        let permission = await Notification.requestPermission();
        toast(
          permission === 'granted'
            ? 'تم منح إذن الإشعارات، والجدولة الخارجية غير متاحة بعد'
            : 'لم يُمنح إذن الإشعارات',
        );
      }
      break;
    case 'clear-data':
      if (
        !confirm(
          'سيتم حذف جميع المساقات والملفات والتكليفات والاختبارات من هذا المتصفح. هل أنشأت نسخة احتياطية؟',
        )
      )
        return;
      if (!confirm('تأكيد نهائي: حذف جميع البيانات المحلية؟')) return;
      {
        const names = exportStores;
        const { replaceAll } = await import('./store.js?v=1.4.0');
        for (const s of names) await replaceAll(s, []);
        await initialize();
        await refresh();
        toast('تم حذف بيانات الجهاز وإعادة المساقات الافتراضية');
      }
      break;
  }
}
async function handleSubmit(e) {
  const form = e.target;
  // getAttribute: a field named "id" inside a form shadows form.id.
  if (features.hasForm(form.getAttribute('id'))) {
    e.preventDefault();
    try {
      await features.submit(form, ctx);
    } catch (err) {
      toast(err.message || 'تعذر الحفظ', true);
    }
    return;
  }
  if (
    ![
      'study-search-form',
      'file-form',
      'drive-file-form',
      'drive-link-form',
      'ics-form',
      'link-form',
      'moodle-form',
      'course-form',
      'task-form',
      'search-form',
      'question-form',
    ].includes(form.id)
  )
    return;
  e.preventDefault();
  const fd = new FormData(form);
  try {
    if (form.id === 'study-search-form') {
      await runStudySearch(String(fd.get('query') || '').trim());
      return;
    }
    if (form.id === 'moodle-form') {
      const courseId = String(fd.get('courseId') || '');
      const title = String(fd.get('title') || '').trim();
      if (!state.courses.some(c => c.id === courseId) || !title || title.length > 150)
        throw Error('اختر مساقًا وعنوانًا صحيحين');
      const content = cleanMoodlePaste(String(fd.get('content') || ''));
      const blob = new Blob([content], { type: 'text/plain' });
      const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
      const hash = [...new Uint8Array(raw)].map(x => x.toString(16).padStart(2, '0')).join('');
      if (state.resources.some(r => r.courseId === courseId && r.hash === hash))
        throw Error('هذه المادة مستوردة مسبقًا في المساق');
      await put('resources', {
        id: makeId(),
        kind: 'file',
        origin: 'moodle-manual',
        name: title + '.txt',
        courseId,
        module: 'مواد Moodle المنسوخة',
        hash,
        type: 'text/plain',
        blob,
        size: blob.size,
        addedAt: new Date().toISOString(),
        completed: false,
      });
      toast('حُفظ نص Moodle في مكتبة المساق محليًا');
    }
    if (form.id === 'question-form') {
      const courseId = String(fd.get('courseId') || '');
      const question = String(fd.get('question') || '').trim();
      const choices = [0, 1, 2, 3].map(i => String(fd.get('choice' + i) || '').trim());
      const answer = Number(fd.get('answer'));
      if (
        !state.courses.some(c => c.id === courseId) ||
        !question ||
        choices.some(c => !c) ||
        !Number.isInteger(answer) ||
        answer < 0 ||
        answer > 3
      )
        throw Error('أكمل بيانات السؤال والإجابة الصحيحة');
      state.questionBank.push({
        id: makeId(),
        courseId,
        question,
        choices,
        answer,
        why: String(fd.get('why') || '').trim(),
        source: String(fd.get('source') || '').trim(),
      });
      await put('settings', { id: 'question-bank', value: state.questionBank });
      document.querySelector('.modal-backdrop')?.remove();
      toast('تم حفظ السؤال في بنك الأسئلة المحلي');
    }
    if (form.id === 'course-form') {
      const title = String(fd.get('title') || '').trim();
      if (!title) throw Error('اسم المساق مطلوب');
      const id = makeId();
      const code = normalizeCode(fd.get('code'));
      await put('courses', { id, title, code, createdAt: new Date().toISOString() });
      const hours = Number(fd.get('hours'));
      if (hours > 0)
        await put('grades', {
          id,
          courseId: id,
          hours: String(hours),
          finalMark: '',
          target: '',
          components: DEFAULT_COMPONENTS.map(c => ({ ...c, score: '', max: c.weight })),
        });
      await refresh();
      document.querySelector('.modal-backdrop')?.remove();
      toast('تمت إضافة المساق');
    }
    if (form.id === 'task-form') {
      const title = String(fd.get('title') || '').trim();
      const courseId = String(fd.get('courseId') || '');
      if (!title || !courseId) throw Error('أكمل الحقول المطلوبة');
      await put('tasks', {
        id: makeId(),
        title,
        courseId,
        due: String(fd.get('due') || ''),
        notes: String(fd.get('notes') || ''),
        done: false,
        createdAt: new Date().toISOString(),
      });
      document.querySelector('.modal-backdrop')?.remove();
      toast('تم حفظ التكليف');
    }
    if (form.id === 'link-form') {
      const name = String(fd.get('name') || '').trim();
      const courseId = String(fd.get('courseId') || '');
      const url = safeUrl(String(fd.get('url') || ''));
      if (!name || !courseId || !url)
        throw Error('تحقق من اسم الرابط والمساق وصحة عنوان HTTP أو HTTPS');
      if (state.resources.some(r => r.kind === 'link' && r.url === url && r.courseId === courseId))
        throw Error('الرابط موجود مسبقًا في هذا المساق');
      await put('resources', {
        id: makeId(),
        kind: 'link',
        name,
        courseId,
        url,
        module: String(fd.get('module') || '') || 'مصادر المساق',
        addedAt: new Date().toISOString(),
        completed: false,
      });
      toast('تم حفظ الرابط');
    }
    if (form.id === 'drive-link-form') {
      const courseId = String(fd.get('courseId') || '');
      if (!state.courses.some(c => c.id === courseId)) throw Error('اختر مساقًا لحفظ رابط Drive');
      const ref = parseDriveReference(String(fd.get('url') || ''));
      if (!ref)
        throw Error(
          'الرابط غير صالح. استخدم رابط ملف أو مستند أو مجلد من Google Drive أو Google Docs',
        );
      if (
        state.resources.some(r => r.kind === 'link' && r.url === ref.url && r.courseId === courseId)
      )
        throw Error('هذا الرابط موجود بالفعل في المساق');
      await put('resources', {
        id: makeId(),
        kind: 'link',
        origin: 'google-drive-link',
        name: normalizeDriveTitle(fd.get('name'), ref),
        courseId,
        url: ref.url,
        module: String(fd.get('module') || '').trim() || 'مصادر Google Drive',
        addedAt: new Date().toISOString(),
        completed: false,
      });
      toast('تم حفظ رابط Google Drive داخل المساق');
    }
    if (form.id === 'file-form' || form.id === 'drive-file-form') {
      const courseId = String(fd.get('courseId') || '');
      const files = [...(form.querySelector('input[type=file]')?.files || [])];
      if (!state.courses.some(c => c.id === courseId)) throw Error('اختر مساقًا صحيحًا');
      const checked = validateStudyFiles(files);
      if (!checked.allowed.length)
        throw Error('لم يتم العثور على ملف دراسي صالح، راجع نوع الملفات وحجمها');
      let added = 0;
      let skipped = checked.rejected.length;
      for (const f of checked.allowed) {
        const hashBuf = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
        const hash = [...new Uint8Array(hashBuf)]
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        if (state.resources.some(r => r.hash === hash && r.courseId === courseId)) {
          skipped++;
          continue;
        }
        await put('resources', {
          id: makeId(),
          kind: 'file',
          origin: form.id === 'drive-file-form' ? 'device-picker-drive' : 'manual-upload',
          name: f.name,
          courseId,
          module: String(fd.get('module') || '').trim() || 'مصادر المساق',
          hash,
          type: f.type || 'application/octet-stream',
          blob: f,
          size: f.size,
          addedAt: new Date().toISOString(),
          completed: false,
        });
        state.resources.push({ hash, courseId });
        added++;
      }
      if (added) requestPersistence().then(() => refresh());
      toast(`تم استيراد ${added} ملف، وتخطي ${skipped} ملف مكرر أو غير مدعوم`);
    }
    if (form.id === 'ics-form') {
      const file = form.querySelector('input[type=file]')?.files?.[0];
      if (!file) throw Error('اختر ملف تقويم');
      const events = parseICS(await file.text());
      if (!events.length) throw Error('لم يتم العثور على أحداث صالحة');
      let count = 0;
      for (const event of events) {
        if (!(await get('events', event.id))) {
          await put('events', { ...event, addedAt: new Date().toISOString() });
          count++;
        }
      }
      toast(`تم استيراد ${count} حدث جديد. راجع الأحداث المتكررة والمناطق الزمنية.`);
    }
    if (form.id === 'search-form') {
      const q = String(fd.get('query') || '').trim();
      if (!q) throw Error('اكتب عبارة للبحث');
      state.query = q;
      state.page = 'search';
      document.querySelector('.modal-backdrop')?.remove();
    }
    await refresh();
  } catch (error) {
    toast(error?.message || 'حدث خطأ أثناء العملية', true);
    console.error(error);
  }
}
async function handleChange(e) {
  const el = e.target;
  if (el.dataset?.actChange) {
    await features.change(el.dataset.actChange, el, ctx, e);
    return;
  }
  if (el.id === 'moodle-html-course') {
    state.moodleSelectedCourseId = el.value;
    return;
  }
  if (el.id === 'moodle-html-file' && el.files?.length) {
    const file = el.files[0];
    state.moodleImportFile = file.name;
    state.moodleImportError = null;
    try {
      state.moodlePreview = await readMoodleCourseFile(file);
      if (!state.moodleSelectedCourseId) {
        const needle = state.moodlePreview.courseTitle.trim();
        const similar = state.courses.find(
          c => needle.includes(c.title) || c.title.includes(needle),
        );
        state.moodleSelectedCourseId = similar?.id || state.courseId || null;
      }
      render();
      toast(`تم فحص الصفحة: ${state.moodlePreview.resources.length} عنصر قابل للمراجعة`);
    } catch (err) {
      state.moodlePreview = null;
      state.moodleImportError = err?.message || 'تعذر تحليل ملف المساق';
      render();
      toast('تعذر استيراد الملف، راجع رسالة الخطأ داخل الصفحة', true);
    }
    return;
  }

  if (el.matches('input[name="quiz-answer"]') && state.activeQuiz) {
    state.activeQuiz.answers[state.activeQuiz.pos] = Number(el.value);
    await saveQuizDraft();
  }
  if (el.matches('[data-toggle-task]')) {
    const t = await get('tasks', el.dataset.toggleTask);
    if (t) {
      t.done = el.checked;
      t.doneAt = el.checked ? new Date().toISOString() : null;
      await put('tasks', t);
      await refresh();
    }
  }
  if (el.matches('[data-complete-resource]')) {
    const r = await get('resources', el.dataset.completeResource);
    if (r) {
      r.completed = el.checked;
      await put('resources', r);
      await refresh();
    }
  }
  if (el.id === 'restore-file' && el.files?.length) {
    if (!confirm('استعادة النسخة ستستبدل جميع البيانات الموجودة على هذا الجهاز. هل تريد المتابعة؟'))
      return;
    try {
      const data = JSON.parse(await el.files[0].text());
      await restore(data);
      await refresh();
      toast('تمت استعادة النسخة الاحتياطية');
    } catch (err) {
      toast(`تعذرت الاستعادة: ${err.message}`, true);
    }
  }
}
function setTheme(v) {
  state.mode = v;
  try {
    localStorage.setItem('ucas-bridge-theme', v);
  } catch {
    /* storage blocked: keep the theme for this session only */
  }
  document.documentElement.dataset.theme =
    v === 'auto' ? (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light') : v;
  render();
}
async function init() {
  try {
    await initialize();
    const draft = await get('settings', 'quiz-draft');
    if (quizDraftValid(draft?.value)) state.quizDraft = draft.value;
    const bank = await get('settings', 'question-bank');
    state.questionBank = Array.isArray(bank?.value) ? bank.value : [];
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (state.mode === 'auto')
        document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
    });
    window.addEventListener('ucas-db-outdated', () =>
      toast('تم تحديث المنصة في تبويب آخر. أعد تحميل الصفحة للمتابعة.', true),
    );
    window.addEventListener('ucas-db-blocked', () =>
      toast('أغلق تبويبات المنصة الأخرى ليكتمل تحديث قاعدة البيانات.', true),
    );
    window.addEventListener('unhandledrejection', e => {
      console.error(e.reason);
      toast('حدث خطأ غير متوقع', true);
    });
    document.addEventListener('click', e => {
      handleClick(e).catch(err => {
        console.error(err);
        toast('تعذرت العملية', true);
      });
    });
    document.addEventListener('submit', e => {
      handleSubmit(e).catch(err => {
        console.error(err);
        toast('تعذر الحفظ', true);
      });
    });
    document.addEventListener('change', e => {
      handleChange(e).catch(err => {
        console.error(err);
        toast('تعذرت العملية', true);
      });
    });
    document.addEventListener('input', e => {
      if (e.target.id !== 'course-filter') return;
      const query = e.target.value.trim().toLocaleLowerCase('ar');
      let visible = 0;
      for (const card of document.querySelectorAll(
        '.premium-library-grid [data-course-searchable]',
      )) {
        card.hidden = !card.dataset.courseSearchable.includes(query);
        if (!card.hidden) visible++;
      }
      const counter = document.getElementById('course-filter-count');
      if (counter) counter.textContent = visible + ' مساقات';
      const empty = document.getElementById('course-filter-empty');
      if (empty) empty.hidden = visible !== 0;
    });
    document.addEventListener('toggle', e => {
      if (e.target.matches?.('details.premium-home-extras')) {
        state.homeExtrasOpen = e.target.open;
      }
    }, true);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') document.querySelector('.modal-backdrop')?.remove();
      if (e.key === 'Enter' && e.target.id === 'global-search') {
        state.query = e.target.value.trim();
        state.page = 'search';
        render();
      }
    });
    let mode = 'auto';
    try {
      mode = localStorage.getItem('ucas-bridge-theme') || 'auto';
    } catch {
      /* storage blocked */
    }
    state.mode = mode;
    document.documentElement.dataset.theme =
      mode === 'auto'
        ? matchMedia('(prefers-color-scheme:dark)').matches
          ? 'dark'
          : 'light'
        : mode;
    await refresh();
    window.__ucasBooted = true;
    try {
      sessionStorage.removeItem('ucas-cache-recovery');
    } catch {
      /* storage blocked */
    }
    features.start(ctx);
    if ('serviceWorker' in navigator && isSecureContext) {
      navigator.serviceWorker.register('./sw.js').catch(console.warn);
    }
  } catch (err) {
    // An old service worker can serve files from a previous release next to new ones.
    // Drop all caches and the old worker, then reload once with fresh files.
    let retried = true;
    try {
      retried = !!sessionStorage.getItem('ucas-cache-recovery');
    } catch {
      /* storage blocked */
    }
    if (window.__ucasRecover && navigator.onLine && !retried) {
      window.__ucasRecover();
      return;
    }
    document.getElementById('app').innerHTML =
      `<div class="initial-loader"><h2>تعذر تشغيل التخزين المحلي</h2><p>تأكد من فتح الموقع في متصفح يدعم IndexedDB وعبر localhost أو HTTPS.</p><p>${esc(err.message)}</p></div>`;
    console.error(err);
  }
}
init();
