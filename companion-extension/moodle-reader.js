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

// v0.2: explicit, read-only discovery and file transfer in the Moodle page origin.
// No credentials, cookies, tokenized URLs, or raw HTML are transferred to UCAS.
(() => {
  const ORIGIN = 'https://moodle.ucas.edu.ps';
  const MAX_BYTES = 35 * 1024 * 1024;
  const CHUNK_BYTES = 96 * 1024;
  // Characters not allowed in saved file names (path separators, reserved, control).
  // eslint-disable-next-line no-control-regex
  const UNSAFE_NAME = /[\\/:*?"<>|\x00-\x1f]/g;
  const FILE_EXT = /\.(?:pdf|docx?|pptx?|xlsx?|txt|md|csv|zip|png|jpe?g|webp)$/i;
  const sessions = new Map();
  const title = (s, n = 180) =>
    String(s || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, n);
  function trusted(raw) {
    try {
      const u = new URL(raw, ORIGIN);
      if (u.origin !== ORIGIN || u.username || u.password || u.hash) return null;
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
  async function discover() {
    if (location.origin !== ORIGIN || location.pathname !== '/course/view.php')
      throw Error('افتح صفحة مساق Moodle أولًا');
    if (document.querySelector('form#login,input[name="password"]'))
      throw Error('انتهت جلسة Moodle');
    const courseId = new URL(location.href).searchParams.get('id');
    if (!/^\d{1,12}$/.test(courseId || '')) throw Error('صفحة المساق غير صالحة');
    const found = new Map();
    const add = (url, name, section, source) => {
      const clean = trusted(url);
      if (!clean || found.has(clean) || found.size >= 150) return;
      if (clean.includes('/pluginfile.php/') && !FILE_EXT.test(new URL(clean).pathname)) return;
      found.set(clean, {
        url: clean,
        name: basename(clean, name),
        section: title(section || 'مصادر المساق', 110),
        source: title(source || 'مواد المساق', 140),
      });
    };
    for (const a of document.querySelectorAll('a[href*="/pluginfile.php/"]')) {
      const section = a.closest('.course-section,.section.main');
      const label = section?.querySelector('.sectionname,[data-for="section_title"]')?.textContent;
      add(a.getAttribute('href'), a.textContent, label, 'ملف من صفحة المساق');
    }
    const activities = [];
    for (const row of document.querySelectorAll(
      '.course-section .activity-item, .course-section li.activity, .section.main .activity-item, .section.main li.activity',
    )) {
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
    for (const activity of activities.slice(0, 90)) {
      try {
        const r = await fetch(activity.url, {
          credentials: 'include',
          redirect: 'follow',
          cache: 'no-store',
        });
        if (
          !r.ok ||
          new URL(r.url).origin !== ORIGIN ||
          !/text\/html/i.test(r.headers.get('content-type') || '')
        )
          continue;
        if (Number(r.headers.get('content-length') || 0) > 2 * 1024 * 1024) continue;
        const html = await r.text();
        if (html.length > 2 * 1024 * 1024) continue;
        const dom = new DOMParser().parseFromString(html, 'text/html');
        for (const a of dom.querySelectorAll('a[href*="/pluginfile.php/"]'))
          add(a.getAttribute('href'), a.textContent, activity.section, activity.source);
      } catch {
        /* a single unavailable activity must not block a course */
      }
    }
    return { courseId, files: [...found.values()] };
  }
  async function openFile(url, suggested) {
    const allowed = trusted(url);
    if (!allowed || allowed !== url) throw Error('عنوان ملف Moodle غير معتمد');
    if (sessions.size > 1) throw Error('تم فتح ملف آخر؛ أكمل نقله أولًا');
    const response = await fetch(allowed, {
      credentials: 'include',
      redirect: 'follow',
      cache: 'no-store',
    });
    if (!response.ok || new URL(response.url).origin !== ORIGIN)
      throw Error('الملف غير متاح لجلسة Moodle الحالية');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_BYTES) throw Error('يتجاوز الملف حد 35 MB');
    const type = (response.headers.get('content-type') || 'application/octet-stream')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (type === 'text/html' || type === 'application/xhtml+xml')
      throw Error('استجاب Moodle بصفحة دخول أو صفحة HTML بدل الملف');
    const blob = await response.blob();
    if (!blob.size || blob.size > MAX_BYTES) throw Error('حجم الملف غير مدعوم (الحد 35 MB)');
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
    if (!FILE_EXT.test(name) || /(?:javascript|html|svg|xml)/i.test(type))
      throw Error('صيغة الملف غير مدعومة أو غير آمنة للاستيراد');
    const handle = crypto.randomUUID();
    sessions.set(handle, blob);
    return { handle, size: blob.size, name, type };
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
    })().then(reply, e => reply({ error: e?.message || 'تعذر قراءة الملف' }));
    return true;
  });
})();
