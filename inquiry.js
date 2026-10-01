// Inquiry form: two short steps, inline checks, sends to Formspree, personal confirmation.
// Without JS both steps show and the form posts normally.
(() => {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const step1 = $('iq-step-1'), step2 = $('iq-step-2');
  const month = $('iq-month'), year = $('iq-year'), noDate = $('iq-nodate'), day = $('iq-day');
  const venue = $('iq-venue'), names = $('iq-names'), email = $('iq-email');
  const track = (name, params) => { if (window.gtag) gtag('event', name, params || {}); };

  form.classList.add('is-stepped');
  step2.hidden = true;

  // Dates: no past days; picking an exact day fills month + year.
  const t = new Date();
  day.min = new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  day.addEventListener('change', () => {
    if (!day.value) return;
    const d = new Date(day.value + 'T12:00:00');
    month.value = d.toLocaleString('en-US', { month: 'long' });
    year.value = String(d.getFullYear());
    noDate.checked = false;
    syncNoDate();
    check('when');
  });
  const syncNoDate = () => {
    [month, year].forEach((s) => { s.disabled = noDate.checked; });
    form.classList.toggle('no-date', noDate.checked);
  };
  noDate.addEventListener('change', () => { syncNoDate(); check('when'); });

  // A collection link (/contact?c=signature) pre-picks that collection.
  const key = new URLSearchParams(location.search).get('c');
  const pick = key && form.querySelector(`input[name="collection"][data-key="${key}"]`);
  if (pick) pick.checked = true;

  // "Our planner" asks for the planner's name.
  form.querySelectorAll('input[name="source"]').forEach((r) => r.addEventListener('change', () => {
    $('iq-planner-row').hidden = !$('iq-src-planner').checked;
  }));

  // Inline checks: on leaving a field, and all at once on Next / Send.
  const rules = {
    when: () => noDate.checked || (month.value && year.value) ? '' : 'Pick a month and year, or tick "No date yet".',
    venue: () => venue.value.trim() ? '' : 'A venue or city is plenty.',
    names: () => names.value.trim() ? '' : 'Add your names so I know who I\'m writing to.',
    email: () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) ? '' : 'Add an email I can reply to.',
  };
  const fields = { when: [month, year], venue: [venue], names: [names], email: [email] };
  const check = (k) => {
    const msg = rules[k]();
    $('err-' + k).textContent = msg;
    fields[k].forEach((el) => el.setAttribute('aria-invalid', String(Boolean(msg))));
    return !msg;
  };
  venue.addEventListener('blur', () => venue.value && check('venue'));
  names.addEventListener('blur', () => names.value && check('names'));
  email.addEventListener('blur', () => email.value && check('email'));
  [month, year].forEach((s) => s.addEventListener('change', () => { if (month.value && year.value) check('when'); }));

  let started = false;
  form.addEventListener('focusin', () => { if (!started) { started = true; track('form_start', { form: 'inquiry' }); } });

  const show = (n) => {
    step1.hidden = n !== 1;
    step2.hidden = n !== 2;
    const target = n === 1 ? step1 : step2;
    target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    (target.querySelector('input:not([type=hidden]):not(:disabled), select:not(:disabled)'))?.focus({ preventScroll: true });
  };

  $('iq-next').addEventListener('click', () => {
    const ok = [check('when'), check('venue')].every(Boolean);
    if (!ok) { (form.querySelector('[aria-invalid="true"]'))?.focus(); return; }
    track('form_step_1_complete', { form: 'inquiry', date_known: noDate.checked ? 'no' : 'yes' });
    show(2);
  });
  $('iq-back').addEventListener('click', () => show(1));

  const whenText = () => {
    if (noDate.checked) return 'No date yet';
    const base = `${month.value} ${year.value}`;
    return day.value ? `${base} (${new Date(day.value + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })})` : base;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!step1.hidden || ![check('when'), check('venue')].every(Boolean)) { $('iq-next').click(); return; }
    const ok = [check('names'), check('email')].every(Boolean);
    if (!ok) { (step2.querySelector('[aria-invalid="true"]'))?.focus(); return; }

    $('iq-date-summary').value = whenText();
    $('iq-subject').value = `New inquiry: ${names.value.trim()} · ${whenText()}`;
    const btn = $('iq-submit');
    btn.textContent = 'Sending…';
    btn.disabled = true;
    $('err-send').textContent = '';
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error();
      const collection = form.querySelector('input[name="collection"]:checked')?.value || 'none';
      const source = form.querySelector('input[name="source"]:checked')?.value || 'none';
      if (window.fbq) fbq('track', 'Lead', { content_name: 'Contact Form' });
      track('generate_lead', { method: 'contact_form', collection, source, date_known: noDate.checked ? 'no' : 'yes' });

      const first = names.value.trim().split(/\s+/)[0];
      const when = noDate.checked ? 'your plans' : `${month.value} ${year.value}`;
      $('iq-done-h').textContent = `Got it, ${first}.`;
      $('iq-done-p').textContent = noDate.checked
        ? 'I\'ll email you from bookings@lkfilmco.com within 24 hours with my collections.'
        : `I'm checking ${when} now and will email you from bookings@lkfilmco.com within 24 hours.`;
      form.hidden = true;
      const done = $('iq-done');
      done.hidden = false;
      $('iq-film').innerHTML = '<iframe src="https://galleries.vidflow.co/videos/krjjtssa" title="Christy + Brian wedding film" allow="autoplay; fullscreen" allowfullscreen loading="lazy"></iframe>';
      done.focus({ preventScroll: true });
      done.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      $('err-send').innerHTML = 'That didn\'t go through. Text me at <a href="sms:+12145774801">214-577-4801</a> or email <a href="mailto:bookings@lkfilmco.com">bookings@lkfilmco.com</a>.';
      btn.textContent = 'Check my date';
      btn.disabled = false;
    }
  });
})();
