import { describe, it, expect } from 'vitest'
import type { Workout } from './types'
import { computePushPullBalance, pushPullInsight, computeProgressiveOverload, computeAIDailySummary, buildSkippedExerciseInsight, bodyFatTrendInsight, muscleMassTrendInsight, workoutFrequencyInsight, detectDeloadSignal, deloadInsight } from './aiCoach'

function makeWorkout(overrides: Partial<Workout>): Workout {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    user_id: 'u1',
    type: 'strength',
    performed_at: '2026-07-01',
    exercise_name: 'Bench Press',
    muscle_group: 'อก',
    sets: 3,
    reps: 8,
    weight_kg: 60,
    rpe: null,
    cardio_type: null,
    distance_km: null,
    duration_min: null,
    avg_heart_rate: null,
    cadence: null,
    calories_kcal: null,
    notes: null,
    created_at: '2026-07-01T10:00:00Z',
    ...overrides,
  }
}

describe('computePushPullBalance', () => {
  it('reports insufficient_data when either side has too few sets', () => {
    const balance = computePushPullBalance({ อก: 4, ไหล่: 0, หลัง: 8 })
    expect(balance.status).toBe('insufficient_data')
    expect(balance.ratio).toBeNull()
  })

  it('reports balanced when push and pull are within tolerance', () => {
    const balance = computePushPullBalance({ อก: 6, ไหล่: 4, หลัง: 10 })
    expect(balance.pushSets).toBe(10)
    expect(balance.pullSets).toBe(10)
    expect(balance.status).toBe('balanced')
  })

  it('reports push_dominant when push sets clearly exceed pull sets', () => {
    const balance = computePushPullBalance({ อก: 10, ไหล่: 8, หลัง: 8 })
    expect(balance.status).toBe('push_dominant')
    expect(balance.ratio).toBeGreaterThan(1)
  })

  it('reports pull_dominant when pull sets clearly exceed push sets', () => {
    const balance = computePushPullBalance({ อก: 4, ไหล่: 2, หลัง: 14 })
    expect(balance.status).toBe('pull_dominant')
    expect(balance.ratio).toBeLessThan(1)
  })
})

describe('pushPullInsight', () => {
  it('returns null when balanced', () => {
    const insight = pushPullInsight({ pushSets: 10, pullSets: 10, ratio: 1, status: 'balanced' })
    expect(insight).toBeNull()
  })

  it('returns null when data is insufficient', () => {
    const insight = pushPullInsight({ pushSets: 2, pullSets: 0, ratio: null, status: 'insufficient_data' })
    expect(insight).toBeNull()
  })

  it('returns a warning insight when push dominant', () => {
    const insight = pushPullInsight({ pushSets: 18, pullSets: 8, ratio: 2.25, status: 'push_dominant' })
    expect(insight).not.toBeNull()
    expect(insight?.kind).toBe('warning')
    expect(insight?.title).toContain('Push')
  })

  it('returns a warning insight when pull dominant', () => {
    const insight = pushPullInsight({ pushSets: 6, pullSets: 14, ratio: 0.43, status: 'pull_dominant' })
    expect(insight).not.toBeNull()
    expect(insight?.title).toContain('Pull')
  })
})

describe('computeProgressiveOverload', () => {
  it('returns null when there is no history for the exercise', () => {
    expect(computeProgressiveOverload('Bench Press', [])).toBeNull()
  })

  it('falls back to a standard weight increase when no RPE has been logged', () => {
    const entries = [makeWorkout({ performed_at: '2026-07-01', weight_kg: 60, reps: 8, rpe: null })]
    const plan = computeProgressiveOverload('Bench Press', entries)
    expect(plan?.action).toBe('increase_weight')
    expect(plan?.avgRpe).toBeNull()
    expect(plan?.targetWeight).toBe(62.5)
  })

  it('suggests increasing weight when recent RPE is low', () => {
    const entries = [
      makeWorkout({ id: 'a', performed_at: '2026-06-01', weight_kg: 60, reps: 8, rpe: 6 }),
      makeWorkout({ id: 'b', performed_at: '2026-06-08', weight_kg: 60, reps: 8, rpe: 6.5 }),
      makeWorkout({ id: 'c', performed_at: '2026-06-15', weight_kg: 60, reps: 8, rpe: 7 }),
    ]
    const plan = computeProgressiveOverload('Bench Press', entries)
    expect(plan?.action).toBe('increase_weight')
    expect(plan?.avgRpe).toBeCloseTo(6.5, 1)
    expect(plan?.targetWeight).toBe(62.5)
  })

  it('suggests increasing reps when recent RPE is moderate', () => {
    const entries = [
      makeWorkout({ id: 'a', performed_at: '2026-06-01', weight_kg: 60, reps: 8, rpe: 8 }),
      makeWorkout({ id: 'b', performed_at: '2026-06-08', weight_kg: 60, reps: 8, rpe: 8 }),
    ]
    const plan = computeProgressiveOverload('Bench Press', entries)
    expect(plan?.action).toBe('increase_reps')
    expect(plan?.targetWeight).toBe(60)
    expect(plan?.targetReps).toBe(9)
  })

  it('suggests a deload when recent RPE is consistently very high, snapped down to a loadable increment', () => {
    const entries = [
      makeWorkout({ id: 'a', performed_at: '2026-06-01', weight_kg: 60, reps: 5, rpe: 9 }),
      makeWorkout({ id: 'b', performed_at: '2026-06-08', weight_kg: 60, reps: 5, rpe: 9.5 }),
    ]
    const plan = computeProgressiveOverload('Bench Press', entries)
    expect(plan?.action).toBe('deload')
    // 60 * 0.9 = 54 ซึ่งไม่ใช่จำนวนที่ตั้งจานได้จริงเป็นทวีคูณของ 2.5kg (54/2.5 = 21.6) — ปัดลงเป็น 21*2.5
    // = 52.5 (ปัดลงเสมอ ไม่ปัดขึ้น กันไม่ให้ deload หนักเกินเป้าหมายเดิม)
    expect(plan?.targetWeight).toBe(52.5)
  })

  it('returns null instead of a suggestion when the logged weight is 0 (a bodyweight-only entry)', () => {
    const bodyweightEntries = [
      makeWorkout({ id: 'a', performed_at: '2026-06-01', weight_kg: 0, reps: 10, rpe: 7 }),
    ]
    expect(computeProgressiveOverload('Pull Up', bodyweightEntries)).toBeNull()

    const highRpeEntries = [
      makeWorkout({ id: 'a', performed_at: '2026-06-01', weight_kg: 0, reps: 10, rpe: 9.5 }),
    ]
    expect(computeProgressiveOverload('Pull Up', highRpeEntries)).toBeNull()
  })

  it('snaps a deload target down to the dumbbell increment, not the barbell one', () => {
    const entries = [
      makeWorkout({ id: 'a', exercise_name: 'Dumbbell Bench Press', performed_at: '2026-06-01', weight_kg: 22, reps: 5, rpe: 9 }),
      makeWorkout({ id: 'b', exercise_name: 'Dumbbell Bench Press', performed_at: '2026-06-08', weight_kg: 22, reps: 5, rpe: 9.5 }),
    ]
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
    const plan = computeProgressiveOverload('Dumbbell Bench Press', entries, exercises)
    // 22 * 0.9 = 19.8 -> ปัดลงตาม increment ของดัมเบล (1kg) = 19
    expect(plan?.targetWeight).toBe(19)
  })

  it('uses a smaller increment for dumbbell exercises', () => {
    const entries = [makeWorkout({ exercise_name: 'Dumbbell Bench Press', weight_kg: 20, reps: 8, rpe: 6 })]
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
    const plan = computeProgressiveOverload('Dumbbell Bench Press', entries, exercises)
    expect(plan?.targetWeight).toBe(21)
  })
})

describe('computeAIDailySummary', () => {
  it('handles missing recommendation gracefully', () => {
    const msg = computeAIDailySummary(null, { pushSets: 0, pullSets: 0, ratio: null, status: 'insufficient_data' })
    expect(msg).toContain('ยังไม่มีข้อมูล')
  })

  it('mentions the recommended muscle group and recovery percentage', () => {
    const msg = computeAIDailySummary(
      { muscleGroup: 'ขา', pct: 100 },
      { pushSets: 10, pullSets: 10, ratio: 1, status: 'balanced' }
    )
    expect(msg).toContain('ขา')
    expect(msg).toContain('100')
    expect(msg).not.toContain('ดึง')
  })

  it('appends a pull suggestion when push dominant', () => {
    const msg = computeAIDailySummary(
      { muscleGroup: 'ขา', pct: 80 },
      { pushSets: 20, pullSets: 8, ratio: 2.5, status: 'push_dominant' }
    )
    expect(msg).toContain('ดึง')
  })

  it('appends a push suggestion when pull dominant', () => {
    const msg = computeAIDailySummary(
      { muscleGroup: 'ขา', pct: 80 },
      { pushSets: 6, pullSets: 20, ratio: 0.3, status: 'pull_dominant' }
    )
    expect(msg).toContain('ดัน')
  })

  it('defaults to "วันนี้ควรเล่น" when progressPct is not passed', () => {
    const msg = computeAIDailySummary(
      { muscleGroup: 'หลัง', pct: 100 },
      { pushSets: 10, pullSets: 10, ratio: 1, status: 'balanced' }
    )
    expect(msg).toContain('วันนี้ควรเล่น หลัง')
  })

  it('reframes as a next-session suggestion when progressPct is 100', () => {
    const msg = computeAIDailySummary(
      { muscleGroup: 'หลัง', pct: 100 },
      { pushSets: 10, pullSets: 10, ratio: 1, status: 'balanced' },
      100
    )
    expect(msg).toContain('ฝึกวันนี้ไปแล้ว')
    expect(msg).toContain('ครั้งหน้าแนะนำเล่น หลัง')
    expect(msg).not.toContain('วันนี้ควรเล่น')
  })

  it('shows the completion percentage when today\'s plan is only partially done', () => {
    const msg = computeAIDailySummary(
      { muscleGroup: 'หลัง', pct: 100 },
      { pushSets: 10, pullSets: 10, ratio: 1, status: 'balanced' },
      43
    )
    expect(msg).toContain('🟢 วันนี้ทำได้ 43% ของเป้าหมายแล้ว\n🎯 ครั้งหน้าแนะนำเล่น หลัง')
  })

  it('appends the Training Balance region warning + recommended muscles when provided', () => {
    const msg = computeAIDailySummary(
      { muscleGroup: 'ขา', pct: 80 },
      { pushSets: 10, pullSets: 10, ratio: 1, status: 'balanced' },
      null,
      { score: 58, tier: 'ok', regionWarning: 'สัดส่วนกล้ามเนื้อขา/น่องสูงกว่าฝั่งบนลำตัว', recommendedMuscles: ['อก', 'หลัง'] }
    )
    expect(msg).toContain('สัดส่วนกล้ามเนื้อขา/น่องสูงกว่าฝั่งบนลำตัว')
    expect(msg).toContain('อก + หลัง')
  })

  it('omits the Training Balance clause when there is no region warning', () => {
    const msg = computeAIDailySummary(
      { muscleGroup: 'ขา', pct: 80 },
      { pushSets: 10, pullSets: 10, ratio: 1, status: 'balanced' },
      null,
      { score: 90, tier: 'good', regionWarning: null, recommendedMuscles: [] }
    )
    expect(msg).not.toContain('สัดส่วนกล้ามเนื้อ')
  })

  it('says "next time" instead of "today" when isForToday is false, even with progressPct null', () => {
    // เช่น วันนี้ตารางกำหนดไว้แต่ยังไม่มีท่าเลย ระบบตกกลับไปแนะนำกล้ามเนื้อของวันถัดไปแทน
    const msg = computeAIDailySummary(
      { muscleGroup: 'ขา', pct: 100 },
      { pushSets: 10, pullSets: 10, ratio: 1, status: 'balanced' },
      null,
      null,
      false
    )
    expect(msg).toContain('ครั้งหน้าแนะนำเล่น ขา')
    expect(msg).not.toContain('วันนี้ควรเล่น')
  })

  it('explains a schedule override when the recommended muscle replaced an over-target scheduled one', () => {
    const msg = computeAIDailySummary(
      { muscleGroup: 'อก', pct: 80, scheduleOverriddenFrom: 'ขา' },
      { pushSets: 10, pullSets: 10, ratio: 1, status: 'balanced' }
    )
    expect(msg).toContain('ตามตารางคือขา')
    expect(msg).toContain('เน้นอกแทน')
  })

  it('omits the schedule-override clause when the recommendation matches the schedule', () => {
    const msg = computeAIDailySummary(
      { muscleGroup: 'ขา', pct: 80 },
      { pushSets: 10, pullSets: 10, ratio: 1, status: 'balanced' }
    )
    expect(msg).not.toContain('ตามตารางคือ')
  })

  it('warns to ease off when the recommendation is flagged lowRecoveryCaution', () => {
    const msg = computeAIDailySummary(
      { muscleGroup: 'ขา', pct: 50, lowRecoveryCaution: true },
      { pushSets: 10, pullSets: 10, ratio: 1, status: 'balanced' }
    )
    expect(msg).toContain('ลดความหนักหรือเลื่อนออกไปก่อน')
  })

  it('omits the caution clause when the recommendation is well recovered', () => {
    const msg = computeAIDailySummary(
      { muscleGroup: 'ขา', pct: 80 },
      { pushSets: 10, pullSets: 10, ratio: 1, status: 'balanced' }
    )
    expect(msg).not.toContain('ลดความหนัก')
  })
})

describe('buildSkippedExerciseInsight', () => {
  const plan = [
    { id: 'ex-1', exercise_name: 'เบนช์เพรส', muscle_group: 'อก' },
    { id: 'ex-2', exercise_name: 'Incline Press', muscle_group: 'อก' },
    { id: 'ex-3', exercise_name: 'Fly', muscle_group: 'อก' },
  ]

  it('returns null when every planned exercise was completed', () => {
    const insight = buildSkippedExerciseInsight('Push Day', '2026-07-20', plan, new Set(['ex-1', 'ex-2', 'ex-3']))
    expect(insight).toBeNull()
  })

  it('lists the exercises that were skipped', () => {
    const insight = buildSkippedExerciseInsight('Push Day', '2026-07-20', plan, new Set(['ex-1', 'ex-2']))
    expect(insight).not.toBeNull()
    expect(insight?.title).toContain('1 ท่า')
    expect(insight?.title).toContain('Push Day')
    expect(insight?.detail).toContain('Fly')
    expect(insight?.kind).toBe('warning')
  })

  it('lists multiple skipped exercises', () => {
    const insight = buildSkippedExerciseInsight('Push Day', '2026-07-20', plan, new Set(['ex-1']))
    expect(insight?.title).toContain('2 ท่า')
    expect(insight?.detail).toContain('Incline Press')
    expect(insight?.detail).toContain('Fly')
  })
})

describe('bodyFatTrendInsight', () => {
  it('returns null when there is no previous entry to compare against', () => {
    const insight = bodyFatTrendInsight({ value: 24.2, delta: null, isGood: null }, null)
    expect(insight).toBeNull()
  })

  it('reports a positive trend when body fat % dropped', () => {
    const insight = bodyFatTrendInsight({ value: 24.2, delta: -0.8, isGood: true }, 'จากเดือนที่แล้ว')
    expect(insight).not.toBeNull()
    expect(insight?.kind).toBe('positive')
    expect(insight?.title).toBe('แนวโน้มดีขึ้น')
    expect(insight?.detail).toContain('ลดลง 0.8%')
    expect(insight?.detail).toContain('จากเดือนที่แล้ว')
  })

  it('warns when body fat % rose', () => {
    const insight = bodyFatTrendInsight({ value: 25.5, delta: 1.3, isGood: false }, 'จากสัปดาห์ที่แล้ว')
    expect(insight).not.toBeNull()
    expect(insight?.kind).toBe('warning')
    expect(insight?.detail).toContain('เพิ่มขึ้น 1.3%')
  })

  it('falls back to a generic period label when none is given', () => {
    const insight = bodyFatTrendInsight({ value: 24.2, delta: -0.5, isGood: true }, null)
    expect(insight?.detail).toContain('จากครั้งก่อน')
  })
})

describe('muscleMassTrendInsight', () => {
  it('returns null when there is no previous entry to compare against', () => {
    const insight = muscleMassTrendInsight({ value: 27.7, delta: null, isGood: null }, null, 0, 'kg')
    expect(insight).toBeNull()
  })

  it('celebrates muscle mass gains and encourages consistency', () => {
    const insight = muscleMassTrendInsight({ value: 27.7, delta: 0.8, isGood: true }, 'จากเดือนที่แล้ว', 0.8, 'kg')
    expect(insight).not.toBeNull()
    expect(insight?.kind).toBe('positive')
    expect(insight?.title).toBe('กล้ามเนื้อเพิ่มขึ้น')
    expect(insight?.detail).toContain('เพิ่มขึ้น 0.8 kg')
    expect(insight?.detail).toContain('จากเดือนที่แล้ว')
  })

  it('warns when muscle mass dropped, using the display unit passed in', () => {
    const insight = muscleMassTrendInsight({ value: 26.9, delta: -0.6, isGood: false }, 'จากสัปดาห์ที่แล้ว', -1.3, 'lb')
    expect(insight).not.toBeNull()
    expect(insight?.kind).toBe('warning')
    expect(insight?.title).toBe('กล้ามเนื้อลดลง')
    expect(insight?.detail).toContain('ลดลง 1.3 lb')
  })
})

describe('workoutFrequencyInsight', () => {
  it('returns null once the weekly goal is already met', () => {
    const insight = workoutFrequencyInsight(5, 5, 7)
    expect(insight).toBeNull()
  })

  it('returns null when there is no weekly goal set', () => {
    const insight = workoutFrequencyInsight(0, 0, 3)
    expect(insight).toBeNull()
  })

  it('returns null when still on pace for the week (prorated)', () => {
    // day 3 of 7, goal 5 -> prorated target ~2.14, done 2 is within 80% tolerance
    const insight = workoutFrequencyInsight(2, 5, 3)
    expect(insight).toBeNull()
  })

  it('warns and states remaining sessions when behind pace', () => {
    // day 7 (end of week), only 2 of 5 done — clearly behind
    const insight = workoutFrequencyInsight(2, 5, 7)
    expect(insight).not.toBeNull()
    expect(insight?.kind).toBe('warning')
    expect(insight?.title).toBe('ควรเพิ่มการฝึก')
    expect(insight?.detail).toContain('3 ครั้ง/สัปดาห์')
  })
})

describe('detectDeloadSignal', () => {
  it('flags a deload when volume has stayed elevated for 3+ consecutive weeks with no rest week', () => {
    const signal = detectDeloadSignal([1000, 1050, 1100, 1080], null)
    expect(signal.weeksElevated).toBe(4)
    expect(signal.shouldDeload).toBe(true)
    expect(signal.rationale).toContain('4 สัปดาห์')
  })

  it('does not flag a deload when a real rest week (>=30% drop) broke the streak', () => {
    // สัปดาห์ท้าย (400) ลดลง >=30% จากสัปดาห์ก่อน (1100) — นับเป็นสัปดาห์พักไปแล้ว ตัดสาย
    const signal = detectDeloadSignal([1000, 1050, 1100, 400], null)
    expect(signal.weeksElevated).toBe(1)
    expect(signal.shouldDeload).toBe(false)
  })

  it('does not flag a deload with fewer than 3 weeks of data even if all elevated', () => {
    const signal = detectDeloadSignal([1000, 1050], null)
    expect(signal.shouldDeload).toBe(false)
  })

  it('flags a deload from RPE alone even with insufficient volume history', () => {
    const signal = detectDeloadSignal([1000], 9)
    expect(signal.shouldDeload).toBe(true)
    expect(signal.rationale).toContain('RPE เฉลี่ย')
  })

  it('combines both signals in the rationale when both fire', () => {
    const signal = detectDeloadSignal([1000, 1050, 1100, 1080], 9)
    expect(signal.rationale).toContain('Volume สูงต่อเนื่อง')
    expect(signal.rationale).toContain('RPE เฉลี่ยล่าสุด')
  })

  it('returns a zeroed, non-deloading result for an empty volume history', () => {
    expect(detectDeloadSignal([], null)).toEqual({ weeksElevated: 0, avgRecentRpe: null, shouldDeload: false, rationale: '' })
  })

  // บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจครอบใหม่): เดิม loop เช็คแค่ทิศทางเดียว (curr ลดลงจาก prev) ไม่เช็คทิศตรงข้าม
  // (prev ต่ำกว่า curr มาก = prev เป็นสัปดาห์พักที่ curr เพิ่งฟื้นตัวขึ้นมาจาก) ทำให้สัปดาห์พักที่อยู่ตรงกลาง
  // (ไม่ใช่ปลายสุดของ array) ถูกนับข้ามไปเงียบๆ — เคสนี้คือสัปดาห์ที่ 5 พักไป 80% แล้วสัปดาห์ 6-7 กลับมาปกติ
  // ควรนับ weeksElevated=2 (แค่ 2 สัปดาห์หลังพัก) ไม่ใช่ 3 (ซึ่งจะข้ามสัปดาห์พักไปนับรวมผิดๆ)
  it('does not count a mid-history rest week toward the elevated streak, even after it rebounds', () => {
    const signal = detectDeloadSignal([1000, 1000, 1000, 1000, 200, 1000, 1000], null)
    expect(signal.weeksElevated).toBe(2)
    expect(signal.shouldDeload).toBe(false)
  })
})

describe('deloadInsight', () => {
  it('returns null when the signal does not call for a deload', () => {
    expect(deloadInsight({ weeksElevated: 1, avgRecentRpe: null, shouldDeload: false, rationale: '' })).toBeNull()
  })

  it('builds a warning insight with the rationale folded into the detail text', () => {
    const insight = deloadInsight({ weeksElevated: 4, avgRecentRpe: null, shouldDeload: true, rationale: 'Volume สูงต่อเนื่อง 4 สัปดาห์' })
    expect(insight?.kind).toBe('warning')
    expect(insight?.title).toBe('แนะนำ Deload Week')
    expect(insight?.detail).toContain('Volume สูงต่อเนื่อง 4 สัปดาห์')
    expect(insight?.detail).toContain('40-50%')
  })
})
