// 2.0.0 first run: a new install starts empty and guides the student; a profile written by an
// older release keeps every row. Run with a local server on 127.0.0.1:8099.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { LEGACY_PLAN, LEGACY_TITLES, seedLegacy } from './fixtures/legacy-seed.mjs';

const BASE = 'http://127.0.0.1:8099/';
const step = name => console.log('✓', name);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});

// Everything the old seeding touched, read straight from IndexedDB (including _mtime).
const snapshot = page =>
  page.evaluate(async () => {
    const v = (await (await fetch('package.json')).json()).version;
    const s = await import(`./js/store.js?v=${v}`);
    const byId = list => list.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const settings = {};
    for (const id of ['seeded', 'seed-ucas-fall-2026', 'gpa-settings', 'current-semester'])
      settings[id] = (await s.getRow('settings', id)) || null;
    return {
      courses: byId(await s.all('courses')),
      grades: byId(await s.all('grades')),
      settings,
    };
  });

async function fresh(width = 390) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.topbar');
  return page;
}

try {
  // ---- (a) a new install is empty and shows the first-run panel ----
  const page = await fresh();
  await page.waitForSelector('.first-run');
  // Give any start-up feature (formerly the plan seeding) time to run.
  await page.waitForTimeout(1000);
  const empty = await snapshot(page);
  assert.equal(empty.courses.length, 0, 'no sample courses');
  assert.equal(empty.grades.length, 0, 'no credit hours');
  assert.equal(empty.settings['gpa-settings'], null, 'no previous hours');
  assert.equal(empty.settings['current-semester'], null, 'no semester name');
  assert.equal(await page.locator('.home-courses .premium-course-card').count(), 0);

  const panel = page.locator('section.first-run');
  assert.equal(await panel.getAttribute('aria-labelledby'), 'first-run-title');
  assert.match(await page.locator('#first-run-title').innerText(), /مساقات/);
  const text = await panel.innerText();
  assert.match(text, /Moodle UCAS/);
  assert.match(text, /Chrome/);
  assert.match(text, /كمبيوتر/);
  assert.match(text, /يدويًا/);
  assert.ok(
    !/\d{4}\/\d{4}|\b[A-Z]{4} \d{4}\b|\b42\b/.test(text),
    'no personal plan in the first-run panel',
  );
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
  step('fresh profile: 0 courses, no plan, first-run panel shown');

  // Keyboard: both actions are real buttons with a visible label, reachable by Tab.
  const moodleBtn = panel.locator('button[data-go="moodle"]');
  const addBtn = panel.locator('button[data-action="add-course"]');
  assert.equal(await moodleBtn.count(), 1);
  assert.equal(await addBtn.count(), 1);
  assert.match(await moodleBtn.innerText(), /Moodle UCAS/);
  assert.match(await addBtn.innerText(), /إضافة مساق/);
  let reached = false;
  for (let i = 0; i < 120 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(
      () =>
        document.activeElement?.matches('.first-run [data-action="add-course"]') &&
        document.activeElement.matches(':focus-visible'),
    );
  }
  assert.ok(reached, 'Tab reaches "add course" with :focus-visible');
  assert.notEqual(
    await addBtn.evaluate(b => getComputedStyle(b).outlineStyle),
    'none',
    'visible focus ring',
  );
  await page.keyboard.press('Enter');
  await page.waitForSelector('#course-form');
  step('keyboard: Enter on "add course" opens the add-course modal');

  await page.fill('#course-title', 'مساق تجريبي <b>أول</b>');
  await page.fill('#course-code', 'test101');
  await page.click('#course-form button[type="submit"]');
  await page.waitForSelector('.home-courses .premium-course-card');
  assert.equal(await page.locator('.first-run').count(), 0, 'panel gone once a course exists');
  assert.match(
    await page.locator('.home-courses .premium-course-card h3').innerText(),
    /مساق تجريبي <b>أول<\/b>/,
    'title shown as text, not markup',
  );
  assert.equal(await page.locator('.home-courses .premium-course-card h3 b').count(), 0);
  // Focus lands on the new course's card (its open button), never on BODY.
  await page
    .waitForFunction(() => document.activeElement?.closest('.premium-course-card'), null, {
      timeout: 5000,
    })
    .catch(() => {});
  const focused = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    inCard: !!document.activeElement?.closest('.home-courses .premium-course-card'),
    title: document.activeElement?.closest('.premium-course-card')?.querySelector('h3')
      ?.textContent,
  }));
  assert.notEqual(focused.tag, 'BODY', 'focus must not fall back to BODY');
  assert.ok(focused.inCard, 'focus is inside the new course card: ' + JSON.stringify(focused));
  assert.match(focused.title, /مساق تجريبي/);
  step('focus after adding the first course: on the new course card');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.premium-hero');
  assert.equal(await page.locator('.first-run').count(), 0, 'still gone after reload');
  assert.deepEqual(page.errors, []);
  step('manual course added: panel disappears and stays gone');

  // Moodle path, at the narrowest supported phone width.
  const small = await fresh(360);
  await small.waitForSelector('.first-run');
  assert.ok((await small.evaluate(() => document.documentElement.scrollWidth)) <= 362);
  await small.locator('.first-run button[data-go="moodle"]').click();
  await small.waitForSelector('.moodle-companion-panel');
  assert.ok(await small.locator('[data-action="companion-scan"]').count());
  assert.deepEqual(small.errors, []);
  step('"sync from Moodle" opens the Moodle UCAS page (360 px, no overflow)');

  // Desktop: the two options sit side by side and nothing overflows.
  const desk = await fresh(1280);
  await desk.waitForSelector('.first-run');
  const tops = await desk.evaluate(() =>
    [...document.querySelectorAll('.first-run-option')].map(e =>
      Math.round(e.getBoundingClientRect().top),
    ),
  );
  assert.equal(tops.length, 2);
  assert.equal(tops[0], tops[1], 'desktop: options in one row');
  assert.ok((await desk.evaluate(() => document.documentElement.scrollWidth)) <= 1282);
  step('desktop layout: two options in one row, no overflow');

  // ---- (b) an existing profile (written as 1.7.0 wrote it) is untouched ----
  const old = await fresh();
  await seedLegacy(old, { plan: true, reload: false });
  // A student who already edited things: a real mark and a hand-written previous average.
  await old.evaluate(async () => {
    const s = await import('./js/store.js');
    const g = await s.getRow('grades', 'course-2');
    await s.put('grades', { ...g, finalMark: '88' });
    const gs = await s.getRow('settings', 'gpa-settings');
    await s.put('settings', { ...gs, value: { ...gs.value, previousAverage: '81.5' } });
  });
  const before = await snapshot(old);
  assert.equal(before.courses.length, 7);
  assert.equal(before.grades.length, 7);
  await old.reload({ waitUntil: 'domcontentloaded' });
  await old.waitForSelector('.premium-hero');
  await old.waitForTimeout(1500);
  await old.reload({ waitUntil: 'domcontentloaded' });
  await old.waitForSelector('.premium-hero');
  await old.waitForTimeout(500);
  const after = await snapshot(old);
  assert.deepEqual(after, before, 'every legacy row is kept exactly (including _mtime)');
  assert.deepEqual(
    after.courses.map(c => c.title),
    [...LEGACY_TITLES],
  );
  assert.equal(
    after.settings['gpa-settings'].value.previousHours,
    String(LEGACY_PLAN.previousHours),
  );
  assert.equal(after.settings['current-semester'].value, LEGACY_PLAN.name);
  assert.equal(await old.locator('.first-run').count(), 0, 'no first-run panel for old users');
  assert.equal(await old.locator('.home-courses .premium-course-card').count(), 6);
  assert.deepEqual(old.errors, []);
  step('legacy profile: courses, grades, previous hours and seed flags unchanged');

  // Adding an 8th course from the courses page also keeps focus on the new card.
  await old.evaluate(() => document.querySelector('[data-go="courses"]').click());
  await old.waitForSelector('.premium-library-intro');
  await old.evaluate(() => document.querySelector('[data-action="add-course"]').click());
  await old.waitForSelector('#course-form');
  await old.fill('#course-title', 'مساق تجريبي ثامن');
  await old.click('#course-form button[type="submit"]');
  // The page re-renders once more after the modal closes; focus is set after that render.
  await old
    .waitForFunction(() => document.activeElement?.closest('.premium-course-card'), null, {
      timeout: 5000,
    })
    .catch(() => {});
  const focus8 = await old.evaluate(() => ({
    tag: document.activeElement?.tagName,
    title: document.activeElement?.closest('.premium-course-card')?.querySelector('h3')
      ?.textContent,
  }));
  assert.notEqual(focus8.tag, 'BODY');
  assert.equal(focus8.title, 'مساق تجريبي ثامن', JSON.stringify(focus8));
  assert.deepEqual(old.errors, []);
  step('focus after adding a course from the courses page: on the new course card');

  console.log('first-run-browser: ok');
} finally {
  await browser.close();
}
