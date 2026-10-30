// AI lecture assistant (course tab "مساعد AI"). Runs through the `ai` edge function, so
// the Gemini key never reaches the browser. Only the selected lecture's text is sent.
import { getClient } from '../cloud/client.js?v=2.0.0';
import { accountUser } from './account.js?v=2.0.0';
import { formatNote } from './notes.js?v=2.0.0';
import {
  consentText,
  planAISend,
  savedQuestionSource,
  sentNote,
} from '../lib/ai-limits.js?v=2.0.0';
import { pdfTruncationNote } from '../pdf-text.js?v=2.0.0';

const READABLE = /\.(txt|md|docx|pptx|pdf)$/i;
const ERRORS = {
  'email account required': 'سجّل الدخول ببريدك من الإعدادات ← المزامنة بين أجهزتي.',
  'not allowed':
    'هذا البريد غير مسموح له باستخدام المساعد. أضفه إلى AI_ALLOWED_EMAILS في Supabase.',
  'not configured': 'المساعد غير مُعدّ بعد: أضف GEMINI_API_KEY في أسرار Supabase.',
  'daily limit reached': 'وصلت للحد اليومي لطلبات المساعد. حاول غدًا.',
  'provider busy': 'خدمة Gemini مشغولة أو تجاوزت الحصة المجانية. حاول بعد دقيقة.',
};

const s = {
  courseId: null,
  source: '',
  busy: false,
  error: '',
  consent: false, // for the selected file (or the free question) in this course only
  status: '', // short polite status, e.g. after a cancelled request
  kind: '', // summary | questions | answer
  text: '',
  questions: [],
  picked: new Set(),
  meta: '',
  // What a request would send for the selected lecture, read on this device when it is
  // selected (no network). Consent stays disabled until it is known.
  plan: null,
  planFor: '', // the source id `plan` was computed for
  planStatus: '', // '' | loading | ready | error
  planError: '',
  // Course, file and plan of the request that produced the shown result (captured at send time).
  sent: null,
  // Bumped on every change of course or file and on cancel: a reply to an older request is
  // ignored (safety net; while a request is pending the selectors are disabled).
  seq: 0,
  abort: null, // AbortController of the pending request
};

function reset(courseId) {
  if (s.courseId === courseId) return;
  const wasBusy = s.busy;
  s.abort?.abort();
  Object.assign(s, {
    courseId,
    source: '',
    busy: false,
    abort: null,
    error: '',
    // Leaving the course while a request was pending cancels it; say so in the next course.
    status: wasBusy ? 'أُلغي طلب المساعد السابق لأن المساق تغيّر.' : '',
    consent: false,
    kind: '',
    text: '',
    questions: [],
    meta: '',
    plan: null,
    planFor: '',
    planStatus: '',
    planError: '',
    sent: null,
  });
  s.seq++;
  s.picked = new Set();
}

async function call(ctx, body, signal) {
  const sb = await getClient();
  // `signal` aborts the fetch where the client supports it; otherwise the reply is ignored.
  const { data, error } = await sb.functions.invoke('ai', { body, signal });
  if (error) {
    let code = '';
    try {
      code = (await error.context?.json())?.error || '';
    } catch {
      /* not JSON */
    }
    throw new Error(ERRORS[code] || 'تعذر الاتصال بالمساعد. تحقق من الإنترنت وحاول مجددًا.');
  }
  return data;
}

/** Reads the selected lecture locally and works out exactly what would be sent. */
async function preparePlan(ctx, id) {
  s.plan = null;
  s.planError = '';
  s.planStatus = id ? 'loading' : '';
  ctx.render();
  if (!id) return;
  try {
    const plan = planAISend(await ctx.extractText(id));
    if (s.source !== id) return; // another file was selected meanwhile
    s.plan = plan;
    s.planFor = id;
    s.planStatus = 'ready';
  } catch (err) {
    if (s.source !== id) return;
    s.planStatus = 'error';
    s.planError = String(err?.message || err);
  }
  ctx.render();
}

const readableFiles = (ctx, courseId) =>
  ctx.state.resources.filter(
    r => r.courseId === courseId && r.kind === 'file' && READABLE.test(r.name || ''),
  );

/** Forget a selected file that no longer exists (deleted, synced away, not readable). */
function dropSelection() {
  const wasBusy = s.busy;
  s.abort?.abort();
  Object.assign(s, {
    source: '',
    plan: null,
    planFor: '',
    planStatus: '',
    planError: '',
    consent: false,
    busy: false,
    abort: null,
    status: wasBusy
      ? 'أُلغي الطلب لأن الملف المختار لم يعد موجودًا. قد يُحتسب من حصتك اليومية إن كان قد وصل إلى الخادم.'
      : s.status,
  });
  s.seq++;
}

/**
 * The single answer to "what would be sent now", used by both the consent text and the request
 * body so the two can never disagree: free question, a lecture still being read, or a lecture
 * with its exact planned text. A selected file that has gone is dropped (consent reset).
 */
function currentSelection(ctx) {
  if (!s.source) return { kind: 'free' };
  const file = readableFiles(ctx, s.courseId).find(r => r.id === s.source);
  if (!file) {
    dropSelection();
    return { kind: 'missing' };
  }
  if (s.planStatus !== 'ready' || !s.plan || s.planFor !== s.source)
    return { kind: s.planStatus === 'error' ? 'error' : 'pending', file };
  return { kind: 'lecture', file, course: ctx.courseName(s.courseId), plan: s.plan };
}

/**
 * The exact request body for the `ai` edge function, from currentSelection(). A free question
 * carries only the task and the question; a lecture adds the course name, file name and the
 * planned text prefix. Throws (nothing is sent) in every other case.
 */
export function buildAIRequest(ctx, task, extra = {}, sel = currentSelection(ctx)) {
  if (sel.kind === 'missing') throw new Error('لم يعد الملف المختار موجودًا. اختر محاضرة أخرى.');
  if (sel.kind === 'free') {
    if (task !== 'ask') throw new Error('اختر ملف المحاضرة أولًا');
    return { task, ...extra };
  }
  if (sel.kind !== 'lecture') throw new Error('انتظر حتى تُقرأ المحاضرة على جهازك.');
  return { task, course: sel.course, title: sel.file.name || '', text: sel.plan.text, ...extra };
}

async function runTask(ctx, task, extra = {}) {
  if (s.busy) return;
  s.status = '';
  const sel = currentSelection(ctx);
  let body;
  try {
    body = buildAIRequest(ctx, task, extra, sel);
  } catch (err) {
    s.error = err.message;
    ctx.render();
    return;
  }
  // One consent per file: it covers every task while the same file and course stay selected.
  if (!s.consent) {
    s.error = 'يلزم الموافقة على ما سيُرسَل إلى Gemini قبل تشغيل المساعد.';
    ctx.render();
    document.getElementById('ai-cloud-consent')?.focus();
    return;
  }
  const seq = ++s.seq;
  // Everything about this request, captured now: the reply is shown and saved with these.
  const sent = {
    courseId: s.courseId,
    source: s.source,
    title: sel.file?.name || '',
    module: sel.file?.module || '',
    plan: sel.plan || null,
  };
  const abort = typeof AbortController === 'function' ? new AbortController() : null;
  s.abort = abort;
  s.busy = true;
  s.error = '';
  ctx.render();
  try {
    const data = await call(ctx, body, abort?.signal);
    if (seq !== s.seq) return; // cancelled, or course/file changed: ignore this reply
    const plan = sent.plan;
    s.sent = sent;
    s.kind = task === 'summarize' ? 'summary' : task === 'questions' ? 'questions' : 'answer';
    s.text = data.text || '';
    s.questions = data.questions || [];
    s.picked = new Set(s.questions.map((_, i) => i));
    // The server only sees what was sent, so the client says how much of the lecture that was.
    const note = plan ? sentNote(plan, pdfTruncationNote(plan.pdfExtent), !!data.truncated) : '';
    s.meta = `${note}المتبقي اليوم: ${data.left ?? '—'}`;
    if (s.kind === 'questions' && !s.questions.length)
      s.error = 'لم تُنتج أسئلة صالحة. جرّب مرة أخرى.';
  } catch (err) {
    if (seq !== s.seq) return;
    s.error = err.message;
  }
  s.busy = false;
  s.abort = null;
  ctx.render();
}

/** Stop waiting for the pending request: abort it if possible, ignore its reply anyway. */
function cancelTask(ctx) {
  if (!s.busy) return;
  s.seq++;
  s.abort?.abort();
  s.abort = null;
  s.busy = false;
  s.error = '';
  s.status = 'أُلغي الطلب. قد يُحتسب من حصتك اليومية إن كان قد وصل إلى الخادم.';
  ctx.render();
  document.querySelector('[data-act="ai-summarize"]')?.focus();
}

function resultHTML(ctx) {
  const { esc, ic } = ctx;
  if (s.busy)
    return `<div class="notice info ai-pending" role="status">${ic('spark', 15)} المساعد يعمل… قد يستغرق ذلك حتى دقيقة. <button type="button" class="outline-btn" data-act="ai-cancel">إلغاء</button></div>`;
  if (s.error) return `<div class="notice warn" role="alert">${esc(s.error)}</div>`;
  if (!s.kind) return '';
  const warn = `<p class="muted tiny">${ic('alert', 12)} ناتج آلي قد يحتوي أخطاء؛ راجعه مع المحاضرة. ${esc(s.meta)}</p>`;
  if (s.kind === 'questions')
    return `<div class="panel ai-result"><h3>${s.questions.length} سؤال مقترح</h3>${warn}${s.questions
      .map(
        (q, i) =>
          `<label class="ai-question"><input type="checkbox" data-act-change="ai-pick" data-index="${i}" ${s.picked.has(i) ? 'checked' : ''}/><span><strong>${esc(q.question)}</strong><ol>${q.choices.map((c, j) => `<li class="${j === q.answer ? 'correct-text' : ''}">${esc(c)}</li>`).join('')}</ol>${q.why ? `<small class="muted">${esc(q.why)}</small>` : ''}</span></label>`,
      )
      .join(
        '',
      )}<button class="primary-btn" data-act="ai-save-questions">${ic('plus')} إضافة المحدد إلى بنك الأسئلة</button></div>`;
  return `<div class="panel ai-result"><h3>${s.kind === 'summary' ? 'الملخص' : 'الإجابة'}</h3>${warn}<div class="note-body">${formatNote(esc, s.text)}</div><button class="primary-btn" data-act="ai-save-note">${ic('note')} حفظ كملاحظة</button></div>`;
}

/** Consent naming the actual course, file and page range; disabled until they are known. */
function consentHTML(ctx, sel) {
  const { esc } = ctx;
  if (sel.kind === 'pending' || sel.kind === 'error') {
    const state =
      sel.kind === 'error'
        ? `<span role="alert">تعذرت قراءة المحاضرة على جهازك: ${esc(s.planError)}</span>`
        : `<span role="status">جارٍ قراءة المحاضرة على جهازك…</span>`;
    return `<label class="ai-consent"><input id="ai-cloud-consent" type="checkbox" disabled/>${state}</label>`;
  }
  const text = consentText(
    sel.kind === 'lecture'
      ? { course: sel.course, title: sel.file.name || '', plan: sel.plan }
      : {},
    v => `<bdi>${esc(v)}</bdi>`,
  );
  return `<label class="ai-consent"><input id="ai-cloud-consent" type="checkbox" data-act-change="ai-consent" ${s.consent ? 'checked' : ''} ${s.busy ? 'disabled' : ''}/><span>${text}</span></label>`;
}

function renderTab(ctx, course) {
  const { esc, ic } = ctx;
  reset(course.id);
  if (!accountUser())
    return `<section class="ai-studio-guest"><div class="ai-studio-orb">${ic('bot', 39)}</div><span class="premium-kicker">AI STUDY STUDIO</span><h2>مساعدك الأكاديمي الذكي</h2><p>حوّل محاضراتك إلى ملخصات وأسئلة، واستفسر عن المفاهيم من واجهة واحدة. يتطلب تشغيل Gemini تسجيل الدخول بالبريد.</p><div class="ai-guest-features"><span>${ic('note', 16)} تلخيص محاضرات</span><span>${ic('quiz', 16)} إنشاء أسئلة</span><span>${ic('search', 16)} أسئلة واستفسارات</span></div><button class="primary-btn" data-go="settings">${ic('settings', 17)} تسجيل الدخول من الإعدادات</button><small>العمل على ملفاتك محليًا لا يتطلب حسابًا؛ إرسال المحتوى إلى Gemini اختياري.</small></section>`;
  const files = readableFiles(ctx, course.id);
  const sel = currentSelection(ctx); // drops a selected file that no longer exists
  return `<section class="ai-studio-header"><div><span class="premium-kicker">AI STUDY STUDIO</span><h2>مساعد المحاضرات الذكي</h2><p>لخّص محاضرتك، أنشئ أسئلة وناقش المفاهيم في مساحة مخصصة للدراسة</p></div><span class="ai-studio-engine">${ic('spark', 16)} GEMINI</span></section>
    <div class="panel ai-panel ai-studio-layout">
      <aside class="ai-studio-side"><div class="ai-side-heading">${ic('folder', 17)} <strong>مصادر المعرفة</strong></div><div class="field"><label for="ai-source">المحاضرة المختارة</label><select id="ai-source" class="select" data-act-change="ai-source" ${s.busy ? 'disabled' : ''}><option value="">${files.length ? 'اسأل بدون ملف أو اختر محاضرة' : 'لا توجد محاضرات قابلة للقراءة'}</option>${files.map(r => `<option value="${esc(r.id)}" ${s.source === r.id ? 'selected' : ''}>${esc(r.module ? `${r.module} — ` : '')}${esc(r.name)}</option>`).join('')}</select></div>
      <p class="ai-side-description">يمكنك طرح سؤال عام دون ملف؛ تلخيص المحاضرة وتوليد أسئلة منها يتطلبان اختيار ملف قابل للقراءة.</p>
      <div class="ai-side-divider"></div>
      <strong class="ai-side-heading">${ic('spark', 17)} أدوات الدراسة</strong>
      <button class="ai-tool-button" data-act="ai-summarize" ${s.busy ? 'disabled' : ''}>${ic('note', 18)} تلخيص المحاضرة <span>${ic('chevron', 14)}</span></button>
      <button class="ai-tool-button" data-act="ai-questions" ${s.busy ? 'disabled' : ''}>${ic('quiz', 18)} إنشاء اختبار <span>${ic('chevron', 14)}</span></button>
      <label class="ai-question-count" for="ai-count">عدد الأسئلة <select class="select ai-count" id="ai-count" aria-label="عدد الأسئلة" ${s.busy ? 'disabled' : ''}>${[5, 8, 10, 15].map(n => `<option value="${n}" ${n === 8 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      ${consentHTML(ctx, sel)}
      <small class="ai-side-privacy">${ic('shield', 14)} لا تُرسل أي ملفات تلقائيًا</small></aside>
      <div class="ai-studio-main"><div class="ai-chat-header"><div class="ai-chat-avatar">${ic('bot', 21)}</div><div><strong>UCAS Academic AI</strong><p>مساعد للدراسة · راجع النتائج مع المصادر</p></div><button class="ai-chat-clear" data-act="ai-clear" ${s.busy ? 'disabled' : ''} aria-label="مسح نتائج المحادثة الحالية" title="بدء مساحة جديدة">${ic('plus', 16)} جديد</button></div>
      <div class="ai-chat-body"><div class="ai-welcome"><span class="ai-welcome-orb">${ic('spark', 24)}</span><h3>بماذا نبدأ اليوم؟</h3><p>اختر محاضرة من القائمة، أو اكتب سؤالك. كل طلب يُعالج على حدة، والنتائج تحتاج مراجعة.</p></div>
      ${s.kind || s.busy || s.error ? '' : `<div class="ai-starter-grid"><button data-act="ai-example" data-sample="اشرح المفهوم الرئيسي في هذه المحاضرة بطريقة مبسطة.">${ic('book', 17)} اشرح مفهومًا</button><button data-act="ai-example" data-sample="ما الفرق بين Raster وVector في نظم المعلومات الجغرافية؟">${ic('layers', 17)} مقارنة GIS</button><button data-act="ai-example" data-sample="اقترح أسئلة مراجعة مفاهيمية لهذا المساق.">${ic('quiz', 17)} فكرة للمراجعة</button></div>`}
      ${!s.busy && s.status ? `<p class="muted tiny ai-status" role="status">${esc(s.status)}</p>` : ''}${resultHTML(ctx)}</div>
      <div class="ai-chat-composer"><form id="ai-ask-form" class="ai-ask"><textarea class="textarea" name="question" rows="2" maxlength="2000" required placeholder="اكتب سؤالك الأكاديمي هنا…" aria-label="سؤالك"></textarea><button class="primary-btn" type="submit" ${s.busy ? 'disabled' : ''} aria-label="إرسال السؤال">${ic('arrow', 18)} إرسال</button></form><p>الإجابات مولّدة آليًا وقد تتضمن أخطاء، ولا تمثل مصدرًا أكاديميًا معتمدًا.</p></div></div></div>`;
}

export const courseTabs = [{ id: 'ai', label: 'مساعد AI', render: renderTab }];

export const actions = {
  'ai-summarize': (el, ctx) => runTask(ctx, 'summarize'),
  'ai-cancel': (el, ctx) => cancelTask(ctx),
  'ai-example': el => {
    const area = document.querySelector('#ai-ask-form textarea');
    if (area) {
      area.value = el.dataset.sample || '';
      area.focus();
    }
  },
  'ai-clear': (el, ctx) => {
    s.kind = '';
    s.text = '';
    s.questions = [];
    s.error = '';
    s.meta = '';
    ctx.render();
  },
  'ai-questions': (el, ctx) =>
    runTask(ctx, 'questions', { count: Number(document.getElementById('ai-count')?.value) || 8 }),
  'ai-save-note': async (el, ctx) => {
    const sent = s.sent || { courseId: s.courseId, title: '', module: '' };
    const now = new Date().toISOString();
    await ctx.put('notes', {
      id: ctx.makeId(),
      courseId: sent.courseId,
      title: s.kind === 'summary' ? `ملخص: ${sent.title || 'محاضرة'}` : 'إجابة المساعد',
      lecture: sent.module || sent.title || '',
      body: s.text,
      color: 'blue',
      createdAt: now,
      updatedAt: now,
    });
    await ctx.refresh();
    ctx.toast('حُفظت في «ملاحظاتي»');
  },
  'ai-save-questions': async (el, ctx) => {
    const sent = s.sent || { courseId: s.courseId, title: '', plan: null };
    const existing = new Set(
      ctx.state.questionBank.filter(q => q.courseId === sent.courseId).map(q => q.question.trim()),
    );
    const fresh = s.questions
      .filter((q, i) => s.picked.has(i) && !existing.has(q.question.trim()))
      .map(q => ({
        ...q,
        id: ctx.makeId(),
        courseId: sent.courseId,
        source: savedQuestionSource(sent.title, sent.plan, q.source || ''),
      }));
    await ctx.saveQuestionBank([...ctx.state.questionBank, ...fresh]);
    await ctx.refresh();
    ctx.toast(`أُضيف ${fresh.length} سؤال؛ ستجدها في الامتحان التجريبي والمراجعة`);
  },
};

export const changes = {
  'ai-consent': el => {
    s.consent = el.checked;
    s.error = '';
  },
  'ai-source': (el, ctx) => {
    if (s.busy) {
      el.value = s.source; // disabled while a request is pending; never switch under it
      return;
    }
    s.source = el.value;
    s.seq++; // safety net: a reply still pending belongs to the previous file
    s.sent = null;
    s.status = '';
    s.consent = false;
    s.kind = '';
    s.error = '';
    s.text = '';
    s.questions = [];
    preparePlan(ctx, s.source);
  },
  'ai-pick': el => {
    const i = Number(el.dataset.index);
    if (el.checked) s.picked.add(i);
    else s.picked.delete(i);
  },
};

export const forms = {
  'ai-ask-form': async (form, ctx) => {
    const question = String(new FormData(form).get('question') || '').trim();
    if (!question) return;
    await runTask(ctx, 'ask', { question });
  },
};
