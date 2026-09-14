// P1-2 (6A audit — "logSet() race") — เล็กที่สุดที่ทำให้ persistence ของ "คีย์เดียวกัน" (เช่น
// exercise เดียวกันในเซสชันเดียวกัน) รันทีละอันเสมอ ไม่ทับซ้อนกัน
//
// audit พบว่า logSet()/logCurrentExercise()/swapCurrentExercise() (app/(app)/session/page.tsx) ทั้งสาม
// จุดเขียนลง workouts/workout_sets ของ exercise เดียวกันได้ โดยแต่ละจุดกันแค่การเรียกตัวเองซ้ำ
// (loggingSet/saving/swapping คนละตัวแปร ไม่รู้จักกัน) ไม่เคย serialize ข้ามกันเลย — ทำให้เกิดได้ทั้ง
// duplicate `workouts` row (ทั้งสอง insert พร้อมกันตอน workoutId ยังเป็น null) และ unique(workout_id,
// set_number) constraint violation (ทั้งสอง delete+insert สลับกันตอน workoutId มีอยู่แล้ว)
//
// เป็น utility กลางๆ ไม่ผูกกับ Supabase/session เลย — รับ "งาน" (task) เป็น thunk ที่คืน Promise พร้อมคีย์
// string ใดก็ได้ งานของคีย์เดียวกันจะรันเรียงตามลำดับที่ enqueue เข้ามาเสมอ (FIFO) ไม่มีวันสองงานของ
// คีย์เดียวกันทำงานพร้อมกัน — คีย์ต่างกันไม่รอกันเลย (ทำงานคู่ขนานได้ตามปกติ) — งานที่ fail ไม่บล็อกงาน
// ถัดไปของคีย์เดียวกัน (คิวเดินต่อได้) แต่ตัวมันเองยัง reject กลับไปหา caller ของมันตามปกติ ให้ error
// handling เดิมของ caller (try/catch ที่มีอยู่แล้ว) ทำงานเหมือนเดิมทุกประการ — ไม่เปลี่ยน error semantics
export function createKeyedQueue() {
  const tail = new Map<string, Promise<unknown>>()
  return {
    enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
      const previous = tail.get(key) ?? Promise.resolve()
      const run = previous.catch(() => {}).then(task)
      // เก็บเวอร์ชันที่ไม่มีวัน reject ไว้เป็น anchor ของคิว กัน error ของงานนี้ทำให้งานถัดไปของคีย์
      // เดียวกันไม่ได้รันเลย — caller ของ enqueue() นี้ยังได้ error จริงจาก `run` ที่ return กลับไปเสมอ
      tail.set(key, run.catch(() => {}))
      return run
    },
  }
}

export type KeyedQueue = ReturnType<typeof createKeyedQueue>
