// This content script reads the DOM of pages your Moodle session can already access.
// It never accesses cookies, password fields, HTML source, tokens or scripts.
(() => {
  const ORIGIN = 'https://moodle.ucas.edu.ps';
  const text = (s, max = 180) =>
    String(s || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  const courseHref = value => {
    try {
      const u = new URL(value, ORIGIN);
      const id = u.searchParams.get('id');
      return u.origin === ORIGIN && u.pathname === '/course/view.php' && /^\d{1,12}$/.test(id || '')
        ? { id, url: `${ORIGIN}/course/view.php?id=${id}` }
        : null;
    } catch {
      return null;
    }
  };
  const activityHref = value => {
    try {
      const u = new URL(value, ORIGIN);
      const id = u.searchParams.get('id');
      const match =
        /^\/mod\/(resource|url|assign|quiz|forum|page|folder|book|lesson|choice|h5pactivity)\/view\.php$/.exec(
          u.pathname,
        );
      if (u.origin !== ORIGIN || !match || !/^\d{1,12}$/.test(id || '')) return null;
      return { id, type: match[1], url: `${ORIGIN}${u.pathname}?id=${id}` };
    } catch {
      return null;
    }
  };
  const isLogin = () =>
    Boolean(document.querySelector('form#login,input[name="password"][type="password"]')) ||
    /page-login|pagelayout-login/.test(document.body?.id || '');
  function dashboard() {
    const courses = [],
      seen = new Set();
    const cards = [...document.querySelectorAll('.course-card,.dashboard-card,.coursebox')];
    const hosts = cards.length ? cards : [document.querySelector('#region-main') || document.body];
    for (const card of hosts) {
      if (!card) continue;
      const anchors =
        card === document.body || card.id === 'region-main'
          ? [...card.querySelectorAll('a[href*="/course/view.php"]')]
          : [card.querySelector('a.coursename[href],a[href*="/course/view.php"]')].filter(Boolean);
      for (const anchor of anchors) {
        const u = courseHref(anchor.getAttribute('href'));
        if (!u || seen.has(u.id)) continue;
        const title = text(
          card.querySelector('.multiline[title]')?.getAttribute('title') ||
            card.querySelector('a.coursename')?.getAttribute('title') ||
            anchor.querySelector('.multiline[title]')?.getAttribute('title') ||
            anchor.textContent ||
            '',
          160,
        );
        if (title.length < 3) continue;
        const code = text(
          card.querySelector('.course-info-container .text-muted.small')?.textContent || '',
          60,
        );
        courses.push({ ...u, title, code });
        seen.add(u.id);
      }
      if (courses.length >= 150) break;
    }
    return courses;
  }
  function course() {
    const url = courseHref(location.href);
    if (!url) return null;
    const name = text(
      document.querySelector('.page-header-headings h1, #page-header h1, #region-main h1')
        ?.textContent ||
        document.title.split(' | ')[0] ||
        '',
      160,
    );
    const activities = [],
      seen = new Set();
    for (const section of [...document.querySelectorAll('.course-section,.section.main')].slice(
      0,
      60,
    )) {
      const sectionName = text(
        section.getAttribute('data-sectionname') ||
          section.querySelector('.sectionname, [data-for="section_title"] h3')?.textContent ||
          'مصادر المساق',
        100,
      );
      for (const item of [...section.querySelectorAll('.activity-item, li.activity')].slice(
        0,
        140,
      )) {
        const anchor = item.querySelector(
          '.activityname a[href*="/mod/"],.activityinstance a.aalink[href*="/mod/"],a.aalink[href*="/mod/"],a[href*="/mod/"]',
        );
        const link = activityHref(anchor?.getAttribute('href'));
        if (!link || seen.has(link.url)) continue;
        const title = text(
          item.getAttribute('data-activityname') ||
            item.querySelector('.activityname,.instancename')?.textContent ||
            anchor.textContent,
          180,
        );
        if (title.length < 2) continue;
        activities.push({ ...link, title, section: sectionName });
        seen.add(link.url);
      }
    }
    return { ...url, title: name, activities: activities.slice(0, 220) };
  }
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg?.type !== 'UCAS_MOODLE_READ') return;
    const result = isLogin()
      ? { kind: 'login' }
      : location.pathname === '/course/view.php'
        ? { kind: 'course', data: course() }
        : { kind: 'dashboard', courses: dashboard() };
    respond(result);
  });
})();

// v0.3: explicit, read-only discovery and file transfer in the Moodle page origin.
// No credentials, cookies, tokenized URLs, or raw HTML are transferred to UCAS. Discovery
// also returns a per-course report of counts only, so the student can see why a course
// shows no files.
(() => {
  const ORIGIN = 'https://moodle.ucas.edu.ps';
  // Larger files are offered to UCAS as a Moodle link instead of a download.
  const MAX_BYTES = 200 * 1024 * 1024;
  const MAX_PAGE_BYTES = 2 * 1024 * 1024;
  const CHUNK_BYTES = 512 * 1024;
  // Characters not allowed in saved file names (path separators, reserved, control).
  // eslint-disable-next-line no-control-regex
  const UNSAFE_NAME = /[\\/:*?"<>|\x00-\x1f]/g;
  const FILE_EXT = /\.(?:pdf|docx?|pptx?|xlsx?|txt|md|csv|zip|png|jpe?g|webp)$/i;
  // The type sent to UCAS always comes from the file extension, never from Moodle's header:
  // UCAS renders the file on its own origin (PDF preview, new tab).
  const TYPE_BY_EXT = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    zip: 'application/zip',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  };
  // A header declaring markup or script (…+xml, XSL, SVG, HTML) refuses the file. Office types
  // (application/vnd.openxmlformats-…) only contain "xml" inside the name and are documents.
  const UNSAFE_TYPE = /html|script|svg|xsl|(?:^|[/+])xml$/;
  // Documents shown inside a page instead of linked from it (PDF viewers, Office embeds).
  const EMBEDDED =
    'iframe[src*="/pluginfile.php/"],object[data*="/pluginfile.php/"],embed[src*="/pluginfile.php/"]';
  const ROWS =
    '.course-section .activity-item, .course-section li.activity, .section.main .activity-item, .section.main li.activity';
  const sessions = new Map();
  const title = (s, n = 180) =>
    String(s || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, n);
  const tooLarge = () => Object.assign(Error('حجم الملف أكبر من 200 MB'), { code: 'too_large' });
  const loginError = () =>
    Object.assign(Error('انتهت جلسة Moodle. سجّل الدخول من جديد ثم أعد المحاولة.'), {
      code: 'login',
    });
  const onLoginPage = doc =>
    Boolean(doc.querySelector('form#login,input[name="password"]')) ||
    /page-login|pagelayout-login/.test(`${doc.body?.id || ''} ${doc.body?.className || ''}`);
  const sourceOf = el =>
    el.getAttribute('href') || el.getAttribute('src') || el.getAttribute('data') || '';
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  // Read a body but give up once it passes `max` bytes; headers may omit or understate size.
  async function readLimited(response, max) {
    const reader = response.body?.getReader();
    const parts = [];
    let size = 0;
    for (;;) {
      const { done, value } = reader ? await reader.read() : { done: true };
      if (done) return new Blob(parts);
      size += value.byteLength;
      if (size > max) {
        await reader.cancel().catch(() => {});
        return null;
      }
      parts.push(value);
    }
  }
  function trusted(raw) {
    try {
      // The fragment (#page=3) never reaches the server and is dropped from the result.
      const u = new URL(raw, ORIGIN);
      if (u.origin !== ORIGIN || u.username || u.password) return null;
      if (u.pathname.startsWith('/pluginfile.php/')) return u.origin + u.pathname;
      if (
        /^\/mod\/resource\/view\.php$/.test(u.pathname) &&
        /^\d{1,12}$/.test(u.searchParams.get('id') || '')
      )
        return `${ORIGIN}${u.pathname}?id=${u.searchParams.get('id')}`;
    } catch {
      /* not a trusted Moodle attachment */
    }
    return null;
  }
  function safePage(raw) {
    try {
      const u = new URL(raw, ORIGIN);
      if (u.origin !== ORIGIN || u.username || u.password) return null;
      if (
        !/^\/mod\/(?:folder|page|book)\/view\.php$/.test(u.pathname) ||
        !/^\d{1,12}$/.test(u.searchParams.get('id') || '')
      )
        return null;
      return `${ORIGIN}${u.pathname}?id=${u.searchParams.get('id')}`;
    } catch {
      return null;
    }
  }
  function basename(href, fallback) {
    try {
      const u = new URL(href);
      const name = decodeURIComponent(u.pathname.split('/').pop() || '').replace(UNSAFE_NAME, '_');
      return title(FILE_EXT.test(name) ? name : fallback || name, 180);
    } catch {
      return title(fallback || 'ملف Moodle', 180);
    }
  }
  // Lower-case extension of a link's last path segment, or '' when it has none.
  function extension(raw) {
    try {
      return /\.[a-z0-9]{1,8}$/i.exec(new URL(raw, ORIGIN).pathname)?.[0].toLowerCase() || '';
    } catch {
      return '';
    }
  }
  // Module type and id of an activity link, e.g. { kind: 'url', id: '15' }.
  function activityOf(raw) {
    try {
      const u = new URL(raw, ORIGIN);
      const kind = /^\/mod\/([a-z][a-z0-9_]{0,29})\/view\.php$/.exec(u.pathname)?.[1];
      const id = u.searchParams.get('id');
      return u.origin === ORIGIN && kind && /^\d{1,12}$/.test(id || '') ? { kind, id } : null;
    } catch {
      return null;
    }
  }
  async function discover() {
    if (onLoginPage(document)) throw loginError();
    if (location.origin !== ORIGIN || location.pathname !== '/course/view.php')
      throw Error('افتح صفحة مساق Moodle أولًا');
    const courseId = new URL(location.href).searchParams.get('id');
    if (!/^\d{1,12}$/.test(courseId || '')) throw Error('صفحة المساق غير صالحة');
    // Counters keyed by page-supplied names use prototype-free objects.
    const report = {
      activities: Object.create(null),
      pages: 0,
      pageErrors: 0,
      unsupported: Object.create(null),
      untrusted: 0,
      limited: false,
    };
    const found = new Map();
    const skipped = new Set();
    const course = `${ORIGIN}/course/view.php?id=${courseId}`;
    // `home` is the Moodle page the student opens to reach the file (activity or course page).
    const add = (url, name, section, source, home = course) => {
      const clean = trusted(url);
      const key = clean || String(url);
      if (found.has(key) || skipped.has(key)) return;
      if (!clean) {
        skipped.add(key);
        report.untrusted++;
        return;
      }
      if (clean.includes('/pluginfile.php/') && !FILE_EXT.test(new URL(clean).pathname)) {
        skipped.add(key);
        const ext = extension(clean);
        if (ext) report.unsupported[ext] = (report.unsupported[ext] || 0) + 1;
        return;
      }
      if (found.size >= 150) {
        report.limited = true;
        return;
      }
      found.set(clean, {
        url: clean,
        home: clean.includes('/mod/resource/') ? clean : home,
        name: basename(clean, name),
        section: title(section || 'مصادر المساق', 110),
        source: title(source || 'مواد المساق', 140),
      });
    };
    const collect = (root, sectionFor, source, home) => {
      for (const el of root.querySelectorAll(`a[href*="/pluginfile.php/"],${EMBEDDED}`))
        add(sourceOf(el), el.textContent || el.getAttribute('title'), sectionFor(el), source, home);
    };
    collect(
      document,
      el =>
        el
          .closest('.course-section,.section.main')
          ?.querySelector('.sectionname,[data-for="section_title"]')?.textContent,
      'ملف من صفحة المساق',
    );
    const activities = [];
    const counted = new Set();
    for (const row of document.querySelectorAll(ROWS)) {
      const listed = activityOf(row.querySelector('a[href*="/mod/"]')?.getAttribute('href'));
      if (listed && !counted.has(listed.kind + listed.id)) {
        counted.add(listed.kind + listed.id);
        report.activities[listed.kind] = (report.activities[listed.kind] || 0) + 1;
      }
      const a = row.querySelector(
        'a[href*="/mod/resource/view.php"],a[href*="/mod/folder/view.php"],a[href*="/mod/page/view.php"],a[href*="/mod/book/view.php"]',
      );
      if (!a) continue;
      const section = row.closest('.course-section,.section.main');
      const sectionName = title(
        section?.querySelector('.sectionname,[data-for="section_title"]')?.textContent ||
          'مصادر المساق',
        110,
      );
      const source = title(
        row.querySelector('.activityname,.instancename')?.textContent || a.textContent,
        140,
      );
      const direct = trusted(a.getAttribute('href'));
      if (direct && direct.includes('/mod/resource/')) add(direct, source, sectionName, source);
      else {
        const p = safePage(a.getAttribute('href'));
        if (p && !activities.some(x => x.url === p))
          activities.push({ url: p, section: sectionName, source });
      }
    }
    // Read only authenticated course-material pages, not forums, student submissions or grades.
    if (activities.length > 90) report.limited = true;
    for (const [index, activity] of activities.slice(0, 90).entries()) {
      // Polite pacing between page requests to the university's Moodle.
      if (index) await pause(150);
      try {
        const r = await fetch(activity.url, {
          credentials: 'include',
          redirect: 'follow',
          cache: 'no-store',
        });
        const at = new URL(r.url);
        if (at.origin === ORIGIN && at.pathname.startsWith('/login/')) throw loginError();
        if (r.status === 429 || r.status === 503) {
          // Moodle asks us to slow down: stop opening pages for this course.
          report.pageErrors++;
          report.limited = true;
          break;
        }
        if (
          !r.ok ||
          at.origin !== ORIGIN ||
          !/text\/html/i.test(r.headers.get('content-type') || '') ||
          Number(r.headers.get('content-length') || 0) > MAX_PAGE_BYTES
        ) {
          report.pageErrors++;
          continue;
        }
        const body = await readLimited(r, MAX_PAGE_BYTES);
        if (!body) {
          report.pageErrors++;
          continue;
        }
        const dom = new DOMParser().parseFromString(await body.text(), 'text/html');
        if (onLoginPage(dom)) throw loginError();
        report.pages++;
        collect(dom, () => activity.section, activity.source, activity.url);
      } catch (error) {
        // An expired session stops the scan; a single unavailable page doesn't.
        if (error?.code === 'login') throw error;
        report.pageErrors++;
      }
    }
    return { courseId, files: [...found.values()], report };
  }
  async function get(href) {
    const response = await fetch(href, {
      credentials: 'include',
      redirect: 'follow',
      cache: 'no-store',
    });
    const at = new URL(response.url);
    if (at.origin === ORIGIN && at.pathname.startsWith('/login/')) throw loginError();
    if (!response.ok || at.origin !== ORIGIN) throw Error('الملف غير متاح لجلسة Moodle الحالية');
    return response;
  }
  const mimeOf = response =>
    (response.headers.get('content-type') || 'application/octet-stream')
      .split(';')[0]
      .trim()
      .toLowerCase();
  const isHTML = type => type === 'text/html' || type === 'application/xhtml+xml';
  async function openFile(url, suggested) {
    const allowed = trusted(url);
    if (!allowed || allowed !== url) throw Error('عنوان ملف Moodle غير معتمد');
    if (sessions.size > 1) throw Error('تم فتح ملف آخر؛ أكمل نقله أولًا');
    const resource = new URL(allowed).pathname === '/mod/resource/view.php';
    // redirect=1 is the link Moodle itself uses for pop-up and new-window resources: it sends
    // the student to the file whatever the resource's display setting (embed, frame…).
    let response = await get(resource ? `${allowed}&redirect=1` : allowed);
    if (resource && isHTML(mimeOf(response))) {
      // Moodle still answered with its own page: take the resource's file link from it.
      const page = await readLimited(response, MAX_PAGE_BYTES);
      if (!page) throw Error('عرض Moodle صفحة بدل الملف');
      const dom = new DOMParser().parseFromString(await page.text(), 'text/html');
      if (onLoginPage(dom)) throw loginError();
      const link = [...dom.querySelectorAll(`a[href*="/pluginfile.php/"],${EMBEDDED}`)]
        .map(el => trusted(sourceOf(el)))
        .find(href => href?.includes('/mod_resource/content/'));
      if (!link) throw Error('عرض Moodle صفحة بدل الملف ولم يظهر فيها رابط التنزيل');
      response = await get(link);
    }
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_BYTES) throw tooLarge();
    const type = mimeOf(response);
    if (isHTML(type)) throw Error('استجاب Moodle بصفحة HTML بدل الملف');
    const blob = await readLimited(response, MAX_BYTES);
    if (!blob) throw tooLarge();
    if (!blob.size) throw Error('الملف فارغ');
    const disposition = response.headers.get('content-disposition') || '';
    const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition);
    const quoted = /filename\s*=\s*"([^"]+)"/i.exec(disposition);
    const rawName = encoded ? decodeURIComponent(encoded[1]) : quoted ? quoted[1] : '';
    const safeName = String(rawName).replace(UNSAFE_NAME, '_').slice(0, 180);
    const mimeExt =
      {
        'application/pdf': '.pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
        'application/msword': '.doc',
        'application/vnd.ms-powerpoint': '.ppt',
        'text/plain': '.txt',
        'image/jpeg': '.jpg',
        'image/png': '.png',
      }[type] || '';
    let name = safeName || basename(response.url, suggested);
    if (!FILE_EXT.test(name) && mimeExt)
      name = title((suggested || 'Moodle').replace(UNSAFE_NAME, '_'), 160) + mimeExt;
    if (!FILE_EXT.test(name) || UNSAFE_TYPE.test(type))
      throw Error('صيغة الملف غير مدعومة أو غير آمنة للاستيراد');
    const handle = crypto.randomUUID();
    sessions.set(handle, blob);
    const ext = /\.([a-z0-9]+)$/i.exec(name)[1].toLowerCase();
    return { handle, size: blob.size, name, type: TYPE_BY_EXT[ext] };
  }
  async function fileChunk(handle, offset) {
    const blob = sessions.get(handle);
    if (!blob || !Number.isInteger(offset) || offset < 0 || offset >= blob.size)
      throw Error('جزء ملف غير صالح');
    const bytes = new Uint8Array(
      await blob.slice(offset, Math.min(blob.size, offset + CHUNK_BYTES)).arrayBuffer(),
    );
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192)
      bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { offset, count: bytes.length, base64: btoa(bin) };
  }
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (
      ![
        'UCAS_MOODLE_FILES',
        'UCAS_MOODLE_FILE_OPEN',
        'UCAS_MOODLE_FILE_CHUNK',
        'UCAS_MOODLE_FILE_CLOSE',
      ].includes(msg?.type)
    )
      return;
    (async () => {
      if (msg.type === 'UCAS_MOODLE_FILES') return discover();
      if (msg.type === 'UCAS_MOODLE_FILE_OPEN') return openFile(msg.url, msg.name);
      if (msg.type === 'UCAS_MOODLE_FILE_CHUNK') return fileChunk(msg.handle, msg.offset);
      sessions.delete(msg.handle);
      return { ok: true };
    })().then(reply, e => reply({ error: e?.message || 'تعذر قراءة الملف', code: e?.code }));
    return true;
  });
})();
