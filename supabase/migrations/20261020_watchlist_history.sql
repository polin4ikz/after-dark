-- Preserve rating history when a title is removed from the watchlist.
-- Run once in the Supabase SQL Editor before testing the new preview.
alter table public.archive
  add column if not exists in_watchlist boolean not null default true;
