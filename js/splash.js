// Independent of app imports: a broken module graph must never trap the opening overlay.
(() => {
  const splash = document.getElementById('ucas-splash');
  const app = document.getElementById('app');
  if (!splash || !app) return;
  const root = document.documentElement;
  const KEY = 'ucas-splash-seen';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const started = performance.now();
  let quick = false;
  try {
    quick = sessionStorage.getItem(KEY) === '1';
  } catch {
    /* private storage */
  }
  splash.dataset.mode = reduced.matches ? 'reduced' : quick ? 'quick' : 'full';
  const timing = quick
    ? {
        bg: 160,
        cap: 260,
        dCap: 60,
        tas: 160,
        dTas: 260,
        name: 260,
        dName: 300,
        sub: 220,
        dSub: 380,
        wait: 720,
        fly: 480,
      }
    : {
        bg: 640,
        cap: 1300,
        dCap: 500,
        tas: 520,
        dTas: 1700,
        name: 1400,
        dName: 1900,
        sub: 1000,
        dSub: 2600,
        wait: 4500,
        fly: 1500,
      };
  const vars = {
    't-bg': timing.bg,
    't-cap': timing.cap,
    'd-cap': timing.dCap,
    't-tas': timing.tas,
    'd-tas': timing.dTas,
    't-name': timing.name,
    'd-name': timing.dName,
    't-sub': timing.sub,
    'd-sub': timing.dSub,
    't-fly': timing.fly,
  };
  for (const [key, value] of Object.entries(vars))
    splash.style.setProperty(`--${key}`, `${value}ms`);
  root.classList.add('splash-active');
  splash.classList.add('splash-playing');
  app.inert = true;
  let done = false;
  let ready = false;
  let flightTimer;
  const animations = [];
  const MAX_WAIT = 9000;
  const deadline = setTimeout(finish, MAX_WAIT);

  function finish() {
    if (done) return;
    done = true;
    clearTimeout(deadline);
    clearTimeout(flightTimer);
    splash.hidden = true;
    app.inert = false;
    root.classList.remove('splash-active');
    animations.forEach(animation => animation.cancel());
    window.removeEventListener('ucas-ready', onReady);
    window.removeEventListener('ucas-boot-error', finish);
    window.removeEventListener('error', onError);
    window.removeEventListener('resize', onResize);
    reduced.removeEventListener('change', onReducedMotion);
    if (ready) {
      try {
        sessionStorage.setItem(KEY, '1');
      } catch {
        /* private storage */
      }
    }
  }
  function animate(el, frames, duration) {
    const animation = el.animate(frames, {
      duration,
      easing: 'cubic-bezier(0.65, 0, 0.25, 1)',
      fill: 'forwards',
    });
    animations.push(animation);
    return animation;
  }
  // Lets the splash take its hands off the page: the app is usable while the overlay fades.
  function release() {
    splash.style.pointerEvents = 'none';
    app.inert = false;
  }
  function fade(duration) {
    release();
    animate(splash, [{ opacity: 1 }, { opacity: 0 }], duration).finished.then(finish, finish);
  }
  // FLIP: the splash copy moves from its own box to the real (hidden) part, centre to centre.
  // Text scales by height (font size) so the landed name matches the sidebar/top-bar text.
  // Text is measured by its glyph box on both sides (a block line box and an inline span differ).
  function box(el, text) {
    if (!el || !text) return el?.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect();
  }
  function fly(from, to, duration, byHeight) {
    const a = box(from, byHeight);
    const b = box(to, byHeight);
    if (!a.width || !b?.width || !b.height)
      return animate(from, [{ opacity: 1 }, { opacity: 0 }], duration / 2);
    const scale = byHeight ? b.height / a.height : b.width / a.width;
    const dx = b.left + b.width / 2 - a.left - a.width / 2;
    const dy = b.top + b.height / 2 - a.top - a.height / 2;
    return animate(
      from,
      [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }],
      duration,
    );
  }
  function land() {
    if (done) return;
    try {
      if (!splash.animate) return finish();
      const phone = matchMedia('(max-width: 860px)').matches;
      const destination = document.querySelector(phone ? '.mobile-brand' : '.sidebar .logo');
      const mark = destination?.querySelector('[data-brand-part="mark"]');
      const left = MAX_WAIT - (performance.now() - started);
      // Reduced motion, no visible destination, or too late for a full flight: a short fade.
      if (reduced.matches || !mark?.getBoundingClientRect().width || left < timing.fly + 150)
        return fade(200);
      splash.dataset.phase = 'landing';
      const flights = [fly(splash.querySelector('.splash-mark'), mark, timing.fly, false)];
      flights.push(
        fly(
          splash.querySelector('.splash-title'),
          destination.querySelector('[data-brand-part="title"]'),
          timing.fly,
          true,
        ),
      );
      // The phone bar has no subtitle: it fades out instead of flying.
      flights.push(
        fly(
          splash.querySelector('.splash-sub'),
          destination.querySelector('[data-brand-part="subtitle"]'),
          timing.fly,
          true,
        ),
      );
      // Reveal the real parts only when every copy has landed (no double logo, no jump).
      Promise.all(flights.map(flight => flight.finished)).then(finish, finish);
    } catch {
      finish();
    }
  }
  function onReady() {
    if (done || ready) return;
    ready = true;
    flightTimer = setTimeout(
      land,
      reduced.matches ? 0 : Math.max(0, timing.wait - (performance.now() - started)),
    );
  }
  function onError() {
    if (!window.__ucasBooted) finish();
  }
  function onResize() {
    if (splash.dataset.phase === 'landing') finish();
  }
  function onReducedMotion() {
    if (reduced.matches && ready) finish();
  }
  window.addEventListener('ucas-ready', onReady);
  window.addEventListener('ucas-boot-error', finish);
  window.addEventListener('error', onError);
  window.addEventListener('resize', onResize);
  reduced.addEventListener('change', onReducedMotion);
  if (window.__ucasBooted) onReady();
})();
