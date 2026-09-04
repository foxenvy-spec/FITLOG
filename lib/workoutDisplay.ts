import type { Workout } from './types'

// volume ของ workout หนึ่งแถว — ใช้ total_volume_kg ถ้ามี (แม่นยำกว่าเพราะรวมจากทีละเซ็ตจริง)
// ไม่งั้น fallback ไปคูณ sets*reps*weight_kg (สำหรับแถวเก่าที่ยังไม่มี total_volume_kg)
export function workoutVolumeKg(w: Workout): number {
  return w.total_volume_kg ?? (w.sets ?? 0) * (w.reps ?? 0) * (w.weight_kg ?? 0)
}

export interface DaySummary {
  exerciseCount: number
  totalSets: number
  totalVolumeKg: number
  caloriesKcal: number
  muscleGroups: string[]
  durationMin: number | null
}

// สรุปภาพรวมของวันหนึ่งๆ — โชว์ก่อนเห็นรายการละเอียด จะได้รู้ทันทีว่าวันนั้นหนักแค่ไหน
export function computeDaySummary(dayWorkouts: Workout[]): DaySummary {
  const strength = dayWorkouts.filter((w) => w.type === 'strength')
  const totalSets = strength.reduce((s, w) => s + (w.sets ?? 0), 0)
  const totalVolumeKg = strength.reduce((s, w) => s + workoutVolumeKg(w), 0)
  const caloriesKcal = dayWorkouts.reduce((s, w) => s + (w.calories_kcal ?? 0), 0)
  const muscleGroups = Array.from(new Set(strength.map((w) => w.muscle_group).filter((m): m is string => !!m)))

  // ไม่มีฟิลด์ duration ต่อวันเก็บตรงๆ — ประมาณจากช่วงเวลา created_at แรกสุดถึงล่าสุดของวันนั้น
  // (ใกล้เคียงเวลาที่ใช้ในเซสชันจริง เพราะแต่ละท่าถูกบันทึกทันทีตอนกดเสร็จระหว่างเทรน) — สมมติฐานนี้ใช้ได้
  // เฉพาะตอน log แบบ real-time ต่อเนื่องเท่านั้น
  // บั๊ก (design review — "28h9m ของวันหนึ่งดูผิดธรรมชาติ") "created_at" (เวลา insert แถวจริง) กับ
  // "performed_at" (วันที่ของ workout ที่ผู้ใช้เลือกเอง) เป็นคนละฟิลด์ที่ตั้งอิสระกันได้ — แอปเองรองรับ
  // workflow ที่ทำให้สองค่านี้ห่างกันข้ามวันได้ปกติ (แก้ไข/เพิ่มรายการย้อนหลังผ่านหน้า History, ลืม log
  // ระหว่างเทรนแล้วมา log ย้อนหลังวันถัดไปแต่ตั้ง performed_at เป็นวันที่ออกกำลังกายจริง, import ข้อมูล)
  // ทำให้ max(created_at)-min(created_at) พองจนกลายเป็นหลักชั่วโมง/ข้ามวันได้ ทั้งที่ไม่ใช่ session เดียวกัน
  // จริง — ไม่มีทางแยกแยะ "ห่างเพราะ log ข้ามวัน" กับ "ห่างเพราะเทรนจริงนานขนาดนั้น" จากข้อมูลที่มีได้เป๊ะ
  // แต่เซสชันเทรนจริงแทบไม่มีทางเกิน ~6 ชม. — ใส่เพดานสมเหตุสมผล เกินนี้ถือว่าค่าที่ได้ไม่น่าเชื่อถือ ตกกลับ
  // เป็น null (ไม่โชว์เวลาเลย) แทนที่จะโชว์ตัวเลขที่ผิดธรรมชาติชัดเจน (ตาม pattern "ไม่ใช้ข้อมูลสมมติ" ที่
  // ยึดมาตลอด — ไม่โชว์ดีกว่าโชว์ผิด) ไม่แตะ exerciseCount/totalSets/totalVolumeKg/caloriesKcal เลย
  const DURATION_SANITY_CAP_MIN = 6 * 60
  const timestamps = dayWorkouts.map((w) => new Date(w.created_at).getTime()).filter((t) => !Number.isNaN(t))
  const rawDurationMin =
    timestamps.length >= 2 ? Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 60000) : null
  const durationMin = rawDurationMin !== null && rawDurationMin <= DURATION_SANITY_CAP_MIN ? rawDurationMin : null

  return { exerciseCount: dayWorkouts.length, totalSets, totalVolumeKg, caloriesKcal, muscleGroups, durationMin }
}

// ท่านี้ตัวไหนคือ "สถิติใหม่" ของวันนั้น (นับทั้ง pr น้ำหนักและ bestVolume) — ใช้เช็คตัวจุด/badge ที่แค่ต้องรู้
// "มี record ไหมวันนี้" (>0) เช่น WorkoutHeatmap.tsx ไม่ได้ต้องแยกละเอียดว่าเป็น pr หรือ bestVolume กี่รายการ
export function countDayPRs(dayWorkouts: Workout[], priorPool: Workout[]): number {
  return dayWorkouts.filter((w) => {
    const p = computeExerciseProgress(w, priorPool)
    return p.kind === 'pr' || p.kind === 'bestVolume'
  }).length
}

export interface DayPRBreakdown {
  prs: number
  bestVolume: number
}

// ฟีดแบ็ก (design review) "'🏆 PR +5' รวม PR น้ำหนักจริงกับ Best Volume เข้าด้วยกันเป็นเลขเดียว — user เห็น
// 'PR +5' มีโอกาสเข้าใจว่ามี PR (สถิติน้ำหนัก) 5 รายการ ทั้งที่จริงมีแค่ 2 อีก 3 เป็น Best Volume คนละ
// ความหมาย" — countDayPRs() เดิม (ด้านบน) ยังคงไว้เหมือนเดิมสำหรับจุดที่ต้องการแค่ boolean/ตัวเลขรวม
// (WorkoutHeatmap.tsx) เพิ่มฟังก์ชันนี้แยกต่างหากให้ DaySummaryHeader.tsx ใช้แสดงแยกประเภทให้ตรงความจริง
export function countDayPRsBreakdown(dayWorkouts: Workout[], priorPool: Workout[]): DayPRBreakdown {
  let prs = 0
  let bestVolume = 0
  dayWorkouts.forEach((w) => {
    const p = computeExerciseProgress(w, priorPool)
    if (p.kind === 'pr') prs++
    else if (p.kind === 'bestVolume') bestVolume++
  })
  return { prs, bestVolume }
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export type ExerciseProgress =
  | { kind: 'pr'; deltaKg: number }
  | { kind: 'bestVolume' }
  | { kind: 'up'; deltaKg: number }
  | { kind: 'down'; deltaKg: number }
  | { kind: 'repsUp'; deltaReps: number }
  | { kind: 'repsDown'; deltaReps: number }
  | { kind: 'same' }
  | { kind: 'none' }

// เทียบท่านี้กับประวัติก่อนหน้า (ไม่รวมวันเดียวกัน) — ใช้บอกว่าเปิดย้อนมาดูวันนี้แล้ว "หนักกว่าเดิม" แค่ไหน
// priorPool ควรเป็น workouts ประเภท strength ของ exercise ต่างๆ ย้อนหลังพอสมควร (ยิ่งยาวยิ่งแม่น สำหรับเช็ค PR)
export function computeExerciseProgress(w: Workout, priorPool: Workout[]): ExerciseProgress {
  if (w.type !== 'strength' || !w.exercise_name) return { kind: 'none' }
  const prior = priorPool.filter(
    (p) => p.type === 'strength' && p.exercise_name === w.exercise_name && p.performed_at < w.performed_at
  )
  if (prior.length === 0) return { kind: 'none' }

  const thisWeight = w.weight_kg ?? 0
  const thisVolume = workoutVolumeKg(w)
  const prevBestWeight = Math.max(...prior.map((p) => p.weight_kg ?? 0))
  const prevBestVolume = Math.max(...prior.map(workoutVolumeKg))

  if (thisWeight > 0 && thisWeight > prevBestWeight) {
    return { kind: 'pr', deltaKg: Math.round((thisWeight - prevBestWeight) * 10) / 10 }
  }
  // บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจครอบใหม่): เดิม topPercent (จาก volumeTopPercent, ลบไปแล้ว) คำนวณเปอร์เซ็นไทล์
  // ของ thisVolume เทียบกับ prior — แต่ branch นี้เข้าได้ก็ต่อเมื่อ thisVolume > prevBestVolume (สูงกว่า
  // ค่ามากที่สุดในประวัติทั้งหมด) อยู่แล้วเสมอ ทำให้ beatCount ในสูตรเดิมเท่ากับ prior.length ทุกครั้ง
  // (thisVolume ชนะทุกแถวใน prior โดยนิยาม) เปอร์เซ็นไทล์จึงเป็น 100 คงที่ ผลลัพธ์ที่คำนวณออกมา (หลัง clamp)
  // จึงเป็น "Top 1%" เสมอไม่ว่าสถิติใหม่จะดีกว่าเดิมแค่นิดเดียวหรือดีกว่ามาก — ไม่ใช่ข้อมูลผิด แต่ไม่มีนัยสำคัญ
  // เลยไม่ว่ากรณีไหน (โครงสร้างการเรียกรับประกันผลลัพธ์เดียวเสมอ) ตัดออก เหลือแค่ kind: 'bestVolume' เฉยๆ
  // (badge แสดง "🏆 Best Volume" อยู่แล้ว ซึ่งสื่อความหมายเดียวกันโดยไม่ต้องมีตัวเลขที่ไม่มีความหมายจริงกำกับ)
  if (thisVolume > 0 && thisVolume > prevBestVolume) {
    return { kind: 'bestVolume' }
  }

  // ไม่ใช่สถิติใหม่ — เทียบกับครั้งล่าสุดก่อนหน้าแทน เพื่อโชว์แนวโน้มระยะสั้น
  const lastSession = prior.reduce((a, b) => (a.performed_at > b.performed_at ? a : b))
  const lastWeight = lastSession.weight_kg ?? 0
  if (thisWeight > lastWeight) return { kind: 'up', deltaKg: Math.round((thisWeight - lastWeight) * 10) / 10 }
  if (thisWeight < lastWeight) return { kind: 'down', deltaKg: Math.round((lastWeight - thisWeight) * 10) / 10 }

  // น้ำหนักเท่าเดิม — เทียบ reps ต่อ เผื่อทำได้มากขึ้น/น้อยลงแม้น้ำหนักไม่เปลี่ยน
  const thisReps = w.reps ?? 0
  const lastReps = lastSession.reps ?? 0
  if (thisReps > lastReps) return { kind: 'repsUp', deltaReps: thisReps - lastReps }
  if (thisReps < lastReps) return { kind: 'repsDown', deltaReps: lastReps - thisReps }
  return { kind: 'same' }
}
