-- workouts: one row per strength/training session (the "Workout" app).
-- `duration` is MINUTES here (whole-minute logging is enough for sessions);
-- `name` is an optional label like "Upper body".
--
-- Run this once in the Supabase SQL editor. Writes happen via the caller's
-- validated JWT, so the standard auth.uid() = user_id RLS policy applies and no
-- service-role key is required.

create table if not exists public.workouts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  timestamp  int8 not null,                          -- epoch milliseconds
  duration   numeric,                                -- minutes
  name       text,                                   -- workout name (optional)
  notes      text
);

create index if not exists workouts_user_ts_idx
  on public.workouts (user_id, timestamp desc);

alter table public.workouts enable row level security;

drop policy if exists workouts_own on public.workouts;
create policy workouts_own on public.workouts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
