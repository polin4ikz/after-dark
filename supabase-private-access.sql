-- AFTER DARK: lock the shared archive to the two intended accounts.
-- Run this migration in Supabase SQL Editor AFTER creating the archive and ratings tables.
-- This migration intentionally leaves private_members empty. Add the two new Auth user UUIDs
-- after creating the two accounts; instructions are in PRIVATE-DEPLOY.md.
-- Until those UUIDs are added, archive and rating access is denied to everyone (fail-closed).

create table if not exists public.private_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.private_members enable row level security;

grant select on public.private_members to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.private_members from anon, authenticated;

drop policy if exists "private_members_select_self" on public.private_members;
create policy "private_members_select_self"
on public.private_members for select
to authenticated
using (user_id = (select auth.uid()));

-- Remove every existing policy on these tables first. PostgreSQL combines permissive
-- policies with OR, so leaving an old broad policy would silently defeat the restrictions.
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('archive', 'ratings')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end
$$;

alter table public.archive enable row level security;
alter table public.ratings enable row level security;

create policy "archive_select_private_members"
on public.archive for select
to authenticated
using (
  exists (
    select 1 from public.private_members m
    where m.user_id = (select auth.uid())
  )
);

create policy "archive_insert_private_members"
on public.archive for insert
to authenticated
with check (
  exists (
    select 1 from public.private_members m
    where m.user_id = (select auth.uid())
  )
);

create policy "archive_update_private_members"
on public.archive for update
to authenticated
using (
  exists (
    select 1 from public.private_members m
    where m.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.private_members m
    where m.user_id = (select auth.uid())
  )
);

create policy "archive_delete_private_members"
on public.archive for delete
to authenticated
using (
  exists (
    select 1 from public.private_members m
    where m.user_id = (select auth.uid())
  )
);

create policy "ratings_select_private_members"
on public.ratings for select
to authenticated
using (
  exists (
    select 1 from public.private_members m
    where m.user_id = (select auth.uid())
  )
);

create policy "ratings_insert_own_private_members"
on public.ratings for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.private_members m
    where m.user_id = (select auth.uid())
  )
);

create policy "ratings_update_own_private_members"
on public.ratings for update
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.private_members m
    where m.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.private_members m
    where m.user_id = (select auth.uid())
  )
);

create policy "ratings_delete_own_private_members"
on public.ratings for delete
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.private_members m
    where m.user_id = (select auth.uid())
  )
);

create index if not exists private_members_user_id_idx on public.private_members(user_id);
