import type { createClient } from './supabase/client'
import type { WorkoutTemplateExercise } from './types'
import { parseRangeToNumber, rirToRpe } from './importWorkoutExcel'
import { todayStr } from './weekdays'

// แยกออกมาจาก handleStart เดิมในหน้า /templates (แปลงท่าของเทมเพลตเป็นแถว workouts ของวันนี้ทันที
// แบบ "จบเซ็ต" ไปเลย ไม่ใช่แค่ตั้งเป็นแผน) — ใช้ร่วมกับปุ่ม "เริ่มทันที" ในหน้า /train (Quick Templates
// rail) ด้วย กันไม่ให้ลอจิกแปลงข้อมูล (parseRangeToNumber/rirToRpe) ซ้ำกันสองที่แล้วเพี้ยนแยกจากกันได้
export async function startTemplateAsWorkoutLog(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  exercises: WorkoutTemplateExercise[]
): Promise<{ error: string | null; count: number }> {
  if (exercises.length === 0) return { error: null, count: 0 }

  // 6F-P1 — UUID เดียวกันสำหรับทั้ง bulk insert นี้ แยกรอบ "เริ่มทันที" นี้จากรอบอื่น/producer อื่นที่
  // program_day_id เป็น null เหมือนกัน (AI quick-start, generated session, repeat session) — ดู
  // findExtraLoggedExercises() ใน lib/workoutSession.ts
  const sessionId = crypto.randomUUID()
  const payload = exercises.map((ex) => ({
    user_id: userId,
    type: 'strength' as const,
    performed_at: todayStr(),
    exercise_name: ex.exercise_name,
    muscle_group: ex.muscle_group,
    secondary_muscles: ex.secondary_muscles,
    exercise_library_id: ex.exercise_library_id,
    sets: ex.sets,
    reps: parseRangeToNumber(ex.target_reps),
    weight_kg: ex.default_weight_kg,
    rpe: rirToRpe(parseRangeToNumber(ex.target_rir)),
    notes: ex.notes,
    session_id: sessionId,
  }))

  const { error } = await supabase.from('workouts').insert(payload)
  return { error: error?.message ?? null, count: payload.length }
}
