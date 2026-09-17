-- 6F-P1 (Session State & Workout Continuity Integrity) — program_day_id answers "which planned day,"
-- not "which workout event." Five producers (AI Coach quick-start, AI-generated session, template
-- quick-start, repeat-session, and /session's own live flow when no plan is open) all write
-- program_day_id = null with nothing distinguishing them from each other or from genuine /log entries.
-- findExtraLoggedExercises() then treats every null-program_day_id row today as one undifferentiated
-- ad-hoc bucket, letting one session's exercises bleed into a later, unrelated session the same day.
--
-- session_id is a client-generated, per-visit/per-action UUID, orthogonal to program_day_id — it answers
-- "which workout event did this row come from," not "which plan." Nullable because /log and CSV/backup
-- import are genuinely freestanding (no session context ever), and existing historical rows never had
-- one — not backfilled, per the locked contract (no created_at/timestamp reconstruction).

alter table public.workouts
  add column if not exists session_id uuid;

create index if not exists workouts_session_id_idx on public.workouts (session_id);
