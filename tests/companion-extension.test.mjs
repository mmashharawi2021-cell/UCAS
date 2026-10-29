// Unit tests for the Chrome Companion service worker, run in a VM with a fake Chrome API.
// Tabs behave like Chrome after tabs.update: the first poll still shows the previous page as
// complete. Content-script answers come from `answer`; no browser or Moodle is involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('companion-extension/service-worker.js', 'utf8');
const MOODLE = 'https://moodle.ucas.edu.ps';
const LOGIN = `${MOODLE}/login/index.php`;
const SITE = {
  frameId: 0,
  origin: 'https://mmashharawi2021-cell.github.io',
  tab: { url: 'https://mmashharawi2021-cell.github.io/UCAS/' },
};
const courseURL = id => `${MOODLE}/course/view.php?id=${id}`;
const idOf = url => new URL(url).searchParams.get('id');

function load({ courses = ['11', '12'], redirect = () => null, answer }) {
  const listeners = [];
  const local = {
    lastSnapshot: {
      courses: courses.map(id => ({ id, title: `مساق ${id}`, url: courseURL(id) })),
    },
  };
  const session = {};
  const tabs = new Map();
  const sent = [];
  const removed = [];
  let nextId = 1;
  const area = data => ({
    get: async keys => {
      const out = {};
      for (const k of [].concat(keys)) if (k in data) out[k] = data[k];
      return out;
    },
    set: async values => void Object.assign(data, values),
    remove: async keys => {
      for (const k of [].concat(keys)) delete data[k];
    },
  });
  const chrome = {
    runtime: {
      getManifest: () => ({ version: '0.3.0' }),
      onMessage: { addListener: fn => listeners.push(fn) },
    },
    storage: { local: area(local), session: area(session) },
    alarms: { create: async () => {}, clear: async () => {}, onAlarm: { addListener() {} } },
    tabs: {
      create: async ({ url }) => {
        const tab = { id: nextId++, status: 'loading', url: '', pendingUrl: url };
        tab.queue = [{ status: 'complete', url: redirect(url) || url }];
        tabs.set(tab.id, tab);
        return { id: tab.id };
      },
      update: async (id, { url }) => {
        const tab = tabs.get(id);
        tab.queue = [
          { status: 'complete', url: tab.url },
          { status: 'loading', url: tab.url, pendingUrl: url },
          { status: 'complete', url: redirect(url) || url },
        ];
        return {};
      },
      get: async id => {
        const tab = tabs.get(id);
        if (!tab) throw Error('No tab with id ' + id);
        if (tab.queue.length) Object.assign(tab, { pendingUrl: undefined }, tab.queue.shift());
        return { id: tab.id, status: tab.status, url: tab.url, pendingUrl: tab.pendingUrl };
      },
      remove: async id => {
        removed.push(id);
        tabs.delete(id);
      },
      sendMessage: async (id, message) => {
        const url = tabs.get(id).url;
        sent.push({ id, url, type: message.type });
        return answer(url, message);
      },
    },
  };
  vm.runInNewContext(source, {
    chrome,
    crypto: globalThis.crypto,
    TextEncoder,
    URL,
    setTimeout: fn => setImmediate(fn),
  });
  // Like Chrome messaging, replies cross the boundary as JSON.
  const call = (request, sender = SITE) =>
    new Promise(resolve => {
      for (const listener of listeners)
        listener(request, sender, reply => resolve(JSON.parse(JSON.stringify(reply))));
    });
  return { call, local, session, sent, removed, tabs };
}

// Content script of a signed-in student on the dashboard, course pages and login page.
const student =
  (files = id => [{ url: `${MOODLE}/pluginfile.php/${id}/mod_resource/content/1/w${id}.pdf` }]) =>
  (url, message) => {
    const page = new URL(url).pathname;
    if (page.startsWith('/login/'))
      return message.type === 'UCAS_MOODLE_READ'
        ? { kind: 'login' }
        : { error: 'انتهت جلسة Moodle', code: 'login' };
    if (message.type === 'UCAS_MOODLE_READ')
      return page === '/course/view.php'
        ? { kind: 'course', data: { id: idOf(url), activities: [] } }
        : { kind: 'dashboard', courses: [] };
    if (message.type === 'UCAS_MOODLE_FILES')
      return {
        courseId: idOf(url),
        files: files(idOf(url)).map(f => ({ name: 'محاضرة.pdf', section: 'الأسبوع 1', ...f })),
        report: { activities: { resource: 1, url: 2 }, pages: 0 },
      };
    if (message.type === 'UCAS_MOODLE_FILE_OPEN')
      return { handle: 'h-' + idOf(url), size: 5, name: 'w.pdf', type: 'application/pdf' };
    return { ok: true };
  };

test('file scan reads each course page after it loads, not the previous page', async () => {
  const ext = load({ answer: student() });
  const result = await ext.call({ type: 'UCAS_COMPANION_FILE_SCAN' });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.version, '0.3.0');
  assert.deepEqual(
    ext.sent.filter(m => m.type === 'UCAS_MOODLE_FILES').map(m => m.url),
    [courseURL('11'), courseURL('12')],
  );
  assert.equal(result.files.length, 2);
  assert.ok(
    result.files.every(f => !('url' in f)),
    'Moodle URLs never reach the site',
  );
  assert.deepEqual(
    result.report.map(r => [r.courseId, r.files, r.activities]),
    [
      ['11', 1, { resource: 1, url: 2 }],
      ['12', 1, { resource: 1, url: 2 }],
    ],
  );
  assert.equal(ext.tabs.size, 0, 'scan tab closed');
});

test('an expired Moodle session stops the file scan with one clear error', async () => {
  const ext = load({
    redirect: url => (idOf(url) === '12' ? LOGIN : null),
    answer: student(),
  });
  const result = await ext.call({ type: 'UCAS_COMPANION_FILE_SCAN' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'login');
  assert.match(result.error, /انتهت جلسة Moodle/);
  assert.equal(ext.local.companionFileCatalog, undefined, 'no partial catalog is saved');
  assert.equal(ext.tabs.size, 0);

  const atStart = load({ redirect: () => LOGIN, answer: student() });
  const early = await atStart.call({ type: 'UCAS_COMPANION_FILE_SCAN' });
  assert.equal(early.code, 'login');
  assert.equal(atStart.sent.filter(m => m.type === 'UCAS_MOODLE_FILES').length, 0);
});

test('content-script reports are reduced to counts before reaching the site', async () => {
  const base = student();
  const ext = load({
    courses: ['11'],
    answer: (url, message) =>
      message.type === 'UCAS_MOODLE_FILES'
        ? {
            ...base(url, message),
            report: {
              activities: { '<img onerror=x>': 5, url: 2, resource: 'x' },
              unsupported: { '.rar': 1, 'javascript:': 3 },
              pages: -1,
              note: 'https://moodle.ucas.edu.ps/secret',
            },
          }
        : base(url, message),
  });
  const { report } = await ext.call({ type: 'UCAS_COMPANION_FILE_SCAN' });
  assert.deepEqual(report[0].activities, { url: 2, resource: 0 });
  assert.deepEqual(report[0].unsupported, { '.rar': 1 });
  assert.equal(report[0].pages, 0);
  assert.ok(!('note' in report[0]));
});

test('a transfer left open by a timed-out request is closed before the next one', async () => {
  const ext = load({ answer: student() });
  const { files } = await ext.call({ type: 'UCAS_COMPANION_FILE_SCAN' });
  const first = await ext.call({ type: 'UCAS_COMPANION_FILE_OPEN', fileId: files[0].id });
  assert.equal(first.ok, true, first.error);
  const firstTab = ext.session.transferTab;
  assert.ok(Number.isInteger(firstTab));
  // The site timed out and never sent FILE_CLOSE for the first file.
  const second = await ext.call({ type: 'UCAS_COMPANION_FILE_OPEN', fileId: files[1].id });
  assert.equal(second.ok, true, second.error);
  assert.ok(ext.removed.includes(firstTab), 'leftover transfer tab closed');
  assert.ok(!ext.tabs.has(firstTab));
  const chunk = await ext.call({
    type: 'UCAS_COMPANION_FILE_CHUNK',
    fileId: files[0].id,
    sessionId: first.sessionId,
    offset: 0,
  });
  assert.equal(chunk.ok, false, 'the stale session cannot be read any more');
  await ext.call({
    type: 'UCAS_COMPANION_FILE_CLOSE',
    fileId: files[1].id,
    sessionId: second.sessionId,
  });
  assert.equal(ext.tabs.size, 0);
  assert.equal(ext.session.transferTab, undefined);
});

test('requests from other pages, origins or frames are ignored', async () => {
  const ext = load({ answer: student() });
  for (const sender of [
    { ...SITE, tab: { url: 'https://evil.example/UCAS/' } },
    { ...SITE, origin: 'https://evil.example' },
    { ...SITE, frameId: 3 },
    { tab: SITE.tab },
  ]) {
    const outcome = await Promise.race([
      ext.call({ type: 'UCAS_COMPANION_FILE_SCAN' }, sender),
      new Promise(resolve => setTimeout(() => resolve('ignored'), 50)),
    ]);
    assert.equal(outcome, 'ignored', JSON.stringify(sender));
  }
  assert.equal(ext.sent.length, 0);
});

test('files over 200 MB come back as their Moodle page link only', async () => {
  const base = student();
  const ext = load({
    courses: ['11'],
    answer: (url, message) =>
      message.type === 'UCAS_MOODLE_FILE_OPEN'
        ? { error: 'حجم الملف أكبر من 200 MB', code: 'too_large' }
        : message.type === 'UCAS_MOODLE_FILES'
          ? {
              ...base(url, message),
              files: [
                {
                  url: `${MOODLE}/pluginfile.php/7/mod_folder/content/0/big.pdf`,
                  home: `${MOODLE}/mod/folder/view.php?id=70`,
                },
                {
                  url: `${MOODLE}/pluginfile.php/8/mod_folder/content/0/odd.pdf`,
                  home: 'https://evil.example/mod/folder/view.php?id=1',
                },
              ],
            }
          : base(url, message),
  });
  const { files } = await ext.call({ type: 'UCAS_COMPANION_FILE_SCAN' });
  assert.ok(
    files.every(f => !('home' in f) && !('url' in f)),
    'no Moodle address in the catalog',
  );
  const big = await ext.call({ type: 'UCAS_COMPANION_FILE_OPEN', fileId: files[0].id });
  assert.deepEqual(
    [big.ok, big.code, big.link],
    [false, 'too_large', `${MOODLE}/mod/folder/view.php?id=70`],
  );
  const odd = await ext.call({ type: 'UCAS_COMPANION_FILE_OPEN', fileId: files[1].id });
  assert.equal(odd.link, courseURL('11'), 'an unsafe page falls back to the course page');
  assert.equal(ext.tabs.size, 0);
});
