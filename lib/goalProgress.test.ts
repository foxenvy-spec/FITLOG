import { describe, it, expect } from 'vitest'
import { goalProgressLabel, estimateGoalEtaWeeks } from './goalProgress'

describe('goalProgressLabel', () => {
  it('shows "เริ่มต้นเป้าหมาย" instead of "0% Progress" when there is no progress yet', () => {
    expect(goalProgressLabel(0)).toBe('เริ่มต้นเป้าหมาย')
  })

  it('shows "เริ่มต้นเป้าหมาย" for a negative pct too (clamped to 0)', () => {
    expect(goalProgressLabel(-5)).toBe('เริ่มต้นเป้าหมาย')
  })

  it('shows the rounded percentage once there is real progress', () => {
    expect(goalProgressLabel(32.4)).toBe('32% Progress')
  })

  it('caps at 100% Progress', () => {
    expect(goalProgressLabel(140)).toBe('100% Progress')
  })

  it('appends the remaining amount when provided', () => {
    expect(goalProgressLabel(32.4, '7.1 kg')).toBe('32% Progress · เหลืออีก 7.1 kg')
  })

  it('appends the remaining amount to the "just started" label too', () => {
    expect(goalProgressLabel(0, '7.1 kg')).toBe('เริ่มต้นเป้าหมาย · เหลืออีก 7.1 kg')
  })

  it('omits the remaining suffix when not provided', () => {
    expect(goalProgressLabel(32.4, null)).toBe('32% Progress')
    expect(goalProgressLabel(32.4)).toBe('32% Progress')
  })
})

describe('estimateGoalEtaWeeks', () => {
  it('returns null with fewer than 3 entries', () => {
    const entries = [
      { date: '2026-01-01', value: 80 },
      { date: '2026-01-15', value: 78 },
    ]
    expect(estimateGoalEtaWeeks(entries, 70)).toBeNull()
  })

  it('returns null when the span between earliest/latest is under 14 days', () => {
    const entries = [
      { date: '2026-01-01', value: 80 },
      { date: '2026-01-05', value: 79.5 },
      { date: '2026-01-10', value: 79 },
    ]
    expect(estimateGoalEtaWeeks(entries, 70)).toBeNull()
  })

  it('computes weeks-to-goal from the earliest/latest endpoint rate', () => {
    // losing 4kg over 28 days (4 weeks) = -1kg/week, 9kg remaining to target -> 9 weeks
    const entries = [
      { date: '2026-01-01', value: 80 },
      { date: '2026-01-15', value: 78 },
      { date: '2026-01-29', value: 76 },
    ]
    expect(estimateGoalEtaWeeks(entries, 67)).toBe(9)
  })

  it('works regardless of input order (sorts by date internally)', () => {
    const entries = [
      { date: '2026-01-29', value: 76 },
      { date: '2026-01-01', value: 80 },
      { date: '2026-01-15', value: 78 },
    ]
    expect(estimateGoalEtaWeeks(entries, 67)).toBe(9)
  })

  it('returns null when the trend moves away from the goal (e.g. weight going up while target is lower)', () => {
    const entries = [
      { date: '2026-01-01', value: 76 },
      { date: '2026-01-15', value: 77 },
      { date: '2026-01-29', value: 78 },
    ]
    expect(estimateGoalEtaWeeks(entries, 70)).toBeNull()
  })

  it('returns null when already exactly at the target', () => {
    const entries = [
      { date: '2026-01-01', value: 72 },
      { date: '2026-01-15', value: 70 },
      { date: '2026-01-29', value: 68 },
    ]
    expect(estimateGoalEtaWeeks(entries, 68)).toBeNull()
  })

  it('returns null when the rate is too slow to be a useful prediction (> 104 weeks)', () => {
    const entries = [
      { date: '2026-01-01', value: 80 },
      { date: '2026-01-15', value: 79.9 },
      { date: '2026-01-29', value: 79.8 },
    ]
    expect(estimateGoalEtaWeeks(entries, 60)).toBeNull()
  })
})
