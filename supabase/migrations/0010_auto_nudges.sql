-- =========================================================================
-- RSVPplease — turn ON the hourly automatic nudge sweep.
-- pg_cron calls the send-nudges Edge Function every hour; that function applies
-- the per-event rules (nudge_after_hours, nudge_max, active + invited + still
-- pending) and sends via each guest's channel (SMS and/or email).
--
-- Self-contained auth: the shared secret is GENERATED here and stored in a
-- private table (app_secrets). The cron reads it to sign the request; the Edge
-- Function verifies it against the same row. Nothing for the operator to set.
-- Idempotent.
-- =========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Private key/value store for internal secrets (RLS on, no policy → the anon
-- and authenticated roles can never read it; the service-role Edge Function
-- and the postgres-owned cron job bypass RLS).
create table if not exists public.app_secrets (
  key   text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;

insert into public.app_secrets(key, value)
values ('cron_secret', encode(gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- (Re)schedule the hourly sweep.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'rsvp-hourly-nudges') then
    perform cron.unschedule('rsvp-hourly-nudges');
  end if;
end $$;

select cron.schedule('rsvp-hourly-nudges', '0 * * * *', $cron$
  select net.http_post(
    url     := 'https://ehhitnddiudoxgzoxpys.functions.supabase.co/send-nudges',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where key = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
$cron$);
