# Phase 3 "Media" — GIFs on comments + photo album — implementation plan

Spec: `docs/superpowers/specs/2026-07-15-partiful-upgrades-design.md` (Phase 3).
GIPHY key = Supabase secret **`GIF`** (user-confirmed). Attribution is mandatory:
official "Powered By GIPHY" marks vendored at `assets/img/giphy-light.png` /
`giphy-dark.png` (from GIPHY's attribution kit zip), shown inside the picker.

## Decisions

- **GIF on the RSVP comment**: one GIF per guest (`guests.gif_url`), attached in
  the note/comment area of both flows (personal + open). Search proxied through a
  new `gif-search` edge function (`env("GIF")`, GIPHY search + trending). If the
  key is missing or search fails, the picker degrades to **paste-a-GIF-URL**.
  Server validates the URL (https, giphy media host or *.gif/webp, <500 chars).
  The party wall + renderDone + host drawer render the GIF.
- **Photo album**: `photos` table (event/guest/url) + public-read Storage bucket
  `party-photos`. Guests upload from the invite page **after responding** —
  client-side canvas resize (≤1600px JPEG) → base64 → `photo-upload` edge
  function (auth = their guest token; caps 12/guest, 240/event; sniffs
  jpeg/png/webp). Album (last 24) returns via `rsvp_get` to responded viewers;
  host gets a full album card on the party page with per-photo delete via
  `photo-delete` (host JWT, ownership-checked; removes object + row).
- **RPC signatures change** → drop the old `rsvp_submit(5)` / `rsvp_open_submit(8)`
  before creating +`p_gif` versions (overload ambiguity lesson from 0011).

## Steps

1. **Migration `0013_media.sql`** — `guests.gif_url`; `photos` table + RLS
   (host select/delete own events; writes only via service role); bucket
   `party-photos` (public read); `rsvp_get` + activity `gif`, + gated `photos`;
   `rsvp_submit`/`rsvp_open_submit` + `p_gif` with URL validation.
2. **Edge functions** — `gif-search` (slim results: id, preview, full),
   `photo-upload` (token auth, caps, sniff, path `eventId/uuid.ext`),
   `photo-delete` (host JWT + ownership).
3. **API impls** — supabase: `gifSearch`, `uploadPartyPhoto(token, dataUrl)`,
   `hostPhotos(eventId)`, `deletePhoto(id)`; local: same shapes (gifSearch → []
   so the UI exercises the paste fallback; photos as resized data-URLs, small).
4. **Guest page** — GIF button + picker panel (search grid, themed GIPHY mark,
   paste fallback, preview + remove) in both flows; submit passes `gif`; wall +
   done view render GIFs; album section (grid + "Add photos" + resize-upload).
5. **Host app** — party page album card w/ delete; conversation drawer shows the
   guest's GIF; guest table already shows answers.
6. **Verify + ship** — e2e: paste-GIF fallback attaches + renders on wall; local
   album upload renders + host delete works. v=43→44, gen-pages, preview pass,
   push, CI, live smoke (`gif-search` returns real GIPHY results with the GIF
   secret; bucket + RPCs live).
