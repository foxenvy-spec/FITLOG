import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Workout, ProgramDay } from './types'
import {
  computeCurrentStreak,
  computeCurrentStreakDates,
  computeLongestStreak,
  computeTodayTotals,
  computeRecoveryPct,
  recoveryStatusColor,
  recoveryTier,
  computeRecoveryReadyInHours,
  estimateCaloriesToday,
  suggestNextPR,
  computeVolumeTrendInsights,
  computeImbalanceInsights,
  computeMissedMuscleInsights,
  volumeStatus,
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
  computeTrainingBalance,
  trainingBalanceInsight,
  getScheduledMuscleForDay,
  getNextScheduledMuscle,
  computeLatestPR,
  computeTopMuscleThisWeek,
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

describe('suggestNextPR (PR Logic)', () => {
  it('returns null when there is no history for the exercise', () => {
    expect(suggestNextPR('Bench Press', [])).toBeNull()
  })

  it('ignores entries with no recorded weight', () => {
    const history = [makeWorkout({ exercise_name: 'Bench Press', weight_kg: null, reps: 8 })]
    expect(suggestNextPR('Bench Press', history)).toBeNull()
  })

  it('picks the heaviest recorded set as the baseline', () => {
    const history = [
      makeWorkout({ exercise_name: 'Bench Press', weight_kg: 60, reps: 8 }),
      makeWorkout({ exercise_name: 'Bench Press', weight_kg: 70, reps: 5 }),
      makeWorkout({ exercise_name: 'Bench Press', weight_kg: 65, reps: 6 }),
    ]
    const pr = suggestNextPR('Bench Press', history)
    expect(pr?.lastWeight).toBe(70)
    expect(pr?.lastReps).toBe(5)
  })

  it('suggests a +2.5kg jump for barbell exercises', () => {
    const history = [makeWorkout({ exercise_name: 'Bench Press', weight_kg: 60, reps: 8 })]
    const pr = suggestNextPR('Bench Press', history)
    expect(pr?.targetWeight).toBe(62.5)
    expect(pr?.targetReps).toBe(8)
  })

  it('suggests a smaller +1kg jump for dumbbell exercises', () => {
    const history = [makeWorkout({ exercise_name: 'Dumbbell Bench Press', weight_kg: 20, reps: 10 })]
    const exercises = [
      {
        id: 'dumbbell-bench-press',
        name: 'Dumbbell Bench Press',
        nameTh: 'ดัมเบลเบนช์เพรส',
        muscleGroup: 'อก' as const,
        secondaryMuscles: [],
        equipment: 'ดัมเบล' as const,
        icon: '🏋️',
        aliases: [],
        instructions: [],
      },
    ]
    const pr = suggestNextPR('Dumbbell Bench Press', history, exercises)
    expect(pr?.targetWeight).toBe(21)
  })

  it('ignores cardio entries even if they share an exercise_name', () => {
    const history = [makeWorkout({ type: 'cardio', exercise_name: 'Bench Press', weight_kg: 999 })]
    expect(suggestNextPR('Bench Press', history)).toBeNull()
  })

  it('defaults to the +2.5kg barbell increment for exercises not in the catalog', () => {
    const history = [makeWorkout({ exercise_name: 'ท่าที่พึ่งเพิ่มเอง', weight_kg: 40, reps: 10 })]
    const pr = suggestNextPR('ท่าที่พึ่งเพิ่มเอง', history)
    expect(pr?.targetWeight).toBe(42.5)
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
})

describe('trainingBalanceInsight', () => {
  it('returns null when balance is null', () => {
    expect(trainingBalanceInsight(null)).toBeNull()
  })

  it('returns null when balance is fine (no regionWarning)', () => {
    expect(trainingBalanceInsight({ score: 90, tier: 'good', regionWarning: null, recommendedMuscles: [] })).toBeNull()
  })

  it('turns a region warning into an actionable Insight card', () => {
    const insight = trainingBalanceInsight({
      score: 58,
      tier: 'ok',
      regionWarning: 'สัดส่วนกล้ามเนื้อขา/น่องสูงกว่าฝั่งบนลำตัว',
      recommendedMuscles: ['อก', 'หลัง'],
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

describe('computeTopMuscleThisWeek', () => {
  it('picks the muscle group with the most sets this week', () => {
    expect(computeTopMuscleThisWeek({ อก: 12, ขา: 18, หลัง: 9 })).toEqual({ muscleGroup: 'ขา', sets: 18 })
  })

  it('returns null when nothing has been trained this week', () => {
    expect(computeTopMuscleThisWeek({})).toBeNull()
    expect(computeTopMuscleThisWeek({ อก: 0 })).toBeNull()
  })
})
