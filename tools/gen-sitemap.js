#!/usr/bin/env node
/* Regenerates sitemap.xml (static XML — no serverless function) with the
   marketing pages + every published blog post from the public `posts` table.
   Runs locally and as a deploy step (plus a daily scheduled deploy) so posts
   published via the blog-webhook appear without any manual step.
   Fail-safe: if the posts fetch fails, the sitemap still gets the static
   pages — a Supabase blip must never break a deploy. */
const fs = require("fs");
const path = require("path");

const SITE = "https://rsvpplease.app";
const OUT = path.join(__dirname, "..", "sitemap.xml");

// Static pages (path, changefreq, priority) — keep in step with gen-pages.js.
const PAGES = [
  ["/", "weekly", "1.0"],
  ["/how", "monthly", "0.8"],
  ["/templates", "monthly", "0.8"],
  ["/pricing", "monthly", "0.9"],
  ["/stories", "monthly", "0.7"],
  ["/about", "monthly", "0.6"],
  ["/blog", "daily", "0.8"],
];

// Supabase URL + anon key straight from config.js (public by design).
function supabaseConfig() {
  const cfg = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "config.js"), "utf8");
  const url = (cfg.match(/SUPABASE_URL:\s*"([^"]+)"/) || [])[1];
  const key = (cfg.match(/eyJ[A-Za-z0-9_.-]+/) || [])[0];
  if (!url || !key) throw new Error("SUPABASE_URL / anon key not found in config.js");
  return { url, key };
}

async function fetchPosts() {
  const { url, key } = supabaseConfig();
  const res = await fetch(
    `${url}/rest/v1/posts?select=slug,published_at,updated_at&published=eq.true&order=published_at.desc&limit=1000`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`posts fetch ${res.status}`);
  return res.json();
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

(async () => {
  let posts = [];
  try {
    posts = await fetchPosts();
    console.log(`fetched ${posts.length} published post(s)`);
  } catch (e) {
    console.warn(`WARN: couldn't fetch posts (${e.message}) — sitemap will list static pages only`);
  }

  const urls = [
    ...PAGES.map(([p, freq, pri]) =>
      `  <url><loc>${SITE}${p}</loc><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`),
    ...posts.filter((p) => p.slug).map((p) => {
      const mod = (p.updated_at || p.published_at || "").slice(0, 10);
      return `  <url><loc>${SITE}/blog/${esc(p.slug)}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ""}<changefreq>monthly</changefreq><priority>0.7</priority></url>`;
    }),
  ];

  fs.writeFileSync(OUT, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`);
  console.log(`wrote sitemap.xml — ${urls.length} URLs (${posts.length} blog posts)`);
})();
