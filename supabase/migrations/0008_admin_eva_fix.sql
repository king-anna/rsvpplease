-- =========================================================================
-- RSVPplease — robustly ensure the allowlisted admins really are admins.
-- The 0005 backfill matched profiles.email, which can be stale/null; match on
-- auth.users.email (the source of truth) instead and update the profile by id.
-- comped is left untouched on purpose: an admin who is NOT comped goes through
-- the (test-mode) Stripe checkout, which is what we want for Eva.
-- Idempotent.
-- =========================================================================

insert into public.admin_emails(email) values ('eve.a.melnik@gmail.com')
  on conflict do nothing;

-- Keep profiles.email in sync with the auth record.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is distinct from u.email;

-- Create any missing profile rows for allowlisted users (defensive).
insert into public.profiles (id, email, full_name, role, comped)
select u.id, u.email, u.raw_user_meta_data->>'name', 'admin', false
  from auth.users u
 where exists (select 1 from public.admin_emails a where lower(a.email) = lower(u.email))
   and not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- Grant admin to every allowlisted account, matched via auth.users.email.
update public.profiles p
   set role = 'admin'
  from auth.users u
 where u.id = p.id
   and exists (select 1 from public.admin_emails a where lower(a.email) = lower(u.email))
   and p.role <> 'admin';
