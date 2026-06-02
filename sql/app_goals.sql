-- app_goals: per-app target values shown on each app's Goals tab and overlaid on
-- its Report charts (e.g. Jog weekly_distance, Body target_weight). One row per
-- (user, app, goal key) so every app shares this table without colliding.
--
-- Run this once in the Supabase SQL editor. Writes happen via the caller's
-- validated JWT, so the standard auth.uid() = user_id RLS policy applies and no
-- service-role key is required.

create table if not exists public.app_goals (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users (id) on delete cascade,
  app      text not null,                            -- 'jog' | 'body' | …
  key      text not null,                            -- goal name, e.g. 'target_weight'
  value    numeric,
  unique (user_id, app, key)                         -- real unique constraint → upsert works
);

create index if not exists app_goals_user_app_idx
  on public.app_goals (user_id, app);

alter table public.app_goals enable row level security;

drop policy if exists app_goals_own on public.app_goals;
create policy app_goals_own on public.app_goals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
