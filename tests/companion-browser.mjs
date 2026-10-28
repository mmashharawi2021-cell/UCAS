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

  // Simulate a controlled extension that returns a file catalog and a tiny authorized TXT file.
  // No live university network, session cookie or protected file is needed for this test.
  await page.evaluate(() => {
    window.addEventListener('message', event => {
      if (event.source !== window || event.data?.source !== 'UCAS_COMPANION_WEB') return;
      const d = event.data;
      const file = {
        id: '12345678-1234-4123-8123-123456789012',
        courseId: '821',
        courseTitle: 'ادارة مشاريع نظم المعلومات الجغرافية',
        name: 'intro.txt',
        module: 'الأسبوع الأول',
        sourceKey: 'a'.repeat(64),
      };
      let result;
      if (d.type === 'FILE_SCAN' || d.type === 'FILE_LIST') result = { ok: true, files: [file], failures: [] };
      else if (d.type === 'FILE_OPEN') result = { ok: true, sessionId: 'abcd1234', size: 5, name: 'intro.txt', mime: 'text/plain', sourceKey: file.sourceKey, courseId: file.courseId };
      else if (d.type === 'FILE_CHUNK') result = { ok: true, offset: d.offset, count: 5, base64: 'aGVsbG8=' };
      else if (d.type === 'FILE_CLOSE') result = { ok: true };
      else return;
      window.postMessage({ source: 'UCAS_COMPANION_EXTENSION', requestId: d.requestId, result }, location.origin);
    });
  });
  await page.locator('[data-action="companion-files-discover"]').click();
  await page.waitForSelector('[data-companion-file]');
  await page.locator('[data-action="companion-files-import"]').click();
  await page.waitForFunction(() => document.querySelector('.companion-file-panel')?.textContent.includes('1 جديد'), null, { timeout: 15000 });
  const files = await page.evaluate(async () => {
    const store = await import('./js/store.js?v=1.7.0');
    const rows = (await store.all('resources')).filter(x => x.origin === 'moodle-companion-file');
    return { names: rows.map(x => x.name), data: await (await store.getFile(rows[0].id)).text() };
  });
  assert.deepEqual(files.names, ['intro.txt']);
  assert.equal(files.data, 'hello');
  await page.locator('[data-action="companion-files-import"]').click();
  await page.waitForFunction(() => document.querySelector('.companion-file-panel')?.textContent.includes('1 بدون تغيير'), null, { timeout: 15000 });

  console.log('companion-browser: sanitized import and deduplication passed');
} finally {
  await browser.close();
}
