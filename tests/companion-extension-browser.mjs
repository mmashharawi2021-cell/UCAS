// Browser test: the Companion content script (companion-extension/moodle-reader.js) on synthetic
// Moodle 4 pages that Playwright serves at the real Moodle origin. Every request is answered by a
// route; DNS is disabled so anything a route doesn't see (Playwright doesn't intercept the
// follow-up of a fulfilled redirect, so fixtures use none) fails locally instead of reaching
// moodle.ucas.edu.ps. This proves the discovery and download logic against these fixtures only,
// not against the live UCAS Moodle.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const MOODLE = 'https://moodle.ucas.edu.ps';
const script = await readFile(
  new URL('../companion-extension/moodle-reader.js', import.meta.url),
  'utf8',
);
const pdf = Buffer.from('%PDF-1.4 lecture one');
const pptx = Buffer.from('PK\u0003\u0004 weekly slides');
const html = body => ({ status: 200, contentType: 'text/html; charset=utf-8', body });
const activity = (kind, id, name) =>
  `<li class="activity activity-wrapper modtype_${kind}"><div class="activity-item" data-activityname="${name}"><div class="activityname"><a class="aalink stretched-link" href="${MOODLE}/mod/${kind}/view.php?id=${id}"><span class="instancename">${name}</span></a></div></div></li>`;
const loginPage = html(
  '<html><body id="page-login-index" class="pagelayout-login"><form id="login"><input name="username"><input name="password" type="password"></form></body></html>',
);
const pages = {
  '/course/view.php?id=42':
    html(`<!doctype html><html><body id="page-course-view-topics" class="pagelayout-course"><div id="region-main"><ul class="topics">
    <li class="section course-section main" data-sectionname="الأسبوع الأول"><h3 class="sectionname">الأسبوع الأول</h3><ul class="section">
      ${activity('resource', 101, 'المحاضرة الأولى')}
      ${activity('resource', 102, 'عرض الأسبوع')}
      ${activity('folder', 201, 'مجلد المراجع')}
      ${activity('page', 301, 'صفحة الشرح')}
      ${activity('book', 401, 'كتاب المساق')}
      ${activity('url', 501, 'رابط Drive')}
      ${activity('forum', 601, 'الإعلانات')}
      ${activity('assign', 701, 'التكليف الأول')}
    </ul>
    <div class="summary">
      <a href="${MOODLE}/pluginfile.php/9/course/section/1/syllabus.pdf">الخطة الدراسية</a>
      <a href="${MOODLE}/webservice/pluginfile.php/9/course/section/1/tokened.pdf?token=abc">رابط برمز</a>
      <a href="https://example.org/pluginfile.php/1/mod_resource/content/1/x.pdf">موقع آخر</a>
    </div></li></ul></div></body></html>`),
  '/mod/folder/view.php?id=201': html(
    `<a href="${MOODLE}/pluginfile.php/20/mod_folder/content/0/ref1.pdf?forcedownload=1">ref1.pdf</a><a href="${MOODLE}/pluginfile.php/20/mod_folder/content/0/old.rar?forcedownload=1">old.rar</a>`,
  ),
  '/mod/page/view.php?id=301': html(
    `<p>الشرح</p><iframe src="${MOODLE}/pluginfile.php/30/mod_page/content/3/notes.pdf#page=2"></iframe>`,
  ),
  '/mod/book/view.php?id=401': { status: 404, contentType: 'text/html', body: 'not found' },
  // Moodle answers redirect=1 with a 303 to the file; the fixture serves the file itself.
  '/mod/resource/view.php?id=101&redirect=1': {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="lecture1.pdf"',
    },
    body: pdf,
  },
  // Embedded display: Moodle answers with its own page even with redirect=1.
  '/mod/resource/view.php?id=102&redirect=1': html(
    `<div class="resourcecontent"><object data="${MOODLE}/pluginfile.php/11/mod_resource/content/2/slides.pptx" type="application/vnd.openxmlformats-officedocument.presentationml.presentation"></object></div>`,
  ),
  '/pluginfile.php/11/mod_resource/content/2/slides.pptx': {
    status: 200,
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    body: pptx,
  },
  // A markup file disguised by its name must still be refused.
  '/mod/resource/view.php?id=104&redirect=1': {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml',
      'content-disposition': 'attachment; filename="diagram.png"',
    },
    body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  },
  '/mod/resource/view.php?id=106&redirect=1': {
    status: 200,
    headers: {
      'content-type': 'application/rss+xml',
      'content-disposition': 'inline; filename="w.pdf"',
    },
    body: '<rss/>',
  },
  '/mod/resource/view.php?id=107&redirect=1': {
    status: 200,
    headers: { 'content-type': 'text/xsl', 'content-disposition': 'inline; filename="w.pdf"' },
    body: '<x/>',
  },
  // A generic type from the server is replaced by the type of the file extension.
  '/mod/resource/view.php?id=105&redirect=1': {
    status: 200,
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="notes.pdf"',
    },
    body: pdf,
  },
  // An expired session: Moodle shows its login page instead of the file.
  '/mod/resource/view.php?id=103&redirect=1': loginPage,
  '/login/index.php': loginPage,
};

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND'],
});
try {
  const context = await browser.newContext();
  const requested = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== MOODLE) return route.abort();
    const path = url.pathname + url.search;
    requested.push(path);
    const answer = pages[path];
    return answer ? route.fulfill(answer) : route.fulfill({ status: 404, body: '' });
  });
  await context.addInitScript(() => {
    globalThis.__listeners = [];
    globalThis.chrome = {
      runtime: { onMessage: { addListener: fn => globalThis.__listeners.push(fn) } },
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const openAt = async path => {
    await page.goto(MOODLE + path);
    await page.addScriptTag({ content: script });
  };
  const send = message =>
    page.evaluate(
      m =>
        new Promise(resolve => {
          for (const listener of globalThis.__listeners) listener(m, {}, resolve);
        }),
      message,
    );

  await openAt('/course/view.php?id=42');
  const scan = await send({ type: 'UCAS_MOODLE_FILES' });
  assert.equal(scan.courseId, '42', scan.error);
  assert.deepEqual(scan.files.map(f => f.url).sort(), [
    `${MOODLE}/mod/resource/view.php?id=101`,
    `${MOODLE}/mod/resource/view.php?id=102`,
    `${MOODLE}/pluginfile.php/20/mod_folder/content/0/ref1.pdf`,
    `${MOODLE}/pluginfile.php/30/mod_page/content/3/notes.pdf`,
    `${MOODLE}/pluginfile.php/9/course/section/1/syllabus.pdf`,
  ]);
  const notes = scan.files.find(f => f.url.endsWith('notes.pdf'));
  assert.equal(notes.section, 'الأسبوع الأول');
  assert.equal(notes.source, 'صفحة الشرح');
  assert.deepEqual(scan.report.activities, {
    resource: 2,
    folder: 1,
    page: 1,
    book: 1,
    url: 1,
    forum: 1,
    assign: 1,
  });
  assert.deepEqual(scan.report.unsupported, { '.rar': 1 });
  assert.equal(scan.report.untrusted, 2, 'token and other-site links are not trusted');
  assert.equal(scan.report.pages, 2);
  assert.equal(scan.report.pageErrors, 1, 'the missing book page is counted');
  assert.ok(!requested.some(p => p.includes('/mod/url/') || p.includes('/mod/forum/')));
  console.log('✓ discovery: resources, folders, pages, embedded files and a counts-only report');

  const lecture = await send({
    type: 'UCAS_MOODLE_FILE_OPEN',
    url: `${MOODLE}/mod/resource/view.php?id=101`,
    name: 'المحاضرة الأولى',
  });
  assert.equal(lecture.error, undefined, lecture.error);
  assert.deepEqual(
    [lecture.name, lecture.type, lecture.size],
    ['lecture1.pdf', 'application/pdf', pdf.length],
  );
  assert.ok(requested.includes('/mod/resource/view.php?id=101&redirect=1'));
  const chunk = await send({ type: 'UCAS_MOODLE_FILE_CHUNK', handle: lecture.handle, offset: 0 });
  assert.equal(Buffer.from(chunk.base64, 'base64').toString(), pdf.toString());
  await send({ type: 'UCAS_MOODLE_FILE_CLOSE', handle: lecture.handle });
  console.log('✓ resource download follows redirect=1 and transfers exact bytes');

  const slides = await send({
    type: 'UCAS_MOODLE_FILE_OPEN',
    url: `${MOODLE}/mod/resource/view.php?id=102`,
    name: 'عرض الأسبوع',
  });
  assert.equal(slides.error, undefined, slides.error);
  assert.equal(slides.name, 'slides.pptx');
  assert.equal(slides.size, pptx.length);
  assert.equal(
    slides.type,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  );
  await send({ type: 'UCAS_MOODLE_FILE_CLOSE', handle: slides.handle });
  console.log('✓ embedded-display resource falls back to its own file link (PPTX accepted)');

  for (const id of [104, 106, 107]) {
    const disguised = await send({
      type: 'UCAS_MOODLE_FILE_OPEN',
      url: `${MOODLE}/mod/resource/view.php?id=${id}`,
      name: 'مخطط',
    });
    assert.match(disguised.error || '', /غير مدعومة أو غير آمنة/, `resource ${id}`);
  }
  const generic = await send({
    type: 'UCAS_MOODLE_FILE_OPEN',
    url: `${MOODLE}/mod/resource/view.php?id=105`,
    name: 'ملاحظات',
  });
  assert.equal(generic.error, undefined, generic.error);
  assert.deepEqual([generic.name, generic.type], ['notes.pdf', 'application/pdf']);
  await send({ type: 'UCAS_MOODLE_FILE_CLOSE', handle: generic.handle });
  console.log('✓ SVG, RSS and XSL under document names are refused; types follow the extension');

  const expired = await send({
    type: 'UCAS_MOODLE_FILE_OPEN',
    url: `${MOODLE}/mod/resource/view.php?id=103`,
    name: 'x',
  });
  assert.equal(expired.code, 'login');
  await openAt('/login/index.php');
  const atLogin = await send({ type: 'UCAS_MOODLE_FILES' });
  assert.equal(atLogin.code, 'login');
  assert.match(atLogin.error, /انتهت جلسة Moodle/);
  console.log('✓ expired session is reported as login, not as a generic error');

  assert.deepEqual(errors, []);
  console.log('companion-extension-browser: ok');
} finally {
  await browser.close();
}
