# Phase 1 "Invite glow-up" — implementation plan

Spec: `docs/superpowers/specs/2026-07-15-partiful-upgrades-design.md` (Phase 1).
Single branch of work; one push at the end fires both CI workflows
(migrations+functions, frontend). Every step verified in `?backend=local` before push.

## Steps

1. **Migration `0011_invite_glowup.sql`**
   - `events`: `title_font text`, `effect_emoji text`, `extras jsonb not null default '{}'`,
     `guest_question text`, `hide_address boolean not null default false`,
     `show_guests boolean not null default false`; `guests`: `answer text`.
   - Re-create `rsvp_get`: + new event fields; `location` → null + `location_hidden`
     flag when `hide_address` and guest not confirmed; `going_count` + `going_names`
     (≤8 first names) only when `show_guests` and guest has responded.
   - Re-create `rsvp_submit` with `p_answer text default null` → `guests.answer`.
   - Verify: SQL applies clean on a scratch schema (CI applies for real).

2. **`ui.js` — InviteDesign extensions**
   - `FONTS` map (classic/elegant/playful/bold → loaded font stacks); `titleFont(event)`.
   - Per-theme `yes`/`no` emoji pairs in `THEMES` + `choiceEmoji(event)` (default 🎉/😢).
   - `effectHTML(event)`: `effect_emoji` (grapheme-split, ≤8) → generic emoji-drift
     spans; else theme motif. `motifHTML` delegates.
   - `pageBackground(event)`: body-level gradient (cover image stays banner-only).
   - Verify: node --check + preview smoke.

3. **`styles.css`**
   - `.rsvp-page` full-viewport background; `.inv-effect` fixed layer + emoji-drift
     keyframes; `.glass` card (backdrop-filter + dark variant + fallback);
     `.choice--orb` circular emoji buttons + selected glow ring; extras chips;
     builder rows (font chips, effect chips, extras collapsible); reduced-motion.

4. **API parity — `api.supabase.js` + `api.js`**
   - Map `titleFont/effectEmoji/extras/guestQuestion/hideAddress/showGuests` in
     `evFromRow`/create/update; `recordRsvp(..., answer)`; local `rsvp_get`-equivalent
     returns the same shape incl. gating logic; local store version bump.

5. **`rsvp.js` — guest page**
   - Paint page bg + effect layer; glass card; orb buttons (emoji per theme);
     extras chips; question textarea (submits `answer`); hidden-address row +
     post-confirm refetch to reveal; social-proof strip when RPC returns counts.

6. **`app.js` — builder + host view**
   - Font row, effect row (presets + free emoji input), "+ Extras" collapsible,
     question input, two switches; `invitePreviewHTML` reflects font/effect/chips;
     conversation drawer + guest table show `answer`.

7. **Tests + ship**
   - Extend `e2e/host-flow.spec.js` (builder sets font/effect/extras/question →
     guest page renders → answer round-trips). `node --check` all changed JS.
   - Cache-bust `?v=39→40`, `gen-pages`, run e2e, manual preview pass (light/dark
     theme, mobile, reduced motion), commit, push, watch CI, live smoke `rsvp_get`.
