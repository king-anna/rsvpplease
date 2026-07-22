-- =========================================================================
-- RSVPplease — blog webhook v2 (batch envelope + idempotency).
-- The content tool now POSTs { version, event, idempotency_key, delivery_id,
-- articles: [...] } and signs the body with a timestamp. Two things need to
-- persist for that to be safe:
--   1. article identity — so a renamed slug edits the same post instead of
--      creating a duplicate;
--   2. delivery keys — so a retried/replayed delivery is a no-op.
-- Idempotent.
-- =========================================================================

-- The sender's own article id (payload `articles[].id`). Nullable + unique
-- only where present, so v1 posts without one are unaffected.
alter table public.posts
  add column if not exists external_id text;
create unique index if not exists posts_external_id_key
  on public.posts(external_id) where external_id is not null;

-- Processed webhook deliveries. Written ONLY by the edge function (service
-- role) after a delivery fully succeeds — a failed delivery is deliberately
-- not recorded so the sender's retry reprocesses it.
create table if not exists public.webhook_deliveries (
  key           text primary key,
  delivery_id   text,
  event         text,
  article_count int not null default 0,
  received_at   timestamptz not null default now()
);
create index if not exists webhook_deliveries_received_idx
  on public.webhook_deliveries(received_at desc);

-- No policies: RLS on with zero grants = service role only.
alter table public.webhook_deliveries enable row level security;
