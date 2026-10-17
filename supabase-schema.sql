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

create table if not exists public.private_members (
  slot smallint primary key check (slot in (1, 2)),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.private_members enable row level security;
grant select on public.private_members to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.private_members from anon, authenticated;
drop policy if exists "private_members_select_self" on public.private_members;
create policy "private_members_select_self"
on public.private_members for select to authenticated
using (user_id = (select auth.uid()));

do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('archive', 'ratings')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end
$$;

alter table public.archive enable row level security;
alter table public.ratings enable row level security;

create policy "archive_select_private_members" on public.archive for select to authenticated
using (exists (select 1 from public.private_members m where m.user_id = (select auth.uid())));
create policy "archive_insert_private_members" on public.archive for insert to authenticated
with check (exists (select 1 from public.private_members m where m.user_id = (select auth.uid())));
create policy "archive_update_private_members" on public.archive for update to authenticated
using (exists (select 1 from public.private_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.private_members m where m.user_id = (select auth.uid())));
create policy "archive_delete_private_members" on public.archive for delete to authenticated
using (exists (select 1 from public.private_members m where m.user_id = (select auth.uid())));

create policy "ratings_select_private_members" on public.ratings for select to authenticated
using (exists (select 1 from public.private_members m where m.user_id = (select auth.uid())));
create policy "ratings_insert_own_private_members" on public.ratings for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.private_members m where m.user_id = (select auth.uid())));
create policy "ratings_update_own_private_members" on public.ratings for update to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.private_members m where m.user_id = (select auth.uid())))
with check (user_id = (select auth.uid()) and exists (select 1 from public.private_members m where m.user_id = (select auth.uid())));
create policy "ratings_delete_own_private_members" on public.ratings for delete to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.private_members m where m.user_id = (select auth.uid())));

create index if not exists ratings_user_id_idx on public.ratings(user_id);
create index if not exists archive_type_idx on public.archive(type);
create index if not exists private_members_user_id_idx on public.private_members(user_id);
