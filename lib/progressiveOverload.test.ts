import { describe, it, expect } from 'vitest'
import { suggestNextLoad } from './progressiveOverload'

describe('suggestNextLoad', () => {
  it('returns null for bodyweight exercises (no weight to increase)', () => {
    expect(suggestNextLoad({ reps: 12, weightKg: 0 }, '8-12', 'kg')).toBeNull()
  })

  it('suggests a weight increase + bottom-of-range reps when last performance hit the top of the target range', () => {
    // ตัวอย่างเดียวกับที่ผู้ใช้ยกมา: สัปดาห์ก่อน 60kg x10, เป้า 8-10 -> วันนี้ 62.5kg x8
    const result = suggestNextLoad({ reps: 10, weightKg: 60 }, '8-10', 'kg')
    expect(result).toEqual({ weightKg: 62.5, reps: 8, increasedWeight: true })
  })

  it('suggests holding the same weight and adding one rep when still below the top of the range', () => {
    const result = suggestNextLoad({ reps: 8, weightKg: 60 }, '8-12', 'kg')
    expect(result).toEqual({ weightKg: 60, reps: 9, increasedWeight: false })
  })

  it('caps the suggested rep increase at the top of the range', () => {
    const result = suggestNextLoad({ reps: 11, weightKg: 60 }, '8-12', 'kg')
    expect(result?.reps).toBe(12)
  })

  it('uses a single target number as both min and max when target_reps has no range', () => {
    const atTarget = suggestNextLoad({ reps: 10, weightKg: 60 }, '10', 'kg')
    expect(atTarget).toEqual({ weightKg: 62.5, reps: 10, increasedWeight: true })
  })

  it('falls back to the last reps as the range when target_reps is missing', () => {
    const result = suggestNextLoad({ reps: 10, weightKg: 60 }, null, 'kg')
    expect(result).toEqual({ weightKg: 62.5, reps: 10, increasedWeight: true })
  })

  it('uses a ~5lb step (converted to kg) when the unit is lb', () => {
    const result = suggestNextLoad({ reps: 10, weightKg: 60 }, '8-10', 'lb')
    expect(result?.weightKg).toBeCloseTo(62.27, 2)
  })
})
