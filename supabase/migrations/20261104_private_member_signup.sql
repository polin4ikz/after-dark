-- Automatically assign each newly registered account one of the two private archive slots.
-- This keeps the invite-only archive usable after its existing accounts are removed.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  available_slot smallint;
begin
  insert into public.profiles (id, nickname)
  values (new.id, new.raw_user_meta_data->>'nickname');

  perform pg_advisory_xact_lock(hashtext('after-dark-private-member-slot'));

  select candidate.slot::smallint
    into available_slot
  from generate_series(1, 2) as candidate(slot)
  where not exists (
    select 1
    from public.private_members member
    where member.slot = candidate.slot
  )
  order by candidate.slot
  limit 1;

  if available_slot is null then
    raise exception 'The private archive is full';
  end if;

  insert into public.private_members (slot, user_id)
  values (available_slot, new.id);

  return new;
end;
$$;
