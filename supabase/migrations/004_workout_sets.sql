-- Per-set tracking for strength workouts.
--
-- Until now, one `workouts` row represented a whole exercise entry with a single
-- aggregate `sets` count and one `reps`/`weight_kg` value shared across all of
-- them — it couldn't represent a real set-by-set session like 95x8, 95x8, 95x6
-- (e.g. a drop set, or reps falling off toward failure). This migration adds a
-- child table so each individual set can have its own reps/weight and a
-- completed checkbox, matching how the log screen now records a workout.
--
-- `workouts` stays the parent "exercise entry" row (exercise_name, muscle_group,
-- performed_at, notes) — existing features that read workouts.sets/reps/weight_kg
-- (history list, exports, older rows with no sets attached) keep working
-- unchanged, because the log screen still writes those columns as a rolled-up
-- summary (see app/(app)/log/page.tsx) whenever it also writes workout_sets.

create table if not exists public.workout_sets (
  id uuid primary key default uuid_generate_v4(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  set_number integer not null,
  reps integer,
  weight_kg numeric,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workout_id, set_number)
);

create index if not exists workout_sets_workout_id_idx on public.workout_sets (workout_id);
create index if not exists workout_sets_user_id_idx on public.workout_sets (user_id);

alter table public.workout_sets enable row level security;

drop policy if exists "Users can view their own workout sets" on public.workout_sets;
create policy "Users can view their own workout sets"
  on public.workout_sets for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own workout sets" on public.workout_sets;
create policy "Users can insert their own workout sets"
  on public.workout_sets for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own workout sets" on public.workout_sets;
create policy "Users can update their own workout sets"
  on public.workout_sets for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own workout sets" on public.workout_sets;
create policy "Users can delete their own workout sets"
  on public.workout_sets for delete
  using (auth.uid() = user_id);

-- Precise total volume for the whole entry (sum of reps x weight across every
-- completed set). Nullable and left untouched for existing rows, which keeps
-- computeTodayTotals()'s old sets*reps*weight_kg fallback correct for them —
-- only rows written by the new set-by-set log screen populate this column.
alter table public.workouts add column if not exists total_volume_kg numeric;
