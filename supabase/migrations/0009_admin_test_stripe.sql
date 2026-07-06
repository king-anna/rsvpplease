-- =========================================================================
-- RSVPplease — add anna.korol@hotmail.com as admin, and make "admin" mean
-- Stripe TEST mode rather than the free comp bypass.
--
-- Change of model: admins are NO LONGER auto-comped. Being an admin now routes
-- checkout through Stripe test mode (real flow, test card, no live charge).
-- `comped` (free SMS, skips checkout) stays a MANUAL grant via the admin
-- dashboard. Existing comped values are left untouched. Idempotent.
-- =========================================================================

insert into public.admin_emails(email) values ('anna.korol@hotmail.com')
  on conflict do nothing;

-- New signups: allowlisted → admin, but comped=false (→ test Stripe).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_admin_email boolean := exists
    (select 1 from public.admin_emails a where lower(a.email) = lower(new.email));
begin
  insert into public.profiles (id, email, full_name, role, comped)
  values (
    new.id, new.email, new.raw_user_meta_data->>'name',
    case when is_admin_email then 'admin' else 'host' end,
    false
  )
  on conflict (id) do nothing;
  return new;
end; $$;

-- Keep profiles.email in step with the auth record.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is distinct from u.email;

-- Create any missing profile rows for allowlisted users (comped=false).
insert into public.profiles (id, email, full_name, role, comped)
select u.id, u.email, u.raw_user_meta_data->>'name', 'admin', false
  from auth.users u
 where exists (select 1 from public.admin_emails a where lower(a.email) = lower(u.email))
   and not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- Grant admin to every allowlisted account (matched on auth.users.email).
-- comped is intentionally NOT changed here.
update public.profiles p
   set role = 'admin'
  from auth.users u
 where u.id = p.id
   and exists (select 1 from public.admin_emails a where lower(a.email) = lower(u.email))
   and p.role <> 'admin';
