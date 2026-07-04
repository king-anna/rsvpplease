-- =========================================================================
-- RSVPplease — grant admin (and comped/free SMS) to Eva
-- Admins now also get comped = true, so the SMS feature is free for them:
-- send-invites skips the payment gate for comped profiles, and the app shows
-- the free-send panel instead of the pay flow. Idempotent.
-- =========================================================================

insert into public.admin_emails(email) values ('eve.a.melnik@gmail.com')
  on conflict do nothing;

-- Admins are comped at sign-up from now on…
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
    is_admin_email
  )
  on conflict (id) do nothing;
  return new;
end; $$;

-- …and retroactively for anyone already registered with an allowlisted email.
update public.profiles p
   set role = 'admin', comped = true
 where exists (select 1 from public.admin_emails a where lower(a.email) = lower(p.email))
   and (p.role <> 'admin' or p.comped = false);
