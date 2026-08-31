import { describe, it, expect } from 'vitest'
import type { BodyMetric } from './types'
import { computeBodyMetricsSummary, findComparisonEntry } from './bodyMetricsSummary'

// เอนทรีเปล่า (ทุกฟิลด์ null) — ทดสอบแค่ override ฟิลด์ที่เกี่ยวข้องต่อเคส กัน object literal ยาวเป็นหน้าจอ
function emptyMetric(overrides: Partial<BodyMetric>): BodyMetric {
  return {
    id: 'id',
    user_id: 'user',
    measured_at: '2026-01-01',
    weight_kg: null,
    body_fat_pct: null,
    muscle_kg: null,
    waist_cm: null,
    chest_cm: null,
    hip_cm: null,
    arm_cm: null,
    thigh_cm: null,
    body_fat_kg: null,
    body_water_kg: null,
    inorganic_salt_kg: null,
    protein_kg: null,
    skeletal_muscle_kg: null,
    visceral_fat_grade: null,
    bmr_kcal: null,
    weight_range_low: null,
    weight_range_high: null,
    skeletal_muscle_range_low: null,
    skeletal_muscle_range_high: null,
    fat_mass_range_low: null,
    fat_mass_range_high: null,
    body_age_years: null,
    body_age_range_low: null,
    body_age_range_high: null,
    muscle_range_low: null,
    muscle_range_high: null,
    body_water_range_low: null,
    body_water_range_high: null,
    inorganic_salt_range_low: null,
    inorganic_salt_range_high: null,
    protein_range_low: null,
    protein_range_high: null,
    bone_mass_kg: null,
    bone_mass_range_low: null,
    bone_mass_range_high: null,
    notes: null,
    created_at: '2026-01-01',
    ...overrides,
  }
}

describe('computeBodyMetricsSummary — skeletalMuscleKg', () => {
  // บั๊กจริงที่พบ: การ์ด "กล้ามเนื้อ" บนแดชบอร์ดโชว์ delta -22.2kg ใน 4 เดือน ทั้งที่ผู้ใช้แค่เปลี่ยนจาก
  // บันทึกด้วย muscle_kg (กล้ามเนื้อรวม ~58kg) เป็น skeletal_muscle_kg (กล้ามเนื้อโครงร่าง ~36kg) — สอง
  // ฟิลด์นี้เป็นคนละตัวชี้วัดกันจริง (ดู comment migration 028) ไม่ควรเทียบข้ามฟิลด์กัน
  it('does not fabricate a delta when latest uses skeletal_muscle_kg but previous only has muscle_kg', () => {
    const latest = emptyMetric({ id: 'latest', measured_at: '2026-05-01', skeletal_muscle_kg: 36.1 })
    const previous = emptyMetric({ id: 'previous', measured_at: '2026-01-01', muscle_kg: 58.3 })
    const summary = computeBodyMetricsSummary([latest, previous], null)
    expect(summary.skeletalMuscleKg.value).toBe(36.1)
    expect(summary.skeletalMuscleKg.delta).toBeNull()
    expect(summary.skeletalMuscleKg.isGood).toBeNull()
  })

  it('computes a real delta when both entries have skeletal_muscle_kg', () => {
    const latest = emptyMetric({ id: 'latest', measured_at: '2026-05-01', skeletal_muscle_kg: 37 })
    const previous = emptyMetric({ id: 'previous', measured_at: '2026-04-01', skeletal_muscle_kg: 36 })
    const summary = computeBodyMetricsSummary([latest, previous], null)
    expect(summary.skeletalMuscleKg.value).toBe(37)
    expect(summary.skeletalMuscleKg.delta).toBe(1)
    expect(summary.skeletalMuscleKg.isGood).toBe(true)
  })

  it('falls back to muscle_kg for both value and delta when neither entry has skeletal_muscle_kg', () => {
    const latest = emptyMetric({ id: 'latest', measured_at: '2026-05-01', muscle_kg: 59 })
    const previous = emptyMetric({ id: 'previous', measured_at: '2026-04-01', muscle_kg: 58 })
    const summary = computeBodyMetricsSummary([latest, previous], null)
    expect(summary.skeletalMuscleKg.value).toBe(59)
    expect(summary.skeletalMuscleKg.delta).toBe(1)
  })
})

describe('findComparisonEntry', () => {
  // เรียงใหม่ -> เก่า เสมอ (measured_at desc) ตรงกับที่ query จริงส่งมา
  const entries = [
    emptyMetric({ id: 'd0', measured_at: '2026-07-30', weight_kg: 70 }), // latest
    emptyMetric({ id: 'd5', measured_at: '2026-07-25', weight_kg: 71 }), // -5 วัน
    emptyMetric({ id: 'd35', measured_at: '2026-06-25', weight_kg: 73 }), // -35 วัน
    emptyMetric({ id: 'd100', measured_at: '2026-04-21', weight_kg: 76 }), // -100 วัน (เก่าสุด)
  ]

  it('picks the newest entry at or before the target date for a 7-day window', () => {
    // เป้าหมาย 2026-07-23 — เอนทรีที่เก่ากว่าหรือเท่ากับ คือ d35 (2026-06-25) ไม่ใช่ d5 (2026-07-25, ใหม่กว่าเป้า)
    expect(findComparisonEntry(entries, 7)?.id).toBe('d35')
  })

  it('picks the closest match at or before the target date for a 30-day window', () => {
    // เป้าหมาย 2026-06-30 — d35 (06-25) เก่ากว่าเป้าหมายพอดี เป็นตัวที่ใกล้สุด
    expect(findComparisonEntry(entries, 30)?.id).toBe('d35')
  })

  it('falls back to the oldest available entry when history is shorter than the requested window', () => {
    // เป้าหมาย 90 วันก่อน = 2026-05-01 — ไม่มีเอนทรีไหนเก่าขนาดนั้นยกเว้น d100 (04-21) ซึ่งเก่ากว่าเป้าหมายอยู่แล้ว
    expect(findComparisonEntry(entries, 90)?.id).toBe('d100')
  })

  it('returns the oldest entry for "all"', () => {
    expect(findComparisonEntry(entries, 'all')?.id).toBe('d100')
  })

  it('returns null when there are fewer than 2 entries', () => {
    expect(findComparisonEntry([entries[0]], 30)).toBeNull()
    expect(findComparisonEntry([], 'all')).toBeNull()
  })
})

describe('computeBodyMetricsSummary — timeframe', () => {
  const entries = [
    emptyMetric({ id: 'latest', measured_at: '2026-07-30', weight_kg: 70 }),
    emptyMetric({ id: 'd5', measured_at: '2026-07-25', weight_kg: 71 }),
    emptyMetric({ id: 'd35', measured_at: '2026-06-25', weight_kg: 73 }),
  ]

  it('defaults to comparing against the literal previous entry when timeframe is omitted', () => {
    const summary = computeBodyMetricsSummary(entries, null)
    expect(summary.weight.delta).toBe(-1) // 70 - 71 (d5, เอนทรีก่อนหน้าจริงๆ)
  })

  it('compares against the entry closest to the selected timeframe when provided', () => {
    const summary = computeBodyMetricsSummary(entries, null, 30)
    expect(summary.weight.delta).toBe(-3) // 70 - 73 (d35, ใกล้ 30 วันที่สุด)
  })
})
