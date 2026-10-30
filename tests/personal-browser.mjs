// v1.1 personal features end-to-end: a pre-filled semester (as 1.7.0 left it), archive, code notes, two-device sync
// (with a file), and the AI tab. Two browser contexts share one simulated Supabase server
// that lives in this Node process (exposed to the pages as __fakeRemote).
// Run with a local server on 127.0.0.1:8099.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { SUPABASE_JS } from '../js/cloud/config.js';
import { LEGACY_PLAN, LEGACY_TITLES, seedLegacy } from './fixtures/legacy-seed.mjs';

const fake = await readFile(new URL('./fixtures/fake-supabase.mjs', import.meta.url), 'utf8');
const BASE = 'http://127.0.0.1:8099/';
const step = name => console.log('✓', name);

// ---- shared fake server ----
const server = {
  records: new Map(),
  files: new Map(),
  clock: 0,
  aiCalls: [],
  failUpload: new Set(), // storage paths whose upload fails (simulated network/storage error)
  failDownload: new Set(),
  uploads: [], // every path that reached the storage server
  downloads: [],
  failRemove: false,
  ops: [], // order of pulls (select), pushes (upsert) and removes
  removeCalls: [],
};
const realSupabase = []; // any request to the real project fails the test
function remote(op, args) {
  if (op === 'sync') {
    server.ops.push(`${args.mode}:${args.user}`);
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
  if (op === 'upload') {
    server.uploads.push(args.path);
    if (server.failUpload.has(args.path)) throw new Error('simulated upload failure');
    return void server.files.set(args.path, args);
  }
  if (op === 'download') {
    server.downloads.push(args.path);
    if (server.failDownload.has(args.path)) throw new Error('simulated download failure');
    return server.files.get(args.path) || null;
  }
  if (op === 'remove') {
    server.ops.push('remove');
    server.removeCalls.push(args.paths);
    if (server.failRemove) throw new Error('simulated delete failure');
    return args.paths.filter(p => server.files.delete(p));
  }
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
  await context.route(/supabase\.co/, route => {
    realSupabase.push(route.request().url());
    return route.abort();
  });
  await context.exposeFunction('__fakeRemote', remote);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(`${name}: ${e.message}`));
  page.dialogs = [];
  // Accept every dialog, except one whose text matches page.dismissMatch.
  page.on('dialog', d => {
    page.dialogs.push(d.message());
    return page.dismissMatch?.test(d.message()) ? d.dismiss() : d.accept();
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.topbar');
  await page.waitForFunction(() => !document.getElementById('app')?.inert);
  // 2.0.0 no longer pre-fills anything: each device starts from the rows 1.7.0 wrote
  // (sample courses + an invented plan, all defaults with mtime 0).
  await seedLegacy(page, { plan: true });
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

  // ---- 1. pre-filled plan (legacy data) ----
  const courses = await store(phone, s => s.all('courses'));
  const grades = await store(phone, s => s.all('grades'));
  assert.equal(
    courses.find(c => c.id === 'course-2').code,
    LEGACY_PLAN.courses.find(c => c.title === LEGACY_TITLES[1]).code,
  );
  assert.equal(
    grades.reduce((sum, g) => sum + Number(g.hours || 0), 0),
    LEGACY_PLAN.courses.reduce((s, c) => s + c.hours, 0),
  );
  await go(phone, 'grades');
  await phone.waitForSelector('.semester-panel');
  assert.match(
    await phone.locator('.semester-panel').innerText(),
    /الفصل الأول 2030\/2031[\s\S]*17 ساعة[\s\S]*42 ساعة/,
  );
  assert.match(await phone.locator('.grade-card').first().innerText(), /[A-Z]{4} \d{4}/);
  step('legacy plan pre-filled: codes, 17 hours, 42 passed');

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
  assert.equal(onLaptop.code, LEGACY_PLAN.courses.find(c => c.title === LEGACY_TITLES[1]).code);
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
  // The lecture is read on the device first; consent is enabled once what is sent is known.
  await phone.waitForSelector('#ai-cloud-consent:not([disabled])');
  await click(phone, '[data-act="ai-summarize"]');
  await phone.waitForSelector('.ai-panel .notice.warn');
  assert.equal(server.aiCalls.length, 0, 'AI must not receive lecture text without consent');
  await phone.check('#ai-cloud-consent');
  await click(phone, '[data-act="ai-summarize"]');
  await phone.waitForSelector('.ai-result');
  assert.match(await phone.locator('.ai-result').innerText(), /قاعدة البيانات الجغرافية/);
  assert.match(server.aiCalls.at(-1).text, /الفهرس المكاني/, 'lecture text was sent');
  await click(phone, '[data-act="ai-save-note"]');
  // One consent per file: the same tick covers the questions request.
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
  assert.equal(await phone.inputValue('#next-sem'), 'الفصل الثاني 2030/2031');
  await phone.click('#semester-archive-form button[type="submit"]');
  await phone.waitForFunction(() =>
    document.querySelector('.semester-panel h3')?.textContent.includes('الفصل الثاني'),
  );
  assert.equal(await phone.locator('.grade-card').count(), 0, 'archived courses hidden');
  assert.match(
    await phone.locator('.panel', { hasText: 'الفصول السابقة' }).innerText(),
    new RegExp(LEGACY_PLAN.name),
  );
  await click(phone, '.semester-panel [data-action="add-course"]');
  await phone.fill('#course-title', 'موضوعات متقدمة في الإحصاء');
  await phone.fill('#course-code', 'test4401');
  await phone.fill('#course-hours', '3');
  await phone.click('#course-form button[type="submit"]');
  await phone.waitForSelector('.grade-card');
  assert.match(
    await phone.locator('.grade-card').innerText(),
    /TEST 4401[\s\S]*موضوعات متقدمة في الإحصاء/,
  );
  step('semester archived; new course added with code and hours');

  // ---- 6. file problems: too large, upload error, download error (all retried or reported) ----
  const ME_PATH = 'email-mohanad@example.com/';
  const syncAndWait = async (page, text) => {
    await go(page, 'settings');
    await page.waitForSelector('[data-act="sync-now"]:not([disabled])', { timeout: 15000 });
    await page.evaluate(() => document.querySelector('.toast')?.remove());
    await click(page, '[data-act="sync-now"]');
    await page.waitForFunction(
      t => document.querySelector('.toast')?.textContent.includes(t),
      text,
      { timeout: 30000 },
    );
    return page.$$eval('.sync-panel .sync-problems li', li => li.map(l => l.textContent));
  };
  // A 51 MB lecture (over the 50 MB bucket limit) and two normal ones.
  await phone.evaluate(
    `(async () => {
      const v = (await (await fetch('package.json')).json()).version;
      const s = await import('./js/store.js?v=' + v);
      const big = new Blob([new Uint8Array(51 * 1024 * 1024)], { type: 'application/pdf' });
      const base = { kind: 'file', courseId: 'course-4', module: 'المحاضرة 2', completed: false, addedAt: new Date().toISOString() };
      await s.put('resources', { ...base, id: 'big-1', name: 'big.pdf', type: 'application/pdf', hash: 'hb', blob: big });
      await s.put('resources', { ...base, id: 'lec-2', name: 'ok2.txt', type: 'text/plain', hash: 'h2', blob: new Blob(['ملف ثان'], { type: 'text/plain' }) });
      await s.put('resources', { ...base, id: 'lec-3', name: '<b>flaky</b>.txt', type: 'text/plain', hash: 'h3', blob: new Blob(['ملف ثالث'], { type: 'text/plain' }) });
    })()`,
  );
  server.failUpload.add(ME_PATH + 'lec-3');
  let list = await syncAndWait(phone, 'مزامنة غير مكتملة');
  assert.ok(list.includes('«big.pdf» أكبر من 50 MB، بقي على هذا الجهاز فقط'), list.join(' | '));
  assert.ok(
    list.includes('تعذر رفع «<b>flaky</b>.txt»، ستُعاد المحاولة في المزامنة التالية'),
    list.join(' | '),
  );
  assert.equal(await phone.locator('.sync-problems b').count(), 0, 'file names are escaped');
  assert.ok(server.files.has(ME_PATH + 'lec-2'), 'the rest still syncs');
  assert.ok(!server.files.has(ME_PATH + 'lec-3') && !server.files.has(ME_PATH + 'big-1'));
  assert.ok(!server.uploads.includes(ME_PATH + 'big-1'), 'too-large file is not sent');
  const bigRecord = server.records.get('email-mohanad@example.com|resources|big-1');
  assert.equal(bigRecord.data.fileLocalOnly, true, 'record marks the file as kept on one device');
  assert.doesNotMatch(await phone.locator('.toast').innerText(), /تمت المزامنة/);
  step('phone: 51 MB file skipped and named, upload error reported, others uploaded');

  server.failUpload.clear();
  list = await syncAndWait(phone, 'مزامنة غير مكتملة');
  assert.ok(server.files.has(ME_PATH + 'lec-3'), 'failed upload retried on the next sync');
  assert.deepEqual(list, ['«big.pdf» أكبر من 50 MB، بقي على هذا الجهاز فقط']);
  assert.ok(!server.uploads.includes(ME_PATH + 'big-1'), 'too-large file not retried');
  step('phone: failed upload retried and succeeded; too-large file still listed, not resent');

  server.failDownload.add(ME_PATH + 'lec-2');
  list = await syncAndWait(laptop, 'مزامنة غير مكتملة');
  assert.ok(
    list.includes('تعذر تنزيل «ok2.txt»، ستُعاد المحاولة في المزامنة التالية'),
    list.join(' | '),
  );
  assert.ok(
    list.includes('«big.pdf» أكبر من 50 MB، بقي على جهازك الآخر فقط ولم يُنزَّل هنا'),
    list.join(' | '),
  );
  let files = await store(laptop, async s => ({
    two: await (await s.getFile('lec-2'))?.text(),
    three: await (await s.getFile('lec-3'))?.text(),
    big: !!(await s.getFile('big-1')),
  }));
  assert.deepEqual(files, { two: undefined, three: 'ملف ثالث', big: false });
  step('laptop: download error reported, other file downloaded');

  server.failDownload.clear();
  list = await syncAndWait(laptop, 'مزامنة غير مكتملة');
  assert.deepEqual(list, ['«big.pdf» أكبر من 50 MB، بقي على جهازك الآخر فقط ولم يُنزَّل هنا']);
  files = await store(laptop, async s => (await s.getFile('lec-2'))?.text());
  assert.equal(files, 'ملف ثان', 'failed download retried on the next sync');
  step('laptop: failed download retried and succeeded');

  // The big file becomes small again (replaced): it syncs and leaves both lists.
  await store(phone, async s => {
    const row = await s.getRow('resources', 'big-1');
    await s.put('resources', {
      ...row,
      hash: 'hb2',
      blob: new Blob(['نسخة مضغوطة'], { type: 'application/pdf' }),
    });
  });
  await syncAndWait(phone, 'تمت المزامنة');
  assert.ok(server.files.has(ME_PATH + 'big-1'));
  assert.equal(await phone.locator('.sync-problems li').count(), 0);
  await syncAndWait(laptop, 'تمت المزامنة');
  assert.equal(await laptop.locator('.sync-problems li').count(), 0);
  assert.equal(await store(laptop, async s => (await s.getFile('big-1'))?.text()), 'نسخة مضغوطة');
  step('replaced file synced');

  // ---- 7. deleting a lecture removes its bucket object, with retry ----
  const A = 'email-mohanad@example.com';
  const owedOf = async (page, uid = A) =>
    page.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}'), `ucas-owed-${uid}`);
  await store(phone, s => s.remove('resources', 'lec-2'));
  server.failRemove = true;
  list = await syncAndWait(phone, 'مزامنة غير مكتملة');
  assert.deepEqual(list, [
    'تعذر حذف «ok2.txt» من التخزين السحابي، ستُعاد المحاولة في المزامنة التالية',
  ]);
  assert.ok(server.files.has(ME_PATH + 'lec-2'), 'object still there after the failed delete');
  assert.deepEqual(Object.keys((await owedOf(phone)).del), ['lec-2']);
  // The tombstone is pruned (as after 90 days): the pending delete does not depend on it.
  await store(phone, s => s.pruneTombstones(Date.now() + 1000));
  server.failRemove = false;
  list = await syncAndWait(phone, 'تمت المزامنة');
  assert.deepEqual(list, []);
  assert.ok(!server.files.has(ME_PATH + 'lec-2'), 'bucket is empty for that path');
  assert.deepEqual(await owedOf(phone), {});
  assert.deepEqual(server.removeCalls.at(-1), [ME_PATH + 'lec-2'], 'one remove() call');
  step('failed delete reported, kept pending past tombstone pruning, removed on the next sync');

  // A pending delete is cancelled when a live row with the same id comes back (e.g. a restore).
  await store(phone, s => s.remove('resources', 'lec-3'));
  server.failRemove = true;
  await syncAndWait(phone, 'مزامنة غير مكتملة');
  assert.deepEqual(Object.keys((await owedOf(phone)).del), ['lec-3']);
  await store(phone, s =>
    s.put('resources', {
      id: 'lec-3',
      kind: 'file',
      name: 'flaky-restored.txt',
      type: 'text/plain',
      courseId: 'course-4',
      hash: 'h3b',
      blob: new Blob(['نسخة مستعادة'], { type: 'text/plain' }),
      addedAt: new Date().toISOString(),
      completed: false,
    }),
  );
  server.failRemove = false;
  let removesBefore = server.removeCalls.length;
  list = await syncAndWait(phone, 'تمت المزامنة');
  assert.deepEqual(list, []);
  assert.deepEqual(await owedOf(phone), {});
  assert.ok(
    !server.removeCalls.slice(removesBefore).some(c => c.includes(ME_PATH + 'lec-3')),
    'the re-created file is never removed',
  );
  assert.equal(Buffer.from(server.files.get(ME_PATH + 'lec-3').bytes).toString(), 'نسخة مستعادة');
  step('pending delete cancelled when the same id is live again; new file kept');

  // ---- 8. crafted record ids never become Storage paths ----
  for (const rid of ['../x', 'a/b']) {
    server.clock++;
    server.records.set(`${A}|resources|${rid}`, {
      user_id: A,
      store: 'resources',
      rid,
      data: { id: rid, kind: 'file', name: 'evil.pdf', hasFile: true, courseId: 'course-4' },
      mtime: Date.now(),
      deleted: false,
      updated_at: new Date(Date.UTC(2026, 0, 1) + server.clock).toISOString(),
    });
  }
  const downloadsBefore = server.downloads.length;
  await syncAndWait(laptop, 'تمت المزامنة');
  assert.ok(
    !server.downloads.slice(downloadsBefore).some(p => p.includes('..') || p.endsWith('a/b')),
    server.downloads.join(', '),
  );
  assert.deepEqual(
    await store(laptop, async s => [
      !!(await s.getRow('resources', '../x')),
      !!(await s.getRow('resources', 'a/b')),
    ]),
    [false, false],
  );
  step('records with ids like "../x" and "a/b" ignored');

  // ---- 9. sign out and in again: nothing lost, duplicated, resurrected or re-uploaded ----
  // A file that starts on the laptop (so a re-upload would be visible).
  await store(laptop, s =>
    s.put('resources', {
      id: 'lap-1',
      kind: 'file',
      name: 'laptop-notes.txt',
      type: 'text/plain',
      courseId: 'course-4',
      hash: 'hl1',
      blob: new Blob(['من اللابتوب'], { type: 'text/plain' }),
      addedAt: new Date().toISOString(),
      completed: false,
    }),
  );
  await syncAndWait(laptop, 'تمت المزامنة');
  assert.ok(server.files.has(ME_PATH + 'lap-1'));
  // Delete a synced lecture while Storage keeps failing, then sign out anyway.
  await store(laptop, s => s.remove('resources', 'big-1'));
  server.failRemove = true;
  list = await syncAndWait(laptop, 'مزامنة غير مكتملة');
  assert.deepEqual(list, [
    'تعذر حذف «big.pdf» من التخزين السحابي، ستُعاد المحاولة في المزامنة التالية',
  ]);
  assert.equal(server.records.get(`${A}|resources|big-1`).deleted, true);
  const snapshot = page =>
    store(page, async s => {
      const out = {};
      for (const name of s.syncedStores)
        out[name] = (await s.all(name)).map(r => String(r.id)).sort();
      return out;
    });
  const before = await snapshot(laptop);
  const aRecords = () => [...server.records.keys()].filter(k => k.startsWith(A + '|')).sort();
  const recordsBefore = aRecords();

  laptop.dismissMatch = /لم يُحذف من السحابة/;
  await go(laptop, 'settings');
  await click(laptop, '[data-act="sync-signout"]');
  await laptop.waitForFunction(() =>
    document.querySelector('.toast')?.textContent.includes('لم يُحذف من السحابة'),
  );
  assert.match(laptop.dialogs.at(-1), /^يوجد ملف واحد محذوف لم يُحذف من السحابة بعد\./);
  assert.match(await laptop.locator('.sync-panel').innerText(), /متصل/, 'stayed signed in');
  laptop.dismissMatch = null;
  await click(laptop, '[data-act="sync-signout"]');
  await laptop.waitForSelector('#sync-email-form');
  assert.match(laptop.dialogs.at(-1), /^يوجد ملف واحد محذوف/);
  const afterOut = await laptop.evaluate(() => ({
    meta: Object.keys(localStorage).filter(k => k.startsWith('ucas-sync-')),
    owed: localStorage.getItem('ucas-owed-email-mohanad@example.com'),
  }));
  assert.deepEqual(afterOut.meta, [], 'sync meta cleared at sign-out');
  assert.deepEqual(JSON.parse(afterOut.owed), { del: { 'big-1': { name: '' } }, up: {} });
  assert.deepEqual(await snapshot(laptop), before, 'local study data untouched by sign-out');
  step('sign-out warns "يوجد ملف واحد محذوف…", can stay; signing out keeps only the owed delete');

  // A different account on the same laptop never receives the first account's deletions.
  server.failRemove = false;
  const B = 'email-other@example.com';
  const removesBeforeB = server.removeCalls.length;
  await signIn(laptop, 'other@example.com');
  await syncAndWait(laptop, 'تمت المزامنة');
  const removedForB = server.removeCalls.slice(removesBeforeB).flat();
  assert.ok(!removedForB.some(p => !p.startsWith(B + '/')), 'no remove outside the account');
  assert.ok(!removedForB.includes(`${B}/big-1`), "first account's delete not run for the second");
  assert.ok(
    ![...server.records.values()].some(r => r.user_id === B && r.deleted),
    "first account's tombstones not pushed to the second",
  );
  assert.ok(server.files.has(ME_PATH + 'big-1'), 'still owed by the first account only');
  assert.deepEqual(Object.keys((await owedOf(laptop)).del), ['big-1']);
  await go(laptop, 'settings');
  await click(laptop, '[data-act="sync-signout"]');
  await laptop.waitForSelector('#sync-email-form');
  step("a different account signs in: the first account's deletions are not applied to it");

  // Same account again: the owed delete runs first, nothing comes back or is uploaded again.
  const opsBefore = server.ops.length;
  const uploadsBefore = server.uploads.length;
  removesBefore = server.removeCalls.length;
  await signIn(laptop, 'mohanad@example.com');
  await syncAndWait(laptop, 'تمت المزامنة');
  const ops = server.ops.slice(opsBefore);
  assert.ok(ops.includes('remove'), ops.join(','));
  assert.ok(ops.indexOf('remove') < ops.indexOf(`select:${A}`), `delete before pull: ${ops}`);
  assert.deepEqual(server.removeCalls[removesBefore], [ME_PATH + 'big-1']);
  assert.ok(!server.files.has(ME_PATH + 'big-1'), 'deleted file gone from the cloud');
  assert.deepEqual(await owedOf(laptop), {});
  assert.deepEqual(
    server.uploads.slice(uploadsBefore).filter(p => p.startsWith(ME_PATH)),
    [],
    'files already in the cloud are not uploaded again',
  );
  assert.deepEqual(await snapshot(laptop), before, 'no duplicates, nothing resurrected');
  assert.equal(await store(laptop, s => s.getRow('resources', 'big-1')), undefined);
  assert.deepEqual(aRecords(), recordsBefore, 'no new or duplicate records');
  assert.equal(await store(laptop, async s => (await s.getFile('lap-1'))?.text()), 'من اللابتوب');
  step('same account again: owed delete ran before the pull; no duplicate, return or re-upload');

  assert.deepEqual(realSupabase, [], 'no request reached the real Supabase project');
  step('no request to the real supabase.co');

  const errors = [...phone.errors, ...laptop.errors];
  assert.deepEqual(errors, []);
  console.log('personal-browser: ok');
} finally {
  await browser.close();
}
