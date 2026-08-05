import { describe, it, expect } from 'vitest'
import type { BodyMetric } from './types'
import { computeBodyMetricsSummary } from './bodyMetricsSummary'

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
