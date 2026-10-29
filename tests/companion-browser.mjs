import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 850 } });
  await page.goto('http://127.0.0.1:8099/');
  await page.waitForSelector('.premium-hero');
  await page.evaluate(() => {
    window.addEventListener('message', event => {
      if (event.source !== window || event.data?.source !== 'UCAS_COMPANION_WEB') return;
      if (!['SCAN', 'LAST', 'AUTO'].includes(event.data.type)) return;
      const snapshot = {
        version: 1,
        at: new Date().toISOString(),
        courses: [
          {
            id: '821',
            title: 'ادارة مشاريع نظم المعلومات الجغرافية - محاضر',
            code: 'GISS 4301',
            url: 'https://moodle.ucas.edu.ps/course/view.php?id=821',
            activities: [
              {
                id: '98',
                type: 'resource',
                title: 'خطة مساق GIS',
                section: 'الأسبوع الأول',
                url: 'https://moodle.ucas.edu.ps/mod/resource/view.php?id=98',
              },
              {
                id: '99',
                type: 'assign',
                title: 'واجب الأسبوع الثاني',
                section: 'الأسبوع الثاني',
                url: 'https://moodle.ucas.edu.ps/mod/assign/view.php?id=99',
              },
            ],
          },
        ],
        failures: [],
      };
      window.postMessage(
        {
          source: 'UCAS_COMPANION_EXTENSION',
          requestId: event.data.requestId,
          result: { ok: true, snapshot, enabled: false },
        },
        location.origin,
      );
    });
  });
  await page.evaluate(() => document.querySelector('[data-go="moodle"]').click());
  await page.waitForSelector('[data-action="companion-scan"]');
  await page.locator('[data-action="companion-scan"]').click();
  await page.waitForFunction(
    () => document.querySelector('.moodle-companion-panel')?.textContent.includes('استيراد 2 نشاط'),
    null,
    { timeout: 15000 },
  );
  const results = await page.evaluate(async () => {
    const s = await import('./js/store.js?v=1.7.0');
    const resources = await s.all('resources');
    const tasks = await s.all('tasks');
    const courses = await s.all('courses');
    return {
      resources: resources.filter(r => r.origin === 'moodle-companion'),
      tasks: tasks.filter(t => t.origin === 'moodle-companion'),
      courses: courses.filter(c => c.moodleId === '821'),
    };
  });
  assert.equal(results.resources.length, 2);
  assert.equal(results.tasks.length, 1);
  assert.equal(results.tasks[0].due, '');
  assert.equal(results.courses.length, 1);
  assert.ok(results.resources.every(r => !r.url.includes('sesskey')));
  await page.locator('[data-action="companion-scan"]').click();
  await page.waitForFunction(
    () => document.querySelector('.moodle-companion-panel')?.textContent.includes('استيراد 0 نشاط'),
    null,
    { timeout: 15000 },
  );

  // Simulate a controlled extension (0.3) that returns a file catalog with a per-course report,
  // a tiny authorized TXT file, and a PDF whose download first fails with an expired session.
  // No live university network, session cookie or protected file is needed for this test.
  await page.evaluate(() => {
    const files = [
      {
        id: '12345678-1234-4123-8123-123456789012',
        courseId: '821',
        courseTitle: 'ادارة مشاريع نظم المعلومات الجغرافية',
        name: 'intro.txt',
        module: 'الأسبوع الأول',
        sourceKey: 'a'.repeat(64),
        bytes: 'hello',
        mime: 'text/plain',
      },
      {
        id: '32345678-1234-4123-8123-123456789012',
        courseId: '821',
        courseTitle: 'ادارة مشاريع نظم المعلومات الجغرافية',
        name: 'Lecture recording.mp4',
        module: 'الأسبوع الأول',
        sourceKey: 'c'.repeat(64),
        tooLarge: 'https://moodle.ucas.edu.ps/mod/resource/view.php?id=55',
      },
      {
        id: '22345678-1234-4123-8123-123456789012',
        courseId: '821',
        courseTitle: 'ادارة مشاريع نظم المعلومات الجغرافية',
        name: 'broken.pdf',
        module: 'الأسبوع الثاني',
        sourceKey: 'b'.repeat(64),
        bytes: 'abc',
        // A hostile or buggy extension claims markup; UCAS must store the extension's type.
        mime: 'image/svg+xml',
      },
    ];
    const report = [
      { courseId: '821', courseTitle: 'GIS', files: 2, activities: { resource: 2 } },
      {
        courseId: '900',
        courseTitle: 'مساق بلا ملفات',
        files: 0,
        activities: { url: 2, forum: 1 },
      },
    ];
    window.addEventListener('message', event => {
      if (event.source !== window || event.data?.source !== 'UCAS_COMPANION_WEB') return;
      const d = event.data;
      const file = files.find(f => f.id === d.fileId);
      let result;
      if (d.type === 'FILE_SCAN' || d.type === 'FILE_LIST')
        result = {
          ok: true,
          version: '0.3.0',
          files: files.map(({ bytes: _b, mime: _m, tooLarge: _t, ...meta }) => meta),
          failures: [],
          report,
        };
      else if (d.type === 'FILE_OPEN' && file.tooLarge)
        result = {
          ok: false,
          error: 'حجم الملف أكبر من 200 MB',
          code: 'too_large',
          link: file.tooLarge,
        };
      else if (d.type === 'FILE_OPEN' && file.name === 'broken.pdf' && !window.__signedInAgain)
        result = {
          ok: false,
          error: 'انتهت جلسة Moodle. سجّل الدخول ثم أعد المحاولة.',
          code: 'login',
        };
      else if (d.type === 'FILE_OPEN')
        result = {
          ok: true,
          sessionId: 'session-' + file.name,
          size: file.bytes.length,
          name: file.name,
          mime: file.mime,
          sourceKey: file.sourceKey,
          courseId: file.courseId,
        };
      else if (d.type === 'FILE_CHUNK')
        result = { ok: true, offset: d.offset, count: file.bytes.length, base64: btoa(file.bytes) };
      else if (d.type === 'FILE_CLOSE') result = { ok: true };
      else return;
      window.postMessage(
        { source: 'UCAS_COMPANION_EXTENSION', requestId: d.requestId, result },
        location.origin,
      );
    });
  });
  await page.locator('[data-action="companion-files-discover"]').click();
  await page.waitForSelector('[data-companion-file]', { state: 'attached' });
  const scanReport = await page.locator('.companion-scan-report').innerText();
  assert.match(scanReport, /مساق بلا ملفات/);
  assert.match(scanReport, /Google Drive/);
  assert.match(scanReport, /المنتديات/);
  assert.match(scanReport, /0\.3\.0/);
  await page.locator('[data-action="companion-files-import"]').click();
  await page.waitForFunction(
    () => document.querySelector('.companion-file-panel')?.textContent.includes('1 جديد'),
    null,
    { timeout: 15000 },
  );
  const firstRun = await page.locator('.companion-file-panel').innerText();
  assert.match(firstRun, /انتهت جلسة Moodle/);
  assert.match(
    await page.locator('.companion-file-results').innerText(),
    /broken\.pdf: تعذر النقل/,
  );
  assert.equal(await page.locator('[data-action="companion-files-retry"]').count(), 1);
  assert.match(firstRun, /1 حُفظ كرابط/);
  assert.match(
    await page.locator('.companion-file-results').innerText(),
    /Lecture recording\.mp4: حُفظ كرابط — أكبر من 200 MB/,
  );
  const files = await page.evaluate(async () => {
    const store = await import('./js/store.js?v=1.7.0');
    const rows = (await store.all('resources')).filter(x => x.origin === 'moodle-companion-file');
    return { names: rows.map(x => x.name), data: await (await store.getFile(rows[0].id)).text() };
  });
  assert.deepEqual(files.names, ['intro.txt']);
  assert.equal(files.data, 'hello');
  await page.locator('[data-action="companion-files-import"]').click();
  await page.waitForFunction(
    () => document.querySelector('.companion-file-panel')?.textContent.includes('1 بدون تغيير'),
    null,
    { timeout: 15000 },
  );

  // After signing in again, "retry" transfers only the file that failed.
  await page.evaluate(() => (window.__signedInAgain = true));
  await page.locator('[data-action="companion-files-retry"]').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('.companion-file-panel')
        ?.textContent.includes('1 جديد، 0 محدّث، 0 بدون تغيير، 0 تعذر نقله'),
    null,
    { timeout: 15000 },
  );
  const retried = await page.evaluate(async () => {
    const store = await import('./js/store.js?v=1.7.0');
    const rows = (await store.all('resources')).filter(x => x.origin === 'moodle-companion-file');
    const pdf = rows.find(x => x.name === 'broken.pdf');
    const links = (await store.all('resources')).filter(x => x.origin === 'moodle-companion-link');
    return {
      links: links.map(x => [x.name, x.url, x.kind]),
      names: rows.map(x => x.name).sort(),
      type: pdf?.type,
      blobType: (await store.getFile(pdf.id))?.type,
    };
  });
  assert.deepEqual(retried.names, ['broken.pdf', 'intro.txt']);
  assert.deepEqual(retried.links, [
    ['Lecture recording.mp4', 'https://moodle.ucas.edu.ps/mod/resource/view.php?id=55', 'link'],
  ]);
  assert.equal(retried.type, 'application/pdf');
  assert.equal(retried.blobType, 'application/pdf');
  assert.equal(await page.locator('[data-action="companion-files-retry"]').count(), 0);

  // A later sync brings Moodle's due date and the student's submission for the same task.
  const synced = await page.evaluate(async () => {
    const { importCompanionSnapshot } = await import('./js/companion.js?v=1.7.0');
    const store = await import('./js/store.js?v=1.7.0');
    const stats = await importCompanionSnapshot({
      version: 1,
      courses: [
        {
          id: '821',
          title: 'ادارة مشاريع نظم المعلومات الجغرافية - محاضر',
          url: 'https://moodle.ucas.edu.ps/course/view.php?id=821',
          activities: [
            {
              id: '99',
              type: 'assign',
              title: 'واجب الأسبوع الثاني',
              section: 'الأسبوع الثاني',
              url: 'https://moodle.ucas.edu.ps/mod/assign/view.php?id=99',
              due: '2026-11-03T23:59',
              submitted: true,
            },
          ],
        },
      ],
    });
    const task = (await store.all('tasks')).find(t => t.origin === 'moodle-companion');
    return { updated: stats.tasksUpdated, due: task.due, done: task.done };
  });
  assert.deepEqual(synced, { updated: 1, due: '2026-11-03T23:59', done: true });
  // Impossible dates are ignored, and tasks the student created by hand are never changed.
  const guarded = await page.evaluate(async () => {
    const { importCompanionSnapshot } = await import('./js/companion.js?v=1.7.0');
    const store = await import('./js/store.js?v=1.7.0');
    const course = (await store.all('courses')).find(c => c.moodleId === '821');
    await store.put('tasks', {
      id: 'manual-1',
      title: 'مهمة يدوية',
      courseId: course.id,
      due: '',
      done: false,
    });
    await importCompanionSnapshot({
      version: 1,
      courses: [
        {
          id: '821',
          title: 'ادارة مشاريع نظم المعلومات الجغرافية - محاضر',
          url: 'https://moodle.ucas.edu.ps/course/view.php?id=821',
          activities: [
            {
              id: '98',
              type: 'assign',
              title: 'مهمة يدوية',
              url: 'https://moodle.ucas.edu.ps/mod/assign/view.php?id=98',
              due: '2026-12-01T10:00',
              submitted: true,
            },
            {
              id: '97',
              type: 'assign',
              title: 'تكليف بتاريخ خاطئ',
              url: 'https://moodle.ucas.edu.ps/mod/assign/view.php?id=97',
              due: '2026-99-99T99:99',
            },
          ],
        },
      ],
    });
    const tasks = await store.all('tasks');
    return {
      manual: tasks.find(t => t.id === 'manual-1'),
      bad: tasks.find(t => t.title === 'تكليف بتاريخ خاطئ')?.due,
    };
  });
  assert.equal(guarded.manual.done, false);
  assert.equal(guarded.manual.due, '');
  assert.equal(guarded.bad, '');

  console.log('companion-browser: sanitized import, diagnostics, deduplication and retry passed');
} finally {
  await browser.close();
}
