import { describe, it, expect } from 'vitest'
import { computeBmr, computeTdee } from './bmr'

describe('computeBmr', () => {
  it('computes using Mifflin-St Jeor for a man', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(computeBmr(80, 180, 30, 'male')).toBe(1780)
  })

  it('computes using Mifflin-St Jeor for a woman', () => {
    // 10*60 + 6.25*165 - 5*25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25 -> 1345
    expect(computeBmr(60, 165, 25, 'female')).toBe(1345)
  })
})

describe('computeTdee', () => {
  it('scales BMR by the activity multiplier', () => {
    expect(computeTdee(1780, 'sedentary')).toBe(2136)
    expect(computeTdee(1780, 'moderate')).toBe(2759)
  })
})
