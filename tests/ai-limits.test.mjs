// What leaves the device for the AI assistant stays capped, independent of the larger
// on-device extraction limits; and long PDFs report how far they were read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  AI_MAX_TEXT,
  AI_MAX_TEXT_LABEL,
  AI_MAX_TEXT_PHRASE,
  CHAR_FORMS,
  clipForAI,
  consentText,
  countPhrase,
  lastSentPage,
  pagesPhrase,
  planAISend,
  savedQuestionSource,
  sentNote,
} from '../js/lib/ai-limits.js';
import { loadCourseText } from '../js/study.js';
import { MAX_PAGES, MAX_TEXT_CHARS, extractPdfText, pdfTruncationNote } from '../js/pdf-text.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('client AI cap equals MAX_TEXT of the ai edge function', async () => {
  const source = await read('../supabase/functions/ai/index.ts');
  const match = /const\s+MAX_TEXT\s*=\s*([\d_]+)\s*;/.exec(source);
  assert.ok(match, 'MAX_TEXT not found in supabase/functions/ai/index.ts');
  assert.equal(Number(match[1].replace(/_/g, '')), AI_MAX_TEXT);
  assert.equal(AI_MAX_TEXT, 60000);
  assert.equal(AI_MAX_TEXT_LABEL, '60,000');
});

test('approved extraction limits, larger than the AI cap', async () => {
  assert.equal(MAX_PAGES, 200);
  assert.equal(MAX_TEXT_CHARS, 350000);
  assert.match(await read('../js/study.js'), /MAX_TEXT = 350000;/);
  assert.ok(MAX_TEXT_CHARS > AI_MAX_TEXT);
});

test('clipForAI sends a plain prefix and reports the cut', () => {
  const long = 'ا'.repeat(AI_MAX_TEXT) + 'TAIL';
  const clipped = clipForAI(long);
  assert.equal(clipped.text, long.slice(0, AI_MAX_TEXT));
  assert.equal(clipped.text.length, AI_MAX_TEXT);
  assert.equal(clipped.truncated, true);
  assert.deepEqual(clipForAI('short'), { text: 'short', truncated: false });
  assert.deepEqual(clipForAI(''), { text: '', truncated: false });
  assert.deepEqual(clipForAI('x'.repeat(AI_MAX_TEXT)), {
    text: 'x'.repeat(AI_MAX_TEXT),
    truncated: false,
  });
});

test('AI request body and consent text use the shared cap', async () => {
  const ai = await read('../js/features/ai.js');
  assert.match(ai, /from '\.\.\/lib\/ai-limits\.js\?v=\d+\.\d+\.\d+'/);
  assert.match(ai, /planAISend\(await ctx\.extractText\(id\)\)/);
  assert.match(ai, /consentText\(/);
  assert.doesNotMatch(ai, /أُرسل أول جزء منها/);
  assert.doesNotMatch(ai, /أوافق على/);
  const sw = await read('../sw.js');
  assert.match(sw, /\.\/js\/lib\/ai-limits\.js\?v=\$\{VERSION\}/);
});

function stubPDF(pageTexts) {
  return async () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: pageTexts.length,
        getPage: async n => ({
          getTextContent: async () => ({ items: [{ str: pageTexts[n - 1], hasEOL: true }] }),
          cleanup() {},
        }),
        destroy: async () => {},
      }),
      destroy: async () => {},
    }),
  });
}
const file = new Blob(['%PDF-1.4 stub bytes for tests']);

test('page cut: note says how many pages were read', async () => {
  const pages = Array.from({ length: 5 }, (_, i) => 'page text number ' + (i + 1));
  const r = await extractPdfText(file, { loader: stubPDF(pages), maxPages: 3 });
  assert.equal(r.truncated, true);
  assert.equal(r.cutBy, 'pages');
  assert.equal(pdfTruncationNote(r), 'قُرئت أول 3 صفحات من 5');
});

test('character cut: note names the page where the text stopped', async () => {
  const pages = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40), 'd'.repeat(40)];
  const r = await extractPdfText(file, { loader: stubPDF(pages), maxChars: 100 });
  assert.equal(r.truncated, true);
  assert.equal(r.cutBy, 'chars');
  assert.equal(r.cutPage, 3);
  // The '\n' between pages counts: the joined text is exactly maxChars long.
  assert.equal(r.text.length, 100);
  assert.equal(r.text, r.pages.map(p => p.text).join('\n'));
  assert.equal(pdfTruncationNote(r), 'اقتُطع النص عند الصفحة 3 من 4');
  // Budget used up exactly at a page end, with more text after it.
  const exact = await extractPdfText(file, { loader: stubPDF(pages), maxChars: 80 });
  assert.equal(exact.cutBy, 'chars');
  assert.equal(exact.cutPage, 2);
});

test('a PDF read to the end has no note', async () => {
  const pages = ['first page text here', 'second page text here'];
  // 20 + '\n' + 21 = 42 characters: fits exactly at 42, cut at 41.
  const r = await extractPdfText(file, { loader: stubPDF(pages), maxChars: 42 });
  assert.equal(r.truncated, false);
  assert.equal(r.text.length, 42);
  const over = await extractPdfText(file, { loader: stubPDF(pages), maxChars: 41 });
  assert.equal(over.cutBy, 'chars');
  assert.equal(over.cutPage, 2);
  assert.equal(over.text.length, 41);
  assert.equal(r.cutBy, '');
  assert.equal(pdfTruncationNote(r), '');
  assert.equal(pdfTruncationNote(null), '');
});

test('Arabic counting: one shared helper for pages and characters', () => {
  assert.equal(pagesPhrase(1), 'صفحة واحدة');
  assert.equal(pagesPhrase(2), 'صفحتين');
  assert.equal(pagesPhrase(3), '3 صفحات');
  assert.equal(pagesPhrase(10), '10 صفحات');
  assert.equal(pagesPhrase(11), '11 صفحة');
  assert.equal(pagesPhrase(99), '99 صفحة');
  assert.equal(pagesPhrase(100), '100 صفحة');
  assert.equal(pagesPhrase(105), '105 صفحات');
  assert.equal(pagesPhrase(200), '200 صفحة');
  assert.equal(countPhrase(60000, CHAR_FORMS), '60,000 حرف');
  assert.equal(countPhrase(5, CHAR_FORMS), '5 أحرف');
  assert.equal(AI_MAX_TEXT_PHRASE, '60,000 حرف');
  assert.equal(AI_MAX_TEXT_PHRASE, AI_MAX_TEXT_LABEL + ' حرف');
  assert.equal(
    pdfTruncationNote({ truncated: true, pagesExamined: 1, totalPages: 4 }),
    'قُرئت أول صفحة واحدة من 4',
  );
  assert.equal(
    pdfTruncationNote({ truncated: true, pagesExamined: 2, totalPages: 4 }),
    'قُرئت أول صفحتين من 4',
  );
  assert.equal(
    pdfTruncationNote({ truncated: true, pagesExamined: 200, totalPages: 250 }),
    'قُرئت أول 200 صفحة من 250',
  );
});

test('lastSentPage: the real page where the sent prefix ends, never invented', () => {
  const pages = [
    { page: 1, text: 'aaaa' }, // 0..3, '\n' at 4
    { page: 3, text: 'bbbb' }, // 5..8 (page 2 had no text), '\n' at 9
    { page: 4, text: 'cc' }, //  10..11
  ];
  assert.equal(lastSentPage(pages, 4), 1);
  assert.equal(lastSentPage(pages, 5), 1, 'only the separator after page 1');
  assert.equal(lastSentPage(pages, 6), 3);
  assert.equal(lastSentPage(pages, 12), 4);
  assert.equal(lastSentPage(null, 12), null);
  assert.equal(lastSentPage([], 12), null);
  assert.equal(lastSentPage(pages, 0), null);
});

test('consent, saved source and result note state what is actually sent', () => {
  const pages = Array.from({ length: 50 }, (_, i) => ({ page: i + 1, text: 'x'.repeat(1999) }));
  const text = pages.map(p => p.text).join('\n'); // 100,000 characters
  const clipped = planAISend({ text, pages });
  assert.equal(clipped.text, text.slice(0, AI_MAX_TEXT));
  assert.equal(clipped.clipped, true);
  assert.equal(clipped.lastPage, 30); // 30 × 2000 = 60,000
  assert.equal(
    consentText({ course: 'نظم المعلومات', title: 'lec.pdf', plan: clipped }),
    'سيُرسَل إلى Gemini مع كل طلب: نوع الطلب أو سؤالك، واسم المساق «نظم المعلومات»، واسم الملف «lec.pdf»، وأول 60,000 حرف من نصه (من الصفحة 1 إلى الصفحة 30).',
  );
  assert.equal(savedQuestionSource('lec.pdf', clipped), 'AI · من الصفحات 1–30 من «lec.pdf»');
  assert.equal(
    savedQuestionSource('lec.pdf', clipped, 'القسم 2'),
    'AI · من الصفحات 1–30 من «lec.pdf» · القسم 2',
  );
  assert.equal(sentNote(clipped), 'المحاضرة طويلة: أُرسل أول 60,000 حرف منها فقط. ');

  const short = planAISend({
    text: 'abc\ndef',
    pages: [
      { page: 1, text: 'abc' },
      { page: 2, text: 'def' },
    ],
  });
  assert.equal(
    consentText({ course: 'C', title: 'f.pdf', plan: short }),
    'سيُرسَل إلى Gemini مع كل طلب: نوع الطلب أو سؤالك، واسم المساق «C»، واسم الملف «f.pdf»، ونصه كاملًا (من الصفحة 1 إلى الصفحة 2).',
  );
  assert.equal(savedQuestionSource('f.pdf', short), 'AI · f.pdf');
  assert.equal(savedQuestionSource('f.pdf', short, 'القسم 1'), 'القسم 1');
  assert.equal(sentNote(short), '');

  // Page-less files (TXT, MD, DOCX, PPTX): never a page range.
  const txtLong = planAISend({ text: 'y'.repeat(AI_MAX_TEXT + 5) });
  assert.equal(
    consentText({ course: 'C', title: 'notes.txt', plan: txtLong }),
    'سيُرسَل إلى Gemini مع كل طلب: نوع الطلب أو سؤالك، واسم المساق «C»، واسم الملف «notes.txt»، وأول 60,000 حرف من نصه.',
  );
  assert.equal(savedQuestionSource('notes.txt', txtLong), 'AI · أول 60,000 حرف من «notes.txt»');
  const txtShort = planAISend({ text: 'short text' });
  assert.equal(
    consentText({ course: 'C', title: 'notes.txt', plan: txtShort }),
    'سيُرسَل إلى Gemini مع كل طلب: نوع الطلب أو سؤالك، واسم المساق «C»، واسم الملف «notes.txt»، ونصه كاملًا.',
  );
  assert.equal(consentText({ course: 'C' }), 'سيُرسَل إلى Gemini: سؤالك.');
  // Names go through the caller's wrapper (HTML escaping in the app).
  assert.match(
    consentText({ course: '<b>', title: 't', plan: txtShort }, v => `[${v}]`),
    /«\[<b>\]»/,
  );

  // Local PDF cut (200 of 250 pages) with text under the cap.
  const extent = {
    truncated: true,
    totalPages: 250,
    pagesExamined: 200,
    cutBy: 'pages',
    cutPage: null,
  };
  const partial = planAISend({
    text: 'abc\ndef',
    pages: [
      { page: 1, text: 'abc' },
      { page: 200, text: 'def' },
    ],
    pdfExtent: extent,
  });
  assert.equal(partial.clipped, false);
  const note = pdfTruncationNote(extent);
  assert.equal(
    sentNote(partial, note),
    'المحاضرة طويلة: قُرئت أول 200 صفحة من 250 قبل الإرسال، وما بعدها لم يُرسل. ',
  );
  assert.equal(savedQuestionSource('big.pdf', partial), 'AI · من الصفحات 1–200 من «big.pdf»');
  // Read only in part: never "كاملًا".
  assert.equal(
    consentText({ course: 'C', title: 'big.pdf', plan: partial }),
    'سيُرسَل إلى Gemini مع كل طلب: نوع الطلب أو سؤالك، واسم المساق «C»، واسم الملف «big.pdf»، وكل ما قُرئ من نصه: أول 200 صفحة من 250.',
  );
  assert.match(
    consentText({
      course: 'C',
      title: 'big.pdf',
      plan: { ...partial, pdfExtent: { ...extent, pagesExamined: 2, totalPages: 7 } },
    }),
    /وكل ما قُرئ من نصه: أول صفحتين من 7\.$/,
  );
  // One consent per file: the same sentence for every task.
  assert.equal(consentText({}), 'سيُرسَل إلى Gemini: سؤالك.');
  assert.equal(
    sentNote({ ...clipped, pdfExtent: extent }, note),
    'المحاضرة طويلة: قُرئت أول 200 صفحة من 250 على الجهاز، وأُرسل أول 60,000 حرف منها فقط. ',
  );
});

test('study.js never cuts extracted PDF text silently (separator boundary)', async () => {
  const resource = { id: 'r', courseId: 'c', kind: 'file', name: 'big.pdf', blob: file };
  const load = pages =>
    loadCourseText([resource], 'c', null, {
      pdfPreview: blob => extractPdfText(blob, { loader: stubPDF(pages) }),
    });
  // Exactly MAX_TEXT_CHARS including the two separators: kept whole, no note.
  const fit = ['a'.repeat(116666), 'b'.repeat(116666), 'c'.repeat(116666)];
  assert.equal(fit.join('\n').length, MAX_TEXT_CHARS);
  const whole = (await load(fit)).documents[0];
  assert.equal(whole.text, fit.join('\n'));
  assert.equal(whole.pdfExtent, null);
  // One character more: extraction reports the cut and study.js keeps every extracted character.
  const over = ['a'.repeat(116666), 'b'.repeat(116666), 'c'.repeat(116667)];
  const cut = (await load(over)).documents[0];
  assert.equal(cut.text.length, MAX_TEXT_CHARS);
  assert.equal(cut.text, cut.pages.map(p => p.text).join('\n'), 'text equals the pages it reports');
  assert.equal(cut.pdfExtent.cutBy, 'chars');
  assert.equal(cut.pdfExtent.cutPage, 3);
});
