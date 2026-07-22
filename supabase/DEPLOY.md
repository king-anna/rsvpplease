# RSVPplease — Phase 2 backend deploy guide

Project: **`ehhitnddiudoxgzoxpys`** · Site: **https://rsvpplease.app** (Cloudflare Pages, apex)

Status legend: ✅ done · ⏳ needs you · 🤖 I can do it once granted Supabase access

---

## 0. Can Claude run the migration with the anon key? — No.
The anon key is a **client** key (gated by RLS); it has **no rights to create tables**. DDL needs
the postgres/service role. So the migration must be run one of these ways:
- **⏳ You, in the dashboard (easiest):** Supabase → **SQL Editor** → paste all of
  [`migrations/0001_init.sql`](migrations/0001_init.sql) → **Run**.
- **⏳ You, via CLI:** `supabase login` (the account that owns this project) →
  `supabase link --project-ref ehhitnddiudoxgzoxpys` → `supabase db push`.
- **🤖 Me, via MCP:** add my connected "Anna Korol" Supabase account to this project's org
  (Developer+). Then I can run it with `apply_migration` and deploy the functions for you.

---

## 1. Run the schema migration  ⏳
See step 0. Creates `events / guests / templates / messages / payments`, RLS, the public
`rsvp_get` / `rsvp_submit` RPCs, and the auto-templates trigger.

## 2. Set Edge Function secrets
Dashboard → **Edge Functions → Secrets**, or `supabase secrets set KEY=value`.

| Secret | Status | Value |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | ✅ added | — |
| `TWILIO_AUTH_TOKEN` | ✅ added | — |
| `TWILIO_PHONE_NUMBER` | ✅ added | your Twilio SMS number (E.164) |
| `RESEND_API_KEY` | ⏳ | from resend.com → API Keys |
| `RESEND_FROM` | ⏳ | `RSVPplease <invites@rsvpplease.app>` (domain ✅ connected) |
| `STRIPE_SECRET_KEY` | ⏳ | `sk_test_…` or `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | ⏳ | `whsec_…` from step 5 |
| `PUBLIC_SITE_URL` | ⏳ | `https://rsvpplease.app` |
| `CRON_SECRET` | ⏳ | any long random string (for the nudge cron) |
| `TWILIO_WEBHOOK_URL` | optional | exact inbound URL from step 4 (for signature checks) |
| `BLOG_WEBHOOK_SECRET` | ⏳ | the "signing secret" your SEO tool sends as `Authorization: Bearer …` (see step 10) |
| `BLOG_WEBHOOK_SIGNING_SECRET` | optional | only if you also want the `X-Webhook-Signature` HMAC-SHA256 enforced |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected automatically —
don't set them. Pricing defaults to $10 + $1/guest (`PRICE_BASE_CENTS` / `PRICE_PER_GUEST_CENTS`
override if needed).

## 3. Deploy the functions  ⏳/🤖
```bash
supabase functions deploy        # deploys all; respects config.toml (verify_jwt flags)
```
`twilio-inbound`, `stripe-webhook`, `send-nudges`, `notify-host` are public/cron (verify_jwt =
false, set in [`config.toml`](config.toml)); `send-invites` and `stripe-checkout` require the
host's login.

## 4. Wire the Twilio inbound webhook  ⏳
Twilio Console → your number → **Messaging → "A message comes in"** → Webhook (HTTP POST):
```
https://ehhitnddiudoxgzoxpys.supabase.co/functions/v1/twilio-inbound
```

## 5. Wire the Stripe webhook  ⏳
Stripe → **Developers → Webhooks → Add endpoint**:
```
https://ehhitnddiudoxgzoxpys.supabase.co/functions/v1/stripe-webhook
```
Event: **`checkout.session.completed`**. Copy the **Signing secret** → set `STRIPE_WEBHOOK_SECRET`.

## 6. Schedule the hourly auto-nudge  ⏳
Dashboard → **Database → Extensions** → enable **`pg_cron`** + **`pg_net`**. Then run (SQL Editor),
replacing placeholders:
```sql
alter database postgres set app.settings.functions_url = 'https://ehhitnddiudoxgzoxpys.supabase.co/functions/v1';
alter database postgres set app.settings.cron_secret  = '<same value as CRON_SECRET>';
```
…then run the `cron.schedule(...)` block at the bottom of `migrations/0001_init.sql`.

## 7. Turn on email auth (magic link)  ⏳
Dashboard → **Authentication → Providers → Email** (enabled by default). Set
**Site URL** = `https://rsvpplease.app` and add it to **Redirect URLs**.

## 8. Activate the frontend  ⏳
In [`../assets/js/config.js`](../assets/js/config.js) set `BACKEND: "supabase"` (URL + anon key are
already wired). Commit → Cloudflare Pages redeploys. The app now runs on Supabase.
**Do this only after step 1**, or the app errors on load.

## 9. Cloudflare Pages + apex domain  ⏳
Workers & Pages → **Create → Pages → Connect to Git** → `evaamelnik-glitch/rsvp` (framework none,
build command empty, output dir `/`). Add `rsvpplease.app` as a Cloudflare zone (move
nameservers), then Pages → **Custom domains → rsvpplease.app** — Cloudflare creates the apex
record and HTTPS automatically.

## 10. Wire the blog / SEO webhook  ⏳
Publishes an article to `https://rsvpplease.app/blog/<slug>` from an external content/SEO tool.

1. Pick a strong secret (e.g. `openssl rand -base64 32`) and set it:
   `supabase secrets set BLOG_WEBHOOK_SECRET='<secret>'` (or Dashboard → Edge Functions → Secrets).
2. In your SEO tool's webhook settings, set:
   - **Endpoint URL:** `https://ehhitnddiudoxgzoxpys.functions.supabase.co/blog-webhook`
   - **Signing secret / Bearer token:** the same `<secret>`
3. The tool POSTs JSON; the endpoint verifies `Authorization: Bearer <secret>` and returns
   `{ ok, count, articles: [{ slug, url, action }] }` (plus top-level `slug`/`url` for a
   single article).

**Payload — v2 batch envelope** (what the tool sends now):

```jsonc
{ "version": "2", "event": "article.published",
  "idempotency_key": "9f2c1b7a-…", "delivery_id": "3d81e0c4-…",
  "sent_at": "2026-07-22T04:07:12.504Z",
  "articles": [{ "id": "9f2c1b7a-…", "title": "…", "slug": "…",
                 "content_html": "<h2>…</h2>", "meta_title": "…",
                 "meta_description": "…", "featured_image_url": "https://…",
                 "tags": ["a","b"], "published_at": "2026-07-22T04:07:12.504Z" }] }
```

- **Matching:** `articles[].id` is stored as `posts.external_id` and matched first, so renaming a
  slug edits that post instead of creating a duplicate; articles without an `id` match on `slug`.
- **Idempotency:** `X-Idempotency-Key` (or body `idempotency_key`) — a completed delivery is
  recorded in `webhook_deliveries` and replays return `{ ok, duplicate: true }` without
  reprocessing. A delivery with *any* failed article is deliberately **not** recorded, so the
  sender's retry reprocesses it.
- **Signature** (enforced whenever sent; key = `BLOG_WEBHOOK_SIGNING_SECRET`, else
  `BLOG_WEBHOOK_SECRET`): `X-Webhook-Signature-V2: sha256=<hmac of "<timestamp>.<body>">` with
  `X-Webhook-Timestamp` (unix seconds, ±15 min), or v1 `X-Webhook-Signature: sha256=<hmac of body>`.
  V2 wins when both are present. `BLOG_WEBHOOK_SKIP_SIGNATURE=1` bypasses it while debugging.
- **Events:** an `event` matching unpublish/delete/archive sets `published = false`.
- **v1 still works:** a single article at the top level, with the old aliases
  (`content`/`body_html`, `cover_image_url`/`image`, `date`, `published:false` for a draft).

Test:
```bash
curl -sX POST https://ehhitnddiudoxgzoxpys.functions.supabase.co/blog-webhook \
  -H "Authorization: Bearer $BLOG_WEBHOOK_SECRET" -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -d '{"version":"2","event":"article.published","articles":[{"title":"Hello world","content_html":"<p>First post.</p>","meta_description":"A test post."}]}'
# → {"ok":true,"count":1,"articles":[{"slug":"hello-world","url":"https://rsvpplease.app/blog/hello-world","action":"created"}],…}
```

---

### Smoke test
Sign in (magic link) → create event → add guests (mix of phone + email) → **Pay & send** (Stripe
test card `4242 4242 4242 4242`) → invites arrive by SMS/email → reply **YES** to the text →
status flips + auto-reply + host notification email → leave one guest silent → hourly nudge fires.
Check the `messages` table for both directions across both channels.
