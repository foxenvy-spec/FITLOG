import { describe, it, expect } from 'vitest'
import type { BodyMetric } from './types'
import { buildProgressTimelineSeries, computeProgressTimelineMarkers } from './progressTimeline'

function makeMetric(overrides: Partial<BodyMetric>): BodyMetric {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    user_id: 'u1',
    measured_at: '2026-07-01',
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
    ...overrides,
  } as BodyMetric
}

describe('buildProgressTimelineSeries', () => {
  it('extracts and sorts points chronologically regardless of input order', () => {
    const metrics = [
      makeMetric({ measured_at: '2026-07-10', weight_kg: 70 }),
      makeMetric({ measured_at: '2026-07-01', weight_kg: 72 }),
    ]
    const points = buildProgressTimelineSeries(metrics, 'weight')
    expect(points).toEqual([
      { date: '2026-07-01', value: 72 },
      { date: '2026-07-10', value: 70 },
    ])
  })

  it('skips entries missing the selected metric', () => {
    const metrics = [makeMetric({ measured_at: '2026-07-01', weight_kg: 70, body_fat_pct: null })]
    expect(buildProgressTimelineSeries(metrics, 'bodyFatPct')).toEqual([])
  })

  it('prefers skeletal_muscle_kg over muscle_kg for the muscleMass metric', () => {
    const metrics = [makeMetric({ measured_at: '2026-07-01', skeletal_muscle_kg: 36, muscle_kg: 58 })]
    expect(buildProgressTimelineSeries(metrics, 'muscleMass')).toEqual([{ date: '2026-07-01', value: 36 }])
  })

  it('falls back to muscle_kg when skeletal_muscle_kg is missing', () => {
    const metrics = [makeMetric({ measured_at: '2026-07-01', muscle_kg: 58 })]
    expect(buildProgressTimelineSeries(metrics, 'muscleMass')).toEqual([{ date: '2026-07-01', value: 58 }])
  })

  it('computes BMI from weight and heightCm when both are available', () => {
    const metrics = [makeMetric({ measured_at: '2026-07-01', weight_kg: 72 })]
    const points = buildProgressTimelineSeries(metrics, 'bmi', 180)
    expect(points[0].value).toBeCloseTo(72 / 1.8 ** 2, 2)
  })

  it('omits BMI points when heightCm is not provided', () => {
    const metrics = [makeMetric({ measured_at: '2026-07-01', weight_kg: 72 })]
    expect(buildProgressTimelineSeries(metrics, 'bmi')).toEqual([])
  })
})

describe('computeProgressTimelineMarkers', () => {
  it('returns no markers when there is no data', () => {
    expect(computeProgressTimelineMarkers([], [])).toEqual([])
  })

  it('marks the day with the most total sets as the training marker', () => {
    const workouts = [
      { performed_at: '2026-07-01', sets: 10 },
      { performed_at: '2026-07-05', sets: 6 },
      { performed_at: '2026-07-05', sets: 8 },
    ]
    const markers = computeProgressTimelineMarkers([], workouts)
    expect(markers).toEqual([{ date: '2026-07-05', icon: '🏋️', label: 'เทรนหนักสุดในช่วงนี้ (14 เซ็ต)' }])
  })

  it('marks the lowest body fat point when there are at least 2 data points', () => {
    const metrics = [
      makeMetric({ measured_at: '2026-07-01', body_fat_pct: 25 }),
      makeMetric({ measured_at: '2026-07-15', body_fat_pct: 22.4 }),
    ]
    const markers = computeProgressTimelineMarkers(metrics, [])
    expect(markers).toEqual([{ date: '2026-07-15', icon: '📉', label: 'ไขมันต่ำสุดในช่วงนี้ (22.4%)' }])
  })

  it('does not mark body fat with only a single data point', () => {
    const metrics = [makeMetric({ measured_at: '2026-07-01', body_fat_pct: 25 })]
    expect(computeProgressTimelineMarkers(metrics, [])).toEqual([])
  })

  it('marks the highest muscle mass point when there are at least 2 data points', () => {
    const metrics = [
      makeMetric({ measured_at: '2026-07-01', skeletal_muscle_kg: 35 }),
      makeMetric({ measured_at: '2026-07-15', skeletal_muscle_kg: 36.2 }),
    ]
    const markers = computeProgressTimelineMarkers(metrics, [])
    expect(markers).toEqual([{ date: '2026-07-15', icon: '💪', label: 'กล้ามเนื้อสูงสุดในช่วงนี้ (36.2 kg)' }])
  })

  it('returns all 3 marker types sorted chronologically when everything is available', () => {
    const metrics = [
      makeMetric({ measured_at: '2026-07-01', body_fat_pct: 25, skeletal_muscle_kg: 35 }),
      makeMetric({ measured_at: '2026-07-15', body_fat_pct: 22 }),
      makeMetric({ measured_at: '2026-07-20', skeletal_muscle_kg: 36 }),
    ]
    const workouts = [{ performed_at: '2026-07-10', sets: 12 }]
    const markers = computeProgressTimelineMarkers(metrics, workouts)
    expect(markers.map((m) => m.date)).toEqual(['2026-07-10', '2026-07-15', '2026-07-20'])
    expect(markers.map((m) => m.icon)).toEqual(['🏋️', '📉', '💪'])
  })
})
