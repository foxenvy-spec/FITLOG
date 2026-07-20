import { describe, it, expect } from 'vitest'
import { classifyHRZone, computeWeeklyHRZoneMinutes, HR_ZONES, DEFAULT_MAX_HEART_RATE } from './heartRate'

describe('classifyHRZone', () => {
  const maxHR = 190

  it('classifies low heart rate as zone 1', () => {
    expect(classifyHRZone(100, maxHR)).toBe('z1') // 52.6%
  })

  it('classifies mid-range heart rate as zone 2', () => {
    expect(classifyHRZone(120, maxHR)).toBe('z2') // 63.2%
  })

  it('classifies threshold heart rate as zone 4', () => {
    expect(classifyHRZone(160, maxHR)).toBe('z4') // 84.2%
  })

  it('classifies near-max heart rate as zone 5', () => {
    expect(classifyHRZone(180, maxHR)).toBe('z5') // 94.7%
  })

  it('falls back to DEFAULT_MAX_HEART_RATE when maxHeartRate is not passed', () => {
    expect(classifyHRZone(100)).toBe(classifyHRZone(100, DEFAULT_MAX_HEART_RATE))
  })

  it('never returns a zone outside HR_ZONES', () => {
    const validKeys = HR_ZONES.map((z) => z.key)
    expect(validKeys).toContain(classifyHRZone(250, maxHR)) // above 100% — should still resolve to z5
  })
})

describe('computeWeeklyHRZoneMinutes', () => {
  it('returns all-zero minutes and no sessions for an empty week', () => {
    const result = computeWeeklyHRZoneMinutes([], 190)
    expect(result.sessionsWithHR).toBe(0)
    expect(result.totalCardioSessions).toBe(0)
    HR_ZONES.forEach((z) => expect(result.minutesByZone[z.key]).toBe(0))
  })

  it('sums minutes into the correct zone per session', () => {
    const sessions = [
      { avg_heart_rate: 100, duration_min: 30 }, // z1
      { avg_heart_rate: 160, duration_min: 20 }, // z4
      { avg_heart_rate: 165, duration_min: 10 }, // z4 again — should accumulate
    ]
    const result = computeWeeklyHRZoneMinutes(sessions, 190)
    expect(result.minutesByZone.z1).toBe(30)
    expect(result.minutesByZone.z4).toBe(30)
    expect(result.sessionsWithHR).toBe(3)
    expect(result.totalCardioSessions).toBe(3)
  })

  it('skips sessions missing avg_heart_rate or duration_min but still counts them as total', () => {
    const sessions = [
      { avg_heart_rate: null, duration_min: 30 },
      { avg_heart_rate: 140, duration_min: null },
      { avg_heart_rate: 140, duration_min: 25 },
    ]
    const result = computeWeeklyHRZoneMinutes(sessions, 190)
    expect(result.sessionsWithHR).toBe(1)
    expect(result.totalCardioSessions).toBe(3)
    const totalMinutes = Object.values(result.minutesByZone).reduce((a, b) => a + b, 0)
    expect(totalMinutes).toBe(25)
  })
})
