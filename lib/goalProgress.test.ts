import { describe, it, expect } from 'vitest'
import { goalProgressLabel } from './goalProgress'

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
