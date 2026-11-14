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
  // /blackfriday is the sale claim form: package is required.
  const bf = form.dataset.kind === 'bf';
  const btnLabel = $('sf-btn').textContent;

  // Exact date only, never in the past.
  const t = new Date();
  date.min = new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  // Black Friday form has a "No date yet" box.
  const nodate = $('sf-nodate');
  const noDate = () => Boolean(nodate && nodate.checked);
  if (nodate) nodate.addEventListener('change', () => {
    date.disabled = nodate.checked;
    if (nodate.checked) { date.value = ''; $('err-date').textContent = ''; date.setAttribute('aria-invalid', 'false'); }
  });
  const pretty = () => noDate() ? 'No date yet' : new Date(date.value + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

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
    email: [$('sf-email'), () => (bf && !$('sf-email').value.trim()) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('sf-email').value.trim()) ? '' : 'Add an email I can reply to.'],
    date: [date, () => noDate() ? '' : !date.value ? 'Pick your wedding date.' : date.value < date.min ? 'That date has already passed.' : ''],
    venue: [$('sf-venue'), () => $('sf-venue').value.trim() ? '' : 'A venue or city is plenty.'],
    phone: [$('sf-phone'), () => $('sf-phone').value.replace(/\D/g, '').length >= 10 ? '' : 'Add a number I can text.'],
  };
  if (ready) {
    // Booking form: collection, retainer payment, next step, and the 48-hour commitment are required.
    rules.collection = [$('sf-collection'), () => $('sf-collection').value ? '' : 'Pick your collection.'];
    rules.pay = [$('sf-pay'), () => $('sf-pay').value ? '' : 'Pick how you\'ll pay the retainer.'];
    rules.next = [$('sf-next'), () => $('sf-next').value ? '' : 'Contract now or a quick call first?'];
    rules.commit = [$('sf-commit'), () => $('sf-commit').checked ? '' : 'Check this box to lock in your date.'];
  }
  if (bf) {
    // Package + payment are tap-to-pick radios; errors and focus land on the first option.
    rules.collection = [form.querySelector('input[name="package"]'), () => $('sf-collection').value ? '' : 'Pick your hours.'];
    rules.pay = [form.querySelector('input[name="payment"]'), () => $('sf-pay').value ? '' : 'Pick deposit or pay in full.'];
  }
  const check = (k) => {
    const [el, rule] = rules[k];
    const msg = rule();
    $('err-' + k).textContent = msg;
    el.setAttribute('aria-invalid', String(Boolean(msg)));
    return !msg;
  };
  Object.entries(rules).forEach(([k, [el]]) => el.addEventListener('blur', () => { if (el.value) check(k); }));
  // Picks and the checkbox clear their error as soon as they're fixed.
  Object.entries(rules).forEach(([k, [el]]) => { if (el.tagName === 'SELECT' || el.type === 'checkbox') el.addEventListener('change', () => check(k)); });

  let started = false;
  form.addEventListener('focusin', () => { if (!started) { started = true; track('form_start', { form: 'inquiry' }); } });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bad = Object.keys(rules).filter((k) => !check(k));
    // Jump to the first problem from the top of the form.
    bad.sort((x, y) => (rules[x][0].compareDocumentPosition(rules[y][0]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    if (bad.length) { rules[bad[0]][0].focus(); return; }
    $('sf-date-summary').value = pretty();
    $('sf-subject').value = bf
      ? `BLACK FRIDAY CLAIM: ${$('sf-collection').value} · ${$('sf-pay').value} · ${$('sf-names').value.trim()} · ${pretty()} · ${$('sf-phone').value.trim()}`
      : ready
      ? `BOOKING: ${$('sf-names').value.trim()} · ${pretty()} · ${$('sf-collection').value} · ${$('sf-pay').value} · ${$('sf-next').value} · ${$('sf-phone').value.trim()}`
      : `New inquiry: ${$('sf-names').value.trim()} · ${pretty()} · ${$('sf-phone').value.trim()}`;
    const btn = $('sf-btn');
    btn.textContent = 'Sending…';
    btn.disabled = true;
    $('err-send').textContent = '';
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error();
      if (window.fbq) fbq('track', 'Lead', { content_name: bf ? 'Black Friday' : ready ? 'Ready To Book' : 'Contact Form' });
      track('generate_lead', { method: bf ? 'blackfriday_form' : ready ? 'ready_form' : 'contact_form', collection: $('sf-collection').value || 'none', source: $('sf-source').value || 'none' });
      const first = $('sf-names').value.trim().split(/\s+/)[0];
      $('sf-done-h').textContent = `Got it, ${first}.`;
      $('sf-done-p').textContent = bf
        ? (noDate() ? `Your spot is held. I'll text you within 24 hours.` : `Your spot is held. I'm checking ${pretty()} now and will text you within 24 hours.`)
        : ready
        ? (/call/i.test($('sf-next').value) ? `I'm checking ${pretty()} now. I'll text you within 24 hours to set up our call.` : `I'm checking ${pretty()} now. Your contract and retainer invoice will hit your email within 24 hours.`)
        : `I'm checking ${pretty()} now and will text you within 24 hours.`;
      const lock = $('sf-lock');
      if (bf && lock) {
        const full = /full/i.test($('sf-pay').value);
        const body = `Hi Lee, it's ${first}. I just claimed ${$('sf-collection').value}${noDate() ? '' : ` for ${pretty()}`}. I'm ready to ${full ? 'pay in full' : 'pay the $500 deposit'}.`;
        lock.href = `sms:+12145774801?&body=${encodeURIComponent(body)}`;
        lock.addEventListener('click', () => track('bf_lock_click', { pay: full ? 'full' : 'deposit' }));
      }
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
