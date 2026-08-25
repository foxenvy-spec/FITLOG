import { describe, it, expect } from 'vitest'
import { trapezoidScore, higherBetterScore, lowerBetterScore, weightedAverage, progressScore, computeHealthScore } from './healthScore'
import type { BodyMetric } from './types'

function metric(overrides: Partial<BodyMetric>): BodyMetric {
  return {
    id: 'm1',
    user_id: 'u1',
    measured_at: '2026-08-24',
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
    created_at: '2026-08-24T09:00:00Z',
    ...overrides,
  }
}

describe('trapezoidScore', () => {
  it('scores 100 inside the ideal range', () => {
    expect(trapezoidScore(22, 10, 18.5, 25, 40)).toBe(100)
  })
  it('scores 0 at or beyond min/max', () => {
    expect(trapezoidScore(10, 10, 18.5, 25, 40)).toBe(0)
    expect(trapezoidScore(5, 10, 18.5, 25, 40)).toBe(0)
    expect(trapezoidScore(40, 10, 18.5, 25, 40)).toBe(0)
    expect(trapezoidScore(50, 10, 18.5, 25, 40)).toBe(0)
  })
  it('interpolates linearly between min and low', () => {
    // midpoint between min(10) and low(18.5) -> 50
    expect(trapezoidScore(14.25, 10, 18.5, 25, 40)).toBeCloseTo(50, 5)
  })
  it('interpolates linearly between high and max', () => {
    expect(trapezoidScore(32.5, 10, 18.5, 25, 40)).toBeCloseTo(50, 5)
  })
})

describe('higherBetterScore', () => {
  it('caps at 100 once at or above the good threshold, no penalty for exceeding it', () => {
    expect(higherBetterScore(30, 20, 25)).toBe(100)
    expect(higherBetterScore(25, 20, 25)).toBe(100)
    expect(higherBetterScore(1000, 20, 25)).toBe(100)
  })
  it('hits 0 at or below the floor', () => {
    expect(higherBetterScore(20, 20, 25)).toBe(0)
    expect(higherBetterScore(5, 20, 25)).toBe(0)
  })
  it('interpolates linearly between floor and good', () => {
    expect(higherBetterScore(22.5, 20, 25)).toBeCloseTo(50, 5)
  })
})

describe('lowerBetterScore', () => {
  it('caps at 100 at or below the good threshold', () => {
    expect(lowerBetterScore(5, 9, 30)).toBe(100)
    expect(lowerBetterScore(9, 9, 30)).toBe(100)
  })
  it('hits 0 at or above the ceiling', () => {
    expect(lowerBetterScore(30, 9, 30)).toBe(0)
    expect(lowerBetterScore(50, 9, 30)).toBe(0)
  })
  it('interpolates linearly between good and ceiling', () => {
    expect(lowerBetterScore(19.5, 9, 30)).toBeCloseTo(50, 5)
  })
})

describe('weightedAverage', () => {
  it('averages weighted scores', () => {
    expect(weightedAverage([{ weight: 50, score: 100 }, { weight: 50, score: 0 }])).toBe(50)
  })
  it('redistributes weight away from missing (null) components', () => {
    // only one component has data — it alone should determine the result regardless of its nominal weight
    expect(weightedAverage([{ weight: 50, score: 80 }, { weight: 50, score: null }])).toBe(80)
  })
  it('returns null when nothing has data', () => {
    expect(weightedAverage([{ weight: 50, score: null }, { weight: 50, score: null }])).toBeNull()
  })
})

describe('progressScore', () => {
  it('returns null when there is no delta to compare', () => {
    expect(progressScore(null, 'lowerBetter', 2)).toBeNull()
  })
  it('is 50 (neutral) for zero change', () => {
    expect(progressScore(0, 'lowerBetter', 2)).toBe(50)
  })
  it('scores above 50 when moving in the good direction', () => {
    expect(progressScore(-1, 'lowerBetter', 2)).toBeGreaterThan(50)
    expect(progressScore(1, 'higherBetter', 0.3)).toBeGreaterThan(50)
  })
  it('scores below 50 when moving in the bad direction', () => {
    expect(progressScore(1, 'lowerBetter', 2)).toBeLessThan(50)
  })
  it('saturates at 0/100 once the delta clears the unit magnitude', () => {
    expect(progressScore(-10, 'lowerBetter', 2)).toBe(100)
    expect(progressScore(10, 'lowerBetter', 2)).toBe(0)
  })
})

describe('computeHealthScore', () => {
  const ranges = { skeletalMuscleLow: 28, skeletalMuscleHigh: 32, muscleLow: 45, muscleHigh: 50, bodyAgeLow: 25, bodyAgeHigh: 35 }

  it('returns null when there is no current row', () => {
    expect(computeHealthScore({ row: null, prevRow: null, bmi: null, sex: 'male', ranges, weightDirection: 'lowerBetter' })).toBeNull()
  })

  it('computes an overall score and per-category breakdown from a fully-populated row', () => {
    const row = metric({ body_fat_pct: 15, visceral_fat_grade: 5, muscle_kg: 48, skeletal_muscle_kg: 30, body_age_years: 28 })
    const result = computeHealthScore({ row, prevRow: null, bmi: 22, sex: 'male', ranges, weightDirection: 'lowerBetter' })
    expect(result).not.toBeNull()
    expect(result!.overall).toBeGreaterThan(0)
    expect(result!.overall).toBeLessThanOrEqual(100)
    const titles = result!.categories.map((c) => c.title)
    expect(titles).toContain('BODY COMPOSITION')
    expect(titles).toContain('MUSCLE')
    expect(titles).toContain('METABOLIC HEALTH')
    // no prevRow -> no Progress data -> category omitted entirely, not scored as 0
    expect(titles).not.toContain('PROGRESS')
  })

  it('adds a PROGRESS category once a previous row is available', () => {
    const row = metric({ weight_kg: 70, body_fat_pct: 15, muscle_kg: 48 })
    const prevRow = metric({ weight_kg: 71, body_fat_pct: 15.5, muscle_kg: 47.8 })
    const result = computeHealthScore({ row, prevRow, bmi: 22, sex: 'male', ranges, weightDirection: 'lowerBetter' })
    expect(result!.categories.map((c) => c.title)).toContain('PROGRESS')
  })

  it('drops a whole category cleanly when none of its inputs have data (no fabricated score)', () => {
    // no visceral fat grade and no body age -> Metabolic Health has nothing to score
    const row = metric({ body_fat_pct: 15, muscle_kg: 48, skeletal_muscle_kg: 30 })
    const result = computeHealthScore({ row, prevRow: null, bmi: 22, sex: 'male', ranges, weightDirection: 'lowerBetter' })
    expect(result!.categories.map((c) => c.title)).not.toContain('METABOLIC HEALTH')
  })
})
