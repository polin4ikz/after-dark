-- AFTER DARK: shared playback progress for the two private archive members.
-- Run once in Supabase SQL Editor. Does not alter or delete existing archive/rating data.
create table if not exists public.watch_progress (
  tmdb_id bigint primary key,
  title text,
  media_type text not null default 'movie' check (media_type in ('movie','tv')),
  position_seconds integer not null default 0 check (position_seconds >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  season_number integer check (season_number is null or season_number >= 1),
  episode_number integer check (episode_number is null or episode_number >= 1),
  source_provider text not null default 'unknown',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.watch_progress enable row level security;
revoke all on public.watch_progress from anon;
grant select, insert, update, delete on public.watch_progress to authenticated;

drop policy if exists watch_progress_select_private_members on public.watch_progress;
drop policy if exists watch_progress_insert_private_members on public.watch_progress;
drop policy if exists watch_progress_update_private_members on public.watch_progress;
drop policy if exists watch_progress_delete_private_members on public.watch_progress;

create policy watch_progress_select_private_members on public.watch_progress
for select to authenticated
using (exists (select 1 from public.private_members m where m.user_id = (select auth.uid())));

create policy watch_progress_insert_private_members on public.watch_progress
for insert to authenticated
with check (
  exists (select 1 from public.private_members m where m.user_id = (select auth.uid()))
  and (updated_by is null or updated_by = (select auth.uid()))
);

create policy watch_progress_update_private_members on public.watch_progress
for update to authenticated
using (exists (select 1 from public.private_members m where m.user_id = (select auth.uid())))
with check (
  exists (select 1 from public.private_members m where m.user_id = (select auth.uid()))
  and (updated_by is null or updated_by = (select auth.uid()))
);

create policy watch_progress_delete_private_members on public.watch_progress
for delete to authenticated
using (exists (select 1 from public.private_members m where m.user_id = (select auth.uid())));

create index if not exists watch_progress_status_idx on public.watch_progress(status);
create index if not exists watch_progress_updated_at_idx on public.watch_progress(updated_at desc);
