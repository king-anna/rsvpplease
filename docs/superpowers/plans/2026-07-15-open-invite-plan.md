# Phase 2 "Open invite link + comments" — implementation plan

Spec: `docs/superpowers/specs/2026-07-15-partiful-upgrades-design.md` (Phase 2).
One branch of work, one push; every step verified in `?backend=local` first.

## Decisions (refining the roadmap spec)

- **Open link URL:** `https://rsvpplease.app/join/<open_token>` — `_redirects` rewrites
  `/join/*` to the extensionless `/rsvp` (lesson from the blog 308 bug), and
  `rsvp.html` switches to root-absolute asset paths (lesson from blog PR #1).
  Query form `rsvp.html?e=<open_token>` also works (local preview uses it).
- **Every event gets an `open_token`** (DB default + backfill); the host simply
  shares it or doesn't. No extra toggle.
- **Self-registrants RSVP as they register** (Going/Can't + name + phone), so they
  are never `pending` → the nudge cron and send-invites never text them → **no SMS
  cost**, and they're excluded from billing counts everywhere (`self_registered`).
- **Comments = the existing `note` field.** When the party has "Show who's going"
  ON, the note label becomes "Leave a comment 🎉 (other guests can see it)" and an
  **activity strip** (recent replies: first name, status, comment, when) appears on
  the invite — only for viewers who have themselves responded (Partiful gate).
  With the toggle OFF, notes stay host-only, as today.
- **Spam guard:** honeypot field (silently "succeeds"), server-side phone
  validation (7–15 digits), 300 self-registered cap per event, dedupe by
  last-10-digits (a repeat submit updates the existing guest instead of duping).

## Steps

1. **Migration `0012_open_invite.sql`** — `events.open_token` (unique, default
   `encode(gen_random_bytes(12),'hex')`, backfill), `guests.self_registered`
   (bool default false). New RPCs `rsvp_open_get(p_open_token)` (event-only view;
   address hidden when `hide_address`; no social data) and `rsvp_open_submit(...)`
   (honeypot, validate, cap, dedupe→update-or-insert, log inbound + rendered
   auto-reply messages, return personal `token` + `auto_reply`). `rsvp_get` gains
   gated `activity` (last 8 responders: first name, status, note, responded_at).
2. **Routing/paths** — `_redirects` += `/join/*  /rsvp  200`; rsvp.html asset
   paths → root-absolute; rsvp.js token resolution: `?t=` | `?e=` | `/join/<tok>`.
3. **API parity** — supabase + local: `getOpenInvite(openToken)`,
   `openRsvp(openToken, {name, phone, status, partySize, note, answer, hp})`,
   `evFromRow.openToken`, `guestFromRow.selfRegistered`; local impl mirrors
   honeypot/cap/dedupe and generates open tokens lazily for older stored events.
4. **Guest page (rsvp.js)** — open flow: same themed takeover + orbs, plus
   name/phone fields ("For event updates from your host — no spam."), phone strip
   (+E.164 as in the add-guest modal); on submit `history.replaceState` to their
   personal `?t=<token>` and render the confirmed view (address reveal, going
   strip, activity). Activity strip rendering for both flows; dynamic note label.
5. **Host app (app.js)** — share modal gains a lead "One link for everyone" block
   (copy `/join/<token>`); guest table badge "via link" for self-registered;
   billing paths exclude self-registered guests (billingModal, sendPanel price
   line, add-guest auto-send top-up guard).
6. **stripe-checkout** — server-side count adds `.eq("self_registered", false)`.
7. **Verify + ship** — e2e: open-link self-RSVP lands on host list w/ badge +
   dedupe on resubmit; activity gated. node --check, v=41→42, gen-pages, preview
   pass (light/dark/mobile), commit, push both remotes, watch CI, live smoke
   (`rsvp_open_get` exists; `/join/x` serves the rsvp shell root-absolute).
