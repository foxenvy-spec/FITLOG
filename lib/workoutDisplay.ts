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

// สรุปภาพรวมของวันหนึ่งๆ (คำนวณเองจากรายการที่กรองมาให้แล้ว) — โชว์ก่อนเห็นรายการละเอียด จะได้รู้ทันทีว่า
// วันนั้นหนักแค่ไหน — ตัวเลขจริงๆ มาจาก computeDayTotals() ด้านล่าง (canonical) ฟังก์ชันนี้เป็นแค่ทางลัดของ
// caller ที่กรอง workouts ของวันนั้นมาให้แล้วเอง (History/Calendar/Train/Log) ไม่ต้องแก้ call site เหล่านั้น
function computeDaySummaryMath(dayWorkouts: Workout[]): DaySummary {
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
  //
  // 6B-2 (P0-2) — ตอนรวม computeTodayTotals (lib/dashboardStats.ts) เข้ามาเป็นฟังก์ชันเดียวกับนี้ พบว่า
  // computeTodayTotals เดิมมี fallback อีกชั้นที่ฟังก์ชันนี้ไม่เคยมี: วันที่มีคาร์ดิโอ "รายการเดียว" (ไม่มี
  // รายการที่ 2 ให้เทียบ timestamp เป็น span ได้) ใช้ duration_min ที่ผู้ใช้/AI กรอกเองของรายการนั้นแทน —
  // lib/workoutReport.ts (Workout Report บน /stats) พึ่งพฤติกรรมนี้อยู่จริง (regression test ยืนยัน: วันที่
  // มีคาร์ดิโอ 1 รายการ ต้องนับ duration_min ของมันเข้า total ไม่ใช่ 0) เอาออกไปตอนรวมฟังก์ชันจะทำให้ข้อมูล
  // จริงหายไปเงียบๆ (ไม่ใช่แค่ style ต่างกัน) — เก็บ fallback นี้ไว้เป็นส่วนหนึ่งของ canonical engine เลย
  // (ไม่ใช่ compromise เฉพาะ Dashboard อีกต่อไป) ให้ History/Calendar/Train ได้ประโยชน์เดียวกันด้วย: วันที่มี
  // คาร์ดิโอรายการเดียวเคยโชว์ duration ว่างเปล่าที่หน้าเหล่านั้น ตอนนี้โชว์ duration_min จริงเช่นกัน — ไม่ใช่
  // regression ของหน้าเหล่านั้น เป็นช่องว่างเดิมที่ไม่มีใครตั้งใจ exclude cardio duration_min ไว้แต่แรก
  // duration_min ที่ผู้ใช้กรอกเองไม่มีทางพองข้ามวันแบบ created_at span (มันคือค่าเดียว ไม่ใช่ผลต่างของ 2
  // timestamp) จึงไม่ต้องผ่าน sanity cap เดียวกัน — คง max(span capped แล้ว, cardio duration) ตามสูตรเดิม
  // ของ computeTodayTotals เป๊ะ
  const DURATION_SANITY_CAP_MIN = 6 * 60
  const timestamps = dayWorkouts.map((w) => new Date(w.created_at).getTime()).filter((t) => !Number.isNaN(t))
  const rawSpanMin = timestamps.length >= 2 ? Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 60000) : null
  const spanMin = rawSpanMin !== null && rawSpanMin <= DURATION_SANITY_CAP_MIN ? rawSpanMin : null
  const cardioDurationMin = dayWorkouts.filter((w) => w.type === 'cardio').reduce((s, w) => s + (w.duration_min ?? 0), 0)
  const durationMin = spanMin !== null ? Math.max(spanMin, cardioDurationMin) : cardioDurationMin > 0 ? cardioDurationMin : null

  return { exerciseCount: dayWorkouts.length, totalSets, totalVolumeKg, caloriesKcal, muscleGroups, durationMin }
}

// *** Canonical "ยอดรวมของวันหนึ่งๆ" ทั้งแอป *** (6B-2, P0-2 — แก้ cluster 2 จาก 6A audit: History/Calendar/
// Train/Log ใช้ computeDaySummary ตัวนี้อยู่แล้ว แต่ Dashboard/Stats เคยมี computeTodayTotals
// (lib/dashboardStats.ts) แยกเป็นอีกฟังก์ชันที่คิดเลขคล้ายกันแต่ไม่เหมือนกันเป๊ะ — sets เดิม default เป็น 1
// ที่ Dashboard แต่เป็น 0 ที่นี่ (แถวที่ไม่มี sets เลยถูกนับต่างกันข้ามหน้า) และ duration เดิมของ Dashboard
// ไม่มี sanity cap เลย (History/Calendar มีเพดาน 6 ชม.) ทำให้ตัวเลขวันเดียวกันต่างกันได้จริงระหว่างหน้าจอ —
// ฟังก์ชันนี้เป็น engine เดียวที่ทุกจุดต้อง consume: รับ Workout[] เต็ม (ไม่กรองมาก่อน) + date ที่ต้องการ
// กรองเองข้างใน กัน caller ต้องเขียน group-by-date loop ซ้ำ (Stats เดิมทำเอง) — onlyProgramDayId เป็น
// option เสริมสำหรับ Dashboard โดยเฉพาะ (สโคปเฉพาะ workouts ที่ผูกกับแผนวันนี้ + รายการไม่ผูกแผนเลย ไม่รวม
// เซสชันชดเชยของแผนอื่น) แทนที่ caller-local filter เดิม (DashboardView.tsx/MobileDashboardView.tsx เคย
// กรอง relevantWorkouts เองก่อนเรียก) — ค่าที่ได้ = computeDaySummary เป๊ะ (sets ?? 0, duration cap 6 ชม.,
// volume ผ่าน workoutVolumeKg() ตัวเดียวกัน) ไม่ใช่ computeTodayTotals เดิม
export function computeDayTotals(
  workouts: Workout[],
  date: string,
  opts?: { onlyProgramDayId?: string | null }
): DaySummary {
  let dayWorkouts = workouts.filter((w) => w.performed_at === date)
  if (opts && opts.onlyProgramDayId !== undefined) {
    dayWorkouts = dayWorkouts.filter((w) => !w.program_day_id || w.program_day_id === opts.onlyProgramDayId)
  }
  return computeDaySummaryMath(dayWorkouts)
}

export function computeDaySummary(dayWorkouts: Workout[]): DaySummary {
  return computeDaySummaryMath(dayWorkouts)
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

// ชื่อโปรแกรม (scheduledDay.title) เป็นข้อความอิสระที่ผู้ใช้พิมพ์เอง (เช่น "Day 5 — Lower
// (Hamstring/Glute)") ไม่มีฟิลด์กล้ามเนื้อแยกต่างหากใน ProgramDay (lib/types.ts) ให้ดึงมาแสดงบรรทัด 2
// ตรงๆ — label ยาวๆ แบบนี้โดน truncate จะตัดจนอ่านไม่รู้เรื่อง ถ้าเจอวงเล็บ แยกเป็น 2 บรรทัดแทน: บรรทัด
// หลัก (ก่อนวงเล็บ) + บรรทัดรายละเอียด (ในวงเล็บ, "/" แทนด้วย " • ")
//
// ย้ายมาจาก components/TodaysFocusCard.tsx (เดิม export จากไฟล์การ์ดนั้น) ตอน rebuild หน้า Home ตาม
// "New_mobile_app.zip" — TodaysFocusCard ถูกลบทิ้งไปแล้ว (แทนที่ด้วย TodayCard.tsx) แต่ฟังก์ชันนี้ยัง
// ใช้ร่วมกันหลายจุด (session/page.tsx, DashboardView.tsx เดสก์ท็อป, AICoachCompactCard.tsx) จึงย้ายมา
// อยู่ใน lib ที่เป็นกลาง ไม่ผูกกับไฟล์การ์ดใดการ์ดหนึ่งอีกต่อไป
export function splitTitleDetail(text: string): { main: string; detail: string | null } {
  const openIdx = text.indexOf('(')
  if (openIdx === -1) return { main: text, detail: null }
  const closeIdx = text.lastIndexOf(')')
  const main = text.slice(0, openIdx).trim() || text
  const inner = closeIdx > openIdx ? text.slice(openIdx + 1, closeIdx) : text.slice(openIdx + 1)
  const detail = inner.replace(/\//g, ' • ').trim()
  return { main, detail: detail || null }
}
