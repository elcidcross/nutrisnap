-- body_metrics: weight + smart-scale body-composition snapshots (the "Body" app).
-- Each row is a point-in-time measurement; trends/charts come in a later iteration.
-- Only measured metrics are stored — derived values (fat mass, BMI, standard
-- weight, obesity degree, …) are recomputed on demand, not persisted.
--
-- Run this once in the Supabase SQL editor. Writes happen via the caller's
-- validated JWT, so the standard auth.uid() = user_id RLS policy applies and no
-- service-role key is required. The `add column if not exists` lines let this be
-- re-run safely to widen a table created by an earlier (weight/body_fat-only) version.

create table if not exists public.body_metrics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  timestamp    int8 not null,                        -- epoch milliseconds
  weight       numeric,                              -- kg
  height       numeric,                              -- m (entered each time; BMI etc. derive from it)
  body_fat     numeric,                              -- percent
  muscle_mass  numeric,                              -- kg
  body_water   numeric,                              -- percent
  bone_mass    numeric,                              -- kg
  bmr          numeric,                              -- kcal (basal metabolic rate)
  visceral_fat numeric,                              -- level (unitless index)
  leg_score    numeric,                              -- proprietary leg-muscle index (not derivable)
  notes        text
);

-- Backfill new columns onto a pre-existing table (no-op on a fresh create above).
alter table public.body_metrics add column if not exists height       numeric;
alter table public.body_metrics add column if not exists muscle_mass  numeric;
alter table public.body_metrics add column if not exists body_water   numeric;
alter table public.body_metrics add column if not exists bone_mass    numeric;
alter table public.body_metrics add column if not exists bmr          numeric;
alter table public.body_metrics add column if not exists visceral_fat numeric;
alter table public.body_metrics add column if not exists leg_score    numeric;

create index if not exists body_metrics_user_ts_idx
  on public.body_metrics (user_id, timestamp desc);

alter table public.body_metrics enable row level security;

drop policy if exists body_metrics_own on public.body_metrics;
create policy body_metrics_own on public.body_metrics
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
