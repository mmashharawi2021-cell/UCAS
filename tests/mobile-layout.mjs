import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { seedLegacy } from './fixtures/legacy-seed.mjs';

const browserPath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath: browserPath,
  args: ['--no-sandbox'],
});
try {
  for (const width of [320, 360, 390, 430, 768]) {
    const page = await browser.newPage({
      viewport: { width, height: 850 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    await page.goto('http://127.0.0.1:8099/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelector('.topbar') && document.querySelector('.page-stage'),
      null,
      { timeout: 15000 },
    );
    // A new install starts empty: the first-run panel fits the phone without overflow.
    await page.waitForSelector('.first-run');
    const firstRun = await page.evaluate(() => {
      const r = document.querySelector('.first-run').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.first-run button')].map(b => {
        const br = b.getBoundingClientRect();
        return [br.left, br.right];
      });
      return {
        left: r.left,
        right: r.right,
        buttons,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    assert.ok(firstRun.left >= -1 && firstRun.right <= width + 1, `first-run panel at ${width}`);
    assert.ok(firstRun.buttons.every(([l, r]) => l >= -1 && r <= width + 1));
    assert.ok(firstRun.scrollWidth <= width + 2, `first-run overflow at ${width}`);
    await seedLegacy(page);
    await page.waitForSelector('.premium-hero');
    assert.equal(await page.locator('.first-run').count(), 0);
    assert.equal(await page.locator('.premium-hero-score').count(), 1);
    await page.waitForSelector('.premium-focus');
    assert.ok(await page.locator('.premium-home-extras').count());
    assert.equal(await page.locator('.premium-focus-card').count(), 3);
    assert.ok(await page.locator('.premium-progress [role="progressbar"]').count());
    if (width <= 600) {
      assert.equal(await page.locator('.premium-home-extras').evaluate(e => e.open), false);
      const compact = await page.evaluate(() => ({
        header: document.querySelector('.topbar').getBoundingClientRect().height,
        hero: document.querySelector('.premium-hero').getBoundingClientRect().height,
        scrollWidth: document.documentElement.scrollWidth,
        courses: [...document.querySelectorAll('.home-courses .premium-course-card')]
          .filter(e => getComputedStyle(e).display !== 'none')
          .map(e => ({
            left: e.getBoundingClientRect().left,
            right: e.getBoundingClientRect().right,
          })),
      }));
      assert.ok(compact.header <= 66, 'Header is too tall: ' + compact.header);
      assert.ok(compact.hero <= 440, 'Hero is too tall: ' + compact.hero);
      assert.equal(compact.courses.length, 2);
      assert.ok(compact.courses.every(c => c.left >= -1 && c.right <= width + 1));
      assert.ok(compact.scrollWidth <= width + 2);
      await page.locator('.premium-home-extras summary').click();
      assert.equal(await page.locator('.premium-home-extras').evaluate(e => e.open), true);
    }
    await page.evaluate(() => document.querySelector('[data-action="toggle-menu"]')?.click());
    if (width <= 768) {
      assert.ok(await page.locator('.shell.mobile-open .sidebar').count());
      await page.locator('.mobile-menu-close').click();
      assert.equal(await page.locator('.shell.mobile-open').count(), 0);
    }
    await page.evaluate(() => document.querySelector('[data-go="courses"]')?.click());
    await page.waitForSelector('.premium-library-grid');
    // Moodle tools live only on the Moodle page; the import center keeps general sources.
    await page.evaluate(() => document.querySelector('[data-go="import"]')?.click());
    await page.waitForSelector('[data-import-tab="drive"]');
    assert.equal(
      await page.locator('.moodle-connect-intro, [data-import-tab="moodle"]').count(),
      0,
    );
    await page.evaluate(() => document.querySelector('[data-go="moodle"]')?.click());
    await page.waitForSelector('.moodle-connect-intro a[href="moodle-connect.html"]');
    await page.evaluate(() => document.querySelector('[data-go="courses"]')?.click());
    await page.waitForSelector('.premium-library-grid');
    assert.ok((await page.locator('.premium-library-grid .premium-course-card').count()) > 0);
    await page.fill('#course-filter', 'unlikely-course-search-zz');
    assert.equal(
      await page.locator('.premium-library-grid .premium-course-card:visible').count(),
      0,
    );
    await page.fill('#course-filter', '');
    assert.ok(
      (await page.locator('.premium-library-grid .premium-course-card:visible').count()) > 0,
    );
    await page.evaluate(() => document.querySelector('[data-go="import"]')?.click());
    await page.waitForTimeout(500);
    const result = await page.evaluate(() => {
      const w = window.innerWidth;
      const doc = document.documentElement;
      const nodes = [
        ...document.querySelectorAll(
          '.shell,.main-area,.topbar,.content,.page-stage,.page-intro,.quick-actions,.quick-action,.tabs,.panel,.drive-import,.drive-panel,.drive-hero,.drive-panel form,.drive-panel input',
        ),
      ].filter(e => getComputedStyle(e).display !== 'none');
      const offenders = nodes
        .map(el => ({
          tag: el.tagName,
          cls: el.className,
          scroll: el.scrollWidth,
          client: el.clientWidth,
          rect: (() => {
            const r = el.getBoundingClientRect();
            return [Math.round(r.left), Math.round(r.right)];
          })(),
        }))
        .filter(v => v.rect[1] > w + 2 || v.rect[0] < -2 || v.scroll > v.client + 2)
        .slice(0, 18);
      return {
        width: w,
        scrollWidth: doc.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        offenders,
      };
    });
    console.log(JSON.stringify(result));
    assert.ok(
      result.scrollWidth <= width + 2,
      'Mobile overflow at ' + width + 'px: ' + JSON.stringify(result),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
