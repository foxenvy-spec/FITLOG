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
})
