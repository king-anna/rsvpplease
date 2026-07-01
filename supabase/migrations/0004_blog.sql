-- =========================================================================
-- RSVPplease — blog posts (fed by the blog-webhook Edge Function)
-- An external content automation POSTs each article to /blog-webhook; it lands
-- here and is rendered client-side at /blog/<slug>. Anyone may READ published
-- posts (anon, via RLS); writes only happen through the service-role webhook.
-- Idempotent.
-- =========================================================================
create table if not exists public.posts (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  excerpt          text not null default '',
  body_html        text not null default '',
  cover_image_url  text,
  author           text not null default 'The RSVPplease team',
  tags             text[] not null default '{}',
  meta_title       text,
  meta_description text,
  read_minutes     int  not null default 3,
  published        boolean not null default true,
  published_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists posts_published_idx on public.posts (published, published_at desc);

alter table public.posts enable row level security;

-- Public read access to PUBLISHED posts only. No insert/update/delete policy is
-- granted, so the anon/authenticated roles cannot write — the webhook uses the
-- service-role key, which bypasses RLS.
drop policy if exists "public reads published posts" on public.posts;
create policy "public reads published posts" on public.posts
  for select using (published = true);

-- keep updated_at fresh on every edit
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_posts_touch on public.posts;
create trigger trg_posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();
