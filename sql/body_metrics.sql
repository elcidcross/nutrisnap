-- body_metrics: simple weight / body-fat snapshots (the "Body" app).
-- Each row is a point-in-time measurement; trends/charts come in a later iteration.
--
-- Run this once in the Supabase SQL editor. Writes happen via the caller's
-- validated JWT, so the standard auth.uid() = user_id RLS policy applies and no
-- service-role key is required.

create table if not exists public.body_metrics (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  timestamp  int8 not null,                          -- epoch milliseconds
  weight     numeric,                                -- kg
  body_fat   numeric,                                -- percent (optional)
  notes      text
);

create index if not exists body_metrics_user_ts_idx
  on public.body_metrics (user_id, timestamp desc);

alter table public.body_metrics enable row level security;

drop policy if exists body_metrics_own on public.body_metrics;
create policy body_metrics_own on public.body_metrics
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
