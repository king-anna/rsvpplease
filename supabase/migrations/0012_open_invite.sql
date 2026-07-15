-- =========================================================================
-- RSVPplease — open invite link + comments/activity (Phase 2)
-- One shareable link per party (/join/<open_token>): anyone opens it, RSVPs
-- with their name + phone, and lands on the guest list — already responded,
-- so nudges/invites never text them and billing never counts them.
-- Spec: docs/superpowers/specs/2026-07-15-partiful-upgrades-design.md
-- Idempotent.
-- =========================================================================

alter table public.events
  add column if not exists open_token text unique default encode(gen_random_bytes(12), 'hex');
update public.events set open_token = encode(gen_random_bytes(12), 'hex') where open_token is null;

alter table public.guests
  add column if not exists self_registered boolean not null default false;

-- -------------------------------------------------------------------------
-- rsvp_get: + gated `activity` — the party wall. Last 8 responders (first
-- name, status, note, when), returned ONLY when the host opted in
-- (show_guests) AND this guest has responded themselves.
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
                    g4.responded_at as at
               from public.guests g4
              where g4.event_id = e.id and g4.status in ('confirmed','declined')
                and g4.responded_at is not null
              order by g4.responded_at desc
              limit 8) a)
      end,
      'host_name', coalesce(u.raw_user_meta_data->>'name', 'your host')
    ),
    'guest', json_build_object(
      'name', g.name, 'party_size', g.party_size, 'status', g.status,
      'responded_at', g.responded_at, 'answer', g.answer
    )
  )
  from public.guests g
  join public.events e on e.id = g.event_id
  left join auth.users u on u.id = e.host_id
  where g.token = p_token;
$$;

-- -------------------------------------------------------------------------
-- rsvp_open_get: the open-invite view. Event design/details only — the
-- visitor hasn't responded, so no address (when hidden) and no social data.
-- -------------------------------------------------------------------------
create or replace function public.rsvp_open_get(p_open_token text)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'event', json_build_object(
      'name', e.name, 'description', e.description, 'event_date', e.event_date,
      'location', case when e.hide_address then null else e.location end,
      'location_hidden', e.hide_address,
      'cover_image_url', e.cover_image_url,
      'theme', e.theme, 'palette', e.palette,
      'spots', e.spots, 'allow_plus_one', e.allow_plus_one,
      'title_font', e.title_font, 'effect_emoji', e.effect_emoji,
      'extras', e.extras, 'guest_question', e.guest_question,
      'show_guests', e.show_guests,
      'host_name', coalesce(u.raw_user_meta_data->>'name', 'your host')
    )
  )
  from public.events e
  left join auth.users u on u.id = e.host_id
  where e.open_token = p_open_token and not coalesce(e.archived, false);
$$;

-- -------------------------------------------------------------------------
-- rsvp_open_submit: self-serve RSVP. Guards: honeypot (silently "succeeds"),
-- phone validation (7–15 digits), 300 self-registered cap, dedupe by the
-- last 10 digits (repeat submits update the same guest — no dupes).
-- Returns the guest's personal token so the page can continue as them.
-- -------------------------------------------------------------------------
create or replace function public.rsvp_open_submit(
  p_open_token text, p_name text, p_phone text, p_status text,
  p_party int default null, p_note text default null, p_answer text default null,
  p_hp text default null
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
  -- Honeypot filled → a bot. Pretend everything worked; store nothing.
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

  -- Same person again (by last-10 digits)? Update their reply, don't duplicate.
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
           answer       = coalesce(nullif(trim(p_answer), ''), answer)
     where id = g.id
     returning * into g;
  else
    insert into public.guests
      (event_id, name, phone, channel, party_size, status, responded_at,
       note, answer, self_registered)
    values
      (e.id, left(trim(p_name), 80), norm_phone, 'sms',
       greatest(1, least(20, coalesce(p_party, 1))), p_status, now(),
       nullif(trim(p_note), ''), nullif(trim(p_answer), ''), true)
    returning * into g;
  end if;

  insert into public.messages(event_id, guest_id, channel, direction, kind, body)
  values (e.id, g.id, 'sms', 'in', 'rsvp',
          case when p_status = 'confirmed' then '✅ Confirmed via open invite'
               else '🙅 Declined via open invite' end
          || coalesce(' — “' || nullif(trim(p_note), '') || '”', ''));

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

grant execute on function public.rsvp_open_get(text) to anon, authenticated;
grant execute on function public.rsvp_open_submit(text, text, text, text, int, text, text, text) to anon, authenticated;
