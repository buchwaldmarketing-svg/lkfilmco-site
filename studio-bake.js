// Studio (Lee's site editor): writes published edits into index.html on Vercel's edge, before the
// page is sent, so Google, link previews and first paint all see them. Only touches elements
// tagged data-studio / data-studio-section. No dependencies: runs in middleware.js.

const VOID = new Set(["img", "br", "hr", "input", "meta", "link", "source", "area", "wbr", "col", "embed", "track"]);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
const clean = (html) =>
  String(html)
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");

// Same short hash studio.js uses, so the browser can tell a list is already up to date.
export const hash = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

// Every element whose opening tag matches `attrRe`, with where its content starts and ends.
const findElements = (html, attrRe) => {
  const out = [];
  const openRe = /<([a-zA-Z][\w-]*)(\s[^>]*?)?>/g;
  let m;
  while ((m = openRe.exec(html))) {
    const attrs = m[2] || "";
    const found = attrs.match(attrRe);
    if (!found) continue;
    const tag = m[1].toLowerCase();
    const start = m.index;
    const openEnd = m.index + m[0].length;
    if (VOID.has(tag) || m[0].endsWith("/>")) {
      out.push({ tag, attrs, start, openEnd, closeStart: openEnd, closeEnd: openEnd, value: found[1] });
      continue;
    }
    // Walk forward to the matching close tag, counting nested tags of the same name.
    const tagRe = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*>`, "gi");
    tagRe.lastIndex = openEnd;
    let depth = 1;
    let t;
    while ((t = tagRe.exec(html))) {
      if (t[0].endsWith("/>")) continue;
      depth += t[1] ? -1 : 1;
      if (depth === 0) break;
    }
    if (!t) continue;
    out.push({ tag, attrs, start, openEnd, closeStart: t.index, closeEnd: t.index + t[0].length, value: found[1] });
  }
  return out;
};

const getAttr = (attrs, name) => {
  const m = attrs.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
};
const setAttr = (openTag, name, value) => {
  const re = new RegExp(`(\\s${name}=)"[^"]*"`);
  if (re.test(openTag)) return openTag.replace(re, `$1"${escAttr(value)}"`);
  return openTag.replace(/\s*\/?>$/, (end) => ` ${name}="${escAttr(value)}"${end}`);
};
const dropAttr = (openTag, name) => openTag.replace(new RegExp(`\\s${name}="[^"]*"`), "");

// Replace only the first run of words, so icons inside buttons survive.
const setOwnText = (inner, text) => {
  if (!inner.includes("<")) return esc(text);
  const parts = inner.split(/(<[^>]*>)/);
  const i = parts.findIndex((part) => !part.startsWith("<") && part.trim());
  if (i > -1) parts[i] = parts[i].replace(/\S(?:[\s\S]*\S)?/, esc(text));
  return parts.join("");
};

const fillTemplate = (tpl, item) => {
  let out = tpl;
  const fields = findElements(out, /\sdata-studio-field="([^"]+)"/).sort((a, b) => b.start - a.start);
  for (const f of fields) {
    const value = item[f.value] ?? "";
    const open = out.slice(f.start, f.openEnd);
    const type = getAttr(f.attrs, "data-studio-field-type") || (f.tag === "img" ? "image" : f.tag === "a" ? "link" : "text");
    if (type === "image") out = out.slice(0, f.start) + dropAttr(setAttr(open, "src", value), "srcset") + out.slice(f.openEnd);
    else if (type === "link") out = out.slice(0, f.start) + setAttr(open, "href", value) + out.slice(f.openEnd);
    else {
      const inner = type === "richtext" ? clean(value) : esc(value);
      out = out.slice(0, f.openEnd) + inner + out.slice(f.closeStart);
    }
  }
  return out;
};

// ---------- hours: "Monday — Friday" + "7:00 AM — 7:00 PM" -> schema.org ----------

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayIndex = (word) => DAYS.findIndex((d) => d.toLowerCase().startsWith(word.toLowerCase().slice(0, 3)));

export const parseDays = (text) => {
  const words = (String(text).match(/[A-Za-z]{3,}/g) || []).filter((w) => dayIndex(w) > -1);
  if (!words.length) return [];
  const isRange = words.length === 2 && /(—|–|-|\bto\b|\bthrough\b|\bthru\b)/i.test(text);
  if (isRange) {
    const out = [];
    for (let i = dayIndex(words[0]), n = 0; n < 7; i = (i + 1) % 7, n++) {
      out.push(i);
      if (i === dayIndex(words[1])) break;
    }
    return out;
  }
  return words.map(dayIndex);
};

export const parseTimes = (text) => {
  if (/closed/i.test(text)) return null;
  const times = [...String(text).matchAll(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/gi)].map((t) => {
    let h = Number(t[1]) % 12;
    if (/p/i.test(t[3])) h += 12;
    return `${String(h).padStart(2, "0")}:${t[2] || "00"}`;
  });
  return times.length >= 2 ? { opens: times[0], closes: times[1] } : null;
};

const hoursJsonLd = (rows) =>
  rows
    .map((r) => ({ days: parseDays(r.days), t: parseTimes(r.time) }))
    .filter((r) => r.days.length && r.t)
    .map((r) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: r.days.length === 1 ? DAYS[r.days[0]] : r.days.map((d) => DAYS[d]),
      opens: r.t.opens,
      closes: r.t.closes,
    }));

// ---------- the bake ----------

const adjustCss = (a) =>
  (a.x || a.y ? `translate:${a.x || 0}px ${a.y || 0}px!important;` : "") +
  (a.align ? `text-align:${a.align}!important;` : "") +
  (a.hide ? "display:none!important;" : "");

export function bake(html, p, path = "/") {
  if (!p || !p.fields) return html;

  // Which section each tagged field lives in (for keys like "hero.headline").
  const sections = findElements(html, /\sdata-studio-section="([^"]+)"/);
  const sectionAt = (i) => {
    let best = null;
    for (const s of sections) if (s.start < i && i < s.closeEnd && (!best || s.start > best.start)) best = s;
    return best ? best.value : "general";
  };

  const fields = findElements(html, /\sdata-studio="([^"]+)"/)
    .map((f) => ({ ...f, key: f.value.includes(".") ? f.value : `${sectionAt(f.start)}.${f.value}` }))
    .filter((f) => p.fields[f.key])
    .sort((a, b) => b.start - a.start);

  let out = html;
  let lastStart = Infinity;
  for (const f of fields) {
    if (f.closeEnd > lastStart) continue; // never edit inside something already rewritten
    const { type, value } = p.fields[f.key];
    let open = out.slice(f.start, f.openEnd);
    let inner = out.slice(f.openEnd, f.closeStart);

    if (type === "text") inner = esc(value);
    else if (type === "richtext") inner = clean(value);
    else if (type === "image") {
      if (value.src) open = dropAttr(setAttr(open, "src", value.src), "srcset");
      if (value.alt !== undefined) open = setAttr(open, "alt", value.alt);
    } else if (type === "link") {
      if (value.href) open = setAttr(open, "href", value.href);
      if (value.text) inner = setOwnText(inner, value.text);
    } else if (type === "list" && Array.isArray(value)) {
      const tplMatch = inner.match(/<template\b[^>]*data-studio-item[^>]*>([\s\S]*?)<\/template>/);
      if (!tplMatch) continue;
      inner = `\n${tplMatch[0]}\n${value.map((item) => fillTemplate(tplMatch[1], item)).join("\n")}\n`;
      open = setAttr(open, "data-studio-sig", hash(JSON.stringify(value)));
    }
    out = out.slice(0, f.start) + open + inner + out.slice(f.closeStart);
    lastStart = f.start;
  }

  // Hours: keep Google's opening-hours data in step with the hours list.
  const hours = p.fields["location.hours"];
  if (hours && Array.isArray(hours.value)) {
    const spec = hoursJsonLd(hours.value);
    if (spec.length) {
      out = out.replace(/("openingHoursSpecification"\s*:\s*)\[[\s\S]*?\n\s*\]/, (_, head) => head + JSON.stringify(spec, null, 2).replace(/\n/g, "\n    "));
    }
  }

  // Styles: hidden sections, brand colors, per-device nudges.
  const hidden = (p.sections || []).filter((s) => !s.visible).map((s) => `[data-studio-section="${s.key}"]{display:none!important}`).join("");
  const vars = Object.entries((p.theme && p.theme.vars) || {}).map(([k, v]) => `${k}:${v}`).join(";");
  let desktop = "";
  let mobile = "";
  for (const [key, l] of Object.entries(p.layout || {})) {
    const dot = key.indexOf(".");
    const sel = `[data-studio-key="${key}"],[data-studio="${key}"],[data-studio-section="${key.slice(0, dot)}"] [data-studio="${key.slice(dot + 1)}"]`;
    if (l.desktop) desktop += `${sel}{${adjustCss(l.desktop)}}`;
    if (l.mobile) mobile += `${sel}{${adjustCss(l.mobile)}}`;
  }
  const css =
    hidden +
    (vars ? `html:root{${vars}}` : "") +
    (desktop ? `@media (min-width:768px){${desktop}}` : "") +
    (mobile ? `@media (max-width:767.98px){${mobile}}` : "");
  const fonts = ((p.theme && p.theme.fonts) || [])
    .map((f) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@300;400;500;600;700&display=swap">`)
    .join("");
  if (css || fonts) out = out.replace("</head>", `${fonts}${css ? `<style id="studio-ssr">${css}</style>` : ""}\n</head>`);

  // Search + sharing.
  const seo = p.seo && p.seo[path];
  if (seo) {
    const meta = (attr, name, content) => {
      const re = new RegExp(`(<meta\\s+${attr}="${name}"\\s+content=)"[^"]*"`);
      out = re.test(out) ? out.replace(re, `$1"${escAttr(content)}"`) : out.replace("</head>", `<meta ${attr}="${name}" content="${escAttr(content)}">\n</head>`);
    };
    if (seo.title) {
      out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(seo.title)}</title>`);
      meta("property", "og:title", seo.title);
      meta("name", "twitter:title", seo.title);
    }
    if (seo.description) {
      meta("name", "description", seo.description);
      meta("property", "og:description", seo.description);
      meta("name", "twitter:description", seo.description);
    }
    if (seo.image) {
      meta("property", "og:image", seo.image);
      meta("name", "twitter:image", seo.image);
    }
  }

  return out;
}
