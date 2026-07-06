-- =========================================================================
-- RSVPplease — mark test-mode payments so they stay out of revenue stats.
-- Admins run checkout in Stripe TEST mode; those payments must not inflate the
-- admin dashboard's "total paid". Idempotent.
-- =========================================================================

alter table public.payments
  add column if not exists is_test boolean not null default false;

-- Revenue = paid, non-test payments only.
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
         where e.host_id = p.id and pay.status = 'paid' and pay.is_test = false), 0),
      p.created_at
    from public.profiles p
    order by p.created_at desc;
end; $$;
