// End-to-end test of the v0.9 student features through the real UI.
// Run with a local server on 127.0.0.1:8099.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const step = name => console.log('✓', name);

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  const go = async id => {
    await page.evaluate(id => document.querySelector(`[data-go="${id}"]`).click(), id);
    await page.waitForTimeout(150);
  };
  const click = sel => page.evaluate(s => document.querySelector(s).click(), sel);
  const noOverflow = async label => {
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 392, `horizontal overflow on ${label}: ${w}px`);
  };

  await page.goto('http://127.0.0.1:8099/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.home-widgets');
  step('home widgets render');

  // ---- Phase 1: timetable ----
  await go('schedule');
  await click('[data-act="slot-add"]');
  await page.selectOption('#slot-course', 'course-2');
  const today = await page.evaluate(() => new Date().getDay());
  await page.selectOption('#slot-day', String(today));
  await page.fill('#slot-start', '23:00');
  await page.fill('#slot-end', '23:50');
  await page.fill('#slot-room', 'B204');
  await page.click('#slot-form button[type="submit"]');
  await page.waitForSelector('.slot-card');
  assert.match(
    await page.locator('.day-column.is-today').innerText(),
    /بناء قواعد البيانات الجغرافية/,
  );
  await noOverflow('schedule');
  step('timetable: add lecture, shown on today');

  // ---- Phase 1: notes ----
  await go('courses');
  await click('[data-course="course-2"]');
  await page.waitForSelector('[data-tab="notes"]');
  await click('[data-tab="notes"]');
  await click('[data-act="note-add"]');
  await page.fill('#note-title', 'ملخص المحاضرة 1');
  await page.fill(
    '#note-body',
    '- **المفتاح الأساسي**: حقل فريد\n==مهم للامتحان==\n<img src=x onerror=alert(1)>',
  );
  await page.check('input[name="color"][value="yellow"]', { force: true });
  await page.click('#note-form button[type="submit"]');
  await page.waitForSelector('.note-card.note-yellow');
  const noteHTML = await page.locator('.note-body').innerHTML();
  assert.match(noteHTML, /<strong>المفتاح الأساسي<\/strong>/);
  assert.match(noteHTML, /<mark>مهم للامتحان<\/mark>/);
  assert.ok(!noteHTML.includes('<img'), 'note HTML must be escaped');
  await noOverflow('notes');
  step('notes: formatting + highlight, HTML escaped');

  // ---- Phase 1: focus timer ----
  await go('focus');
  await page.selectOption('#focus-course', 'course-2');
  await click('[data-act="focus-start"]');
  await page.waitForSelector('[data-act="focus-pause"]');
  // Pretend 3 minutes have passed, then stop: the session must be recorded.
  await page.evaluate(async () => {
    const { get, put } = await import('./js/store.js');
    const row = await get('settings', 'focus-timer');
    row.value.startedAt -= 180000;
    row.value.endsAt -= 180000;
    await put('settings', row);
  });
  await page.reload();
  await page.waitForSelector('.topbar');
  await go('focus');
  await click('[data-act="focus-stop"]');
  await page.waitForFunction(() => document.querySelector('.focus-clock')?.textContent === '25:00');
  const sessions = await page.evaluate(async () => (await import('./js/store.js')).all('sessions'));
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].courseId, 'course-2');
  assert.ok(sessions[0].minutes >= 3);
  step('focus timer: survives reload, stop records session');

  // ---- Phase 2: exam dates ----
  await go('exams');
  await click('[data-act="exam-add"]');
  await page.selectOption('#exam-course', 'course-2');
  await page.fill('#exam-title', 'الامتحان النصفي');
  const inTwoDays = await page.evaluate(() => {
    const d = new Date(Date.now() + 2 * 86400000 - 3600000);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  });
  await page.fill('#exam-date', inTwoDays);
  await page.click('#exam-form button[type="submit"]');
  await page.waitForSelector('.exam-card.urgency-urgent');
  step('exam date with urgent countdown');

  // ---- Phase 2: question import ----
  await page.evaluate(() => document.querySelector('[data-tab-id="bank"]').click());
  await page.selectOption('#bank-course', 'course-2');
  await page.fill(
    '#bank-text',
    `س: ما هو المفتاح الأساسي؟\nأ) حقل فريد\nب) جدول\nج) فهرس\nد) نوع\nالإجابة: أ\n\nس: ما امتداد ملفات الشيب؟\nأ) shp\nب) docx\nالإجابة: أ\n\nس: سؤال ناقص\nأ) واحد`,
  );
  await page.click('#bank-import-form button[type="submit"]');
  await page.waitForSelector('.import-preview');
  assert.match(await page.locator('.import-preview h3').innerText(), /2 سؤال صالح/);
  await click('[data-act="bank-import-confirm"]');
  await page.waitForFunction(async () => {
    const s = await (await import('./js/store.js')).get('settings', 'question-bank');
    return s?.value?.length === 2;
  });
  step('question import: 2 valid, 1 reported');

  // ---- Phase 2: timed mock exam → wrong answers enter review ----
  await page.evaluate(() => document.querySelector('[data-tab-id="mock"]').click());
  await page.selectOption('#mock-course', 'course-2');
  await page.fill('#mock-count', '2');
  await page.fill('#mock-minutes', '5');
  await page.click('#mock-setup-form button[type="submit"]');
  await page.waitForSelector('.mock-question');
  assert.match(await page.locator('[data-exam-clock]').innerText(), /0[45]:\d\d/);
  // Deliberately answer every question wrongly.
  const exam = await page.evaluate(
    async () => (await (await import('./js/store.js')).get('settings', 'mock-exam')).value,
  );
  const count = exam.questions.length;
  for (let i = 0; i < count; i++) {
    const wrong = exam.questions[i].answer === 0 ? 1 : 0;
    await page.check(`input[name="q${i}"][value="${wrong}"]`);
  }
  await page.click('#mock-exam-form button[type="submit"]');
  await page.waitForSelector('.result-score');
  assert.equal(await page.locator('.result-score').innerText(), `0 / ${count}`);
  step('mock exam: timer, submit, score');

  await click('[data-act="exams-tab"][data-tab-id="review"]');
  await page.waitForSelector('[data-act="review-start"]');
  await click('[data-act="review-start"][data-course=""]');
  await page.waitForSelector('.review-choice');
  const first = await page.evaluate(async () => {
    const all = await (await import('./js/store.js')).all('reviews');
    const text = document.querySelector('.quiz-question').textContent;
    return all.find(r => r.q.question === text).q.answer;
  });
  await click(`.review-choice[data-choice="${first}"]`);
  await page.waitForSelector('.review-choice.is-right');
  const record = await page.evaluate(async () => (await import('./js/store.js')).all('reviews'));
  assert.equal(record.length, count);
  assert.ok(
    record.some(r => r.box === 1),
    'a correct review answer moves to box 1',
  );
  await noOverflow('exams');
  step('smart review: wrong answers queued, correct answer advances');

  // ---- Phase 3: grades ----
  await go('grades');
  const setField = async (sel, value) => {
    await page.fill(sel, value);
    await page.dispatchEvent(sel, 'change');
    await page.waitForTimeout(80);
  };
  await setField('[data-card="course-2"] [data-field="hours"]', '3');
  await setField('[data-card="course-2"] [data-field="score"][data-index="0"]', '18');
  await setField('[data-card="course-2"] [data-field="score"][data-index="1"]', '27');
  await setField('[data-card="course-2"] [data-field="target"]', '85');
  assert.match(await page.locator('[data-card="course-2"]').innerText(), /تحتاج 80%/);
  await setField('[data-card="course-2"] [data-field="score"][data-index="2"]', '45');
  assert.match(await page.locator('#gpa-summary').innerText(), /90/);
  assert.match(await page.locator('#gpa-summary').innerText(), /ممتاز/);
  await noOverflow('grades');
  step('grades: needed-for-target and semester average');

  // ---- Phase 3: weekly report ----
  await go('report');
  const report = await page.locator('.stats-grid').innerText();
  assert.match(report, /3 د|4 د/);
  step('weekly report reflects study time');

  // ---- Phase 4: course pack export & import ----
  await go('courses');
  await click('[data-course="course-2"]');
  await click('[data-act="pack-open"]');
  await page.waitForSelector('#pack-export-form');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#pack-export-form button[type="submit"]'),
  ]);
  const packText = await readFile(await download.path(), 'utf8');
  const pack = JSON.parse(packText);
  assert.equal(pack.format, 'ucas-course-pack');
  assert.equal(pack.notes.length, 1);
  assert.equal(pack.questions.length, 2);
  assert.ok(!packText.includes('attempts') && !packText.includes('grades'));
  // Import into another course.
  await page.evaluate(() => document.querySelector('.modal-backdrop')?.remove());
  await go('courses');
  await click('[data-course="course-3"]');
  await click('[data-act="pack-open"]');
  await page.setInputFiles('[data-act-change="pack-file"]', {
    name: 'x.ucaspack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(packText),
  });
  await page.waitForSelector('[data-act="pack-import"]');
  await click('[data-act="pack-import"]');
  await page.waitForFunction(async () => {
    const notes = await (await import('./js/store.js')).all('notes');
    return notes.filter(n => n.courseId === 'course-3').length === 1;
  });
  step('course pack: export (no private data) and import');

  // ---- Phase 5: calendar export ----
  await go('settings');
  await click('[data-act="calendar-export"]');
  await page.fill('#cal-until', '2027-01-31');
  const [ics] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#calendar-export-form button[type="submit"]'),
  ]);
  const icsText = await readFile(await ics.path(), 'utf8');
  assert.match(icsText, /BEGIN:VCALENDAR/);
  assert.match(icsText, /SUMMARY:امتحان: الامتحان النصفي/);
  assert.match(icsText, /RRULE:FREQ=WEEKLY/);
  assert.match(icsText, /BEGIN:VALARM/);
  step('calendar export with alarms and weekly lectures');

  // ---- Backup includes new stores; old-format backup still restores ----
  const backup = await page.evaluate(async () => {
    const s = await import('./js/store.js');
    const data = await s.backup();
    const counts = Object.fromEntries(
      ['schedule', 'notes', 'sessions', 'exams', 'grades', 'reviews'].map(k => [
        k,
        data.stores[k].length,
      ]),
    );
    const legacy = structuredClone(data);
    for (const k of ['schedule', 'notes', 'sessions', 'exams', 'grades', 'reviews'])
      delete legacy.stores[k];
    await s.restore(legacy);
    return { counts, afterLegacy: (await s.all('notes')).length };
  });
  assert.ok(
    Object.values(backup.counts).every(n => n > 0),
    JSON.stringify(backup.counts),
  );
  assert.equal(backup.afterLegacy, 0);
  step('backup includes study data; v0.8 backups still restore');

  // ---- Home widgets reflect data ----
  await page.reload();
  await page.waitForSelector('.home-widgets');
  const home = await page.locator('.home-widgets').innerText();
  assert.match(home, /محاضرات اليوم/);
  await noOverflow('home');
  step('home widgets');

  assert.deepEqual(errors, []);
  console.log('features-browser: ok');
} finally {
  await browser.close();
}
