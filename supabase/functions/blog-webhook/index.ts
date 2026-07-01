// blog-webhook — your content automation POSTs an article here and it is
// published at https://rsvpplease.app/blog/<slug>.
//
//   POST  https://<project>.functions.supabase.co/blog-webhook
//   Headers:
//     Authorization: Bearer <BLOG_WEBHOOK_SECRET>        (primary auth)
//     Content-Type:  application/json
//     X-Webhook-Signature: sha256=<hex>                  (optional; verified
//        only if BLOG_WEBHOOK_SIGNING_SECRET is set — HMAC-SHA256 of the body)
//   Body (JSON, lenient — accepted aliases in brackets):
//     { "title": "My Blog Post Title",                   // required
//       "content": "<h2>…</h2><p>…</p>",                 // [body_html|body|html]
//       "meta_description": "Under 155 chars",           // [seo_description|description]
//       "slug": "my-blog-post-title",                    // optional; from title
//       "featured_image_url": "https://…/image.jpg",     // [cover_image_url|cover|image]
//       "published_at": "2026-03-25T12:00:00.000Z",      // [date]
//       "author": "…", "tags": ["…"], "excerpt": "…", "published": true }
//
// Upserts by slug (re-posting the same slug edits the post). Returns the URL.
// Deploy with verify_jwt = false (see config.toml) so it can do its own auth.
import { adminClient, env } from "../_shared/clients.ts";
import { preflight, json } from "../_shared/cors.ts";

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 90);
}

// Strip anything script-y from incoming HTML — the source is trusted (holds the
// secret) but content may be machine-generated, so belt-and-braces.
function sanitize(html: string): string {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function readingMinutes(html: string): number {
  const words = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// Optional HMAC-SHA256 signature check ("sha256=<hex>").
async function validSignature(raw: string, header: string, secret: string): Promise<boolean> {
  const expected = header.replace(/^sha256=/i, "").trim().toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// deno-lint-ignore no-explicit-any
const first = (...vals: any[]) => vals.find((v) => v !== undefined && v !== null && v !== "");

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    // --- Auth: Bearer token (primary), with header/query fallbacks. ---------
    const secret = env("BLOG_WEBHOOK_SECRET");
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const given = bearer ||
      req.headers.get("x-blog-secret") ||
      new URL(req.url).searchParams.get("secret") || "";
    if (!secret || given !== secret) return json({ error: "unauthorized" }, 401);

    const raw = await req.text();

    // --- Optional signature check (only enforced if the secret is set). ------
    const signingSecret = Deno.env.get("BLOG_WEBHOOK_SIGNING_SECRET");
    const sigHeader = req.headers.get("X-Webhook-Signature") || "";
    if (signingSecret && sigHeader && !(await validSignature(raw, sigHeader, signingSecret))) {
      return json({ error: "bad signature" }, 401);
    }

    // deno-lint-ignore no-explicit-any
    const p: any = JSON.parse(raw || "{}");

    const title = String(first(p.title, p.headline, p.name) || "").trim();
    if (!title) return json({ error: "title is required" }, 400);

    const slug = slugify(String(first(p.slug, title)));
    const body_html = sanitize(String(first(p.content, p.body_html, p.body, p.html) || ""));
    const meta_description = first(p.meta_description, p.seo_description, p.description);
    const excerpt = String(first(p.excerpt, p.description, p.summary, p.subtitle, meta_description) || "").slice(0, 320);
    const tags = Array.isArray(p.tags)
      ? p.tags.map(String)
      : (p.tags ? String(p.tags).split(",").map((t: string) => t.trim()).filter(Boolean) : []);

    const row = {
      slug,
      title,
      excerpt,
      body_html,
      cover_image_url: first(p.featured_image_url, p.cover_image_url, p.cover, p.image, p.og_image, p.coverImage) ?? null,
      author: String(first(p.author, "The RSVPplease team")),
      tags,
      meta_title: first(p.meta_title, p.seo_title) ?? null,
      meta_description: meta_description || excerpt || null,
      read_minutes: readingMinutes(body_html),
      published: p.published === false ? false : true,
      published_at: first(p.published_at, p.date, new Date().toISOString()),
    };

    const db = adminClient();
    const { data, error } = await db.from("posts")
      .upsert(row, { onConflict: "slug" }).select("slug").single();
    if (error) return json({ error: error.message }, 500);

    const site = (Deno.env.get("PUBLIC_SITE_URL") || "https://rsvpplease.app").replace(/\/$/, "");
    return json({ ok: true, slug: data.slug, url: `${site}/blog/${data.slug}` });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
