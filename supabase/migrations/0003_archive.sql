-- =========================================================================
-- RSVPplease — archive support for parties (events)
-- Hosts can archive a party (hidden from the main list, kept for records) or
-- delete it outright (cascades to guests/messages/templates/payments via FKs).
-- Idempotent: safe to re-run.
-- =========================================================================
alter table public.events
  add column if not exists archived boolean not null default false;

create index if not exists events_host_archived_idx
  on public.events (host_id, archived);
