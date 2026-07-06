# RSVPplease 💌

Invitations that chase the replies for you. Hosts create an event, add guests by
mobile number, send each a unique RSVP link **by SMS**, track who's confirmed, and let
RSVPplease **auto-follow-up** with anyone who hasn't replied — all in a soft, light-pink
stationery aesthetic.

- **Two-way SMS + email** — invite each guest by **text, email, or both**; receive YES/NO
  replies, auto-respond, and auto-nudge non-responders.
- **Customisable messages** — invitation, follow-up nudge, "yes" auto-reply, "no" auto-reply.
- **Host notifications & receipts** — email on every RSVP, plus a Stripe payment receipt.
- **Pricing** — **$10 base + $1 per guest** invited (Stripe Checkout).
- **Stack** — static SPA (vanilla HTML/CSS/JS) + Supabase (Postgres, Auth, Edge Functions)
  + Twilio (SMS) + Resend (email) + Stripe (payments), hosted on **Cloudflare Pages**
  at **rsvpplease.app**.

> **Design note:** the original design link
> (`api.anthropic.com/v1/design/h/-5jGyvbtAES1HzoGCHPQMw`, `ui_kits/app/index.html`)
> returned **404 / not found**, so the light-pink UI was designed fresh while keeping the
> single-file `index.html` kit structure.

---

## Status

- **Phase 1 — front end ✅** Complete; runs entirely in the browser on a `localStorage` store
  (`BACKEND: "local"`), real data, no dummy/seed records.
- **Phase 2 — backend 🛠️ code complete, deploy pending.** Supabase schema + RLS + RPCs
  (`supabase/migrations/`), six Edge Functions (`supabase/functions/`), and the Supabase-backed
  data layer (`assets/js/api.supabase.js`) are written. To go live, follow
  **[`supabase/DEPLOY.md`](supabase/DEPLOY.md)** then flip `BACKEND` to `"supabase"` in
  `assets/js/config.js`.

Every view talks to the app only through `assets/js/api.js` (the data-layer seam), so the
Supabase swap doesn't touch any view code.

### Run it locally

```bash
cd /Users/annakorol/claude/invites
python3 -m http.server 4173
# open http://localhost:4173/
```

Then: sign in → **New event** → add guests → **Messages** to customise the four texts →
**Pay & send** (simulated Stripe + rendered SMS) → open a guest's RSVP link
(`rsvp.html?t=…`) to confirm/decline → watch counts and the **Activity** feed update. Use a
guest's conversation drawer to simulate an inbound YES/NO and see the auto-reply fire.

### Project structure

```
index.html            Host dashboard shell
rsvp.html             Public RSVP page (SMS link target: rsvp.html?t=<token>)
assets/css/styles.css Light-pink design system
assets/js/
  config.js           Backend flag + Supabase placeholders + pricing
  store.js            localStorage persistence (Phase 1, no seed data)
  api.js              Data-layer seam — the ONLY thing Phase 2 replaces
  ui.js               DOM / toast / modal / drawer / icons
  app.js              Dashboard router + views
  rsvp.js             Public RSVP page logic
```

---

## Phase 2 — backend wiring (when service keys are ready)

You confirmed **Twilio** and **Stripe** accounts and a **new Supabase project**. To go live:

1. **Create the Supabase project** and apply the schema:
   `events`, `guests`, `templates`, `messages` (two-way log: `direction`, `twilio_sid`,
   `body`), `payments` — with Row Level Security so each host sees only their rows and the
   public RSVP page reads a row only by its token.
2. **Deploy the Edge Functions** (Deno):
   - `send-invites` — render the invite template per pending guest → Twilio send → log.
   - `twilio-inbound` — public webhook; verify Twilio signature; match number → guest; parse
     YES/NO; update status; log inbound; send the "yes"/"no" auto-reply.
   - `stripe-checkout` — amount = `1000 + 100 × guestCount` cents → Checkout Session.
   - `stripe-webhook` — on `checkout.session.completed`, mark event paid (and auto-send).
   - `send-nudges` — `pg_cron` hourly: pending guests past the nudge window & under the max
     → send the nudge template.
3. **Set secrets** (never committed):
   `supabase secrets set TWILIO_ACCOUNT_SID=… TWILIO_AUTH_TOKEN=… TWILIO_PHONE_NUMBER=… STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=…`
   - **Admin test payments (optional):** `STRIPE_SECRET_KEY_TEST=sk_test_…` and
     `STRIPE_WEBHOOK_SECRET_TEST=whsec_…`. When an **admin** (non-comped) runs
     checkout it uses these test keys — a real Stripe flow with test card
     `4242 4242 4242 4242`, no real charge. Test payments are flagged
     `payments.is_test` and excluded from admin revenue stats. Without the test
     key set, an admin's checkout refuses (it never falls back to a live charge).
     Note admins are comped by default (free SMS, no checkout) — toggle their
     comp off in the admin dashboard to exercise the test payment flow.
4. **Point webhooks:** Twilio number → `…/functions/v1/twilio-inbound`;
   Stripe webhook → `…/functions/v1/stripe-webhook` (add a **test-mode**
   endpoint too, to the same URL, and use its signing secret for
   `STRIPE_WEBHOOK_SECRET_TEST`).
5. **Flip the front end:** in `assets/js/config.js` set `BACKEND: "supabase"` and fill
   `SUPABASE_URL` + `SUPABASE_ANON_KEY` (the anon key is public, gated by RLS).
6. **Deploy** the static files to **GitHub Pages** (Settings → Pages → main / root).

Only the `supabase/` impl behind `api.js` and the Edge Functions are new — the UI is done.
