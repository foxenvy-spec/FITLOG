import { describe, it, expect } from 'vitest'
import { computeDaySummary, computeDayTotals, computeExerciseProgress, countDayPRs, formatDuration, workoutVolumeKg } from './workoutDisplay'
import type { Workout } from './types'

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'w-1',
    user_id: 'user-1',
    type: 'strength',
    performed_at: '2026-07-20',
    exercise_name: 'เบนช์เพรส',
    muscle_group: 'อก',
    secondary_muscles: [],
    exercise_library_id: null,
    sets: 3,
    reps: 8,
    weight_kg: 60,
    rpe: null,
    cardio_type: null,
    distance_km: null,
    duration_min: null,
    avg_heart_rate: null,
    cadence: null,
    calories_kcal: null,
    notes: null,
    created_at: '2026-07-20T10:00:00Z',
    total_volume_kg: null,
    program_day_id: null,
    ...overrides,
  }
}

describe('workoutVolumeKg', () => {
  it('uses total_volume_kg when present', () => {
    expect(workoutVolumeKg(makeWorkout({ total_volume_kg: 999 }))).toBe(999)
  })

  it('falls back to sets*reps*weight_kg when total_volume_kg is null', () => {
    expect(workoutVolumeKg(makeWorkout({ sets: 3, reps: 8, weight_kg: 60, total_volume_kg: null }))).toBe(3 * 8 * 60)
  })
})

describe('computeDaySummary', () => {
  it('sums sets/volume and collects distinct muscle groups across the day', () => {
    const summary = computeDaySummary([
      makeWorkout({ id: 'a', sets: 4, reps: 7, weight_kg: 35, muscle_group: 'อก', total_volume_kg: 980 }),
      makeWorkout({ id: 'b', sets: 3, reps: 10, weight_kg: 9.1, muscle_group: 'แขน', total_volume_kg: 273 }),
      makeWorkout({ id: 'c', type: 'cardio', sets: null, reps: null, weight_kg: null, muscle_group: null }),
    ])
    expect(summary.exerciseCount).toBe(3)
    expect(summary.totalSets).toBe(7)
    expect(summary.totalVolumeKg).toBe(980 + 273)
    expect(summary.muscleGroups.sort()).toEqual(['อก', 'แขน'].sort())
  })

  it('sums calories across all entries', () => {
    const summary = computeDaySummary([
      makeWorkout({ id: 'a', calories_kcal: 320 }),
      makeWorkout({ id: 'b', type: 'cardio', calories_kcal: 210 }),
      makeWorkout({ id: 'c', calories_kcal: null }),
    ])
    expect(summary.caloriesKcal).toBe(530)
  })

  it('estimates duration from the spread of created_at timestamps', () => {
    const summary = computeDaySummary([
      makeWorkout({ id: 'a', created_at: '2026-07-20T10:00:00Z' }),
      makeWorkout({ id: 'b', created_at: '2026-07-20T11:18:00Z' }),
    ])
    expect(summary.durationMin).toBe(78)
  })

  it('returns null duration when fewer than two entries', () => {
    expect(computeDaySummary([makeWorkout()]).durationMin).toBeNull()
    expect(computeDaySummary([]).durationMin).toBeNull()
  })

  it('regression: falls back to null when created_at spans an unrealistic gap (backfilled/edited entries, not a real single session)', () => {
    // จำลองบั๊ก "28h9m" จริง — รายการแรก log เช้าวันที่ 20, รายการสุดท้าย log/แก้ไขเช้าวันถัดไป
    // (ข้าม day boundary) ทั้งที่ performed_at ตั้งเป็นวันเดียวกัน (20) ทั้งคู่ — ไม่ใช่ session จริง
    const summary = computeDaySummary([
      makeWorkout({ id: 'a', performed_at: '2026-07-20', created_at: '2026-07-20T06:00:00Z' }),
      makeWorkout({ id: 'b', performed_at: '2026-07-20', created_at: '2026-07-21T10:09:00Z' }),
    ])
    expect(summary.durationMin).toBeNull()
    // stat อื่นไม่ถูกกระทบเลย — sanity cap แตะแค่ durationMin
    expect(summary.exerciseCount).toBe(2)
    expect(summary.totalSets).toBe(6)
  })

  it('keeps a real same-session gap under the 6h sanity cap', () => {
    const summary = computeDaySummary([
      makeWorkout({ id: 'a', created_at: '2026-07-20T06:00:00Z' }),
      makeWorkout({ id: 'b', created_at: '2026-07-20T11:30:00Z' }), // 5.5h — plausible long session
    ])
    expect(summary.durationMin).toBe(330)
  })

  // 6B-2 (P0-2) — this fallback was ported in from the old (now-removed) computeTodayTotals: a day with a
  // single cardio entry has no second timestamp to build a created_at span from, so it used to fall back to
  // null here even though the cardio row carries a real self-reported duration_min. Consolidating the two
  // implementations surfaced the gap; keeping it fixes History/Calendar/Train too, not just Dashboard/Stats.
  it('falls back to the cardio entry\'s own duration_min when there is only one entry that day (no span to compute)', () => {
    const summary = computeDaySummary([makeWorkout({ type: 'cardio', duration_min: 25, sets: null, reps: null, weight_kg: null })])
    expect(summary.durationMin).toBe(25)
  })

  it('takes the max of the created_at span and cardio duration_min when both are available', () => {
    const summary = computeDaySummary([
      makeWorkout({ id: 'a', type: 'cardio', duration_min: 5, created_at: '2026-07-20T08:00:00Z' }),
      makeWorkout({ id: 'b', type: 'strength', created_at: '2026-07-20T08:45:00Z' }),
    ])
    expect(summary.durationMin).toBe(45)
  })
})

// 6B-2 (P0-2) — canonical "totals for one day" engine. Contract: without onlyProgramDayId returns actual
// day totals (all workouts on that date); with onlyProgramDayId returns the schedule-scoped subset. These
// are two distinct, intentionally different answers — tests assert each mode's filtering independently,
// never that the two modes produce equal numbers.
describe('computeDayTotals', () => {
  it('without onlyProgramDayId: sums every workout on the given date, across program days and ad-hoc entries alike', () => {
    const totals = computeDayTotals(
      [
        makeWorkout({ id: 'a', performed_at: '2026-07-20', sets: 4, program_day_id: 'day-legs' }),
        makeWorkout({ id: 'b', performed_at: '2026-07-20', sets: 3, program_day_id: null }),
        makeWorkout({ id: 'c', performed_at: '2026-07-20', sets: 2, program_day_id: 'day-makeup' }),
        makeWorkout({ id: 'd', performed_at: '2026-07-19', sets: 99 }), // a different day — must not leak in
      ],
      '2026-07-20'
    )
    expect(totals.exerciseCount).toBe(3)
    expect(totals.totalSets).toBe(4 + 3 + 2)
  })

  it('with onlyProgramDayId: keeps only ad-hoc entries plus the ones tagged for that program day, excluding other program days', () => {
    const totals = computeDayTotals(
      [
        makeWorkout({ id: 'a', performed_at: '2026-07-20', sets: 4, program_day_id: 'day-legs' }),
        makeWorkout({ id: 'b', performed_at: '2026-07-20', sets: 3, program_day_id: null }), // ad-hoc, always kept
        makeWorkout({ id: 'c', performed_at: '2026-07-20', sets: 2, program_day_id: 'day-makeup' }), // a different plan — excluded
      ],
      '2026-07-20',
      { onlyProgramDayId: 'day-legs' }
    )
    expect(totals.exerciseCount).toBe(2)
    expect(totals.totalSets).toBe(4 + 3)
  })

  it('is deterministic: calling it twice with the same inputs (any order in the source array) returns identical totals', () => {
    const workouts = [
      makeWorkout({ id: 'a', performed_at: '2026-07-20', sets: 4, total_volume_kg: 400, program_day_id: 'day-legs' }),
      makeWorkout({ id: 'b', performed_at: '2026-07-20', sets: 3, total_volume_kg: 150, program_day_id: null }),
    ]
    const first = computeDayTotals(workouts, '2026-07-20', { onlyProgramDayId: 'day-legs' })
    const second = computeDayTotals([...workouts].reverse(), '2026-07-20', { onlyProgramDayId: 'day-legs' })
    expect(second).toEqual(first)
  })

  it('filters to the requested date only, out of a multi-day workouts array (no caller-side pre-grouping needed)', () => {
    const workouts = [
      makeWorkout({ id: 'a', performed_at: '2026-07-18', sets: 5 }),
      makeWorkout({ id: 'b', performed_at: '2026-07-19', sets: 6 }),
      makeWorkout({ id: 'c', performed_at: '2026-07-20', sets: 7 }),
    ]
    expect(computeDayTotals(workouts, '2026-07-19').totalSets).toBe(6)
    expect(computeDayTotals(workouts, '2026-07-99').totalSets).toBe(0)
  })

  it('matches computeDaySummary\'s math exactly for the no-scoping case (single canonical implementation, not two that happen to agree)', () => {
    const dayWorkouts = [
      makeWorkout({ id: 'a', performed_at: '2026-07-20', sets: null, total_volume_kg: 500 }),
      makeWorkout({ id: 'b', performed_at: '2026-07-20', sets: 3, total_volume_kg: 210 }),
    ]
    expect(computeDayTotals(dayWorkouts, '2026-07-20')).toEqual(computeDaySummary(dayWorkouts))
  })

  it('a workout with a null sets field contributes 0 sets, not 1 (regression: Dashboard used to default missing sets to 1)', () => {
    const totals = computeDayTotals([makeWorkout({ id: 'a', performed_at: '2026-07-20', sets: null })], '2026-07-20')
    expect(totals.totalSets).toBe(0)
  })
})

describe('formatDuration', () => {
  it('formats minutes under an hour as Xm', () => {
    expect(formatDuration(45)).toBe('45m')
  })

  it('formats over an hour as Xh Ym', () => {
    expect(formatDuration(78)).toBe('1h 18m')
  })

  it('omits minutes when exactly on the hour', () => {
    expect(formatDuration(120)).toBe('2h')
  })
})

describe('computeExerciseProgress', () => {
  it('flags a PR when weight beats the all-time best', () => {
    const prior = [makeWorkout({ id: 'p1', performed_at: '2026-07-10', weight_kg: 30 })]
    const today = makeWorkout({ id: 't', performed_at: '2026-07-20', weight_kg: 35 })
    expect(computeExerciseProgress(today, prior)).toEqual({ kind: 'pr', deltaKg: 5 })
  })

  it('flags best volume when weight is not a PR but volume is', () => {
    const prior = [makeWorkout({ id: 'p1', performed_at: '2026-07-10', weight_kg: 40, sets: 3, reps: 8, total_volume_kg: 960 })]
    const today = makeWorkout({ id: 't', performed_at: '2026-07-20', weight_kg: 40, sets: 5, reps: 8, total_volume_kg: 1600 })
    expect(computeExerciseProgress(today, prior)).toEqual({ kind: 'bestVolume' })
  })

  // บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจครอบใหม่): เดิม ExerciseProgress กิ่ง 'bestVolume' มี topPercent ต่อท้าย
  // (จาก volumeTopPercent) แต่ branch นี้เข้าได้เฉพาะตอน thisVolume ชนะทุกแถวใน prior อยู่แล้ว ทำให้
  // เปอร์เซ็นไทล์ที่คำนวณออกมาเป็น 100% คงที่เสมอ (ผลลัพธ์หลัง clamp คือ "Top 1%" ทุกครั้งไม่ว่าข้อมูล
  // ย้อนหลังจะเป็นอย่างไร) — ตัด topPercent ออกทั้งหมด (ดู ExerciseProgress ใน lib/workoutDisplay.ts) เทสต์
  // นี้เดิมชื่อ "computes a topPercent..." ยืนยันพฤติกรรมที่เป็นบั๊ก เปลี่ยนมายืนยันแค่ว่ายัง flag bestVolume
  // ถูกต้องแม้มีประวัติยาว (จำนวน prior เยอะกว่าเทสต์ข้างบน) แทน
  it('still flags best volume correctly with a longer prior history', () => {
    const prior = [
      makeWorkout({ id: 'p1', performed_at: '2026-06-01', weight_kg: 40, total_volume_kg: 500 }),
      makeWorkout({ id: 'p2', performed_at: '2026-06-08', weight_kg: 40, total_volume_kg: 700 }),
      makeWorkout({ id: 'p3', performed_at: '2026-06-15', weight_kg: 40, total_volume_kg: 900 }),
      makeWorkout({ id: 'p4', performed_at: '2026-06-22', weight_kg: 40, total_volume_kg: 950 }),
    ]
    const today = makeWorkout({ id: 't', performed_at: '2026-07-20', weight_kg: 40, total_volume_kg: 1600 })
    expect(computeExerciseProgress(today, prior)).toEqual({ kind: 'bestVolume' })
  })

  it('flags up/down relative to the most recent session when neither is a record', () => {
    const prior = [
      makeWorkout({ id: 'p1', performed_at: '2026-07-01', weight_kg: 50, total_volume_kg: 3000 }),
      makeWorkout({ id: 'p2', performed_at: '2026-07-15', weight_kg: 42, total_volume_kg: 1000 }),
    ]
    const up = makeWorkout({ id: 't1', performed_at: '2026-07-20', weight_kg: 45, total_volume_kg: 1100 })
    expect(computeExerciseProgress(up, prior)).toEqual({ kind: 'up', deltaKg: 3 })

    const down = makeWorkout({ id: 't2', performed_at: '2026-07-20', weight_kg: 40, total_volume_kg: 900 })
    expect(computeExerciseProgress(down, prior)).toEqual({ kind: 'down', deltaKg: 2 })
  })

  it('returns none for the first time an exercise is logged', () => {
    const today = makeWorkout({ id: 't', performed_at: '2026-07-20' })
    expect(computeExerciseProgress(today, [])).toEqual({ kind: 'none' })
  })

  it('ignores cardio entries and same-day entries', () => {
    const cardio = makeWorkout({ id: 'c', type: 'cardio', performed_at: '2026-07-20' })
    expect(computeExerciseProgress(cardio, []).kind).toBe('none')

    const sameDay = [makeWorkout({ id: 'same', performed_at: '2026-07-20', weight_kg: 20 })]
    const today = makeWorkout({ id: 't', performed_at: '2026-07-20', weight_kg: 35 })
    expect(computeExerciseProgress(today, sameDay)).toEqual({ kind: 'none' })
  })

  it('flags reps up/down when weight ties the most recent session', () => {
    const prior = [
      makeWorkout({ id: 'p1', performed_at: '2026-07-01', weight_kg: 50, total_volume_kg: 3000 }),
      makeWorkout({ id: 'p2', performed_at: '2026-07-15', weight_kg: 40, reps: 8, total_volume_kg: 1000 }),
    ]
    const moreReps = makeWorkout({ id: 't1', performed_at: '2026-07-20', weight_kg: 40, reps: 10, total_volume_kg: 900 })
    expect(computeExerciseProgress(moreReps, prior)).toEqual({ kind: 'repsUp', deltaReps: 2 })

    const fewerReps = makeWorkout({ id: 't2', performed_at: '2026-07-20', weight_kg: 40, reps: 6, total_volume_kg: 700 })
    expect(computeExerciseProgress(fewerReps, prior)).toEqual({ kind: 'repsDown', deltaReps: 2 })
  })

  it('flags same when weight and reps both tie the most recent session', () => {
    const prior = [
      makeWorkout({ id: 'p1', performed_at: '2026-07-01', weight_kg: 50, total_volume_kg: 3000 }),
      makeWorkout({ id: 'p2', performed_at: '2026-07-15', weight_kg: 40, reps: 8, total_volume_kg: 1000 }),
    ]
    const same = makeWorkout({ id: 't', performed_at: '2026-07-20', weight_kg: 40, reps: 8, total_volume_kg: 900 })
    expect(computeExerciseProgress(same, prior)).toEqual({ kind: 'same' })
  })
})

describe('countDayPRs', () => {
  it('counts entries that are a PR or best volume that day', () => {
    const prior = [makeWorkout({ id: 'p1', performed_at: '2026-07-10', weight_kg: 30 })]
    const pr = makeWorkout({ id: 'a', performed_at: '2026-07-20', weight_kg: 35 })
    const notPr = makeWorkout({ id: 'b', performed_at: '2026-07-20', weight_kg: 20 })
    expect(countDayPRs([pr, notPr], prior)).toBe(1)
  })
})
