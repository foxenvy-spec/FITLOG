import { describe, it, expect } from 'vitest'
import { WARMUP_GUIDE, getWarmupMoves } from './warmupGuide'
import { MUSCLE_GROUPS } from './muscle-groups'

describe('WARMUP_GUIDE', () => {
  it('has at least one move for every muscle group', () => {
    MUSCLE_GROUPS.forEach((mg) => {
      expect(WARMUP_GUIDE[mg].length).toBeGreaterThan(0)
    })
  })
})

describe('getWarmupMoves', () => {
  it('returns moves for a single muscle group', () => {
    const moves = getWarmupMoves(['ขา'])
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.map((m) => m.name)).toEqual(WARMUP_GUIDE['ขา'].map((m) => m.name).slice(0, moves.length))
  })

  it('merges moves from multiple groups, prioritizing earlier groups first', () => {
    const moves = getWarmupMoves(['อก', 'ไหล่'])
    expect(moves[0].name).toBe(WARMUP_GUIDE['อก'][0].name)
  })

  it('deduplicates moves shared between groups (e.g. Arm Circles appears in both อก and ไหล่)', () => {
    const moves = getWarmupMoves(['อก', 'ไหล่'])
    const names = moves.map((m) => m.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('caps the total number of moves at 5 even across many groups', () => {
    const moves = getWarmupMoves(['อก', 'หลัง', 'ขา', 'ไหล่', 'แขน', 'แกนกลางลำตัว'])
    expect(moves.length).toBeLessThanOrEqual(5)
  })

  it('ignores unknown muscle group strings gracefully', () => {
    expect(getWarmupMoves(['ไม่มีจริง'])).toEqual([])
  })

  it('returns an empty array for an empty input', () => {
    expect(getWarmupMoves([])).toEqual([])
  })
})
