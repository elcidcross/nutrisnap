-- meditations: one row per session (the "Meditation" app).
-- `duration` is MINUTES.
--
-- Run this once in the Supabase SQL editor. Writes happen via the caller's
-- validated JWT, so the standard auth.uid() = user_id RLS policy applies and no
-- service-role key is required.

create table if not exists public.meditations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  timestamp  int8 not null,                          -- epoch milliseconds
  duration   numeric,                                -- minutes
  notes      text
);

create index if not exists meditations_user_ts_idx
  on public.meditations (user_id, timestamp desc);

alter table public.meditations enable row level security;

drop policy if exists meditations_own on public.meditations;
create policy meditations_own on public.meditations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
