// AI lecture assistant (course tab "مساعد AI"). Runs through the `ai` edge function, so
// the Gemini key never reaches the browser. Only the selected lecture's text is sent.
import { getClient } from '../cloud/client.js?v=1.1.0';
import { accountUser } from './account.js?v=1.1.0';
import { formatNote } from './notes.js?v=1.1.0';

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
  consent: false,
  kind: '', // summary | questions | answer
  text: '',
  questions: [],
  picked: new Set(),
  meta: '',
};

function reset(courseId) {
  if (s.courseId === courseId) return;
  Object.assign(s, {
    courseId,
    source: '',
    busy: false,
    error: '',
    consent: false,
    kind: '',
    text: '',
    questions: [],
    meta: '',
  });
  s.picked = new Set();
}

async function call(ctx, body) {
  const sb = await getClient();
  const { data, error } = await sb.functions.invoke('ai', { body });
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

async function sourceText(ctx) {
  if (!s.source) throw new Error('اختر ملف المحاضرة أولًا');
  const r = ctx.state.resources.find(x => x.id === s.source);
  const text = await ctx.extractText(s.source);
  return { text, title: r?.name || '' };
}

async function runTask(ctx, task, extra = {}) {
  if (!s.consent) {
    s.error = 'يلزم الموافقة على مشاركة السؤال ونص المحاضرة المحددة قبل تشغيل المساعد.';
    ctx.render();
    return;
  }
  s.busy = true;
  s.error = '';
  ctx.render();
  try {
    const course = ctx.courseName(s.courseId);
    const src = task === 'ask' && !s.source ? { text: '', title: '' } : await sourceText(ctx);
    const data = await call(ctx, { task, course, ...src, ...extra });
    s.kind = task === 'summarize' ? 'summary' : task === 'questions' ? 'questions' : 'answer';
    s.text = data.text || '';
    s.questions = data.questions || [];
    s.picked = new Set(s.questions.map((_, i) => i));
    s.meta = `${data.truncated ? 'المحاضرة طويلة: أُرسل أول جزء منها فقط. ' : ''}المتبقي اليوم: ${data.left ?? '—'}`;
    if (s.kind === 'questions' && !s.questions.length)
      s.error = 'لم تُنتج أسئلة صالحة. جرّب مرة أخرى.';
  } catch (err) {
    s.error = err.message;
  }
  s.busy = false;
  ctx.render();
}

function resultHTML(ctx) {
  const { esc, ic } = ctx;
  if (s.busy)
    return `<div class="notice info" role="status">${ic('spark', 15)} المساعد يعمل… قد يستغرق ذلك حتى دقيقة.</div>`;
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

function renderTab(ctx, course) {
  const { esc, ic, state } = ctx;
  reset(course.id);
  if (!accountUser())
    return `<div class="panel"><h3>${ic('spark', 17)} مساعد المحاضرات (Gemini)</h3><p class="muted tiny">يلخّص محاضراتك، ويولّد أسئلة امتحان منها، ويجيب عن أسئلتك. يحتاج حسابك بالبريد.</p><button class="primary-btn" data-go="settings">${ic('settings', 15)} تسجيل الدخول من الإعدادات</button></div>`;
  const files = state.resources.filter(
    r => r.courseId === course.id && r.kind === 'file' && READABLE.test(r.name || ''),
  );
  return `<div class="page-intro"><div><h2>مساعد المحاضرات</h2><p>اختر محاضرة ثم اطلب ملخصًا أو أسئلة، أو اسأل سؤالًا. يُرسل نص المحاضرة المختارة فقط إلى Gemini عبر خادمك.</p></div></div><div class="panel ai-panel"><div class="field"><label for="ai-source">المحاضرة</label><select id="ai-source" class="select" data-act-change="ai-source"><option value="">${files.length ? 'اختر ملفًا' : 'لا ملفات نصية في هذا المساق'}</option>${files.map(r => `<option value="${esc(r.id)}" ${s.source === r.id ? 'selected' : ''}>${esc(r.module ? `${r.module} — ` : '')}${esc(r.name)}</option>`).join('')}</select></div><label class="ai-consent"><input id="ai-cloud-consent" type="checkbox" data-act-change="ai-consent" ${s.consent ? 'checked' : ''} /><span>أوافق على إرسال سؤالي ونص المحاضرة التي اخترتها إلى خدمة Gemini عبر Supabase لمعالجتهما عند الضغط على أحد أزرار المساعد. لا تُرسل الملفات الأخرى.</span></label><div class="row-actions"><button class="primary-btn" data-act="ai-summarize" ${s.busy ? 'disabled' : ''}>${ic('note', 15)} لخّص</button><button class="outline-btn" data-act="ai-questions" ${s.busy ? 'disabled' : ''}>${ic('quiz', 15)} ولّد أسئلة</button><select class="select ai-count" id="ai-count" aria-label="عدد الأسئلة">${[5, 8, 10, 15].map(n => `<option value="${n}" ${n === 8 ? 'selected' : ''}>${n} أسئلة</option>`).join('')}</select></div><form id="ai-ask-form" class="ai-ask"><textarea class="textarea" name="question" rows="2" maxlength="2000" required placeholder="اسأل عن مفهوم في المحاضرة أو في GIS عمومًا…" aria-label="سؤالك"></textarea><button class="outline-btn" type="submit" ${s.busy ? 'disabled' : ''}>${ic('bot', 15)} اسأل</button></form></div>${resultHTML(ctx)}`;
}

export const courseTabs = [{ id: 'ai', label: 'مساعد AI', render: renderTab }];

export const actions = {
  'ai-summarize': (el, ctx) => runTask(ctx, 'summarize'),
  'ai-questions': (el, ctx) =>
    runTask(ctx, 'questions', { count: Number(document.getElementById('ai-count')?.value) || 8 }),
  'ai-save-note': async (el, ctx) => {
    const r = ctx.state.resources.find(x => x.id === s.source);
    const now = new Date().toISOString();
    await ctx.put('notes', {
      id: ctx.makeId(),
      courseId: s.courseId,
      title: s.kind === 'summary' ? `ملخص: ${r?.name || 'محاضرة'}` : 'إجابة المساعد',
      lecture: r?.module || r?.name || '',
      body: s.text,
      color: 'blue',
      createdAt: now,
      updatedAt: now,
    });
    await ctx.refresh();
    ctx.toast('حُفظت في «ملاحظاتي»');
  },
  'ai-save-questions': async (el, ctx) => {
    const r = ctx.state.resources.find(x => x.id === s.source);
    const existing = new Set(
      ctx.state.questionBank.filter(q => q.courseId === s.courseId).map(q => q.question.trim()),
    );
    const fresh = s.questions
      .filter((q, i) => s.picked.has(i) && !existing.has(q.question.trim()))
      .map(q => ({
        ...q,
        id: ctx.makeId(),
        courseId: s.courseId,
        source: q.source || `AI · ${r?.name || ''}`,
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
    s.source = el.value;
    s.consent = false;
    s.kind = '';
    s.error = '';
    ctx.render();
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
