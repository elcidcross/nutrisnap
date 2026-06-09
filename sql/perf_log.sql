-- perf_log: durable per-call timing for the AI proxy (api/claude.js) so we can
-- visualize where an analysis spends its time and track latency trends over days.
-- Vercel's Hobby plan keeps runtime logs for ~1h with no historical query, so the
-- client writes one row here after every analysis (success AND failure).
--
-- One row per analysis. The client owns the write (it knows the encode time, the
-- payload size, the full round-trip, and the final outcome) and merges in the
-- server-measured segments the proxy returns as `_perf`. Splitting the round trip
-- this way isolates upload+cold-start (network_ms) from model inference
-- (upstream_ms) — the single most useful breakdown.
--
-- Run this once in the Supabase SQL editor. Writes happen via the caller's
-- validated JWT, so the standard auth.uid() = user_id RLS policy applies and no
-- service-role key is required.

create table if not exists public.perf_log (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         text,            -- 'image' | 'text'
  provider     text,            -- requested provider (anthropic | openai | gemini)
  model        text,            -- requested model
  model_used   text,            -- model that actually answered (Gemini may fall back)
  success      boolean,
  status       integer,         -- HTTP status (200 on success, upstream/proxy code on failure)
  attempts     integer,         -- client attempts incl. retries (1 = no retry)
  encode_ms    integer,         -- client-side image JPEG encode time (null for text)
  req_bytes    integer,         -- request payload size (base64 image / prompt)
  resp_bytes   integer,         -- AI response text length
  client_ms    integer,         -- full round trip of the successful attempt (client clock)
  server_ms    integer,         -- proxy entry->exit (Vercel function wall time)
  auth_ms      integer,         -- proxy JWT validation round trip
  upstream_ms  integer,         -- proxy->AI provider call time (inference)
  network_ms   integer,         -- derived: client_ms - server_ms (upload+download+queue+cold start)
  region       text,            -- Vercel function region that served the request
  error_message text            -- null on success
);

create index if not exists perf_log_created_at_idx on public.perf_log (created_at desc);

alter table public.perf_log enable row level security;

-- Users may only insert/read their own rows (consistent with every other table).
-- You inspect all users' timings via the SQL editor, which bypasses RLS.
drop policy if exists perf_log_own on public.perf_log;
create policy perf_log_own on public.perf_log
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
