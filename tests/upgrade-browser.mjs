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
  console.log('upgrade-browser: ok');
} finally {
  await browser.close();
}
