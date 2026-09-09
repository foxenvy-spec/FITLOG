import { describe, it, expect } from 'vitest'
import {
  computePeriodTotals,
  computePctChange,
  buildTrainedDayEntries,
  computeDailyVolumes,
  computeWeeklyVolumesWithLabels,
  composeReportSummary,
  findPeakTrendPoint,
} from './workoutReport'
import type { Workout } from './types'
import type { MetricDelta } from './bodyMetricsSummary'

function makeWorkout(overrides: Partial<Workout>): Workout {
  return {
    id: 'w1',
    user_id: 'u1',
    type: 'strength',
    performed_at: '2026-07-18',
    exercise_name: null,
    muscle_group: null,
    secondary_muscles: [],
    exercise_library_id: null,
    sets: null,
    reps: null,
    weight_kg: null,
    rpe: null,
    cardio_type: null,
    distance_km: null,
    duration_min: null,
    avg_heart_rate: null,
    cadence: null,
    calories_kcal: null,
    notes: null,
    created_at: '2026-07-18T09:00:00',
    total_volume_kg: null,
    program_day_id: null,
    ...overrides,
  }
}

function metricDelta(overrides: Partial<MetricDelta>): MetricDelta {
  return { value: null, delta: null, isGood: null, ...overrides }
}

describe('computePeriodTotals', () => {
  it('returns all-zero totals for an empty period', () => {
    expect(computePeriodTotals([])).toEqual({ workoutCount: 0, totalVolumeKg: 0, totalSets: 0, totalDurationMin: 0 })
  })

  it('counts workoutCount as distinct trained days, not raw rows', () => {
    const workouts = [
      makeWorkout({ id: 'a', performed_at: '2026-07-18', exercise_name: 'Squat', sets: 3, total_volume_kg: 300 }),
      makeWorkout({ id: 'b', performed_at: '2026-07-18', exercise_name: 'Bench', sets: 3, total_volume_kg: 200 }),
      makeWorkout({ id: 'c', performed_at: '2026-07-16', exercise_name: 'Deadlift', sets: 2, total_volume_kg: 400 }),
    ]
    const result = computePeriodTotals(workouts)
    expect(result.workoutCount).toBe(2)
    expect(result.totalVolumeKg).toBe(900)
    expect(result.totalSets).toBe(8)
  })

  it('ignores cardio rows for volume/sets but still counts the day as trained', () => {
    const workouts = [makeWorkout({ type: 'cardio', performed_at: '2026-07-18', distance_km: 5 })]
    const result = computePeriodTotals(workouts)
    expect(result.workoutCount).toBe(1)
    expect(result.totalVolumeKg).toBe(0)
    expect(result.totalSets).toBe(0)
  })

  it('does not fabricate duration from a single untimed strength entry that day', () => {
    // computeTodayTotals ต้องการ >=2 แถวถึงจะคำนวณ span duration ได้ (ดู lib/dashboardStats.ts) —
    // วันที่มีแค่ 1 ท่าเวทล้วนๆ ไม่มีคาร์ดิโอ จึง durationMin = null -> ไม่บวกเวลาปลอมเข้าไป
    const result = computePeriodTotals([makeWorkout({ performed_at: '2026-07-18', sets: 3, total_volume_kg: 300 })])
    expect(result.totalDurationMin).toBe(0)
  })

  it('sums duration across multiple days using computeTodayTotals per day', () => {
    const workouts = [
      makeWorkout({ id: 'a', performed_at: '2026-07-16', type: 'cardio', duration_min: 30 }),
      makeWorkout({ id: 'b', performed_at: '2026-07-18', type: 'cardio', duration_min: 20 }),
    ]
    const result = computePeriodTotals(workouts)
    expect(result.totalDurationMin).toBe(50)
  })
})

describe('computePctChange', () => {
  it('returns null when the previous period has no baseline', () => {
    expect(computePctChange(10, 0)).toBeNull()
  })

  it('computes a positive rounded percentage on increase', () => {
    expect(computePctChange(120, 100)).toBe(20)
  })

  it('computes a negative rounded percentage on decrease', () => {
    expect(computePctChange(80, 100)).toBe(-20)
  })
})

describe('buildTrainedDayEntries', () => {
  it('returns entries oldest-first ending on todayIso, with correct hasWorkout membership', () => {
    const trained = new Set(['2026-07-16', '2026-07-18'])
    const entries = buildTrainedDayEntries(trained, 3, '2026-07-18')
    expect(entries).toHaveLength(3)
    expect(entries.map((e) => e.hasWorkout)).toEqual([true, false, true])
  })

  it('assigns dayOfWeek consistent with real calendar UTC day-of-week', () => {
    const entries = buildTrainedDayEntries(new Set(), 1, '2026-07-18')
    expect(entries[0].dayOfWeek).toBe(new Date('2026-07-18T00:00:00Z').getUTCDay())
  })
})

describe('computeDailyVolumes', () => {
  const reference = new Date('2026-07-18T00:00:00')

  it('buckets strength volume per day and fills missing days with 0', () => {
    const workouts = [
      makeWorkout({ performed_at: '2026-07-18', total_volume_kg: 500 }),
      makeWorkout({ performed_at: '2026-07-16', total_volume_kg: 200 }),
    ]
    const points = computeDailyVolumes(workouts, 3, reference)
    expect(points.map((p) => p.value)).toEqual([200, 0, 500])
  })

  it('ignores cardio rows', () => {
    const workouts = [makeWorkout({ type: 'cardio', performed_at: '2026-07-18', total_volume_kg: 999 })]
    const points = computeDailyVolumes(workouts, 1, reference)
    expect(points[0].value).toBe(0)
  })

  it('ignores workouts outside the requested day window', () => {
    const workouts = [makeWorkout({ performed_at: '2026-06-01', total_volume_kg: 500 })]
    const points = computeDailyVolumes(workouts, 3, reference)
    expect(points.every((p) => p.value === 0)).toBe(true)
  })
})

describe('computeWeeklyVolumesWithLabels', () => {
  const reference = new Date('2026-07-18T00:00:00')

  it('returns weeksCount buckets, oldest first, with the reference date landing in the last bucket', () => {
    const workouts = [makeWorkout({ performed_at: '2026-07-18', total_volume_kg: 500 })]
    const points = computeWeeklyVolumesWithLabels(workouts, 3, reference)
    expect(points).toHaveLength(3)
    expect(points[0].value).toBe(0)
    expect(points[1].value).toBe(0)
    expect(points[2].value).toBe(500)
  })

  it('ignores cardio rows', () => {
    const workouts = [makeWorkout({ type: 'cardio', performed_at: '2026-07-18', total_volume_kg: 999 })]
    const points = computeWeeklyVolumesWithLabels(workouts, 1, reference)
    expect(points[0].value).toBe(0)
  })

  it('produces a non-empty label for every bucket', () => {
    const points = computeWeeklyVolumesWithLabels([], 2, reference)
    points.forEach((p) => expect(p.label.length).toBeGreaterThan(0))
  })
})

describe('composeReportSummary', () => {
  const noDelta = metricDelta({})

  it('flags zero activity first, before any other rule', () => {
    const result = composeReportSummary({
      workoutCount: 0,
      workoutCountDeltaPct: null,
      consistencyPct: 90,
      volumeDeltaPct: 50,
      weightDelta: noDelta,
      bodyFatDelta: noDelta,
      periodLabel: '7 วันที่ผ่านมา',
    })
    expect(result.interpretation).toContain('ยังไม่มีการฝึก')
  })

  it('leads with low consistency when below 50%, even if body metrics improved', () => {
    const result = composeReportSummary({
      workoutCount: 3,
      workoutCountDeltaPct: null,
      consistencyPct: 40,
      volumeDeltaPct: null,
      weightDelta: metricDelta({ delta: -2, isGood: true }),
      bodyFatDelta: noDelta,
      periodLabel: '30 วันที่ผ่านมา',
    })
    expect(result.interpretation).toContain('40%')
  })

  it('celebrates high consistency plus improving weight', () => {
    const result = composeReportSummary({
      workoutCount: 12,
      workoutCountDeltaPct: 20,
      consistencyPct: 85,
      volumeDeltaPct: 5,
      weightDelta: metricDelta({ delta: -1.7, isGood: true }),
      bodyFatDelta: noDelta,
      periodLabel: '30 วันที่ผ่านมา',
    })
    expect(result.interpretation).toContain('85%')
    expect(result.interpretation).toContain('1.7 kg')
  })

  it('celebrates high consistency plus improving body fat when weight is not improving', () => {
    const result = composeReportSummary({
      workoutCount: 12,
      workoutCountDeltaPct: 20,
      consistencyPct: 85,
      volumeDeltaPct: 5,
      weightDelta: noDelta,
      bodyFatDelta: metricDelta({ delta: -1.4, isGood: true }),
      periodLabel: '30 วันที่ผ่านมา',
    })
    expect(result.interpretation).toContain('ไขมันลดลง 1.4%')
  })

  it('flags a plateau when volume rose but body metrics did not improve', () => {
    const result = composeReportSummary({
      workoutCount: 10,
      workoutCountDeltaPct: 5,
      consistencyPct: 60,
      volumeDeltaPct: 15,
      weightDelta: noDelta,
      bodyFatDelta: noDelta,
      periodLabel: '30 วันที่ผ่านมา',
    })
    expect(result.interpretation).toContain('วอลุ่มเพิ่มขึ้น 15%')
  })

  it('falls back to a plain trend sentence when no other rule fires', () => {
    const result = composeReportSummary({
      workoutCount: 4,
      workoutCountDeltaPct: null,
      consistencyPct: null,
      volumeDeltaPct: null,
      weightDelta: noDelta,
      bodyFatDelta: noDelta,
      periodLabel: '7 วันที่ผ่านมา',
    })
    expect(result.interpretation).toBe('ฝึกไป 4 ครั้งใน7 วันที่ผ่านมา')
  })
})

describe('findPeakTrendPoint', () => {
  it('returns null for an empty list', () => {
    expect(findPeakTrendPoint([])).toBeNull()
  })

  it('returns null when every point is 0 (nothing trained that period)', () => {
    const points = [
      { label: 'จ', value: 0 },
      { label: 'อ', value: 0 },
    ]
    expect(findPeakTrendPoint(points)).toBeNull()
  })

  it('returns the point with the highest value', () => {
    const points = [
      { label: 'จ', value: 200 },
      { label: 'อ', value: 500 },
      { label: 'พ', value: 300 },
    ]
    expect(findPeakTrendPoint(points)).toEqual({ label: 'อ', value: 500 })
  })

  it('returns the first point when there is a tie', () => {
    const points = [
      { label: 'จ', value: 500 },
      { label: 'อ', value: 500 },
    ]
    expect(findPeakTrendPoint(points)).toEqual({ label: 'จ', value: 500 })
  })
})
