-- Performance indexes for the Dashboard queries.
-- Safe to re-run: IF NOT EXISTS on every statement.
--
-- Why these specifically: the existing workouts_user_id_idx and
-- workouts_performed_at_idx are single-column, so a query that filters on
-- type='strength' AND a performed_at range (dashboard's "this week vs last
-- week" volume query, the 1000-row recent-strength query, WeeklyVolume,
-- and Recovery) can only use one of them and then filters the rest in
-- memory. A composite index lets Postgres satisfy the whole predicate from
-- the index directly.

-- (user_id, type, performed_at desc): covers the dashboard's strength-only,
-- date-ranged reads — this is the composite the RLS policy plus the
-- dashboard's own .eq('type','strength').gte(...).lte(...) queries want.
create index if not exists workouts_user_type_performed_at_idx
  on public.workouts (user_id, type, performed_at desc);

-- (user_id, exercise_name): covers the "Next PR" lookup, which pulls the
-- full history for one exercise_name per user.
create index if not exists workouts_user_exercise_name_idx
  on public.workouts (user_id, exercise_name)
  where exercise_name is not null;

-- program_completions is queried as
--   .eq('completed_at', today).in('program_exercise_id', [...])
-- The existing indexes only cover user_id and completed_at individually;
-- this composite lets the IN-list lookup for "today's completions" be
-- satisfied directly instead of scanning every completion for the date.
create index if not exists program_completions_exercise_completed_idx
  on public.program_completions (program_exercise_id, completed_at);
