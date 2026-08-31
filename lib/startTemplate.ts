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
  }))

  const { error } = await supabase.from('workouts').insert(payload)
  return { error: error?.message ?? null, count: payload.length }
}
