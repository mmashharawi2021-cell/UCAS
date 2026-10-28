// UI test for study groups and the push settings panel. The Supabase library URL is
// routed to tests/fixtures/fake-supabase.mjs, so no network or real project is needed.
// Run with a local server on 127.0.0.1:8099.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { SUPABASE_JS } from '../js/cloud/config.js';

const fake = await readFile(new URL('./fixtures/fake-supabase.mjs', import.meta.url), 'utf8');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const step = name => console.log('✓', name);

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  await context.route(SUPABASE_JS, route =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: fake }),
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const click = sel => page.evaluate(s => document.querySelector(s).click(), sel);

  await page.goto('http://127.0.0.1:8099/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.topbar');
  await click('[data-go="groups"]');
  await page.waitForSelector('.groups-intro');
  assert.match(await page.locator('.groups-intro').innerText(), /اسمًا مستعارًا/);
  step('consent screen explains what goes online');

  // Anonymous sign-in disabled on the server → clear message, retry works.
  await page.evaluate(() => (globalThis.__fakeAnonDisabled = true));
  await click('[data-act="groups-connect"]');
  await page.waitForSelector('[role="alert"]');
  assert.match(await page.locator('[role="alert"]').innerText(), /غير مفعّل/);
  await page.evaluate(() => (globalThis.__fakeAnonDisabled = false));
  await click('[data-act="groups-connect"]');
  await page.waitForSelector('#nickname-form');
  step('sign-in disabled → friendly error; retry → nickname form');

  await page.fill('#nick', 'مهند');
  await page.click('#nickname-form button[type="submit"]');
  await page.waitForSelector('#group-create-form');
  await page.fill('#group-name', 'مذاكرة قواعد البيانات');
  await page.fill('#group-course', 'بناء قواعد البيانات الجغرافية');
  await page.click('#group-create-form button[type="submit"]');
  await page.waitForSelector('.chat-shell');
  assert.match(await page.locator('.chat-head').innerText(), /مذاكرة قواعد البيانات/);
  step('create group opens its chat');

  await page.fill('#chat-form textarea', 'السلام عليكم <b>جميعًا</b>');
  await page.click('#chat-form button[type="submit"]');
  await page.waitForSelector('.chat-msg.mine');
  const mine = await page.locator('.chat-msg.mine p').innerHTML();
  assert.ok(!mine.includes('<b>'), 'message HTML must be escaped');
  assert.equal(await page.inputValue('#chat-form textarea'), '');
  step('send message (escaped), composer cleared');

  // A classmate writes: arrives live with their nickname.
  await page.evaluate(() => {
    const db = globalThis.__fakeDB;
    const g = db.groups[0];
    db.profiles.push({ id: 'peer', nickname: 'سارة' });
    db.group_members.push({ group_id: g.id, user_id: 'peer', role: 'member' });
    globalThis.__fakeIncoming(g.id, 'peer', 'أهلًا، متى نذاكر؟');
  });
  await page.waitForSelector('.chat-msg:not(.mine)');
  assert.match(await page.locator('.chat-msg:not(.mine)').innerText(), /سارة[\s\S]*متى نذاكر/);
  step('incoming message appears live with author');

  await click('[data-act="group-invite"]');
  await page.waitForSelector('.invite-code');
  assert.equal(await page.locator('.invite-code').innerText(), 'TEST-GRP2');
  assert.match(await page.inputValue('.modal input[readonly]'), /\?join=TESTGRP2$/);
  await page.evaluate(() => document.querySelector('.modal-backdrop').remove());
  step('invite modal shows code and link');

  // Invite link opens the app, prefills and joins.
  await page.evaluate(() => {
    globalThis.__fakeDB.groups.push({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'مجموعة الاستشعار',
      invite_code: 'JQNMEB23',
      created_by: 'peer',
      created_at: new Date().toISOString(),
    });
  });
  const db = await page.evaluate(() => JSON.stringify(globalThis.__fakeDB));
  // Carry the fake server's data across the navigation, before any script runs.
  await page.addInitScript(d => (globalThis.__fakeDB = JSON.parse(d)), db);
  await page.goto('http://127.0.0.1:8099/?join=JQNMEB23', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.chat-head');
  assert.match(await page.locator('.chat-head').innerText(), /مجموعة الاستشعار/);
  assert.equal(new URL(page.url()).search, '', 'join code removed from the address bar');
  step('?join= link joins and opens the group');

  await click('[data-act="group-leave"]');
  await page.waitForSelector('.group-card');
  assert.equal(await page.locator('.group-card').count(), 1);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(width <= 392, `overflow ${width}`);
  step('leave group; list updates; no overflow');

  await click('[data-go="settings"]');
  await page.waitForSelector('.push-panel');
  assert.match(await page.locator('.push-panel').innerText(), /عنوان التذكير ووقته/);
  assert.equal(await page.locator('[data-act="push-enable"]').count(), 1);
  step('push panel explains what is uploaded');

  assert.deepEqual(errors, []);
  console.log('groups-browser: ok');
} finally {
  await browser.close();
}
