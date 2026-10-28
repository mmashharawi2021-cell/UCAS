// Boot guard (classic script, runs before the app module).
// After an update, an old service worker and the browser's HTTP cache may serve files
// from the previous release next to new ones; the app module then fails to load or to
// open the database. If the app has not started, clean up and reload once.
(function () {
  var KEY = 'ucas-cache-recovery';

  function each(list, fn) {
    return Promise.all(list.map(fn));
  }
  function clearCaches() {
    return window.caches
      ? caches.keys().then(function (keys) {
          return each(keys, function (k) {
            return caches.delete(k);
          });
        })
      : Promise.resolve();
  }
  function unregister() {
    return navigator.serviceWorker && navigator.serviceWorker.getRegistrations
      ? navigator.serviceWorker.getRegistrations().then(function (regs) {
          return each(regs, function (r) {
            return r.unregister();
          });
        })
      : Promise.resolve();
  }
  // Re-download every app file listed in the new service worker, bypassing the HTTP cache.
  function refreshFiles() {
    return fetch('sw.js', { cache: 'no-store' })
      .then(function (r) {
        return r.text();
      })
      .then(function (text) {
        var files = ['styles.css'];
        var re = /\.\/(js\/[\w/.-]+\.js)/g;
        var m;
        while ((m = re.exec(text))) if (files.indexOf(m[1]) < 0) files.push(m[1]);
        return each(files, function (f) {
          return fetch(f, { cache: 'reload' }).catch(function () {});
        });
      })
      .catch(function () {});
  }

  function recover() {
    if (window.__ucasBooted || !navigator.onLine) return;
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, '1');
    } catch (e) {
      return;
    }
    function reload() {
      location.reload();
    }
    unregister()
      .then(clearCaches)
      .then(refreshFiles)
      .then(clearCaches) // the old worker may have re-cached while refreshing
      .then(reload, reload);
  }

  window.__ucasRecover = recover;
  // A module that cannot be linked (missing export) reports here, before the app runs.
  window.addEventListener('error', function () {
    if (!window.__ucasBooted) recover();
  });
  // Safety net: the app normally boots in well under a second.
  setTimeout(recover, 10000);
})();
