-- =========================================================================
-- RSVPplease — roles, admin, and comped (free) access
-- =========================================================================

-- Allowlist of emails that become admins on sign-up. Locked down (RLS on, no
-- policy) so it's only readable by the SECURITY DEFINER trigger/functions.
create table if not exists public.admin_emails (email text primary key);
alter table public.admin_emails enable row level security;
insert into public.admin_emails(email) values ('anna.e.korol@gmail.com')
  on conflict do nothing;

-- One profile per auth user: role + comped flag.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'host' check (role in ('host', 'admin')),
  comped     boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "read own profile"   on public.profiles for select using (id = auth.uid());
create policy "update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Auto-create a profile on sign-up (admin if the email is allowlisted).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id, new.email, new.raw_user_meta_data->>'name',
    case when exists (select 1 from public.admin_emails a where lower(a.email) = lower(new.email))
         then 'admin' else 'host' end
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Backfill profiles for anyone who signed up before this migration.
insert into public.profiles (id, email, full_name, role)
select u.id, u.email, u.raw_user_meta_data->>'name',
  case when exists (select 1 from public.admin_emails a where lower(a.email) = lower(u.email))
       then 'admin' else 'host' end
from auth.users u
on conflict (id) do nothing;

update public.profiles p set role = 'admin'
where exists (select 1 from public.admin_emails a where lower(a.email) = lower(p.email))
  and p.role <> 'admin';

-- Helpers ------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Per-user aggregates for the admin dashboard (admin only).
create or replace function public.admin_overview()
returns table (
  user_id uuid, email text, full_name text, role text, comped boolean,
  events bigint, guests bigint, total_paid_cents bigint, joined timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return query
    select p.id, p.email, p.full_name, p.role, p.comped,
      (select count(*) from public.events e where e.host_id = p.id),
      (select count(*) from public.guests g
         join public.events e on e.id = g.event_id where e.host_id = p.id),
      coalesce((select sum(pay.amount_cents) from public.payments pay
         join public.events e on e.id = pay.event_id
         where e.host_id = p.id and pay.status = 'paid'), 0),
      p.created_at
    from public.profiles p
    order by p.created_at desc;
end; $$;

-- Admin grants/revokes comped (free) access for a user.
create or replace function public.admin_set_comped(target uuid, value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.profiles set comped = value where id = target;
end; $$;

grant execute on function public.is_admin()                        to authenticated;
grant execute on function public.admin_overview()                  to authenticated;
grant execute on function public.admin_set_comped(uuid, boolean)   to authenticated;
