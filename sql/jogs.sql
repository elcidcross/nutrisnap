-- jogs: one row per run. Jog, Workout, and Meditation are presented as separate
-- "apps" in the UI and each gets its own table so a column means one thing —
-- here `duration` is SECONDS (exact; the UI enters/renders it as h:mm:ss).
--
-- Run this once in the Supabase SQL editor. Writes happen via the caller's
-- validated JWT, so the standard auth.uid() = user_id RLS policy applies and no
-- service-role key is required.

create table if not exists public.jogs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  timestamp  int8 not null,                          -- epoch milliseconds
  duration   numeric,                                -- seconds
  distance   numeric,                                -- km
  notes      text
);

create index if not exists jogs_user_ts_idx
  on public.jogs (user_id, timestamp desc);

alter table public.jogs enable row level security;

drop policy if exists jogs_own on public.jogs;
create policy jogs_own on public.jogs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
