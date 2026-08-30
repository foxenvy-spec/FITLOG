import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Workout, ProgramDay } from './types'
import {
  computeCurrentStreak,
  computeCurrentStreakDates,
  computeLongestStreak,
  computeTodayTotals,
  computeRecoveryPct,
  daysSinceLastTrained,
  recoveryStatusColor,
  recoveryTier,
  computeRecoveryReadyInHours,
  estimateCaloriesToday,
  computeVolumeTrendInsights,
  computeImbalanceInsights,
  computeMissedMuscleInsights,
  volumeStatus,
  optimalVolumeRange,
  relativeDayLabel,
  findNextProgramDay,
  getWeekRange,
  getPreviousWeekRange,
  suggestMuscleToTrain,
  recoveryRecommendationLabel,
  computeBestVolumeIncrease,
  computeGreetingContext,
  computeWorkoutMotivationLabel,
  computeTodaysRecommendation,
  computeDashboardNotifications,
  computeTrainingBalance,
  trainingBalanceInsight,
  getScheduledMuscleForDay,
  getNextScheduledMuscle,
  computeLatestPR,
  computeSessionVolumeChange,
  computeTopMuscleThisWeek,
  aggregateMuscleTrainingQuality,
  type MuscleTrainingQualityRow,
  computePlannedConsistency,
} from './dashboardStats'
import { MUSCLE_GROUPS } from './muscle-groups'

// ทุกฟังก์ชันที่อ้างอิง "วันนี้" ผ่าน todayStr()/new Date() ต้อง freeze เวลาไว้
// ไม่งั้น test จะ flaky ตามวันที่รันจริง
const FIXED_TODAY = '2026-07-18T09:00:00' // Saturday

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(FIXED_TODAY))
})

afterEach(() => {
  vi.useRealTimers()
})

function makeWorkout(overrides: Partial<Workout>): Workout {
  return {
    id: 'w1',
    user_id: 'u1',
    type: 'strength',
    performed_at: '2026-07-18',
    exercise_name: null,
    muscle_group: null,
    sets: null,
    reps: null,
    weight_kg: null,
    rpe: null,
    cardio_type: null,
    distance_km: null,
    duration_min: null,
    avg_heart_rate: null,
    cadence: null,
    calories_kcal: null,
    notes: null,
    created_at: '2026-07-18T10:00:00Z',
    ...overrides,
  }
}

describe('computeCurrentStreak', () => {
  it('returns 0 for no history', () => {
    expect(computeCurrentStreak([])).toBe(0)
  })

  it('counts consecutive days ending today', () => {
    expect(computeCurrentStreak(['2026-07-16', '2026-07-17', '2026-07-18'])).toBe(3)
  })

  it('counts consecutive days ending yesterday (still "alive")', () => {
    expect(computeCurrentStreak(['2026-07-15', '2026-07-16', '2026-07-17'])).toBe(3)
  })

  it('resets to 0 if the last workout was 2+ days ago', () => {
    expect(computeCurrentStreak(['2026-07-10', '2026-07-15', '2026-07-16'])).toBe(0)
  })

  it('stops counting at the first gap', () => {
    expect(computeCurrentStreak(['2026-07-10', '2026-07-16', '2026-07-17', '2026-07-18'])).toBe(3)
  })

  it('de-duplicates repeated dates', () => {
    expect(computeCurrentStreak(['2026-07-18', '2026-07-18', '2026-07-17'])).toBe(2)
  })

  // FIXED_TODAY = 2026-07-18 = Saturday (day 6). ฟีดแบ็ก "ดูจากตารางล่วงหน้าที่ลงไว้ วันไหนไม่มีลงคือ
  // วันพัก — Scheduled Rest Day ไม่ควรตัด Streak, Missed Workout ตัด Streak" — workoutWeekdays คือ weekday
  // ที่มี ProgramDay ตั้งไว้จริง
  describe('with workoutWeekdays (schedule-aware)', () => {
    it('a scheduled rest day (weekday not in the program) does not break the streak', () => {
      // Mon/Wed/Fri/Sat = workout days, Sun/Tue/Thu = rest — Thu 07-16 is a scheduled rest day
      const workoutWeekdays = new Set([1, 3, 5, 6])
      expect(computeCurrentStreak(['2026-07-15', '2026-07-17', '2026-07-18'], workoutWeekdays)).toBe(3)
    })

    it('missing a scheduled workout day still breaks the streak', () => {
      // Mon-Fri = workout days — Fri 07-17 was a scheduled workout day but wasn't trained
      const workoutWeekdays = new Set([1, 2, 3, 4, 5])
      expect(computeCurrentStreak(['2026-07-16'], workoutWeekdays)).toBe(0)
    })

    it('an empty schedule (no program at all) falls back to the strict/original behavior', () => {
      expect(computeCurrentStreak(['2026-07-10', '2026-07-15', '2026-07-16'], new Set())).toBe(0)
    })
  })
})

// ฟีดแบ็ก "Current Streak '1 วัน' ดูขัดกับวงกลม Timeline ที่โชว์ ✓ หลายวัน" — computeCurrentStreakDates
// ต้องคืนเฉพาะวันที่ที่อยู่ในสายโซ่ต่อเนื่อง "ปัจจุบัน" จริงๆ (ไม่ใช่ทุกวันที่เคยฝึกในสัปดาห์) และขนาดของ
// เซตต้องตรงกับ computeCurrentStreak เป๊ะๆ เสมอ (เดินสายโซ่เดียวกัน กันเลขกับจุดที่ render เพี้ยนแยกจากกัน)
describe('computeCurrentStreakDates', () => {
  it('matches computeCurrentStreak in size for a simple consecutive run', () => {
    const dates = ['2026-07-16', '2026-07-17', '2026-07-18']
    const chain = computeCurrentStreakDates(dates)
    expect(chain.size).toBe(computeCurrentStreak(dates))
    expect(chain).toEqual(new Set(['2026-07-16', '2026-07-17', '2026-07-18']))
  })

  it('excludes a trained day that is before a real gap (streak already broken)', () => {
    // trained 07-10 (isolated, gap after it) then a fresh run 07-16..07-18 — the isolated
    // 07-10 must NOT be in the current chain even though it's "trained" in the raw dates list
    const dates = ['2026-07-10', '2026-07-16', '2026-07-17', '2026-07-18']
    const chain = computeCurrentStreakDates(dates)
    expect(chain.size).toBe(3)
    expect(chain.has('2026-07-10')).toBe(false)
    expect(chain).toEqual(new Set(['2026-07-16', '2026-07-17', '2026-07-18']))
  })

  it('returns an empty set when the streak is dead', () => {
    const dates = ['2026-07-10', '2026-07-15', '2026-07-16']
    const chain = computeCurrentStreakDates(dates)
    expect(chain.size).toBe(0)
    expect(computeCurrentStreak(dates)).toBe(0)
  })

  it('a scheduled rest day is skipped over (not added, chain continues through it)', () => {
    const workoutWeekdays = new Set([1, 3, 5, 6])
    const dates = ['2026-07-15', '2026-07-17', '2026-07-18']
    const chain = computeCurrentStreakDates(dates, workoutWeekdays)
    expect(chain.size).toBe(3)
    expect(chain).toEqual(new Set(dates))
  })
})

describe('computeLongestStreak', () => {
  it('returns 0 for no history', () => {
    expect(computeLongestStreak([])).toBe(0)
  })

  it('returns 1 for a single date', () => {
    expect(computeLongestStreak(['2026-06-01'])).toBe(1)
  })

  it('finds the longest run even if it is not the most recent one', () => {
    // 5-day run in June, then a broken 2-day run in July (today's streak is 0/dead here,
    // but the longest historical run should still be 5)
    expect(
      computeLongestStreak(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-07-01', '2026-07-02'])
    ).toBe(5)
  })

  it('de-duplicates repeated dates', () => {
    expect(computeLongestStreak(['2026-06-01', '2026-06-01', '2026-06-02'])).toBe(2)
  })

  describe('with workoutWeekdays (schedule-aware)', () => {
    it('scheduled rest days do not break the run (Workout-Rest-Workout counts as one run)', () => {
      // Mon/Wed/Fri/Sat = workout days — Tue(07-14)/Thu(07-16) are scheduled rest, not gaps
      const workoutWeekdays = new Set([1, 3, 5, 6])
      expect(computeLongestStreak(['2026-07-13', '2026-07-15', '2026-07-17', '2026-07-18'], workoutWeekdays)).toBe(4)
    })

    it('missing a scheduled workout day still resets the run', () => {
      // Mon-Fri = workout days — Wed 07-15 was scheduled but skipped, splitting the run
      const workoutWeekdays = new Set([1, 2, 3, 4, 5])
      expect(computeLongestStreak(['2026-07-13', '2026-07-14', '2026-07-16', '2026-07-17'], workoutWeekdays)).toBe(2)
    })
  })
})

describe('computeTodayTotals', () => {
  it('returns zeroed totals for no workouts', () => {
    const totals = computeTodayTotals([])
    expect(totals).toEqual({ volumeKg: 0, sets: 0, durationMin: null, entryCount: 0 })
  })

  it('sums strength volume as sets * reps * weight', () => {
    const workouts = [
      makeWorkout({ sets: 3, reps: 10, weight_kg: 20 }), // 600
      makeWorkout({ sets: 4, reps: 8, weight_kg: 15 }), // 480
    ]
    expect(computeTodayTotals(workouts).volumeKg).toBe(1080)
  })

  it('ignores incomplete strength entries when computing volume', () => {
    const workouts = [makeWorkout({ sets: 3, reps: null, weight_kg: 20 })]
    expect(computeTodayTotals(workouts).volumeKg).toBe(0)
  })

  it('uses cardio duration_min when only one entry exists', () => {
    const workouts = [makeWorkout({ type: 'cardio', duration_min: 25 })]
    expect(computeTodayTotals(workouts).durationMin).toBe(25)
  })

  it('uses the max of session span and cardio duration when both apply', () => {
    const workouts = [
      makeWorkout({ type: 'cardio', duration_min: 5, created_at: '2026-07-18T08:00:00Z' }),
      makeWorkout({ type: 'strength', created_at: '2026-07-18T08:45:00Z' }),
    ]
    // session span = 45 min, cardio = 5 min -> should take 45
    expect(computeTodayTotals(workouts).durationMin).toBe(45)
  })

  it('counts every entry, strength or cardio, toward entryCount', () => {
    const workouts = [makeWorkout({ type: 'strength' }), makeWorkout({ type: 'cardio' })]
    expect(computeTodayTotals(workouts).entryCount).toBe(2)
  })
})

describe('estimateCaloriesToday', () => {
  it('returns 0 for an empty day', () => {
    expect(estimateCaloriesToday([], null, 70)).toBe(0)
  })

  it('estimates cardio calories using the exercise-specific MET when known', () => {
    const workouts = [makeWorkout({ type: 'cardio', cardio_type: 'วิ่ง', duration_min: 30 })]
    // (9.0 * 3.5 * 70 / 200) * 30 = 330.75 -> rounds to 331
    expect(estimateCaloriesToday(workouts, null, 70)).toBe(331)
  })

  it('falls back to the default MET for an unrecognized cardio type', () => {
    const workouts = [makeWorkout({ type: 'cardio', cardio_type: 'ไม่รู้จัก', duration_min: 30 })]
    // (6.0 * 3.5 * 70 / 200) * 30 = 220.5 -> Math.round rounds half-up to 221
    expect(estimateCaloriesToday(workouts, null, 70)).toBe(221)
  })

  it('falls back to default bodyweight when none is provided', () => {
    const withWeight = estimateCaloriesToday([], 20, 70)
    const withoutWeight = estimateCaloriesToday([], 20, null)
    expect(withoutWeight).toBe(withWeight) // 70kg is the documented default
  })

  it('adds strength session calories on top of cardio', () => {
    const workouts = [makeWorkout({ type: 'cardio', cardio_type: 'วิ่ง', duration_min: 10 })]
    const cardioOnly = estimateCaloriesToday(workouts, null, 70)
    const withStrength = estimateCaloriesToday(workouts, 20, 70)
    expect(withStrength).toBeGreaterThan(cardioOnly)
  })
})

describe('computeRecoveryPct (Recovery Logic)', () => {
  it('is 100% (fully recovered) when a muscle has never been trained', () => {
    expect(computeRecoveryPct(null, 'อก')).toBe(100)
  })

  it('is 0% the same day it was trained', () => {
    expect(computeRecoveryPct('2026-07-18', 'อก')).toBe(0)
  })

  it('scales linearly with the muscle-specific recovery window', () => {
    // อก window = 2 days -> 1 day since training = 50%
    expect(computeRecoveryPct('2026-07-17', 'อก')).toBe(50)
    // แขน window = 1.5 days -> 1 day since training = 67%
    expect(computeRecoveryPct('2026-07-17', 'แขน')).toBe(67)
  })

  it('clamps at 100% once fully past the recovery window', () => {
    expect(computeRecoveryPct('2026-07-01', 'อก')).toBe(100)
  })

  it('falls back to a default window for an unknown muscle group', () => {
    // unknown group defaults to 2-day window, same math as 'อก'
    expect(computeRecoveryPct('2026-07-17', 'ไม่รู้จัก')).toBe(50)
  })
})

describe('daysSinceLastTrained', () => {
  it('returns null when the muscle has never been trained', () => {
    expect(daysSinceLastTrained(null)).toBeNull()
  })

  it('returns 0 the same day it was trained', () => {
    expect(daysSinceLastTrained('2026-07-18')).toBe(0)
  })

  it('returns the raw day count regardless of any recovery window', () => {
    expect(daysSinceLastTrained('2026-07-15')).toBe(3)
  })
})

describe('recoveryStatusColor', () => {
  it('is red-orange (rest) from 0-34%', () => {
    expect(recoveryStatusColor(0)).toBe('#C96A57')
    expect(recoveryStatusColor(34)).toBe('#C96A57')
  })

  it('is orange (fire accent) from 35-64%', () => {
    expect(recoveryStatusColor(35)).toBe('#FF8A00')
    expect(recoveryStatusColor(64)).toBe('#FF8A00')
  })

  it('is amber from 65-89%', () => {
    expect(recoveryStatusColor(65)).toBe('#E8A33D')
    expect(recoveryStatusColor(89)).toBe('#E8A33D')
  })

  it('is muted green (excellent) from 90-100%', () => {
    expect(recoveryStatusColor(90)).toBe('#6CBF74')
    expect(recoveryStatusColor(100)).toBe('#6CBF74')
  })
})

describe('recoveryTier', () => {
  it('matches the example thresholds from feedback: 67% -> Good, 0% -> Rest', () => {
    expect(recoveryTier(67).labelEn).toBe('Good')
    expect(recoveryTier(0).labelEn).toBe('Rest')
  })

  it('returns matching label + color for each tier', () => {
    expect(recoveryTier(95)).toEqual({
      color: '#6CBF74',
      labelEn: 'Excellent',
      labelTh: 'ดีเยี่ยม',
      adviceTh: 'กล้ามเนื้อกลุ่มนี้พร้อมเต็มที่ เพิ่มน้ำหนักหรือ Volume ได้เลย',
    })
    expect(recoveryTier(70)).toEqual({
      color: '#E8A33D',
      labelEn: 'Good',
      labelTh: 'ดี',
      adviceTh: 'กล้ามเนื้อกลุ่มนี้ฟื้นตัวดี เล่นความหนักปกติได้',
    })
    expect(recoveryTier(40)).toEqual({
      color: '#FF8A00',
      labelEn: 'Recovering',
      labelTh: 'กำลังฟื้นตัว',
      adviceTh: 'กล้ามเนื้อกลุ่มนี้ยังฟื้นตัวไม่เต็มที่ เล่นเบาถึงปานกลางพอ',
    })
    expect(recoveryTier(10)).toEqual({
      color: '#C96A57',
      labelEn: 'Rest',
      labelTh: 'ควรพัก',
      adviceTh: 'กล้ามเนื้อกลุ่มนี้ยังล้าอยู่ แนะนำพักหรือเล่นเบามากๆ',
    })
  })

  it('each tier has a non-empty advice sentence', () => {
    ;[0, 40, 70, 95].forEach((pct) => {
      expect(recoveryTier(pct).adviceTh.length).toBeGreaterThan(0)
    })
  })
})

describe('computeRecoveryReadyInHours', () => {
  it('returns null when the muscle has never been trained (already fully recovered)', () => {
    expect(computeRecoveryReadyInHours(null, 'อก')).toBeNull()
  })

  it('counts down in hours from midnight of the last trained date', () => {
    // FIXED_TODAY = 2026-07-18T09:00, trained today -> 9h elapsed since midnight
    // อก window = 2 days = 48h -> 39h remaining
    expect(computeRecoveryReadyInHours('2026-07-18', 'อก')).toBe(39)
    // แขน window = 1.5 days = 36h, trained yesterday -> 33h elapsed -> 3h remaining
    expect(computeRecoveryReadyInHours('2026-07-17', 'แขน')).toBe(3)
  })

  it('returns null once fully past the recovery window', () => {
    expect(computeRecoveryReadyInHours('2026-07-01', 'อก')).toBeNull()
  })
})

describe('computeVolumeTrendInsights', () => {
  it('flags a muscle with a >=15% week-over-week increase', () => {
    const insights = computeVolumeTrendInsights({ อก: 12 }, { อก: 10 })
    expect(insights).toHaveLength(1)
    expect(insights[0].id).toBe('volume-อก')
  })

  it('ignores muscles below the minimum last-week sets threshold', () => {
    const insights = computeVolumeTrendInsights({ อก: 5 }, { อก: 1 })
    expect(insights).toHaveLength(0)
  })

  it('ignores muscles whose increase is below the threshold', () => {
    const insights = computeVolumeTrendInsights({ อก: 11 }, { อก: 10 })
    expect(insights).toHaveLength(0)
  })
})

describe('computeImbalanceInsights', () => {
  const muscles = ['อก', 'หลัง', 'ขา'] as const

  it('does nothing below the minimum total-sets threshold', () => {
    const insights = computeImbalanceInsights({ อก: 2, หลัง: 2, ขา: 2 }, muscles)
    expect(insights).toHaveLength(0)
  })

  it('flags a muscle trained well below the average of the others', () => {
    const insights = computeImbalanceInsights({ อก: 2, หลัง: 10, ขา: 10 }, muscles)
    expect(insights.map((i) => i.id)).toContain('imbalance-อก')
  })

  it('does not flag muscles that are reasonably close to average', () => {
    const insights = computeImbalanceInsights({ อก: 9, หลัง: 10, ขา: 10 }, muscles)
    expect(insights).toHaveLength(0)
  })
})

describe('computeMissedMuscleInsights', () => {
  it('flags a muscle group not trained within the threshold window', () => {
    const insights = computeMissedMuscleInsights({ อก: '2026-07-05' }, 7)
    expect(insights.map((i) => i.id)).toContain('missed-อก')
  })

  it('does not flag a muscle group trained recently', () => {
    const insights = computeMissedMuscleInsights({ อก: '2026-07-17' }, 7)
    expect(insights).toHaveLength(0)
  })

  it('does not flag a muscle group with no training history at all', () => {
    const insights = computeMissedMuscleInsights({ อก: null }, 7)
    expect(insights).toHaveLength(0)
  })
})

describe('volumeStatus', () => {
  it('is "met" once the weekly target is reached', () => {
    expect(volumeStatus(10, 10, 3)).toBe('met')
  })

  it('is "onTrack" when pacing at or above 80% of the prorated target', () => {
    // day 7 of 7, target 10 -> prorated = 10, 80% = 8
    expect(volumeStatus(8, 10, 7)).toBe('onTrack')
  })

  it('is "behind" when pacing below 80% of the prorated target', () => {
    expect(volumeStatus(3, 10, 7)).toBe('behind')
  })

  it('is not "behind" early in the week just because the raw total is low', () => {
    // day 1 of 7, target 14 -> prorated = 2, 80% = 1.6
    expect(volumeStatus(2, 14, 1)).toBe('onTrack')
  })

  it('is "high" once past the weekly target but under 200% of it', () => {
    expect(volumeStatus(11, 10, 7)).toBe('high')
    expect(volumeStatus(20, 10, 7)).toBe('high') // exactly 200% is still "high", not "veryHigh"
    expect(volumeStatus(16, 10, 7)).toBe('high') // ตัวอย่างจาก feedback: หลัง 16/10 (160%) ยังควรเป็น 🟡
  })

  it('is "veryHigh" once past 200% of the weekly target', () => {
    expect(volumeStatus(21, 10, 7)).toBe('veryHigh')
    expect(volumeStatus(29, 12, 7)).toBe('veryHigh') // ตัวอย่างจาก feedback: ขา 29/12 เซ็ต (241%)
  })

  it('does not misclassify a zero target as high/veryHigh (falls through to the pre-existing "met" behavior)', () => {
    expect(volumeStatus(0, 0, 3)).toBe('met')
  })
})

describe('optimalVolumeRange', () => {
  it('sets min to the target and max to 200% of it (the existing high/veryHigh boundary)', () => {
    expect(optimalVolumeRange(10)).toEqual({ min: 10, max: 20 })
  })

  it('rounds the max to the nearest whole set', () => {
    expect(optimalVolumeRange(13)).toEqual({ min: 13, max: 26 })
  })

  it('collapses to a zero-width range when the target is zero', () => {
    expect(optimalVolumeRange(0)).toEqual({ min: 0, max: 0 })
  })
})

describe('findNextProgramDay', () => {
  const days: ProgramDay[] = [
    { id: '1', user_id: 'u', day_of_week: 1, title: 'Push', created_at: '' },
    { id: '2', user_id: 'u', day_of_week: 4, title: 'Pull', created_at: '' },
  ]

  it('returns null when no program days exist', () => {
    expect(findNextProgramDay([], 1)).toBeNull()
  })

  it('finds the very next day when it is tomorrow', () => {
    const next = findNextProgramDay(days, 0) // Sunday -> Monday is day 1
    expect(next?.day.title).toBe('Push')
    expect(next?.daysAway).toBe(1)
  })

  it('wraps around to the following week if needed', () => {
    const next = findNextProgramDay(days, 4) // Thursday -> next is Monday, 4 days away
    expect(next?.day.title).toBe('Push')
    expect(next?.daysAway).toBe(4)
  })
})

describe('relativeDayLabel', () => {
  it('labels today', () => {
    expect(relativeDayLabel('2026-07-18')).toBe('วันนี้')
  })

  it('labels yesterday', () => {
    expect(relativeDayLabel('2026-07-17')).toBe('เมื่อวาน')
  })

  it('labels older dates with a day count', () => {
    expect(relativeDayLabel('2026-07-10')).toBe('8 วันที่แล้ว')
  })
})

describe('getWeekRange / getPreviousWeekRange', () => {
  it('returns a Monday-to-Sunday range containing today', () => {
    // FIXED_TODAY is Saturday 2026-07-18
    const { start, end } = getWeekRange(new Date(FIXED_TODAY))
    expect(start).toBe('2026-07-13') // Monday
    expect(end).toBe('2026-07-19') // Sunday
  })

  it('returns the immediately preceding week', () => {
    const { start, end } = getPreviousWeekRange(new Date(FIXED_TODAY))
    expect(start).toBe('2026-07-06')
    expect(end).toBe('2026-07-12')
  })

  // บั๊ก (เจอตอนไล่เช็คทั้งโปรเจค): เดิม getWeekRange คำนวณ day-of-week จาก reference.getDay() ตรงๆ ซึ่งอ่าน
  // ตาม timezone ของเครื่องที่รันโค้ด ไม่ใช่ Asia/Bangkok เหมือนจุดอื่นทั้งหมดในแอป (performed_at ทุกแถวใช้
  // todayStr() = ปฏิทินไทยเสมอ) — เคสนี้จำลองผู้ใช้ที่ device เป็น UTC: 2026-07-19T23:00Z คือ "อาทิตย์
  // 23:00 UTC" (ยังอยู่สัปดาห์ 13-19) แต่เวลาไทยตอนนั้นคือ 2026-07-20 06:00 (จันทร์เช้า — เข้าสัปดาห์ใหม่
  // 20-26 แล้ว) getWeekRange ต้องยึด "วันจริงตามปฏิทินไทย" ไม่ใช่นาฬิกาของเครื่อง
  it('anchors the week boundary to Bangkok time, not the runtime device timezone', () => {
    // ค่า reference นี้ parse เป็น "local time" ของเครื่องที่รันเทสต์ (ปกติเป็น UTC บน CI) — 23:00 น.
    // วันอาทิตย์ที่ 19 ก.ค. ตามเวลาเครื่อง = 06:00 น. วันจันทร์ที่ 20 ก.ค. ตามเวลาไทย (+7)
    const sundayLateUtc = new Date('2026-07-19T23:00:00')
    const { start, end } = getWeekRange(sundayLateUtc)
    expect(start).toBe('2026-07-20') // Monday (Bangkok calendar date) — not 07-13
    expect(end).toBe('2026-07-26')
  })
})

describe('suggestMuscleToTrain', () => {
  it('picks the muscle group with the highest recovery % (most ready to train)', () => {
    const rec = suggestMuscleToTrain({ อก: 95, ขา: 20, หลัง: 65 })
    expect(rec?.muscleGroup).toBe('อก')
    expect(rec?.pct).toBe(95)
  })

  it('returns null when there is no data', () => {
    expect(suggestMuscleToTrain({})).toBeNull()
  })

  it('prioritizes the scheduled muscle over the highest recovery % when provided', () => {
    // ทั้ง อก และ ขา ฟื้นตัว 100% เท่ากัน — ปกติจะเลือกตัวที่เจอก่อน (อก) แต่ถ้าตารางระบุว่าวันนี้คือขา
    // ต้องเลือกขาแทน ไม่ใช่อก
    const rec = suggestMuscleToTrain({ อก: 100, ขา: 100, หลัง: 33 }, 'ขา')
    expect(rec?.muscleGroup).toBe('ขา')
    expect(rec?.pct).toBe(100)
  })

  it('falls back to highest recovery % when the scheduled muscle has no recovery data', () => {
    const rec = suggestMuscleToTrain({ อก: 95, หลัง: 65 }, 'ขา')
    expect(rec?.muscleGroup).toBe('อก')
  })

  it('falls back to highest recovery % when no scheduledMuscle is given', () => {
    const rec = suggestMuscleToTrain({ อก: 95, ขา: 20 }, null)
    expect(rec?.muscleGroup).toBe('อก')
  })

  it('redirects away from the highest-recovery muscle when it is already over its weekly volume target', () => {
    // ขา Recovery 100% (สูงสุด) แต่ Volume 29/12 เกินเป้าไปแล้ว 17 เซ็ต — อก Recovery 80% ("ดี") ยังไม่ถึงเป้า
    // ควรแนะนำอกแทน ไม่ใช่ขาซ้ำ
    const rec = suggestMuscleToTrain({ ขา: 100, อก: 80 }, null, { ขา: 29, อก: 8 }, { ขา: 12, อก: 10 })
    expect(rec?.muscleGroup).toBe('อก')
  })

  it('still picks the highest-recovery under-target muscle among several ready candidates', () => {
    const rec = suggestMuscleToTrain(
      { ขา: 100, อก: 80, หลัง: 90 },
      null,
      { ขา: 29, อก: 8, หลัง: 5 },
      { ขา: 12, อก: 10, หลัง: 10 }
    )
    expect(rec?.muscleGroup).toBe('หลัง') // ทั้งอกและหลังยังไม่ถึงเป้า แต่หลัง recovery สูงกว่า
  })

  it('falls back to highest recovery overall when every ready muscle is already over target', () => {
    const rec = suggestMuscleToTrain({ ขา: 100, อก: 80 }, null, { ขา: 29, อก: 15 }, { ขา: 12, อก: 10 })
    expect(rec?.muscleGroup).toBe('ขา')
  })

  it('excludes muscles below the "Good" recovery tier from the volume-aware redirect', () => {
    // น่อง recovery 40% ("กำลังฟื้นตัว" ไม่ใช่ "ดี") แม้ Volume ยังไม่ถึงเป้า ก็ไม่ควรถูกแนะนำ
    const rec = suggestMuscleToTrain({ ขา: 100, น่อง: 40 }, null, { ขา: 29, น่อง: 0 }, { ขา: 12, น่อง: 6 })
    expect(rec?.muscleGroup).toBe('ขา')
  })

  it('overrides the scheduled muscle when it is over its weekly volume target and a better alternative exists', () => {
    // ฟีดแบ็ก "Recovery ฟื้นตัวแล้ว ≠ ควรฝึก" — ตารางบังคับวันนี้ = ขา แต่ Volume ขาเกินเป้าไปแล้ว 17 เซ็ต
    // อกยังไม่ถึงเป้าและ recovery ดีพอ ควรแนะนำอกแทน พร้อมบันทึกไว้ว่าตารางเดิมคือขา
    const rec = suggestMuscleToTrain({ ขา: 100, อก: 80 }, 'ขา', { ขา: 29, อก: 8 }, { ขา: 12, อก: 10 })
    expect(rec?.muscleGroup).toBe('อก')
    expect(rec?.scheduleOverriddenFrom).toBe('ขา')
  })

  it('keeps the scheduled muscle when it is over target but no better alternative exists', () => {
    // อกก็เกินเป้าเหมือนกัน ไม่มีทางเลือกที่ดีกว่า ต้องตกกลับไปแนะนำตามตารางเดิม (ไม่แนะนำอะไรเลยแย่กว่า)
    const rec = suggestMuscleToTrain({ ขา: 100, อก: 80 }, 'ขา', { ขา: 29, อก: 15 }, { ขา: 12, อก: 10 })
    expect(rec?.muscleGroup).toBe('ขา')
    expect(rec?.scheduleOverriddenFrom).toBeUndefined()
  })

  it('does not override the scheduled muscle when it is still under its weekly volume target', () => {
    const rec = suggestMuscleToTrain({ ขา: 100, อก: 80 }, 'ขา', { ขา: 8, อก: 8 }, { ขา: 12, อก: 10 })
    expect(rec?.muscleGroup).toBe('ขา')
    expect(rec?.scheduleOverriddenFrom).toBeUndefined()
  })

  it('does not check volume when setsByMuscle/targetsByMuscle are not provided (backward compatible)', () => {
    const rec = suggestMuscleToTrain({ ขา: 100, อก: 80 }, 'ขา')
    expect(rec?.muscleGroup).toBe('ขา')
    expect(rec?.scheduleOverriddenFrom).toBeUndefined()
  })

  it('ignores volume data entirely when no scheduledMuscle is given and it matches the top pick anyway', () => {
    const rec = suggestMuscleToTrain({ ขา: 100, อก: 80 }, null)
    expect(rec?.muscleGroup).toBe('ขา')
  })

  it('flags lowRecoveryCaution when the scheduled muscle is still under target but recovery is low', () => {
    // Recommendation Engine decision table เคสที่ 3: ขา Recovery 50%, Volume 8/12 (ยังไม่ถึงเป้า) — ยังแนะนำ
    // ขาตามตาราง แต่ต้องติดธงเตือนว่า recovery ยังไม่พอ
    const rec = suggestMuscleToTrain({ ขา: 50 }, 'ขา', { ขา: 8 }, { ขา: 12 })
    expect(rec?.muscleGroup).toBe('ขา')
    expect(rec?.lowRecoveryCaution).toBe(true)
  })

  it('does not flag lowRecoveryCaution when the scheduled muscle is well recovered', () => {
    const rec = suggestMuscleToTrain({ ขา: 80 }, 'ขา', { ขา: 8 }, { ขา: 12 })
    expect(rec?.lowRecoveryCaution).toBeUndefined()
  })

  it('does not flag lowRecoveryCaution on a schedule-override pick (the alternative is always well recovered)', () => {
    const rec = suggestMuscleToTrain({ ขา: 100, อก: 80 }, 'ขา', { ขา: 29, อก: 8 }, { ขา: 12, อก: 10 })
    expect(rec?.scheduleOverriddenFrom).toBe('ขา')
    expect(rec?.lowRecoveryCaution).toBeUndefined()
  })

  it('flags lowRecoveryCaution on the free-choice fallback when every muscle is still recovering', () => {
    // ไม่มีตารางบังคับ ไม่มีกลุ่มไหน tier "ดี" ขึ้นไปเลย ตกกลับไปแนะนำ recovery สูงสุดเท่าที่มี แต่ยังต้องเตือน
    const rec = suggestMuscleToTrain({ ขา: 50, อก: 40 }, null)
    expect(rec?.muscleGroup).toBe('ขา')
    expect(rec?.lowRecoveryCaution).toBe(true)
  })
})

describe('computeTodaysRecommendation', () => {
  it('combines the recovery recommendation with weekly volume remaining for that muscle', () => {
    const rec = computeTodaysRecommendation({ muscleGroup: 'ขา', pct: 100 }, { ขา: 12 }, { ขา: 29 })
    expect(rec).toEqual({ muscleGroup: 'ขา', pct: 100, setsCurrent: 12, setsTarget: 29, setsRemaining: 17 })
  })

  it('returns a negative setsRemaining when the muscle already exceeded its weekly target', () => {
    const rec = computeTodaysRecommendation({ muscleGroup: 'อก', pct: 90 }, { อก: 15 }, { อก: 10 })
    expect(rec?.setsRemaining).toBe(-5)
  })

  it('treats missing sets/target data as zero instead of throwing', () => {
    const rec = computeTodaysRecommendation({ muscleGroup: 'หลัง', pct: 80 }, {}, {})
    expect(rec).toEqual({ muscleGroup: 'หลัง', pct: 80, setsCurrent: 0, setsTarget: 0, setsRemaining: 0 })
  })

  it('returns null when there is no base recommendation', () => {
    expect(computeTodaysRecommendation(null, { ขา: 12 }, { ขา: 29 })).toBeNull()
  })
})

const baseNotificationParams = {
  scheduledWorkoutTitle: null as string | null,
  todayCompleted: false,
  recommendation: null as { muscleGroup: string; pct: number } | null,
  bodyFatDelta: null as number | null,
  bodyFatIsGood: null as boolean | null,
  weightRemaining: null as { value: number; unit: string } | null,
  bodyFatRemaining: null as number | null,
  latestPR: null as { exerciseName: string; weight: number; unit: string } | null,
}

describe('computeDashboardNotifications', () => {
  it('returns an empty list when nothing is actionable', () => {
    expect(computeDashboardNotifications(baseNotificationParams)).toEqual([])
  })

  it('shows a workout notification when today has a scheduled day not yet completed', () => {
    const items = computeDashboardNotifications({ ...baseNotificationParams, scheduledWorkoutTitle: 'Lower Body', todayCompleted: false })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ category: 'workout', detail: 'วันนี้ถึงวัน Lower Body', href: '/session' })
  })

  it('hides the workout notification once today is already completed', () => {
    const items = computeDashboardNotifications({ ...baseNotificationParams, scheduledWorkoutTitle: 'Lower Body', todayCompleted: true })
    expect(items).toHaveLength(0)
  })

  it('shows a recovery notification only once the recommended muscle is fully recovered (>= 90%)', () => {
    const ready = computeDashboardNotifications({ ...baseNotificationParams, recommendation: { muscleGroup: 'ขา', pct: 95 } })
    expect(ready[0]).toMatchObject({ category: 'recovery', detail: 'ขาพร้อมฝึกแล้ว', href: '/recovery' })

    const notReady = computeDashboardNotifications({ ...baseNotificationParams, recommendation: { muscleGroup: 'ขา', pct: 70 } })
    expect(notReady).toHaveLength(0)
  })

  it('shows a progress notification worded by direction', () => {
    const improving = computeDashboardNotifications({ ...baseNotificationParams, bodyFatDelta: -0.4, bodyFatIsGood: true })
    expect(improving[0]).toMatchObject({ category: 'progress', icon: '📉', detail: 'Body Fat ลดลง 0.4%', href: '/health' })

    const worsening = computeDashboardNotifications({ ...baseNotificationParams, bodyFatDelta: 0.4, bodyFatIsGood: false })
    expect(worsening[0]).toMatchObject({ category: 'progress', icon: '📈', detail: 'Body Fat เพิ่มขึ้น 0.4%' })
  })

  it('prefers weightRemaining over bodyFatRemaining for the goal notification', () => {
    const items = computeDashboardNotifications({
      ...baseNotificationParams,
      weightRemaining: { value: 7.1, unit: 'kg' },
      bodyFatRemaining: 5.1,
    })
    expect(items[0]).toMatchObject({ category: 'goal', detail: 'เหลือ 7.1 kg ถึงเป้าหมาย', href: '/health' })
  })

  it('falls back to bodyFatRemaining when there is no weight goal', () => {
    const items = computeDashboardNotifications({ ...baseNotificationParams, bodyFatRemaining: 5.1 })
    expect(items[0]).toMatchObject({ category: 'goal', detail: 'เหลือ 5.1% Body Fat ถึงเป้าหมาย' })
  })

  it('shows a PR notification linking to the exercise page', () => {
    const items = computeDashboardNotifications({
      ...baseNotificationParams,
      latestPR: { exerciseName: 'Bench Press', weight: 65, unit: 'kg' },
    })
    expect(items[0]).toMatchObject({
      category: 'pr',
      icon: '🏆',
      detail: 'Bench Press 65kg',
      href: '/exercises/Bench%20Press',
    })
  })

  it('caps at 4 items, one per category, when everything except PR is actionable at once', () => {
    const items = computeDashboardNotifications({
      scheduledWorkoutTitle: 'Lower Body',
      todayCompleted: false,
      recommendation: { muscleGroup: 'ขา', pct: 95 },
      bodyFatDelta: -0.4,
      bodyFatIsGood: true,
      weightRemaining: { value: 7.1, unit: 'kg' },
      bodyFatRemaining: null,
      latestPR: null,
    })
    expect(items).toHaveLength(4)
    expect(items.map((i) => i.category)).toEqual(['workout', 'recovery', 'progress', 'goal'])
  })

  it('caps at 5 items, one per category, when everything including PR is actionable at once', () => {
    const items = computeDashboardNotifications({
      scheduledWorkoutTitle: 'Lower Body',
      todayCompleted: false,
      recommendation: { muscleGroup: 'ขา', pct: 95 },
      bodyFatDelta: -0.4,
      bodyFatIsGood: true,
      weightRemaining: { value: 7.1, unit: 'kg' },
      bodyFatRemaining: null,
      latestPR: { exerciseName: 'Bench Press', weight: 65, unit: 'kg' },
    })
    expect(items).toHaveLength(5)
    expect(items.map((i) => i.category)).toEqual(['workout', 'recovery', 'progress', 'goal', 'pr'])
  })
})

const ALL_MUSCLES = ['อก', 'หลัง', 'ขา', 'น่อง', 'ไหล่', 'แขน', 'แกนกลางลำตัว']

describe('computeTrainingBalance', () => {
  it('returns null when there is no volume data at all', () => {
    expect(computeTrainingBalance({}, ALL_MUSCLES)).toBeNull()
  })

  it('reports no region warning when sets are evenly split across all 7 groups', () => {
    const even = { อก: 10, หลัง: 10, ขา: 10, น่อง: 10, ไหล่: 10, แขน: 10, แกนกลางลำตัว: 10 }
    const result = computeTrainingBalance(even, ALL_MUSCLES)
    expect(result?.score).toBe(100)
    expect(result?.tier).toBe('good')
    expect(result?.regionWarning).toBeNull()
  })

  it('flags lower-body skew when legs/calves take a much bigger share than their ideal (2/7)', () => {
    // ขา+น่อง กิน 60% ของเซ็ตทั้งหมด ทั้งที่อุดมคติ (2 ใน 7 กลุ่ม) ควรอยู่แค่ ~28.6%
    const legHeavy = { อก: 5, หลัง: 5, ขา: 30, น่อง: 30, ไหล่: 5, แขน: 5, แกนกลางลำตัว: 20 }
    const result = computeTrainingBalance(legHeavy, ALL_MUSCLES)
    expect(result?.regionWarning).toBe('สัดส่วนกล้ามเนื้อขา/น่องสูงกว่าฝั่งบนลำตัว')
  })

  it('flags upper-body skew when chest/back/shoulders/arms/core dominate far beyond their ideal (5/7)', () => {
    const upperHeavy = { อก: 20, หลัง: 20, ขา: 2, น่อง: 2, ไหล่: 20, แขน: 18, แกนกลางลำตัว: 18 }
    const result = computeTrainingBalance(upperHeavy, ALL_MUSCLES)
    expect(result?.regionWarning).toBe('สัดส่วนกล้ามเนื้อฝั่งบนลำตัวสูงกว่าขา/น่อง')
  })

  it('recommends the 2 groups furthest below the ideal per-group share', () => {
    const result = computeTrainingBalance({ อก: 30, หลัง: 25, ขา: 20, น่อง: 15, ไหล่: 5, แขน: 3, แกนกลางลำตัว: 2 }, ALL_MUSCLES)
    expect(result?.recommendedMuscles).toEqual(['แกนกลางลำตัว', 'แขน'])
  })

  it('exposes the actual upper/lower body % split', () => {
    const legHeavy = { อก: 5, หลัง: 5, ขา: 30, น่อง: 30, ไหล่: 5, แขน: 5, แกนกลางลำตัว: 20 }
    const result = computeTrainingBalance(legHeavy, ALL_MUSCLES)
    // upper = อก+หลัง+ไหล่+แขน+แกนกลางลำตัว = 40/100, lower = ขา+น่อง = 60/100
    expect(result?.upperPct).toBe(40)
    expect(result?.lowerPct).toBe(60)
  })
})

describe('trainingBalanceInsight', () => {
  it('returns null when balance is null', () => {
    expect(trainingBalanceInsight(null)).toBeNull()
  })

  it('returns null when balance is fine (no regionWarning)', () => {
    expect(
      trainingBalanceInsight({ score: 90, tier: 'good', regionWarning: null, recommendedMuscles: [], upperPct: 71, lowerPct: 29 })
    ).toBeNull()
  })

  it('turns a region warning into an actionable Insight card', () => {
    const insight = trainingBalanceInsight({
      score: 58,
      tier: 'ok',
      regionWarning: 'สัดส่วนกล้ามเนื้อขา/น่องสูงกว่าฝั่งบนลำตัว',
      recommendedMuscles: ['อก', 'หลัง'],
      upperPct: 40,
      lowerPct: 60,
    })
    expect(insight).toEqual({
      id: 'training-balance-region',
      kind: 'warning',
      icon: '⚖️',
      title: 'สัดส่วนกล้ามเนื้อขา/น่องสูงกว่าฝั่งบนลำตัว',
      detail: 'Training Balance 58% (ปานกลาง) — แนะนำเพิ่ม อก + หลัง สัปดาห์นี้',
    })
  })
})

describe('getScheduledMuscleForDay', () => {
  const programDays = [
    { day_of_week: 1, title: 'อก' },
    { day_of_week: 2, title: 'หลัง' },
    { day_of_week: 3, title: 'พัก' },
    { day_of_week: 4, title: 'ขา' },
  ]

  it('returns the muscle group title for the matching day', () => {
    expect(getScheduledMuscleForDay(programDays, 4, MUSCLE_GROUPS)).toBe('ขา')
  })

  it('returns null when the day title does not match a known muscle group (e.g. a rest day)', () => {
    expect(getScheduledMuscleForDay(programDays, 3, MUSCLE_GROUPS)).toBeNull()
  })

  it('returns null when there is no program day for that day_of_week', () => {
    expect(getScheduledMuscleForDay(programDays, 6, MUSCLE_GROUPS)).toBeNull()
  })

  it('returns null when there is no schedule at all', () => {
    expect(getScheduledMuscleForDay([], 4, MUSCLE_GROUPS)).toBeNull()
  })

  // ฟีดแบ็ก "AI Coach ยังบอก NEXT ทั้งที่วันนี้คือ Day 5 — Lower จริงๆ" — root cause: title matching เดิม
  // ต้องเป็นชื่อกล้ามเนื้อไทยล้วนๆ เท่านั้น ผู้ใช้จริงตั้งชื่อวันแบบบรรยาย (เช่น "Day 5 — Lower") ไม่เคย
  // ตรงเลย — muscleGroup (คำนวณจากท่าจริงของวันนั้น) ต้องมาก่อน title เสมอเมื่อมีค่า
  it('prefers muscleGroup over title matching when provided', () => {
    const days = [{ day_of_week: 4, title: 'Day 5 — Lower', muscleGroup: 'ขา' }]
    expect(getScheduledMuscleForDay(days, 4, MUSCLE_GROUPS)).toBe('ขา')
  })

  it('falls back to title matching when muscleGroup is null/undefined', () => {
    const days = [{ day_of_week: 4, title: 'ขา', muscleGroup: null }]
    expect(getScheduledMuscleForDay(days, 4, MUSCLE_GROUPS)).toBe('ขา')
  })

  it('returns null when neither muscleGroup nor title match a known muscle group', () => {
    const days = [{ day_of_week: 4, title: 'Day 5 — Lower', muscleGroup: null }]
    expect(getScheduledMuscleForDay(days, 4, MUSCLE_GROUPS)).toBeNull()
  })
})

describe('getNextScheduledMuscle', () => {
  const programDays = [
    { day_of_week: 1, title: 'อก' },
    { day_of_week: 2, title: 'หลัง' },
    { day_of_week: 3, title: 'พัก' },
    { day_of_week: 4, title: 'ขา' },
  ]

  it('finds the next day with a muscle group, skipping rest days', () => {
    // จากวันอังคาร (2) ถัดไปคือพุธ (พัก, ข้าม) แล้วพฤหัส (ขา)
    expect(getNextScheduledMuscle(programDays, 2, MUSCLE_GROUPS)).toBe('ขา')
  })

  it('wraps around the week when nothing later matches', () => {
    // จากพฤหัส (4) ไม่มีวันไหนหลังจากนี้ผูกกล้ามเนื้อไว้แล้ว วนกลับไปเจอจันทร์ (อก)
    expect(getNextScheduledMuscle(programDays, 4, MUSCLE_GROUPS)).toBe('อก')
  })

  it('returns null when no day in the schedule maps to a muscle group', () => {
    expect(getNextScheduledMuscle([{ day_of_week: 3, title: 'พัก' }], 1, MUSCLE_GROUPS)).toBeNull()
  })
})

describe('recoveryRecommendationLabel', () => {
  it('suggests today\'s training when there is no plan and nothing has been logged today', () => {
    expect(recoveryRecommendationLabel(null)).toBe('วันนี้ควรเล่น')
  })

  it('shows the completion percentage when partially through today\'s plan', () => {
    expect(recoveryRecommendationLabel(43)).toBe('🟢 วันนี้ทำได้ 43% ของเป้าหมายแล้ว\n🎯 ครั้งหน้าแนะนำเล่น')
  })

  it('reframes as a next-session suggestion once today\'s plan is fully complete', () => {
    expect(recoveryRecommendationLabel(100)).toBe('ฝึกวันนี้ไปแล้ว ✅\nครั้งหน้าแนะนำเล่น')
  })

  it('says "next time" instead of "today" when the recommendation is not actually for today', () => {
    // เช่น วันนี้ตารางกำหนดไว้แต่ยังไม่มีท่าเลย (dominantMuscleGroup = null) ระบบตกกลับไปแนะนำกล้ามเนื้อ
    // ของวันถัดไป — progressPct เป็น null เหมือนเดิม (ยังไม่ได้ทำอะไรวันนี้) แต่ isForToday=false ต้องชนะ
    expect(recoveryRecommendationLabel(null, false)).toBe('ครั้งหน้าแนะนำเล่น')
    expect(recoveryRecommendationLabel(43, false)).toBe('ครั้งหน้าแนะนำเล่น')
  })
})

describe('computeBestVolumeIncrease', () => {
  it('picks the muscle group with the highest qualifying increase', () => {
    const best = computeBestVolumeIncrease({ อก: 12, หลัง: 12 }, { อก: 10, หลัง: 6 })
    // อก: +20% (12 vs 10), หลัง: +100% (12 vs 6) — หลังชนะเพราะ % เพิ่มขึ้นมากกว่า
    expect(best?.muscleGroup).toBe('หลัง')
    expect(best?.pct).toBe(100)
  })

  it('ignores muscle groups below the last-week sets floor (too little data to trust the %)', () => {
    const best = computeBestVolumeIncrease({ อก: 4 }, { อก: 1 })
    expect(best).toBeNull()
  })

  it('ignores increases below the minimum percent threshold', () => {
    const best = computeBestVolumeIncrease({ อก: 11 }, { อก: 10 })
    expect(best).toBeNull()
  })

  it('returns null when nothing qualifies', () => {
    expect(computeBestVolumeIncrease({}, {})).toBeNull()
  })
})

describe('computeGreetingContext', () => {
  it('prioritizes today\'s scheduled workout over a volume increase', () => {
    const ctx = computeGreetingContext('Pull Day', { muscleGroup: 'อก', pct: 95 }, { muscleGroup: 'หลัง', pct: 30 })
    expect(ctx.headline).toBe('พร้อมสำหรับ Pull Day หรือยัง?')
    expect(ctx.detail).toBe('อกฟื้นตัวเต็มที่แล้ว')
  })

  it('shows the raw recovery percentage when not yet fully recovered', () => {
    const ctx = computeGreetingContext('Pull Day', { muscleGroup: 'อก', pct: 65 }, null)
    expect(ctx.detail).toBe('อกฟื้นตัวแล้ว 65%')
  })

  it('has no detail line when there is no recovery data yet', () => {
    const ctx = computeGreetingContext('Pull Day', null, null)
    expect(ctx.headline).toBe('พร้อมสำหรับ Pull Day หรือยัง?')
    expect(ctx.detail).toBeNull()
  })

  it('falls back to the volume increase when there is no scheduled day today', () => {
    const ctx = computeGreetingContext(null, { muscleGroup: 'อก', pct: 95 }, { muscleGroup: 'หลัง', pct: 18 })
    expect(ctx.headline).toBeNull()
    expect(ctx.detail).toBe('วอลุ่มสัปดาห์นี้ของคุณเพิ่มขึ้น 18% จากสัปดาห์ที่แล้ว')
  })

  it('is silent when there is nothing to say', () => {
    expect(computeGreetingContext(null, null, null)).toEqual({ headline: null, detail: null })
  })
})

describe('computeWorkoutMotivationLabel', () => {
  it('counts down the remaining workouts needed to hit the weekly goal', () => {
    expect(computeWorkoutMotivationLabel(2, 3)).toBe('อีกแค่ 1 ครั้งถึงเป้าหมาย')
  })

  it('celebrates once the goal is met', () => {
    expect(computeWorkoutMotivationLabel(3, 3)).toBe('ถึงเป้าหมายแล้ว เก่งมาก 🎉')
  })

  it('celebrates when the goal is exceeded', () => {
    expect(computeWorkoutMotivationLabel(4, 3)).toBe('ถึงเป้าหมายแล้ว เก่งมาก 🎉')
  })

  it('phrases the very first workout of the week without "แค่" since nothing has been done yet', () => {
    expect(computeWorkoutMotivationLabel(0, 3)).toBe('อีก 3 ครั้งถึงเป้าหมาย')
  })
})

describe('computeLatestPR', () => {
  it('returns the most recent weight PR across exercises', () => {
    const rows = [
      { exercise_name: 'Bench Press', weight_kg: 60, performed_at: '2026-07-01' },
      { exercise_name: 'Bench Press', weight_kg: 65, performed_at: '2026-07-10' },
      { exercise_name: 'Squat', weight_kg: 80, performed_at: '2026-07-05' },
      { exercise_name: 'Squat', weight_kg: 90, performed_at: '2026-07-15' },
    ]
    expect(computeLatestPR(rows)).toEqual({ exerciseName: 'Squat', weightKg: 90, performedAt: '2026-07-15' })
  })

  it('does not count the first-ever session of an exercise as a PR', () => {
    const rows = [{ exercise_name: 'Deadlift', weight_kg: 100, performed_at: '2026-07-01' }]
    expect(computeLatestPR(rows)).toBeNull()
  })

  it('ignores a heavier weight that is not actually a new best (already matched earlier)', () => {
    const rows = [
      { exercise_name: 'Bench Press', weight_kg: 60, performed_at: '2026-07-01' },
      { exercise_name: 'Bench Press', weight_kg: 60, performed_at: '2026-07-10' },
    ]
    expect(computeLatestPR(rows)).toBeNull()
  })

  it('returns null when there is no history', () => {
    expect(computeLatestPR([])).toBeNull()
  })
})

describe('computeSessionVolumeChange', () => {
  const today = '2026-07-18'

  it('computes the % change vs the most recent prior session of the same muscle groups', () => {
    const rows = [
      { muscle_group: 'ขา', total_volume_kg: 540, performed_at: today },
      { muscle_group: 'ขา', total_volume_kg: 500, performed_at: '2026-07-14' },
      { muscle_group: 'ขา', total_volume_kg: 400, performed_at: '2026-07-10' },
    ]
    expect(computeSessionVolumeChange(rows, ['ขา'], today)).toEqual({
      currentVolumeKg: 540,
      previousVolumeKg: 500,
      changePct: 8,
    })
  })

  it('sums volume across all muscle groups passed in (e.g. a multi-muscle "Upper Body" session)', () => {
    const rows = [
      { muscle_group: 'อก', total_volume_kg: 200, performed_at: today },
      { muscle_group: 'ไหล่', total_volume_kg: 100, performed_at: today },
      { muscle_group: 'อก', total_volume_kg: 150, performed_at: '2026-07-11' },
      { muscle_group: 'ไหล่', total_volume_kg: 100, performed_at: '2026-07-11' },
    ]
    expect(computeSessionVolumeChange(rows, ['อก', 'ไหล่'], today)).toEqual({
      currentVolumeKg: 300,
      previousVolumeKg: 250,
      changePct: 20,
    })
  })

  it('ignores muscle groups not in the list', () => {
    const rows = [
      { muscle_group: 'ขา', total_volume_kg: 540, performed_at: today },
      { muscle_group: 'อก', total_volume_kg: 999, performed_at: '2026-07-14' },
      { muscle_group: 'ขา', total_volume_kg: 500, performed_at: '2026-07-10' },
    ]
    expect(computeSessionVolumeChange(rows, ['ขา'], today)?.previousVolumeKg).toBe(500)
  })

  it('returns null when there is no volume logged today for these muscle groups', () => {
    const rows = [{ muscle_group: 'ขา', total_volume_kg: 500, performed_at: '2026-07-10' }]
    expect(computeSessionVolumeChange(rows, ['ขา'], today)).toBeNull()
  })

  it('returns null when there is no prior session to compare against', () => {
    const rows = [{ muscle_group: 'ขา', total_volume_kg: 540, performed_at: today }]
    expect(computeSessionVolumeChange(rows, ['ขา'], today)).toBeNull()
  })

  it('returns a null changePct (but real volume numbers) when the previous session had zero volume', () => {
    const rows = [
      { muscle_group: 'ขา', total_volume_kg: 540, performed_at: today },
      { muscle_group: 'ขา', total_volume_kg: 0, performed_at: '2026-07-10' },
    ]
    expect(computeSessionVolumeChange(rows, ['ขา'], today)).toEqual({
      currentVolumeKg: 540,
      previousVolumeKg: 0,
      changePct: null,
    })
  })

  it('treats missing total_volume_kg as zero instead of throwing', () => {
    const rows = [
      { muscle_group: 'ขา', total_volume_kg: null, performed_at: today },
      { muscle_group: 'ขา', total_volume_kg: 500, performed_at: '2026-07-10' },
    ]
    expect(computeSessionVolumeChange(rows, ['ขา'], today)).toBeNull() // currentVolumeKg = 0 -> null
  })
})

describe('computeTopMuscleThisWeek', () => {
  it('picks the muscle group with the most sets this week', () => {
    expect(computeTopMuscleThisWeek({ อก: 12, ขา: 18, หลัง: 9 })).toEqual({ muscleGroup: 'ขา', sets: 18 })
  })

  it('returns null when nothing has been trained this week', () => {
    expect(computeTopMuscleThisWeek({})).toBeNull()
    expect(computeTopMuscleThisWeek({ อก: 0 })).toBeNull()
  })
})

describe('aggregateMuscleTrainingQuality', () => {
  function makeRow(overrides: Partial<MuscleTrainingQualityRow>): MuscleTrainingQualityRow {
    return {
      muscle_group: 'อก',
      sets: 3,
      reps: 10,
      weight_kg: 20,
      total_volume_kg: null,
      rpe: null,
      performed_at: '2026-07-14',
      ...overrides,
    }
  }

  it('sums sets and prefers total_volume_kg over sets*reps*weight_kg when present', () => {
    const result = aggregateMuscleTrainingQuality([makeRow({ total_volume_kg: 700 }), makeRow({ total_volume_kg: 500 })])
    expect(result['อก'].sets).toBe(6)
    expect(result['อก'].volumeKg).toBe(1200)
  })

  it('falls back to sets*reps*weight_kg when total_volume_kg is missing', () => {
    const result = aggregateMuscleTrainingQuality([makeRow({ sets: 3, reps: 10, weight_kg: 20, total_volume_kg: null })])
    expect(result['อก'].volumeKg).toBe(600)
  })

  it('counts sessions as the number of distinct performed_at dates', () => {
    const result = aggregateMuscleTrainingQuality([
      makeRow({ performed_at: '2026-07-14' }),
      makeRow({ performed_at: '2026-07-14' }),
      makeRow({ performed_at: '2026-07-16' }),
    ])
    expect(result['อก'].sessions).toBe(2)
  })

  it('averages rpe only across rows that have it, rounded to 1 decimal', () => {
    const result = aggregateMuscleTrainingQuality([makeRow({ rpe: 7 }), makeRow({ rpe: 8 }), makeRow({ rpe: null })])
    expect(result['อก'].avgRpe).toBe(7.5)
  })

  it('returns null avgRpe when no rows have rpe', () => {
    const result = aggregateMuscleTrainingQuality([makeRow({ rpe: null })])
    expect(result['อก'].avgRpe).toBeNull()
  })

  it('keeps groups separate and ignores rows without a muscle_group', () => {
    const result = aggregateMuscleTrainingQuality([
      makeRow({ muscle_group: 'อก', sets: 3 }),
      makeRow({ muscle_group: 'ขา', sets: 5 }),
      makeRow({ muscle_group: null, sets: 99 }),
    ])
    expect(result['อก'].sets).toBe(3)
    expect(result['ขา'].sets).toBe(5)
    expect(Object.keys(result)).toEqual(['อก', 'ขา'])
  })

  it('returns an empty object for no rows', () => {
    expect(aggregateMuscleTrainingQuality([])).toEqual({})
  })
})

describe('computePlannedConsistency', () => {
  it('returns null pct when no program is set up (no baseline to measure against)', () => {
    const result = computePlannedConsistency([{ dayOfWeek: 1, hasWorkout: true }], new Set())
    expect(result).toEqual({ plannedCount: 0, completedCount: 0, pct: null })
  })

  it('counts only planned weekdays as the denominator, matching a 3-day/week program at 100%', () => {
    // โปรแกรม จ/พ/ศ (1,3,5) — สัปดาห์นี้ทำครบทั้ง 3 วันตามแผน บวกวันอื่นที่ไม่ได้วางแผนไว้อีก 2 วัน
    // (ไม่ควรถูกนับเป็นตัวส่วน แม้จะมี log จริงก็ตาม)
    const days = [
      { dayOfWeek: 1, hasWorkout: true }, // จันทร์ ตามแผน ทำแล้ว
      { dayOfWeek: 2, hasWorkout: true }, // อังคาร ไม่ได้วางแผน แต่ log อิสระ
      { dayOfWeek: 3, hasWorkout: true }, // พุธ ตามแผน ทำแล้ว
      { dayOfWeek: 4, hasWorkout: false }, // พฤหัส ไม่ได้วางแผน
      { dayOfWeek: 5, hasWorkout: true }, // ศุกร์ ตามแผน ทำแล้ว
    ]
    const result = computePlannedConsistency(days, new Set([1, 3, 5]))
    expect(result).toEqual({ plannedCount: 3, completedCount: 3, pct: 100 })
  })

  it('counts a missed planned day against the percentage', () => {
    const days = [
      { dayOfWeek: 1, hasWorkout: true },
      { dayOfWeek: 3, hasWorkout: false },
      { dayOfWeek: 5, hasWorkout: true },
    ]
    const result = computePlannedConsistency(days, new Set([1, 3, 5]))
    expect(result).toEqual({ plannedCount: 3, completedCount: 2, pct: 67 })
  })

  it('handles a multi-week window by counting every matching weekday occurrence', () => {
    // 3 สัปดาห์, โปรแกรมวันจันทร์เท่านั้น — ควรมี plannedCount = 3 (จันทร์ 3 ครั้งในหน้าต่าง 21 วัน)
    const days = [
      { dayOfWeek: 1, hasWorkout: true },
      { dayOfWeek: 1, hasWorkout: false },
      { dayOfWeek: 1, hasWorkout: true },
    ]
    const result = computePlannedConsistency(days, new Set([1]))
    expect(result).toEqual({ plannedCount: 3, completedCount: 2, pct: 67 })
  })

  it('returns 0% when the program is set but nothing was ever trained on those days', () => {
    const days = [
      { dayOfWeek: 1, hasWorkout: false },
      { dayOfWeek: 3, hasWorkout: false },
    ]
    const result = computePlannedConsistency(days, new Set([1, 3]))
    expect(result).toEqual({ plannedCount: 2, completedCount: 0, pct: 0 })
  })
})
