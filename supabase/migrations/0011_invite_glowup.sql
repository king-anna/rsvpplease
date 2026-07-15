-- =========================================================================
-- RSVPplease — invite glow-up (Phase 1)
-- Full-page themed invites: title font, custom emoji effects, extras chips,
-- a host question, hidden-address-until-RSVP, and opt-in social proof.
-- Spec: docs/superpowers/specs/2026-07-15-partiful-upgrades-design.md
-- Idempotent.
-- =========================================================================

alter table public.events
  add column if not exists title_font     text,
  add column if not exists effect_emoji   text,
  add column if not exists extras         jsonb   not null default '{}',
  add column if not exists guest_question text,
  add column if not exists hide_address   boolean not null default false,
  add column if not exists show_guests    boolean not null default false;

alter table public.guests
  add column if not exists answer text;

-- -------------------------------------------------------------------------
-- rsvp_get: guest page payload.
--  * hide_address: location is withheld until THIS guest has confirmed
--    (location_hidden tells the page why it's missing).
--  * show_guests:  going_count + up to 8 first names, and only after THIS
--    guest has responded (Partiful-style gate). Otherwise nothing leaks.
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
-- rsvp_submit gains p_answer (the guest's reply to the host's question).
-- The old 4-arg signature must be dropped: keeping both overloads would make
-- named-argument RPC calls ambiguous.
-- -------------------------------------------------------------------------
drop function if exists public.rsvp_submit(text, text, int, text);

create or replace function public.rsvp_submit(
  p_token text, p_status text, p_party int default null, p_note text default null,
  p_answer text default null
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
         answer       = coalesce(p_answer, answer)
   where id = g.id
   returning * into g;

  inbound_body := case when p_status = 'confirmed' then '✅ Confirmed via RSVP page'
                       else '🙅 Declined via RSVP page' end
                  || coalesce(' — “' || p_note || '”', '')
                  || coalesce(' · answered: “' || p_answer || '”', '');
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

grant execute on function public.rsvp_get(text) to anon, authenticated;
grant execute on function public.rsvp_submit(text, text, int, text, text) to anon, authenticated;
