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

  // H-05-C (Recovery / Muscle Readiness Semantic Split) — กลุ่มที่ "ไม่ trained วันนี้" ต้องถูก tier ผ่าน
  // recoveryTier() ของ lib/dashboardStats.ts (threshold 90/65/35, ตัวเดียวกับ Dashboard/Coach/AI Coach/
  // Recovery page) ไม่ใช่ tierForPct() (75/55/30) ของไฟล์นี้ที่ยังใช้เฉพาะกลุ่ม trained วันนี้เท่านั้น —
  // pct=33 (หลัง, ฝึกล่าสุดเมื่อวาน, window 3 วัน) เป็นค่าที่สอง threshold ให้ tier ต่างกัน:
  // tierForPct(33)='orange' แต่ recoveryTier(33).labelEn='Rest' -> 'red' — ถ้า test นี้ผ่านแปลว่ากลุ่มที่
  // ไม่ trained วันนี้ถูก re-tier ผ่าน recoveryTier() จริง ไม่ใช่ tierForPct() เดิม
  it('tiers a not-trained-today muscle via recoveryTier() (90/65/35), not tierForPct() (75/55/30)', () => {
    const { byMuscle } = computeSessionMuscleRecovery({}, { หลัง: '2026-07-17' }) // ฝึกล่าสุดเมื่อวาน
    const back = byMuscle.find((m) => m.muscleGroup === 'หลัง')!
    expect(back.trainedToday).toBe(false)
    expect(back.pct).toBe(33)
    expect(tierForPct(back.pct)).toBe('orange') // ถ้ายังใช้ระบบเดิมจะได้ tier นี้
    expect(back.tier).toBe('red') // แต่ recoveryTier(33) ให้ 'Rest' -> 'red' ตามที่ contract ล็อกไว้
  })

  // สลับกัน — กลุ่มที่ trained วันนี้ต้องยังคง tierForPct() เดิมไม่เปลี่ยน แม้ pct จะตกอยู่ในช่วงเดียวกัน
  // ที่ recoveryTier() ให้ tier ต่างออกไป (pct=30: tierForPct='orange', recoveryTier='red') — พิสูจน์ว่า
  // สอง branch ใช้คนละ threshold system กันจริง ไม่ได้ merge เป็นระบบเดียวโดยไม่ตั้งใจ
  it('keeps tierForPct() (75/55/30) for a muscle trained today, unaffected by H-05-C', () => {
    const { byMuscle } = computeSessionMuscleRecovery({ อก: { sets: 7, avgRpe: 10 } }, {})
    const chest = byMuscle.find((m) => m.muscleGroup === 'อก')!
    expect(chest.trainedToday).toBe(true)
    expect(chest.pct).toBe(30)
    expect(chest.tier).toBe('orange') // tierForPct(30) — ไม่ใช่ recoveryTier(30) ซึ่งจะให้ 'red'
  })
})
