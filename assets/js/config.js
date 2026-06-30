/* =========================================================================
   RSVPplease — runtime configuration
   -------------------------------------------------------------------------
   Phase 1 (front-end first) runs entirely in the browser against a
   localStorage-backed store, so the app is fully usable with the host's own
   real data and NO seeded/dummy records.

   The anon key below is safe to expose publicly (gated by Row Level Security)
   and fine to commit. All real secrets — Twilio Auth Token, Stripe secret key,
   Resend key, webhook signing secrets — live ONLY in Supabase Edge Function
   secrets and are never shipped to the browser or committed to git.

   ACTIVATION: the project URL + anon key are wired. Flip BACKEND to "supabase"
   to go live — but ONLY after the schema migration (supabase/migrations/
   0001_init.sql) has been run on the project, or the app will error on load.
   ========================================================================= */
window.RSVP_CONFIG = {
  // "local"  -> localStorage store (your own data, no backend)
  // "supabase" -> Supabase (Postgres + Auth + Edge Functions) — LIVE.
  BACKEND: "supabase",

  SUPABASE_URL: "https://ehhitnddiudoxgzoxpys.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoaGl0bmRkaXVkb3hnem94cHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzODAwNjMsImV4cCI6MjA5Nzk1NjA2M30.abAdZ8fJLIGyIHuLh4oaXq1SA-eIkXZL7kowTKal8ig",

  // Pricing (cents). $10 base covers up to PRICE_BASE_INCLUDED guests; each
  // guest beyond that is PRICE_PER_GUEST_CENTS. Mirror STRIPE_BASE_INCLUDED.
  PRICE_BASE_CENTS: 1000,
  PRICE_PER_GUEST_CENTS: 100,
  PRICE_BASE_INCLUDED: 10,
  CURRENCY: "usd",

  // Default follow-up cadence applied to new events.
  DEFAULT_NUDGE_AFTER_HOURS: 48,
  DEFAULT_NUDGE_MAX: 2,
};
