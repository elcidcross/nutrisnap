-- report_card_notes: the AI-generated "teacher's note" shown on each weekly Report
-- Card. One note per (user, week, persona); generated on first view of a finished
-- week and regenerated on demand (Refresh) — so a real unique constraint lets upsert
-- overwrite cleanly.
--
-- Run this once in the Supabase SQL editor. Writes happen via the caller's validated
-- JWT, so the standard auth.uid() = user_id RLS policy applies (no service-role key).

create table if not exists public.report_card_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  week_start int8 not null,            -- Sunday weekStart epoch ms (identifies the week)
  persona    text not null,           -- 'tough' | 'encouraging' | 'analytical'
  text       text not null,
  model      text,                    -- _modelUsed at generation time
  created_at timestamptz not null default now(),
  unique (user_id, week_start, persona)
);

create index if not exists report_card_notes_user_idx
  on public.report_card_notes (user_id);

alter table public.report_card_notes enable row level security;

drop policy if exists report_card_notes_own on public.report_card_notes;
create policy report_card_notes_own on public.report_card_notes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
