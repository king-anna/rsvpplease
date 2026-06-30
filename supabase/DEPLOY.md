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

---

### Smoke test
Sign in (magic link) → create event → add guests (mix of phone + email) → **Pay & send** (Stripe
test card `4242 4242 4242 4242`) → invites arrive by SMS/email → reply **YES** to the text →
status flips + auto-reply + host notification email → leave one guest silent → hourly nudge fires.
Check the `messages` table for both directions across both channels.
