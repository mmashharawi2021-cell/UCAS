// Upgrade test: a phone that ran an old release (with its cache-first service worker)
// must open the new release without errors and keep its data.
// Usage: serve OLD_DIR/NEW_DIR through a switchable symlink, see CONTRIBUTING.md.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;

const SITE = process.env.UPGRADE_URL || 'http://127.0.0.1:8098/';
const SWITCH = process.env.UPGRADE_SWITCH; // shell command that points the server at the new release
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.topbar');
  await page
    .waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 20000 })
    .catch(async () => {
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker?.controller, null, {
        timeout: 20000,
      });
    });
  await page.evaluate(async () => {
    const { put } = await import('./js/store.js');
    await put('resources', {
      id: 'old-file',
      kind: 'file',
      name: 'old.txt',
      courseId: 'course-1',
      module: 'م',
      blob: new Blob(['from the old release']),
      addedAt: new Date().toISOString(),
      completed: false,
    });
  });
  console.log('✓ old release running under its service worker, data saved');

  // What the old release seeded on its own (1.7.0: seven sample courses, then a
  // semester plan from the grades feature). Wait for the plan, then read everything it wrote.
  const readSeeded = () =>
    page.evaluate(async () => {
      const { all, get } = await import('./js/store.js');
      const byId = list => list.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const value = async id => (await get('settings', id))?.value ?? null;
      return {
        courses: byId(await all('courses')).map(c => ({ id: c.id, title: c.title, code: c.code })),
        grades: byId(await all('grades')).map(g => ({ id: g.id, hours: g.hours })),
        gpaSettings: await value('gpa-settings'),
        semester: await value('current-semester'),
        seeded: await value('seeded'),
        planSeeded: await value('seed-ucas-fall-2026'),
      };
    });
  await page
    .waitForFunction(
      async () => {
        const { get } = await import('./js/store.js');
        return !!(await get('settings', 'seed-ucas-fall-2026'));
      },
      null,
      { timeout: 15000 },
    )
    .catch(() => {}); // releases before the plan only seeded courses
  await page.waitForTimeout(1000);
  // Raw rows exactly as stored (every field, including `_mtime`), read at run time; nothing about
  // their values is assumed here. js/store.js `all()` returns the stored objects unchanged.
  const readRaw = () =>
    page.evaluate(async () => {
      const { all } = await import('./js/store.js');
      const byId = list => list.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
      return {
        courses: byId(await all('courses')),
        grades: byId(await all('grades')),
        settings: byId(await all('settings')),
      };
    });
  const rawBefore = await readRaw();
  const seededBefore = await readSeeded();
  // Prove the check is real: the old release must have seeded something to compare.
  assert.ok(seededBefore.courses.length > 0, 'old release seeded no courses');
  if (seededBefore.planSeeded)
    assert.ok(seededBefore.gpaSettings?.previousHours, 'old release seeded the plan');
  console.log(
    `✓ old release data read: ${seededBefore.courses.length} courses, ${seededBefore.grades.length} grade rows, previousHours=${seededBefore.gpaSettings?.previousHours ?? '-'}`,
  );

  execSync(SWITCH);
  await page.reload({ waitUntil: 'domcontentloaded' });
  // The app may reload itself once to drop stale caches.
  await page.waitForFunction(
    () => document.querySelector('.home-widgets') || document.querySelector('.initial-loader h2'),
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(1500);
  const broken = await page.locator('.initial-loader h2').count();
  assert.equal(broken, 0, 'new release must not show the storage error after an upgrade');
  // On a phone the home widgets sit in the collapsed "more tools" section: they must be
  // rendered there, and become visible once the student opens it.
  await page.waitForSelector('.premium-home-extras:not([open]) .home-widgets', {
    state: 'attached',
  });
  await page.click('.premium-home-extras > summary');
  await page.waitForSelector('.premium-home-extras[open] .home-widgets', { state: 'visible' });
  const result = await page.evaluate(async v => {
    const s = await import(`./js/store.js?v=${v}`);
    const r = await s.get('resources', 'old-file');
    return { version: (await s.openDB()).version, text: await r.blob.text() };
  }, VERSION);
  assert.equal(result.version, 4);
  assert.equal(result.text, 'from the old release');
  console.log('✓ new release opened, schema migrated, old data intact');

  // The new release seeds nothing, but must keep what the old one seeded exactly as it was.
  await page.waitForTimeout(1500);
  const seededAfter = await readSeeded();
  assert.deepEqual(
    seededAfter,
    seededBefore,
    'courses and grade settings unchanged by the upgrade',
  );
  assert.equal(await page.locator('.first-run').count(), 0, 'no first-run panel after an upgrade');
  console.log(
    `✓ old courses (titles, codes), grade rows and grade settings identical after the upgrade (${seededAfter.courses.length} courses)`,
  );

  // Full raw comparison: every field of every course and grade row, and every settings row the
  // old release wrote, including `_mtime` (a changed `_mtime` would re-sync or override edits).
  const rawAfter = await readRaw();
  assert.deepEqual(rawAfter.courses, rawBefore.courses, 'course rows identical, incl. _mtime');
  assert.deepEqual(rawAfter.grades, rawBefore.grades, 'grade rows identical, incl. _mtime');
  const afterSettings = new Map(rawAfter.settings.map(r => [r.id, r]));
  for (const row of rawBefore.settings)
    assert.deepEqual(afterSettings.get(row.id), row, `settings/${row.id} identical, incl. _mtime`);
  const added = rawAfter.settings.filter(r => !rawBefore.settings.some(b => b.id === r.id));
  console.log(
    `✓ raw rows identical after the upgrade: ${rawBefore.courses.length} courses, ${rawBefore.grades.length} grades, ${rawBefore.settings.length} settings (fields incl. _mtime); settings added by the new release: ${added.map(r => r.id).join(', ') || 'none'}`,
  );
  console.log('upgrade-browser: ok');
} finally {
  await browser.close();
}
