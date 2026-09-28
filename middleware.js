// Studio: bakes published edits into the homepage on Vercel's edge (see studio-bake.js).
// If Studio is slow or down, the original page is served untouched.
import { bake } from "./studio-bake.js";

// STUDIO_SITE is only set on preview deploys, to test against a test site.
const PUBLISHED = `https://site-studio-kappa.vercel.app/api/public/${process.env.STUDIO_SITE || "lk-film-co"}`;

export const config = { matcher: ["/"] };

export default async function middleware(request) {
  try {
    const [page, published] = await Promise.all([
      // Forward cookies so protected preview deploys can read their own page.
      fetch(new URL("/index.html", request.url), { headers: { cookie: request.headers.get("cookie") ?? "" } }),
      fetch(PUBLISHED, { signal: AbortSignal.timeout(1500) })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    if (!page.ok || !published) return; // nothing published: serve the static page as-is
    const html = await page.text();
    if (!html.includes("data-studio")) return; // not our page (e.g. an auth screen): hands off
    return new Response(bake(html, published, "/"), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" },
    });
  } catch {
    return;
  }
}
