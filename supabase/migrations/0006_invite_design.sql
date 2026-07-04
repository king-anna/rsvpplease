-- =========================================================================
-- RSVPplease — invite design (builder themes, palette, photo, spots, +1)
-- The party builder lets hosts style their invitation; the guest RSVP page
-- renders it. Idempotent.
-- =========================================================================

alter table public.events
  add column if not exists theme          text    not null default 'confetti',
  add column if not exists palette        text    not null default 'blush',
  add column if not exists spots          int,
  add column if not exists allow_plus_one boolean not null default true;

-- Guest page needs the design fields + a live "going" headcount.
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
      'theme', e.theme, 'palette', e.palette,
      'spots', e.spots, 'allow_plus_one', e.allow_plus_one,
      'going', (select coalesce(sum(g2.party_size), 0) from public.guests g2
                 where g2.event_id = e.id and g2.status = 'confirmed'),
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

-- Cover photos live in a public-read storage bucket; hosts upload their own.
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do update set public = true;

drop policy if exists "covers are public"        on storage.objects;
drop policy if exists "hosts upload covers"      on storage.objects;
drop policy if exists "hosts update own covers"  on storage.objects;
drop policy if exists "hosts delete own covers"  on storage.objects;

create policy "covers are public" on storage.objects
  for select using (bucket_id = 'covers');
create policy "hosts upload covers" on storage.objects
  for insert to authenticated with check (bucket_id = 'covers');
create policy "hosts update own covers" on storage.objects
  for update to authenticated using (bucket_id = 'covers' and owner = auth.uid());
create policy "hosts delete own covers" on storage.objects
  for delete to authenticated using (bucket_id = 'covers' and owner = auth.uid());
