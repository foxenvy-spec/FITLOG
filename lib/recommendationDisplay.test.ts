import { describe, it, expect } from 'vitest'
import { resolveRecommendationDisplay } from './recommendationDisplay'
import type { TodaysRecommendation } from './dashboardStats'
import type { WorkoutTemplate, WorkoutTemplateExercise } from './types'

function makeRec(overrides: Partial<TodaysRecommendation> = {}): TodaysRecommendation {
  return {
    muscleGroup: 'Core',
    pct: 80,
    setsCurrent: 6,
    setsTarget: 12,
    setsRemaining: 6,
    scheduleOverriddenFrom: null,
    lowRecoveryCaution: false,
    ...overrides,
  }
}

function makeTemplate(id: string, title: string): WorkoutTemplate {
  return { id, user_id: 'u1', title, created_at: '2026-01-01T00:00:00Z' }
}

function makeExercise(
  templateId: string,
  muscleGroup: string,
  overrides: Partial<WorkoutTemplateExercise> = {}
): WorkoutTemplateExercise {
  return {
    id: `${templateId}-${muscleGroup}-${Math.random()}`,
    template_id: templateId,
    user_id: 'u1',
    position: 0,
    exercise_name: `${muscleGroup} exercise`,
    muscle_group: muscleGroup,
    secondary_muscles: [],
    exercise_library_id: null,
    sets: 3,
    target_reps: '8-10',
    target_rir: '2',
    rest: '90s',
    default_weight_kg: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('resolveRecommendationDisplay — Recommendation Identity (ไม่ถูก template ทับ)', () => {
  it('Test 1: muscleGroup/recoveryPct มาจาก TodaysRecommendation ตรงๆ ไม่ว่าเทมเพลตที่จับคู่ได้จะเป็นกลุ่มไหน', () => {
    const rec = makeRec({ muscleGroup: 'Core', pct: 80 })
    const templates = [makeTemplate('t1', 'Lower Body — Strength A')]
    const exercisesByTemplate = {
      t1: [makeExercise('t1', 'Lower'), makeExercise('t1', 'Lower'), makeExercise('t1', 'Lower')],
    }

    const resolved = resolveRecommendationDisplay(rec, templates, exercisesByTemplate)

    expect(resolved.muscleGroup).toBe('Core')
    expect(resolved.recoveryPct).toBe(80)
    expect(resolved.setsCurrent).toBe(6)
    expect(resolved.setsTarget).toBe(12)
    expect(resolved.setsRemaining).toBe(6)
  })

  it('ไม่มีคำแนะนำเลย (rec = null) — Recommendation Identity ทุกฟิลด์เป็น null', () => {
    const templates = [makeTemplate('t1', 'Lower Body — Strength A')]
    const exercisesByTemplate = { t1: [makeExercise('t1', 'Lower')] }

    const resolved = resolveRecommendationDisplay(null, templates, exercisesByTemplate)

    expect(resolved.muscleGroup).toBeNull()
    expect(resolved.recoveryPct).toBeNull()
    expect(resolved.setsCurrent).toBeNull()
    expect(resolved.setsTarget).toBeNull()
    expect(resolved.setsRemaining).toBeNull()
  })
})

describe('resolveRecommendationDisplay — Action Identity (สิ่งที่ handleStart() จะ insert จริง)', () => {
  it('Test 2: template/exercises สะท้อนเทมเพลตที่มีท่าตรงกับ muscleGroup ได้ (count>0) จริง — แต่ exercises ที่ insert จริงคือทั้งเทมเพลต ซึ่ง dominant muscle อาจเป็นคนละกลุ่มกับคำแนะนำ', () => {
    // เทมเพลตผสม: มีท่า Core แค่ 1 ท่า (พอให้ bestTemplateFor จับคู่กับคำแนะนำ Core ได้) แต่ส่วนใหญ่
    // เป็นท่า Lower (3 ท่า) — จำลองสถานการณ์เทมเพลตที่ "แตะ" กลุ่มที่แนะนำได้ แต่เนื้อหาจริงเป็นคนละกลุ่ม
    const rec = makeRec({ muscleGroup: 'Core' })
    const mixedExercises = [
      makeExercise('t1', 'Core'),
      makeExercise('t1', 'Lower'),
      makeExercise('t1', 'Lower'),
      makeExercise('t1', 'Lower'),
    ]
    const templates = [makeTemplate('t1', 'Lower Body — Strength A')]
    const exercisesByTemplate = { t1: mixedExercises }

    const resolved = resolveRecommendationDisplay(rec, templates, exercisesByTemplate)

    expect(resolved.template?.id).toBe('t1')
    expect(resolved.exercises).toBe(mixedExercises)
    // exercises ที่ handleStart() จะ insert จริง = ทั้งเทมเพลต ไม่ใช่แค่ท่าที่ตรงกับ muscleGroup
    expect(resolved.exercises).toHaveLength(4)
  })

  it('actionLabel ใช้ชื่อเทมเพลตจริงก่อนเสมอเมื่อมี (chosen.title สูงสุด) แม้เทมเพลตนั้นจะมีท่ากลุ่มอื่นปนอยู่มากกว่า', () => {
    const rec = makeRec({ muscleGroup: 'Core' })
    const templates = [makeTemplate('t1', 'Lower Body — Strength A')]
    const exercisesByTemplate = { t1: [makeExercise('t1', 'Core'), makeExercise('t1', 'Lower'), makeExercise('t1', 'Lower')] }

    const resolved = resolveRecommendationDisplay(rec, templates, exercisesByTemplate)

    expect(resolved.actionLabel).toBe('Lower Body — Strength A')
  })

  it('ไม่มีเทมเพลตไหนจับคู่กับ muscleGroup ได้เลย — template/exercises ว่างเปล่า, actionLabel ตกไปที่ muscleGroup ของคำแนะนำ', () => {
    const templates = [makeTemplate('t1', 'Lower Body — Strength A')]
    // เทมเพลตเดียวที่มีไม่มีท่าตรงกับกลุ่มที่แนะนำเลยสักท่า
    const noMatchExercises = { t1: [makeExercise('t1', 'Lower')] }

    const resolved = resolveRecommendationDisplay(
      makeRec({ muscleGroup: 'ท่าที่ไม่มีเทมเพลตไหนตรงเลย' }),
      templates,
      noMatchExercises
    )

    expect(resolved.template).toBeNull()
    expect(resolved.exercises).toEqual([])
    expect(resolved.actionLabel).toBe('ท่าที่ไม่มีเทมเพลตไหนตรงเลย')
  })

  it('ไม่มีคำแนะนำเลย (rec = null) — ยังเลือกเทมเพลตแรกที่มีให้เริ่มได้ (พฤติกรรมเดิมก่อนแก้)', () => {
    const templates = [makeTemplate('t1', 'Full Body A'), makeTemplate('t2', 'Full Body B')]
    const exercisesByTemplate = { t1: [makeExercise('t1', 'Core')], t2: [makeExercise('t2', 'Core')] }

    const resolved = resolveRecommendationDisplay(null, templates, exercisesByTemplate)

    expect(resolved.template?.id).toBe('t1')
    expect(resolved.actionLabel).toBe('Full Body A')
  })
})

describe('resolveRecommendationDisplay — regression: Core recommendation → Lower template (บั๊ก displayMg เดิม)', () => {
  it('Test 3 — Cross-consistency: muscleGroup/recoveryPct ยังคง Core ทุกประการ ในขณะที่ template/actionLabel เป็น Lower — จำลองบั๊กเดิมที่ dominantMuscleGroup ของเทมเพลตเคยไปทับ headline', () => {
    const rec = makeRec({ muscleGroup: 'Core', pct: 42, setsCurrent: 4, setsTarget: 10, setsRemaining: 6 })
    // เทมเพลตผสม: มีท่า Core แค่ 1 ท่า (พอให้ bestTemplateFor จับคู่กับคำแนะนำ Core ได้จริง) แต่ dominant
    // muscle ของทั้งเทมเพลต (3 ท่า Lower vs 1 ท่า Core) คือ Lower — เดิม displayMg = dominantMuscleGroup(...)
    // ?? mg จะได้ 'Lower' แล้วเอาไปทับ headline/recovery% ของคำแนะนำ Core ทำให้ Coach พูดคนละกล้ามเนื้อกับ
    // Insight (ซึ่งอ่าน TodaysRecommendation ตรงๆ) — resolveRecommendationDisplay ต้องไม่ให้เกิดเหตุการณ์นี้อีก
    const mixedExercises = [
      makeExercise('t-lower', 'Core'),
      makeExercise('t-lower', 'Lower'),
      makeExercise('t-lower', 'Lower'),
      makeExercise('t-lower', 'Lower'),
    ]
    const templates = [makeTemplate('t-lower', 'Lower Body — Strength A')]
    const exercisesByTemplate = { 't-lower': mixedExercises }

    const resolved = resolveRecommendationDisplay(rec, templates, exercisesByTemplate)

    // Recommendation Identity — ต้องเป็น Core เป๊ะ (ใช้โดย headline/recovery bar ของ Coach และ
    // recommendationInsight() — ต้องพูดกล้ามเนื้อเดียวกันเสมอ ไม่ถูกเทมเพลตทับ)
    expect(resolved.muscleGroup).toBe('Core')
    expect(resolved.recoveryPct).toBe(42)

    // Action Identity — ต้องเป็นเทมเพลต Lower ที่จับคู่ได้จริง (สิ่งที่ปุ่ม "เริ่ม X" และ handleStart()
    // จะ insert จริง — ต้องอธิบายตรงกับสิ่งที่บันทึกลง Log จริง ไม่ใช่มั่วอ้างอิงกล้ามเนื้อที่ระบบ "แนะนำ")
    expect(resolved.template?.title).toBe('Lower Body — Strength A')
    expect(resolved.actionLabel).toBe('Lower Body — Strength A')
    expect(resolved.exercises).toBe(mixedExercises)

    // ยืนยัน invariant ที่ user ระบุไว้ตรงๆ: muscleGroup !== actionLabel ได้อย่างถูกต้อง เมื่อเทมเพลตที่
    // จับคู่ได้ดีที่สุดกับกลุ่มที่แนะนำ ไม่ได้โฟกัสกลุ่มนั้นเป๊ะๆ — ไม่ใช่บั๊ก ตราบใดที่ทั้งสอง field แยก
    // กันชัดเจนแบบนี้ (ไม่มี field ไหนเงียบๆ ทับอีก field หนึ่ง)
    expect(resolved.muscleGroup).not.toBe(resolved.actionLabel)
  })

  it('ผ่าน scheduleOverriddenFrom/lowRecoveryCaution จาก TodaysRecommendation ตรงๆ ไม่คำนวณซ้ำ', () => {
    const rec = makeRec({ muscleGroup: 'Core', scheduleOverriddenFrom: 'อก', lowRecoveryCaution: true })
    const templates = [makeTemplate('t1', 'Core Blast')]
    const exercisesByTemplate = { t1: [makeExercise('t1', 'Core')] }

    const resolved = resolveRecommendationDisplay(rec, templates, exercisesByTemplate)

    expect(resolved.scheduleOverriddenFrom).toBe('อก')
    expect(resolved.lowRecoveryCaution).toBe(true)
  })
})
