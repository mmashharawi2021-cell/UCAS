// v1.1 personal features end-to-end: semester pre-fill, archive, code notes, two-device sync
// (with a file), and the AI tab. Two browser contexts share one simulated Supabase server
// that lives in this Node process (exposed to the pages as __fakeRemote).
// Run with a local server on 127.0.0.1:8099.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { SUPABASE_JS } from '../js/cloud/config.js';

const fake = await readFile(new URL('./fixtures/fake-supabase.mjs', import.meta.url), 'utf8');
const BASE = 'http://127.0.0.1:8099/';
const step = name => console.log('✓', name);

// ---- shared fake server ----
const server = { records: new Map(), files: new Map(), clock: 0, aiCalls: [] };
function remote(op, args) {
  if (op === 'sync') {
    const { mode, rows, gt, limit, user } = args;
    if (!user || user.startsWith('1111'))
      throw new Error('row-level security: email account required');
    if (mode === 'upsert') {
      for (const r of rows) {
        const key = `${user}|${r.store}|${r.rid}`;
        server.clock++;
        server.records.set(key, {
          ...r,
          user_id: user,
          updated_at: new Date(Date.UTC(2026, 0, 1) + server.clock).toISOString(),
        });
      }
      return { data: null, error: null };
    }
    const list = [...server.records.values()]
      .filter(r => r.user_id === user && (!gt || r.updated_at > gt))
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
      .slice(0, limit || 1000);
    return { data: list, error: null };
  }
  if (op === 'upload') return void server.files.set(args.path, args);
  if (op === 'download') return server.files.get(args.path) || null;
  if (op === 'remove') return void args.paths.forEach(p => server.files.delete(p));
  if (op === 'invoke') {
    server.aiCalls.push(args.body);
    if (!args.user?.email) return { error: 'email account required' };
    if (args.body.task === 'summarize')
      return {
        text: '- **قاعدة البيانات الجغرافية**: تخزن البيانات المكانية\n==المفتاح الأساسي مهم==',
        left: 59,
      };
    if (args.body.task === 'questions')
      return {
        questions: [
          {
            question: 'ما وظيفة المفتاح الأساسي؟',
            choices: ['تعريف السجل', 'رسم الخريطة', 'الطباعة', 'لا شيء'],
            answer: 0,
            why: 'يعرّف كل سجل',
          },
          {
            question: 'ما نوع بيانات الطبقة النقطية؟',
            choices: ['Vector', 'Raster'],
            answer: 0,
            why: '',
          },
        ],
        left: 58,
      };
    return { text: 'الإسقاط الخرائطي (Map Projection) هو تحويل سطح الأرض إلى مستوى.', left: 57 };
  }
  throw new Error('unknown op ' + op);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});

async function device(name) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    reducedMotion: 'reduce',
  });
  await context.route(SUPABASE_JS, route =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: fake }),
  );
  await context.exposeFunction('__fakeRemote', remote);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(`${name}: ${e.message}`));
  page.on('dialog', d => d.accept());
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.premium-hero');
  return page;
}
const click = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
const go = (page, id) => click(page, `[data-go="${id}"]`);
// Runs `fn(storeModule, arg)` in the page (Playwright's evaluation is not subject to the CSP).
const store = (page, fn, arg) =>
  page.evaluate(
    `(async () => {
      const v = (await (await fetch('package.json')).json()).version;
      const s = await import('./js/store.js?v=' + v);
      return (${fn.toString()})(s, ${JSON.stringify(arg ?? null)});
    })()`,
  );

async function signIn(page, email) {
  await go(page, 'settings');
  await page.waitForSelector('#sync-email-form');
  await page.fill('#sync-email-form input[name="email"]', email);
  await page.click('#sync-email-form button[type="submit"]');
  await page.waitForSelector('.sync-panel .notice');
  const link = await page.evaluate(() => globalThis.__fakeLastLink);
  // An email link opens a fresh page load (not an in-page hash change).
  await page.goto('about:blank');
  await page.goto(link, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.querySelector('.sync-panel')?.textContent.includes('متصل') || !location.hash,
    null,
    {
      timeout: 15000,
    },
  );
  await go(page, 'settings');
  await page.waitForFunction(
    () => document.querySelector('.sync-panel')?.textContent.includes('متصل'),
    null,
    { timeout: 15000 },
  );
}

try {
  const phone = await device('phone');

  // ---- 1. pre-filled plan ----
  await page_wait(phone);
  const courses = await store(phone, s => s.all('courses'));
  const grades = await store(phone, s => s.all('grades'));
  assert.equal(courses.find(c => c.id === 'course-2').code, 'GISS 2307');
  assert.equal(
    grades.reduce((sum, g) => sum + Number(g.hours || 0), 0),
    19,
  );
  await go(phone, 'grades');
  await phone.waitForSelector('.semester-panel');
  assert.match(
    await phone.locator('.semester-panel').innerText(),
    /الفصل الأول 2026\/2027[\s\S]*19 ساعة[\s\S]*55 ساعة/,
  );
  assert.match(await phone.locator('.grade-card').first().innerText(), /[A-Z]{4} \d{4}/);
  step('Fall 2026/2027 pre-filled: codes, 19 hours, 55 passed');

  // ---- 2. code notes ----
  await go(phone, 'courses');
  await click(phone, '[data-course="course-7"]');
  await click(phone, '[data-tab="notes"]');
  await click(phone, '[data-act="note-add"]');
  await phone.fill('#note-title', 'حلقة for');
  await phone.fill(
    '#note-body',
    'مثال:\n```python\nfor i in range(3):\n    print("<b>", i)  # loop\n```\nانتهى',
  );
  await phone.click('#note-form button[type="submit"]');
  await phone.waitForSelector('.code-block');
  const codeHTML = await phone.locator('.code-block code').innerHTML();
  assert.match(codeHTML, /tok-k">for</);
  assert.match(codeHTML, /tok-c"># loop</);
  assert.ok(!codeHTML.includes('<b>'));
  step('code note highlighted and escaped');

  // ---- 3. sync: phone signs in, adds a file + task, laptop receives them ----
  await store(phone, s =>
    s.put('resources', {
      id: 'lec-1',
      kind: 'file',
      name: 'lecture1.txt',
      type: 'text/plain',
      courseId: 'course-2',
      module: 'المحاضرة 1',
      hash: 'h1',
      blob: new Blob(['الفهرس المكاني يسرّع الاستعلام'], { type: 'text/plain' }),
      addedAt: new Date().toISOString(),
      completed: false,
    }),
  );
  await store(phone, s =>
    s.put('tasks', {
      id: 'task-1',
      title: 'تقرير الاستشعار',
      courseId: 'course-4',
      due: '2027-01-10T10:00',
      done: false,
    }),
  );
  await signIn(phone, 'mohanad@example.com');
  await click(phone, '[data-act="sync-now"]');
  await phone.waitForFunction(
    () => document.querySelector('.toast')?.textContent.includes('تمت المزامنة'),
    null,
    { timeout: 15000 },
  );
  // Only real changes are uploaded; pre-filled defaults (mtime 0) stay local on each device.
  const keys = [...server.records.keys()].map(k => k.split('|').slice(1).join(':'));
  assert.ok(keys.includes('tasks:task-1') && keys.includes('resources:lec-1'), keys.join(', '));
  assert.ok(!keys.includes('courses:course-2'), 'untouched defaults are not uploaded');
  assert.ok(server.files.has('email-mohanad@example.com/lec-1'), 'file uploaded');
  step(`phone synced up (${server.records.size} records + 1 file)`);

  const laptop = await device('laptop');
  await signIn(laptop, 'mohanad@example.com');
  await laptop.waitForFunction(
    async () => {
      const v = JSON.parse(await (await fetch('package.json')).text()).version;
      const s = await import(`./js/store.js?v=${v}`);
      return !!(await s.getRow('tasks', 'task-1'));
    },
    null,
    { timeout: 15000 },
  );
  const onLaptop = await store(laptop, async s => ({
    task: await s.getRow('tasks', 'task-1'),
    file: await (await s.getFile('lec-1'))?.text(),
    note: (await s.all('notes')).find(n => n.title === 'حلقة for')?.title,
    code: (await s.getRow('courses', 'course-2')).code,
  }));
  assert.equal(onLaptop.task.title, 'تقرير الاستشعار');
  assert.equal(onLaptop.file, 'الفهرس المكاني يسرّع الاستعلام');
  assert.equal(onLaptop.note, 'حلقة for');
  assert.equal(onLaptop.code, 'GISS 2307');
  step('laptop received task, note and lecture file');

  // Laptop edits + deletes; phone gets both. Last write wins.
  await store(laptop, async s => {
    const t = await s.getRow('tasks', 'task-1');
    await s.put('tasks', { ...t, done: true });
    await s.remove('notes', (await s.all('notes')).find(n => n.title === 'حلقة for').id);
  });
  await go(laptop, 'settings');
  await click(laptop, '[data-act="sync-now"]');
  await laptop.waitForFunction(
    () => document.querySelector('.toast')?.textContent.includes('تمت المزامنة'),
    null,
    { timeout: 15000 },
  );
  await go(phone, 'settings');
  await click(phone, '[data-act="sync-now"]');
  await phone.waitForFunction(
    () => document.querySelector('.toast')?.textContent.includes('تمت المزامنة'),
    null,
    { timeout: 15000 },
  );
  const onPhone = await store(phone, async s => ({
    done: (await s.getRow('tasks', 'task-1')).done,
    note: (await s.all('notes')).some(n => n.title === 'حلقة for'),
  }));
  assert.equal(onPhone.done, true);
  assert.equal(onPhone.note, false);
  step('edit and delete on laptop reached the phone');

  // ---- 4. AI tab ----
  await go(phone, 'courses');
  await click(phone, '[data-course="course-2"]');
  await click(phone, '[data-tab="ai"]');
  await phone.waitForSelector('#ai-source');
  assert.ok(await phone.locator('.ai-studio-layout').count());
  await phone.selectOption('#ai-source', 'lec-1');
  await click(phone, '[data-act="ai-summarize"]');
  await phone.waitForSelector('.ai-panel .notice.warn');
  assert.equal(server.aiCalls.length, 0, 'AI must not receive lecture text without consent');
  await phone.check('#ai-cloud-consent');
  await click(phone, '[data-act="ai-summarize"]');
  await phone.waitForSelector('.ai-result');
  assert.match(await phone.locator('.ai-result').innerText(), /قاعدة البيانات الجغرافية/);
  assert.match(server.aiCalls.at(-1).text, /الفهرس المكاني/, 'lecture text was sent');
  await click(phone, '[data-act="ai-save-note"]');
  await click(phone, '[data-act="ai-questions"]');
  await phone.waitForSelector('.ai-question');
  await click(phone, '[data-act="ai-save-questions"]');
  await phone.waitForFunction(
    () => document.querySelector('.toast')?.textContent.includes('أُضيف 2'),
    null,
    { timeout: 10000 },
  );
  const saved = await store(phone, async s => ({
    notes: (await s.all('notes')).filter(n => n.title.startsWith('ملخص')).length,
    bank: (await s.getRow('settings', 'question-bank')).value.filter(q => q.courseId === 'course-2')
      .length,
  }));
  assert.equal(saved.notes, 1);
  assert.equal(saved.bank, 2);
  step('AI: summary saved as note, questions added to bank');

  // ---- 5. archive semester ----
  await go(phone, 'grades');
  await phone.waitForSelector('[data-act="semester-archive"]');
  await click(phone, '[data-act="semester-archive"]');
  await phone.waitForSelector('#semester-archive-form');
  assert.equal(await phone.inputValue('#next-sem'), 'الفصل الثاني 2026/2027');
  await phone.click('#semester-archive-form button[type="submit"]');
  await phone.waitForFunction(() =>
    document.querySelector('.semester-panel h3')?.textContent.includes('الفصل الثاني'),
  );
  assert.equal(await phone.locator('.grade-card').count(), 0, 'archived courses hidden');
  assert.match(
    await phone.locator('.panel', { hasText: 'الفصول السابقة' }).innerText(),
    /الفصل الأول 2026\/2027/,
  );
  await click(phone, '.semester-panel [data-action="add-course"]');
  await phone.fill('#course-title', 'تحليل مكاني متقدم');
  await phone.fill('#course-code', 'giss3401');
  await phone.fill('#course-hours', '3');
  await phone.click('#course-form button[type="submit"]');
  await phone.waitForSelector('.grade-card');
  assert.match(await phone.locator('.grade-card').innerText(), /GISS 3401[\s\S]*تحليل مكاني متقدم/);
  step('semester archived; new course added with code and hours');

  const errors = [...phone.errors, ...laptop.errors];
  assert.deepEqual(errors, []);
  console.log('personal-browser: ok');
} finally {
  await browser.close();
}

async function page_wait(page) {
  // The plan is seeded right after start; give it a moment.
  await page.waitForFunction(
    async () => {
      const v = JSON.parse(await (await fetch('package.json')).text()).version;
      const s = await import(`./js/store.js?v=${v}`);
      return !!(await s.getRow('settings', 'seed-ucas-fall-2026'));
    },
    null,
    { timeout: 10000 },
  );
}
