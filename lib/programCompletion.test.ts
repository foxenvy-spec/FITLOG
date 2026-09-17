import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { recordExplicitCompletion, recordManualUncomplete, reconcileProgramCompletion } from './programCompletion'

// 6F-P5 (P1 — Completion Provenance Integrity) — minimal in-memory fake of the two tables this module
// touches (program_completions, program_completion_overrides). Rows are plain objects keyed by a
// synthetic id; `.eq()` accumulates filters lazily until a terminal call (`.maybeSingle()`, `.delete()`
// resolving, or `.upsert()`) actually runs them — matching how the Supabase query builder chains.
function createFakeSupabase(opts?: { failDeleteOnTable?: string }) {
  let seq = 0
  const completions: Record<string, unknown>[] = []
  const overrides: Record<string, unknown>[] = []

  function tableStore(table: string) {
    if (table === 'program_completions') return completions
    if (table === 'program_completion_overrides') return overrides
    throw new Error(`unexpected table: ${table}`)
  }

  function matches(row: Record<string, unknown>, filters: [string, unknown][]) {
    return filters.every(([col, val]) => row[col] === val)
  }

  function conflictColumns(onConflict: string): string[] {
    return onConflict.split(',')
  }

  function query(table: string, filters: [string, unknown][] = []) {
    return {
      eq(col: string, val: unknown) {
        return query(table, [...filters, [col, val]])
      },
      async maybeSingle() {
        const rows = tableStore(table).filter((r) => matches(r, filters))
        return { data: rows[0] ?? null, error: null }
      },
      async then(resolve: (v: { error: { message: string } | null }) => void) {
        // delete() terminal — remove matching rows, or simulate a failed delete for a given table
        if (opts?.failDeleteOnTable === table) {
          resolve({ error: { message: `${table} delete failed` } })
          return
        }
        const store = tableStore(table)
        for (let i = store.length - 1; i >= 0; i--) {
          if (matches(store[i], filters)) store.splice(i, 1)
        }
        resolve({ error: null })
      },
    }
  }

  const client = {
    _debug: { completions, overrides },
    from(table: string) {
      return {
        upsert(row: Record<string, unknown>, opts: { onConflict: string }) {
          return (async () => {
            const store = tableStore(table)
            const keys = conflictColumns(opts.onConflict)
            const existingIdx = store.findIndex((r) => keys.every((k) => r[k] === row[k]))
            if (existingIdx >= 0) {
              store[existingIdx] = { ...store[existingIdx], ...row }
            } else {
              store.push({ id: `row${++seq}`, ...row })
            }
            return { error: null }
          })()
        },
        delete() {
          return query(table)
        },
        select(_cols: string) {
          return query(table)
        },
      }
    },
  }
  return client as unknown as SupabaseClient & { _debug: { completions: typeof completions; overrides: typeof overrides } }
}

const USER = 'u1'
const EX = 'pe-1'
const DATE = '2026-07-20'

describe('recordExplicitCompletion', () => {
  it('creates a completion for a planned exercise and clears any stale override', async () => {
    const supabase = createFakeSupabase()
    supabase._debug.overrides.push({
      id: 'o1',
      user_id: USER,
      program_exercise_id: EX,
      completion_date: DATE,
      override_type: 'manual_uncomplete',
    })

    const { error } = await recordExplicitCompletion(supabase, { userId: USER, date: DATE, target: { programExerciseId: EX } })
    expect(error).toBeNull()
    expect(supabase._debug.completions).toHaveLength(1)
    expect(supabase._debug.overrides).toHaveLength(0)
  })

  it('is idempotent on retry — no duplicate row for the same exercise/date', async () => {
    const supabase = createFakeSupabase()
    await recordExplicitCompletion(supabase, { userId: USER, date: DATE, target: { programExerciseId: EX } })
    await recordExplicitCompletion(supabase, { userId: USER, date: DATE, target: { programExerciseId: EX } })
    expect(supabase._debug.completions).toHaveLength(1)
  })

  // Reviewer follow-up: does a "best-effort" override clear that itself fails leave a stale
  // manual_uncomplete override capable of causing a FUTURE incorrect suppression? Proves it cannot, by
  // exercising exactly that sequence rather than asserting it from reasoning alone.
  it('a stale override left behind by a failed clear cannot suppress a later reconciliation, because completion-exists is checked first', async () => {
    const supabase = createFakeSupabase({ failDeleteOnTable: 'program_completion_overrides' })
    supabase._debug.overrides.push({
      id: 'o1',
      user_id: USER,
      program_exercise_id: EX,
      completion_date: DATE,
      override_type: 'manual_uncomplete',
    })

    // completion succeeds; the override-clear delete is forced to fail — recordExplicitCompletion must
    // still report success, since the completion itself (the thing the caller actually asked for) is
    // correctly written. The override row is left behind, stale.
    const { error } = await recordExplicitCompletion(supabase, { userId: USER, date: DATE, target: { programExerciseId: EX } })
    expect(error).toBeNull()
    expect(supabase._debug.completions).toHaveLength(1)
    expect(supabase._debug.overrides).toHaveLength(1) // stale override confirmed still present

    // the invariant that actually matters: does this stale override cause any future harm? Run
    // reconciliation for the exact same (user, exercise, date) — it must be a pure no-op BECAUSE a
    // completion already exists, never even reaching the override check that would otherwise see the
    // stale row and (harmlessly, in this case) skip re-creating something that's already there.
    const result = await reconcileProgramCompletion(supabase, { userId: USER, date: DATE, target: { programExerciseId: EX } })
    expect(result).toEqual({ error: null, created: false })
    expect(supabase._debug.completions).toHaveLength(1) // still exactly one completion row, no duplicate

    // the stale override can only ever become "live" again if this exact completion row is deleted a
    // second time — and the only code path that deletes program_completions at all (recordManualUncomplete)
    // always upserts a fresh override in the same call, so it can never observe or be confused by this
    // leftover row; it just overwrites it with current, correct values.
    const uncomplete = await recordManualUncomplete(supabase, { userId: USER, date: DATE, programExerciseId: EX })
    expect(uncomplete.error).toBeNull()
    expect(supabase._debug.overrides).toHaveLength(1) // upserted in place, not duplicated
  })

  it('surfaces a completion write failure instead of reporting false success', async () => {
    const broken = {
      from: () => ({ upsert: () => Promise.resolve({ error: { message: 'insert failed' } }) }),
    } as unknown as SupabaseClient
    const { error } = await recordExplicitCompletion(broken, { userId: USER, date: DATE, target: { programExerciseId: EX } })
    expect(error).toBe('insert failed')
  })

  it('preserves ad-hoc (workout_id) completion semantics from migrations 042/043 — no override lookup at all', async () => {
    const supabase = createFakeSupabase()
    const { error } = await recordExplicitCompletion(supabase, { userId: USER, date: DATE, target: { workoutId: 'w1' } })
    expect(error).toBeNull()
    expect(supabase._debug.completions).toEqual([{ id: 'row1', user_id: USER, workout_id: 'w1', completed_at: DATE }])
  })
})

describe('recordManualUncomplete', () => {
  it('removes the completion and creates a manual_uncomplete override', async () => {
    const supabase = createFakeSupabase()
    supabase._debug.completions.push({ id: 'c1', user_id: USER, program_exercise_id: EX, completed_at: DATE })

    const { error } = await recordManualUncomplete(supabase, { userId: USER, date: DATE, programExerciseId: EX })
    expect(error).toBeNull()
    expect(supabase._debug.completions).toHaveLength(0)
    expect(supabase._debug.overrides).toHaveLength(1)
    expect(supabase._debug.overrides[0]).toMatchObject({
      user_id: USER,
      program_exercise_id: EX,
      completion_date: DATE,
      override_type: 'manual_uncomplete',
    })
  })

  it('surfaces an override-write failure rather than reporting a successful un-complete (must not become a silent provenance failure)', async () => {
    const broken = {
      from: (table: string) => {
        if (table === 'program_completions') {
          return { delete: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }) }) }
        }
        return { upsert: () => Promise.resolve({ error: { message: 'override write failed' } }) }
      },
    } as unknown as SupabaseClient
    const { error } = await recordManualUncomplete(broken, { userId: USER, date: DATE, programExerciseId: EX })
    expect(error).toBe('override write failed')
  })
})

describe('reconcileProgramCompletion', () => {
  it('creates a completion when none exists and no override is present', async () => {
    const supabase = createFakeSupabase()
    const result = await reconcileProgramCompletion(supabase, { userId: USER, date: DATE, target: { programExerciseId: EX } })
    expect(result).toEqual({ error: null, created: true })
    expect(supabase._debug.completions).toHaveLength(1)
  })

  it('is a no-op when a completion already exists — no duplicate', async () => {
    const supabase = createFakeSupabase()
    supabase._debug.completions.push({ id: 'c1', user_id: USER, program_exercise_id: EX, completed_at: DATE })
    const result = await reconcileProgramCompletion(supabase, { userId: USER, date: DATE, target: { programExerciseId: EX } })
    expect(result).toEqual({ error: null, created: false })
    expect(supabase._debug.completions).toHaveLength(1)
  })

  // Requirement E's regression test: this is the one that proves manual un-completion is actually
  // respected, not just designed for.
  it('does NOT recreate a completion when a manual_uncomplete override exists for that date', async () => {
    const supabase = createFakeSupabase()
    supabase._debug.overrides.push({
      id: 'o1',
      user_id: USER,
      program_exercise_id: EX,
      completion_date: DATE,
      override_type: 'manual_uncomplete',
    })
    const result = await reconcileProgramCompletion(supabase, { userId: USER, date: DATE, target: { programExerciseId: EX } })
    expect(result).toEqual({ error: null, created: false })
    expect(supabase._debug.completions).toHaveLength(0)
  })

  it('an override on one date has no effect on a different date (recurring program day, next occurrence)', async () => {
    const supabase = createFakeSupabase()
    supabase._debug.overrides.push({
      id: 'o1',
      user_id: USER,
      program_exercise_id: EX,
      completion_date: '2026-07-20',
      override_type: 'manual_uncomplete',
    })
    const result = await reconcileProgramCompletion(supabase, {
      userId: USER,
      date: '2026-07-27',
      target: { programExerciseId: EX },
    })
    expect(result).toEqual({ error: null, created: true })
    expect(supabase._debug.completions).toHaveLength(1)
  })

  it('is not hard-coded to "today" — reconciling an arbitrary past date works the same way (day-rollover recovery)', async () => {
    const supabase = createFakeSupabase()
    const pastDate = '2026-01-05'
    const result = await reconcileProgramCompletion(supabase, { userId: USER, date: pastDate, target: { programExerciseId: EX } })
    expect(result).toEqual({ error: null, created: true })
    expect(supabase._debug.completions[0]).toMatchObject({ completed_at: pastDate })
  })

  it('preserves ad-hoc completion semantics — never checks for an override at all', async () => {
    const supabase = createFakeSupabase()
    const result = await reconcileProgramCompletion(supabase, { userId: USER, date: DATE, target: { workoutId: 'w1' } })
    expect(result).toEqual({ error: null, created: true })
    expect(supabase._debug.completions[0]).toMatchObject({ workout_id: 'w1' })
  })
})

// 6F-P5 — the two end-to-end regression scenarios explicitly requested: manual un-complete must survive
// both a plain reload (re-check) and a reconciliation pass driven by real workout evidence.
describe('manual un-complete survives reconciliation (Requirement E, end-to-end)', () => {
  it('un-complete → reload (re-check completion state) → remains uncompleted', async () => {
    const supabase = createFakeSupabase()
    supabase._debug.completions.push({ id: 'c1', user_id: USER, program_exercise_id: EX, completed_at: DATE })

    const uncomplete = await recordManualUncomplete(supabase, { userId: USER, date: DATE, programExerciseId: EX })
    expect(uncomplete.error).toBeNull()

    // "reload" = re-read the same tables fresh — no completion row exists
    const stillThere = supabase._debug.completions.some((c) => c.program_exercise_id === EX && c.completed_at === DATE)
    expect(stillThere).toBe(false)
  })

  it('un-complete → workout evidence still exists → reconciliation runs → remains uncompleted', async () => {
    const supabase = createFakeSupabase()
    supabase._debug.completions.push({ id: 'c1', user_id: USER, program_exercise_id: EX, completed_at: DATE })

    await recordManualUncomplete(supabase, { userId: USER, date: DATE, programExerciseId: EX })

    // session/page.tsx's backfill would now see workout evidence (setsLog meets target) and call reconcile
    const result = await reconcileProgramCompletion(supabase, { userId: USER, date: DATE, target: { programExerciseId: EX } })
    expect(result).toEqual({ error: null, created: false })
    expect(supabase._debug.completions).toHaveLength(0)
  })

  it('manual complete after a prior un-complete restores completion and removes the override', async () => {
    const supabase = createFakeSupabase()
    await recordManualUncomplete(supabase, { userId: USER, date: DATE, programExerciseId: EX })
    expect(supabase._debug.overrides).toHaveLength(1)

    const { error } = await recordExplicitCompletion(supabase, { userId: USER, date: DATE, target: { programExerciseId: EX } })
    expect(error).toBeNull()
    expect(supabase._debug.completions).toHaveLength(1)
    expect(supabase._debug.overrides).toHaveLength(0)

    // and reconciliation now happily leaves it alone (already complete, no override to even check)
    const result = await reconcileProgramCompletion(supabase, { userId: USER, date: DATE, target: { programExerciseId: EX } })
    expect(result).toEqual({ error: null, created: false })
  })
})
