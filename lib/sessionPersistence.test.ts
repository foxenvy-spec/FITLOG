import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { persistSets, createExercisePersistence } from './sessionPersistence'
import type { ProgramExercise } from './types'
import type { SessionSetState } from './workoutSession'

// P1-2 (6A audit — "logSet() race") — a minimal in-memory fake of the exact Supabase call shapes
// persistSets uses (workouts insert/update/select/single, workout_sets delete/insert), including the real
// unique(workout_id, set_number) constraint from migration 004, so a race that would violate it in
// production fails the same way here. `hookBeforeResolve` lets a test control the relative timing of two
// concurrent calls without relying on incidental microtask ordering.
function createFakeSupabase(opts?: { hookBeforeResolve?: () => Promise<void> }) {
  let workoutSeq = 0
  let setSeq = 0
  const workouts = new Map<string, Record<string, unknown>>()
  const sets: { id: string; workout_id: string; set_number: number; reps: number; weight_kg: number }[] = []

  async function settle() {
    if (opts?.hookBeforeResolve) await opts.hookBeforeResolve()
  }

  const client = {
    _debug: { workouts, sets },
    from(table: string) {
      if (table === 'workouts') {
        return {
          insert(payload: Record<string, unknown>) {
            return {
              select: () => ({
                single: async () => {
                  await settle()
                  const id = `w${++workoutSeq}`
                  workouts.set(id, { id, ...payload })
                  return { data: { id }, error: null }
                },
              }),
            }
          },
          update(payload: Record<string, unknown>) {
            return {
              eq: (_col: string, id: string) => ({
                select: () => ({
                  single: async () => {
                    await settle()
                    workouts.set(id, { ...workouts.get(id), ...payload })
                    return { data: { id }, error: null }
                  },
                }),
              }),
            }
          },
        }
      }
      if (table === 'workout_sets') {
        return {
          delete: () => ({
            eq: async (_col: string, workoutId: string) => {
              await settle()
              for (let i = sets.length - 1; i >= 0; i--) {
                if (sets[i].workout_id === workoutId) sets.splice(i, 1)
              }
              return { error: null }
            },
          }),
          insert: async (rows: { workout_id: string; set_number: number; reps: number; weight_kg: number }[]) => {
            await settle()
            // unique (workout_id, set_number) — migration 004_workout_sets.sql. A real Postgres INSERT of
            // multiple rows is atomic: any conflicting row fails the whole statement, nothing is inserted.
            const conflict = rows.some((row) =>
              sets.some((s) => s.workout_id === row.workout_id && s.set_number === row.set_number)
            )
            if (conflict) {
              return { error: { message: 'duplicate key value violates unique constraint "workout_sets_workout_id_set_number_key"' } }
            }
            rows.forEach((r) => sets.push({ id: `s${++setSeq}`, ...r }))
            return { error: null }
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
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
    expect(first.setsError).toBeNull()
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

  // 4. persistence failure — existing error behavior preserved
  it('propagates a workouts-table write failure as a thrown error (unchanged from before extraction)', async () => {
    const supabase = createFakeSupabase()
    // force the underlying insert to fail by making the table name wrong via a broken client
    const broken = {
      from: () => ({
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'insert failed' } }) }) }),
      }),
    } as unknown as SupabaseClient
    await expect(persistSets(broken, makeExercise(), makeState(), 'u1', 'day-1', 'sess-1')).rejects.toEqual({ message: 'insert failed' })
    // nothing persisted
    void supabase
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
    expect(a.setsError).toBeNull()
    expect(b.setsError).toBeNull()
  })

  // 2. concurrent existing-workout writes -> no unique constraint collision
  // 3. two snapshots -> final workout_sets = one complete snapshot, never partial/interleaved
  it('two concurrent updates to an existing workout never collide on unique(workout_id, set_number), and the final sets match one complete snapshot', async () => {
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
    const [a, b] = await Promise.all([resultA, resultB])

    expect(a.setsError).toBeNull()
    expect(b.setsError).toBeNull() // no unique-constraint collision — serialized, not interleaved
    // final workout_sets reflects exactly one complete snapshot (whichever ran last), not a mix of both
    // (e.g. 2 rows from A's snapshot + 1 leftover from B, or vice versa)
    expect(supabase._debug.sets).toHaveLength(3) // snapshotB's length — B was enqueued after A
    const weights = supabase._debug.sets.map((s) => s.weight_kg).sort()
    expect(weights).toEqual([60, 62.5, 65].sort())
  })

  // 4. persistence failure -> existing error behavior preserved (through the queue too, not just the raw function)
  it('a failed persist still rejects for its own caller even when routed through the queue', async () => {
    const broken = {
      from: () => ({
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'insert failed' } }) }) }),
      }),
    } as unknown as SupabaseClient
    const persistence = createExercisePersistence(broken)
    await expect(persistence.persist(makeExercise(), makeState(), 'u1', 'day-1', 'sess-1')).rejects.toEqual({ message: 'insert failed' })
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
