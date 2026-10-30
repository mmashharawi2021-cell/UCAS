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
        wait: 620,
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
  const deadline = setTimeout(finish, 9000);

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
  function fly(from, to, duration) {
    const a = from.getBoundingClientRect();
    const b = to?.getBoundingClientRect();
    if (!b?.width || !b.height) return animate(from, [{ opacity: 1 }, { opacity: 0 }], duration);
    const dx = b.left + b.width / 2 - a.left - a.width / 2;
    const dy = b.top + b.height / 2 - a.top - a.height / 2;
    return animate(
      from,
      [
        { transform: 'none' },
        {
          transform: `translate(${dx}px, ${dy}px) scale(${b.width / a.width}, ${b.height / a.height})`,
        },
      ],
      duration,
    );
  }
  function land() {
    if (done) return;
    try {
      if (reduced.matches || !splash.animate) {
        if (!splash.animate) return finish();
        animate(splash, [{ opacity: 1 }, { opacity: 0 }], 200).finished.then(finish, finish);
        return;
      }
      splash.dataset.phase = 'landing';
      const destination = document.querySelector(
        matchMedia('(max-width: 860px)').matches ? '.mobile-brand' : '.sidebar .logo',
      );
      if (!destination) return finish();
      splash.style.background = 'transparent';
      animate(
        splash,
        [{ backgroundColor: '#102a4d' }, { backgroundColor: 'transparent' }],
        timing.fly,
      );
      fly(
        splash.querySelector('.splash-mark'),
        destination.querySelector('[data-brand-part="mark"]'),
        timing.fly,
      );
      const title = fly(
        splash.querySelector('.splash-title'),
        destination.querySelector('[data-brand-part="title"]'),
        timing.fly,
      );
      fly(
        splash.querySelector('.splash-sub'),
        destination.querySelector('[data-brand-part="subtitle"]'),
        timing.fly,
      );
      title.finished.then(finish, finish);
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
