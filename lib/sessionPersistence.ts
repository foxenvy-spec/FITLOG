import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProgramExercise } from './types'
import type { SessionSetState } from './workoutSession'
import { todayStr } from './weekdays'
import { createKeyedQueue } from './persistenceQueue'

// ย้ายมาจาก app/(app)/session/page.tsx (P1-2, 6A audit — "logSet() race") — ตัวฟังก์ชันเองไม่เปลี่ยนแม้
// บรรทัดเดียว (query/payload/ลำดับ delete-then-insert เดิมทุกประการ) แค่รับ `supabase` เป็นพารามิเตอร์
// แทนที่จะอ่านจาก closure ของ component เพื่อให้ทดสอบได้ด้วย mock client (ดู
// lib/sessionPersistence.test.ts) — เหตุผลที่ย้ายมาไม่ใช่เพื่อ "organize code" เฉยๆ แต่เพราะ
// createKeyedQueue() (lib/persistenceQueue.ts) ต้องมีฟังก์ชันนี้เป็น pure-enough thunk ที่ enqueue ได้
// จาก 3 จุดเรียก (logSet/logCurrentExercise/swapCurrentExercise) โดยยังทดสอบ serialization ได้จริง
//
// เขียน setsLog ปัจจุบันของท่านี้ลง DB จริง (workouts + workout_sets) — เรียกทันทีทุกครั้งที่กด
// "เซ็ตนี้เสร็จแล้ว" ไม่ใช่รอจนกดจบท่า เพราะ state ของหน้านี้อยู่ในหน่วยความจำล้วนๆ ถ้าออกจากหน้า
// ระหว่างทำท่าอยู่ (เช่น สลับไปดูหน้าอื่นแล้วกลับมา) ข้อมูลที่ยังไม่ได้เขียนลง DB จะหายหมด
export async function persistSets(
  supabase: SupabaseClient,
  ex: ProgramExercise,
  state: SessionSetState,
  userId: string,
  // program_day_id ของแผนที่กำลังเปิดอยู่ในเซสชันนี้ (component state `day` เดิม — ไม่ใช่ ex.program_day_id
  // ซึ่งเป็น '' ตายตัวสำหรับท่า ad-hoc/สลับกลางเซสชันเสมอ ดู comment ที่ payload.program_day_id ด้านล่าง)
  // ต้องส่งเข้ามาชัดเจนตอนย้ายออกมาจาก closure ของ component (P1-2)
  dayId: string | null
): Promise<{ workoutId: string | null; setsError: string | null }> {
  if (state.setsLog.length === 0) return { workoutId: state.workoutId ?? null, setsError: null }

  // top set = เซ็ตที่หนักที่สุด (ถ้าเท่ากันเทียบ reps) — เก็บลง workouts.reps/weight_kg
  // เพื่อให้ยังใช้เป็นค่าเดี่ยวสำหรับ PR / ประมาณ 1RM ได้เหมือนหน้า /log
  const topSet = state.setsLog.reduce((best, s) => {
    if (s.weightKg > best.weightKg) return s
    if (s.weightKg === best.weightKg && s.reps > best.reps) return s
    return best
  }, state.setsLog[0])
  // total_volume_kg: รวมจาก reps x น้ำหนัก จริงทีละเซ็ต (ไม่ใช่ setsDone * ค่าเดียวเหมือนเดิม)
  const totalVolumeKg = state.setsLog.reduce((sum, s) => sum + s.reps * s.weightKg, 0)
  const payload = {
    user_id: userId,
    type: 'strength' as const,
    performed_at: todayStr(),
    exercise_name: ex.exercise_name,
    muscle_group: ex.muscle_group,
    sets: state.setsLog.length,
    reps: topSet.reps,
    weight_kg: topSet.weightKg,
    rpe: state.rpe,
    notes: ex.rationale,
    total_volume_kg: totalVolumeKg,
    // บั๊ก (ฟีดแบ็ก "ทำเซสชันชดเชย Day 1 Push แล้วสลับท่าเป็น Assisted Dip Machine กลางเซสชัน —
    // พอเปิด /session ปกติของวันนี้ (Day 2 Pull) กลับเห็นท่านั้นโผล่มาเป็น ad-hoc ที่เสร็จแล้วด้วย")
    // เดิมใช้ ex.program_day_id ซึ่งเป็น '' (sentinel ว่าง) เสมอสำหรับท่า ad-hoc/สลับ (ดู
    // makeAdhocExercise) แปลงเป็น null แล้วตีความว่า "อิสระ ไม่ผูกแผนไหนเลย" — แต่ที่จริงท่าที่เพิ่ม/
    // สลับกลางเซสชัน "ผูกอยู่กับเซสชันนี้" อยู่แล้ว (ไม่ว่าเซสชันนั้นจะเป็นวันปกติหรือชดเชย) ควรได้
    // program_day_id เดียวกับแผนที่กำลังเปิดอยู่ตอนนี้ (state `day`) เหมือนท่าตามแผนทุกประการ ไม่ใช่
    // null ลอยๆ — null ควรเหลือไว้เฉพาะ workout จาก /log ที่ไม่มีบริบทเซสชันเลยจริงๆ เท่านั้น
    program_day_id: dayId,
  }

  // ถ้าเคยบันทึกท่านี้ไปแล้ว (เซ็ตก่อนหน้าในท่าเดียวกัน หรือกลับมาแก้ผ่าน progress chips)
  // ต้องอัปเดตแถวเดิมแทนการ insert ใหม่ ไม่งั้นจะได้รายการซ้ำซ้อนในประวัติ/สถิติ
  const { data: upserted, error: wErr } = state.workoutId
    ? await supabase.from('workouts').update(payload).eq('id', state.workoutId).select('id').single()
    : await supabase.from('workouts').insert(payload).select('id').single()

  if (wErr) throw wErr

  const workoutId = (upserted as { id: string } | null)?.id ?? state.workoutId
  if (!workoutId) return { workoutId: null, setsError: null }

  // ลบเซ็ตเก่าทั้งหมดแล้วเขียนชุดใหม่ทับ — ง่ายกว่า diff ทีละเซ็ต และจำนวน/ลำดับเซ็ตอาจเปลี่ยนไปจากเดิม
  if (state.workoutId) {
    await supabase.from('workout_sets').delete().eq('workout_id', workoutId)
  }
  const setsPayload = state.setsLog.map((s, i) => ({
    workout_id: workoutId,
    user_id: userId,
    set_number: i + 1,
    reps: s.reps,
    weight_kg: s.weightKg,
    completed: true,
  }))
  const { error: setsError } = await supabase.from('workout_sets').insert(setsPayload)

  return { workoutId, setsError: setsError ? setsError.message : null }
}

// P1-2 (6A audit — "logSet() race") — the actual fix, not just persistSets() + a raw queue.
//
// Serializing calls through createKeyedQueue() alone is not enough on its own: logSet()/
// logCurrentExercise()/swapCurrentExercise() each capture their own `state` snapshot from a React closure
// at the moment they're invoked, and if two of them fire for the same exercise before either has seen the
// other's result, BOTH snapshots can carry the SAME stale `workoutId` (null, on the very first set of an
// exercise) — serializing their *execution order* doesn't fix that, because the second call still walks in
// believing no workout row exists yet, and would INSERT a duplicate the moment its turn comes up.
//
// createExercisePersistence() closes over a queue *and* a per-exercise "last known workoutId" map that is
// updated after every completed persist. Each call's snapshot gets patched with that tracked id (only when
// the snapshot's own workoutId is null — an explicit non-null workoutId on the snapshot, e.g. from
// resuming a session via progress chips, is trusted as-is) before being handed to persistSets — so the
// second of two racing calls for a brand-new exercise correctly UPDATEs the row the first one just
// INSERTed, instead of inserting its own. This is what makes correctness independent of React re-render
// timing (locked in the P1-2 contract) rather than relying on the caller having already re-rendered with
// the new workoutId by the time it fires its own persist.
export function createExercisePersistence(supabase: SupabaseClient) {
  const queue = createKeyedQueue()
  const knownWorkoutIds = new Map<string, string>()

  return {
    persist(
      ex: ProgramExercise,
      state: SessionSetState,
      userId: string,
      dayId: string | null
    ): Promise<{ workoutId: string | null; setsError: string | null }> {
      return queue.enqueue(ex.id, async () => {
        const effectiveWorkoutId = state.workoutId ?? knownWorkoutIds.get(ex.id) ?? null
        const result = await persistSets(supabase, ex, { ...state, workoutId: effectiveWorkoutId }, userId, dayId)
        if (result.workoutId) knownWorkoutIds.set(ex.id, result.workoutId)
        return result
      })
    },
  }
}

export type ExercisePersistence = ReturnType<typeof createExercisePersistence>
