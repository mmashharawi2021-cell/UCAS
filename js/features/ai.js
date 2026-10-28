// AI lecture assistant (course tab "مساعد AI"). Runs through the `ai` edge function, so
// the Gemini key never reaches the browser. Only the selected lecture's text is sent.
import { getClient } from '../cloud/client.js?v=1.5.0';
import { accountUser } from './account.js?v=1.5.0';
import { formatNote } from './notes.js?v=1.5.0';

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
    return `<section class="ai-studio-guest"><div class="ai-studio-orb">${ic('bot', 39)}</div><span class="premium-kicker">AI STUDY STUDIO</span><h2>مساعدك الأكاديمي الذكي</h2><p>حوّل محاضراتك إلى ملخصات وأسئلة، واستفسر عن المفاهيم من واجهة واحدة. يتطلب تشغيل Gemini تسجيل الدخول بالبريد.</p><div class="ai-guest-features"><span>${ic('note', 16)} تلخيص محاضرات</span><span>${ic('quiz', 16)} إنشاء أسئلة</span><span>${ic('search', 16)} أسئلة واستفسارات</span></div><button class="primary-btn" data-go="settings">${ic('settings', 17)} تسجيل الدخول من الإعدادات</button><small>العمل على ملفاتك محليًا لا يتطلب حسابًا؛ إرسال المحتوى إلى Gemini اختياري.</small></section>`;
  const files = state.resources.filter(
    r => r.courseId === course.id && r.kind === 'file' && READABLE.test(r.name || ''),
  );
  return `<section class="ai-studio-header"><div><span class="premium-kicker">AI STUDY STUDIO</span><h2>مساعد المحاضرات الذكي</h2><p>لخّص محاضرتك، أنشئ أسئلة وناقش المفاهيم في مساحة مخصصة للدراسة</p></div><span class="ai-studio-engine">${ic('spark', 16)} GEMINI</span></section>
    <div class="panel ai-panel ai-studio-layout">
      <aside class="ai-studio-side"><div class="ai-side-heading">${ic('folder', 17)} <strong>مصادر المعرفة</strong></div><div class="field"><label for="ai-source">المحاضرة المختارة</label><select id="ai-source" class="select" data-act-change="ai-source"><option value="">${files.length ? 'اسأل بدون ملف أو اختر محاضرة' : 'لا توجد محاضرات قابلة للقراءة'}</option>${files.map(r => `<option value="${esc(r.id)}" ${s.source === r.id ? 'selected' : ''}>${esc(r.module ? `${r.module} — ` : '')}${esc(r.name)}</option>`).join('')}</select></div>
      <p class="ai-side-description">يمكنك طرح سؤال عام دون ملف؛ تلخيص المحاضرة وتوليد أسئلة منها يتطلبان اختيار ملف قابل للقراءة.</p>
      <div class="ai-side-divider"></div>
      <strong class="ai-side-heading">${ic('spark', 17)} أدوات الدراسة</strong>
      <button class="ai-tool-button" data-act="ai-summarize" ${s.busy ? 'disabled' : ''}>${ic('note', 18)} تلخيص المحاضرة <span>${ic('chevron', 14)}</span></button>
      <button class="ai-tool-button" data-act="ai-questions" ${s.busy ? 'disabled' : ''}>${ic('quiz', 18)} إنشاء اختبار <span>${ic('chevron', 14)}</span></button>
      <label class="ai-question-count" for="ai-count">عدد الأسئلة <select class="select ai-count" id="ai-count" aria-label="عدد الأسئلة">${[5, 8, 10, 15].map(n => `<option value="${n}" ${n === 8 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="ai-consent"><input id="ai-cloud-consent" type="checkbox" data-act-change="ai-consent" ${s.consent ? 'checked' : ''}/><span>أوافق على إرسال سؤالي ونص المحاضرة المختارة فقط إلى Gemini عبر Supabase عند طلب المساعدة.</span></label>
      <small class="ai-side-privacy">${ic('shield', 14)} لا تُرسل أي ملفات تلقائيًا</small></aside>
      <div class="ai-studio-main"><div class="ai-chat-header"><div class="ai-chat-avatar">${ic('bot', 21)}</div><div><strong>UCAS Academic AI</strong><p>مساعد للدراسة · راجع النتائج مع المصادر</p></div><button class="ai-chat-clear" data-act="ai-clear" aria-label="مسح نتائج المحادثة الحالية" title="بدء مساحة جديدة">${ic('plus', 16)} جديد</button></div>
      <div class="ai-chat-body"><div class="ai-welcome"><span class="ai-welcome-orb">${ic('spark', 24)}</span><h3>بماذا نبدأ اليوم؟</h3><p>اختر محاضرة من القائمة، أو اكتب سؤالك. كل طلب يُعالج على حدة، والنتائج تحتاج مراجعة.</p></div>
      ${s.kind || s.busy || s.error ? '' : `<div class="ai-starter-grid"><button data-act="ai-example" data-sample="اشرح المفهوم الرئيسي في هذه المحاضرة بطريقة مبسطة.">${ic('book', 17)} اشرح مفهومًا</button><button data-act="ai-example" data-sample="ما الفرق بين Raster وVector في نظم المعلومات الجغرافية؟">${ic('layers', 17)} مقارنة GIS</button><button data-act="ai-example" data-sample="اقترح أسئلة مراجعة مفاهيمية لهذا المساق.">${ic('quiz', 17)} فكرة للمراجعة</button></div>`}
      ${resultHTML(ctx)}</div>
      <div class="ai-chat-composer"><form id="ai-ask-form" class="ai-ask"><textarea class="textarea" name="question" rows="2" maxlength="2000" required placeholder="اكتب سؤالك الأكاديمي هنا…" aria-label="سؤالك"></textarea><button class="primary-btn" type="submit" ${s.busy ? 'disabled' : ''} aria-label="إرسال السؤال">${ic('arrow', 18)} إرسال</button></form><p>الإجابات مولّدة آليًا وقد تتضمن أخطاء، ولا تمثل مصدرًا أكاديميًا معتمدًا.</p></div></div></div>`;
}

export const courseTabs = [{ id: 'ai', label: 'مساعد AI', render: renderTab }];

export const actions = {
  'ai-summarize': (el, ctx) => runTask(ctx, 'summarize'),
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
    s.text = '';
    s.questions = [];
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
