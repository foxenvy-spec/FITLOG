import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { persistSets, createExercisePersistence, deleteWorkout } from './sessionPersistence'
import type { ProgramExercise } from './types'
import type { SessionSetState } from './workoutSession'

// P1-2 (6A audit — "logSet() race") / 6F-P2 (P1 — Atomic Workout Persistence Integrity) — a minimal
// in-memory fake of the `persist_exercise_sets` RPC (migration 047). persistSets() now makes exactly one
// `.rpc()` call instead of separate workouts/workout_sets table calls — this fake simulates the RPC's
// PL/pgSQL body: upsert workouts, then replace workout_sets, committing both together or neither (via
// `failWorkoutsStep`/`failSetsStep`, which return an error with nothing written to `_debug`, mirroring a
// real Postgres ROLLBACK on a raised exception inside the function). `hookBeforeResolve` lets a test
// control the relative timing of two concurrent calls without relying on incidental microtask ordering.
function createFakeSupabase(opts?: {
  hookBeforeResolve?: () => Promise<void>
  failWorkoutsStep?: boolean
  failSetsStep?: boolean
  failDelete?: boolean
}) {
  let workoutSeq = 0
  let setSeq = 0
  const workouts = new Map<string, Record<string, unknown>>()
  const sets: { id: string; workout_id: string; set_number: number; reps: number; weight_kg: number }[] = []

  async function settle() {
    if (opts?.hookBeforeResolve) await opts.hookBeforeResolve()
  }

  const client = {
    _debug: { workouts, sets },
    rpc(fn: string, params: Record<string, unknown>) {
      if (fn !== 'persist_exercise_sets') throw new Error(`unexpected rpc: ${fn}`)
      return (async () => {
        await settle()

        // 6F-P2 — simulates the RPC raising partway through (workouts write) — real Postgres would roll
        // back the whole function call, so nothing is committed to _debug here either.
        if (opts?.failWorkoutsStep) return { data: null, error: { message: 'workouts write failed' } }
        // simulates the RPC raising during the workout_sets replace step — same rollback semantics: the
        // workouts upsert that already ran inside the same function call is undone too, so nothing commits.
        if (opts?.failSetsStep) return { data: null, error: { message: 'workout_sets write failed' } }

        const existingId = params.p_workout_id as string | null
        const workoutId = existingId ?? `w${++workoutSeq}`
        workouts.set(workoutId, {
          id: workoutId,
          user_id: params.p_user_id,
          type: 'strength',
          performed_at: params.p_performed_at,
          exercise_name: params.p_exercise_name,
          muscle_group: params.p_muscle_group,
          sets: params.p_sets,
          reps: params.p_reps,
          weight_kg: params.p_weight_kg,
          rpe: params.p_rpe,
          notes: params.p_notes,
          total_volume_kg: params.p_total_volume_kg,
          program_day_id: params.p_program_day_id,
          session_id: params.p_session_id,
        })

        for (let i = sets.length - 1; i >= 0; i--) {
          if (sets[i].workout_id === workoutId) sets.splice(i, 1)
        }
        const setsPayload = params.p_sets_payload as { set_number: number; reps: number; weight_kg: number }[]
        setsPayload.forEach((s) => sets.push({ id: `s${++setSeq}`, workout_id: workoutId, ...s }))

        return { data: workoutId, error: null }
      })()
    },
    // P0-02 — minimal fake of .from('workouts').delete().eq('id', workoutId), the shape deleteWorkout()
    // uses. Mirrors ON DELETE CASCADE (migration 004) by also dropping any workout_sets rows for the
    // deleted workout, so tests can assert both tables the same way the real FK guarantees.
    from(table: string) {
      if (table !== 'workouts') throw new Error(`unexpected table: ${table}`)
      return {
        delete() {
          return {
            async eq(col: string, val: unknown) {
              await settle()
              if (col !== 'id') throw new Error(`unexpected eq column: ${col}`)
              if (opts?.failDelete) return { error: { message: 'delete failed' } }
              workouts.delete(val as string)
              for (let i = sets.length - 1; i >= 0; i--) {
                if (sets[i].workout_id === val) sets.splice(i, 1)
              }
              return { error: null }
            },
          }
        },
      }
    },
  }
  return client as unknown as SupabaseClient & { _debug: typeof client._debug }
}

function makeExercise(overrides: Partial<ProgramExercise> = {}): ProgramExercise {
  return {
    id: 'pe-1',
    program_day_id: 'day-1',
    user_id: 'u1',
    position: 0,
    exercise_name: 'เบนช์เพรส',
    muscle_group: 'อก',
    secondary_muscles: [],
    exercise_library_id: null,
    sets: 3,
    target_reps: '8-10',
    target_rir: null,
    rest: '90s',
    rationale: null,
    default_weight_kg: 60,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeState(overrides: Partial<SessionSetState> = {}): SessionSetState {
  return {
    setsLog: [{ reps: 8, weightKg: 60 }],
    reps: 8,
    weightKg: 60,
    rpe: null,
    logged: false,
    skipped: false,
    workoutId: null,
    ...overrides,
  }
}

describe('persistSets', () => {
  // 5. sequential normal logging — unchanged
  it('inserts a new workout row on the first call (workoutId null), then updates it on subsequent calls', async () => {
    const supabase = createFakeSupabase()
    const ex = makeExercise()
    const first = await persistSets(supabase, ex, makeState({ setsLog: [{ reps: 8, weightKg: 60 }] }), 'u1', 'day-1', 'sess-1')
    expect(first.workoutId).toBeTruthy()
    expect(supabase._debug.workouts.size).toBe(1)
    expect(supabase._debug.sets).toHaveLength(1)

    const second = await persistSets(
      supabase,
      ex,
      makeState({ setsLog: [{ reps: 8, weightKg: 60 }, { reps: 7, weightKg: 60 }], workoutId: first.workoutId }),
      'u1',
      'day-1',
      'sess-1'
    )
    expect(second.workoutId).toBe(first.workoutId)
    expect(supabase._debug.workouts.size).toBe(1) // still just one row, updated in place
    expect(supabase._debug.sets).toHaveLength(2)
  })

  // 6F-P1 — session_id เดินขนานกับ dayId เข้า payload ตรงๆ ไม่ผ่านการแปลง/derive ใดๆ ทั้งค่าที่มีและ null
  it('writes the passed sessionId onto the workouts payload verbatim', async () => {
    const supabase = createFakeSupabase()
    const ex = makeExercise()
    const result = await persistSets(supabase, ex, makeState(), 'u1', 'day-1', 'sess-A')
    const row = supabase._debug.workouts.get(result.workoutId!)
    expect(row?.session_id).toBe('sess-A')
  })

  it('writes session_id: null when no session context is open (matches /log-style freestanding persistence)', async () => {
    const supabase = createFakeSupabase()
    const ex = makeExercise()
    const result = await persistSets(supabase, ex, makeState(), 'u1', null, null)
    const row = supabase._debug.workouts.get(result.workoutId!)
    expect(row?.session_id).toBeNull()
  })

  // 4. persistence failure — a thrown error, same as before the RPC extraction
  it('propagates an RPC error as a thrown error', async () => {
    const supabase = createFakeSupabase({ failWorkoutsStep: true })
    await expect(persistSets(supabase, makeExercise(), makeState(), 'u1', 'day-1', 'sess-1')).rejects.toEqual({
      message: 'workouts write failed',
    })
    expect(supabase._debug.workouts.size).toBe(0)
  })

  // 6F-P2 (P1) regression matrix — required test #4, the direct regression test for the root cause found
  // in the read-only trace: a workout_sets-step failure must not leave a committed workouts row behind.
  // persist_exercise_sets() does both steps inside one PL/pgSQL function body, so a raised exception during
  // the workout_sets replace rolls back the workouts upsert that already ran earlier in the same call —
  // this fake models that same all-or-nothing outcome (see failSetsStep above). The actual ROLLBACK
  // guarantee is enforced by Postgres/the migration's function body, not by this unit test — this test
  // only proves the client-side contract (RPC rejects → persistSets throws → nothing is treated as saved).
  it('a workout_sets-step failure leaves no workouts row committed either (regression test for the P1 root cause)', async () => {
    const supabase = createFakeSupabase({ failSetsStep: true })
    await expect(persistSets(supabase, makeExercise(), makeState(), 'u1', 'day-1', 'sess-1')).rejects.toEqual({
      message: 'workout_sets write failed',
    })
    expect(supabase._debug.workouts.size).toBe(0)
    expect(supabase._debug.sets).toHaveLength(0)
  })

  it('replaces existing workout_sets atomically — no partial/duplicate rows survive an update', async () => {
    const supabase = createFakeSupabase()
    const ex = makeExercise()
    const first = await persistSets(supabase, ex, makeState({ setsLog: [{ reps: 8, weightKg: 60 }, { reps: 8, weightKg: 60 }] }), 'u1', 'day-1', 'sess-1')
    expect(supabase._debug.sets).toHaveLength(2)

    // fewer sets on the next call (e.g. user removed the last set) — old rows must not linger
    await persistSets(supabase, ex, makeState({ workoutId: first.workoutId, setsLog: [{ reps: 8, weightKg: 60 }] }), 'u1', 'day-1', 'sess-1')
    expect(supabase._debug.sets).toHaveLength(1)
    expect(supabase._debug.sets.every((s) => s.workout_id === first.workoutId)).toBe(true)
  })

  it('a retry after a failed persist can succeed cleanly on the next call', async () => {
    let shouldFail = true
    const supabase = {
      _debug: createFakeSupabase()._debug,
      rpc: (fn: string, params: Record<string, unknown>) => {
        if (shouldFail) {
          shouldFail = false
          return Promise.resolve({ data: null, error: { message: 'transient failure' } })
        }
        return createFakeSupabase().rpc(fn, params)
      },
    } as unknown as SupabaseClient & { _debug: ReturnType<typeof createFakeSupabase>['_debug'] }

    await expect(persistSets(supabase, makeExercise(), makeState(), 'u1', 'day-1', 'sess-1')).rejects.toBeTruthy()
    const retry = await persistSets(supabase, makeExercise(), makeState(), 'u1', 'day-1', 'sess-1')
    expect(retry.workoutId).toBeTruthy()
  })
})

describe('deleteWorkout', () => {
  it('removes the workouts row (and its workout_sets, mirroring ON DELETE CASCADE)', async () => {
    const supabase = createFakeSupabase()
    const ex = makeExercise()
    const { workoutId } = await persistSets(supabase, ex, makeState({ setsLog: [{ reps: 8, weightKg: 60 }] }), 'u1', 'day-1', 'sess-1')
    expect(supabase._debug.workouts.size).toBe(1)
    expect(supabase._debug.sets).toHaveLength(1)

    await deleteWorkout(supabase, workoutId!)
    expect(supabase._debug.workouts.size).toBe(0)
    expect(supabase._debug.sets).toHaveLength(0)
  })

  it('propagates a delete error as a thrown error', async () => {
    const supabase = createFakeSupabase({ failDelete: true })
    await expect(deleteWorkout(supabase, 'w1')).rejects.toEqual({ message: 'delete failed' })
  })
})

describe('P0-02: createExercisePersistence.persistOrDelete', () => {
  it('behaves exactly like persist() when setsLog still has sets after the removal', async () => {
    const supabase = createFakeSupabase()
    const persistence = createExercisePersistence(supabase)
    const ex = makeExercise()
    const seeded = await persistence.persist(
      ex,
      makeState({ setsLog: [{ reps: 8, weightKg: 60 }, { reps: 7, weightKg: 60 }] }),
      'u1',
      'day-1',
      'sess-1'
    )
    // user removed the last set (3 -> 2 sets remaining) — should overwrite in place, not delete
    const result = await persistence.persistOrDelete(
      ex,
      makeState({ workoutId: seeded.workoutId, setsLog: [{ reps: 8, weightKg: 60 }] }),
      'u1',
      'day-1',
      'sess-1'
    )
    expect(result.workoutId).toBe(seeded.workoutId)
    expect(supabase._debug.workouts.size).toBe(1)
    expect(supabase._debug.sets).toHaveLength(1)
  })

  it('deletes the workouts row when setsLog becomes empty and a workout was already persisted (1 -> 0 sets)', async () => {
    const supabase = createFakeSupabase()
    const persistence = createExercisePersistence(supabase)
    const ex = makeExercise()
    const seeded = await persistence.persist(ex, makeState({ setsLog: [{ reps: 8, weightKg: 60 }] }), 'u1', 'day-1', 'sess-1')
    expect(supabase._debug.workouts.size).toBe(1)

    const result = await persistence.persistOrDelete(
      ex,
      makeState({ workoutId: seeded.workoutId, setsLog: [] }),
      'u1',
      'day-1',
      'sess-1'
    )
    expect(result.workoutId).toBeNull()
    expect(supabase._debug.workouts.size).toBe(0)
    expect(supabase._debug.sets).toHaveLength(0)
  })

  it('is a no-op when setsLog is empty and nothing was ever persisted (no workoutId to delete)', async () => {
    const supabase = createFakeSupabase()
    const persistence = createExercisePersistence(supabase)
    const ex = makeExercise()
    const result = await persistence.persistOrDelete(ex, makeState({ workoutId: null, setsLog: [] }), 'u1', 'day-1', 'sess-1')
    expect(result.workoutId).toBeNull()
    expect(supabase._debug.workouts.size).toBe(0)
  })

  // Race protection — the exact scenario the trace flagged: logSet() (persist) mid-flight for an
  // exercise, and removeLastSet() (persistOrDelete) fires for the same exercise before it resolves.
  // Both go through the same keyed queue (ex.id), so persistOrDelete must wait for persist() to finish
  // and land on the workoutId persist() actually established — never delete before it exists, and never
  // let a stale/earlier snapshot resurrect a workout the later call meant to remove.
  it('a persist() in flight and a persistOrDelete() for the same exercise serialize — the delete only runs after the workout actually exists', async () => {
    vi.useFakeTimers()
    try {
      let callIndex = 0
      const delaysMs = [25, 0]
      const supabase = createFakeSupabase({
        hookBeforeResolve: async () => {
          const ms = delaysMs[callIndex] ?? 0
          callIndex++
          if (ms > 0) await vi.advanceTimersByTimeAsync(ms)
        },
      })
      const persistence = createExercisePersistence(supabase)
      const ex = makeExercise()

      // logSet()-style call: first (and only) set of a brand-new workout, workoutId still null in its snapshot
      const fromLogSet = persistence.persist(ex, makeState({ workoutId: null, setsLog: [{ reps: 8, weightKg: 60 }] }), 'u1', 'day-1', 'sess-1')
      // removeLastSet()-style call fired immediately after, before logSet's persist has resolved — its own
      // snapshot also still carries workoutId: null (React hasn't re-rendered with the new id yet)
      const fromRemove = persistence.persistOrDelete(ex, makeState({ workoutId: null, setsLog: [] }), 'u1', 'day-1', 'sess-1')

      const [logSetResult, removeResult] = await Promise.all([fromLogSet, fromRemove])
      expect(logSetResult.workoutId).toBeTruthy()
      // the delete ran after persist() established the row, found it via the shared knownWorkoutIds map,
      // and removed it — never a race that leaves a stale workout row behind or throws on a missing row
      expect(removeResult.workoutId).toBeNull()
      expect(supabase._debug.workouts.size).toBe(0)
      expect(supabase._debug.sets).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('P1-2: createExercisePersistence — concurrent calls for the same exercise', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // Controls the relative timing of DB calls (call N resolves after `delaysMs[N]`), proving results never
  // interleave regardless of which call is "faster."
  function makeControlledSupabase(delaysMs: number[]) {
    let callIndex = 0
    return createFakeSupabase({
      hookBeforeResolve: async () => {
        const ms = delaysMs[callIndex] ?? 0
        callIndex++
        if (ms > 0) await vi.advanceTimersByTimeAsync(ms)
      },
    })
  }

  // 1. concurrent first writes -> exactly 1 workout row
  //
  // This is the case a bare queue (serializing execution order alone) does NOT fix: both callers' snapshots
  // are captured with workoutId: null *before* either call starts (exactly as logSet()'s and
  // logCurrentExercise()'s React closures would be, if both fire before either has re-rendered with the
  // other's result) — verified by writing this test against raw persistSets()+createKeyedQueue() first: it
  // produced 2 workout rows. createExercisePersistence() additionally tracks the workoutId a completed call
  // established and patches it into the next call's snapshot, which is what actually collapses this to 1.
  it('two concurrent first-write calls (both snapshots carry workoutId: null) collapse to exactly one workouts row', async () => {
    const supabase = makeControlledSupabase([30, 0, 0, 0]) // call A's workouts-insert takes longer than B's
    const persistence = createExercisePersistence(supabase)
    const ex = makeExercise()
    const snapshotA = makeState({ workoutId: null, setsLog: [{ reps: 8, weightKg: 60 }] })
    const snapshotB = makeState({ workoutId: null, setsLog: [{ reps: 8, weightKg: 60 }, { reps: 7, weightKg: 60 }] })

    const resultA = persistence.persist(ex, snapshotA, 'u1', 'day-1', 'sess-1')
    const resultB = persistence.persist(ex, snapshotB, 'u1', 'day-1', 'sess-1')

    const [a, b] = await Promise.all([resultA, resultB])
    expect(supabase._debug.workouts.size).toBe(1)
    expect(a.workoutId).toBe(b.workoutId) // B ran after A completed and reused A's id, not a new insert
  })

  // 2. concurrent existing-workout writes -> the queue still serializes them (no interleaving), even though
  // the RPC itself is atomic per call
  // 3. two snapshots -> final workout_sets = one complete snapshot, never partial/interleaved
  it('two concurrent updates to an existing workout are serialized by the queue, and the final sets match one complete snapshot', async () => {
    const supabase = makeControlledSupabase([])
    const persistence = createExercisePersistence(supabase)
    const ex = makeExercise()
    // seed an existing workout first (sequential — simulating an earlier, already-completed persist)
    const seeded = await persistence.persist(ex, makeState({ setsLog: [{ reps: 8, weightKg: 60 }] }), 'u1', 'day-1', 'sess-1')
    const workoutId = seeded.workoutId!

    const snapshotA = makeState({ workoutId, setsLog: [{ reps: 8, weightKg: 60 }, { reps: 7, weightKg: 62.5 }] })
    const snapshotB = makeState({
      workoutId,
      setsLog: [{ reps: 8, weightKg: 60 }, { reps: 7, weightKg: 62.5 }, { reps: 6, weightKg: 65 }],
    })

    const resultA = persistence.persist(ex, snapshotA, 'u1', 'day-1', 'sess-1')
    const resultB = persistence.persist(ex, snapshotB, 'u1', 'day-1', 'sess-1')
    await Promise.all([resultA, resultB])

    // final workout_sets reflects exactly one complete snapshot (whichever ran last), not a mix of both
    // (e.g. 2 rows from A's snapshot + 1 leftover from B, or vice versa)
    expect(supabase._debug.sets).toHaveLength(3) // snapshotB's length — B was enqueued after A
    const weights = supabase._debug.sets.map((s) => s.weight_kg).sort()
    expect(weights).toEqual([60, 62.5, 65].sort())
  })

  // 4. persistence failure -> rejects for its own caller even when routed through the queue
  it('a failed persist still rejects for its own caller even when routed through the queue', async () => {
    const supabase = createFakeSupabase({ failWorkoutsStep: true })
    const persistence = createExercisePersistence(supabase)
    await expect(persistence.persist(makeExercise(), makeState(), 'u1', 'day-1', 'sess-1')).rejects.toEqual({
      message: 'workouts write failed',
    })
  })

  // 5. sequential normal logging -> unchanged
  it('sequential calls (no concurrency at all) behave exactly as before extraction', async () => {
    const supabase = makeControlledSupabase([])
    const persistence = createExercisePersistence(supabase)
    const ex = makeExercise()
    const first = await persistence.persist(ex, makeState({ setsLog: [{ reps: 8, weightKg: 60 }] }), 'u1', 'day-1', 'sess-1')
    const second = await persistence.persist(
      ex,
      makeState({ workoutId: first.workoutId, setsLog: [{ reps: 8, weightKg: 60 }, { reps: 7, weightKg: 60 }] }),
      'u1',
      'day-1',
      'sess-1'
    )
    expect(supabase._debug.workouts.size).toBe(1)
    expect(second.workoutId).toBe(first.workoutId)
    expect(supabase._debug.sets).toHaveLength(2)
  })

  // 6. logSet -> logCurrentExercise serialized (same exercise key, two different call sites, both with
  // stale workoutId: null closures — the realistic shape of the race)
  it('a logSet-style call and a logCurrentExercise-style call for the same exercise serialize and collapse to one workout row', async () => {
    const supabase = makeControlledSupabase([25, 0])
    const persistence = createExercisePersistence(supabase)
    const ex = makeExercise()
    const fromLogSet = persistence.persist(ex, makeState({ workoutId: null, setsLog: [{ reps: 8, weightKg: 60 }] }), 'u1', 'day-1', 'sess-1')
    const fromFinish = persistence.persist(ex, makeState({ workoutId: null, setsLog: [{ reps: 8, weightKg: 60 }] }), 'u1', 'day-1', 'sess-1')

    await Promise.all([fromLogSet, fromFinish])
    expect(supabase._debug.workouts.size).toBe(1)
  })

  // 7. logSet -> swapCurrentExercise serialized
  it('a logSet-style call and a swapCurrentExercise-style call for the same exercise serialize and collapse to one workout row', async () => {
    const supabase = makeControlledSupabase([25, 0])
    const persistence = createExercisePersistence(supabase)
    const ex = makeExercise()
    const fromLogSet = persistence.persist(ex, makeState({ workoutId: null, setsLog: [{ reps: 8, weightKg: 60 }] }), 'u1', 'day-1', 'sess-1')
    const fromSwap = persistence.persist(ex, makeState({ workoutId: null, setsLog: [{ reps: 8, weightKg: 60 }] }), 'u1', 'day-1', 'sess-1')

    await Promise.all([fromLogSet, fromSwap])
    expect(supabase._debug.workouts.size).toBe(1)
  })

  it('a different exercise key is unaffected — no cross-exercise blocking', async () => {
    const supabase = makeControlledSupabase([])
    const persistence = createExercisePersistence(supabase)
    const exA = makeExercise({ id: 'pe-1' })
    const exB = makeExercise({ id: 'pe-2', exercise_name: 'สควอท' })

    const a = persistence.persist(exA, makeState(), 'u1', 'day-1', 'sess-1')
    const b = persistence.persist(exB, makeState(), 'u1', 'day-1', 'sess-1')
    const [resA, resB] = await Promise.all([a, b])
    expect(resA.workoutId).not.toBe(resB.workoutId)
    expect(supabase._debug.workouts.size).toBe(2)
  })
})
