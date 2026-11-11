-- Run this in the Supabase SQL editor once.

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author text,
  body text not null default '',
  image_data text,
  created_at timestamptz not null default now(),
  constraint posts_body_len check (char_length(body) <= 2000),
  constraint posts_author_len check (author is null or char_length(author) <= 40),
  constraint posts_image_len check (image_data is null or char_length(image_data) <= 700000),
  constraint posts_has_content check (
    char_length(trim(body)) > 0 or image_data is not null
  )
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);

alter table public.posts enable row level security;

drop policy if exists "Anyone can read posts" on public.posts;
create policy "Anyone can read posts"
  on public.posts
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can insert posts" on public.posts;
create policy "Anyone can insert posts"
  on public.posts
  for insert
  to anon, authenticated
  with check (
    char_length(body) <= 2000
    and (author is null or char_length(author) <= 40)
    and (image_data is null or char_length(image_data) <= 700000)
    and (char_length(trim(body)) > 0 or image_data is not null)
  );

drop policy if exists "Anyone can delete posts" on public.posts;
create policy "Anyone can delete posts"
  on public.posts
  for delete
  to anon, authenticated
  using (true);
