import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isFinishedToday, setFinishedToday, clearFinishedToday } from './finishForToday'

describe('isFinishedToday', () => {
  it('is true when the stored date matches today', () => {
    expect(isFinishedToday('2026-09-18', '2026-09-18')).toBe(true)
  })

  it('is false when the stored date is a previous day (cross-day expiry, no cleanup needed)', () => {
    expect(isFinishedToday('2026-09-17', '2026-09-18')).toBe(false)
  })

  it('is false when nothing was ever stored', () => {
    expect(isFinishedToday(null, '2026-09-18')).toBe(false)
  })
})

// Minimal fake of the one table these two write to (profiles) — just enough to assert the exact
// upsert payload each function sends, matching the fake-client style already used in
// lib/programCompletion.test.ts for the same kind of write-only assertion.
function createFakeSupabase() {
  const calls: Record<string, unknown>[] = []
  return {
    client: {
      from(table: string) {
        if (table !== 'profiles') throw new Error(`unexpected table: ${table}`)
        return {
          async upsert(payload: Record<string, unknown>) {
            calls.push(payload)
            return { error: null }
          },
        }
      },
    } as unknown as SupabaseClient,
    calls,
  }
}

describe('setFinishedToday', () => {
  it('upserts the given date onto the user profile', async () => {
    const { client, calls } = createFakeSupabase()
    const { error } = await setFinishedToday(client, { userId: 'u1', date: '2026-09-18' })
    expect(error).toBeNull()
    expect(calls[0]).toMatchObject({ user_id: 'u1', finished_workout_for_date: '2026-09-18' })
  })
})

describe('clearFinishedToday', () => {
  it('upserts null onto the user profile', async () => {
    const { client, calls } = createFakeSupabase()
    const { error } = await clearFinishedToday(client, 'u1')
    expect(error).toBeNull()
    expect(calls[0]).toMatchObject({ user_id: 'u1', finished_workout_for_date: null })
  })
})
