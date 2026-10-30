// Long PDFs (owner-approved limits: 200 pages / 350,000 characters on the device) while the
// AI assistant still sends at most AI_MAX_TEXT characters. Runs the app's real path with
// synthetic PDFs; the Supabase client is the in-repo fake and every request to a real
// Supabase host is aborted and counted (must stay 0). Run with a local server on 127.0.0.1:8099.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { SUPABASE_JS } from '../js/cloud/config.js';
import { AI_MAX_TEXT } from '../js/lib/ai-limits.js';
import { seedLegacy } from './fixtures/legacy-seed.mjs';
import { makeTextPDF } from './fixtures/text-pdf.mjs';

const BASE = 'http://127.0.0.1:8099/';
const step = name => console.log('✓', name);
const fake = await readFile(new URL('./fixtures/fake-supabase.mjs', import.meta.url), 'utf8');
const aiCalls = [];
const realSupabase = [];
let delayNext = 0; // ms: hold the next AI reply (a slow network)
async function remote(op, args) {
  if (op === 'invoke') {
    aiCalls.push(args.body);
    if (delayNext) {
      const ms = delayNext;
      delayNext = 0;
      await new Promise(resolve => setTimeout(resolve, ms));
    }
    if (!args.user?.email) return { error: 'email account required' };
    if (args.body.task === 'questions')
      return {
        questions: [
          { question: 'سؤال وهمي 1؟', choices: ['أ', 'ب', 'ج', 'د'], answer: 0, why: 'تفسير' },
        ],
        left: 6,
      };
    return { text: 'ملخص تجريبي من خادم وهمي.', left: 7 };
  }
  if (op === 'sync') return { data: args.mode === 'upsert' ? null : [], error: null };
  return null; // file upload/download/remove: nothing to keep
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  await context.route(SUPABASE_JS, route =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: fake }),
  );
  await context.route(/supabase\.co/, route => {
    realSupabase.push(route.request().method());
    return route.abort();
  });
  await context.exposeFunction('__fakeRemote', remote);
  // A signed-in (fake) email account, so the AI tab is available.
  // Init scripts also run in the PDF preview frame, which has no localStorage.
  await context.addInitScript(() => {
    if (location.origin !== 'http://127.0.0.1:8099' || window.top !== window) return;
    localStorage.setItem('fake-email-user', 'student@example.test');
    localStorage.setItem('ucas-cloud-auth', '{"fake":true}');
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.topbar');
  await seedLegacy(page, { reload: false });
  const pdfs = {
    p205: makeTextPDF(205),
    p200: makeTextPDF(200),
    p3: makeTextPDF(3),
    // 250 low-text pages: the first 200 hold ~21,000 characters, under the AI cap.
    p250low: makeTextPDF(250, 100, 5),
  };
  await page.evaluate(async pdfs => {
    const { put } = await import('./js/store.js');
    const blob = b64 =>
      new Blob([Uint8Array.from(atob(b64), x => x.charCodeAt(0))], { type: 'application/pdf' });
    const add = (id, name, courseId, b64) => {
      const file = blob(b64);
      return put('resources', {
        id,
        kind: 'file',
        name,
        courseId,
        module: 'PDF طويل',
        blob: file,
        size: file.size,
        addedAt: new Date().toISOString(),
        completed: false,
      });
    };
    await add('lim-205', 'long-205-pages.pdf', 'course-1', pdfs.p205);
    await add('lim-3a', 'short-3-pages.pdf', 'course-1', pdfs.p3);
    await add('lim-200', 'exact-200-pages.pdf', 'course-2', pdfs.p200);
    await add('lim-3b', 'short-copy.pdf', 'course-2', pdfs.p3);
    await add('lim-250', 'deck-250-pages.pdf', 'course-3', pdfs.p250low);
    // Page-less files: a long TXT (over the AI cap) and a short MD.
    const lines = n =>
      Array.from({ length: n }, (_, i) => `txt line ${i + 1} raster vector layer`).join('\n');
    for (const [id, name, body] of [
      ['lim-txt', 'long-notes.txt', lines(2500)],
      ['lim-md', 'short-notes.md', lines(40)],
    ]) {
      const file = new Blob([body], { type: 'text/plain' });
      await put('resources', {
        id,
        kind: 'file',
        name,
        courseId: 'course-2',
        module: 'ملاحظات',
        blob: file,
        size: file.size,
        addedAt: new Date().toISOString(),
        completed: false,
      });
    }
  }, pdfs);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-course="course-1"]');
  const click = sel => page.evaluate(s => document.querySelector(s).click(), sel);

  // ---- 1. PDF preview (nothing cached yet: the preview reads the file itself) ----
  await click('[data-course="course-1"]');
  await page.waitForSelector('[data-view-resource="lim-205"]');
  await click('[data-view-resource="lim-205"]');
  await page.waitForSelector('#pdf-extent-note:not([hidden])', { timeout: 120000 });
  const previewNote = await page.locator('#pdf-extent-note').innerText();
  assert.match(previewNote, /قُرئت أول 200 صفحة من 205، للبحث وبطاقات الدراسة على جهازك\./);
  assert.match(previewNote, /مساعد AI يرسل إلى Gemini أول 60,000 حرف فقط، وبموافقتك\./);
  assert.equal(await page.locator('#pdf-extent-note').getAttribute('role'), 'status');
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 392);
  step('PDF preview over the limit: "' + previewNote + '"');
  await click('[data-action="close-modal"]');
  await click('[data-view-resource="lim-3a"]');
  await page.waitForSelector('.modal iframe.file-frame');
  await page.waitForTimeout(4000);
  assert.equal(await page.locator('#pdf-extent-note').isHidden(), true, 'short PDF: no note');
  await click('[data-action="close-modal"]');
  step('PDF preview under the limit: no note');

  // ---- 2. Study screen, course with a 205-page and a 3-page PDF ----
  await click('[data-action="assistant"]');
  await page.waitForSelector('[data-action="study-cards"]');
  await click('[data-action="study-cards"]');
  await page.waitForSelector('#study-results .pdf-extent-note', { timeout: 120000 });
  const notes = await page.locator('#study-results .pdf-extent-note').allInnerTexts();
  assert.equal(notes.length, 1, JSON.stringify(notes));
  assert.match(notes[0], /long-205-pages\.pdf/, 'several files loaded: the file is named');
  assert.match(notes[0], /قُرئت أول 200 صفحة من 205/);
  assert.doesNotMatch(notes[0], /short-3-pages/);
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 392);
  step('study screen: "' + notes[0] + '"');
  await click('[data-action="close-modal"]');

  // ---- 3. Study screen, PDFs at (200 pages) and under the limit: no note ----
  await click('[data-go="courses"]');
  await page.waitForSelector('[data-course="course-2"]');
  await click('[data-course="course-2"]');
  await page.waitForSelector('[data-action="assistant"]');
  await click('[data-action="assistant"]');
  await page.waitForSelector('[data-action="study-cards"]');
  await click('[data-action="study-cards"]');
  await page.waitForFunction(
    () =>
      document.querySelector('#study-results .study-match') ||
      /تعذر|لم نجد/.test(document.querySelector('#study-results')?.textContent || ''),
    null,
    { timeout: 120000 },
  );
  assert.equal(await page.locator('#study-results .pdf-extent-note').count(), 0);
  assert.ok((await page.locator('#study-results .study-match').count()) > 0);
  step('study screen with 200-page and 3-page PDFs: no truncation note');
  await click('[data-action="close-modal"]');

  // ---- 4. AI assistant: one consent per file names the actual values; bodies match it ----
  await click('[data-tab="ai"]');
  await page.waitForSelector('#ai-source', { timeout: 20000 });
  const courseTitle = (await page.locator('.course-detail-hero h1').innerText()).trim();
  const consentText = async () => (await page.locator('label.ai-consent').innerText()).trim();
  const FREE = 'سيُرسَل إلى Gemini: سؤالك.';
  const lineFor = (course, file, rest) =>
    `سيُرسَل إلى Gemini مع كل طلب: نوع الطلب أو سؤالك، واسم المساق «${course}»، واسم الملف «${file}»، و${rest}.`;
  const CANCELLED = 'أُلغي الطلب. قد يُحتسب من حصتك اليومية إن كان قد وصل إلى الخادم.';
  // The page where the first `length` characters of pages joined with '\n' end (test's own count).
  const endPage = (pages, length) => {
    let start = 0,
      last = null;
    for (const p of pages) {
      if (start >= length) break;
      last = p.page;
      start += p.text.length + 1;
    }
    return last;
  };
  const localText = id =>
    page.evaluate(async id => {
      const v = (await (await fetch('package.json')).json()).version;
      const { get } = await import(`./js/store.js?v=${v}`);
      const { loadCourseText } = await import(`./js/study.js?v=${v}`);
      const { extractPdfText } = await import(`./js/pdf-text.js?v=${v}`);
      const r = await get('resources', id);
      const data = await loadCourseText([r], r.courseId, null, { pdfPreview: extractPdfText });
      const d = data.documents[0];
      return { text: d.text, pages: d.pages };
    }, id);
  const selectSource = async id => {
    await page.selectOption('#ai-source', id);
    if (id) await page.waitForSelector('#ai-cloud-consent:not([disabled])', { timeout: 120000 });
    assert.equal(
      await page.isChecked('#ai-cloud-consent'),
      false,
      'changing the file cancels consent',
    );
  };
  const KIND = { summarize: 'الملخص', questions: 'سؤال مقترح', ask: 'الإجابة' };
  const TRIGGER = {
    summarize: () => click('[data-act="ai-summarize"]'),
    questions: () => click('[data-act="ai-questions"]'),
    ask: async question => {
      await page.fill('#ai-ask-form textarea', question);
      await click('#ai-ask-form button[type="submit"]');
    },
  };
  const run = async (task, arg) => {
    const before = aiCalls.length;
    await TRIGGER[task](arg);
    await page.waitForFunction(
      t => document.querySelector('.ai-result h3')?.textContent.includes(t),
      KIND[task],
      { timeout: 120000 },
    );
    assert.equal(aiCalls.length, before + 1, task + ': exactly one request');
    return aiCalls[aiCalls.length - 1];
  };
  /** Without the tick nothing is sent: an alert, and focus on the consent box. */
  const blocked = async (task, arg) => {
    const before = aiCalls.length;
    await TRIGGER[task](arg);
    await page.waitForSelector('.ai-studio-main [role="alert"]');
    await page.waitForTimeout(300);
    assert.equal(aiCalls.length, before, task + ': nothing sent without consent');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'ai-cloud-consent');
  };
  const expectLecture = (body, task, title, text) => {
    assert.equal(body.task, task);
    assert.equal(body.course, courseTitle);
    assert.equal(body.title, title);
    assert.equal(body.text, text);
    assert.equal(body.truncated, undefined, 'no extra fields in the request body');
  };

  // 4a. No file selected: the consent names only the question.
  assert.equal(await consentText(), FREE);

  // 4b. A 200-page PDF: course, file and the page where the 60,000-character prefix ends.
  await selectSource('lim-200');
  const pdf = await localText('lim-200');
  assert.ok(pdf.text.length > 250000, 'all 200 pages read on the device: ' + pdf.text.length);
  const lastPage = endPage(pdf.pages, AI_MAX_TEXT);
  assert.ok(lastPage > 1 && lastPage < 200, 'prefix ends inside the lecture: ' + lastPage);
  const PDF = 'exact-200-pages.pdf';
  const pdfLine = lineFor(
    courseTitle,
    PDF,
    `أول 60,000 حرف من نصه (من الصفحة 1 إلى الصفحة ${lastPage})`,
  );
  assert.equal(await consentText(), pdfLine);
  step('consent, clipped PDF: "' + pdfLine + '"');

  // 4c. Not ticked: summarize, questions and ask send nothing.
  await blocked('summarize');
  await blocked('questions');
  await blocked('ask', 'سؤال بلا موافقة');
  step('consent not ticked: summarize, questions and ask send nothing');

  // 4d. One tick covers summarize, then questions, then ask on the same file and course.
  await page.check('#ai-cloud-consent');
  const sentPdf = pdf.text.slice(0, AI_MAX_TEXT);
  let body = await run('summarize');
  expectLecture(body, 'summarize', PDF, sentPdf);
  assert.equal(body.text.length, AI_MAX_TEXT);
  assert.ok(body.text.startsWith('p1 l1'));
  assert.ok(body.text.includes(`p${lastPage} l`) && !body.text.includes(`p${lastPage + 1} l1 `));
  const result = await page.locator('.ai-result').innerText();
  assert.match(result, /المحاضرة طويلة: أُرسل أول 60,000 حرف منها فقط\./);
  assert.match(result, /المتبقي اليوم: 7/);
  body = await run('questions');
  expectLecture(body, 'questions', PDF, sentPdf);
  assert.equal(body.count, 8);
  await click('[data-act="ai-save-questions"]');
  await page.waitForFunction(async () => {
    const row = await (await import('./js/store.js')).get('settings', 'question-bank');
    return Array.isArray(row?.value) && row.value.length > 0;
  });
  const saved = await page.evaluate(async () => {
    const row = await (await import('./js/store.js')).get('settings', 'question-bank');
    return row.value.filter(q => q.question.startsWith('سؤال وهمي')).map(q => q.source);
  });
  assert.deepEqual(saved, [`AI · من الصفحات 1–${lastPage} من «${PDF}»`]);
  body = await run('ask', 'ما الفكرة الرئيسية؟');
  expectLecture(body, 'ask', PDF, sentPdf);
  assert.equal(body.question, 'ما الفكرة الرئيسية؟');
  assert.equal(await page.isChecked('#ai-cloud-consent'), true, 'consent kept for this file');
  step(
    `one tick: summarize, questions, ask each sent ${body.text.length} of ${pdf.text.length} characters (to page ${lastPage}); saved source "${saved[0]}"`,
  );

  // 4e. While a request is pending: selectors and task buttons disabled; Cancel works.
  delayNext = 3000;
  const pendingBefore = aiCalls.length;
  await TRIGGER.summarize();
  await page.waitForSelector('[data-act="ai-cancel"]');
  const pendingState = await page.evaluate(() => ({
    source: document.querySelector('#ai-source').disabled,
    count: document.querySelector('#ai-count').disabled,
    consent: document.querySelector('#ai-cloud-consent').disabled,
    summarize: document.querySelector('[data-act="ai-summarize"]').disabled,
    questions: document.querySelector('[data-act="ai-questions"]').disabled,
    ask: document.querySelector('#ai-ask-form button[type="submit"]').disabled,
  }));
  assert.deepEqual(pendingState, {
    source: true,
    count: true,
    consent: true,
    summarize: true,
    questions: true,
    ask: true,
  });
  await page.locator('[data-act="ai-cancel"]').click();
  await page.waitForSelector('.ai-status');
  assert.equal((await page.locator('.ai-status').innerText()).trim(), CANCELLED);
  assert.equal(await page.locator('.ai-status').getAttribute('role'), 'status');
  await page.waitForTimeout(3500); // the delayed reply arrives now and must be ignored
  assert.equal(aiCalls.length, pendingBefore + 1, 'the request had been sent');
  const afterCancel = await page.evaluate(() => ({
    source: document.querySelector('#ai-source').disabled,
    summarize: document.querySelector('[data-act="ai-summarize"]').disabled,
    pending: !!document.querySelector('[data-act="ai-cancel"]'),
    status: document.querySelector('.ai-status')?.textContent.trim(),
  }));
  assert.deepEqual(afterCancel, {
    source: false,
    summarize: false,
    pending: false,
    status: CANCELLED,
  });
  // The previous result stays; no new one appeared from the cancelled request.
  assert.equal(await page.locator('.ai-result h3').innerText(), 'الإجابة');
  step(
    'pending: file/count selectors, consent and task buttons disabled; "إلغاء" → "' +
      CANCELLED +
      '"',
  );

  // 4f. Changing the file cancels consent; free question sends only { task, question }.
  await selectSource('');
  assert.equal(await consentText(), FREE);
  await blocked('ask', 'ما الفرق بين Raster وVector؟');
  await page.check('#ai-cloud-consent');
  body = await run('ask', 'ما الفرق بين Raster وVector؟');
  assert.deepEqual(body, { task: 'ask', question: 'ما الفرق بين Raster وVector؟' });
  step('free question: "' + FREE + '"; body is only { task, question }');

  // 4g. Page-less files: no page range; clipped or complete wording matches body.text.
  await selectSource('lim-txt');
  const txt = await localText('lim-txt');
  assert.ok(txt.text.length > AI_MAX_TEXT && txt.pages === null);
  const txtLine = lineFor(courseTitle, 'long-notes.txt', 'أول 60,000 حرف من نصه');
  assert.equal(await consentText(), txtLine);
  assert.doesNotMatch(txtLine, /الصفحة/);
  await page.check('#ai-cloud-consent');
  body = await run('summarize');
  expectLecture(body, 'summarize', 'long-notes.txt', txt.text.slice(0, AI_MAX_TEXT));
  assert.equal(body.text.length, AI_MAX_TEXT);
  step('page-less, clipped: "' + txtLine + '"');

  await selectSource('lim-md');
  const md = await localText('lim-md');
  const mdLine = lineFor(courseTitle, 'short-notes.md', 'نصه كاملًا');
  assert.equal(await consentText(), mdLine);
  await page.check('#ai-cloud-consent');
  body = await run('questions');
  expectLecture(body, 'questions', 'short-notes.md', md.text);
  assert.ok(md.text.length < AI_MAX_TEXT);
  assert.doesNotMatch(await page.locator('.ai-result').innerText(), /المحاضرة طويلة/);
  step(`page-less, complete: "${mdLine}"; all ${body.text.length} characters sent`);

  // 4h. The selected file disappears (deleted here; a sync would do the same): the selection,
  // the plan and the consent are dropped, and a pending request must stop blocking the UI.
  delayNext = 3000;
  const disappearingBefore = aiCalls.length;
  await TRIGGER.summarize();
  await page.waitForSelector('[data-act="ai-cancel"]');
  await click('[data-tab="lessons"]');
  // The row may sit in a collapsed lecture group; the button exists in the DOM.
  await page.waitForSelector('[data-delete-resource="lim-md"]', { state: 'attached' });
  page.once('dialog', d => d.accept());
  await click('[data-delete-resource="lim-md"]');
  await page.waitForFunction(() => !document.querySelector('[data-delete-resource="lim-md"]'));
  await click('[data-tab="ai"]');
  await page.waitForSelector('#ai-source');
  assert.equal(await page.inputValue('#ai-source'), '');
  assert.equal(await consentText(), FREE);
  assert.equal(await page.isChecked('#ai-cloud-consent'), false, 'consent cancelled');
  assert.equal(await page.isDisabled('#ai-source'), false, 'file selector is enabled');
  assert.equal(await page.isDisabled('#ai-cloud-consent'), false, 'consent is enabled');
  assert.equal(await page.isDisabled('[data-act="ai-summarize"]'), false, 'tasks are enabled');
  assert.equal(await page.locator('[data-act="ai-cancel"]').count(), 0, 'no pending request');
  const missingStatus =
    'أُلغي الطلب لأن الملف المختار لم يعد موجودًا. قد يُحتسب من حصتك اليومية إن كان قد وصل إلى الخادم.';
  assert.equal((await page.locator('.ai-status').innerText()).trim(), missingStatus);
  await page.waitForTimeout(3500); // fake client ignores AbortSignal: late reply must be ignored
  assert.equal(aiCalls.length, disappearingBefore + 1, 'the cancelled request was sent');
  assert.equal(await page.locator('.ai-result h3').innerText(), '1 سؤال مقترح');
  assert.equal((await page.locator('.ai-status').innerText()).trim(), missingStatus);
  step('file disappears during AI request: controls recover immediately; late reply ignored');
  const goneBefore = aiCalls.length;
  await click('[data-act="ai-summarize"]');
  await page.waitForSelector('.ai-studio-main [role="alert"]');
  assert.equal(aiCalls.length, goneBefore, 'summarize without the file sends nothing');
  await page.check('#ai-cloud-consent');
  body = await run('ask', 'سؤال بعد حذف الملف');
  assert.deepEqual(body, { task: 'ask', question: 'سؤال بعد حذف الملف' });
  step('selected file deleted: consent cancelled, back to "' + FREE + '"; no lecture text sent');

  // 4i. Changing the course cancels consent.
  await selectSource('lim-txt');
  await page.check('#ai-cloud-consent');

  // ---- 5. Another course; a 250-page low-text PDF read to page 200, under the AI cap ----
  await click('[data-go="courses"]');
  await page.waitForSelector('[data-course="course-3"]');
  await click('[data-course="course-3"]');
  await page.waitForSelector('[data-tab="ai"]');
  await click('[data-tab="ai"]');
  await page.waitForSelector('#ai-source', { timeout: 20000 });
  assert.equal(await page.inputValue('#ai-source'), '');
  assert.equal(await page.isChecked('#ai-cloud-consent'), false, 'changing course cancels consent');
  assert.equal(await consentText(), FREE);
  step('changing the course cancels consent');
  const course3 = (await page.locator('.course-detail-hero h1').innerText()).trim();
  await selectSource('lim-250');
  const deck = await localText('lim-250');
  assert.ok(deck.text.length < AI_MAX_TEXT, 'under the cap: ' + deck.text.length);
  assert.equal(deck.pages.at(-1).page, 200);
  const deckLine = lineFor(course3, 'deck-250-pages.pdf', 'كل ما قُرئ من نصه: أول 200 صفحة من 250');
  assert.equal(await consentText(), deckLine);
  assert.doesNotMatch(deckLine, /كاملًا/);
  await page.check('#ai-cloud-consent');
  body = await run('summarize');
  assert.equal(body.course, course3);
  assert.equal(body.text, deck.text);
  const deckNote = await page.locator('.ai-result').innerText();
  assert.match(
    deckNote,
    /المحاضرة طويلة: قُرئت أول 200 صفحة من 250 قبل الإرسال، وما بعدها لم يُرسل\./,
  );
  assert.doesNotMatch(deckNote, /60,000/);
  step(`PDF read 200/250: "${deckLine}"; all ${deck.text.length} characters sent`);
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 392);

  assert.deepEqual(realSupabase, [], 'no request reached a real Supabase host');
  assert.deepEqual(errors, []);
  console.log('pdf-limits-browser: ok');
} finally {
  await browser.close();
}
