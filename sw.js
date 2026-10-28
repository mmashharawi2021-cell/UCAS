// Service worker: caches the public app shell only — never user data.
// Bump VERSION on every release (keep it equal to package.json "version").
const VERSION = '1.1.0';
const CACHE = `ucas-bridge-shell-${VERSION}`;
const SHELL = [
  './',
  './index.html',
  `./js/boot.js?v=${VERSION}`,
  `./styles.css?v=${VERSION}`,
  `./js/app.js?v=${VERSION}`,
  `./js/store.js?v=${VERSION}`,
  `./js/ics.js?v=${VERSION}`,
  `./js/office.js?v=${VERSION}`,
  `./js/moodle.js?v=${VERSION}`,
  `./js/mhtml.js?v=${VERSION}`,
  `./js/drive.js?v=${VERSION}`,
  `./js/study.js?v=${VERSION}`,
  `./js/pdf-text.js?v=${VERSION}`,
  `./js/ocr.js?v=${VERSION}`,
  `./js/features/ai.js?v=${VERSION}`,
  `./js/features/account.js?v=${VERSION}`,
  `./js/cloud/sync.js?v=${VERSION}`,
  `./js/lib/code-highlight.js?v=${VERSION}`,
  `./js/lib/semester.js?v=${VERSION}`,
  `./js/lib/cloud.js?v=${VERSION}`,
  `./js/features/push.js?v=${VERSION}`,
  `./js/features/groups.js?v=${VERSION}`,
  `./js/cloud/config.js?v=${VERSION}`,
  `./js/cloud/client.js?v=${VERSION}`,
  `./js/ui.js?v=${VERSION}`,
  `./js/lib/countdown.js?v=${VERSION}`,
  `./js/lib/focus.js?v=${VERSION}`,
  `./js/lib/grades.js?v=${VERSION}`,
  `./js/lib/ics-export.js?v=${VERSION}`,
  `./js/lib/pack.js?v=${VERSION}`,
  `./js/lib/question-import.js?v=${VERSION}`,
  `./js/lib/report.js?v=${VERSION}`,
  `./js/lib/review.js?v=${VERSION}`,
  `./js/lib/timetable.js?v=${VERSION}`,
  `./js/features/exams.js?v=${VERSION}`,
  `./js/features/focus.js?v=${VERSION}`,
  `./js/features/grades.js?v=${VERSION}`,
  `./js/features/index.js?v=${VERSION}`,
  `./js/features/notes.js?v=${VERSION}`,
  `./js/features/reminders.js?v=${VERSION}`,
  `./js/features/report.js?v=${VERSION}`,
  `./js/features/schedule.js?v=${VERSION}`,
  `./js/features/share.js?v=${VERSION}`,
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

  // Static files: network first, cache as offline fallback. Online, every load gets the
  // files of one single release, so a new app.js can never run with an old store.js.
  if (!CACHEABLE.test(url.pathname)) return;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      fetch(request, { cache: 'no-cache' })
        .then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(async () => (await cache.match(request)) || Response.error()),
    ),
  );
});

// ---------- Web Push (optional online feature) ----------
self.addEventListener('push', e => {
  let data;
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: 'UCAS Bridge', body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(String(data.title || 'UCAS Bridge').slice(0, 120), {
      body: String(data.body || '').slice(0, 300),
      tag: data.tag ? String(data.tag).slice(0, 120) : undefined,
      icon: './assets/icon-192.png',
      badge: './assets/icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      data: { url: typeof data.url === 'string' ? data.url : './' },
    }),
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './', self.registration.scope);
  // Only ever open pages of this app.
  const url = target.origin === self.location.origin ? target.href : self.registration.scope;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate?.(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
