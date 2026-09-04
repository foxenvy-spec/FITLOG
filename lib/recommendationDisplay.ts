import type { TodaysRecommendation } from './dashboardStats'
import type { WorkoutTemplate, WorkoutTemplateExercise } from './types'
import { dominantMuscleGroup } from './muscle-groups'

// ฟีดแบ็ก (design review — "Recommendation Consistency", รอบที่เจอบั๊ก displayMg) — AICoachCompactCard.tsx
// เดิมใช้ตัวแปรเดียว (displayMg) ตอบ 2 คำถามที่ไม่เหมือนกัน: "ระบบแนะนำกล้ามเนื้ออะไร" (มาจาก
// TodaysRecommendation ตรงๆ) กับ "กดปุ่ม Start แล้วจะ insert ท่าของกล้ามเนื้อไหนจริง" (มาจาก dominant
// muscle ของเทมเพลตที่จับคู่ได้ดีที่สุด) — สองคำถามนี้ตอบต่างกันได้ (เช่น แนะนำ Core แต่เทมเพลตที่มีอยู่
// ใกล้เคียงที่สุดคือ Lower) เดิมเอา dominant muscle ของเทมเพลตไปทับ headline/recovery% ของคำแนะนำเอง ทำให้
// สิ่งที่การ์ดพูดว่า "แนะนำ" กับสิ่งที่ TodaysRecommendation บอกจริงๆ ไม่ตรงกัน (แล้ว Insight ที่อ่านจาก
// TodaysRecommendation ตรงๆ ก็เลยพูดคนละกล้ามเนื้อกับ Coach) — ร้ายแรงกว่านั้นคือปุ่ม "เริ่ม X" เคยใช้ชื่อ
// เดียวกับ headline ทั้งที่ exercises ที่ insert จริงมาจากเทมเพลต ไม่ใช่กล้ามเนื้อที่ headline บอก (บั๊ก
// correctness จริง ไม่ใช่แค่ UX — ข้อความสำเร็จจะอธิบายผิดว่าบันทึกอะไรลง log)
//
// ฟังก์ชันนี้แยก 2 คำตอบออกจากกันชัดเจนเป็น field คนละตัว ไม่ให้ตัวไหนทับอีกตัว:
//   - muscleGroup/recoveryPct/setsCurrent/setsTarget/setsRemaining/scheduleOverriddenFrom/lowRecoveryCaution
//     = "Recommendation Identity" คัดลอกมาจาก TodaysRecommendation ตรงๆ ทุกฟิลด์ ไม่คำนวณซ้ำ (recoveryPct
//     โดยเฉพาะ — ไม่เรียก computeRecoveryPct ซ้ำใน UI component อีก ใช้ค่าจาก recommendation engine เดียว)
//   - template/exercises/actionLabel = "Action Identity" ตอบ "กดปุ่มนี้แล้วจะเกิดอะไรขึ้นจริง" — คำนวณจาก
//     เทมเพลตที่จับคู่ท่าตรงกับ muscleGroup ได้มากที่สุด (อาจเป็นกล้ามเนื้อคนละกลุ่มกับ muscleGroup ก็ได้
//     ถ้าไม่มีเทมเพลตไหนโฟกัสกลุ่มนั้นเป๊ะๆ — legitimate ถ้า UI สื่อสารตรงไปตรงมา ไม่ใช่บั๊ก)
export interface ResolvedRecommendation {
  muscleGroup: string | null
  recoveryPct: number | null
  setsCurrent: number | null
  setsTarget: number | null
  setsRemaining: number | null
  scheduleOverriddenFrom?: string | null
  lowRecoveryCaution?: boolean
  template: WorkoutTemplate | null
  exercises: WorkoutTemplateExercise[]
  // ป้ายที่ปุ่ม "เริ่ม {actionLabel}" ควรใช้ — เลือกจากสิ่งที่ผู้ใช้จะเห็นเปิดจริงก่อนเสมอ (ชื่อเทมเพลต) ไม่ใช่
  // อนุมานจากกล้ามเนื้อ ถ้าไม่มีชื่อเทมเพลตค่อยตกไปใช้กล้ามเนื้อหลักของท่าที่จะ insert แล้วค่อยตกไปที่
  // muscleGroup ของคำแนะนำเป็นทางเลือกสุดท้าย (ไม่มีเทมเพลตให้เริ่มเลยสักท่า)
  actionLabel: string
}

// เดิมอยู่ใน AICoachCompactCard.tsx (bestTemplateFor) — ย้ายมาที่นี่เพื่อให้ resolveRecommendationDisplay
// เทสต์ได้เป็นฟังก์ชันล้วน ไม่ต้อง render component จริง
function bestTemplateFor(
  targetMuscleGroup: string,
  templates: WorkoutTemplate[],
  exercisesByTemplate: Record<string, WorkoutTemplateExercise[]>
): WorkoutTemplate | undefined {
  return templates.reduce<WorkoutTemplate | undefined>((best, t) => {
    const count = (exercisesByTemplate[t.id] ?? []).filter((ex) => ex.muscle_group === targetMuscleGroup).length
    if (count === 0) return best
    const bestCount = best
      ? (exercisesByTemplate[best.id] ?? []).filter((ex) => ex.muscle_group === targetMuscleGroup).length
      : 0
    return count > bestCount ? t : best
  }, undefined)
}

export function resolveRecommendationDisplay(
  rec: TodaysRecommendation | null,
  templates: WorkoutTemplate[],
  exercisesByTemplate: Record<string, WorkoutTemplateExercise[]>
): ResolvedRecommendation {
  // ไม่มีคำแนะนำเลย (ยังไม่เคยฝึกกลุ่มไหนเลย) — ยังให้เริ่มเทมเพลตแรกที่มีได้ (พฤติกรรมเดิมของ
  // AICoachCompactCard ก่อนแก้ ไม่เปลี่ยน) แต่ไม่มี Recommendation Identity ให้แสดง
  const chosen = rec ? bestTemplateFor(rec.muscleGroup, templates, exercisesByTemplate) : templates[0]
  const exercises = chosen ? exercisesByTemplate[chosen.id] ?? [] : []
  const actionLabel = chosen?.title ?? dominantMuscleGroup(exercises) ?? rec?.muscleGroup ?? 'ท่านี้'

  return {
    muscleGroup: rec?.muscleGroup ?? null,
    recoveryPct: rec?.pct ?? null,
    setsCurrent: rec?.setsCurrent ?? null,
    setsTarget: rec?.setsTarget ?? null,
    setsRemaining: rec?.setsRemaining ?? null,
    scheduleOverriddenFrom: rec?.scheduleOverriddenFrom,
    lowRecoveryCaution: rec?.lowRecoveryCaution,
    template: chosen ?? null,
    exercises,
    actionLabel,
  }
}
