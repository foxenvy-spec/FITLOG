import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { computeSessionMuscleRecovery, tierForPct } from './recoveryScore'

const FIXED_TODAY = '2026-07-18T09:00:00'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(FIXED_TODAY))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('tierForPct', () => {
  it('buckets percentages into the expected tiers', () => {
    expect(tierForPct(100)).toBe('green')
    expect(tierForPct(75)).toBe('green')
    expect(tierForPct(60)).toBe('yellow')
    expect(tierForPct(40)).toBe('orange')
    expect(tierForPct(10)).toBe('red')
  })
})

describe('computeSessionMuscleRecovery', () => {
  it('gives a heavily-trained muscle a lower readiness than a lightly-trained one', () => {
    const { byMuscle } = computeSessionMuscleRecovery(
      {
        อก: { sets: 12, avgRpe: 9 }, // hard chest day, well over the weekly target in one session
        ไหล่: { sets: 2, avgRpe: 6 }, // just a light accessory hit
      },
      {}
    )
    const chest = byMuscle.find((m) => m.muscleGroup === 'อก')!
    const shoulders = byMuscle.find((m) => m.muscleGroup === 'ไหล่')!
    expect(chest.trainedToday).toBe(true)
    expect(shoulders.trainedToday).toBe(true)
    expect(chest.pct).toBeLessThan(shoulders.pct)
    expect(chest.tier).not.toBe('green')
  })

  it('never drops a trained muscle below 10% or above 100%', () => {
    const { byMuscle } = computeSessionMuscleRecovery({ อก: { sets: 50, avgRpe: 10 } }, {})
    const chest = byMuscle.find((m) => m.muscleGroup === 'อก')!
    expect(chest.pct).toBeGreaterThanOrEqual(10)
    expect(chest.pct).toBeLessThanOrEqual(100)
  })

  it('falls back to the time-based recovery estimate for muscles not trained today', () => {
    const { byMuscle } = computeSessionMuscleRecovery({}, { หลัง: '2026-07-17' }) // trained yesterday
    const back = byMuscle.find((m) => m.muscleGroup === 'หลัง')!
    expect(back.trainedToday).toBe(false)
    expect(back.pct).toBeLessThan(100) // recently trained, not fully rested
  })

  it('treats an untouched muscle with no history as fully ready (per-muscle pct only, not counted in the overall average)', () => {
    const { byMuscle } = computeSessionMuscleRecovery({}, {})
    const legs = byMuscle.find((m) => m.muscleGroup === 'ขา')!
    expect(legs.trainedToday).toBe(false)
    expect(legs.pct).toBe(100)
    expect(legs.hasHistory).toBe(false)
  })

  // ฟีดแบ็ก (Final Production Audit — Scoring consistency) "no data ≠ 100% เมื่อ aggregate" เหมือนที่แก้ไปแล้ว
  // ใน computeRecoveryHistory (lib/trends.ts) — pct 100 ของกลุ่มที่ไม่เคยฝึกเลยยังถูกต้องอยู่ ระดับรายกลุ่ม
  // (แค่แปลว่า "พร้อม") แต่ไม่ควรถูกนับรวมเข้า overall เพราะไม่ใช่ตัวเลขที่มาจากข้อมูลจริง
  it('averages the overall score only across muscle groups with real history, when every group has some', () => {
    const priorLastTrainedDate = {
      อก: '2026-07-16',
      หลัง: '2026-07-15',
      ขา: '2026-07-14',
      น่อง: '2026-07-13',
      ไหล่: '2026-07-17',
      แขน: '2026-07-12',
      แกนกลางลำตัว: '2026-07-16',
    }
    const { overall, byMuscle } = computeSessionMuscleRecovery({}, priorLastTrainedDate)
    expect(byMuscle.every((m) => m.hasHistory)).toBe(true)
    const expectedAvg = Math.round(byMuscle.reduce((s, m) => s + m.pct, 0) / byMuscle.length)
    expect(overall).toBe(expectedAvg)
  })

  it('excludes muscle groups with no history from the overall average, instead of counting their 100% (regression test)', () => {
    // อก มีประวัติจริง (เพิ่งฝึกเมื่อวาน จึง pct ต่ำกว่า 100) ส่วนกลุ่มอื่นทั้งหมดไม่เคยมีประวัติเลย (pct 100
    // แต่ hasHistory: false) — overall ต้องเท่ากับ pct ของอกอย่างเดียว ไม่ใช่ค่าเฉลี่ยที่ถูกกลุ่ม "ไม่มีข้อมูล"
    // ถ่วงขึ้นไปใกล้ 100
    const { overall, byMuscle } = computeSessionMuscleRecovery({}, { อก: '2026-07-17' })
    const chest = byMuscle.find((m) => m.muscleGroup === 'อก')!
    expect(chest.hasHistory).toBe(true)
    expect(chest.pct).toBeLessThan(100)
    expect(byMuscle.filter((m) => m.muscleGroup !== 'อก').every((m) => m.hasHistory === false && m.pct === 100)).toBe(true)
    expect(overall).toBe(chest.pct)
  })

  it('returns overall null when no muscle group has any history at all (nothing meaningful to average)', () => {
    const { overall, byMuscle } = computeSessionMuscleRecovery({}, {})
    expect(byMuscle.every((m) => m.hasHistory === false)).toBe(true)
    expect(overall).toBeNull()
  })

  it('counts a muscle trained today toward the overall average via its fatigue-based pct', () => {
    const { overall, byMuscle } = computeSessionMuscleRecovery({ อก: { sets: 12, avgRpe: 9 } }, {})
    const chest = byMuscle.find((m) => m.muscleGroup === 'อก')!
    expect(chest.trainedToday).toBe(true)
    expect(chest.hasHistory).toBe(true)
    expect(overall).toBe(chest.pct) // กลุ่มอื่นไม่มีประวัติเลย ถูกกรองออกหมด เหลือแค่อกกลุ่มเดียวในค่าเฉลี่ย
  })
})
