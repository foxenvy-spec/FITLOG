import { describe, it, expect } from 'vitest'
import { isGenuineMakeupSession } from './activeMakeupSession'

// 6C-1 (6A/6C audit — "schedule-override session mislabeled as makeup") — locked regression contract.
describe('isGenuineMakeupSession', () => {
  it('is NOT a makeup session when ?day= came from a recommendation override, even on a different weekday', () => {
    expect(
      isGenuineMakeupSession({ dayParam: 'day-chest', selectedDayOfWeek: 3, todayDayOfWeek: 1, source: 'recommendation' })
    ).toBe(false)
  })

  it('is still a genuine makeup session when ?day= has no source marker and the weekday differs', () => {
    expect(
      isGenuineMakeupSession({ dayParam: 'day-monday', selectedDayOfWeek: 1, todayDayOfWeek: 3, source: null })
    ).toBe(true)
  })

  it('a plain ?day=<today> is unchanged — never a makeup session regardless of source', () => {
    expect(isGenuineMakeupSession({ dayParam: 'day-today', selectedDayOfWeek: 3, todayDayOfWeek: 3, source: null })).toBe(false)
    expect(
      isGenuineMakeupSession({ dayParam: 'day-today', selectedDayOfWeek: 3, todayDayOfWeek: 3, source: 'recommendation' })
    ).toBe(false)
  })

  it('no ?day= param at all is never a makeup session', () => {
    expect(isGenuineMakeupSession({ dayParam: null, selectedDayOfWeek: 1, todayDayOfWeek: 3, source: null })).toBe(false)
  })

  it('an unrecognized source value does not accidentally suppress genuine makeup detection', () => {
    // only the exact 'recommendation' marker should suppress it — a typo'd or unrelated query param must
    // not silently break real makeup-session detection
    expect(
      isGenuineMakeupSession({ dayParam: 'day-monday', selectedDayOfWeek: 1, todayDayOfWeek: 3, source: 'something-else' })
    ).toBe(true)
  })
})
