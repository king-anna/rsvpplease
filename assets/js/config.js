/* =========================================================================
   RSVPplease — runtime configuration
   -------------------------------------------------------------------------
   Phase 1 (front-end first) runs entirely in the browser against a
   localStorage-backed store, so the app is fully usable with the host's own
   real data and NO seeded/dummy records.

   Phase 2 wiring: drop in the Supabase project URL + anon key below and flip
   BACKEND to "supabase". The anon key is safe to expose publicly (it is gated
   by Row Level Security). All real secrets — Twilio Auth Token, Stripe secret
   key, webhook signing secrets — live ONLY in Supabase Edge Function secrets
   and are never shipped to the browser or committed to git.
   ========================================================================= */
window.RSVP_CONFIG = {
  // "local"  -> localStorage store (Phase 1)
  // "supabase" -> Supabase client + Edge Functions (Phase 2)
  BACKEND: "local",

  // Filled in Phase 2:
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // Pricing (cents). $10 base + $1 per invited guest.
  PRICE_BASE_CENTS: 1000,
  PRICE_PER_GUEST_CENTS: 100,
  CURRENCY: "usd",

  // Default follow-up cadence applied to new events.
  DEFAULT_NUDGE_AFTER_HOURS: 48,
  DEFAULT_NUDGE_MAX: 2,
};
