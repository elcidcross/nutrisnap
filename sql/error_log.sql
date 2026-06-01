-- error_log: durable record of AI proxy failures (api/claude.js).
-- Vercel's Hobby plan only keeps runtime logs for ~1h with no historical query,
-- so the proxy inserts a row here on every upstream AI error.
--
-- Run this once in the Supabase SQL editor. Writes happen via the caller's
-- validated JWT, so the standard auth.uid() = user_id RLS policy applies and no
-- service-role key is required.

create table if not exists public.error_log (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  provider   text,
  model      text,
  status     integer,
  message    text,
  context    jsonb
);

create index if not exists error_log_created_at_idx on public.error_log (created_at desc);

alter table public.error_log enable row level security;

-- Users may only insert/read their own rows (consistent with every other table).
-- You inspect all users' errors via the SQL editor, which bypasses RLS.
drop policy if exists error_log_own on public.error_log;
create policy error_log_own on public.error_log
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
