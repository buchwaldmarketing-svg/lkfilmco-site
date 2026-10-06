// Inquiry form: one simple page. Checks the required fields, sends to Formspree,
// and swaps in a personal confirmation. Without JS it posts normally.
(() => {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const track = (name, params) => { if (window.gtag) gtag('event', name, params || {}); };
  const date = $('sf-date');
  // /ready is the "booking this week" form: budget is required and must be one number.
  const ready = form.dataset.kind === 'ready';
  const btnLabel = $('sf-btn').textContent;

  // Exact date only, never in the past.
  const t = new Date();
  date.min = new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const pretty = () => new Date(date.value + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // A collection link (/contact?c=signature) pre-picks that collection.
  const key = new URLSearchParams(location.search).get('c');
  const opt = key && form.querySelector(`#sf-collection option[data-key="${key}"]`);
  if (opt) opt.selected = true;
  form.querySelectorAll('select').forEach((s) => {
    const mark = () => s.classList.toggle('has-value', s.value !== '');
    s.addEventListener('change', mark);
    mark();
  });

  const rules = {
    names: [$('sf-names'), () => $('sf-names').value.trim() ? '' : 'Add your names so I know who I\'m writing to.'],
    email: [$('sf-email'), () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('sf-email').value.trim()) ? '' : 'Add an email I can reply to.'],
    date: [date, () => !date.value ? 'Pick your wedding date.' : date.value < date.min ? 'That date has already passed.' : ''],
    venue: [$('sf-venue'), () => $('sf-venue').value.trim() ? '' : 'A venue or city is plenty.'],
  };
  if (ready) {
    const budget = $('sf-budget');
    rules.budget = [budget, () => {
      const v = budget.value.trim();
      if (!/\d/.test(v)) return 'Add your budget. One number is perfect.';
      if (/\d\s*(-|–|to)\s*\$?\d/i.test(v)) return 'One number please, like $3,000.';
      return '';
    }];
  }
  const check = (k) => {
    const [el, rule] = rules[k];
    const msg = rule();
    $('err-' + k).textContent = msg;
    el.setAttribute('aria-invalid', String(Boolean(msg)));
    return !msg;
  };
  Object.entries(rules).forEach(([k, [el]]) => el.addEventListener('blur', () => { if (el.value) check(k); }));

  let started = false;
  form.addEventListener('focusin', () => { if (!started) { started = true; track('form_start', { form: 'inquiry' }); } });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bad = Object.keys(rules).filter((k) => !check(k));
    if (bad.length) { rules[bad[0]][0].focus(); return; }
    $('sf-date-summary').value = pretty();
    $('sf-subject').value = ready
      ? `READY TO BOOK THIS WEEK: ${$('sf-names').value.trim()} · ${pretty()} · ${$('sf-budget').value.trim()}`
      : `New inquiry: ${$('sf-names').value.trim()} · ${pretty()}`;
    const btn = $('sf-btn');
    btn.textContent = 'Sending…';
    btn.disabled = true;
    $('err-send').textContent = '';
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error();
      if (window.fbq) fbq('track', 'Lead', { content_name: ready ? 'Ready To Book' : 'Contact Form' });
      track('generate_lead', { method: ready ? 'ready_form' : 'contact_form', collection: $('sf-collection').value || 'none', source: $('sf-source').value || 'none' });
      const first = $('sf-names').value.trim().split(/\s+/)[0];
      $('sf-done-h').textContent = `Got it, ${first}.`;
      $('sf-done-p').textContent = ready
        ? `I'll send your special pricing for ${pretty()} from bookings@lkfilmco.com within 24 hours.`
        : `I'm checking ${pretty()} now and will email you from bookings@lkfilmco.com within 24 hours.`;
      form.hidden = true;
      const done = $('sf-done');
      done.hidden = false;
      $('sf-film').innerHTML = '<iframe src="https://galleries.vidflow.co/videos/krjjtssa" title="Christy + Brian wedding film" allow="autoplay; fullscreen" allowfullscreen loading="lazy"></iframe>';
      done.focus({ preventScroll: true });
      done.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    } catch {
      $('err-send').innerHTML = 'That didn\'t go through. Text me at <a href="sms:+12145774801">214-577-4801</a> or email <a href="mailto:bookings@lkfilmco.com">bookings@lkfilmco.com</a>.';
      btn.textContent = btnLabel;
      btn.disabled = false;
    }
  });
})();
