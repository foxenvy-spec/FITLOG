-- 6F-P5 (P1 — Completion Provenance Integrity) — program_completions has no way to distinguish "never
-- completed" from "completed, then the user deliberately un-completed it on /program": the manual
-- un-complete toggle (app/(app)/program/page.tsx) does a hard delete, and the table has no soft-delete
-- column, no history, no audit trail. Any reconciliation that re-creates a completion whenever workout
-- evidence exists would silently undo a user's intentional correction, with no way to detect it was doing
-- so.
--
-- program_completion_overrides records that intent explicitly and separately from program_completions
-- itself, so "completed" and "do not auto-reconcile this completion" are two independently representable
-- states instead of both collapsing into "no row." Scoped per (user, exercise, day) — matching
-- program_completions' own existing completed_at day-scoping — so un-completing today's occurrence never
-- suppresses a future occurrence of the same recurring program day.
--
-- Only program_exercise_id (never workout_id/ad-hoc): /program's manual toggle only ever operates on real
-- program_exercises rows — ad-hoc completions have no UI to manually un-complete in the first place.
create table if not exists public.program_completion_overrides (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  program_exercise_id uuid not null references public.program_exercises (id) on delete cascade,
  completion_date date not null,
  override_type text not null check (override_type in ('manual_uncomplete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, program_exercise_id, completion_date)
);

create index if not exists program_completion_overrides_user_id_idx
  on public.program_completion_overrides (user_id);

alter table public.program_completion_overrides enable row level security;

-- 044 (program_completions) had to add UPDATE after the fact once upsert-on-conflict started hitting it —
-- included from the start here since this table is upserted the same way.
drop policy if exists "Users can view their own completion overrides" on public.program_completion_overrides;
create policy "Users can view their own completion overrides"
  on public.program_completion_overrides for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own completion overrides" on public.program_completion_overrides;
create policy "Users can insert their own completion overrides"
  on public.program_completion_overrides for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own completion overrides" on public.program_completion_overrides;
create policy "Users can update their own completion overrides"
  on public.program_completion_overrides for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own completion overrides" on public.program_completion_overrides;
create policy "Users can delete their own completion overrides"
  on public.program_completion_overrides for delete
  using (auth.uid() = user_id);
