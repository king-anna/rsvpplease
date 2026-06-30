-- =========================================================================
-- RSVPplease — Phase 2 schema, RLS, and public RSVP RPCs
-- Run in the Supabase SQL Editor, or `supabase db push` with the CLI.
-- =========================================================================

-- Extensions ---------------------------------------------------------------
create extension if not exists pgcrypto;      -- gen_random_uuid / gen_random_bytes

-- =========================================================================
-- Tables
-- =========================================================================

create table if not exists public.events (
  id                     uuid primary key default gen_random_uuid(),
  host_id                uuid not null references auth.users(id) on delete cascade,
  name                   text not null,
  description            text not null default '',
  event_date             timestamptz,
  location               text not null default '',
  rsvp_deadline          date,
  cover_image_url        text,
  nudge_after_hours      int  not null default 48,
  nudge_max              int  not null default 2,
  status                 text not null default 'draft'
                           check (status in ('draft','active','closed')),
  paid_at                timestamptz,
  guest_count_at_payment int  not null default 0,
  created_at             timestamptz not null default now()
);

create table if not exists public.guests (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  name          text not null default '',
  phone         text,
  email         text,
  channel       text not null default 'sms' check (channel in ('sms','email','both')),
  party_size    int  not null default 1,
  status        text not null default 'pending'
                  check (status in ('pending','confirmed','declined')),
  token         text not null unique default encode(gen_random_bytes(12),'hex'),
  note          text,
  invited_at    timestamptz,
  responded_at  timestamptz,
  nudge_count   int  not null default 0,
  last_nudge_at timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists guests_event_idx on public.guests(event_id);
create index if not exists guests_token_idx on public.guests(token);

-- All four SMS templates + email variants live in one jsonb blob per event,
-- mirroring the front-end template object exactly:
--   { sms:   { invite, nudge, replyYes, replyNo },
--     email: { invite:{subject,body}, nudge:{subject,body},
--              replyYes:{subject,body}, replyNo:{subject,body} } }
create table if not exists public.templates (
  event_id   uuid primary key references public.events(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  guest_id    uuid references public.guests(id) on delete cascade,
  channel     text not null default 'sms' check (channel in ('sms','email')),
  direction   text not null check (direction in ('out','in')),
  kind        text,                 -- invite|nudge|replyYes|replyNo|rsvp|receipt|notify
  subject     text,                 -- email only
  body        text not null,
  provider_id text,                 -- twilio sid / resend id
  created_at  timestamptz not null default now()
);
create index if not exists messages_event_idx on public.messages(event_id, created_at);
create index if not exists messages_guest_idx on public.messages(guest_id, created_at);

create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events(id) on delete cascade,
  stripe_session_id text,
  amount_cents      int,
  currency          text not null default 'usd',
  status            text not null default 'pending',
  created_at        timestamptz not null default now()
);

-- =========================================================================
-- Row Level Security
--   Hosts (authenticated) may touch ONLY rows under events they own.
--   Anon has NO direct table access — the public RSVP page goes through the
--   SECURITY DEFINER rpc functions below, scoped to a single token.
-- =========================================================================
alter table public.events    enable row level security;
alter table public.guests    enable row level security;
alter table public.templates enable row level security;
alter table public.messages  enable row level security;
alter table public.payments  enable row level security;

create policy "host manages own events" on public.events
  for all using (host_id = auth.uid()) with check (host_id = auth.uid());

create policy "host manages own guests" on public.guests
  for all
  using    (exists (select 1 from public.events e where e.id = guests.event_id and e.host_id = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = guests.event_id and e.host_id = auth.uid()));

create policy "host manages own templates" on public.templates
  for all
  using    (exists (select 1 from public.events e where e.id = templates.event_id and e.host_id = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = templates.event_id and e.host_id = auth.uid()));

create policy "host reads own messages" on public.messages
  for select
  using (exists (select 1 from public.events e where e.id = messages.event_id and e.host_id = auth.uid()));

create policy "host reads own payments" on public.payments
  for select
  using (exists (select 1 from public.events e where e.id = payments.event_id and e.host_id = auth.uid()));

-- Edge Functions use the service_role key, which bypasses RLS — so inserts of
-- outbound/inbound messages, payment rows, etc. are handled there.

-- =========================================================================
-- Public RSVP RPCs (token-scoped, callable by anon)
-- =========================================================================

-- Look up an invite by token: returns event + guest essentials only.
create or replace function public.rsvp_get(p_token text)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'event', json_build_object(
      'name', e.name, 'description', e.description, 'event_date', e.event_date,
      'location', e.location, 'cover_image_url', e.cover_image_url,
      'host_name', coalesce(u.raw_user_meta_data->>'name', 'your host')
    ),
    'guest', json_build_object(
      'name', g.name, 'party_size', g.party_size, 'status', g.status,
      'responded_at', g.responded_at
    )
  )
  from public.guests g
  join public.events e on e.id = g.event_id
  left join auth.users u on u.id = e.host_id
  where g.token = p_token;
$$;

-- Submit / update an RSVP by token. Records the inbound reply and the host's
-- customised auto-reply as messages, and returns the rendered auto-reply text.
create or replace function public.rsvp_submit(
  p_token text, p_status text, p_party int default null, p_note text default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  g            public.guests;
  e            public.events;
  tpl          jsonb;
  reply_key    text;
  reply_body   text;
  inbound_body text;
begin
  if p_status not in ('confirmed','declined') then
    raise exception 'invalid status';
  end if;

  select * into g from public.guests where token = p_token;
  if not found then raise exception 'invite not found'; end if;
  select * into e from public.events where id = g.event_id;
  select data into tpl from public.templates where event_id = e.id;

  update public.guests
     set status       = p_status,
         responded_at = now(),
         party_size   = case when p_status = 'confirmed' and p_party is not null
                             then p_party else party_size end,
         note         = coalesce(p_note, note)
   where id = g.id
   returning * into g;

  inbound_body := case when p_status = 'confirmed' then '✅ Confirmed via RSVP page'
                       else '🙅 Declined via RSVP page' end
                  || coalesce(' — “' || p_note || '”', '');
  insert into public.messages(event_id, guest_id, channel, direction, kind, body)
  values (e.id, g.id, 'sms', 'in', 'rsvp', inbound_body);

  reply_key  := case when p_status = 'confirmed' then 'replyYes' else 'replyNo' end;
  reply_body := coalesce(tpl->'sms'->>reply_key, '');
  reply_body := public.render_template(reply_body, g.name, e.name, e.event_date, e.location,
                                       coalesce((select raw_user_meta_data->>'name'
                                                 from auth.users where id = e.host_id), 'your host'));
  if reply_body <> '' then
    insert into public.messages(event_id, guest_id, channel, direction, kind, body)
    values (e.id, g.id, 'sms', 'out', reply_key, reply_body);
  end if;

  return json_build_object('ok', true, 'auto_reply', reply_body);
end;
$$;

-- Minimal {{variable}} renderer usable from SQL (rsvp_submit auto-reply).
create or replace function public.render_template(
  body text, guest_name text, event_name text, event_date timestamptz,
  location text, host_name text
) returns text
language sql immutable
as $$
  select replace(replace(replace(replace(replace(coalesce(body,''),
    '{{guest_name}}', coalesce(guest_name,'there')),
    '{{event_name}}', coalesce(event_name,'our event')),
    '{{date}}',       coalesce(to_char(event_date, 'Dy DD Mon'), 'the big day')),
    '{{location}}',   coalesce(location,'')),
    '{{host_name}}',  coalesce(host_name,'your host'));
$$;

grant execute on function public.rsvp_get(text)    to anon, authenticated;
grant execute on function public.rsvp_submit(text, text, int, text) to anon, authenticated;

-- =========================================================================
-- Keep a templates row in step with every event (defaults filled by the app).
-- =========================================================================
create or replace function public.ensure_templates() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.templates(event_id, data) values (new.id, '{}'::jsonb)
  on conflict (event_id) do nothing;
  return new;
end; $$;

drop trigger if exists trg_event_templates on public.events;
create trigger trg_event_templates after insert on public.events
  for each row execute function public.ensure_templates();

-- =========================================================================
-- Hourly auto-nudge — pg_cron invokes the send-nudges Edge Function.
-- Requires pg_cron + pg_net (enable in Dashboard → Database → Extensions),
-- and the two settings below (run once, replacing the placeholders):
--
--   alter database postgres set app.settings.functions_url
--     = 'https://<PROJECT_REF>.functions.supabase.co';
--   alter database postgres set app.settings.cron_secret = '<A_LONG_RANDOM_SECRET>';
--
-- The function checks header x-cron-secret against CRON_SECRET.
-- =========================================================================
-- select cron.schedule('rsvp-hourly-nudges', '0 * * * *', $cron$
--   select net.http_post(
--     url     := current_setting('app.settings.functions_url') || '/send-nudges',
--     headers := jsonb_build_object('Content-Type','application/json',
--                                   'x-cron-secret', current_setting('app.settings.cron_secret')),
--     body    := '{}'::jsonb
--   );
-- $cron$);
