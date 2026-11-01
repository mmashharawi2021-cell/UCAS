// Opening splash: full/quick/reduced modes, the logo and name landing on the real brand
// (sidebar on desktop, top bar on phones), and every way the overlay must let go of the app.
// Run with a local server on 127.0.0.1:8099.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:8099/';
const SHOTS = process.env.SPLASH_SHOTS; // optional folder for end-state screenshots
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const step = msg => console.log(`  ok - ${msg}`);

// Records when the app announced itself ready and when the splash was hidden (page clock).
const TIMES = () => {
  window.__splashT = {};
  addEventListener('ucas-ready', () => (window.__splashT.ready = performance.now()));
  addEventListener('ucas-boot-error', () => (window.__splashT.error = performance.now()));
  document.addEventListener('DOMContentLoaded', () => {
    const splash = document.getElementById('ucas-splash');
    if (!splash) return;
    new MutationObserver(() => {
      if (splash.hidden && !window.__splashT.hidden) window.__splashT.hidden = performance.now();
    }).observe(splash, { attributes: true, attributeFilter: ['hidden'] });
  });
};

async function open(options = {}, init) {
  const context = await browser.newContext({ deviceScaleFactor: 1, ...options });
  await context.addInitScript(TIMES);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  return { context, page };
}
const times = page => page.evaluate(() => window.__splashT);
const hiddenAfterReady = async (page, ms) => {
  await page.waitForFunction(() => window.__splashT?.ready, null, { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('ucas-splash').hidden, null, {
    timeout: ms + 1000,
  });
  const t = await times(page);
  return t.hidden - t.ready;
};
// After the splash: the app is interactive and no splash state is left behind.
async function released(page) {
  const state = await page.evaluate(() => ({
    inert: document.getElementById('app').inert,
    active: document.documentElement.classList.contains('splash-active'),
    display: getComputedStyle(document.getElementById('ucas-splash')).display,
  }));
  assert.deepEqual(state, { inert: false, active: false, display: 'none' });
}
// Exactly one visible logo and one visible name: no splash copy left next to the real brand.
async function brandOnce(page, phone) {
  const brand = await page.evaluate(() => {
    const visible = el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility === 'visible' && s.opacity !== '0';
    };
    const count = sel => [...document.querySelectorAll(sel)].filter(visible).length;
    return {
      parts: document.querySelectorAll('[data-brand-part]').length,
      marks: count('[data-brand-part="mark"], .splash-mark'),
      titles: count('[data-brand-part="title"], .splash-title'),
      subs: count('[data-brand-part="subtitle"], .splash-sub'),
      mobileBrand:
        !!document.querySelector('.mobile-brand') &&
        visible(document.querySelector('.mobile-brand')),
      scrollWidth: document.documentElement.scrollWidth,
      width: innerWidth,
    };
  });
  assert.ok(brand.parts >= 5, 'brand parts exist in sidebar and phone bar');
  assert.equal(brand.marks, 1, 'one visible logo');
  assert.equal(brand.titles, 1, 'one visible name');
  assert.equal(brand.subs, phone ? 0 : 1, 'subtitle only in the sidebar');
  assert.equal(brand.mobileBrand, phone);
  assert.ok(brand.scrollWidth <= brand.width + 1, `no horizontal overflow at ${brand.width}`);
}
// Jumps the flight to its last frame and checks every copy sits on its real part.
async function landsOnTarget(page, phone) {
  await page.waitForFunction(
    () => document.getElementById('ucas-splash').dataset.phase === 'landing',
    null,
    {
      timeout: 12000,
    },
  );
  const result = await page.evaluate(phone => {
    const hidden = [...document.querySelectorAll('[data-brand-part]')].every(
      el => getComputedStyle(el).visibility === 'hidden',
    );
    const inert = document.getElementById('app').inert;
    const splash = document.getElementById('ucas-splash');
    for (const a of splash.getAnimations({ subtree: true }))
      if (!(a instanceof CSSAnimation) && !(a instanceof CSSTransition))
        a.currentTime = a.effect.getComputedTiming().endTime;
    const dest = document.querySelector(phone ? '.mobile-brand' : '.sidebar .logo');
    const text = el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    };
    const pair = (from, to, isText) => {
      const a = isText ? text(from) : from.getBoundingClientRect();
      const b = isText ? text(to) : to.getBoundingClientRect();
      return {
        dx: Math.abs(a.left + a.width / 2 - b.left - b.width / 2),
        dy: Math.abs(a.top + a.height / 2 - b.top - b.height / 2),
        dw: Math.abs(a.width - b.width),
        dh: Math.abs(a.height - b.height),
        w: b.width,
      };
    };
    const out = {
      hidden,
      inert,
      mark: pair(
        splash.querySelector('.splash-mark'),
        dest.querySelector('[data-brand-part="mark"]'),
      ),
      title: pair(
        splash.querySelector('.splash-title'),
        dest.querySelector('[data-brand-part="title"]'),
        true,
      ),
    };
    const sub = dest.querySelector('[data-brand-part="subtitle"]');
    if (sub) out.sub = pair(splash.querySelector('.splash-sub'), sub, true);
    else out.subOpacity = getComputedStyle(splash.querySelector('.splash-sub')).opacity;
    return out;
  }, phone);
  assert.ok(result.hidden, 'real brand stays hidden while the copies fly');
  assert.ok(result.inert, '#app inert during the animation');
  for (const key of ['mark', 'title', 'sub'])
    if (result[key])
      for (const [k, v] of Object.entries(result[key]).filter(([k]) => k !== 'w'))
        // Glyph widths round differently at another font size: allow 5% on text width.
        assert.ok(
          v <= (k === 'dw' && key !== 'mark' ? Math.max(3, result[key].w * 0.05) : 3),
          `${key} lands on its target (${k}=${v.toFixed(1)})`,
        );
  if (phone) assert.equal(result.subOpacity, '0', 'phone subtitle fades out');
}

try {
  // ---- 1. desktop, new tab: full mode, lands in the sidebar, then quick on reload ----
  {
    const { context, page } = await open({ viewport: { width: 1280, height: 800 } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.getAttribute('#ucas-splash', 'data-mode'), 'full');
    assert.equal(await page.evaluate(() => document.getElementById('app').inert), true);
    assert.equal(
      await page.locator('#ucas-splash[role="status"] .splash-sr').innerText(),
      'جاري تحميل UCAS STUDIO',
    );
    await page.waitForSelector('.topbar');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.getElementById('app').inert), true);
    // Mid-assembly: real brand hidden, so the page never shows two logos.
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('.sidebar [data-brand-part]')].every(
          el => getComputedStyle(el).visibility === 'hidden',
        ),
      ),
      true,
    );
    const elapsed = await hiddenAfterReady(page, 7000);
    assert.ok(elapsed <= 7000, `full splash left ${elapsed}ms after ready`);
    await released(page);
    await brandOnce(page, false);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/end-desktop-light.png` });
    await page.click('.sidebar .nav-btn[data-go="courses"]');
    await page.waitForSelector('.shell[data-page="courses"]');
    step(
      `full mode on a new tab: landed, released ${Math.round(elapsed)}ms after ready, nav click works`,
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.getAttribute('#ucas-splash', 'data-mode'), 'quick');
    const quick = await hiddenAfterReady(page, 2000);
    assert.ok(quick < 2000, `quick splash took ${quick}ms`);
    await released(page);
    // Typing right after the splash ends reaches the field (fill() ignores inert).
    await page.fill('#global-search', 'محاضرة');
    assert.equal(await page.inputValue('#global-search'), 'محاضرة');
    await brandOnce(page, false);
    step(`quick mode on reload in the same tab: ${Math.round(quick)}ms, typing works`);
    assert.deepEqual(page.errors, []);
    await context.close();
  }

  // ---- 2. landing geometry: desktop light/dark, phones 390 and 320 ----
  for (const [name, options, phone] of [
    ['1280', { viewport: { width: 1280, height: 800 } }, false],
    ['1280 dark', { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' }, false],
    ['390', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, true],
    ['320', { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true }, true],
  ]) {
    const { context, page } = await open(options);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await landsOnTarget(page, phone);
    await page.waitForFunction(() => document.getElementById('ucas-splash').hidden);
    await released(page);
    await brandOnce(page, phone);
    if (phone) {
      const bar = await page.evaluate(() => {
        const b = document.querySelector('.mobile-brand').getBoundingClientRect();
        const t = document.querySelector('.topbar').getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, topbar: t.top, h: t.height };
      });
      assert.equal(bar.top, 0, 'brand bar at the top');
      assert.ok(Math.abs(bar.bottom - bar.topbar) < 1, 'top bar follows the brand bar');
      assert.ok(bar.h <= 66, 'topbar unchanged');
    }
    if (SHOTS) {
      const file = {
        1280: 'end-desktop-light-2',
        '1280 dark': 'end-desktop-dark',
        390: 'end-390',
        320: 'end-320',
      }[name];
      await page.screenshot({ path: `${SHOTS}/${file}.png` });
    }
    assert.deepEqual(page.errors, []);
    step(`${name}: logo and name land on the real brand, shown once`);
    await context.close();
  }

  // ---- 3. reduced motion: short fade ----
  {
    const { context, page } = await open({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.getAttribute('#ucas-splash', 'data-mode'), 'reduced');
    const elapsed = await hiddenAfterReady(page, 1500);
    assert.ok(elapsed < 1500, `reduced splash took ${elapsed}ms`);
    await released(page);
    await brandOnce(page, true);
    step(`reduced motion: ${Math.round(elapsed)}ms`);
    await context.close();
  }

  // ---- 4. storage failure: the splash leaves and the error screen shows ----
  {
    const { context, page } = await open({ viewport: { width: 390, height: 844 } }, () => {
      IDBFactory.prototype.open = () => {
        throw new DOMException('blocked by test', 'SecurityError');
      };
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    // The boot guard reloads once to rule out a stale cache, then reports the error.
    await page.waitForSelector('.initial-loader h2', { state: 'visible', timeout: 20000 });
    await page.waitForFunction(() => document.getElementById('ucas-splash').hidden, null, {
      timeout: 3000,
    });
    await released(page);
    step('blocked IndexedDB: splash leaves, error screen visible');
    await context.close();
  }

  // ---- 5. app module never loads: released by the max wait ----
  {
    const { context, page } = await open({ viewport: { width: 1280, height: 800 } });
    await context.route(/\/js\/app\.js/, () => {}); // never answered
    await page.goto(BASE, { waitUntil: 'commit' });
    await page.waitForSelector('#ucas-splash');
    await page.waitForFunction(() => document.getElementById('ucas-splash').hidden, null, {
      timeout: 10500,
    });
    const t = await page.evaluate(() => performance.now());
    assert.ok(t >= 8500 && t <= 10500, `released by the max wait at ${Math.round(t)}ms`);
    await released(page);
    assert.ok(await page.locator('.initial-loader p').isVisible());
    step(`hanging app module: released at ${Math.round(t)}ms`);
    await context.close().catch(() => {});
  }

  // ---- 6. offline reload once the service worker controls the page ----
  {
    const { context, page } = await open({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.topbar');
    await page
      .waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 20000 })
      .catch(async () => {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => navigator.serviceWorker?.controller, null, {
          timeout: 20000,
        });
      });
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.topbar', { timeout: 15000 });
    await page.waitForFunction(() => document.getElementById('ucas-splash').hidden, null, {
      timeout: 5000,
    });
    await released(page);
    await brandOnce(page, true);
    step('offline reload after the service worker is ready');
    await context.close();
  }
  console.log('splash browser tests passed');
} finally {
  await browser.close();
}
