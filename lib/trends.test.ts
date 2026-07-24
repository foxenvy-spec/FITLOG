import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  aggregateVolumeByMonth,
  aggregateVolumeByYear,
  computeTrainingLoad,
  zoneForRatio,
  computeRecoveryHistory,
  computeWeeklyHRTrend,
} from './trends'
import type { Workout } from './types'

const FIXED_TODAY = '2026-07-18T09:00:00'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(FIXED_TODAY))
})

afterEach(() => {
  vi.useRealTimers()
})

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
    ...overrides,
  }
}

describe('aggregateVolumeByMonth', () => {
  it('buckets strength volume into the correct calendar month', () => {
    const reference = new Date('2026-07-18T00:00:00')
    const workouts = [
      makeWorkout({ performed_at: '2026-07-05', total_volume_kg: 500 }),
      makeWorkout({ performed_at: '2026-06-20', total_volume_kg: 300 }),
      makeWorkout({ performed_at: '2026-06-01', total_volume_kg: 200 }),
      makeWorkout({ type: 'cardio', performed_at: '2026-07-05', total_volume_kg: 999 }), // ไม่นับ cardio
    ]
    const buckets = aggregateVolumeByMonth(workouts, 3, reference)
    expect(buckets.map((b) => b.key)).toEqual(['2026-05', '2026-06', '2026-07'])
    expect(buckets.find((b) => b.key === '2026-07')!.value).toBe(500)
    expect(buckets.find((b) => b.key === '2026-06')!.value).toBe(500)
    expect(buckets.find((b) => b.key === '2026-05')!.value).toBe(0)
  })
})

describe('aggregateVolumeByYear', () => {
  it('buckets strength volume into the correct calendar year', () => {
    const reference = new Date('2026-07-18T00:00:00')
    const workouts = [
      makeWorkout({ performed_at: '2026-01-10', total_volume_kg: 100 }),
      makeWorkout({ performed_at: '2025-12-31', total_volume_kg: 50 }),
    ]
    const buckets = aggregateVolumeByYear(workouts, 2, reference)
    expect(buckets.map((b) => b.key)).toEqual(['2025', '2026'])
    expect(buckets.find((b) => b.key === '2026')!.value).toBe(100)
    expect(buckets.find((b) => b.key === '2025')!.value).toBe(50)
  })
})

describe('zoneForRatio', () => {
  it('classifies ACWR into training load zones using standard thresholds', () => {
    expect(zoneForRatio(null)).toBe('optimal')
    expect(zoneForRatio(0.5)).toBe('undertraining')
    expect(zoneForRatio(1.0)).toBe('optimal')
    expect(zoneForRatio(1.5)).toBe('high-risk')
  })
})

describe('computeTrainingLoad', () => {
  it('flags a sudden spike in recent volume as high-risk once there is enough history', () => {
    const reference = new Date('2026-07-18T00:00:00')
    const workouts: Workout[] = []
    // สร้างเบสไลน์เบาๆ ทุกวันตลอด 28 วันก่อนหน้า
    for (let i = 27; i >= 7; i--) {
      const d = new Date(reference)
      d.setDate(d.getDate() - i)
      workouts.push(makeWorkout({ performed_at: d.toISOString().slice(0, 10), total_volume_kg: 500 }))
    }
    // 7 วันล่าสุด หนักขึ้นมาก
    for (let i = 6; i >= 0; i--) {
      const d = new Date(reference)
      d.setDate(d.getDate() - i)
      workouts.push(makeWorkout({ performed_at: d.toISOString().slice(0, 10), total_volume_kg: 2000 }))
    }
    const points = computeTrainingLoad(workouts, 30, reference)
    const last = points[points.length - 1]
    expect(last.ratio).not.toBeNull()
    expect(last.ratio!).toBeGreaterThan(1.3)
    expect(last.zone).toBe('high-risk')
  })

  it('returns null ratio for early points in the window before 14 days of data have accumulated', () => {
    const reference = new Date('2026-07-18T00:00:00')
    const workouts = [makeWorkout({ performed_at: '2026-07-18', total_volume_kg: 500 })]
    const points = computeTrainingLoad(workouts, 30, reference)
    expect(points[0].ratio).toBeNull()
    expect(points[12].ratio).toBeNull()
  })
})

describe('computeRecoveryHistory', () => {
  it('shows full recovery before any training history and drops to 0% on the day trained', () => {
    const reference = new Date('2026-07-18T00:00:00')
    const logs = [{ muscle_group: 'อก', performed_at: '2026-07-18' }]
    const points = computeRecoveryHistory(logs, 5, reference)
    expect(points).toHaveLength(5)
    // วันแรกของกราฟ (2026-07-14) ยังไม่มีประวัติฝึกอกเลย -> เต็ม 100% ทุกกลุ่ม
    expect(points[0].overallPct).toBe(100)
    // วันสุดท้าย (2026-07-18) เพิ่งฝึกอกวันนี้ -> ค่าเฉลี่ยรวมต้องลดลงจาก 100%
    expect(points[points.length - 1].overallPct).toBeLessThan(100)
  })

  it('uses training history from before the window to avoid an inflated first day', () => {
    const reference = new Date('2026-07-18T00:00:00')
    // ฝึกอกไป 1 วันก่อนกราฟเริ่ม (กราฟ 3 วันหลังสุด เริ่ม 2026-07-16)
    const logs = [{ muscle_group: 'อก', performed_at: '2026-07-15' }]
    const points = computeRecoveryHistory(logs, 3, reference)
    // วันแรกของกราฟ (2026-07-16) ควรสะท้อนว่าฝึกอกไปแล้วเมื่อวาน ไม่ใช่ 100% เต็ม
    expect(points[0].overallPct).toBeLessThan(100)
  })
})

describe('computeWeeklyHRTrend', () => {
  it('computes a duration-weighted average heart rate per week', () => {
    const reference = new Date('2026-07-18T00:00:00') // เสาร์
    const cardioWorkouts = [
      { performed_at: '2026-07-18', avg_heart_rate: 150, duration_min: 30 },
      { performed_at: '2026-07-17', avg_heart_rate: 120, duration_min: 10 },
    ]
    const points = computeWeeklyHRTrend(cardioWorkouts, 2, reference)
    const thisWeek = points[points.length - 1]
    // ถ่วงน้ำหนัก: (150*30 + 120*10) / 40 = 142.5 -> ปัดเป็น 143 หรือ 142 ตามการปัดเศษ
    expect(thisWeek.avgHeartRate).toBeCloseTo(143, 0)
    expect(thisWeek.sessionCount).toBe(2)
  })

  it('returns null average for a week with no heart rate data', () => {
    const reference = new Date('2026-07-18T00:00:00')
    const points = computeWeeklyHRTrend([], 3, reference)
    expect(points.every((p) => p.avgHeartRate === null && p.sessionCount === 0)).toBe(true)
  })
})
