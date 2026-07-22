// blog-webhook — your content automation POSTs article(s) here and they are
// published at https://rsvpplease.app/blog/<slug>.
//
//   POST  https://<project>.functions.supabase.co/blog-webhook
//
// Auth (required):
//   Authorization: Bearer <BLOG_WEBHOOK_SECRET>
//
// Integrity — verified whenever the sender includes a signature. Signing key is
// BLOG_WEBHOOK_SIGNING_SECRET, falling back to BLOG_WEBHOOK_SECRET (senders
// normally use one secret for both):
//   X-Webhook-Timestamp:    <unix seconds>
//   X-Webhook-Signature-V2: sha256=<hmac-sha256 of "<timestamp>.<raw body>">
//   X-Webhook-Signature:    sha256=<hmac-sha256 of "<raw body>">        (v1)
// V2 wins when both are sent; its timestamp must be within 15 minutes (replay
// protection). Set BLOG_WEBHOOK_SKIP_SIGNATURE=1 to bypass while debugging.
//
// Replays are dropped when the sender supplies an idempotency key:
//   X-Idempotency-Key: <uuid>        (or "idempotency_key" in the body)
//
// Body — v2 batch envelope:
//   { "version": "2", "event": "article.published",
//     "idempotency_key": "…", "delivery_id": "…", "sent_at": "…",
//     "articles": [{ id, title, slug, content_html, meta_title,
//                    meta_description, featured_image_url, tags,
//                    published_at }] }
// A v1 single-article body (title/content/… at the top level) still works, as
// do the field aliases listed in `pick()` below.
//
// Articles carrying an `id` are matched on it (stored as posts.external_id), so
// a renamed slug edits the same post instead of creating a second one; the rest
// upsert by slug. An "unpublished"/"deleted"/"archived" event unpublishes.
// Deploy with verify_jwt = false (see config.toml) so it can do its own auth.
import { adminClient, env } from "../_shared/clients.ts";
import { preflight, json } from "../_shared/cors.ts";

const MAX_SKEW_SECONDS = 900; // 15 min — idempotency keys cover the rest

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

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// deno-lint-ignore no-explicit-any
const pick = (...vals: any[]) => vals.find((v) => v !== undefined && v !== null && v !== "");

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  // A friendly GET so opening the URL in a browser explains the endpoint
  // instead of erroring — handy while wiring up the SEO tool.
  if (req.method === "GET") {
    return json({
      ok: true,
      service: "blog-webhook",
      accepts: ["v2 batch envelope { version, event, idempotency_key, articles: [...] }", "v1 single article"],
      how: "POST JSON with header 'Authorization: Bearer <your secret>'. Returns 2xx and the published URL(s).",
      articleFields: ["id", "title", "slug", "content_html", "meta_title", "meta_description",
        "featured_image_url", "tags", "published_at"],
      signature: "X-Webhook-Signature-V2: sha256=hmac('<X-Webhook-Timestamp>.<body>') — or v1 X-Webhook-Signature over the body",
      idempotency: "X-Idempotency-Key (or body idempotency_key) — repeat deliveries are ignored",
    });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    // --- Auth: Bearer token (primary), with header/query fallbacks. ---------
    // Read the secret without throwing so an unconfigured endpoint returns a
    // clean "not configured" rather than leaking the env-var name in a 400.
    const secret = env("BLOG_WEBHOOK_SECRET", false);
    if (!secret) return json({ error: "webhook not configured — set BLOG_WEBHOOK_SECRET" }, 503);
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const given = bearer ||
      req.headers.get("x-blog-secret") ||
      new URL(req.url).searchParams.get("secret") || "";
    if (!timingSafeEqual(given, secret)) return json({ error: "unauthorized" }, 401);

    const raw = await req.text();

    // --- Signature: enforced whenever the sender signs. ---------------------
    const signingSecret = Deno.env.get("BLOG_WEBHOOK_SIGNING_SECRET") || secret;
    const sigOf = (h: string) => (req.headers.get(h) || "").replace(/^sha256=/i, "").trim().toLowerCase();
    const sigV2 = sigOf("X-Webhook-Signature-V2");
    const sigV1 = sigOf("X-Webhook-Signature");
    if (Deno.env.get("BLOG_WEBHOOK_SKIP_SIGNATURE") !== "1" && (sigV2 || sigV1)) {
      if (sigV2) {
        const ts = (req.headers.get("X-Webhook-Timestamp") || "").trim();
        const tsNum = Number(ts);
        if (!ts || !Number.isFinite(tsNum)) {
          return json({ error: "X-Webhook-Timestamp required with X-Webhook-Signature-V2" }, 401);
        }
        const skew = Math.abs(Date.now() / 1000 - tsNum);
        if (skew > MAX_SKEW_SECONDS) {
          return json({ error: `timestamp too far from now (${Math.round(skew)}s)` }, 401);
        }
        if (!timingSafeEqual(await hmacHex(signingSecret, `${ts}.${raw}`), sigV2)) {
          return json({ error: "bad signature (v2)" }, 401);
        }
      } else if (!timingSafeEqual(await hmacHex(signingSecret, raw), sigV1)) {
        return json({ error: "bad signature" }, 401);
      }
    }

    // deno-lint-ignore no-explicit-any
    const p: any = JSON.parse(raw || "{}");
    const db = adminClient();

    // --- Idempotency: a delivery we've already completed is a no-op. --------
    const idemKey = String(pick(req.headers.get("X-Idempotency-Key"), p.idempotency_key) || "").trim();
    if (idemKey) {
      const { data: seen } = await db.from("webhook_deliveries")
        .select("key, article_count, received_at").eq("key", idemKey).maybeSingle();
      if (seen) {
        return json({ ok: true, duplicate: true, idempotency_key: idemKey, count: seen.article_count });
      }
    }

    // v2 sends a batch; v1 sent the article at the top level.
    // deno-lint-ignore no-explicit-any
    const articles: any[] = Array.isArray(p.articles) ? p.articles
      : Array.isArray(p.posts) ? p.posts
      : [p];
    const unpublish = /unpublish|delete|archive/i.test(String(p.event || ""));
    const site = (Deno.env.get("PUBLIC_SITE_URL") || "https://rsvpplease.app").replace(/\/$/, "");

    const published: Array<Record<string, string>> = [];
    const errors: Array<Record<string, string>> = [];

    for (const a of articles) {
      const title = String(pick(a.title, a.headline, a.name) || "").trim();
      if (!title) { errors.push({ error: "title is required", slug: String(a.slug || "") }); continue; }

      const slug = slugify(String(pick(a.slug, title)));
      if (!slug) { errors.push({ title, error: "could not derive a slug" }); continue; }

      const body_html = sanitize(String(pick(a.content_html, a.content, a.body_html, a.body, a.html) || ""));
      const meta_description = pick(a.meta_description, a.seo_description, a.description);
      const excerpt = String(pick(a.excerpt, a.description, a.summary, a.subtitle, meta_description) || "").slice(0, 320);
      const tags = Array.isArray(a.tags)
        ? a.tags.map(String)
        : (a.tags ? String(a.tags).split(",").map((t: string) => t.trim()).filter(Boolean) : []);
      const externalId = String(pick(a.id, a.article_id, a.external_id) || "").trim() || null;

      const row = {
        slug,
        title,
        excerpt,
        body_html,
        cover_image_url: pick(a.featured_image_url, a.cover_image_url, a.cover, a.image, a.og_image, a.coverImage) ?? null,
        author: String(pick(a.author, "The RSVPplease team")),
        tags,
        meta_title: pick(a.meta_title, a.seo_title) ?? null,
        meta_description: meta_description || excerpt || null,
        read_minutes: readingMinutes(body_html),
        published: unpublish ? false : (a.published === false ? false : true),
        published_at: pick(a.published_at, a.date, p.sent_at, new Date().toISOString()),
        external_id: externalId,
      };

      try {
        // Same article, possibly renamed: match on the sender's id first so we
        // edit that post rather than leaving the old slug behind as a duplicate.
        let existingId: string | null = null;
        if (externalId) {
          const { data } = await db.from("posts").select("id").eq("external_id", externalId).maybeSingle();
          existingId = data?.id ?? null;
        }
        if (!existingId) {
          const { data } = await db.from("posts").select("id").eq("slug", slug).maybeSingle();
          existingId = data?.id ?? null;
        }

        const q = existingId
          ? db.from("posts").update(row).eq("id", existingId).select("slug").single()
          : db.from("posts").insert(row).select("slug").single();
        const { data, error } = await q;
        if (error) { errors.push({ slug, error: error.message }); continue; }

        published.push({
          slug: data.slug,
          url: `${site}/blog/${data.slug}`,
          action: existingId ? "updated" : "created",
        });
      } catch (e) {
        errors.push({ slug, error: (e as Error).message });
      }
    }

    // Record the delivery only when everything landed — a partial failure must
    // stay retryable (re-processing is safe: articles match on id/slug).
    if (idemKey && !errors.length) {
      await db.from("webhook_deliveries")
        .upsert({
          key: idemKey,
          delivery_id: String(p.delivery_id || "") || null,
          event: String(p.event || "") || null,
          article_count: published.length,
        }, { onConflict: "key", ignoreDuplicates: true });
    }

    if (errors.length) {
      return json({ ok: false, count: published.length, published, errors }, 500);
    }
    // `slug`/`url` kept at the top level for v1 senders that read them.
    return json({
      ok: true,
      count: published.length,
      articles: published,
      ...(published.length === 1 ? { slug: published[0].slug, url: published[0].url } : {}),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
