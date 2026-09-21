import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProgramExercise } from './types'
import type { SessionSetState } from './workoutSession'
import { todayStr } from './weekdays'
import { createKeyedQueue } from './persistenceQueue'

// ย้ายมาจาก app/(app)/session/page.tsx (P1-2, 6A audit — "logSet() race") — รับ `supabase` เป็นพารามิเตอร์
// แทนที่จะอ่านจาก closure ของ component เพื่อให้ทดสอบได้ด้วย mock client (ดู
// lib/sessionPersistence.test.ts) — เหตุผลที่ย้ายมาไม่ใช่เพื่อ "organize code" เฉยๆ แต่เพราะ
// createKeyedQueue() (lib/persistenceQueue.ts) ต้องมีฟังก์ชันนี้เป็น pure-enough thunk ที่ enqueue ได้
// จาก 3 จุดเรียก (logSet/logCurrentExercise/swapCurrentExercise) โดยยังทดสอบ serialization ได้จริง
//
// เขียน setsLog ปัจจุบันของท่านี้ลง DB จริง (workouts + workout_sets) — เรียกทันทีทุกครั้งที่กด
// "เซ็ตนี้เสร็จแล้ว" ไม่ใช่รอจนกดจบท่า เพราะ state ของหน้านี้อยู่ในหน่วยความจำล้วนๆ ถ้าออกจากหน้า
// ระหว่างทำท่าอยู่ (เช่น สลับไปดูหน้าอื่นแล้วกลับมา) ข้อมูลที่ยังไม่ได้เขียนลง DB จะหายหมด
//
// 6F-P2 (P1 — Atomic Workout Persistence Integrity) — เดิมเขียน workouts (upsert) แล้ว workout_sets
// (delete แล้ว insert) เป็น 2-3 client call แยกกัน ไม่มี transaction คร่อมกัน: ถ้า workouts เขียนสำเร็จ
// แล้ว workout_sets delete/insert ล้มเหลว (delete()'s error เดิมไม่ถูกเช็คเลยด้วยซ้ำ) สองตารางจะเหลือ
// state ไม่ตรงกัน (เช่น workouts.sets=5 total_volume_kg=ค่าใหม่ แต่ workout_sets มี 0 แถว) — เปลี่ยนมาเรียก
// RPC เดียว (migration 047, persist_exercise_sets) ที่ทำทั้งสามขั้นตอนใน PL/pgSQL function เดียว ซึ่ง
// Postgres รับประกัน atomicity ให้เอง (exception ใดๆ ใน function = rollback ทั้งฟังก์ชัน) — ไม่มีทางเกิด
// workouts=ใหม่+workout_sets=เก่า/ว่างเปล่า จาก operation เดียวได้อีกต่อไป
//
// setsError ถูกถอดออกจาก return type: ก่อนหน้านี้ทั้ง 3 จุดเรียก (logSet/logCurrentExercise/
// swapCurrentExercise ใน session/page.tsx) ใช้มันเป็นแค่ข้อความแสดงผล ไม่เคยแยกสาขา logic ตามค่านี้เลย
// (ตรวจแล้วทั้ง 3 จุดตอน 6F-P2 trace) — ตอนนี้ที่ workouts/workout_sets รับประกันว่าไม่มี partial-success
// อีกแล้ว ไม่มี "soft failure" ให้รายงานเหลืออยู่จริง ทุก failure คือ throw เดียวกันหมด
export async function persistSets(
  supabase: SupabaseClient,
  ex: ProgramExercise,
  state: SessionSetState,
  userId: string,
  // program_day_id ของแผนที่กำลังเปิดอยู่ในเซสชันนี้ (component state `day` เดิม — ไม่ใช่ ex.program_day_id
  // ซึ่งเป็น '' ตายตัวสำหรับท่า ad-hoc/สลับกลางเซสชันเสมอ ดู comment ที่ persist_exercise_sets ใน
  // migration 047) ต้องส่งเข้ามาชัดเจนตอนย้ายออกมาจาก closure ของ component (P1-2)
  dayId: string | null,
  // 6F-P1 — session_id ของ "การเข้าเซสชันนี้" (generated ครั้งเดียวตอนเปิด /session ไม่ใช่ต่อการ persist
  // แต่ละครั้ง — ดู lib/sessionId.ts) เดินขนานกับ dayId ตลอด ไม่ใช่แทนที่กัน: dayId ตอบ "ผูกแผนวันไหน"
  // ส่วน sessionId ตอบ "มาจากการเปิดเซสชันครั้งไหน"
  sessionId: string | null
): Promise<{ workoutId: string | null }> {
  if (state.setsLog.length === 0) return { workoutId: state.workoutId ?? null }

  // top set = เซ็ตที่หนักที่สุด (ถ้าเท่ากันเทียบ reps) — เก็บลง workouts.reps/weight_kg
  // เพื่อให้ยังใช้เป็นค่าเดี่ยวสำหรับ PR / ประมาณ 1RM ได้เหมือนหน้า /log
  const topSet = state.setsLog.reduce((best, s) => {
    if (s.weightKg > best.weightKg) return s
    if (s.weightKg === best.weightKg && s.reps > best.reps) return s
    return best
  }, state.setsLog[0])
  // total_volume_kg: รวมจาก reps x น้ำหนัก จริงทีละเซ็ต (ไม่ใช่ setsDone * ค่าเดียวเหมือนเดิม)
  const totalVolumeKg = state.setsLog.reduce((sum, s) => sum + s.reps * s.weightKg, 0)

  const { data, error } = await supabase.rpc('persist_exercise_sets', {
    p_workout_id: state.workoutId,
    p_user_id: userId,
    p_performed_at: todayStr(),
    p_exercise_name: ex.exercise_name,
    p_muscle_group: ex.muscle_group,
    p_sets: state.setsLog.length,
    p_reps: topSet.reps,
    p_weight_kg: topSet.weightKg,
    p_rpe: state.rpe,
    p_notes: ex.rationale,
    p_total_volume_kg: totalVolumeKg,
    // บั๊ก (ฟีดแบ็ก "ทำเซสชันชดเชย Day 1 Push แล้วสลับท่าเป็น Assisted Dip Machine กลางเซสชัน —
    // พอเปิด /session ปกติของวันนี้ (Day 2 Pull) กลับเห็นท่านั้นโผล่มาเป็น ad-hoc ที่เสร็จแล้วด้วย")
    // เดิมใช้ ex.program_day_id ซึ่งเป็น '' (sentinel ว่าง) เสมอสำหรับท่า ad-hoc/สลับ (ดู
    // makeAdhocExercise) แปลงเป็น null แล้วตีความว่า "อิสระ ไม่ผูกแผนไหนเลย" — แต่ที่จริงท่าที่เพิ่ม/
    // สลับกลางเซสชัน "ผูกอยู่กับเซสชันนี้" อยู่แล้ว (ไม่ว่าเซสชันนั้นจะเป็นวันปกติหรือชดเชย) ควรได้
    // program_day_id เดียวกับแผนที่กำลังเปิดอยู่ตอนนี้ (state `day`) เหมือนท่าตามแผนทุกประการ ไม่ใช่
    // null ลอยๆ — null ควรเหลือไว้เฉพาะ workout จาก /log ที่ไม่มีบริบทเซสชันเลยจริงๆ เท่านั้น
    p_program_day_id: dayId,
    p_session_id: sessionId,
    p_sets_payload: state.setsLog.map((s, i) => ({ set_number: i + 1, reps: s.reps, weight_kg: s.weightKg })),
  })

  if (error) throw error

  return { workoutId: data as string }
}

// P0-02 (Product Audit — "removeLastSet() DB/UI divergence") — เมื่อผู้ใช้ลบเซ็ตสุดท้ายของท่าที่เคย persist
// ไปแล้ว (setsLog กลับมาว่างเปล่า) ตั้งใจ "ไม่มี workout ของท่านี้แล้ว" ไม่ใช่แค่ "ยังไม่ได้ persist" — ลบแถว
// workouts ทั้งแถวแทนที่จะพยายามยัด sets_payload ว่างเข้า persist_exercise_sets (ซึ่ง RPC เองรองรับได้จริง
// แต่ persistSets() ข้างบนตั้งใจ early-return เมื่อ setsLog ว่างเพื่อกัน topSet คำนวณจาก array ว่างพัง —
// ฟังก์ชันนี้จึงเป็นทางแยกต่างหาก ไม่ใช่การ "แก้" persistSets() ให้รองรับ array ว่าง)
//
// workout_sets ของแถวนี้หายไปเอง (ON DELETE CASCADE, migration 004) เช่นเดียวกับ ad-hoc program_completions
// ถ้ามี (workout_id-based, ON DELETE CASCADE, migration 042 — ผูกกับ workout แบบ 1:1 อยู่แล้วโดยธรรมชาติ
// สมเหตุสมผลที่จะหายไปด้วยกัน) ส่วน completion แบบแผนจริง (program_exercise_id-based) ไม่มี FK เชื่อมกับ
// workouts เลย ไม่ถูกแตะ — ตรงกับ Delete Workout Semantics Option A ที่ล็อกไว้แล้ว (ยืนยันด้วย grep ทุก
// migration ก่อนเขียนฟังก์ชันนี้ ไม่ใช่ assumption)
export async function deleteWorkout(supabase: SupabaseClient, workoutId: string): Promise<void> {
  const { error } = await supabase.from('workouts').delete().eq('id', workoutId)
  if (error) throw error
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
      dayId: string | null,
      sessionId: string | null
    ): Promise<{ workoutId: string | null }> {
      return queue.enqueue(ex.id, async () => {
        const effectiveWorkoutId = state.workoutId ?? knownWorkoutIds.get(ex.id) ?? null
        const result = await persistSets(supabase, ex, { ...state, workoutId: effectiveWorkoutId }, userId, dayId, sessionId)
        if (result.workoutId) knownWorkoutIds.set(ex.id, result.workoutId)
        return result
      })
    },

    // P0-02 — ใช้คิวเดียวกับ persist() เป๊ะ (keyed ต่อ ex.id) กันไม่ให้ race กับ persist() ของท่าเดียวกันที่
    // อาจกำลังค้างอยู่ (เช่น logSet() ที่ยัง await persist_exercise_sets ไม่จบ) — ถ้า setsLog เหลือ >0 เซ็ต
    // ทำเหมือน persist() ทุกประการ (persist array ที่เหลือทับของเดิม) ถ้าเหลือ 0 เซ็ตและมี workout อยู่จริง
    // (จาก state หรือจากคิวเดียวกันที่เพิ่ง persist ไปก่อนหน้า) ลบทั้งแถวแทน — ดู deleteWorkout() ด้านบน
    persistOrDelete(
      ex: ProgramExercise,
      state: SessionSetState,
      userId: string,
      dayId: string | null,
      sessionId: string | null
    ): Promise<{ workoutId: string | null }> {
      return queue.enqueue(ex.id, async () => {
        const effectiveWorkoutId = state.workoutId ?? knownWorkoutIds.get(ex.id) ?? null
        if (state.setsLog.length === 0) {
          if (effectiveWorkoutId) {
            await deleteWorkout(supabase, effectiveWorkoutId)
            knownWorkoutIds.delete(ex.id)
          }
          return { workoutId: null }
        }
        const result = await persistSets(supabase, ex, { ...state, workoutId: effectiveWorkoutId }, userId, dayId, sessionId)
        if (result.workoutId) knownWorkoutIds.set(ex.id, result.workoutId)
        return result
      })
    },
  }
}

export type ExercisePersistence = ReturnType<typeof createExercisePersistence>
