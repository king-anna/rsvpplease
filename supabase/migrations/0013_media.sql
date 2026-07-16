-- =========================================================================
-- RSVPplease — media (Phase 3): GIFs on comments + guest photo album.
-- Spec: docs/superpowers/specs/2026-07-15-partiful-upgrades-design.md
-- Idempotent.
-- =========================================================================

alter table public.guests
  add column if not exists gif_url text;

-- Guest-uploaded party photos. Rows are written ONLY by the photo-upload edge
-- function (service role); hosts read/delete their own events' photos; guests
-- see the album through rsvp_get (gated to responded viewers).
create table if not exists public.photos (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  guest_id   uuid references public.guests(id) on delete set null,
  url        text not null,
  created_at timestamptz not null default now()
);
create index if not exists photos_event_idx on public.photos(event_id, created_at desc);

alter table public.photos enable row level security;
drop policy if exists "hosts read own event photos"   on public.photos;
drop policy if exists "hosts delete own event photos" on public.photos;
create policy "hosts read own event photos" on public.photos
  for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));
create policy "hosts delete own event photos" on public.photos
  for delete to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));

-- Public-read bucket; uploads happen server-side (service role) only.
insert into storage.buckets (id, name, public)
values ('party-photos', 'party-photos', true)
on conflict (id) do update set public = true;
drop policy if exists "party photos are public" on storage.objects;
create policy "party photos are public" on storage.objects
  for select using (bucket_id = 'party-photos');

-- A GIF may only come from GIPHY's media hosts, or be a direct https .gif/.webp
-- (the paste fallback). Anything else is stored as null.
create or replace function public.clean_gif(p text)
returns text
language sql immutable
as $$
  select case
    when p is null or length(p) > 500 then null
    when p ~ '^https://media[0-9]*\.giphy\.com/' then p
    when p ~ '^https://[^\s"]+\.(gif|webp)([?#][^\s"]*)?$' then p
    else null
  end;
$$;

-- -------------------------------------------------------------------------
-- rsvp_get: activity items gain `gif`, and a `photos` album (last 24) is
-- added. Gates: the wall (activity/going) stays behind the host's
-- show_guests opt-in; the album is returned to any guest who has responded.
-- -------------------------------------------------------------------------
create or replace function public.rsvp_get(p_token text)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'event', json_build_object(
      'name', e.name, 'description', e.description, 'event_date', e.event_date,
      'location', case when e.hide_address and g.status <> 'confirmed'
                       then null else e.location end,
      'location_hidden', (e.hide_address and g.status <> 'confirmed'),
      'cover_image_url', e.cover_image_url,
      'theme', e.theme, 'palette', e.palette,
      'spots', e.spots, 'allow_plus_one', e.allow_plus_one,
      'title_font', e.title_font, 'effect_emoji', e.effect_emoji,
      'extras', e.extras, 'guest_question', e.guest_question,
      'show_guests', e.show_guests,
      'going_count', case
        when e.show_guests and g.status in ('confirmed','declined') then
          (select coalesce(sum(g2.party_size), 0) from public.guests g2
            where g2.event_id = e.id and g2.status = 'confirmed')
      end,
      'going_names', case
        when e.show_guests and g.status in ('confirmed','declined') then
          (select coalesce(json_agg(first_name), '[]'::json) from (
             select split_part(coalesce(nullif(trim(g3.name), ''), 'A guest'), ' ', 1) as first_name
               from public.guests g3
              where g3.event_id = e.id and g3.status = 'confirmed'
              order by g3.responded_at nulls last
              limit 8) names)
      end,
      'activity', case
        when e.show_guests and g.status in ('confirmed','declined') then
          (select coalesce(json_agg(row_to_json(a)), '[]'::json) from (
             select split_part(coalesce(nullif(trim(g4.name), ''), 'A guest'), ' ', 1) as name,
                    g4.status, nullif(trim(coalesce(g4.note, '')), '') as note,
                    g4.gif_url as gif,
                    g4.responded_at as at
               from public.guests g4
              where g4.event_id = e.id and g4.status in ('confirmed','declined')
                and g4.responded_at is not null
              order by g4.responded_at desc
              limit 8) a)
      end,
      'photos', case
        when g.status in ('confirmed','declined') then
          (select coalesce(json_agg(row_to_json(p)), '[]'::json) from (
             select ph.id, ph.url
               from public.photos ph
              where ph.event_id = e.id
              order by ph.created_at desc
              limit 24) p)
      end,
      'host_name', coalesce(u.raw_user_meta_data->>'name', 'your host')
    ),
    'guest', json_build_object(
      'name', g.name, 'party_size', g.party_size, 'status', g.status,
      'responded_at', g.responded_at, 'answer', g.answer, 'gif_url', g.gif_url
    )
  )
  from public.guests g
  join public.events e on e.id = g.event_id
  left join auth.users u on u.id = e.host_id
  where g.token = p_token;
$$;

-- -------------------------------------------------------------------------
-- rsvp_submit / rsvp_open_submit gain p_gif. Old signatures dropped first —
-- keeping both overloads would make named-argument RPC calls ambiguous.
-- -------------------------------------------------------------------------
drop function if exists public.rsvp_submit(text, text, int, text, text);

create or replace function public.rsvp_submit(
  p_token text, p_status text, p_party int default null, p_note text default null,
  p_answer text default null, p_gif text default null
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
         note         = coalesce(p_note, note),
         answer       = coalesce(p_answer, answer),
         gif_url      = coalesce(public.clean_gif(p_gif), gif_url)
   where id = g.id
   returning * into g;

  inbound_body := case when p_status = 'confirmed' then '✅ Confirmed via RSVP page'
                       else '🙅 Declined via RSVP page' end
                  || coalesce(' — “' || p_note || '”', '')
                  || coalesce(' · answered: “' || p_answer || '”', '')
                  || case when public.clean_gif(p_gif) is not null then ' · 🎬 GIF attached' else '' end;
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

drop function if exists public.rsvp_open_submit(text, text, text, text, int, text, text, text);

create or replace function public.rsvp_open_submit(
  p_open_token text, p_name text, p_phone text, p_status text,
  p_party int default null, p_note text default null, p_answer text default null,
  p_hp text default null, p_gif text default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  e          public.events;
  g          public.guests;
  tpl        jsonb;
  digits     text;
  norm_phone text;
  reg_count  int;
  reply_key  text;
  reply_body text;
begin
  if coalesce(p_hp, '') <> '' then
    return json_build_object('ok', true, 'token', null, 'auto_reply', '');
  end if;

  if p_status not in ('confirmed','declined') then
    raise exception 'invalid status';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required';
  end if;

  digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if length(digits) < 7 or length(digits) > 15 then
    raise exception 'valid phone required';
  end if;
  norm_phone := '+' || digits;

  select * into e from public.events
   where open_token = p_open_token and not coalesce(archived, false);
  if not found then raise exception 'invite not found'; end if;

  select count(*) into reg_count from public.guests
   where event_id = e.id and self_registered;
  if reg_count >= 300 then raise exception 'this party is not accepting more sign-ups'; end if;

  select * into g from public.guests
   where event_id = e.id
     and right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = right(digits, 10)
   limit 1;

  if found then
    update public.guests
       set status       = p_status,
           responded_at = now(),
           name         = coalesce(nullif(trim(name), ''), trim(p_name)),
           party_size   = case when p_status = 'confirmed' and p_party is not null
                               then greatest(1, least(20, p_party)) else party_size end,
           note         = coalesce(nullif(trim(p_note), ''), note),
           answer       = coalesce(nullif(trim(p_answer), ''), answer),
           gif_url      = coalesce(public.clean_gif(p_gif), gif_url)
     where id = g.id
     returning * into g;
  else
    insert into public.guests
      (event_id, name, phone, channel, party_size, status, responded_at,
       note, answer, gif_url, self_registered)
    values
      (e.id, left(trim(p_name), 80), norm_phone, 'sms',
       greatest(1, least(20, coalesce(p_party, 1))), p_status, now(),
       nullif(trim(p_note), ''), nullif(trim(p_answer), ''),
       public.clean_gif(p_gif), true)
    returning * into g;
  end if;

  insert into public.messages(event_id, guest_id, channel, direction, kind, body)
  values (e.id, g.id, 'sms', 'in', 'rsvp',
          case when p_status = 'confirmed' then '✅ Confirmed via open invite'
               else '🙅 Declined via open invite' end
          || coalesce(' — “' || nullif(trim(p_note), '') || '”', '')
          || case when public.clean_gif(p_gif) is not null then ' · 🎬 GIF attached' else '' end);

  select data into tpl from public.templates where event_id = e.id;
  reply_key  := case when p_status = 'confirmed' then 'replyYes' else 'replyNo' end;
  reply_body := coalesce(tpl->'sms'->>reply_key, '');
  reply_body := public.render_template(reply_body, g.name, e.name, e.event_date, e.location,
                                       coalesce((select raw_user_meta_data->>'name'
                                                 from auth.users where id = e.host_id), 'your host'));
  if reply_body <> '' then
    insert into public.messages(event_id, guest_id, channel, direction, kind, body)
    values (e.id, g.id, 'sms', 'out', reply_key, reply_body);
  end if;

  return json_build_object('ok', true, 'token', g.token, 'auto_reply', reply_body);
end;
$$;

grant execute on function public.rsvp_submit(text, text, int, text, text, text) to anon, authenticated;
grant execute on function public.rsvp_open_submit(text, text, text, text, int, text, text, text, text) to anon, authenticated;
