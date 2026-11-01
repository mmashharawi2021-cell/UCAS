// What may leave the device for the AI assistant. Independent of the (larger) on-device
// extraction limits in pdf-text.js and study.js: reading more of a lecture locally must never
// send more of it to Gemini. Must equal MAX_TEXT in supabase/functions/ai/index.ts
// (tests/ai-limits.test.mjs enforces this).
export const AI_MAX_TEXT = 60000;

/** The exact text sent for one lecture: a plain prefix of the extracted text. */
export function clipForAI(text) {
  const source = String(text || '');
  return { text: source.slice(0, AI_MAX_TEXT), truncated: source.length > AI_MAX_TEXT };
}

/** 60000 → "60,000" (Western digits, as the number appears elsewhere in the app). */
export const AI_MAX_TEXT_LABEL = AI_MAX_TEXT.toLocaleString('en-US');

// ---- Arabic counting (one shared helper for every page/character count shown) ----
export const PAGE_FORMS = { one: 'صفحة واحدة', two: 'صفحتين', few: 'صفحات', many: 'صفحة' };
export const CHAR_FORMS = { one: 'حرف واحد', two: 'حرفين', few: 'أحرف', many: 'حرف' };

/**
 * Number + correctly agreeing noun: 1 → forms.one, 2 → forms.two, otherwise the last two digits
 * decide (3–10 → few, 0 and 11–99 → many): 3 صفحات، 11 صفحة، 105 صفحات، 200 صفحة، 60,000 حرف.
 */
export function countPhrase(count, forms) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const tail = n % 100;
  return n.toLocaleString('en-US') + ' ' + (tail >= 3 && tail <= 10 ? forms.few : forms.many);
}
export const pagesPhrase = n => countPhrase(n, PAGE_FORMS);
/** "60,000 حرف" */
export const AI_MAX_TEXT_PHRASE = countPhrase(AI_MAX_TEXT, CHAR_FORMS);

// ---- What one request sends for a selected lecture, known before consent ----

/**
 * Real page number on which the first `length` characters of `pages` (joined with '\n', as the
 * extracted text is) end; null when there are no pages (TXT, MD, DOCX, PPTX). Never invents a page.
 */
export function lastSentPage(pages, length) {
  if (!Array.isArray(pages) || !pages.length || !(length > 0)) return null;
  let start = 0,
    last = null;
  for (const p of pages) {
    if (start >= length) break;
    last = Number(p.page) || null;
    start += String(p.text || '').length + 1;
  }
  return last;
}

/** From extractText's { text, pages, pdfExtent }: the exact text to send and how it was cut. */
export function planAISend({ text, pages = null, pdfExtent = null } = {}) {
  const clip = clipForAI(text);
  return {
    text: clip.text,
    clipped: clip.truncated,
    lastPage: lastSentPage(pages, clip.text.length),
    pdfExtent: pdfExtent?.truncated ? pdfExtent : null,
  };
}

/**
 * Consent sentence for the selected file (all tasks), naming the actual values. `wrap` formats the course and file names
 * (the caller escapes them for HTML); every other part is fixed text and numbers.
 */
export function consentText({ course = '', title = '', plan = null } = {}, wrap = v => v) {
  if (!plan) return 'سيُرسَل إلى Gemini: سؤالك.';
  // One consent per file: it covers every task (summary, questions, a question) on this file.
  const head = `سيُرسَل إلى Gemini مع كل طلب: نوع الطلب أو سؤالك، واسم المساق «${wrap(course)}»، واسم الملف «${wrap(title)}»، و`;
  const range = plan.lastPage ? ` (من الصفحة 1 إلى الصفحة ${plan.lastPage})` : '';
  if (plan.clipped) return `${head}أول ${AI_MAX_TEXT_PHRASE} من نصه${range}.`;
  // Under the cap, but the PDF itself was read only in part: never call that "complete".
  const ext = plan.pdfExtent;
  if (ext) {
    const total = Number(ext.totalPages) || 0;
    const read =
      ext.cutBy === 'chars' && ext.cutPage
        ? `حتى الصفحة ${ext.cutPage} من ${total}`
        : `أول ${pagesPhrase(ext.pagesExamined)} من ${total}`;
    return `${head}كل ما قُرئ من نصه: ${read}.`;
  }
  return `${head}نصه كاملًا${range}.`;
}

/** Whether Gemini saw less than the whole file (AI cap or a PDF not read to the end). */
export const sentPartOnly = plan => !!(plan && (plan.clipped || plan.pdfExtent));

/** `source` of a saved AI question: says which part of the file it came from when only part was sent. */
export function savedQuestionSource(title, plan, modelSource = '') {
  const name = String(title || '');
  if (!sentPartOnly(plan)) return modelSource || `AI · ${name}`;
  const base = plan.lastPage
    ? `AI · من الصفحات 1–${plan.lastPage} من «${name}»`
    : `AI · أول ${AI_MAX_TEXT_PHRASE} من «${name}»`;
  return modelSource ? `${base} · ${modelSource}` : base;
}

/** Result note in the AI tab; `pageNote` is pdfTruncationNote() of the local extraction. */
export function sentNote(plan, pageNote = '', serverTruncated = false) {
  const capped = plan?.clipped || serverTruncated;
  if (pageNote && capped)
    return `المحاضرة طويلة: ${pageNote} على الجهاز، وأُرسل أول ${AI_MAX_TEXT_PHRASE} منها فقط. `;
  if (capped) return `المحاضرة طويلة: أُرسل أول ${AI_MAX_TEXT_PHRASE} منها فقط. `;
  if (pageNote) return `المحاضرة طويلة: ${pageNote} قبل الإرسال، وما بعدها لم يُرسل. `;
  return '';
}
