import type { Workout } from './types'

// ==================== แคลอรี่ (ค่าประมาณ) ====================
// ใช้สูตรมาตรฐาน kcal/นาที = (MET x 3.5 x น้ำหนักตัว กก.) / 200
// MET เป็นค่าอ้างอิงทั่วไป ไม่ใช่ค่าที่วัดจริงรายบุคคล
//
// CAL-1 (Cross-Surface Data Integrity Audit — Calories) — ย้ายมาจาก lib/dashboardStats.ts ให้เป็น shared
// primitive กลางที่ทั้ง estimateCaloriesToday (Dashboard/Stats/Session, lib/dashboardStats.ts) และ
// computeDayTotals/computeDaySummary (History/Calendar/Log, lib/workoutDisplay.ts) เรียกใช้ตัวเดียวกัน —
// ก่อนหน้านี้ทั้งสองฝั่งคิดเลข calorie คนละสูตร: ฝั่ง dashboard estimate ด้วย MET เสมอเมื่อไม่มีค่าที่บันทึก
// ไว้ ฝั่ง day-summary รวมแค่ calories_kcal ที่บันทึกไว้ตรงๆ (?? 0) ไม่มี fallback เลย ทำให้วันเดียวกันเห็น
// ตัวเลขไม่ตรงกันข้ามหน้า (โดยเฉพาะวันที่เทรน strength ล้วน ซึ่ง calories_kcal เป็น null เสมอเพราะไม่มี UI
// ไหนให้กรอกค่านี้สำหรับ strength — ดู log/page.tsx ฟิลด์ "แคลอรี่จริง" ซึ่งอยู่ใน cardio branch เท่านั้น)
export const CARDIO_MET: Record<string, number> = {
  วิ่ง: 9.0,
  ปั่นจักรยาน: 7.5,
  ว่ายน้ำ: 7.0,
  เดินเร็ว: 4.3,
  กระโดดเชือก: 10.0,
}
export const DEFAULT_CARDIO_MET = 6.0
export const STRENGTH_MET = 5.0
export const DEFAULT_BODYWEIGHT_KG = 70

export function kcalForMinutes(met: number, minutes: number, bodyWeightKg: number) {
  return (met * 3.5 * bodyWeightKg) / 200 * minutes
}

// แคลอรี่ของ cardio หนึ่งเซสชัน — ถ้าผู้ใช้กรอก/นำเข้าค่าจริงมา (calories_kcal) ใช้ค่านั้นก่อนเสมอ
// เพราะแม่นกว่าค่าประมาณจากสูตร MET; ถ้าไม่มีค่าจริงค่อย fallback ไปประมาณจาก MET ตามชนิดคาร์ดิโอ
export function estimateCardioSessionCalories(w: Workout, bodyWeightKg: number | null): number {
  if (w.calories_kcal !== null && w.calories_kcal !== undefined) return w.calories_kcal
  const weight = bodyWeightKg ?? DEFAULT_BODYWEIGHT_KG
  const met = w.cardio_type ? CARDIO_MET[w.cardio_type] ?? DEFAULT_CARDIO_MET : DEFAULT_CARDIO_MET
  return kcalForMinutes(met, w.duration_min ?? 0, weight)
}

// แคลอรี่รวมของกลุ่ม workouts ในวัน/เซสชันเดียวกัน — cardio ใช้ค่าที่บันทึกไว้ก่อนเสมอ (ผ่าน
// estimateCardioSessionCalories ด้านบน) ไม่มีค่าจริงจึง estimate; strength ไม่มีทางมี calories_kcal ที่บันทึก
// ไว้ได้เลย (ไม่มี UI ให้กรอก) จึง estimate เสมอจาก STRENGTH_MET คูณกับ session duration — เป็น session-level
// lump เดียว ไม่ใช่ต่อแถว (ตรงกับพฤติกรรมเดิมของ estimateCaloriesToday ที่ Dashboard/Stats/Session ใช้อยู่
// แล้ว คงไว้เป๊ะ ไม่เปลี่ยน)
//
// primitive เดียวที่ estimateCaloriesToday (lib/dashboardStats.ts) และ computeDaySummaryMath
// (lib/workoutDisplay.ts) เรียกร่วมกัน — ห้ามมีสูตร MET ตัวที่สองแยกอยู่ที่ไหนอีก
export function estimateWorkoutsCalories(
  workouts: Workout[],
  strengthSessionMinutes: number | null,
  bodyWeightKg: number | null
): number {
  const weight = bodyWeightKg ?? DEFAULT_BODYWEIGHT_KG
  const cardio = workouts.filter((w) => w.type === 'cardio')
  const cardioKcal = cardio.reduce((sum, w) => sum + estimateCardioSessionCalories(w, weight), 0)
  const strengthKcal = strengthSessionMinutes ? kcalForMinutes(STRENGTH_MET, strengthSessionMinutes, weight) : 0
  return Math.round(cardioKcal + strengthKcal)
}
