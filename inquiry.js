// Inquiry form: one question per screen. Tap answers move ahead on their own,
// Enter works for typed answers, and the confirmation is personal.
// Without JS every question shows on one page and the form posts normally.
(() => {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const screens = [...form.querySelectorAll('.cq-screen')];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const track = (name, params) => { if (window.gtag) gtag('event', name, params || {}); };
  const val = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value || '';
  let at = 0;

  form.classList.add('is-live');

  // A collection link (/contact?c=signature) pre-picks that collection.
  const key = new URLSearchParams(location.search).get('c');
  const pick = key && form.querySelector(`input[name="collection"][data-key="${key}"]`);
  if (pick) pick.checked = true;

  // Exact date only, and never in the past.
  const day = $('cq-day');
  const t = new Date();
  day.min = new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  day.addEventListener('change', () => { if (day.value) $('err-when').textContent = ''; });
  const pretty = () => new Date(day.value + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Single-tap questions move ahead after a beat; "Our planner" asks for the name instead.
  screens.filter((s) => s.hasAttribute('data-auto')).forEach((s) => {
    s.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', () => {
      if (r.id === 'cq-src-planner') return;
      setTimeout(next, calm ? 0 : 320);
    }));
  });
  form.querySelectorAll('input[name="source"]').forEach((r) => r.addEventListener('change', () => {
    $('cq-planner-row').hidden = !$('cq-src-planner').checked;
    if ($('cq-src-planner').checked) $('cq-planner-row').querySelector('input').focus();
  }));

  const rules = {
    when: () => !day.value ? 'Pick your wedding date.' : day.value < day.min ? 'That date has already passed.' : '',
    where: () => $('cq-venue').value.trim() ? '' : 'A venue or city is plenty.',
    names: () => $('cq-names').value.trim() ? '' : 'Add your names so I know who I\'m writing to.',
    reach: () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('cq-email').value.trim()) ? '' : 'Add an email I can reply to.',
  };
  const valid = (s) => {
    const rule = rules[s.dataset.name];
    if (!rule) return true;
    const msg = rule();
    const err = s.querySelector('.cq-err');
    if (err) err.textContent = msg;
    s.querySelectorAll('input[required]').forEach((i) => i.setAttribute('aria-invalid', String(Boolean(msg))));
    return !msg;
  };

  const show = (i, dir = 1) => {
    at = Math.max(0, Math.min(i, screens.length - 1));
    screens.forEach((s, n) => {
      s.hidden = n !== at;
      s.classList.toggle('from-back', n === at && dir < 0);
    });
    const last = at === screens.length - 1;
    $('cq-next').hidden = last;
    $('cq-send').hidden = !last;
    $('cq-back').style.visibility = at === 0 ? 'hidden' : 'visible';
    $('cq-count').textContent = `${at + 1} of ${screens.length}`;
    $('cq-bar').style.width = `${((at + 1) / screens.length) * 100}%`;
    const field = screens[at].querySelector('input[type=text], input[type=email], textarea');
    if (field && !matchMedia('(pointer: coarse)').matches) field.focus({ preventScroll: true });
    const card = form.closest('.cq-card');
    if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  };
  const next = () => {
    const s = screens[at];
    if (!valid(s)) { s.querySelector('[aria-invalid="true"]')?.focus(); return; }
    track('form_step_complete', { form: 'inquiry', step: s.dataset.name, step_number: at + 1 });
    if (at < screens.length - 1) show(at + 1, 1);
  };
  $('cq-next').addEventListener('click', next);
  $('cq-back').addEventListener('click', () => show(at - 1, -1));
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && at < screens.length - 1) {
      e.preventDefault();
      next();
    }
  });

  let started = false;
  form.addEventListener('focusin', () => { if (!started) { started = true; track('form_start', { form: 'inquiry' }); } });
  form.addEventListener('change', () => { if (!started) { started = true; track('form_start', { form: 'inquiry' }); } });

  const whenText = () => pretty();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bad = screens.findIndex((s) => !valid(s));
    if (bad !== -1) { show(bad); return; }
    $('cq-date-summary').value = whenText();
    $('cq-subject').value = `New inquiry: ${$('cq-names').value.trim()} · ${whenText()}`;
    const btn = $('cq-send');
    btn.textContent = 'Sending…';
    btn.disabled = true;
    $('err-send').textContent = '';
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error();
      if (window.fbq) fbq('track', 'Lead', { content_name: 'Contact Form' });
      track('generate_lead', { method: 'contact_form', collection: val('collection') || 'none', source: val('source') || 'none' });

      const first = $('cq-names').value.trim().split(/\s+/)[0];
      $('cq-done-h').textContent = `Got it, ${first}.`;
      $('cq-done-p').textContent = `I'm checking ${pretty()} now and will email you from bookings@lkfilmco.com within 24 hours.`;
      form.hidden = true;
      document.querySelector('.cq-top').hidden = true;
      document.querySelector('.cq-bar').hidden = true;
      const done = $('cq-done');
      done.hidden = false;
      $('cq-film').innerHTML = '<iframe src="https://galleries.vidflow.co/videos/krjjtssa" title="Christy + Brian wedding film" allow="autoplay; fullscreen" allowfullscreen loading="lazy"></iframe>';
      done.focus({ preventScroll: true });
      done.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    } catch {
      $('err-send').innerHTML = 'That didn\'t go through. Text me at <a href="sms:+12145774801">214-577-4801</a> or email <a href="mailto:bookings@lkfilmco.com">bookings@lkfilmco.com</a>.';
      btn.textContent = 'Check my date';
      btn.disabled = false;
    }
  });

  show(0);
})();
