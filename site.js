// Shared behavior for every page: phone menu, film pop-up, lazy video loops, hero pause.
(() => {
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  const nav = document.getElementById('site-nav') || document.querySelector('nav');
  const ham = document.querySelector('.n-ham');
  const links = document.querySelector('.n-links');

  // Ready-to-book bar: every page except the offer pages, closable, slides away on scroll.
  // To turn it off site-wide, set READY_BAR to false.
  const READY_BAR = true;
  const path = location.pathname.replace(/\.html$/, '');
  const store = (fn) => { try { return fn(sessionStorage); } catch { return null; } };
  if (READY_BAR && !['/ready', '/1500', '/photobundle'].includes(path) && store((s) => s.getItem('rbClosed')) !== '1') {
    const bar = document.createElement('div');
    bar.className = 'rb';
    bar.innerHTML = '<a class="rb-link" href="/ready"><span class="rb-long">Ready to book this week? <u>Ask for special pricing</u></span><span class="rb-short">Booking this week? <u>Get special pricing</u></span></a><button class="rb-x" type="button" aria-label="Close">&times;</button>';
    document.body.prepend(bar);
    document.body.classList.add('has-rb');
    requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('rb-anim')));
    const onScroll = () => document.body.classList.toggle('rb-up', scrollY > 60);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    bar.querySelector('.rb-link').addEventListener('click', () => { if (window.gtag) gtag('event', 'ready_bar_click', { page: path || '/' }); });
    bar.querySelector('.rb-x').addEventListener('click', () => {
      bar.remove();
      document.body.classList.remove('has-rb', 'rb-up');
      removeEventListener('scroll', onScroll);
      store((s) => s.setItem('rbClosed', '1'));
    });
  }

  // Phone menu: solid bar while open, focus moves in, Escape closes and returns focus.
  // The page's own script toggles .open; this listener runs after it.
  if (nav && ham && links) {
    const sync = () => {
      const open = links.classList.contains('open');
      nav.classList.toggle('is-menu', open);
      if (open) {
        links.style.top = nav.getBoundingClientRect().bottom + 'px';
        links.querySelector('a')?.focus();
      } else {
        links.style.top = '';
      }
    };
    ham.addEventListener('click', sync);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && links.classList.contains('open')) {
        ham.click();
        ham.focus();
      }
    });
  }

  // Film pop-up: page behind goes inert, background videos pause, focus moves to Close and back.
  const modal = document.getElementById('film-modal');
  if (modal) {
    const wrap = modal.querySelector('.modal-wrap');
    const close = document.getElementById('film-close');
    const cap = document.createElement('div');
    cap.className = 'modal-cap';
    cap.innerHTML = '<span class="modal-name"></span><a class="modal-book" href="/contact">Check your date</a>';
    wrap.appendChild(cap);
    const name = cap.querySelector('.modal-name');
    let opener = null;
    let paused = [];
    document.querySelectorAll('[data-vid]').forEach((b) => {
      b.addEventListener('click', () => {
        opener = b;
        name.textContent = b.querySelector('.lx-film-name')?.textContent.trim() || '';
      }, true);
    });
    const behind = () => [document.querySelector('main'), document.querySelector('footer'), nav].filter(Boolean);
    new MutationObserver(() => {
      const open = modal.classList.contains('open');
      behind().forEach((el) => { el.inert = open; });
      if (open) {
        paused = [...document.querySelectorAll('video')].filter((v) => !v.paused);
        paused.forEach((v) => v.pause());
        setTimeout(() => close.focus(), 60);
      } else {
        paused.forEach((v) => v.play().catch(() => {}));
        paused = [];
        opener?.focus({ preventScroll: true });
      }
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    cap.querySelector('.modal-book').addEventListener('click', () => close.click());
  }

  // Video loops (Approach clips, first film cover): load near the screen, play only while visible.
  const loops = document.querySelectorAll('video.lk-clip, video.lx-film-loop');
  if (loops.length && !calm && !saveData && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach(({ target: v, isIntersecting: on }) => {
      const src = v.querySelector('source[data-src]');
      if (on && src) {
        src.src = src.dataset.src;
        src.removeAttribute('data-src');
        v.load();
        v.addEventListener('playing', () => v.classList.add('is-playing'), { once: true });
      }
      if (on) v.play().catch(() => {});
      else v.pause();
    }), { rootMargin: '200px 0px' });
    loops.forEach((v) => io.observe(v));
  }

  // Hero: pause button for the background video.
  const hero = document.getElementById('hero-mp4');
  const pause = document.getElementById('hero-pause');
  if (hero && pause) {
    const label = () => {
      const stopped = hero.paused;
      pause.setAttribute('aria-label', stopped ? 'Play background video' : 'Pause background video');
      pause.classList.toggle('is-paused', stopped);
    };
    pause.addEventListener('click', () => {
      if (hero.paused) hero.play().catch(() => {});
      else hero.pause();
    });
    hero.addEventListener('play', label);
    hero.addEventListener('pause', label);
    label();
  }
})();
