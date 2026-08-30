import { describe, it, expect } from 'vitest'
import { suggestFitnessScoreImprovement, type FitnessScoreFactor } from './fitnessScore'

describe('suggestFitnessScoreImprovement', () => {
  it('recommends the lowest-scoring factor with data and weight', () => {
    const factors: FitnessScoreFactor[] = [
      { key: 'workout', label: 'Workout Completion', value: 90, weight: 30 },
      { key: 'streak', label: 'Streak', value: 40, weight: 20 },
      { key: 'sleep', label: 'Sleep', value: null, weight: 20 },
      { key: 'recovery', label: 'Recovery', value: 80, weight: 15 },
      { key: 'goal', label: 'Weekly Goal', value: 70, weight: 10 },
      { key: 'activity', label: 'Activity', value: 60, weight: 5 },
    ]
    const tip = suggestFitnessScoreImprovement(factors)
    expect(tip?.factorLabel).toBe('Streak')
    expect(tip?.currentValue).toBe(40)
    expect(tip?.suggestedValue).toBe(50)
  })

  it('computes the score delta using the same weighted formula as computeFitnessScore', () => {
    const factors: FitnessScoreFactor[] = [
      { key: 'a', label: 'A', value: 50, weight: 50 },
      { key: 'b', label: 'B', value: 80, weight: 50 },
    ]
    // ปัจจุบัน: (50*50 + 80*50) / 100 = 65 — ปรับ A จาก 50 -> 60 (+10): (60*50 + 80*50) / 100 = 70 -> +5
    const tip = suggestFitnessScoreImprovement(factors)
    expect(tip?.factorLabel).toBe('A')
    expect(tip?.scoreDelta).toBe(5)
  })

  it('ignores factors without data (e.g. Sleep) as improvement candidates', () => {
    const factors: FitnessScoreFactor[] = [
      { key: 'sleep', label: 'Sleep', value: null, weight: 20 },
      { key: 'workout', label: 'Workout Completion', value: 90, weight: 30 },
    ]
    const tip = suggestFitnessScoreImprovement(factors)
    expect(tip?.factorLabel).toBe('Workout Completion')
  })

  it('ignores factors with zero weight', () => {
    const factors: FitnessScoreFactor[] = [
      { key: 'ignored', label: 'Ignored', value: 10, weight: 0 },
      { key: 'workout', label: 'Workout Completion', value: 90, weight: 30 },
    ]
    const tip = suggestFitnessScoreImprovement(factors)
    expect(tip?.factorLabel).toBe('Workout Completion')
  })

  it('returns null when there are no factors with data', () => {
    const factors: FitnessScoreFactor[] = [{ key: 'sleep', label: 'Sleep', value: null, weight: 20 }]
    expect(suggestFitnessScoreImprovement(factors)).toBeNull()
  })

  it('returns null when the lowest-scoring available factor is already at 100', () => {
    const factors: FitnessScoreFactor[] = [{ key: 'workout', label: 'Workout Completion', value: 100, weight: 30 }]
    expect(suggestFitnessScoreImprovement(factors)).toBeNull()
  })

  it('caps the suggested value at 100', () => {
    const factors: FitnessScoreFactor[] = [
      { key: 'workout', label: 'Workout Completion', value: 95, weight: 30 },
      { key: 'streak', label: 'Streak', value: 40, weight: 20 },
    ]
    // สองปัจจัยนี้ workout ต่ำกว่า streak? ไม่ streak ต่ำกว่า -> เลือก streak ปกติ ไม่ชน cap
    // ทดสอบ cap แยก: ปัจจัยเดียวที่ค่าใกล้ 100
    const nearCap: FitnessScoreFactor[] = [{ key: 'workout', label: 'Workout Completion', value: 95, weight: 30 }]
    const tip = suggestFitnessScoreImprovement(nearCap)
    expect(tip?.suggestedValue).toBe(100)
  })
})
