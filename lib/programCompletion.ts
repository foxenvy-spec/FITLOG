import type { SupabaseClient } from '@supabase/supabase-js'

// 6F-P5 (P1 — Completion Provenance Integrity) — completion เป็น semantic event คนละอันจาก workout
// persistence (P2's persist_exercise_sets ยังคงทำหน้าที่แค่ workouts/workout_sets เท่านั้น ไม่แตะ
// program_completions เลย) โมดูลนี้รวมทุก write/reconcile ของ program_completions +
// program_completion_overrides ไว้ที่เดียว ให้ทั้ง /session (explicit finish) และ /program (manual
// toggle, "Log to Today") เรียกใช้ชุดเดียวกัน แทนที่จะเขียน upsert/delete กระจายแยกกันเหมือนเดิม

// target ของ completion หนึ่งแถว — ตรงกับ check constraint ของ program_completions (migration 042):
// (program_exercise_id is not null) <> (workout_id is not null) เป๊ะ, exactly one of the two.
export type CompletionTarget = { programExerciseId: string } | { workoutId: string }

function isAdhocTarget(target: CompletionTarget): target is { workoutId: string } {
  return 'workoutId' in target
}

// เขียน completion แบบ "ตั้งใจ" จริงๆ — ใช้ตอนกดจบท่าใน /session (recordProgramCompletion), กดติ๊ก
// complete เองใน /program, หรือ "Log to Today" — ทุกจุดนี้คือ explicit user intent ว่า "complete แล้ว"
// เคลียร์ manual_uncomplete override ของวันเดียวกันทิ้งเสมอ (เฉพาะ target แบบ programExerciseId — ad-hoc
// ไม่มี override ให้เคลียร์ เพราะไม่มี UI ให้ manual un-complete ท่า ad-hoc เลย) เพราะ intent ล่าสุดของ
// ผู้ใช้คือ complete จริง ไม่ใช่ override เก่าที่อาจค้างมาจากการ uncheck ครั้งก่อน
//
// การเคลียร์ override เป็น best-effort โดยตั้งใจ: ถ้า completion upsert (ด้านบน) สำเร็จแล้วแต่ขั้นเคลียร์
// override พลาด ไม่ควรรายงานว่า "complete ไม่สำเร็จ" ทั้งที่ completion แถวจริงเขียนสำเร็จแล้ว — override
// ที่หลงเหลืออยู่ก็ไม่มีทางทำให้เกิด false-negative ในอนาคต เพราะ reconcileProgramCompletion() เช็คว่า
// completion มีอยู่แล้วหรือยังก่อนเช็ค override เสมอ (completion มีอยู่แล้ว = no-op ไม่มีทางไปถึงขั้นเช็ค
// override ค้างเลย)
export async function recordExplicitCompletion(
  supabase: SupabaseClient,
  params: { userId: string; date: string; target: CompletionTarget }
): Promise<{ error: string | null }> {
  const { userId, date, target } = params
  // แยก upsert เป็น 2 กิ่งแยกกันตรงๆ (ไม่รวม payload เป็นตัวแปร union type เดียว) เพราะ Supabase client's
  // typed upsert() ไม่ยอมรับ payload ที่เป็น union type ข้ามกิ่ง แม้แต่ละกิ่งจะ valid เดี่ยวๆ ก็ตาม
  const { error } = isAdhocTarget(target)
    ? await supabase
        .from('program_completions')
        .upsert({ user_id: userId, workout_id: target.workoutId, completed_at: date }, { onConflict: 'user_id,workout_id' })
    : await supabase.from('program_completions').upsert(
        { user_id: userId, program_exercise_id: target.programExerciseId, completed_at: date },
        { onConflict: 'user_id,program_exercise_id,completed_at' }
      )
  if (error) return { error: error.message }

  if (!isAdhocTarget(target)) {
    const { error: overrideError } = await supabase
      .from('program_completion_overrides')
      .delete()
      .eq('user_id', userId)
      .eq('program_exercise_id', target.programExerciseId)
      .eq('completion_date', date)
    if (overrideError) {
      // eslint-disable-next-line no-console
      console.error('recordExplicitCompletion: failed to clear stale manual_uncomplete override', overrideError)
    }
  }

  return { error: null }
}

// ทำเครื่องหมาย "ตั้งใจ un-complete" — ใช้จากปุ่ม uncheck ใน /program เท่านั้น (ท่า ad-hoc ไม่มี UI ให้ทำ
// แบบนี้) ลบ completion ของวันนั้นแล้วสร้าง override กันไม่ให้ reconciliation ดึงกลับมา — ต่างจากการเคลียร์
// override ใน recordExplicitCompletion (best-effort) ตรงนี้ต้อง เขียน override ให้สำเร็จจริง เพราะถ้าพลาด
// แล้วรายงานว่า "un-complete สำเร็จ" เท่ากับเปลี่ยนจาก silent completion failure (ปัญหาเดิมที่ P5 trace เจอ)
// ไปเป็น silent provenance failure แทน (ปัญหาใหม่ที่แย่พอกัน) — ต้องรายงาน error กลับให้ caller เห็นชัดๆ
export async function recordManualUncomplete(
  supabase: SupabaseClient,
  params: { userId: string; date: string; programExerciseId: string }
): Promise<{ error: string | null }> {
  const { userId, date, programExerciseId } = params

  const { error: deleteError } = await supabase
    .from('program_completions')
    .delete()
    .eq('user_id', userId)
    .eq('program_exercise_id', programExerciseId)
    .eq('completed_at', date)
  if (deleteError) return { error: deleteError.message }

  const { error: overrideError } = await supabase.from('program_completion_overrides').upsert(
    {
      user_id: userId,
      program_exercise_id: programExerciseId,
      completion_date: date,
      override_type: 'manual_uncomplete',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,program_exercise_id,completion_date' }
  )
  if (overrideError) return { error: overrideError.message }

  return { error: null }
}

// Reconciliation — idempotent, ไม่ hard-code "today": รับ date เป็น param เผื่อขยายไป reconcile วันอื่น
// ในอนาคตได้โดยไม่ต้องแก้ signature (ยังไม่มี caller ที่สแกนย้อนหลังในรอบนี้ — ดู 6F-P5 scope lock)
//
// เกณฑ์ตามที่ lock ไว้ตรงๆ:
//   1. completion มีอยู่แล้ว → no-op (ไม่ต้องเช็ค override เลย)
//   2. มี manual_uncomplete override ของวันนั้น → no-op (เคารพ intent ที่ผู้ใช้ตั้งใจ uncheck)
//   3. ไม่เข้าเงื่อนไขไหนเลย → สร้าง completion ให้ (เฉพาะตอนนี้ที่ถือว่ามีหลักฐาน workout จริงรองรับ)
// ad-hoc target ข้ามขั้นเช็ค override เพราะไม่มีทางมี override สำหรับ workout_id-based completion เลย
export async function reconcileProgramCompletion(
  supabase: SupabaseClient,
  params: { userId: string; date: string; target: CompletionTarget }
): Promise<{ error: string | null; created: boolean }> {
  const { userId, date, target } = params
  const adhoc = isAdhocTarget(target)

  let existingQuery = supabase.from('program_completions').select('id').eq('user_id', userId).eq('completed_at', date)
  existingQuery = adhoc
    ? existingQuery.eq('workout_id', target.workoutId)
    : existingQuery.eq('program_exercise_id', target.programExerciseId)
  const { data: existing, error: existingError } = await existingQuery.maybeSingle()
  if (existingError) return { error: existingError.message, created: false }
  if (existing) return { error: null, created: false }

  if (!adhoc) {
    const { data: override, error: overrideError } = await supabase
      .from('program_completion_overrides')
      .select('id')
      .eq('user_id', userId)
      .eq('program_exercise_id', target.programExerciseId)
      .eq('completion_date', date)
      .maybeSingle()
    if (overrideError) return { error: overrideError.message, created: false }
    if (override) return { error: null, created: false }
  }

  // แยก upsert เป็น 2 กิ่งตรงๆ เหมือน recordExplicitCompletion() ด้านบน (เหตุผลเดียวกัน: typed upsert()
  // ไม่ยอมรับ payload แบบ union type)
  const { error: insertError } = adhoc
    ? await supabase
        .from('program_completions')
        .upsert({ user_id: userId, workout_id: target.workoutId, completed_at: date }, { onConflict: 'user_id,workout_id' })
    : await supabase.from('program_completions').upsert(
        { user_id: userId, program_exercise_id: target.programExerciseId, completed_at: date },
        { onConflict: 'user_id,program_exercise_id,completed_at' }
      )
  if (insertError) return { error: insertError.message, created: false }

  return { error: null, created: true }
}
