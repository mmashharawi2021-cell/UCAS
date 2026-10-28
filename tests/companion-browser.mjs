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
    const s = await import('./js/store.js?v=1.6.0');
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
  console.log('companion-browser: sanitized import and deduplication passed');
} finally {
  await browser.close();
}
