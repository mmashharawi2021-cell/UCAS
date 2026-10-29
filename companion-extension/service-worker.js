// Least-privilege bridge: authenticates only with the user's existing Moodle browser session.
// We never read or save cookies, password inputs, HTML documents or session tokens.
const MOODLE = 'https://moodle.ucas.edu.ps';
const DASHBOARD = `${MOODLE}/my/courses.php`;
const SITE_ORIGIN = 'https://mmashharawi2021-cell.github.io';
// Requests must come from the UCAS bridge in the top frame of a UCAS tab.
const fromSite = sender =>
  sender.frameId === 0 &&
  sender.origin === SITE_ORIGIN &&
  Boolean(sender.tab?.url?.startsWith(`${SITE_ORIGIN}/UCAS/`));
const VERSION = chrome.runtime.getManifest().version;
const SESSION_EXPIRED =
  'انتهت جلسة Moodle. افتح موقع الجامعة وسجّل الدخول بنفس متصفح Chrome ثم أعد المحاولة.';
let running = null;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function message(e) {
  return e?.message || String(e);
}
const sessionExpired = () => Object.assign(Error(SESSION_EXPIRED), { code: 'login' });
// Wait for the tab to finish loading. Right after tabs.update the tab can still describe the
// previous page as complete, so then also wait to see it load or change URL.
async function ready(tabId, before = null) {
  let loading = before === null;
  for (let n = 0; n < 120; n++) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status !== 'complete' || tab.pendingUrl) loading = true;
    else if (loading || tab.url !== before) return;
    await pause(250);
  }
  throw Error('تأخر تحميل Moodle؛ تحقق من الاتصال والإنترنت');
}
async function navigate(tabId, url) {
  const before = (await chrome.tabs.get(tabId)).url || '';
  await chrome.tabs.update(tabId, { url });
  await ready(tabId, before);
}
// Ask the tab's Moodle content script, retrying while it is still being injected.
async function ask(tabId, request, failure) {
  for (let n = 0; n < 18; n++) {
    try {
      const reply = await chrome.tabs.sendMessage(tabId, request);
      if (reply) return reply;
    } catch {
      /* content script not ready yet */
    }
    await pause(350);
  }
  throw Error(failure);
}
const read = tabId =>
  ask(
    tabId,
    { type: 'UCAS_MOODLE_READ' },
    'لم تستطع الإضافة قراءة صفحة Moodle. افتحها رسميًا وتأكد من تسجيل الدخول.',
  );
async function scan() {
  if (running) return running;
  running = (async () => {
    let tabId;
    try {
      const tab = await chrome.tabs.create({ url: DASHBOARD, active: false });
      tabId = tab.id;
      await ready(tabId);
      let snapshot = await read(tabId);
      if (snapshot.kind === 'login') throw sessionExpired();
      for (let retry = 0; retry < 10 && (!snapshot.courses || !snapshot.courses.length); retry++) {
        await pause(800);
        snapshot = await read(tabId);
      }
      if (!snapshot.courses?.length)
        throw Error('لم تُظهر صفحة مساقاتي أي مساقات. افتح Moodle وتحقق أن المساقات ظهرت بالكامل.');
      const courses = snapshot.courses.slice(0, 80);
      const details = [],
        failures = [];
      for (const course of courses) {
        try {
          await navigate(tabId, course.url);
          const page = await read(tabId);
          if (page.kind === 'login') throw sessionExpired();
          if (page.kind !== 'course' || page.data?.id !== course.id)
            throw Error('لم تُفتح صفحة المساق المتوقعة');
          details.push({ ...course, activities: page.data.activities });
        } catch (e) {
          // Every later course would fail the same way: stop and ask for a new sign-in.
          if (e.code === 'login') throw e;
          details.push({ ...course, activities: [] });
          failures.push({ course: course.title.slice(0, 70), reason: message(e).slice(0, 160) });
        }
        await pause(400); // polite pacing; avoid hammering the university's Moodle.
      }
      const result = { version: 1, at: new Date().toISOString(), courses: details, failures };
      await chrome.storage.local.set({ lastSnapshot: result });
      return result;
    } finally {
      if (tabId !== undefined) await chrome.tabs.remove(tabId).catch(() => {});
    }
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}
chrome.runtime.onMessage.addListener((request, sender, respond) => {
  // UCAS content script only. Prevent webpages or Moodle tabs from invoking the import bridge.
  if (!fromSite(sender) && !sender.url?.startsWith('chrome-extension://')) return;
  const action = request?.type;
  if (!['UCAS_COMPANION_SCAN', 'UCAS_COMPANION_LAST', 'UCAS_COMPANION_AUTO'].includes(action))
    return;
  (async () => {
    if (action === 'UCAS_COMPANION_LAST') {
      const data = await chrome.storage.local.get(['lastSnapshot', 'autoEnabled']);
      return {
        ok: true,
        version: VERSION,
        snapshot: data.lastSnapshot || null,
        autoEnabled: data.autoEnabled === true,
      };
    }
    if (action === 'UCAS_COMPANION_AUTO') {
      const enabled = request.enabled === true;
      await chrome.storage.local.set({ autoEnabled: enabled });
      if (enabled) await chrome.alarms.create('ucas-moodle-sync', { periodInMinutes: 60 });
      else await chrome.alarms.clear('ucas-moodle-sync');
      return { ok: true, enabled };
    }
    return { ok: true, snapshot: await scan() };
  })().then(respond, error =>
    respond({ ok: false, error: message(error), code: error?.code, link: error?.link }),
  );
  return true;
});
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== 'ucas-moodle-sync') return;
  if (!(await chrome.storage.local.get('autoEnabled')).autoEnabled) return;
  try {
    await scan();
  } catch {
    /* user must sign into Moodle again; do not loop */
  }
});

// File workflow (since v0.2). Explicit user-triggered discovery and sequential, bounded transfer.
// The UCAS website can request a file ONLY by an opaque ID in the extension's own catalog.
// File URL paths never cross into the website; no Moodle tokens/cookies are copied.
const fileSessions = new Map();
let discovering = null;
const MAX_FILE_ITEMS = 1200;
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MAX_CHUNK = 512 * 1024;
// The page a student opens to reach a file; the only Moodle address ever given to the site,
// and only when a file is too large to copy.
const safeHome = s =>
  /^https:\/\/moodle\.ucas\.edu\.ps\/(?:mod\/[a-z][a-z0-9_]{0,29}|course)\/view\.php\?id=\d{1,12}$/.test(
    String(s || ''),
  );
async function shaText(s) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}
function safeAttachmentURL(s) {
  try {
    const u = new URL(s);
    if (u.origin !== MOODLE || u.username || u.password || u.hash) return false;
    if (u.pathname.startsWith('/pluginfile.php/')) return !u.search;
    return (
      u.pathname === '/mod/resource/view.php' &&
      /^\d{1,12}$/.test(u.searchParams.get('id') || '') &&
      [...u.searchParams.keys()].every(k => k === 'id')
    );
  } catch {
    return false;
  }
}
// Per-course scan report for the site: counts only (activity types, scanned pages, skipped
// links), never URLs, names or page text.
function courseReport(raw) {
  const count = v => (Number.isSafeInteger(v) && v >= 0 ? Math.min(v, 100000) : 0);
  const counts = (value, key) =>
    Object.fromEntries(
      Object.entries(value && typeof value === 'object' ? value : {})
        .filter(([k]) => key.test(k))
        .slice(0, 30)
        .map(([k, v]) => [k, count(v)]),
    );
  return {
    activities: counts(raw?.activities, /^[a-z][a-z0-9_]{0,29}$/),
    pages: count(raw?.pages),
    pageErrors: count(raw?.pageErrors),
    unsupported: counts(raw?.unsupported, /^\.[a-z0-9]{1,8}$/),
    untrusted: count(raw?.untrusted),
    limited: raw?.limited === true,
  };
}
// The site moves one file at a time. Close transfer tabs left by a request that timed out or
// by a service worker that was stopped mid-transfer (its in-memory sessions are gone).
async function closeTransfers() {
  for (const [id, session] of fileSessions) {
    fileSessions.delete(id);
    await chrome.tabs.remove(session.tabId).catch(() => {});
  }
  const { transferTab } = await chrome.storage.session.get('transferTab');
  if (Number.isInteger(transferTab)) await chrome.tabs.remove(transferTab).catch(() => {});
  await chrome.storage.session.remove('transferTab');
}
async function fileCatalog() {
  if (discovering) return discovering;
  discovering = (async () => {
    const stored = await chrome.storage.local.get('lastSnapshot');
    const snapshot = stored.lastSnapshot;
    if (!snapshot?.courses?.length)
      throw Error('يجب أولًا الضغط على «مزامنة من Moodle» لجلب قائمة المساقات');
    await closeTransfers();
    const catalog = [],
      failures = [],
      report = [];
    let tabId;
    try {
      const tab = await chrome.tabs.create({ url: DASHBOARD, active: false });
      tabId = tab.id;
      await ready(tabId);
      // An early sign-in check; if the dashboard can't be read, each course checks again.
      if ((await read(tabId).catch(() => null))?.kind === 'login') throw sessionExpired();
      for (const course of snapshot.courses.slice(0, 100)) {
        if (catalog.length >= MAX_FILE_ITEMS) break;
        if (
          !/^\d{1,12}$/.test(course.id) ||
          course.url !== `${MOODLE}/course/view.php?id=${course.id}`
        )
          continue;
        const courseTitle = String(course.title || '').slice(0, 150);
        try {
          await navigate(tabId, course.url);
          const result = await ask(
            tabId,
            { type: 'UCAS_MOODLE_FILES' },
            'تعذرت قراءة ملفات المساق',
          );
          if (result.code === 'login') throw sessionExpired();
          if (result.error || result.courseId !== course.id)
            throw Error(result.error || 'تعذرت قراءة ملفات المساق');
          let files = 0;
          for (const f of result.files || []) {
            if (catalog.length >= MAX_FILE_ITEMS || !safeAttachmentURL(f.url)) continue;
            const sourceKey = await shaText(course.id + '|' + f.url);
            if (catalog.some(entry => entry.sourceKey === sourceKey)) continue;
            catalog.push({
              id: crypto.randomUUID(),
              courseId: course.id,
              courseTitle,
              name: String(f.name || 'ملف Moodle').slice(0, 180),
              module: String(f.section || 'مصادر المساق').slice(0, 120),
              sourceKey,
              url: f.url,
              home: safeHome(f.home) ? f.home : course.url,
            });
            files++;
          }
          report.push({ courseId: course.id, courseTitle, files, ...courseReport(result.report) });
        } catch (error) {
          if (error.code === 'login') throw error;
          const reason = message(error).slice(0, 160);
          failures.push({ course: courseTitle.slice(0, 80), reason });
          report.push({ courseId: course.id, courseTitle, files: 0, error: reason });
        }
        await pause(220);
      }
    } finally {
      if (tabId !== undefined) await chrome.tabs.remove(tabId).catch(() => {});
    }
    await chrome.storage.local.set({
      companionFileCatalog: { at: Date.now(), files: catalog, failures, report },
    });
    return {
      ok: true,
      version: VERSION,
      files: catalog.map(({ url: _url, home: _home, ...meta }) => meta),
      failures,
      report,
    };
  })();
  try {
    return await discovering;
  } finally {
    discovering = null;
  }
}
async function getStoredFile(fileId) {
  if (typeof fileId !== 'string' || !/^[a-f0-9-]{36}$/.test(fileId))
    throw Error('معرف الملف غير صالح');
  const stored = (await chrome.storage.local.get('companionFileCatalog')).companionFileCatalog;
  const file = stored?.files?.find(x => x.id === fileId);
  if (!file || !safeAttachmentURL(file.url)) throw Error('ملف غير موجود في فحص Moodle المسموح');
  return file;
}
async function openTransfer(fileId) {
  const file = await getStoredFile(fileId);
  await closeTransfers();
  let tabId;
  try {
    const tab = await chrome.tabs.create({
      url: `${MOODLE}/course/view.php?id=${file.courseId}`,
      active: false,
    });
    tabId = tab.id;
    await chrome.storage.session.set({ transferTab: tabId });
    await ready(tabId);
    const check = await read(tabId);
    if (check.kind === 'login') throw sessionExpired();
    if (check.kind !== 'course' || check.data?.id !== file.courseId)
      throw Error('المساق غير متاح لجلسة Moodle الحالية');
    const opened = await chrome.tabs.sendMessage(tabId, {
      type: 'UCAS_MOODLE_FILE_OPEN',
      url: file.url,
      name: file.name,
    });
    if (opened?.code === 'login') throw sessionExpired();
    if (opened?.code === 'too_large')
      throw Object.assign(Error('حجم الملف أكبر من 200 MB'), {
        code: 'too_large',
        link: file.home,
      });
    if (!opened || opened.error || !opened.handle || opened.size > MAX_FILE_BYTES)
      throw Error(opened?.error || 'تعذر تنزيل الملف');
    const sessionId = crypto.randomUUID();
    fileSessions.set(sessionId, { tabId, handle: opened.handle, fileId });
    return {
      ok: true,
      sessionId,
      size: opened.size,
      name: opened.name,
      mime: opened.type,
      sourceKey: file.sourceKey,
      courseId: file.courseId,
      module: file.module,
      home: file.home,
    };
  } catch (error) {
    if (tabId !== undefined) {
      await chrome.tabs.remove(tabId).catch(() => {});
      await chrome.storage.session.remove('transferTab');
    }
    throw error;
  }
}
function ownedSession(sessionId, fileId) {
  const session = fileSessions.get(sessionId);
  if (!session || session.fileId !== fileId) throw Error('انتهت جلسة نقل الملف؛ أعد المحاولة');
  return session;
}
async function readChunk(request) {
  const session = ownedSession(request.sessionId, request.fileId);
  const result = await chrome.tabs.sendMessage(session.tabId, {
    type: 'UCAS_MOODLE_FILE_CHUNK',
    handle: session.handle,
    offset: request.offset,
  });
  if (!result || result.error || !Number.isInteger(result.count) || result.count > MAX_CHUNK)
    throw Error(result?.error || 'تعذر نقل أحد أجزاء الملف');
  return { ok: true, ...result };
}
async function closeTransfer(request) {
  const session = fileSessions.get(request.sessionId);
  if (session && session.fileId === request.fileId) {
    fileSessions.delete(request.sessionId);
    try {
      await chrome.tabs.sendMessage(session.tabId, {
        type: 'UCAS_MOODLE_FILE_CLOSE',
        handle: session.handle,
      });
    } catch {
      /* closing */
    }
    await chrome.tabs.remove(session.tabId).catch(() => {});
    await chrome.storage.session.remove('transferTab');
  }
  return { ok: true };
}
chrome.runtime.onMessage.addListener((request, sender, respond) => {
  // Extension data is released only to the owner's exact UCAS site origin.
  if (!fromSite(sender)) return;
  if (
    ![
      'UCAS_COMPANION_FILE_SCAN',
      'UCAS_COMPANION_FILE_LIST',
      'UCAS_COMPANION_FILE_OPEN',
      'UCAS_COMPANION_FILE_CHUNK',
      'UCAS_COMPANION_FILE_CLOSE',
    ].includes(request?.type)
  )
    return;
  (async () => {
    if (request.type === 'UCAS_COMPANION_FILE_SCAN') return fileCatalog();
    if (request.type === 'UCAS_COMPANION_FILE_LIST') {
      const saved = (await chrome.storage.local.get('companionFileCatalog')).companionFileCatalog;
      return {
        ok: true,
        version: VERSION,
        files: (saved?.files || []).map(({ url: _url, home: _home, ...meta }) => meta),
        failures: saved?.failures || [],
        report: saved?.report || [],
      };
    }
    if (request.type === 'UCAS_COMPANION_FILE_OPEN') return openTransfer(request.fileId);
    if (request.type === 'UCAS_COMPANION_FILE_CHUNK') return readChunk(request);
    return closeTransfer(request);
  })().then(respond, error =>
    respond({ ok: false, error: message(error), code: error?.code, link: error?.link }),
  );
  return true;
});
