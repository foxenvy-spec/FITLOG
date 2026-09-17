-- 6F-P2 (Session Completion & Persistence Integrity, P1) — persistSets() wrote `workouts` (aggregate:
-- sets/reps/weight_kg/total_volume_kg) and `workout_sets` (per-set detail) as two/three separate client
-- calls with no transaction boundary between them. A failure between the `workouts` write and the
-- `workout_sets` delete-then-insert left the two tables describing different realities for the same
-- workout (e.g. workouts.sets = 5, workout_sets = 0 rows) — and the workout_sets delete()'s own error was
-- never even checked, so a failed delete could leave stale old rows behind a freshly-committed insert.
--
-- This RPC performs the exact same upsert-then-replace-sets sequence persistSets() already did, but as
-- one PL/pgSQL function body — a single top-level function call is one implicit Postgres transaction, so
-- any raised error rolls back everything the function did, including the `workouts` write. Scoped
-- narrowly to "persist the complete set state for one existing/current exercise workout" (the exact shape
-- persistSets() already sends) rather than a generic data-access wrapper — arguments match today's
-- payload fields 1:1, nothing broader.
--
-- security invoker (the default) is sufficient: RLS on both workouts and workout_sets already grants the
-- calling user full CRUD on their own rows (auth.uid() = user_id), so no privilege escalation is needed —
-- this function only saves a round trip and adds a transaction boundary, it doesn't cross a permission
-- boundary the way update_exercise_image() (036) did.
create or replace function public.persist_exercise_sets(
  p_workout_id uuid,
  p_user_id uuid,
  p_performed_at date,
  p_exercise_name text,
  p_muscle_group text,
  p_sets integer,
  p_reps integer,
  p_weight_kg numeric,
  p_rpe numeric,
  p_notes text,
  p_total_volume_kg numeric,
  p_program_day_id uuid,
  p_session_id uuid,
  p_sets_payload jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_workout_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not authorized';
  end if;

  if p_workout_id is not null then
    update public.workouts
    set exercise_name = p_exercise_name,
        muscle_group = p_muscle_group,
        sets = p_sets,
        reps = p_reps,
        weight_kg = p_weight_kg,
        rpe = p_rpe,
        notes = p_notes,
        total_volume_kg = p_total_volume_kg,
        program_day_id = p_program_day_id,
        session_id = p_session_id
    where id = p_workout_id and user_id = p_user_id
    returning id into v_workout_id;

    if v_workout_id is null then
      raise exception 'workout % not found for this user', p_workout_id;
    end if;
  else
    insert into public.workouts (
      user_id, type, performed_at, exercise_name, muscle_group, sets, reps, weight_kg, rpe, notes,
      total_volume_kg, program_day_id, session_id
    ) values (
      p_user_id, 'strength', p_performed_at, p_exercise_name, p_muscle_group, p_sets, p_reps, p_weight_kg,
      p_rpe, p_notes, p_total_volume_kg, p_program_day_id, p_session_id
    )
    returning id into v_workout_id;
  end if;

  delete from public.workout_sets where workout_id = v_workout_id;

  insert into public.workout_sets (workout_id, user_id, set_number, reps, weight_kg, completed)
  select
    v_workout_id,
    p_user_id,
    (elem ->> 'set_number')::integer,
    (elem ->> 'reps')::integer,
    (elem ->> 'weight_kg')::numeric,
    true
  from jsonb_array_elements(p_sets_payload) as elem;

  return v_workout_id;
end;
$$;

revoke all on function public.persist_exercise_sets(
  uuid, uuid, date, text, text, integer, integer, numeric, numeric, text, numeric, uuid, uuid, jsonb
) from public;
grant execute on function public.persist_exercise_sets(
  uuid, uuid, date, text, text, integer, integer, numeric, numeric, text, numeric, uuid, uuid, jsonb
) to authenticated;
