# Partiful-inspired invite upgrades — design

**Date:** 2026-07-15 · **Status:** approved (Phase 1 to build now; Phases 2–3 roadmap)

## Context

RSVPplease's invite design is confined to the banner card; the rest of the guest RSVP
page is static white. Partiful's invites feel alive: the theme covers the whole page,
an animated "effect" layer floats across it, RSVP buttons are big glassy emoji circles,
and the invite carries structured extras (dress code, playlist…). We researched
partiful.com (home, /create, live event page) and chose which ideas fit RSVPplease.

Decisions locked with the user:

- **Approach A** — extend the existing `InviteDesign` system in place (full-page
  takeover behind a glass card). No poster-style rebuild.
- Scope split into **three phases**; build **Phase 1 now**. Phases 2–3 are recorded
  here as roadmap and get their own plan when started.
- Explicitly rejected: "Maybe" RSVP state, Text Blast, date polls (for now).
- Social proof ("N going") stays **opt-in per party, default off** — the user
  previously asked to hide counts from invitees; that default is preserved.

---

## Phase 1 — Invite glow-up (this build)

### 1. Data model — migration `0011_invite_glowup.sql`

`events` gains:

| column | type | default | meaning |
|---|---|---|---|
| `title_font` | text | `null` | null = theme's font; else `classic\|elegant\|playful\|bold` |
| `effect_emoji` | text | `null` | null = theme's built-in motif; else 1–8 emoji floated as the effect layer |
| `extras` | jsonb | `'{}'` | `{dressCode, playlistUrl, registryUrl, parking}` — all optional strings |
| `guest_question` | text | `null` | host's question shown on the RSVP page |
| `hide_address` | boolean | `false` | hide exact location until the guest confirms |
| `show_guests` | boolean | `false` | opt-in social proof on the invite |

`guests` gains:

| column | type | meaning |
|---|---|---|
| `answer` | text | the guest's reply to `guest_question`, captured with their RSVP |

RPC changes (same re-create pattern as 0006):

- **`rsvp_get(p_token)`** additionally returns: the six new event fields, and —
  only when `show_guests` is true **and** this guest has responded — `going_count`
  plus up to 8 first names of confirmed guests (`going_names`). When `hide_address`
  is true and the guest has **not** confirmed, `location` is returned as `null`
  (a separate `location_hidden: true` flag tells the page why).
- **`rsvp_submit(p_token, p_status, p_party, p_note, p_answer default null)`**
  stores `p_answer` into `guests.answer`. The existing YES auto-reply already
  renders `{{location}}`, so an SMS "YES" reveals the address with no extra work;
  after a link confirm, `rsvp_get` starts returning the real location.

RLS is unchanged — both functions stay `security definer`, tokens remain the only
public read path.

### 2. Guest invite page (`rsvp.html` / `rsvp.js` / `styles.css`)

- **Full-page takeover:** `InviteDesign.background(event)` gains a page variant;
  the `body` is painted with the palette gradient and the motif/effect layer is
  rendered `position:fixed` across the viewport (`aria-hidden`, reduced-motion →
  static). The existing banner keeps its in-card render.
- **Glass card:** the RSVP card becomes translucent (`backdrop-filter: blur`,
  ~92 % white; dark themes get dark glass) so the animation glows through.
  Graceful fallback to solid white where `backdrop-filter` is unsupported.
- **Effect layer:** if `effect_emoji` is set, its emoji replace the theme motif,
  reusing the float/fall animation CSS (a generic "emoji drift" keyframe set).
- **Emoji RSVP buttons:** big circular glass buttons (like Partiful's) with a
  glowing ring on the selected one. Each theme defines a yes/no emoji pair in
  `THEMES` (e.g. hearts 😍/💔, dinos 🦖/🥲, cars 🏎️/🚗, fairytale ✨/🌧️);
  default 🎉/😢. Text labels stay ("Yes, count me in" / "Can't make it").
- **Extras chips:** 👗 dress code · 🎵 playlist (link) · 🎁 registry (link) ·
  🅿️ parking — rendered under the event details, only when set. External links
  get `rel="noopener"` and are shown with their hostname.
- **Guest question:** when `guest_question` is set, a labelled text box appears
  with the party-size/note fields and submits as `p_answer`.
- **Hidden address:** pre-confirm the location row shows "📍 Address shared once
  you RSVP"; after confirming, the page re-fetches `rsvp_get` and shows it.
- **Social proof:** when the RPC returns `going_count`, show "🎉 N going" plus
  first names ("+ K more"), only after this guest has responded.

### 3. Builder (`app.js` `viewEventForm` + `invitePreviewHTML`)

Below the existing theme/colour rows:

- **Font row** — 4 chips (Classic / Elegant / Playful / Bold), each previewing its
  font; null (theme default) is the initial state, tapping the active chip clears
  back to default.
- **Effect row** — "Theme default" chip + emoji presets (🎉✨ · 🍕🍺 · 🎂🎈 ·
  💍🥂 · 🦖🌋) + a free-text emoji input (max 8 emoji, non-emoji stripped).
- **"+ Extras" collapsible** — dress code, playlist URL, registry URL, parking.
- **Question field** — "Ask your guests a question (optional)".
- **Two switches** — "Hide exact address until they RSVP", "Show who's going on
  the invite".
- The live preview reflects font, effect and extras chips instantly; the guest
  preview modal shows the full-page treatment.

### 4. API parity & events payload

`api.supabase.js` and `api.js` (localStorage impl) both read/write the new fields
(`titleFont`, `effectEmoji`, `extras`, `guestQuestion`, `hideAddress`, `showGuests`,
`answer`), so `?backend=local` behaves identically for preview/e2e. `evFromRow` /
`createEvent` / `updateEvent` map snake_case ↔ camelCase like the 0006 fields.
Host-side: the guest table/conversation drawer shows the guest's `answer` when present.

### 5. Testing & verification

- `node --check` on changed JS; e2e `host-flow` extended: set font/effect/extras/
  question in the builder → guest page renders chips/question → answer round-trips
  to the host view.
- Manual preview pass on light + dark themes, mobile viewport, reduced motion.
- Cache-bust `?v` bump + `gen-pages`; migration + functions deploy via CI;
  live smoke: `rsvp_get` returns new fields.

### Error handling notes

- Emoji input sanitised (grapheme-safe slice, strips non-emoji); extras URLs must
  parse as http(s) or are stored as plain text chips without a link.
- `rsvp_get` returning older shape (pre-migration cache) — page falls back to
  current behaviour (fields undefined → features simply don't render).

---

## Phase 2 — Open invite link + comments (roadmap)

- **Open invite link:** per-event shareable token (`events.open_token`); public page
  where a guest self-RSVPs with name + phone ("Just for event updates. No spam.").
  Creates a `guests` row (dedupe by digit-normalised phone), covered by nudges/SMS
  when the party has SMS active. Spam guard: rate limit per IP + honeypot field +
  cap on self-registered guests per event.
- **Comment with RSVP:** optional message stored on the guest (or `messages` row,
  kind `comment`); host sees it in the drawer; an activity strip on the invite
  ("Anna is going 🎉 — 'can't wait!'") gated until the viewer has RSVP'd.

## Phase 3 — Media (roadmap)

- **GIFs on comments** via the GIPHY API (Tenor stopped accepting new API clients
  Jan 2026). CONFIRMED 2026-07-15: the user created a GIPHY key and saved it as the
  Supabase Edge Function secret named **`GIF`** (not GIPHY_API_KEY) — the gif-search
  proxy function must read `env("GIF")`. Proxied server-side so the key never ships
  to the browser. Fallback: "paste a GIF URL" with no third-party dependency.
- **Photo album:** guests upload snaps to a public-read Storage bucket via signed
  upload URLs issued per token; host can delete; album section on the invite page.

---

## Out of scope (explicitly)

"Maybe" RSVP state, Text Blast, date polls, comments/reactions beyond Phase 2 scope,
ticketing/QR check-in, public event discovery, per-guest photo tagging.
