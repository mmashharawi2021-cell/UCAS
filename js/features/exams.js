// Phase 2 — exam dates & countdown, timed mock exams, smart review, question import.
import { EXAM_TYPES, countdownLabel, urgency, upcomingExams } from '../lib/countdown.js?v=2.0.0';
import {
  applyAnswer,
  dueReviews,
  reviewStats,
  reviewUpdatesFromQuiz,
  MASTERED_BOX,
} from '../lib/review.js?v=2.0.0';
import { parseQuestions } from '../lib/question-import.js?v=2.0.0';
import { clock } from '../lib/focus.js?v=2.0.0';

const EXAM_KEY = 'mock-exam';
let tab = 'dates';
let importPreview = null; // { courseId, questions, errors }
let reviewSession = null; // { ids: [], pos, revealed, chosen, right }
let lastResult = null;
let ticker = null;

const LETTERS = ['أ', 'ب', 'ج', 'د'];

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function activeExam(ctx) {
  const e = ctx.setting(EXAM_KEY);
  return e && Array.isArray(e.questions) && e.questions.length && Number.isFinite(e.endsAt)
    ? e
    : null;
}

// ---------- tab: exam dates ----------
function datesTab(ctx) {
  const { state, esc, ic, noData, courseName, fmtDate } = ctx;
  const upcoming = upcomingExams(state.exams);
  const past = state.exams
    .filter(e => !upcoming.includes(e))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const row = e =>
    `<article class="exam-card urgency-${urgency(e.date)}"><div class="exam-count"><strong>${esc(countdownLabel(e.date))}</strong></div><div class="grow"><h4>${esc(e.title)}</h4><p class="muted tiny">${esc(courseName(e.courseId))} · ${esc(EXAM_TYPES[e.type] || '')} · ${fmtDate(e.date)}${e.room ? ` · ${esc(e.room)}` : ''}</p></div><div class="row-actions"><button class="btn-mini" data-act="exam-edit" data-id="${esc(e.id)}" aria-label="تعديل">${ic('note', 15)}</button><button class="btn-mini" data-act="exam-delete" data-id="${esc(e.id)}" aria-label="حذف">${ic('trash', 15)}</button></div></article>`;
  return `<div class="page-intro"><div><h2>مواعيد الامتحانات</h2><p>عدّاد تنازلي لكل امتحان. الأحمر خلال يومين، والبرتقالي خلال أسبوع.</p></div><div class="row-actions"><button class="primary-btn" data-act="exam-add">${ic('plus')} امتحان جديد</button>${upcoming.length ? `<button class="outline-btn" data-act="calendar-export">${ic('calendar')} إلى تقويم الهاتف</button>` : ''}</div></div><div class="card-stack">${upcoming.map(row).join('') || noData('لا امتحانات قادمة', 'أضف مواعيد الكويزات والنصفي والنهائي', 'award')}</div>${past.length ? `<details class="accordion"><summary>امتحانات انتهت <span class="pill">${past.length}</span></summary><div class="accordion-body">${past.map(row).join('')}</div></details>` : ''}`;
}

function examModal(ctx, exam = null) {
  const { modal, esc, ic, courseOption, state } = ctx;
  const e = exam || { type: 'midterm', duration: 60 };
  const local = e.date ? String(e.date).slice(0, 16) : '';
  modal(
    exam ? 'تعديل الامتحان' : 'امتحان جديد',
    `<form id="exam-form"><input type="hidden" name="id" value="${esc(e.id || '')}"/><div class="form-grid"><div class="field"><label for="exam-course">المساق</label><select id="exam-course" class="select" name="courseId" required><option value="">اختر المساق</option>${courseOption(e.courseId || state.courseId)}</select></div><div class="field"><label for="exam-type">النوع</label><select id="exam-type" class="select" name="type">${Object.entries(
      EXAM_TYPES,
    )
      .map(([k, v]) => `<option value="${k}" ${k === e.type ? 'selected' : ''}>${v}</option>`)
      .join(
        '',
      )}</select></div></div><div class="field"><label for="exam-title">العنوان</label><input id="exam-title" class="input" name="title" maxlength="150" required value="${esc(e.title || '')}" placeholder="مثال: الامتحان النصفي"/></div><div class="form-grid"><div class="field"><label for="exam-date">الموعد</label><input id="exam-date" class="input" type="datetime-local" name="date" required value="${esc(local)}"/></div><div class="field"><label for="exam-duration">المدة (دقيقة)</label><input id="exam-duration" class="input" type="number" min="5" max="600" name="duration" value="${esc(e.duration || '')}"/></div></div><div class="field"><label for="exam-room">القاعة (اختياري)</label><input id="exam-room" class="input" name="room" maxlength="60" value="${esc(e.room || '')}"/></div><div class="field"><label for="exam-topics">المواضيع المطلوبة (اختياري)</label><textarea id="exam-topics" class="textarea" name="topics" rows="3" maxlength="3000">${esc(e.topics || '')}</textarea></div><button class="primary-btn" type="submit">${ic('check')} حفظ</button></form>`,
  );
}

// ---------- tab: timed mock exam ----------
function mockTab(ctx) {
  const { state, esc, ic, courseOption, questionsForCourse, courseName } = ctx;
  const exam = activeExam(ctx);
  if (lastResult) return resultView(ctx, lastResult);
  if (exam) {
    const answered = Object.keys(exam.answers || {}).length;
    return `<div class="exam-sticky"><div><strong>${esc(exam.title)}</strong><p class="muted tiny">أُجيب ${answered} من ${exam.questions.length}</p></div><div class="exam-timer" data-exam-clock role="timer">${clock(exam.endsAt - Date.now())}</div></div><form id="mock-exam-form" class="mock-exam">${exam.questions
      .map(
        (q, i) =>
          `<fieldset class="panel mock-question"><legend><span class="pill">${i + 1}</span> ${esc(q.question)}</legend>${q.choices
            .map(
              (c, j) =>
                `<label class="answer-choice"><input type="radio" name="q${i}" value="${j}" data-act-change="mock-answer" data-index="${i}" ${exam.answers?.[i] === j ? 'checked' : ''}/><span>${LETTERS[j] || j + 1}) ${esc(c)}</span></label>`,
            )
            .join('')}</fieldset>`,
      )
      .join(
        '',
      )}<div class="row-actions"><button class="primary-btn" type="submit">${ic('check')} تسليم الامتحان</button><button class="outline-btn" type="button" data-act="mock-cancel">إلغاء</button></div></form>`;
  }
  const counts = state.courses.map(c => ({ c, n: questionsForCourse(c.id).length }));
  return `<div class="page-intro"><div><h2>امتحان تجريبي بوقت محدد</h2><p>كل الأسئلة في صفحة واحدة مثل الامتحان الحقيقي، ويُسلَّم تلقائيًا عند انتهاء الوقت. الأسئلة الخاطئة تدخل المراجعة الذكية.</p></div></div><form id="mock-setup-form" class="panel"><div class="form-grid"><div class="field"><label for="mock-course">المساق</label><select id="mock-course" class="select" name="courseId" required><option value="">اختر المساق</option>${courseOption(state.courseId)}</select></div><div class="field"><label for="mock-count">عدد الأسئلة</label><input id="mock-count" class="input" type="number" name="count" min="1" max="100" value="10"/></div><div class="field"><label for="mock-minutes">الوقت (دقيقة)</label><input id="mock-minutes" class="input" type="number" name="minutes" min="1" max="240" value="15"/></div></div><button class="primary-btn" type="submit">${ic('play')} ابدأ الامتحان</button></form><div class="panel"><h3>الأسئلة المتاحة</h3>${counts
    .map(
      ({ c, n }) =>
        `<div class="item-row"><div><h4>${esc(courseName(c.id))}</h4></div><span class="pill ${n ? 'success' : ''}">${n} سؤال</span></div>`,
    )
    .join('')}<p class="muted tiny">أضف أسئلة من تبويب «بنك الأسئلة».</p></div>`;
}

function resultView(ctx, r) {
  const { esc, ic } = ctx;
  const pct = Math.round((r.correct / r.total) * 100);
  return `<div class="panel result-panel"><div class="eyebrow">${r.timedOut ? 'انتهى الوقت وسُلّم الامتحان' : 'تم التسليم'}</div><h1 class="result-score">${r.correct} / ${r.total}</h1><p class="muted">${pct}% · استغرقت ${Math.max(1, Math.round(r.usedMs / 60000))} دقيقة${r.unanswered ? ` · ${r.unanswered} بدون إجابة` : ''}</p><div class="divider"></div>${r.questions
    .map((q, i) => {
      const ok = r.answers[i] === q.answer;
      return `<div class="review-answer"><strong>${i + 1}. ${esc(q.question)}</strong><p class="tiny ${ok ? 'correct-text' : 'wrong-text'}">${ok ? 'صحيحة' : r.answers[i] === undefined ? 'لم تُجب' : `إجابتك: ${esc(q.choices[r.answers[i]])}`} · الصحيحة: ${esc(q.choices[q.answer])}</p>${q.why ? `<p class="tiny muted">${esc(q.why)}</p>` : ''}</div>`;
    })
    .join(
      '',
    )}<div class="row-actions"><button class="primary-btn" data-act="mock-done">${ic('check')} تم</button>${r.correct < r.total ? `<button class="outline-btn" data-act="exams-tab" data-tab-id="review">${ic('rotate')} راجع أخطاءك</button>` : ''}</div></div>`;
}

async function submitExam(ctx, timedOut = false) {
  const exam = activeExam(ctx);
  if (!exam) return;
  stopTicker();
  const answers = exam.answers || {};
  const correct = exam.questions.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0);
  await ctx.put('attempts', {
    id: ctx.makeId(),
    courseId: exam.courseId,
    title: exam.title,
    mode: 'exam',
    date: new Date().toISOString(),
    correct,
    total: exam.questions.length,
    answers,
    durationMs: Math.min(Date.now(), exam.endsAt) - exam.startedAt,
  });
  await saveReviews(ctx, exam.questions, answers, exam.courseId);
  lastResult = {
    ...exam,
    answers,
    correct,
    total: exam.questions.length,
    timedOut,
    usedMs: Math.min(Date.now(), exam.endsAt) - exam.startedAt,
    unanswered: exam.questions.length - Object.keys(answers).length,
  };
  await ctx.saveSetting(EXAM_KEY, null);
  await ctx.refresh();
  scrollTo({ top: 0 });
}

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

function syncTicker(ctx) {
  const exam = activeExam(ctx);
  if (!exam) return stopTicker();
  if (ticker) return;
  ticker = setInterval(() => {
    const current = activeExam(ctx);
    if (!current) return stopTicker();
    const left = current.endsAt - Date.now();
    document.querySelectorAll('[data-exam-clock]').forEach(el => {
      el.textContent = clock(left);
      el.classList.toggle('low', left < 60000);
    });
    if (left <= 0) submitExam(ctx, true).catch(console.error);
  }, 1000);
}

// ---------- tab: smart review ----------
async function saveReviews(ctx, questions, answers, courseId) {
  const updates = reviewUpdatesFromQuiz(ctx.state.reviews, questions, answers, courseId);
  for (const u of updates) await ctx.put('reviews', u);
}

function reviewTab(ctx) {
  const { state, esc, ic, noData, courseName } = ctx;
  if (reviewSession) return reviewCard(ctx);
  const due = dueReviews(state.reviews);
  const stats = reviewStats(state.reviews);
  const byCourse = {};
  for (const r of due) byCourse[r.courseId] = (byCourse[r.courseId] || 0) + 1;
  return `<div class="page-intro"><div><h2>المراجعة الذكية</h2><p>كل سؤال أخطأت فيه يعود إليك: بعد يوم، ثم 3 أيام، ثم أسبوع، ثم أسبوعين، حتى تتقنه. الخطأ يعيده للبداية.</p></div></div><div class="stats-grid">${ctx.stat('rotate', due.length, 'مستحقة الآن')}${ctx.stat('quiz', stats.learning, 'قيد التعلم')}${ctx.stat('award', stats.mastered, 'أتقنتها')}</div>${
    due.length
      ? `<div class="panel">${Object.entries(byCourse)
          .map(
            ([id, n]) =>
              `<div class="item-row"><div><h4>${esc(courseName(id))}</h4><p>${n} سؤال مستحق</p></div><button class="outline-btn" data-act="review-start" data-course="${esc(id)}">${ic('play', 15)} راجع</button></div>`,
          )
          .join(
            '',
          )}</div><button class="primary-btn" data-act="review-start" data-course="">${ic('rotate')} راجع كل المستحق (${due.length})</button>`
      : noData(
          stats.total ? 'لا مراجعة مستحقة الآن' : 'لا أخطاء لمراجعتها بعد',
          stats.total
            ? 'عُد لاحقًا؛ ستظهر الأسئلة في موعدها'
            : 'حلّ اختبارًا تدريبيًا وستظهر أخطاؤك هنا',
          'rotate',
        )
  }`;
}

function reviewCard(ctx) {
  const { state, esc, ic, courseName } = ctx;
  const s = reviewSession;
  const record = state.reviews.find(r => r.id === s.ids[s.pos]);
  if (!record) {
    const summary = `أجبت ${s.right} من ${s.ids.length} بشكل صحيح`;
    return `<div class="panel result-panel"><div class="eyebrow">انتهت جلسة المراجعة</div><h1 class="result-score">${s.right} / ${s.ids.length}</h1><p class="muted">${summary}</p><button class="primary-btn" data-act="review-end">${ic('check')} تم</button></div>`;
  }
  const q = record.q;
  return `<div class="panel quiz-panel"><div class="panel-heading"><h3>${esc(courseName(record.courseId))}</h3><span class="pill">${s.pos + 1} من ${s.ids.length} · المستوى ${record.box + 1}/${MASTERED_BOX + 1}</span></div><div class="quiz-question">${esc(q.question)}</div><div class="quiz-options">${q.choices
    .map((c, j) => {
      const cls = s.revealed
        ? j === q.answer
          ? 'is-right'
          : j === s.chosen
            ? 'is-wrong'
            : ''
        : '';
      return `<button class="answer-choice review-choice ${cls}" data-act="review-answer" data-choice="${j}" ${s.revealed ? 'disabled' : ''}>${LETTERS[j] || j + 1}) ${esc(c)}</button>`;
    })
    .join('')}</div>${
    s.revealed
      ? `<div class="notice ${s.chosen === q.answer ? 'info' : 'warn'}"><strong>${s.chosen === q.answer ? 'إجابة صحيحة ✓' : 'إجابة غير صحيحة'}</strong>${q.why ? `<p>${esc(q.why)}</p>` : ''}${q.source ? `<p class="tiny">المرجع: ${esc(q.source)}</p>` : ''}</div><button class="primary-btn" data-act="review-next">التالي ${ic('chevron', 15)}</button>`
      : ''
  }</div>`;
}

// ---------- tab: question bank & import ----------
function bankTab(ctx) {
  const { state, esc, ic, courseOption, courseName, noData } = ctx;
  const mine = state.questionBank;
  const preview = importPreview
    ? `<div class="panel import-preview"><h3>معاينة: ${importPreview.questions.length} سؤال صالح</h3>${
        importPreview.errors.length
          ? `<div class="notice warn"><strong>${importPreview.errors.length} سؤال لم يُقرأ:</strong><ul class="bullet-list">${importPreview.errors
              .slice(0, 8)
              .map(e => `<li>${esc(e)}</li>`)
              .join('')}</ul></div>`
          : ''
      }${importPreview.questions
        .slice(0, 5)
        .map(
          q =>
            `<div class="review-answer"><strong>${esc(q.question)}</strong><p class="tiny correct-text">الإجابة: ${esc(q.choices[q.answer])}</p></div>`,
        )
        .join(
          '',
        )}${importPreview.questions.length > 5 ? `<p class="muted tiny">و${importPreview.questions.length - 5} أسئلة أخرى…</p>` : ''}<div class="row-actions"><button class="primary-btn" data-act="bank-import-confirm" ${importPreview.questions.length ? '' : 'disabled'}>${ic('check')} إضافة إلى ${esc(courseName(importPreview.courseId))}</button><button class="outline-btn" data-act="bank-import-cancel">إلغاء</button></div></div>`
    : '';
  const grouped = {};
  for (const q of mine) (grouped[q.courseId] ??= []).push(q);
  return `<div class="page-intro"><div><h2>بنك الأسئلة</h2><p>استورد أسئلة جاهزة من ملف نصي أو CSV، أو الصقها مباشرة.</p></div></div><form id="bank-import-form" class="panel"><div class="form-grid"><div class="field"><label for="bank-course">المساق</label><select id="bank-course" class="select" name="courseId" required><option value="">اختر المساق</option>${courseOption(state.courseId)}</select></div><div class="field"><label for="bank-file">ملف (TXT أو CSV)</label><input id="bank-file" class="input" type="file" name="file" accept=".txt,.csv,.tsv,text/plain,text/csv"/></div></div><div class="field"><label for="bank-text">أو الصق الأسئلة هنا</label><textarea id="bank-text" class="textarea" name="text" rows="7" maxlength="400000" placeholder="س: ما هو المفتاح الأساسي؟&#10;أ) حقل فريد يعرّف السجل&#10;ب) جدول فرعي&#10;ج) فهرس&#10;د) نوع بيانات&#10;الإجابة: أ&#10;التفسير: (اختياري)"></textarea></div><details class="format-help"><summary>صيغة الملف</summary><p class="tiny">نص: كل سؤال يبدأ بـ «س:» أو رقم، ثم الخيارات أ) ب) ج) د)، ثم «الإجابة: ب». CSV: الأعمدة question,a,b,c,d,answer,why,source.</p></details><button class="outline-btn" type="submit">${ic('search')} معاينة الأسئلة</button></form>${preview}<div class="panel"><h3>أسئلتي (${mine.length})</h3>${
    mine.length
      ? Object.entries(grouped)
          .map(
            ([id, qs]) =>
              `<details class="accordion"><summary>${esc(courseName(id))} <span class="pill">${qs.length}</span></summary><div class="accordion-body">${qs
                .map(
                  q =>
                    `<div class="item-row"><div><h4>${esc(q.question)}</h4><p>${esc(q.choices[q.answer] || '')}</p></div><button class="btn-mini" data-act="bank-delete" data-id="${esc(q.id)}" aria-label="حذف">${ic('trash', 15)}</button></div>`,
                )
                .join('')}</div></details>`,
          )
          .join('')
      : noData('لا أسئلة شخصية بعد', 'استورد أو أضف أسئلة من صفحة «اختباراتي»', 'quiz')
  }</div>`;
}

// ---------- page ----------
function render(ctx) {
  const { intro, ic } = ctx;
  const tabs = [
    ['dates', 'المواعيد', 'calendar'],
    ['mock', 'امتحان تجريبي', 'timer'],
    [
      'review',
      `المراجعة الذكية${dueReviews(ctx.state.reviews).length ? ` (${dueReviews(ctx.state.reviews).length})` : ''}`,
      'rotate',
    ],
    ['bank', 'بنك الأسئلة', 'quiz'],
  ];
  if (activeExam(ctx)) tab = 'mock';
  setTimeout(() => syncTicker(ctx));
  const body =
    tab === 'mock'
      ? mockTab(ctx)
      : tab === 'review'
        ? reviewTab(ctx)
        : tab === 'bank'
          ? bankTab(ctx)
          : datesTab(ctx);
  return `${intro('الامتحانات والمراجعة', 'استعد لامتحاناتك: مواعيد، امتحانات تجريبية، ومراجعة ذكية لأخطائك')}<div class="tabs exam-tabs">${tabs
    .map(
      ([id, label, icon]) =>
        `<button class="tab ${tab === id ? 'active' : ''}" data-act="exams-tab" data-tab-id="${id}">${ic(icon, 15)} ${label}</button>`,
    )
    .join('')}</div>${body}`;
}

function homeWidget(ctx) {
  const { state, esc, ic, courseName } = ctx;
  const next = upcomingExams(state.exams)[0];
  const due = dueReviews(state.reviews).length;
  return `<div class="widget ${next ? `urgency-${urgency(next.date)}` : ''}"><div class="widget-head"><h3>${ic('award', 17)} الامتحان القادم</h3><button class="link" data-go="exams">الامتحانات</button></div>${
    next
      ? `<div class="widget-figure">${esc(countdownLabel(next.date))}</div><p class="muted tiny">${esc(next.title)} · ${esc(courseName(next.courseId))}</p>`
      : `<p class="muted tiny">لا امتحانات مسجلة.</p><button class="outline-btn" data-act="exam-add">${ic('plus', 15)} أضف موعد امتحان</button>`
  }${due ? `<button class="subtle-btn review-due" data-act="exams-tab" data-tab-id="review" data-go-exams="1">${ic('rotate', 15)} ${due} سؤال للمراجعة اليوم</button>` : ''}</div>`;
}

export const pages = [
  {
    id: 'exams',
    title: 'الامتحانات والمراجعة',
    label: 'الامتحانات والمراجعة',
    icon: 'award',
    render,
  },
];
export const homeWidgets = [homeWidget];

export function start(ctx) {
  syncTicker(ctx);
}

export async function onQuizFinished(quiz, ctx) {
  await saveReviews(ctx, quiz.questions, quiz.answers || {}, quiz.courseId);
  ctx.state.reviews = await ctx.all('reviews');
}

export const actions = {
  'exams-tab': (el, ctx) => {
    tab = el.dataset.tabId || 'dates';
    if (el.dataset.goExams) ctx.go('exams');
    else ctx.render();
  },
  'exam-add': (el, ctx) => examModal(ctx),
  'exam-edit': (el, ctx) => {
    const e = ctx.state.exams.find(x => x.id === el.dataset.id);
    if (e) examModal(ctx, e);
  },
  'exam-delete': async (el, ctx) => {
    if (!confirm('حذف موعد الامتحان؟')) return;
    await ctx.remove('exams', el.dataset.id);
    await ctx.refresh();
  },
  'mock-cancel': async (el, ctx) => {
    if (!confirm('إلغاء الامتحان دون حفظ النتيجة؟')) return;
    stopTicker();
    await ctx.saveSetting(EXAM_KEY, null);
    await ctx.refresh();
  },
  'mock-done': (el, ctx) => {
    lastResult = null;
    ctx.render();
  },
  'review-start': (el, ctx) => {
    const due = dueReviews(ctx.state.reviews, new Date(), el.dataset.course || null);
    if (!due.length) return ctx.toast('لا أسئلة مستحقة', true);
    tab = 'review';
    reviewSession = {
      ids: due.slice(0, 20).map(r => r.id),
      pos: 0,
      revealed: false,
      chosen: null,
      right: 0,
    };
    ctx.render();
  },
  'review-answer': async (el, ctx) => {
    const s = reviewSession;
    const record = s && ctx.state.reviews.find(r => r.id === s.ids[s.pos]);
    if (!record || s.revealed) return;
    s.chosen = Number(el.dataset.choice);
    s.revealed = true;
    const correct = s.chosen === record.q.answer;
    if (correct) s.right++;
    await ctx.put('reviews', applyAnswer(record, record.q, record.courseId, correct));
    await ctx.refresh();
  },
  'review-next': (el, ctx) => {
    reviewSession.pos++;
    reviewSession.revealed = false;
    reviewSession.chosen = null;
    ctx.render();
  },
  'review-end': (el, ctx) => {
    reviewSession = null;
    ctx.render();
  },
  'bank-import-cancel': (el, ctx) => {
    importPreview = null;
    ctx.render();
  },
  'bank-import-confirm': async (el, ctx) => {
    if (!importPreview) return;
    const existing = new Set(
      ctx.state.questionBank
        .filter(q => q.courseId === importPreview.courseId)
        .map(q => q.question.trim()),
    );
    const fresh = importPreview.questions
      .filter(q => !existing.has(q.question.trim()))
      .map(q => ({ ...q, id: ctx.makeId(), courseId: importPreview.courseId }));
    await ctx.saveQuestionBank([...ctx.state.questionBank, ...fresh]);
    const skipped = importPreview.questions.length - fresh.length;
    importPreview = null;
    await ctx.refresh();
    ctx.toast(`أُضيف ${fresh.length} سؤال${skipped ? `، وتُجوهل ${skipped} مكرر` : ''}`);
  },
  'bank-delete': async (el, ctx) => {
    if (!confirm('حذف هذا السؤال؟')) return;
    await ctx.saveQuestionBank(ctx.state.questionBank.filter(q => q.id !== el.dataset.id));
    await ctx.refresh();
  },
};

export const changes = {
  'mock-answer': async (el, ctx) => {
    const exam = activeExam(ctx);
    if (!exam) return;
    exam.answers = { ...(exam.answers || {}), [el.dataset.index]: Number(el.value) };
    await ctx.saveSetting(EXAM_KEY, exam);
    const s = ctx.state.settings.find(x => x.id === EXAM_KEY);
    if (s) s.value = exam;
    const counter = document.querySelector('.exam-sticky .muted');
    if (counter)
      counter.textContent = `أُجيب ${Object.keys(exam.answers).length} من ${exam.questions.length}`;
  },
};

export const forms = {
  'exam-form': async (form, ctx) => {
    const fd = new FormData(form);
    const date = String(fd.get('date') || '');
    if (!Number.isFinite(new Date(date).getTime())) throw new Error('أدخل موعدًا صحيحًا');
    const id = String(fd.get('id') || '');
    const existing = ctx.state.exams.find(e => e.id === id);
    await ctx.put('exams', {
      ...(existing || {}),
      id: id || ctx.makeId(),
      courseId: String(fd.get('courseId') || ''),
      type: EXAM_TYPES[fd.get('type')] ? String(fd.get('type')) : 'other',
      title: String(fd.get('title') || '').trim(),
      date,
      duration: Number(fd.get('duration')) || null,
      room: String(fd.get('room') || '').trim(),
      topics: String(fd.get('topics') || '').trim(),
    });
    ctx.closeModal();
    await ctx.refresh();
    ctx.toast('تم حفظ موعد الامتحان');
  },
  'mock-setup-form': async (form, ctx) => {
    const fd = new FormData(form);
    const courseId = String(fd.get('courseId') || '');
    const pool = ctx.questionsForCourse(courseId);
    if (!pool.length) throw new Error('لا توجد أسئلة لهذا المساق. أضفها من بنك الأسئلة.');
    const count = Math.min(pool.length, Math.max(1, Number(fd.get('count')) || 10));
    const minutes = Math.min(240, Math.max(1, Number(fd.get('minutes')) || 15));
    const now = Date.now();
    lastResult = null;
    await ctx.saveSetting(EXAM_KEY, {
      courseId,
      title: `امتحان تجريبي — ${ctx.courseName(courseId)}`,
      questions: shuffle(pool).slice(0, count),
      answers: {},
      startedAt: now,
      endsAt: now + minutes * 60000,
    });
    await ctx.refresh();
    syncTicker(ctx);
  },
  'mock-exam-form': async (form, ctx) => {
    const exam = activeExam(ctx);
    const left = exam ? exam.questions.length - Object.keys(exam.answers || {}).length : 0;
    if (left && !confirm(`لم تُجب عن ${left} سؤال. تسليم الامتحان الآن؟`)) return;
    await submitExam(ctx);
  },
  'bank-import-form': async (form, ctx) => {
    const fd = new FormData(form);
    const courseId = String(fd.get('courseId') || '');
    if (!courseId) throw new Error('اختر المساق');
    const file = fd.get('file');
    let text = String(fd.get('text') || '');
    let name = '';
    if (file && file.size) {
      if (file.size > 2 * 1024 * 1024) throw new Error('الملف أكبر من 2 ميغابايت');
      text = await file.text();
      name = file.name;
    }
    if (!text.trim()) throw new Error('اختر ملفًا أو الصق الأسئلة');
    importPreview = { courseId, ...parseQuestions(text, name) };
    ctx.render();
  },
};
