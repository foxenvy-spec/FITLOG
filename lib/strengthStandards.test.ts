import { describe, it, expect } from 'vitest'
import { computeStrengthAxis, vo2MaxToPct, coreVolumeToPct } from './strengthStandards'
import type { Workout } from './types'

type MinimalWorkout = Pick<Workout, 'exercise_name' | 'weight_kg' | 'reps' | 'type'>

function mkWorkout(overrides: Partial<MinimalWorkout> & Pick<MinimalWorkout, 'exercise_name' | 'weight_kg' | 'reps'>): MinimalWorkout {
  return { type: 'strength', ...overrides }
}

describe('computeStrengthAxis', () => {
  const workouts = [
    mkWorkout({ exercise_name: 'Incline Bench Press', weight_kg: 60, reps: 5 }),
    mkWorkout({ exercise_name: 'Bench Press', weight_kg: 80, reps: 5 }),
    mkWorkout({ exercise_name: 'Squat', weight_kg: 100, reps: 5 }),
    mkWorkout({ exercise_name: 'Leg Press', weight_kg: 200, reps: 10 }), // ไม่ควรถูกนับเข้า legs axis
  ]

  it('picks the best estimated 1RM among exercises matching the axis keyword, ignoring unrelated lifts', () => {
    const result = computeStrengthAxis('push', workouts, 80, 'male')
    // Epley: 80 * (1 + 5/30) = 93.33...
    expect(result.best1RMKg).toBeCloseTo(93.3, 1)
    expect(result.ratio).toBeCloseTo(1.17, 1)
  })

  it('excludes exercises that do not match the axis keyword (Leg Press is not a squat)', () => {
    const result = computeStrengthAxis('legs', workouts, 80, 'male')
    expect(result.best1RMKg).toBeCloseTo(116.7, 1) // จาก Squat 100kg x5 เท่านั้น ไม่ใช่ Leg Press
  })

  it('returns null pct (not 0) when nothing matches or bodyweight is missing — "no data" is not "score 0"', () => {
    expect(computeStrengthAxis('pull', workouts, 80, 'male')).toEqual({ pct: null, best1RMKg: null, ratio: null })
    expect(computeStrengthAxis('push', workouts, null, 'male')).toEqual({ pct: null, best1RMKg: null, ratio: null })
  })

  it('returns pct 0 (not null) when the lift exists but the 1RM/bodyweight ratio is below the novice tier', () => {
    const weakWorkouts = [mkWorkout({ exercise_name: 'Bench Press', weight_kg: 1, reps: 1 })]
    const result = computeStrengthAxis('push', weakWorkouts, 100, 'male')
    expect(result.pct).toBe(0)
    expect(result.best1RMKg).not.toBeNull()
  })

  it('scores lower against male-only standards than against the (lower) sex-averaged fallback at the same ratio', () => {
    // เกณฑ์ของผู้ชายสูงกว่าเกณฑ์เฉลี่ยชาย/หญิงเสมอ (ตาราง RATIOS) ที่ ratio เดียวกัน เทียบกับเกณฑ์ที่สูงกว่า
    // ต้องได้ pct ต่ำกว่า — ไม่ได้ตั้งค่าเพศ (ใช้ค่าเฉลี่ย ต่ำกว่าเกณฑ์ชาย) จึงควรได้ pct สูงกว่าเกณฑ์ชายล้วน
    const male = computeStrengthAxis('push', workouts, 80, 'male')
    const unset = computeStrengthAxis('push', workouts, 80, null)
    expect(unset.pct).not.toBeNull()
    expect(male.pct).not.toBeNull()
    expect(unset.pct!).toBeGreaterThan(male.pct!)
  })

  it('caps at 100 for a ratio at or beyond the elite threshold', () => {
    const eliteWorkouts = [mkWorkout({ exercise_name: 'Deadlift', weight_kg: 300, reps: 1 })]
    const result = computeStrengthAxis('pull', eliteWorkouts, 80, 'male')
    expect(result.pct).toBe(100)
  })
})

describe('vo2MaxToPct', () => {
  it('matches the classifyVO2Max breakpoints exactly at each threshold', () => {
    expect(vo2MaxToPct(25)).toBe(25)
    expect(vo2MaxToPct(35)).toBe(50)
    expect(vo2MaxToPct(45)).toBe(75)
    expect(vo2MaxToPct(55)).toBe(100)
  })

  it('interpolates linearly between thresholds', () => {
    // 30 อยู่กึ่งกลางระหว่าง 25(pct 25) กับ 35(pct 50) -> 37.5 ปัดเป็น 38
    expect(vo2MaxToPct(30)).toBe(38)
  })

  it('returns 0 for null or non-positive input', () => {
    expect(vo2MaxToPct(null)).toBe(0)
    expect(vo2MaxToPct(0)).toBe(0)
  })

  it('caps at 100 above the top threshold', () => {
    expect(vo2MaxToPct(70)).toBe(100)
  })
})

describe('coreVolumeToPct', () => {
  it('reaches 100% once core volume hits the 12.5% target share', () => {
    expect(coreVolumeToPct(125, 1000)).toBe(100)
  })

  it('scales linearly below the target share', () => {
    expect(coreVolumeToPct(62.5, 1000)).toBe(50) // 6.25% share = ครึ่งหนึ่งของเป้า 12.5%
  })

  it('never exceeds 100% even when core volume share is far above target', () => {
    expect(coreVolumeToPct(500, 1000)).toBe(100)
  })

  it('returns 0 when there is no total volume to compare against', () => {
    expect(coreVolumeToPct(0, 0)).toBe(0)
  })
})
