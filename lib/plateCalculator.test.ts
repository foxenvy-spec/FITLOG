import { describe, it, expect } from 'vitest'
import { calculatePlates } from './plateCalculator'

describe('calculatePlates', () => {
  it('breaks down a clean target weight into standard kg plates per side', () => {
    // 100kg รวม, บาร์ 20kg -> เหลือ 80kg แบ่ง 2 ข้าง = 40kg/ข้าง = 25+15
    const result = calculatePlates(100, 'kg')
    expect(result.barWeight).toBe(20)
    expect(result.perSide).toEqual([
      { plate: 25, count: 1 },
      { plate: 15, count: 1 },
    ])
    expect(result.achievedWeight).toBe(100)
    expect(result.leftoverPerSide).toBe(0)
  })

  it('uses multiple plates of the same size when needed', () => {
    // 140kg รวม, บาร์ 20kg -> 60kg/ข้าง = 25+25+10
    const result = calculatePlates(140, 'kg')
    expect(result.perSide).toEqual([
      { plate: 25, count: 2 },
      { plate: 10, count: 1 },
    ])
  })

  it('never returns a target below the bar weight (clamps at bar only)', () => {
    const result = calculatePlates(10, 'kg')
    expect(result.perSide).toEqual([])
    expect(result.achievedWeight).toBe(20)
  })

  it('uses the lb plate set and 45lb bar when unit is lb', () => {
    // 135lb รวม, บาร์ 45lb -> 45lb/ข้าง = 45
    const result = calculatePlates(135, 'lb')
    expect(result.barWeight).toBe(45)
    expect(result.perSide).toEqual([{ plate: 45, count: 1 }])
    expect(result.achievedWeight).toBe(135)
  })

  it('reports a nonzero leftover when the target cannot be built exactly from the available plates', () => {
    // 63kg รวม, บาร์ 20kg -> 21.5kg/ข้าง = 20 + 1.25 เหลือ 0.25 ที่แบ่งแผ่นไม่ลงตัว
    const result = calculatePlates(63, 'kg')
    expect(result.leftoverPerSide).toBeCloseTo(0.25, 2)
    expect(result.achievedWeight).toBeLessThan(63)
  })
})
