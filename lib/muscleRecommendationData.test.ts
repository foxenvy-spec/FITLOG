import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadMuscleRecommendation } from './muscleRecommendationData'
import type { ProgramDay, ProgramExercise } from './types'

// 6D P1-2A — minimal fake Supabase client covering the exact 4 query shapes loadMuscleRecommendation
// issues (recentStrength/twoWeeksStrength on 'workouts', weekly_volume_targets, program_exercises for
// other days). Filters are not re-implemented here — fixtures are pre-shaped per query intent (mirrors
// how dashboardStats.test.ts tests suggestMuscleToTrain/computeRecoveryPct directly with plain data;
// this test's job is the glue/orchestration around them, not re-proving Postgres WHERE semantics).
function createFakeSupabase(fixtures: {
  recentStrength: { muscle_group: string | null; performed_at: string }[]
  twoWeeksStrength: { muscle_group: string | null; sets: number | null; performed_at: string }[]
  otherDaysExRows: { program_day_id: string; muscle_group: string | null }[]
}) {
  const client = {
    from(table: string) {
      if (table === 'workouts') {
        return {
          select(cols: string) {
            const isRecent = cols.includes('exercise_name')
            const rows = isRecent ? fixtures.recentStrength : fixtures.twoWeeksStrength
            const chain = {
              eq: () => chain,
              order: () => chain,
              limit: async () => ({ data: rows, error: null }),
              gte: () => chain,
              lte: async () => ({ data: rows, error: null }),
            }
            return chain
          },
        }
      }
      if (table === 'weekly_volume_targets') {
        return { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }
      }
      if (table === 'program_exercises') {
        return {
          select: () => ({
            in: async () => ({ data: fixtures.otherDaysExRows, error: null }),
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }
  return client as unknown as SupabaseClient
}

function makeDay(overrides: Partial<ProgramDay> = {}): ProgramDay {
  return {
    id: 'day-1',
    user_id: 'u1',
    day_of_week: 1,
    title: 'Day 1',
    created_at: '2026-01-01',
    ...overrides,
  }
}

describe('loadMuscleRecommendation', () => {
  it('resolves recommendation/programDayMuscleGroups/recoveryDates/thisWeekSets from a realistic fixture', async () => {
    const monday = makeDay({ id: 'day-mon', day_of_week: 1, title: 'อก' })
    const thursday = makeDay({ id: 'day-thu', day_of_week: 4, title: 'ขา' })
    const supabase = createFakeSupabase({
      recentStrength: [{ muscle_group: 'หลัง', performed_at: '2026-01-01' }],
      twoWeeksStrength: [],
      otherDaysExRows: [{ program_day_id: 'day-thu', muscle_group: 'ขา' }],
    })

    const result = await loadMuscleRecommendation(supabase, {
      programDays: [monday, thursday],
      currentDay: monday,
      todayDayOfWeek: 1,
      todayExercises: [],
      todayMuscleGroups: [],
      progressPctForLabel: null,
    })

    // วันจันทร์ (day-mon) ไม่มีท่าเลย (todayExercises: []) → dominantMuscleGroup([]) = null สำหรับวันนี้เอง,
    // แต่ title fallback ของ getScheduledMuscleForDay ยังจับ "อก" จาก title ได้ (เหมือน fetchDashboardData เดิม)
    expect(result.todayScheduledMuscle).toBe('อก')
    expect(result.programDayMuscleGroups).toEqual({ 1: null, 4: 'ขา' })
    expect(result.recoveryDates['หลัง']).toBe('2026-01-01')
    expect(result.recoveryDates['อก']).toBeNull()
    expect(result.recommendation).not.toBeNull()
  })

  it('still resolves a next-scheduled-muscle fallback when today has no program day at all (rest day)', async () => {
    const thursday = makeDay({ id: 'day-thu', day_of_week: 4, title: 'ขา' })
    const supabase = createFakeSupabase({
      recentStrength: [],
      twoWeeksStrength: [],
      otherDaysExRows: [{ program_day_id: 'day-thu', muscle_group: 'ขา' }],
    })

    const result = await loadMuscleRecommendation(supabase, {
      programDays: [thursday],
      currentDay: null,
      todayDayOfWeek: 1, // Monday — no program day scheduled today
      todayExercises: [],
      todayMuscleGroups: [],
      progressPctForLabel: null,
    })

    expect(result.todayScheduledMuscle).toBeNull()
    // ไม่มี currentDay แต่ dow ยังถูกส่งเข้ามาถูกต้อง (ไม่ใช่ null) — getNextScheduledMuscle ยังไล่หา
    // วันถัดไป (พฤหัส/ขา) ต่อได้ตามเดิม แทนที่จะพังเงียบๆ เพราะไม่มี currentDay
    expect(result.recommendation?.muscleGroup).toBe('ขา')
  })
})
