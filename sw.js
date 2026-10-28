// Service worker: caches the public app shell only — never user data.
// Bump VERSION on every release (keep it equal to package.json "version").
const VERSION = '0.9.0';
const CACHE = `ucas-bridge-shell-${VERSION}`;
const SHELL = [
  './',
  './index.html',
  `./styles.css?v=${VERSION}`,
  `./js/app.js?v=${VERSION}`,
  './js/store.js',
  './js/ics.js',
  './js/office.js',
  './js/moodle.js',
  './js/mhtml.js',
  './js/drive.js',
  './js/study.js',
  './js/pdf-text.js',
  './js/ocr.js',
  './js/ui.js',
  './js/lib/countdown.js',
  './js/lib/focus.js',
  './js/lib/grades.js',
  './js/lib/ics-export.js',
  './js/lib/pack.js',
  './js/lib/question-import.js',
  './js/lib/report.js',
  './js/lib/review.js',
  './js/lib/timetable.js',
  './js/features/exams.js',
  './js/features/focus.js',
  './js/features/grades.js',
  './js/features/index.js',
  './js/features/notes.js',
  './js/features/reminders.js',
  './js/features/report.js',
  './js/features/schedule.js',
  './js/features/share.js',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/apple-touch-icon.png',
  './manifest.webmanifest',
];
const CACHEABLE = /\.(js|css|svg|png|webmanifest|html)$/;

self.addEventListener('install', e => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k.startsWith('ucas-bridge-shell-') && k !== CACHE)
            .map(k => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const request = e.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Pages: network first so deployments show up immediately; offline → cached shell.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // Static files: stale-while-revalidate — answer from cache instantly, refresh in background
  // so an unversioned module can never stay stale for more than one load.
  if (!CACHEABLE.test(url.pathname)) return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      if (cached) {
        e.waitUntil(network);
        return cached;
      }
      return network;
    }),
  );
});
