-- AFTER DARK / SUPABASE STORAGE
-- Run this once in Supabase SQL Editor after the existing profiles table.

create table if not exists public.archive (
  tmdb_id bigint primary key,
  title text not null,
  name text,
  poster_path text,
  backdrop_path text,
  release_date text,
  first_air_date text,
  type text not null default 'film',
  vote_average numeric(4,2) default 0,
  genre_ids jsonb not null default '[]'::jsonb,
  origin_countries jsonb not null default '[]'::jsonb,
  watched boolean not null default false,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ratings (
  tmdb_id bigint not null references public.archive(tmdb_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating numeric(3,1) not null check (rating >= 0 and rating <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tmdb_id, user_id)
);

alter table public.archive enable row level security;
alter table public.ratings enable row level security;

drop policy if exists "archive_select_authenticated" on public.archive;
drop policy if exists "archive_insert_authenticated" on public.archive;
drop policy if exists "archive_update_authenticated" on public.archive;
drop policy if exists "archive_delete_authenticated" on public.archive;

drop policy if exists "ratings_select_authenticated" on public.ratings;
drop policy if exists "ratings_insert_own" on public.ratings;
drop policy if exists "ratings_update_own" on public.ratings;
drop policy if exists "ratings_delete_own" on public.ratings;

create policy "archive_select_authenticated"
on public.archive for select
to authenticated
using (true);

create policy "archive_insert_authenticated"
on public.archive for insert
to authenticated
with check (true);

create policy "archive_update_authenticated"
on public.archive for update
to authenticated
using (true)
with check (true);

create policy "archive_delete_authenticated"
on public.archive for delete
to authenticated
using (true);

create policy "ratings_select_authenticated"
on public.ratings for select
to authenticated
using (true);

create policy "ratings_insert_own"
on public.ratings for insert
to authenticated
with check (auth.uid() = user_id);

create policy "ratings_update_own"
on public.ratings for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "ratings_delete_own"
on public.ratings for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists ratings_user_id_idx on public.ratings(user_id);
create index if not exists archive_type_idx on public.archive(type);
