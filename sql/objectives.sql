-- objectives: deadline-based achievement goals for the cross-app Goals hub.
-- Distinct from app_goals (which holds standing per-app target values overlaid on
-- Report charts). An objective answers "what am I trying to achieve, when is it
-- due, and did I succeed or fail?" and can target any app's data.
--
-- Three kinds (the `type` column):
--   reach      — trend a measured metric to `target` by `due_ts` (one-off; status
--                latches to 'achieved'/'missed'). `baseline` snapshots the metric
--                at creation so progress has a denominator. `direction` says whether
--                lower or higher is the win.
--   accumulate — sum an activity field to `target` within a recurring `period`
--                (e.g. 10 km/week). Renews each period; status stays 'active'.
--   streak     — hit `target` sessions/days each recurring `period` (e.g. meditate
--                every day → target 1, period 'day'). Renews each period.
--
-- Run this once in the Supabase SQL editor. Writes happen via the caller's
-- validated JWT, so the standard auth.uid() = user_id RLS policy applies and no
-- service-role key is required.

create table if not exists public.objectives (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text,                  -- optional custom label; else derived from app/metric/target
  app        text not null,         -- source app id: 'body' | 'jog' | 'meditation' | 'workout' | 'nutrisnap'
  metric     text not null,         -- field key: 'body_fat' | 'distance' | 'days' | 'sessions' | 'calories' ...
  type       text not null,         -- 'reach' | 'accumulate' | 'streak'
  target     numeric not null,      -- reach: target reading; accumulate: total per period; streak: sessions per period
  direction  text,                  -- reach only: 'down' | 'up' (is lower or higher the win?)
  baseline   numeric,               -- reach only: metric snapshot at the start date (progress denominator)
  period     text,                  -- accumulate/streak: 'day' | 'week' | 'month'; reach: null
  start_ts   int8,                  -- reach: chosen start date (epoch ms); pace is measured start → due
  due_ts     int8,                  -- reach: deadline (epoch ms); recurring: null
  status     text not null default 'active', -- reach: 'active'|'achieved'|'missed'; recurring: always 'active'
  created_at timestamptz not null default now()
);

-- For deployments created before start_ts existed.
alter table public.objectives add column if not exists start_ts int8;

create index if not exists objectives_user_idx
  on public.objectives (user_id);

alter table public.objectives enable row level security;

drop policy if exists objectives_own on public.objectives;
create policy objectives_own on public.objectives
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
