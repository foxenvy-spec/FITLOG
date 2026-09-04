import type { ProgramDay, Workout } from './types'
import { todayStr, bangkokParts } from './weekdays'
import type { ExerciseDef } from './exerciseLibrary'
import { COLORS, FIRE_ACCENT } from './theme'
import { workoutVolumeKg } from './workoutDisplay'

// STREAK_LOOKBACK_DAYS เดียวกับที่ DashboardView.tsx ใช้จำกัด query performedDates (400 วัน) — ใช้
// เป็นเพดานลูปกันเผื่อกรณีขอบ (เช่น ตั้งโปรแกรมแบบไม่มี weekday ไหนเป็นวันฝึกเลย) ไม่ให้วนไม่มีที่สิ้นสุด
const STREAK_WALK_MAX_DAYS = 400

// วันที่ในรูป "YYYY-MM-DD" บวก/ลบจำนวนวัน — ยึด UTC เที่ยงคืนเสมอ (เหมือน todayDayOfWeek() ใน
// lib/weekdays.ts) ไม่ใช่ local time ของเครื่องที่รันโค้ด กัน bug เดิมที่เจอมาแล้ว (server รันเป็น UTC
// ส่วน browser ผู้ใช้เป็นเวลาไทย ถ้าคำนวณ day-of-week จาก local Date จะได้คนละวันกันช่วง 00:00-07:00
// เวลาไทย) — ใช้กับทั้งการเลื่อนวันที่และการหา day-of-week ของวันที่ในอดีต
function addIsoDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function isoDayOfWeek(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay()
}

// ฟีดแบ็ก "ถ้า Product ต้องการนับความต่อเนื่องของ Program ผมแนะนำให้ Rest Day ไม่ตัด Streak — Scheduled
// Rest Day = ไม่ตัด Streak, Missed Workout = ตัด Streak" ตามด้วยคำชี้แจง "ดูจากตารางล่วงหน้าที่ลงไว้
// วันไหนไม่มีลงคือวันพัก" — workoutWeekdays (0=อาทิตย์..6=เสาร์ ตรงกับ ProgramDay.day_of_week/
// Date.getUTCDay() เป๊ะ) คือเซตของ weekday ที่มี ProgramDay ตั้งไว้จริง (ไม่ว่าง = วันฝึกตามตาราง) —
// weekday ที่ไม่อยู่ในเซตนี้ถือเป็น "วันพักตามแผน" ไม่ตัด Streak แม้ไม่ได้ฝึกวันนั้น — ไม่ส่ง/ส่งเซตว่าง
// (ไม่มีโปรแกรมเลย) = ไม่มี "ตาราง" ให้อ้างอิง กลับไปใช้พฤติกรรมเดิมเป๊ะ (ขาดวันไหนก็ตัด Streak หมด)
// ข้อจำกัด: ใช้ตารางโปรแกรม "ปัจจุบัน" ย้อนไปกับวันที่ในอดีตทั้งหมด (ไม่มีข้อมูลว่าตารางเคยเปลี่ยนมาก่อน)
// ฟีดแบ็ก "Current Streak '1 วัน' ดูขัดกับวงกลม Timeline ที่โชว์ ✓ หลายวันในสัปดาห์นี้ — ผู้ใช้อาจสงสัยว่า
// วงที่ Complete หลายวันนั้นหมายถึงอะไร ถ้า Streak จริงๆ มีแค่ 1" — สาเหตุคือ weekDayTicks (แถวจุดวันจ-อา)
// เดิมเป็นแค่ "ปฏิทินสัปดาห์นี้ฝึกวันไหนบ้าง" ล้วนๆ ไม่รู้จัก concept "สายโซ่ต่อเนื่องปัจจุบัน" เลย จุดที่ฝึก
// แล้วแต่สายโซ่ขาดไปก่อนแล้ว (เช่น ฝึกวันจันทร์ แต่วันอังคารพลาดจริง ทำให้ streak ปัจจุบันนับได้แค่จากวันพุธ
// เป็นต้นมา) ก็ยังโชว์เป็น ✓ สีอำพันเหมือนวันที่อยู่ในสายโซ่ปัจจุบันเป๊ะๆ ไม่มีอะไรแยกให้เห็นว่า "อันไหนคือ
// streak ที่กำลังนับอยู่จริง" — แยกตรรกะเดินสายโซ่ออกมาเป็นฟังก์ชันนี้ (คืนเป็นเซตวันที่ ไม่ใช่แค่จำนวน)
// ให้ computeCurrentStreak ด้านล่างเรียกใช้แทนที่จะมี logic ซ้ำ 2 ที่ (กันไม่ให้ตัวเลขกับเซตวันที่ที่ส่งไป
// render เพี้ยนแยกจากกันได้ในอนาคต) — DashboardView.tsx ใช้เซตนี้ทำ weekDayTicks[].inStreak ต่อ ให้
// WorkoutStreakCard.tsx แยกสี "ฝึกแล้ว+อยู่ใน streak ปัจจุบัน" (อำพัน) ออกจาก "ฝึกแล้วแต่ streak ขาดไปแล้ว"
// (โทนกลาง) ได้ตรงกับตัวเลขบนการ์ดเป๊ะ ไม่ใช่แค่ "ฝึกแล้วหรือยัง" เฉยๆ เหมือนเดิม
function computeStreakChainDates(performedDates: string[], workoutWeekdays?: ReadonlySet<number> | null): Set<string> {
  const trained = new Set(performedDates)
  const chain = new Set<string>()
  if (trained.size === 0) return chain
  const hasSchedule = !!workoutWeekdays && workoutWeekdays.size > 0

  let cursor = todayStr()
  for (let i = 0; i < STREAK_WALK_MAX_DAYS; i++) {
    if (trained.has(cursor)) {
      chain.add(cursor)
    } else {
      const isScheduledRest = hasSchedule && !workoutWeekdays!.has(isoDayOfWeek(cursor))
      // วันนี้ (i===0) ยังไม่ได้ฝึกไม่ตัด Streak ทันที (วันยังไม่จบ อาจฝึกทีหลังได้) เหมือนพฤติกรรมเดิม —
      // วันอื่นที่ไม่ใช่วันนี้และไม่ใช่วันพักตามแผน = พลาดวันฝึกจริง ตัด Streak ที่ตรงนี้
      if (!isScheduledRest && i !== 0) break
    }
    cursor = addIsoDays(cursor, -1)
  }
  return chain
}

export function computeCurrentStreak(performedDates: string[], workoutWeekdays?: ReadonlySet<number> | null): number {
  return computeStreakChainDates(performedDates, workoutWeekdays).size
}

// เซตวันที่ (YYYY-MM-DD) ที่อยู่ใน "สายโซ่ต่อเนื่องปัจจุบัน" จริงๆ — ใช้แยกแต้ม weekDayTicks ว่าอันไหน
// เป็นส่วนหนึ่งของ Current Streak ที่ตัวเลขบนการ์ดกำลังนับอยู่ อันไหนเป็นแค่ "ฝึกไปแล้วในอดีต" ที่ไม่ต่อกับ
// streak ปัจจุบันแล้ว (ดู comment เต็มที่ computeStreakChainDates ด้านบน)
export function computeCurrentStreakDates(
  performedDates: string[],
  workoutWeekdays?: ReadonlySet<number> | null
): Set<string> {
  return computeStreakChainDates(performedDates, workoutWeekdays)
}

// ฟีดแบ็ก "แยก Current กับ Best Streak — เช่นใน Detail" (ไม่ต้องเอา Best ขึ้น Dashboard การ์ดหลัก) —
// สายโซ่ต่อเนื่องยาวที่สุดในประวัติทั้งหมด (ไม่ใช่แค่สายที่ต่อถึงวันนี้/เมื่อวานแบบ computeCurrentStreak)
// ใช้ performedDates ชุดเดียวกัน ไม่ต้อง query เพิ่ม — workoutWeekdays เหตุผลเดียวกับ computeCurrentStreak
// (ไม่ใช้ตรรกะเดียวกัน Current กับ Best จะขัดแย้งกันเอง — Current นับต่อได้แต่ Best กลับตัดที่วันพักเดียวกัน)
export function computeLongestStreak(performedDates: string[], workoutWeekdays?: ReadonlySet<number> | null): number {
  const trained = new Set(performedDates)
  if (trained.size === 0) return 0
  const hasSchedule = !!workoutWeekdays && workoutWeekdays.size > 0

  const sortedDates = Array.from(trained).sort()
  const today = todayStr()
  let longest = 0
  let current = 0
  let cursor = sortedDates[0]
  for (let i = 0; cursor <= today && i < STREAK_WALK_MAX_DAYS; i++) {
    if (trained.has(cursor)) {
      current++
      longest = Math.max(longest, current)
    } else {
      const isScheduledRest = hasSchedule && !workoutWeekdays!.has(isoDayOfWeek(cursor))
      // วันพักตามแผน: current ไม่รีเซ็ต (สายโซ่ยังต่อได้ข้ามวันพัก) — พลาดวันฝึกจริง: รีเซ็ตเป็น 0
      if (!isScheduledRest) current = 0
    }
    cursor = addIsoDays(cursor, 1)
  }
  return longest
}

// แปลง % ความพร้อมของวันนี้ (GoalRing บน hero card) เป็นข้อความที่ตีความแทนผู้ใช้ทันที
// แทนที่จะโชว์แค่ตัวเลข % เฉยๆ แล้วให้ผู้ใช้ไปนั่งตีความเองว่า 43% แปลว่าอะไร
export function readinessStatusLabel(pct: number): string {
  if (pct <= 0) return 'ยังไม่เริ่ม'
  if (pct <= 30) return 'เริ่มแล้ว'
  if (pct <= 70) return 'กำลังทำ'
  if (pct < 100) return 'ใกล้ครบ'
  return 'สำเร็จ'
}

export interface TodayTotals {
  volumeKg: number
  sets: number
  durationMin: number | null
  entryCount: number
}

export interface DetectedActivity {
  /** ชื่อกิจกรรมที่ขึ้นบน hero card เช่น "วิ่ง", "เวทเทรนนิ่ง", "กิจกรรมอิสระ" */
  title: string
  /** ข้อความบนปุ่ม CTA เช่น "เริ่มวิ่ง", "เริ่มเทรน" */
  buttonLabel: string
  /** อิโมจิหัวการ์ด แทน 🔥 ตายตัว — ให้สื่อประเภทกิจกรรมที่ตรวจจับได้ */
  icon: string
  /** true = คาร์ดิโอ (ใช้ระยะทาง/แคลอรี่แทน Exercises/Sets บน hero card) */
  isCardio: boolean
}

// map cardio_type ที่ AI อ่านจากรูป (เป็นภาษาไทยเป็นหลัก แต่กันเหนียวรับคำอังกฤษด้วย) ไปเป็น label
// ที่โชว์บน UI — ลำดับรายการมีผล: เช็ค "เดิน" ก่อน "วิ่ง" เพราะ "เดินเร็ว" ไม่ควรเข้าเงื่อนไขวิ่ง
const CARDIO_ACTIVITY_RULES: { match: (t: string) => boolean; title: string; buttonLabel: string; icon: string }[] = [
  { match: (t) => t.includes('เดิน') || t.includes('walk'), title: 'เดิน', buttonLabel: 'เริ่มเดิน', icon: '🚶' },
  { match: (t) => t.includes('วิ่ง') || t.includes('run') || t.includes('jog'), title: 'วิ่ง', buttonLabel: 'เริ่มวิ่ง', icon: '🏃' },
  {
    match: (t) => t.includes('ปั่น') || t.includes('จักรยาน') || t.includes('bike') || t.includes('cycl'),
    title: 'ปั่นจักรยาน',
    buttonLabel: 'เริ่มปั่น',
    icon: '🚴',
  },
  { match: (t) => t.includes('ว่ายน้ำ') || t.includes('swim'), title: 'ว่ายน้ำ', buttonLabel: 'เริ่มว่ายน้ำ', icon: '🏊' },
  { match: (t) => t.includes('hiit'), title: 'HIIT', buttonLabel: 'เริ่ม HIIT', icon: '🔥' },
  { match: (t) => t.includes('โยคะ') || t.includes('yoga'), title: 'โยคะ', buttonLabel: 'เริ่มฝึก', icon: '🧘' },
  { match: (t) => t.includes('พิลาทิส') || t.includes('pilates'), title: 'พิลาทิส', buttonLabel: 'เริ่มฝึก', icon: '🤸' },
  { match: (t) => t.includes('crossfit'), title: 'CrossFit', buttonLabel: 'เริ่มเทรน', icon: '🏋️' },
]

function labelForCardioType(cardioType: string | null): DetectedActivity {
  const t = (cardioType ?? '').trim().toLowerCase()
  if (t) {
    for (const rule of CARDIO_ACTIVITY_RULES) {
      if (rule.match(t)) return { ...rule, isCardio: true }
    }
    // AI อ่านค่ามาได้แต่ไม่ตรงกับ mapping ไหนเลย — โชว์ค่าดิบที่ AI ให้มาแทนที่จะทิ้งข้อมูล
    return { title: cardioType!.trim(), buttonLabel: 'เริ่มกิจกรรม', icon: '⚡', isCardio: true }
  }
  return { title: 'กิจกรรมอิสระ', buttonLabel: 'เริ่มกิจกรรม', icon: '⚡', isCardio: true }
}

// ตรวจว่าวันนี้ (ที่ยังไม่มีโปรแกรมกำหนดไว้) เป็นกิจกรรมประเภทไหนจาก workouts ที่บันทึกไปแล้ว
// เพื่อเอามาแทนชื่อ "บันทึกอิสระ" ตายตัวบน hero card — ใช้ตอนไม่มี scheduledDay เท่านั้น
export function detectTodayActivity(todayWorkouts: Workout[]): DetectedActivity | null {
  if (todayWorkouts.length === 0) return null
  const hasStrength = todayWorkouts.some((w) => w.type === 'strength')
  const cardioWorkouts = todayWorkouts.filter((w) => w.type === 'cardio')

  if (hasStrength && cardioWorkouts.length === 0) {
    return { title: 'เวทเทรนนิ่ง', buttonLabel: 'เริ่มเทรน', icon: '🏋️', isCardio: false }
  }
  if (!hasStrength && cardioWorkouts.length > 0) {
    // ใช้รายการคาร์ดิโอแรกของวัน (ปกติวันที่ import จากรูปจะมีรายการเดียว)
    return labelForCardioType(cardioWorkouts[0].cardio_type ?? null)
  }
  // ผสมทั้งเวทและคาร์ดิโอวันเดียวกัน — ยังไม่มี label เดี่ยวที่สื่อได้ครบ ใช้คำกลาง
  return { title: 'กิจกรรมอิสระ', buttonLabel: 'เริ่มกิจกรรม', icon: '⚡', isCardio: false }
}

// รวมข้อมูลของวันนี้จากรายการ workouts ที่บันทึกไว้
// duration เป็นค่าประมาณ: ถ้ามีหลายรายการ ใช้ช่วงเวลาตั้งแต่รายการแรกถึงรายการสุดท้าย
// ถ้ามีคาร์ดิโอที่ระบุเวลาไว้ ใช้ค่าที่มากกว่าระหว่างสองแบบ
export function computeTodayTotals(todayWorkouts: Workout[]): TodayTotals {
  const strength = todayWorkouts.filter((w) => w.type === 'strength')
  const cardio = todayWorkouts.filter((w) => w.type === 'cardio')

  const volumeKg = strength.reduce((sum, w) => {
    if (w.total_volume_kg !== null && w.total_volume_kg !== undefined) return sum + w.total_volume_kg
    if (w.sets && w.reps && w.weight_kg) return sum + w.sets * w.reps * w.weight_kg
    return sum
  }, 0)

  const sets = strength.reduce((sum, w) => sum + (w.sets ?? 1), 0)

  const cardioDuration = cardio.reduce((sum, w) => sum + (w.duration_min ?? 0), 0)

  let spanDuration: number | null = null
  if (todayWorkouts.length >= 2) {
    const times = todayWorkouts.map((w) => new Date(w.created_at).getTime())
    spanDuration = Math.round((Math.max(...times) - Math.min(...times)) / 60000)
  }

  const durationMin =
    spanDuration !== null ? Math.max(spanDuration, cardioDuration) : cardioDuration > 0 ? cardioDuration : null

  return { volumeKg, sets, durationMin, entryCount: todayWorkouts.length }
}

export interface NextProgramDay {
  day: ProgramDay
  daysAway: number
}

// หาโปรแกรมวันถัดไปที่ตั้งชื่อไว้ (ไล่จากพรุ่งนี้ไปสูงสุด 7 วัน วนกลับมาที่วันนี้ได้ถ้าไม่มีวันอื่น)
export function findNextProgramDay(days: ProgramDay[], fromDow: number): NextProgramDay | null {
  if (days.length === 0) return null
  for (let offset = 1; offset <= 7; offset++) {
    const dow = (fromDow + offset) % 7
    const match = days.find((d) => d.day_of_week === dow)
    if (match) return { day: match, daysAway: offset }
  }
  return null
}

// ==================== แคลอรี่ (ค่าประมาณ) ====================
// ใช้สูตรมาตรฐาน kcal/นาที = (MET x 3.5 x น้ำหนักตัว กก.) / 200
// MET เป็นค่าอ้างอิงทั่วไป ไม่ใช่ค่าที่วัดจริงรายบุคคล
// export ไว้ให้ lib/weeklyCardioVolume.ts เอาไปคำนวณแคลอรี่ของสัปดาห์ซ้ำได้ ไม่ต้องก็อปปี้ตาราง MET
export const CARDIO_MET: Record<string, number> = {
  วิ่ง: 9.0,
  ปั่นจักรยาน: 7.5,
  ว่ายน้ำ: 7.0,
  เดินเร็ว: 4.3,
  กระโดดเชือก: 10.0,
}
export const DEFAULT_CARDIO_MET = 6.0
const STRENGTH_MET = 5.0
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

export function estimateCaloriesToday(
  todayWorkouts: Workout[],
  strengthSessionMinutes: number | null,
  bodyWeightKg: number | null
): number {
  const weight = bodyWeightKg ?? DEFAULT_BODYWEIGHT_KG
  const cardio = todayWorkouts.filter((w) => w.type === 'cardio')

  const cardioKcal = cardio.reduce((sum, w) => sum + estimateCardioSessionCalories(w, weight), 0)

  const strengthKcal = strengthSessionMinutes ? kcalForMinutes(STRENGTH_MET, strengthSessionMinutes, weight) : 0

  return Math.round(cardioKcal + strengthKcal)
}

// ==================== Recovery ต่อกลุ่มกล้ามเนื้อ (ค่าประมาณ) ====================
// แนวคิด: ยิ่งเว้นระยะจากครั้งล่าสุดที่ฝึกกลุ่มนั้นนานเท่าไร แถบจะยิ่งเต็ม (พร้อมฝึกอีกครั้ง)
// recoveryWindowDays เป็นค่าอ้างอิงทั่วไปของกล้ามเนื้อแต่ละกลุ่ม ไม่ใช่ค่าทางสรีรวิทยาที่แม่นยำรายบุคคล
export const RECOVERY_WINDOW_DAYS: Record<string, number> = {
  อก: 2,
  หลัง: 3,
  ขา: 3,
  น่อง: 1.5,
  ไหล่: 2,
  แขน: 1.5,
  แกนกลางลำตัว: 1,
  ทั้งตัว: 2.5,
  อื่นๆ: 2,
}

export function computeRecoveryPct(lastTrainedDate: string | null, muscleGroup: string): number {
  if (!lastTrainedDate) return 100
  const last = new Date(lastTrainedDate + 'T00:00:00')
  const today = new Date(todayStr() + 'T00:00:00')
  const daysSince = Math.round((today.getTime() - last.getTime()) / 86400000)
  const windowDays = RECOVERY_WINDOW_DAYS[muscleGroup] ?? 2
  return Math.max(0, Math.min(100, Math.round((daysSince / windowDays) * 100)))
}

// ใช้ตรรกะวันที่แบบเดียวกับ computeRecoveryPct ด้านบน (แยกออกมาต่างหากเพราะจุดเรียกต้องการตัวเลข "กี่วัน
// ที่แล้ว" ดิบๆ ไปแสดงผล เช่น "ล่าสุดเมื่อ 2 วันก่อน" ไม่ใช่ % ที่คำนวณสัมพัทธ์กับ recovery window ของ
// แต่ละกลุ่มกล้ามเนื้อ) — null เมื่อยังไม่เคยเทรนกลุ่มนี้เลย (ไม่มี lastTrainedDate)
export function daysSinceLastTrained(lastTrainedDate: string | null): number | null {
  if (!lastTrainedDate) return null
  const last = new Date(lastTrainedDate + 'T00:00:00')
  const today = new Date(todayStr() + 'T00:00:00')
  return Math.round((today.getTime() - last.getTime()) / 86400000)
}

// v49: ฟีดแบ็ก "สีเขียว/เหลือง/แดง/ดำอยู่ติดกัน ยังดู UI Dashboard มากกว่า Luxury UI อยากได้ 4 ระดับ:
// 100% เขียวอ่อน, 80% Amber, 50% Orange, ต่ำ Red" — เดิมมี 3 ระดับ (0-40 แดง/41-75 เหลือง/76-100 เขียว)
// ใช้ COLORS.amber ตัวเดียวคุมทั้งช่วงกลาง ไม่มีขั้นบอก "ใกล้เต็ม" (80%) กับ "กำลังฟื้น" (50%) แยกกัน —
// เปลี่ยนเป็น 4 ระดับ ใช้โทเคนสีที่มีอยู่แล้วทั้งหมด (ไม่เพิ่มสีใหม่): COLORS.green (เขียวอ่อนกว่า moss,
// ใช้กับ Fitness Score tier Elite อยู่แล้ว) / COLORS.amber (สีหลักแบรนด์) / FIRE_ACCENT (ส้ม, ใช้กับ Fire
// gradient อยู่แล้ว) / COLORS.rust (แดง) — เกณฑ์ยึดจากตัวอย่างที่ขอเป๊ะ: 67% ต้องได้ "Good"(amber), 0%
// ต้องได้ "Rest"(แดง) จึงวางรอยต่อที่ 65/35 (90 สำหรับ "เกือบเต็ม/Excellent" ที่ 100% ต้องเข้าเกณฑ์แน่ๆ)
//
// พบว่ามีฟังก์ชันป้ายกำกับซ้ำอีก 3 ตัวกระจายอยู่คนละไฟล์ (AICoachCompactCard.tsx: readinessLabel/
// readinessLabelEn, WeeklyVolumeRecoveryCard.tsx: recoveryScoreLabel) แต่ละตัว hardcode เกณฑ์ของตัวเอง
// แยกกัน (บางตัว 3 ระดับ บางตัว 4 ระดับ คนละรอยต่อกันหมด) ผูกกันแค่ด้วยคอมเมนต์ "เกณฑ์เดียวกับ
// recoveryStatusColor" ที่ไม่มีอะไรบังคับให้จริง — รวมเป็นแหล่งเดียว (RECOVERY_TIERS) ตรงนี้ ให้ทุกจุด
// ดึงทั้งสี+ป้ายจากที่เดียวกันจริงๆ แทน
export interface RecoveryTier {
  color: string
  labelEn: string
  labelTh: string
  adviceTh: string
}

// v51: ฟีดแบ็ก "Excellent พื้นเขียวสดไป (~10-15% saturation เกิน), REST แดงจัดไป — Apple แทบไม่ใช้แดงสด
// เลย" — ตอน v49 อ้าง COLORS.green/COLORS.rust ตรงๆ (โทเคนรวมที่ใช้ที่อื่นด้วย — green ผูกกับ Fitness
// Score tier Elite, rust ผูกกับสถานะ error/danger ทั่วแอป) ถ้าลด saturation โทเคนเหล่านั้นตรงๆ จะกระทบ
// จุดอื่นที่ไม่เกี่ยวกับ badge นี้ไปด้วยโดยไม่ได้ตั้งใจ — แยกเป็นค่า hex เฉพาะของ badge สถานะฟื้นตัวเท่านั้น
// (ไม่ผูกกับ COLORS อีกต่อไปสำหรับ 2 ระดับนี้) ตามค่าที่ขอเป๊ะ: Excellent #4ADE80 -> #6CBF74 (เขียวมอสอุ่น
// กว่า, ตัดสดออก), Rest #C1503A -> #C96A57 (แดงอมส้ม ไม่ใช่แดงจัด) — Good/Recovering ยังอ้าง COLORS.amber/
// FIRE_ACCENT เดิม เพราะฟีดแบ็กรอบนี้พูดถึงแค่ 2 ระดับนี้เท่านั้น
// v70: ฟีดแบ็ก "AI Coach ควรอธิบายเหตุผลสั้นๆ (1-2 บรรทัด) ไม่ใช่แค่โชว์ % เฉยๆ — Recovery ต่ำ→แนะนำเบาลง,
// สูง→แนะนำเพิ่ม intensity" — เพิ่ม adviceTh ต่อ tier แทนที่จะเขียนเกณฑ์ใหม่แยกต่างหาก (ใช้รอยต่อ 90/65/35
// เดียวกับ label/สีที่มีอยู่แล้ว กันข้อความกับสี/ป้ายขัดกันเอง เช่น สีบอก "ดี" แต่ข้อความแนะนำของอีกระดับ)
// v71: ฟีดแบ็ก "Training Readiness 48 (Light Training) กับ AI Coach 'เหมาะกับการฝึกความหนักปกติวันนี้'
// ขัดกัน" — สอง metric นี้วัดคนละอย่าง (Training Readiness = ร่างกายโดยรวม, tier นี้ = กล้ามเนื้อกลุ่ม
// เดียวที่จะเล่นวันนี้) เดิมข้อความใช้คำว่า "วันนี้" ทำให้อ่านเหมือนเป็นคำตอบเดียวกับ Training Readiness
// เปลี่ยนมาระบุ scope ชัดว่า "กล้ามเนื้อกลุ่มนี้" แทน ไม่ใช่ภาพรวมวันนี้ ให้สองตัวเลขไม่แย่งกันตอบคำถาม
// "วันนี้ควรหนักแค่ไหน" (เกณฑ์ตัวเลข 90/65/35 ไม่แตะ แก้แค่คำที่ใช้)
const RECOVERY_TIERS: readonly { min: number; color: string; labelEn: string; labelTh: string; adviceTh: string }[] = [
  { min: 90, color: '#6CBF74', labelEn: 'Excellent', labelTh: 'ดีเยี่ยม', adviceTh: 'กล้ามเนื้อกลุ่มนี้พร้อมเต็มที่ เพิ่มน้ำหนักหรือ Volume ได้เลย' },
  { min: 65, color: COLORS.amber, labelEn: 'Good', labelTh: 'ดี', adviceTh: 'กล้ามเนื้อกลุ่มนี้ฟื้นตัวดี เล่นความหนักปกติได้' },
  { min: 35, color: FIRE_ACCENT, labelEn: 'Recovering', labelTh: 'กำลังฟื้นตัว', adviceTh: 'กล้ามเนื้อกลุ่มนี้ยังฟื้นตัวไม่เต็มที่ เล่นเบาถึงปานกลางพอ' },
  { min: 0, color: '#C96A57', labelEn: 'Rest', labelTh: 'ควรพัก', adviceTh: 'กล้ามเนื้อกลุ่มนี้ยังล้าอยู่ แนะนำพักหรือเล่นเบามากๆ' },
]

export function recoveryTier(pct: number): RecoveryTier {
  const tier = RECOVERY_TIERS.find((t) => pct >= t.min) ?? RECOVERY_TIERS[RECOVERY_TIERS.length - 1]
  return { color: tier.color, labelEn: tier.labelEn, labelTh: tier.labelTh, adviceTh: tier.adviceTh }
}

export function recoveryStatusColor(pct: number): string {
  return recoveryTier(pct).color
}

// ฟีดแบ็ก (design review) "Fitness Score 59/Recovery 29% เด่นมาก แต่ยังไม่บอกทันทีว่าวันนี้ควรทำอะไร" —
// คำแนะนำสั้นสำหรับ Recovery แบบ "ภาพรวม" (ค่าเฉลี่ยข้ามกล้ามเนื้อ เช่นวงที่ Header/Hero widget) ใช้รอยต่อ
// เดียวกับ RECOVERY_TIERS เป๊ะ (ไม่คิดเกณฑ์ใหม่) — เขียนแยกจาก adviceTh ของ recoveryTier() ด้านบน เพราะ
// adviceTh พูดถึง "กล้ามเนื้อกลุ่มนี้" (เอกพจน์ ใช้กับรายกลุ่มในลิสต์) ไม่เหมาะกับบริบทค่าเฉลี่ยรวมทุกกลุ่ม
// v2: ฟีดแบ็ก (สกรีนช็อตจริง) "ควรพักหรือลดความหนัก ตกบรรทัดล้นออกนอกวง" — วงที่ใช้จริง (HeroGaugeConcept
// header) เล็กแค่ 76-88px ประโยคยาวเกินไปไม่พอดี ตัดให้สั้นเหลือคำเดียว/วลีสั้นสุดที่ยังสื่อความหมายได้
// ไม่ตกบรรทัด (เทียบกับฝั่ง Fitness Score ที่ใช้ aiCoachStatus ซึ่งสั้นอยู่แล้วโดยธรรมชาติของภาษาอังกฤษ)
// v3: ฟีดแบ็กรอบถัดมา — ระดับ Rest (สำคัญสุด มักเจอบ่อย) ขอคำที่เป็นธรรมชาติกว่า "ควรพัก" เฉยๆ โดยยังสั้น
// พอสำหรับวงเล็ก ("พัก / ลดความหนัก") — DialText มี whitespace-nowrap กันตกบรรทัดอยู่แล้ว (ดู
// HeroGaugeConcept.tsx) จึงไม่เสี่ยงล้นซ้ำแบบประโยคเต็มเดิม แม้จะยาวกว่า 3 ระดับที่เหลือเล็กน้อย
export function recoveryOverallAdviceTh(pct: number): string {
  const tier = recoveryTier(pct).labelEn
  if (tier === 'Excellent') return 'ฝึกหนักได้เลย'
  if (tier === 'Good') return 'ฝึกได้ตามปกติ'
  if (tier === 'Recovering') return 'ฝึกเบาๆ'
  return 'พัก / ลดความหนัก'
}

// ฟีดแบ็ก (จากการตรวจสัญลักษณ์สีทั้งแอปตาม UX deck "เขียว=พร้อม/เหลือง=ระวัง/แดง=หยุด ต้องตรงกันทุกหน้า")
// — เจอ tier -> 🟢/🟡/🔴 emoji ตัวเดียวกันเป๊ะ (Excellent/Good -> 🟢, Recovering -> 🟡, Rest -> 🔴) ถูกเขียน
// แยกเป็น inline ternary ซ้ำกัน 3 จุดอิสระ (DashboardView.tsx "ทำไมวันนี้?", coach/page.tsx เหตุผล,
// AICoachCompactCard.tsx readinessVerdict) — ตอนนี้บังเอิญให้ผลตรงกันทุกที่ แต่เป็นแพทเทิร์นเดียวกับบั๊ก
// "76% Excellent บน Header vs 78% Good ใน Recovery Card" ที่เจอมาก่อนแล้ว (สอง logic แยกกัน คำนวณจาก
// ข้อมูลเดียวกัน วันหนึ่งแก้จุดเดียวแล้วลืมอีกจุด จะกลับมาขัดกันอีก) — รวมเป็นฟังก์ชันเดียวตรงนี้ ให้ทุกจุด
// เรียกใช้ร่วมกันจริงๆ แทน
export function recoveryVerdictEmoji(pct: number): string {
  const tier = recoveryTier(pct).labelEn
  if (tier === 'Excellent' || tier === 'Good') return '🟢'
  if (tier === 'Recovering') return '🟡'
  return '🔴'
}

// ประมาณจำนวนชั่วโมงที่เหลือก่อนกล้ามเนื้อกลุ่มนั้นจะฟื้นตัวเต็มที่ (100%)
// ใช้เวลาจริง ณ ตอนนี้ (ไม่ใช่แค่ระดับวัน) เพื่อให้ตัวเลขชั่วโมงมีความหมาย เช่น "พร้อมฝึกในอีก ~18 ชม."
// คืนค่า null ถ้าฟื้นตัวเต็มที่แล้ว หรือไม่มีประวัติการฝึกกลุ่มนี้ (ไม่ต้องโชว์ข้อความ)
export function computeRecoveryReadyInHours(lastTrainedDate: string | null, muscleGroup: string): number | null {
  if (!lastTrainedDate) return null
  const windowDays = RECOVERY_WINDOW_DAYS[muscleGroup] ?? 2
  const lastMidnight = new Date(lastTrainedDate + 'T00:00:00')
  const hoursSince = (Date.now() - lastMidnight.getTime()) / 3_600_000
  const hoursRemaining = Math.round(windowDays * 24 - hoursSince)
  return hoursRemaining > 0 ? hoursRemaining : null
}

// ==================== แนะนำกลุ่มกล้ามเนื้อที่ควรฝึกวันนี้ ====================
// เลือกจากกลุ่มกล้ามเนื้อที่ recovery % สูงที่สุด (ฟื้นตัวมากที่สุด = พร้อมฝึกที่สุด)
// ในบรรดากลุ่มที่ recoveryPctByMuscle มีข้อมูลให้
export interface MuscleRecommendation {
  muscleGroup: string
  pct: number
  // ถ้าไม่ null แปลว่ากลุ่มนี้ "แทนที่" กลุ่มที่ตารางกำหนดไว้จริง (ค่านี้) เพราะกลุ่มตามตาราง Volume
  // สัปดาห์นี้เกินเป้าหมายไปแล้ว (ดู comment เต็มที่ suggestMuscleToTrain) — ผู้เรียกใช้ค่านี้บอกผู้ใช้ว่า
  // "ตามตารางคือ X แต่แนะนำ Y แทนเพราะ Volume ของ X เกินเป้าแล้ว" แทนที่จะแนะนำเงียบๆ โดยไม่อธิบาย
  scheduleOverriddenFrom?: string | null
  // true เมื่อ recovery % ของกลุ่มที่แนะนำอยู่ต่ำกว่าเกณฑ์ "ดี" (tier Recovering/Rest, <65% — ดู
  // RECOVERY_TIERS) — เกิดได้ 2 กรณี: (1) กลุ่มตามตารางยังไม่ถึงเป้า Volume เลยไม่ถูกเช็ค/แทนที่ แต่ร่างกาย
  // ยังไม่พร้อมเต็มที่ (2) ไม่มีกลุ่มไหนพร้อมฝึกจริงๆ เลยตกกลับไปแนะนำกลุ่ม recovery สูงสุดเท่าที่มี ทั้งที่ยัง
  // ต่ำกว่าเกณฑ์ — ผู้เรียกใช้สัญญาณนี้แนะนำ "ลดความหนัก/เลื่อนออกไปก่อน" แทนคำแนะนำความหนักปกติเงียบๆ
  lowRecoveryCaution?: boolean
}

function withRecoveryCaution(rec: { muscleGroup: string; pct: number; scheduleOverriddenFrom?: string | null }): MuscleRecommendation {
  const tier = recoveryTier(rec.pct).labelEn
  const lowRecoveryCaution = tier === 'Recovering' || tier === 'Rest'
  return lowRecoveryCaution ? { ...rec, lowRecoveryCaution } : rec
}

// scheduledMuscle: ถ้ามีตารางโปรแกรมประจำสัปดาห์ระบุไว้ (เช่น พฤหัส = "ขา") ให้ยึดตามตารางก่อนเป็นค่าเริ่มต้น
// แทนที่จะเลือกจาก recovery % สูงสุดล้วนๆ — ป้องกันกรณีแนะนำสวนทางตาราง (เช่น ตารางบอกขา แต่ recovery
// อกดันสูงกว่าเลยแนะนำอกแทน) ถ้า scheduledMuscle ไม่มีข้อมูล recovery ให้ตกกลับไปใช้ recovery สูงสุดตามเดิม
//
// setsByMuscle/targetsByMuscle (optional — ไม่ระบุ = พฤติกรรมเดิมทุกประการ ไม่กระทบจุดเรียกที่ยังไม่มี
// ข้อมูล volume ให้): ฟีดแบ็ก "Recovery ฟื้นตัวแล้ว ≠ ควรฝึก" — เดิมถ้ามีตารางบังคับ (scheduledMuscle) จะ
// ยึดตามนั้นเสมอไม่สนใจ Volume เลย ทำให้ยังแนะนำ "ขา" ต่อไปแม้ Weekly Volume ของขาเกินเป้าไปแล้ว 17 เซ็ต
// (Recovery ฟื้นตัว ≠ ควรฝึกเพิ่ม) — ตอนนี้เช็คก่อนว่ากลุ่มตามตาราง Volume เกินเป้าหรือยัง ถ้าเกินแล้วและมี
// กลุ่มอื่นที่พร้อมฝึก (recovery tier "ดี" ขึ้นไป) แต่ Volume ยังไม่ถึงเป้า ให้แนะนำกลุ่มนั้นแทน (บันทึกไว้ใน
// scheduleOverriddenFrom ให้ UI อธิบายเหตุผลได้) ถ้าไม่มีทางเลือกที่ดีกว่าจริงๆ (ทุกกลุ่มที่พร้อมก็เกินเป้า
// หมด) ตกกลับไปแนะนำตามตารางเดิม — ไม่มีทางเลือกที่ดีกว่าก็ยังดีกว่าไม่แนะนำอะไรเลย
//
// กรณีไม่มีตารางบังคับเลย (rest day/ยังไม่ตั้งโปรแกรม) ใช้ตรรกะเดียวกันเลือกกลุ่มพร้อมฝึก+ยังไม่ถึงเป้าก่อน
// เสมอ (ไม่ใช่แค่ recovery สูงสุดเฉยๆ) กันแนะนำซ้ำกลุ่มเดิมที่ฟื้นตัวเร็ว (เช่น กลุ่มเล็ก) ทั้งที่ Volume เกินเป้า
// ไปแล้ว ในขณะที่กลุ่มอื่นยังไม่ถึงเป้าเลย
export function suggestMuscleToTrain(
  recoveryPctByMuscle: Record<string, number>,
  scheduledMuscle?: string | null,
  setsByMuscle?: Record<string, number>,
  targetsByMuscle?: Record<string, number>
): MuscleRecommendation | null {
  const entries = Object.entries(recoveryPctByMuscle)
  if (entries.length === 0) return null

  const isOverTarget = (mg: string) => {
    if (!setsByMuscle || !targetsByMuscle) return false
    const target = targetsByMuscle[mg] ?? 0
    return target > 0 && (setsByMuscle[mg] ?? 0) >= target
  }

  const bestReadyAndUnderTarget = (): [string, number] | null => {
    if (!setsByMuscle || !targetsByMuscle) return null
    const list = entries
      .filter(([mg, pct]) => {
        const tier = recoveryTier(pct).labelEn
        const isReady = tier === 'Good' || tier === 'Excellent'
        const target = targetsByMuscle[mg] ?? 0
        const current = setsByMuscle[mg] ?? 0
        return isReady && target > 0 && current < target
      })
      .sort((a, b) => b[1] - a[1])
    return list.length > 0 ? list[0] : null
  }

  if (scheduledMuscle && scheduledMuscle in recoveryPctByMuscle) {
    if (isOverTarget(scheduledMuscle)) {
      const alt = bestReadyAndUnderTarget()
      if (alt) {
        const [muscleGroup, pct] = alt
        // alt มาจาก bestReadyAndUnderTarget ซึ่งกรอง tier "ดี" ขึ้นไปแล้วเสมอ — ไม่มีทาง low recovery
        // แต่ยังห่อด้วย withRecoveryCaution เพื่อความสม่ำเสมอ (no-op ในเคสนี้จริง)
        return withRecoveryCaution({ muscleGroup, pct, scheduleOverriddenFrom: scheduledMuscle })
      }
    }
    // ยังไม่ถึงเป้า Volume เลยไม่ต้องเช็ค/แทนที่ — แต่ recovery อาจยังต่ำอยู่ (เช่น ตารางบอกขา ขา
    // recovery 50%, Volume 8/12 ยังไม่ถึงเป้า) withRecoveryCaution เช็คให้ว่าควรเตือนลดความหนักไหม
    return withRecoveryCaution({ muscleGroup: scheduledMuscle, pct: recoveryPctByMuscle[scheduledMuscle] })
  }

  const alt = bestReadyAndUnderTarget()
  if (alt) {
    const [muscleGroup, pct] = alt
    return withRecoveryCaution({ muscleGroup, pct })
  }

  // ไม่มีกลุ่มไหนพร้อมฝึกจริงๆ (ทุกกลุ่ม recovery ต่ำกว่าเกณฑ์ "ดี" หรือเกินเป้า Volume ไปหมด) — ตกกลับไป
  // แนะนำกลุ่ม recovery สูงสุดเท่าที่มี withRecoveryCaution จะติดธงเตือนถ้า pct นี้ยังต่ำกว่าเกณฑ์อยู่ดี
  const [muscleGroup, pct] = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best), entries[0])
  return withRecoveryCaution({ muscleGroup, pct })
}

export interface TodaysRecommendation extends MuscleRecommendation {
  setsCurrent: number
  setsTarget: number
  // เป้าหมาย - ทำไปแล้วของสัปดาห์นี้ สำหรับกล้ามเนื้อที่แนะนำ — ติดลบได้ (แปลว่าเกินเป้าหมายแล้ว)
  setsRemaining: number
}

// รวมคำแนะนำจาก suggestMuscleToTrain (recovery ล้วนๆ) เข้ากับ Weekly Volume Engine (เป้าหมายเซ็ต/
// สัปดาห์ต่อกลุ่ม) ให้คำแนะนำตอบทั้ง "พร้อมฝึกไหม" และ "ยังขาดอีกเท่าไหร่ถึงเป้าหมาย" ในคำแนะนำเดียว
// แทนที่จะให้ผู้ใช้เปิดดูการ์ด Weekly Volume แยกเองว่ากลุ่มที่แนะนำเหลือโควตาอีกเท่าไหร่
//
// *** Source of Truth ของ "คำแนะนำการฝึกวันนี้" ทั้งแอป *** (ฟีดแบ็ก design review — trace dependency
// ของ 5 widget บน Dashboard พบว่า Training This Week/Weekly Sets/Balance ตอบคนละคำถาม ไม่ควรถูกบังคับ
// ให้ใช้ engine เดียวกัน แต่ "อะไรคือกล้ามเนื้อที่ควรฝึกวันนี้" ต้องมีคำตอบเดียว) — ทุก widget ที่ตอบคำถามนี้
// (ตอนนี้คือ Coach/AICoachCompactCard และ recommendationInsight ด้านล่าง) ต้อง consume ผลลัพธ์จากฟังก์ชัน
// นี้โดยตรง ห้ามคำนวณ "ควรฝึกกลุ่มไหน" ขึ้นใหม่เองอิสระ — ป้องกัน drift แบบเดียวกับที่เคยเจอ (emoji สถานะ
// recovery ที่เคยเขียนแยก 3 จุดจนขัดกันเอง) แต่ละ widget ยัง "แปลผล" เป็นข้อความของตัวเองได้อิสระ
// (format ต่างกัน) ตราบใดที่ข้อมูลต้นทาง (muscleGroup/pct/setsRemaining/scheduleOverriddenFrom/
// lowRecoveryCaution) มาจากก้อนเดียวกันนี้เท่านั้น — ตรงข้ามกับ engine อื่นที่ตอบคำถามคนละแบบและควรแยก
// อิสระต่อไป: findNextProgramDay (Schedule: "วันถัดไปตามโปรแกรมคืออะไร"), volumeStatus (Status: "กลุ่มนี้
// ถึงเป้าหมายเซ็ตหรือยัง"), computeMuscleBalance/computeTrainingBalance (Analytics: "กระจาย volume สมดุล
// ไหม") — 3 engine นี้ไม่ต้องและไม่ควรถูกรวมเข้ากับ Recommendation Engine นี้
export function computeTodaysRecommendation(
  recommendation: MuscleRecommendation | null,
  setsByMuscle: Record<string, number>,
  targetsByMuscle: Record<string, number>
): TodaysRecommendation | null {
  if (!recommendation) return null
  const setsCurrent = setsByMuscle[recommendation.muscleGroup] ?? 0
  const setsTarget = targetsByMuscle[recommendation.muscleGroup] ?? 0
  return { ...recommendation, setsCurrent, setsTarget, setsRemaining: setsTarget - setsCurrent }
}

// ==================== Notifications (Priority 14) ====================
// เดิมกระดิ่งแจ้งเตือนโชว์แค่ "PR ล่าสุด"/"ฝึกมากสุดสัปดาห์นี้" (NotificationButton.tsx) ซึ่งเป็นสรุป
// สถิติเฉยๆ ไม่ได้บอกว่า "ควรทำอะไรต่อ" และกดแล้วก็ไปไหนไม่ได้ — เปลี่ยนเป็นหมวดที่ actionable จริง
// (Workout/Recovery/Progress/Goal) แต่ละรายการมี href พาไปหน้าที่เกี่ยวข้องได้ — สูงสุด 1 รายการต่อหมวด
// กันไม่ให้กลายเป็น noise เยอะๆ ตามที่ขอ "อย่าให้กลายเป็น notification ทั่วไปเยอะๆ"
//
// v: เพิ่มหมวด "pr" กลับมา (ฟีดแบ็ก "เอา Personal Best กลับมาที่ Dashboard") — ตอนย้าย "PR ล่าสุด" ออก
// จากเนื้อหาหลักตอนสร้างระบบนี้ครั้งแรก ตัวการ์ดเดิมไม่มี href (แค่โชว์เฉยๆ ไม่ actionable) เลยไม่ได้ย้าย
// เข้ามาด้วย — รอบนี้ให้ href ไปหน้า /exercises/[name] จริง ทำให้เข้าเกณฑ์ actionable ของระบบนี้แล้ว และ
// จำกัดเฉพาะ PR ที่เพิ่งทำ (ผู้เรียกกรองมาก่อนแล้วว่าไม่เกิน ~7 วัน กันโชว์ PR เก่าเป็นเดือนราวกับเพิ่งเกิด)
export interface DashboardNotification {
  id: string
  category: 'workout' | 'recovery' | 'progress' | 'goal' | 'pr'
  icon: string
  title: string
  detail: string
  href: string
}

export function computeDashboardNotifications(params: {
  // Workout: ชื่อวันตามตารางของวันนี้ (ถ้ามี) — ไม่โชว์ถ้าฝึกวันนี้ไปแล้ว (ไม่มีอะไรให้ "ต้องทำ" แล้ว)
  scheduledWorkoutTitle: string | null
  todayCompleted: boolean
  // Recovery: กล้ามเนื้อที่แนะนำวันนี้ — โชว์เฉพาะตอนพร้อมเต็มที่แล้วจริงๆ (>= FULLY_RECOVERED_PCT)
  recommendation: { muscleGroup: string; pct: number } | null
  // Progress: เทรนด์ body fat ล่าสุด (จาก computeBodyMetricsSummary)
  bodyFatDelta: number | null
  bodyFatIsGood: boolean | null
  // Goal: เหลือเท่าไหร่ถึงเป้าหมาย — ใช้ตัวแรกที่มีข้อมูลจริง (น้ำหนักก่อน ถ้าไม่มีค่อย body fat)
  weightRemaining: { value: number; unit: string } | null
  bodyFatRemaining: number | null
  // PR: สถิติใหม่ล่าสุด (ผู้เรียกกรองมาแล้วว่าต้องเพิ่งทำไม่นาน — ดู comment เต็มด้านบน) น้ำหนักเป็นหน่วย
  // แสดงผลที่แปลงมาแล้ว (kg/lb ตามที่ผู้ใช้ตั้งไว้) ไม่ใช่ kg ดิบเสมอเหมือน weightRemaining
  latestPR: { exerciseName: string; weight: number; unit: string } | null
}): DashboardNotification[] {
  const items: DashboardNotification[] = []

  if (params.scheduledWorkoutTitle && !params.todayCompleted) {
    items.push({
      id: 'notif-workout',
      category: 'workout',
      icon: '🏋️',
      title: 'Workout',
      detail: `วันนี้ถึงวัน ${params.scheduledWorkoutTitle}`,
      href: '/session',
    })
  }

  if (params.recommendation && params.recommendation.pct >= FULLY_RECOVERED_PCT) {
    items.push({
      id: 'notif-recovery',
      category: 'recovery',
      icon: '💪',
      title: 'Recovery',
      detail: `${params.recommendation.muscleGroup}พร้อมฝึกแล้ว`,
      href: '/recovery',
    })
  }

  if (params.bodyFatDelta != null && params.bodyFatIsGood != null) {
    const absDelta = Math.abs(params.bodyFatDelta).toFixed(1)
    items.push({
      id: 'notif-progress',
      category: 'progress',
      icon: params.bodyFatIsGood ? '📉' : '📈',
      title: 'Progress',
      detail: `Body Fat ${params.bodyFatIsGood ? 'ลดลง' : 'เพิ่มขึ้น'} ${absDelta}%`,
      href: '/health',
    })
  }

  if (params.weightRemaining) {
    items.push({
      id: 'notif-goal',
      category: 'goal',
      icon: '🎯',
      title: 'Goal',
      detail: `เหลือ ${params.weightRemaining.value.toFixed(1)} ${params.weightRemaining.unit} ถึงเป้าหมาย`,
      href: '/health',
    })
  } else if (params.bodyFatRemaining != null) {
    items.push({
      id: 'notif-goal',
      category: 'goal',
      icon: '🎯',
      title: 'Goal',
      detail: `เหลือ ${params.bodyFatRemaining.toFixed(1)}% Body Fat ถึงเป้าหมาย`,
      href: '/health',
    })
  }

  if (params.latestPR) {
    items.push({
      id: 'notif-pr',
      category: 'pr',
      icon: '🏆',
      title: 'PR ใหม่',
      detail: `${params.latestPR.exerciseName} ${params.latestPR.weight}${params.latestPR.unit}`,
      href: `/exercises/${encodeURIComponent(params.latestPR.exerciseName)}`,
    })
  }

  return items
}

// ==================== หากล้ามเนื้อที่ตารางโปรแกรมประจำสัปดาห์กำหนดไว้ ====================
// เดิมใช้ title ของวันนั้นเป็นชื่อกลุ่มกล้ามเนื้อโดยตรง เฉพาะกรณีที่ title ตรงกับ MUSCLE_GROUPS พอดี
// (เช่น "ขา", "อก") — ปัญหา: ผู้ใช้จริงมักตั้งชื่อวันแบบบรรยาย (เช่น "Day 5 — Lower", "Push Day") ไม่ใช่
// ชื่อกล้ามเนื้อไทยดิบๆ ทำให้ฟังก์ชันนี้คืน null แทบทุกกรณี ทั้งที่วันนั้นมีท่าตั้งไว้จริงและกล้ามเนื้อ
// ของท่าเหล่านั้นก็ระบุกล้ามเนื้อหลักได้ชัดเจนอยู่แล้ว (ฟีดแบ็ก "AI Coach ยังบอก NEXT ทั้งที่วันนี้คือ
// Day 5 — Lower จริงๆ" — root cause คือจุดนี้ ไม่ใช่ label — "เคารพตารางประจำสัปดาห์" เลยไม่เคยทำงานจริง
// เลยสำหรับผู้ใช้ที่ตั้งชื่อวันแบบบรรยาย ไม่ใช่แค่กระทบ label เดียว)
// แก้โดยเพิ่ม `muscleGroup` (optional) — กล้ามเนื้อหลักที่คำนวณจากท่าจริงในวันนั้น (dominantMuscleGroup
// ใน lib/muscle-groups.ts, ผู้เรียกต้อง query program_exercises ของวันนั้นมาคำนวณเอง) ให้ความสำคัญก่อน
// title matching เสมอเมื่อมีค่า — title matching เดิมยังอยู่เป็น fallback (เผื่อวันที่ยังไม่มีท่าเลย หรือ
//ผู้เรียกเก่าที่ยังไม่ได้ส่ง muscleGroup มา ไม่ breaking change)
export interface ScheduledDay {
  day_of_week: number
  title: string
  muscleGroup?: string | null
}

export function getScheduledMuscleForDay(
  programDays: ScheduledDay[],
  dayOfWeek: number,
  validMuscleGroups: readonly string[]
): string | null {
  const day = programDays.find((d) => d.day_of_week === dayOfWeek)
  if (!day) return null
  if (day.muscleGroup && validMuscleGroups.includes(day.muscleGroup)) return day.muscleGroup
  const title = day.title.trim()
  return validMuscleGroups.includes(title) ? title : null
}

// หาโปรแกรมกล้ามเนื้อ "ครั้งหน้า" — ใช้เมื่อวันนี้ทำครบตามแผนแล้ว (progressPct >= 100) หรือวันนี้เป็นวันพัก
// ไม่มีกล้ามเนื้อผูกไว้ — ไล่หาวันถัดไปในสัปดาห์ (วนสูงสุด 7 วัน) ที่ผูกกับกล้ามเนื้อกลุ่มเดียวชัดเจน
export function getNextScheduledMuscle(
  programDays: ScheduledDay[],
  fromDayOfWeek: number,
  validMuscleGroups: readonly string[]
): string | null {
  for (let offset = 1; offset <= 7; offset++) {
    const dow = (fromDayOfWeek + offset) % 7
    const muscle = getScheduledMuscleForDay(programDays, dow, validMuscleGroups)
    if (muscle) return muscle
  }
  return null
}

// ข้อความนำหน้าคำแนะนำกล้ามเนื้อ — ถ้าวันนี้ทำครบทุกท่าตามแผนแล้ว การพูดว่า "วันนี้ควรเล่น" จะทำให้เข้าใจผิด
// ว่ายังมีอะไรต้องทำอีกวันนี้ ทั้งที่จริงๆ เป็นคำแนะนำสำหรับเซสชันถัดไป
// ถ้ายังทำไม่ครบ (0-99%) ต้องแยกให้ชัดระหว่าง "% ที่ทำได้วันนี้" กับ "กล้ามเนื้อที่แนะนำครั้งหน้า"
// เพราะเป็นคนละเรื่องกัน (progressPct คือความคืบหน้าของแผนวันนี้ ส่วนกล้ามเนื้อที่ต่อท้ายคือคำแนะนำ
// จาก recovery score แยกกันไปเลย) — แยกเป็นคนละบรรทัด (\n) พร้อม emoji ต่างกัน ให้เห็นชัดว่าเป็นคนละเรื่อง
// progressPct: null = ไม่มีแผนวันนี้ (บันทึกอิสระ ยังไม่ได้ล็อกอะไรเลย)
// isForToday: กลุ่มกล้ามเนื้อที่แนะนำคือของ "วันนี้" จริงๆ ไหม (มาจาก isRecommendationForToday ของผู้เรียก
// — ดูจุดคำนวณเต็มที่ DashboardView.tsx/recovery/page.tsx/coach/page.tsx) — เดิมฟังก์ชันนี้ตัดสินคำว่า
// "วันนี้ควรเล่น" จาก progressPct อย่างเดียว ไม่เช็คว่ากลุ่มที่แนะนำจริงๆ ตรงกับตารางวันนี้หรือเปล่า ทำให้
// วันที่ตารางกำหนดไว้แต่ไม่มีท่าเลย (เช่น "Core/Abs" ที่ยังไม่ได้ใส่ท่า — dominantMuscleGroup([]) = null)
// ระบบตกกลับไปแนะนำกล้ามเนื้อของวันถัดไปหรือ recovery สูงสุดแทน แต่ป้ายยังพูดว่า "วันนี้ควรเล่น [กล้ามเนื้อนั้น]"
// ทั้งที่ "Today's Workout" การ์ดข้างๆ ยังโชว์ชื่อวันเดิม (Core/Abs) อยู่ — ขัดกันเองกลางหน้าเดียว
export function recoveryRecommendationLabel(progressPct: number | null, isForToday = true): string {
  if (!isForToday) return 'ครั้งหน้าแนะนำเล่น'
  if (progressPct === null) return 'วันนี้ควรเล่น'
  if (progressPct >= 100) return 'ฝึกวันนี้ไปแล้ว ✅\nครั้งหน้าแนะนำเล่น'
  return `🟢 วันนี้ทำได้ ${progressPct}% ของเป้าหมายแล้ว\n🎯 ครั้งหน้าแนะนำเล่น`
}

// ==================== วอลุ่มรายสัปดาห์ต่อกลุ่มกล้ามเนื้อ ====================
// ค่าเป้าหมายเป็นแนวทางทั่วไปจากหลักการฝึกเพื่อไฮเปอร์โทรฟี (เซ็ตทำงาน/สัปดาห์ต่อกลุ่มกล้ามเนื้อ)
// ไม่ใช่คำแนะนำทางการแพทย์หรือค่าที่เหมาะกับทุกคน ปรับได้ตามโปรแกรมจริง
//
// นี่คือค่า "default" ที่ใช้ตอนผู้ใช้ยังไม่ได้ตั้งเป้าหมายของตัวเอง (ดูตาราง
// weekly_volume_targets ใน supabase/migrations/005_weekly_volume_targets.sql และ
// lib/weeklyVolumeTargets.ts ซึ่งรวมค่าที่ผู้ใช้ตั้งเองเข้ากับ default พวกนี้)
export const DEFAULT_WEEKLY_VOLUME_TARGETS: Record<string, number> = {
  อก: 10,
  หลัง: 10,
  ขา: 12,
  น่อง: 6,
  ไหล่: 8,
  แขน: 8,
  แกนกลางลำตัว: 6,
}

// ชื่อเดิม คงไว้เพื่อไม่กระทบจุดอื่น (เช่น lib/recoveryScore.ts) ที่ยังใช้เป็นค่าคงที่ทั่วไป
// ไม่ใช่เป้าหมายเฉพาะผู้ใช้ — ที่ dashboard/WeeklyVolume ให้ใช้ค่าที่รวมกับ DB แล้วจาก
// lib/weeklyVolumeTargets.ts แทน
export const WEEKLY_VOLUME_TARGETS = DEFAULT_WEEKLY_VOLUME_TARGETS

// บั๊ก (เจอตอนไล่เช็คทั้งโปรเจค): เดิมใช้ reference.getDay()/timezone ของเครื่องที่รันโค้ดตรงๆ ต่างจากทุก
// จุดอื่นในแอปที่ normalize เป็นปฏิทินไทย (Asia/Bangkok) เสมอผ่าน todayStr()/todayDayOfWeek() (lib/weekdays.ts
// — performed_at ทุกแถวก็บันทึกด้วย todayStr() เช่นกัน) — ผู้ใช้ที่เปิดแอปจาก timezone อื่น (เช่น เดินทางไป
// สหรัฐฯ) ใกล้ขอบสัปดาห์ อาจได้ขอบเขตจันทร์-อาทิตย์คนละวันกับที่ workouts จริงถูกบันทึกไว้ — normalize
// reference เป็นวันที่ตามปฏิทินไทยก่อน (bangkokParts เดียวกับ todayStr()) แล้วคำนวณ Mon-Sun ด้วย UTC
// arithmetic ล้วนๆ จากจุดนั้น ไม่พึ่ง timezone เครื่องอีกต่อไปทั้งฟังก์ชัน
export function getWeekRange(reference: Date = new Date()): { start: string; end: string } {
  const anchor = new Date(`${bangkokParts(reference)}T00:00:00Z`)
  const dow = (anchor.getUTCDay() + 6) % 7 // Mon=0..Sun=6
  const monday = new Date(anchor)
  monday.setUTCDate(anchor.getUTCDate() - dow)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  const toIso = (d: Date) => d.toISOString().slice(0, 10)
  return { start: toIso(monday), end: toIso(sunday) }
}

// สัปดาห์ก่อนหน้า ใช้เทียบวอลุ่มเพื่อดูเทรนด์ (สัปดาห์นี้ vs สัปดาห์ที่แล้ว)
export function getPreviousWeekRange(reference: Date = new Date()): { start: string; end: string } {
  const { start } = getWeekRange(reference)
  const monday = new Date(`${start}T00:00:00Z`)
  const prevMonday = new Date(monday)
  prevMonday.setUTCDate(monday.getUTCDate() - 7)
  const prevSunday = new Date(prevMonday)
  prevSunday.setUTCDate(prevMonday.getUTCDate() + 6)
  const toIso = (d: Date) => d.toISOString().slice(0, 10)
  return { start: toIso(prevMonday), end: toIso(prevSunday) }
}

// วอลุ่มเวทเทรนนิ่งรายสัปดาห์ ย้อนหลัง weeksCount สัปดาห์ (รวมสัปดาห์นี้ด้วย) เรียงจากเก่าไปใหม่ —
// ใช้ตรวจจับสัญญาณ Deload (ดู detectDeloadSignal ใน lib/aiCoach.ts) เดินย้อนสัปดาห์ผ่าน
// getPreviousWeekRange ต่อกันเรื่อยๆ (แทนการคำนวณ Mon-Sun เองใหม่) เพื่อใช้ boundary เดียวกันกับ
// getWeekRange ทั้งแอปเป๊ะ (Bangkok-anchored) ไม่มีจุดคำนวณวันที่แยกซ้ำอีกจุด
export function computeRecentWeeklyVolumes(
  workouts: Pick<Workout, 'performed_at' | 'type' | 'total_volume_kg' | 'sets' | 'reps' | 'weight_kg'>[],
  weeksCount: number,
  reference: Date = new Date()
): number[] {
  const ranges: { start: string; end: string }[] = []
  let range = getWeekRange(reference)
  ranges.push(range)
  for (let i = 1; i < weeksCount; i++) {
    range = getPreviousWeekRange(new Date(`${range.start}T00:00:00Z`))
    ranges.push(range)
  }
  ranges.reverse()

  return ranges.map(({ start, end }) =>
    workouts
      .filter((w) => w.type === 'strength' && w.performed_at >= start && w.performed_at <= end)
      .reduce((sum, w) => sum + workoutVolumeKg(w as Workout), 0)
  )
}

// ==================== Insight Card ====================
// การ์ดที่ "คิด" แทนการโชว์ตัวเลขเฉยๆ — สรุปเทรนด์วอลุ่มที่ดีขึ้น หรือเตือนกลุ่มกล้ามเนื้อที่ถูกลืม
export interface Insight {
  id: string
  kind: 'positive' | 'warning'
  icon: string
  title: string
  detail: string
  // v29: ฟีดแบ็ก "Insight ควรเรียงจาก ต้องแก้ → ควรรู้ → ทำได้ดี ไม่ใช่แค่ positive/warning 2 ระดับ" — ใช้
  // เฉพาะ computeHealthTrendInsights (lib/healthInsights.ts) ตอนนี้ ตัวสร้าง insight อื่น (เช่น
  // computeVolumeTrendInsights ด้านล่าง) ไม่ใส่ก็ได้ ไม่บังคับ (optional) เพื่อไม่กระทบจุดใช้เดิม
  // v68: ฟีดแบ็ก "แยก ℹ️ Tracking ออกจาก 🟡 ควรติดตาม — ตอนนี้ทั้งคู่ใช้ tier 'watch' รวมกัน ทั้งที่ 'ควรติดตาม'
  // ควรมีสัญญาณเตือนจริง (เช่น ไขมัน 90 วันขึ้นแตะเกณฑ์) ส่วนน้ำหนักที่ไม่มีเป้าหมายกำกับทิศทาง (isGoodDirection
  // === null ใน computeHealthTrendInsights) เป็นแค่ข้อมูลติดตามเฉยๆ ไม่ได้เตือนอะไร" — เพิ่ม 'tracking' เป็น
  // tier ที่ 4 ต่อท้าย watch ใน priority order (attention > watch > tracking > good)
  tier?: 'attention' | 'watch' | 'tracking' | 'good'
  // v54: ฟีดแบ็ก "การ์ด Insight อ่านเหมือนรายงาน ไม่ใช่ Dashboard — detail เป็น paragraph ยาว อยากได้
  // ↑3.7% · 90 วัน แบบ chip สั้นๆ แยกจากคำแนะนำ" — optional เหมือน tier: มีเฉพาะ computeHealthTrendInsights
  // ตัวสร้าง insight อื่น (เช่น computeVolumeTrendInsights) ไม่ใส่ = undefined = InsightCard fallback ไปโชว์
  // detail แบบเดิมเป๊ะ ไม่กระทบจุดใช้ร่วม (Dashboard/Coach)
  deltaLabel?: string
  actionLabel?: string
  // v60: ฟีดแบ็ก "Top Summary บอก ↓0.4% ไขมัน จากสัปดาห์ที่แล้ว แต่ Body Insights บอก เพิ่มขึ้น 3.7% · 90 วัน
  // — สองตัวเลขนี้อาจถูกทั้งคู่ (คนละช่วงเวลา) แต่ผู้ใช้ยังไม่ช่วยเข้าใจทันที อยากให้บอกว่าแนวโน้มล่าสุดกำลัง
  // ดีขึ้นหรือแย่ลงกว่าที่การ์ดนี้บอก" — optional เหมือน deltaLabel/actionLabel: มีเฉพาะตอน
  // computeHealthTrendInsights ตรวจพบว่าทิศทางล่าสุด (เทียบเอนทรีก่อนหน้าล่าสุด) สวนทางกับทิศทางระยะยาวจริงๆ
  // (ไม่ fabricate — เทียบตัวเลขจริงสองชุดที่คำนวณอยู่แล้วทั้งคู่)
  recentNote?: string
  // v73: ฟีดแบ็ก "'อายุร่างกาย +3.1%' metric ไม่ชัดว่าคืออะไร ควรทำให้ metric ชัดขึ้น" — พบว่ากลไก ⓘ อธิบาย
  // Body Age (infoText บน IconStatCard, ทำไว้ตั้งแต่ v7) ไม่มี IconStatCard ไหนใช้ label "อายุร่างกาย" อยู่จริง
  // ในหน้านี้เลย (ย้ายไปเป็นแค่แถวใน Additional Metrics ตาราง ซึ่งไม่มีช่องอธิบาย) คำอธิบายเลย "หาย" ไปจากทุกจุด
  // ที่ผู้ใช้เห็นค่านี้จริง — เพิ่ม noteText (คำอธิบายสั้นๆ อยู่ตัวเดียวกับ insight ไม่ผูกกับ direction ของ
  // เดลต้าเหมือน recentNote) มีเฉพาะ trend-bodyage-* เท่านั้น
  noteText?: string
  // v75: ฟีดแบ็ก "ไม่ต้องมี 'ดูคำแนะนำ' ก็ได้ เพราะไม่ได้มีปัญหาเฉพาะที่ต้องแก้" — InsightCard ปกติโชว์ลิงก์
  // "ดูคำแนะนำ →" เมื่อมี actionLabel (health/page.tsx แท็บภาพรวมเท่านั้น ดู recommendationsHref) แต่บาง
  // insight ใช้ actionLabel เป็นแค่คำอธิบายหลักฐาน ไม่ใช่คำเตือนที่ต้องมีคำแนะนำจริง (เช่น trend-weight ตอน
  // compositionImproving) — true = ซ่อนลิงก์แม้มี actionLabel, ไม่ระบุ/false = พฤติกรรมเดิม
  hideRecommendationLink?: boolean
  // v77: ฟีดแบ็ก "Body Fat card ยาวกว่าใบอื่นมาก อยากได้ hierarchy ชัดกว่า — แนวโน้มล่าสุดดีขึ้น เป็นบรรทัด
  // label แยกจากตัวเลข ↓0.4 จุดเปอร์เซ็นต์ · 7 วัน แบบเดียวกับ deltaLabel หลัก" — แยก recentNote (ประโยคเดียว
  // รวมกัน) เป็น 2 ฟิลด์: recentTrendLabel (แนวโน้มล่าสุดดีขึ้น/แย่ลง) + recentTrendValue (↓0.4 จุดเปอร์เซ็นต์ ·
  // 7 วัน — สไตล์ chip ตัวหนา สีตามทิศทางดี/แย่ เหมือน deltaLabel) แทนประโยคยาวบรรทัดเดียว — recentNote
  // (string เดิม) ยังอยู่ในระบบเผื่อจุดใช้อื่นในอนาคต แต่ไม่มีจุดไหนตั้งค่าแล้วตอนนี้ (bodyFatPct ทั้ง 2 กรณี
  // เปลี่ยนมาใช้ 2 ฟิลด์ใหม่นี้แทน)
  recentTrendLabel?: string
  recentTrendValue?: string
  recentTrendGood?: boolean
}

// เทียบเซ็ตต่อกลุ่มกล้ามเนื้อของสัปดาห์นี้กับสัปดาห์ที่แล้ว แจ้งเฉพาะกลุ่มที่วอลุ่มเพิ่มขึ้นชัดเจน (>=15%)
export function computeVolumeTrendInsights(
  thisWeekSets: Record<string, number>,
  lastWeekSets: Record<string, number>,
  minLastWeekSets = 3,
  minPctIncrease = 15
): Insight[] {
  const insights: Insight[] = []
  Object.keys(thisWeekSets).forEach((mg) => {
    const cur = thisWeekSets[mg] ?? 0
    const prev = lastWeekSets[mg] ?? 0
    if (prev < minLastWeekSets || cur <= 0) return
    const pct = Math.round(((cur - prev) / prev) * 100)
    if (pct >= minPctIncrease) {
      insights.push({
        id: `volume-${mg}`,
        kind: 'positive',
        icon: '💡',
        title: `${mg} Volume +${pct}%`,
        detail: 'เยี่ยมมาก ทำได้ดีขึ้นจากสัปดาห์ที่แล้ว',
      })
    }
  })
  return insights.sort((a, b) => (a.title < b.title ? -1 : 1))
}

// เตือนกลุ่มกล้ามเนื้อที่ฝึกน้อยกว่ากลุ่มอื่นๆ อย่างมีนัยสำคัญในสัปดาห์นี้ (เทียบสัมพัทธ์กันเอง ไม่ใช่เทียบเป้าหมายคงที่)
// ต่างจาก volumeStatus ตรงที่จับ "ไม่สมดุลระหว่างกลุ่ม" ได้ แม้จะยังไม่ต่ำกว่าเป้าหมายที่ตั้งไว้ก็ตาม
export function computeImbalanceInsights(
  thisWeekSets: Record<string, number>,
  muscles: readonly string[],
  minPctBelowAverage = 40,
  minTotalSets = 12
): Insight[] {
  const total = muscles.reduce((sum, mg) => sum + (thisWeekSets[mg] ?? 0), 0)
  if (total < minTotalSets) return []

  const insights: Insight[] = []
  muscles.forEach((mg) => {
    const own = thisWeekSets[mg] ?? 0
    const others = muscles.filter((m) => m !== mg)
    const othersAvg = others.reduce((sum, m) => sum + (thisWeekSets[m] ?? 0), 0) / others.length
    if (othersAvg <= 0) return
    const pctOfAvg = (own / othersAvg) * 100
    if (pctOfAvg <= 100 - minPctBelowAverage) {
      insights.push({
        id: `imbalance-${mg}`,
        kind: 'warning',
        icon: '⚖️',
        title: `${mg}คุณฝึกน้อยกว่าส่วนอื่น`,
        detail: `น้อยกว่าค่าเฉลี่ยกลุ่มอื่นในสัปดาห์นี้ ${Math.round(100 - pctOfAvg)}%`,
      })
    }
  })
  return insights.sort((a, b) => (a.id < b.id ? -1 : 1))
}
export function computeMissedMuscleInsights(
  recoveryDates: Record<string, string | null>,
  thresholdDays = 7
): Insight[] {
  const today = new Date(todayStr() + 'T00:00:00')
  const insights: Insight[] = []
  Object.entries(recoveryDates).forEach(([mg, dateStr]) => {
    if (!dateStr) return
    const last = new Date(dateStr + 'T00:00:00')
    const daysSince = Math.round((today.getTime() - last.getTime()) / 86400000)
    if (daysSince >= thresholdDays) {
      insights.push({
        id: `missed-${mg}`,
        kind: 'warning',
        icon: '⚠️',
        title: `ไม่ได้ฝึก ${mg}`,
        detail: `${daysSince} วันแล้ว`,
      })
    }
  })
  return insights.sort((a, b) => (a.detail < b.detail ? 1 : -1))
}

// เดิมมี 3 ระดับ (behind/onTrack/met) — "met" ครอบคลุมตั้งแต่พอดีเป้าไปจนถึงเกินเป้าไปเท่าไรก็ได้เหมือนกัน
// หมด ทำให้ทำเกินเป้า 20% กับเกินเป้า 200% (สุ่มเสี่ยง overtraining) หน้าตาเหมือนกันทุกอย่าง — เพิ่ม 2
// ระดับข้างบน (high/veryHigh) แยกความต่างนั้นออกมา โดยไม่แตะความหมาย/รอยต่อของ 3 ระดับเดิมเลย (behind/
// onTrack ยังเทียบกับเป้าหมายที่ปรับตามสัดส่วนวันในสัปดาห์เหมือนเดิมทุกประการ กันไม่ให้เตือน "ตามหลัง"
// เท็จๆ ตั้งแต่ต้นสัปดาห์) รอยต่อ high/veryHigh อิงจาก % ของเป้าหมายเต็มสัปดาห์ (ไม่ใช่ prorated) เพราะ
// "ทำเกินเป้าไปแล้ว" ไม่ต้องรอถึงสิ้นสัปดาห์ถึงจะมีความหมาย — ตัวเลข 200% เป็น product heuristic
// ไม่ใช่เกณฑ์ทางการแพทย์/สรีรวิทยา
export type VolumeStatus = 'behind' | 'onTrack' | 'met' | 'high' | 'veryHigh'

// เทียบเซ็ตที่ทำแล้วกับเป้าหมายที่ปรับตามสัดส่วนวันที่ผ่านไปแล้วของสัปดาห์ (ไม่รอถึงวันอาทิตย์ถึงจะเตือน)
// ฟีดแบ็ก "Weekly Volume สีแดงเยอะเกินไป — ทั้ง Card ดูเหมือนรายงานความผิดพลาด ทั้งที่แค่ทำเกิน Target"
// พร้อมตัวอย่างเจาะจง: 120-160% ของเป้าหมายยังควรเป็น 🟡 (สูงกว่าเป้า ไม่ใช่ปัญหา) มีแค่ >~200% ที่ควรเป็น
// 🔴 (สูงเกินไปจริงๆ) — เดิมรอยต่อ high/veryHigh อยู่ที่ 120% ทำให้ 150-160% ที่ยังถือว่าปกติได้ ถูกตีเป็น
// veryHigh (แดง) ไปแล้ว — ขยับรอยต่อเป็น 200% (2 เท่าของเป้าหมาย) ตามตัวอย่างที่ให้มา (160%/150% ยังเป็น
// high, >200% ถึงจะเป็น veryHigh) — ตัวเลขนี้ผูกกับ optimalVolumeRange ด้านล่างด้วย (derive จากรอยต่อ
// เดียวกันเป๊ะ) เปลี่ยนพร้อมกันทั้งคู่ให้ยังสอดคล้องกัน
export function volumeStatus(setsDone: number, weeklyTarget: number, dayOfWeek1to7: number): VolumeStatus {
  if (weeklyTarget > 0 && setsDone > weeklyTarget * 2) return 'veryHigh'
  if (weeklyTarget > 0 && setsDone > weeklyTarget) return 'high'
  if (setsDone >= weeklyTarget) return 'met'
  const proratedTarget = (weeklyTarget * dayOfWeek1to7) / 7
  if (setsDone >= proratedTarget * 0.8) return 'onTrack'
  return 'behind'
}

export type VolumeBucket = 'under' | 'onTarget' | 'over'

// ฟีดแบ็ก "สีคล้ายกันจนต้องอ่านตัวเลขก่อนถึงจะเข้าใจ — อยาก 🔴 ต่ำกว่าเป้ามาก (ต้องสนใจ) / 🟡 สูงกว่าเป้า
// (ควรระวัง) / 🟢 อยู่ในเป้าหมาย (ดี) ให้ชัดกว่านี้" — รวมความหมาย 3 สีของ VolumeStatus (5 สถานะจาก
// volumeStatus() ด้านบน) เป็นฟังก์ชันเดียวตรงนี้ ใช้ทั้ง WeeklyVolume.tsx (บาร์/badge ต่อแถว + สรุปยอดรวม)
// และ WeeklyInsightsCard.tsx (Dashboard) ให้สี/emoji ตรงกันเป๊ะทุกจุดที่พูดถึง volume status เดียวกัน —
// ก่อนหน้านี้ WeeklyVolume.tsx เขียนแยก 2 จุดเอง (แถวรายกลุ่ม vs สรุปท้ายการ์ด) ด้วย emoji คนละชุด (🔵 vs
// ⚪ สำหรับ "ต่ำกว่าเป้า" เดียวกัน) เป็นบั๊กประเภทเดียวกับที่เจอซ้ำๆ ในเซสชันนี้ (logic เดียวกันเขียนแยก
// อิสระหลายจุด แล้ววันหนึ่งขัดกันเอง) — onTrack (กำลังไปตามจังหวะสัดส่วนวันในสัปดาห์แล้ว ยังไม่ถึงตัวเลข
// เป้าเต็มแต่ไม่ใช่เรื่องน่ากังวล) จัดเข้ากลุ่มเดียวกับ met/high ("ดี") แทนที่จะอยู่กลุ่มเดียวกับ behind
// ("ต่ำกว่าเป้า") เหมือนเดิม เพราะความหมายจริงคือ "กำลังไปได้ดี" ไม่ใช่ "ตามหลัง"
export function volumeBucket(status: VolumeStatus): VolumeBucket {
  if (status === 'behind') return 'under'
  if (status === 'veryHigh') return 'over'
  return 'onTarget'
}

export interface VolumeRange {
  min: number
  max: number
}

// ฟีดแบ็ก "เกินเป้า ≠ แย่เสมอ — เป้าหมายควรเป็นช่วง (Optimal Range) ไม่ใช่จุดเดียว" — เดิมมีแค่ target
// จุดเดียวต่อกลุ่มกล้ามเนื้อ (ตั้งเองได้ใน weekly_volume_targets) แล้วให้ volumeStatus ข้างบนตัดสิน
// met/high/veryHigh จากจุดนั้น — ตรงนี้ไม่ได้เพิ่มตัวเลขใหม่ที่ไม่มีที่มา (ไม่ใช่ค่าตายตัวจากตำรา Fitness
// Science ที่ตรวจสอบไม่ได้) แต่ derive ช่วงจาก target ที่ผู้ใช้ตั้ง/ระบบมีอยู่แล้วเป๊ะ โดยใช้รอยต่อ 2 เท่า
// เดียวกับที่ volumeStatus ใช้แยก high/veryHigh อยู่แล้ว (max = จุดที่ status เปลี่ยนจาก "high" (ยังโอเค)
// เป็น "veryHigh" (น่ากังวล)) — min = target เดิม (จุดที่เพิ่งถึงเป้า) ผลคือช่วง [target, target*2] คือ
// ช่วงที่ status เป็น met/high (สีเขียว/อำพัน "ยังโอเค") ส่วนเกิน max ไปคือ veryHigh (แดง) เท่านั้นที่ถือว่า
// "เกินช่วงที่เหมาะสม" จริงๆ ไม่ใช่แค่เกิน target นิดเดียวก็ถือว่าแย่
export function optimalVolumeRange(target: number): VolumeRange {
  return { min: target, max: Math.round(target * 2) }
}

// วัดความสมดุลของการกระจายเซ็ตข้ามกลุ่มกล้ามเนื้อ — ใช้สัมประสิทธิ์การแปรผัน (coefficient of
// variation) ของสัดส่วน แล้วแปลงกลับเป็น 0-100 (100 = กระจายเท่ากันทุกกลุ่มเป๊ะ, ต่ำ = กระจุกตัว)
// เป็นตัวชี้วัดคร่าวๆ ให้เห็นภาพรวม ไม่ใช่คำแนะนำทางการแพทย์/โภชนาการ
// (เดิมอยู่ใน MuscleShareCard.tsx — ย้ายมาไว้ตรงกลางเพื่อให้ WeeklyVolume เรียกใช้ได้ด้วย)
// บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจครอบใหม่): เดิมกรอง (filter) กลุ่มที่ไม่มีเซ็ตเลย (share === 0) ออกก่อน
// คำนวณ — ถ้าฝึกแค่กลุ่มเดียวทั้งสัปดาห์ (nonZero.length === 1) สูตรจะคืน 100 ("สมดุลดี") ทั้งที่เป็นกรณี
// ไม่สมดุลที่สุดที่เป็นไปได้ (6 ใน 7 กลุ่มไม่ถูกฝึกเลย) — สาเหตุคือกลุ่มที่ไม่มีเซ็ตถูกกันออกจากการคำนวณ
// ค่าเบี่ยงเบนไปเลย ไม่ได้ถูกนับเป็น "เบี่ยงเบนจากค่าเฉลี่ยมากที่สุด" ตามที่ควรจะเป็น — เปลี่ยนมาคำนวณจาก
// shares ทั้งชุดตรงๆ (รวมกลุ่มที่เป็น 0 ด้วย) ให้กลุ่มที่ไม่ถูกฝึกเลยถูกนับเป็นส่วนหนึ่งของค่าเบี่ยงเบนจริง
// ผลคือ Balance % จะขยับสำหรับทุกคน ไม่ใช่แค่เคส edge case นี้ (เดิมกรณีฝึกไม่ครบทุกกลุ่มจะได้คะแนนสูงเกิน
// จริงเสมอ เพราะกลุ่มที่ขาดไปไม่เคยถูกนับเป็นความไม่สมดุลเลย) — ยังคง guard mean<=0 กันหารด้วยศูนย์ตอน
// ไม่มีข้อมูลเลย (shares ทุกตัวเป็น 0)
export function computeMuscleBalance(shares: number[]): number {
  if (shares.length === 0) return 0
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length
  if (mean <= 0) return 0
  const variance = shares.reduce((a, b) => a + (b - mean) ** 2, 0) / shares.length
  const cv = Math.sqrt(variance) / mean
  return Math.max(0, Math.round(100 - cv * 100))
}

export type BalanceStatusTier = 'good' | 'ok' | 'poor'

// ฟีดแบ็ก "'ควรปรับปรุง' ฟังดูเป็นแค่ความเห็น ไม่บอกว่าต้องทำอะไร — เปลี่ยนเป็น 'ต้องปรับสมดุล'
// ให้สื่อ action ชัดกว่า" — เปลี่ยนเฉพาะ tier 'poor' ตัวเดียว (good/ok ยังเป็นคำอธิบายสถานะปกติอยู่แล้ว)
export const BALANCE_STATUS_LABEL: Record<BalanceStatusTier, string> = {
  good: 'สมดุลดี',
  ok: 'ปานกลาง',
  poor: 'ต้องปรับสมดุล',
}

export function balanceStatusTier(score: number): BalanceStatusTier {
  if (score >= 80) return 'good'
  if (score >= 50) return 'ok'
  return 'poor'
}

// "บนลำตัว" vs "ล่างลำตัว" — ใช้ตรวจว่าเซ็ตสัปดาห์นี้เอียงไปทางกลุ่มบนหรือล่างผิดปกติไหม เทียบชื่อกลุ่ม
// เดียวกับที่ VOLUME_MUSCLES ใน lib/muscle-groups.ts ใช้ (แยกไว้เป็น const ในไฟล์นี้แทนการ import ตรงๆ
// ตามรูปแบบเดียวกับ PUSH_MUSCLES/PULL_MUSCLES ใน lib/aiCoach.ts — กันปัญหา circular import)
const UPPER_BODY_MUSCLES = ['อก', 'หลัง', 'ไหล่', 'แขน', 'แกนกลางลำตัว']
const LOWER_BODY_MUSCLES = ['ขา', 'น่อง']

export interface TrainingBalance {
  score: number
  tier: BalanceStatusTier
  // ไม่ null เฉพาะตอนสัดส่วนบน/ล่างลำตัวเอียงเกิน regionSkewThreshold จริง — คือ "เหตุผล" ของคะแนน balance
  regionWarning: string | null
  // 2 กลุ่มที่ % ส่วนแบ่งเซ็ตต่ำกว่าสัดส่วนอุดมคติ (100/จำนวนกลุ่ม%) มากสุด — ใช้เป็นคำแนะนำ "ควรเพิ่ม"
  recommendedMuscles: string[]
  // ฟีดแบ็ก "Balance 58% ต้องอธิบายได้ — โชว์ Upper/Lower % จริงๆ ไม่ใช่แค่คำเตือน" — เดิมค่านี้คำนวณ
  // ไว้ภายในฟังก์ชันอยู่แล้ว (ใช้ตัดสิน regionWarning) แต่ไม่เคย export ออกมาให้ผู้เรียกโชว์ตัวเลขจริงได้
  upperPct: number
  lowerPct: number
}

// รวม Weekly Volume (ข้อมูลดิบ) -> Distribution (% ต่อกลุ่ม, computeMuscleBalance ตัวเดียวกับที่การ์ด
// Muscle Heatmap/Weekly Volume ใช้อยู่แล้ว) -> Target (สัดส่วนอุดมคติต่อกลุ่ม 100/N%) เป็นสรุปเดียว
// "Training Balance": คะแนน+tier บวกเหตุผลเจาะจง (บน/ล่างลำตัวเอียงไปทางไหน ถ้าเอียงเกินเกณฑ์) บวก
// กลุ่มที่ควรเพิ่มสัปดาห์นี้ (2 กลุ่มที่ขาดมากสุด) — เทียบสัดส่วนบน/ล่างกับ "อุดมคติ" ที่คำนวณจากจำนวนกลุ่ม
// กล้ามเนื้อจริงของแต่ละฝั่ง (บน 5 กลุ่ม/ล่าง 2 กลุ่มใน VOLUME_MUSCLES) ไม่ใช่ 50/50 ตรงๆ เพราะฝั่งบนมี
// กลุ่มกล้ามเนื้อมากกว่าฝั่งล่างโดยธรรมชาติ ถ้าเทียบกับ 50/50 จะฟ้องเตือน "บนเยอะไป" ทุกครั้งแม้ฝึกสมดุลจริง
export function computeTrainingBalance(
  setsByMuscle: Record<string, number>,
  muscles: readonly string[],
  regionSkewThreshold = 15
): TrainingBalance | null {
  const totalSets = muscles.reduce((sum, mg) => sum + (setsByMuscle[mg] ?? 0), 0)
  if (totalSets <= 0) return null

  const idealPct = 100 / muscles.length
  const shares = muscles.map((mg) => ((setsByMuscle[mg] ?? 0) / totalSets) * 100)
  const score = computeMuscleBalance(shares)
  const tier = balanceStatusTier(score)

  const upperInSet = UPPER_BODY_MUSCLES.filter((mg) => muscles.includes(mg))
  const lowerInSet = LOWER_BODY_MUSCLES.filter((mg) => muscles.includes(mg))
  const upperActualPct = (upperInSet.reduce((sum, mg) => sum + (setsByMuscle[mg] ?? 0), 0) / totalSets) * 100
  const lowerActualPct = (lowerInSet.reduce((sum, mg) => sum + (setsByMuscle[mg] ?? 0), 0) / totalSets) * 100
  const upperIdealPct = (upperInSet.length / muscles.length) * 100
  const lowerIdealPct = (lowerInSet.length / muscles.length) * 100

  let regionWarning: string | null = null
  if (lowerInSet.length > 0 && lowerActualPct - lowerIdealPct >= regionSkewThreshold) {
    regionWarning = 'สัดส่วนกล้ามเนื้อขา/น่องสูงกว่าฝั่งบนลำตัว'
  } else if (upperInSet.length > 0 && upperActualPct - upperIdealPct >= regionSkewThreshold) {
    regionWarning = 'สัดส่วนกล้ามเนื้อฝั่งบนลำตัวสูงกว่าขา/น่อง'
  }

  const recommendedMuscles = muscles
    .map((mg) => ({ mg, pct: ((setsByMuscle[mg] ?? 0) / totalSets) * 100 }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 2)
    .map((s) => s.mg)

  return { score, tier, regionWarning, recommendedMuscles, upperPct: Math.round(upperActualPct), lowerPct: Math.round(lowerActualPct) }
}

// แปลง TrainingBalance เป็น Insight การ์ดเดียวกับที่ dashboard ใช้อยู่แล้ว (ชุดเดียวกับ
// computeImbalanceInsights/pushPullInsight) — คืนค่า null เมื่อไม่มี regionWarning (สมดุลดีอยู่แล้ว
// หรือเอียงไม่ถึงเกณฑ์) กันไม่ให้เตือนเปล่าๆ ตอนไม่มีปัญหาจริง
export function trainingBalanceInsight(balance: TrainingBalance | null): Insight | null {
  if (!balance || !balance.regionWarning) return null
  return {
    id: 'training-balance-region',
    kind: 'warning',
    icon: '⚖️',
    title: balance.regionWarning,
    detail:
      balance.recommendedMuscles.length > 0
        ? `Training Balance ${balance.score}% (${BALANCE_STATUS_LABEL[balance.tier]}) — แนะนำเพิ่ม ${balance.recommendedMuscles.join(' + ')} สัปดาห์นี้`
        : `Training Balance ${balance.score}% (${BALANCE_STATUS_LABEL[balance.tier]})`,
  }
}

// ฟีดแบ็ก (design review — "Recommendation Consistency") "ตกลงวันนี้ฉันควรทำ Lower หรือพัก?" — carousel
// Insight เดิมไม่มีการ์ดไหนพูดตรงกับสิ่งที่ Coach แนะนำเป๊ะๆ เลย (trainingBalanceInsight ด้านบนตอบคนละ
// คำถาม: "สัดส่วนบน/ล่างเอียงไหม" ไม่ใช่ "วันนี้ควรฝึกอะไร") — การ์ดนี้แปล TodaysRecommendation (Source of
// Truth เดียวกับที่ Coach ใช้ ดู comment เต็มที่ computeTodaysRecommendation) เป็น Insight โดยตรง ไม่คำนวณ
// เลือกกล้ามเนื้อใหม่เอง (format ข้อความต่างจาก Coach ได้ ก้อนข้อมูลต้นทางต้องมาจากที่เดียวกันเท่านั้น)
// ตั้งใจ "ไม่แตะ" trainingBalanceInsight เดิมเลย — สองการ์ดตอบคนละคำถามและอยู่ carousel เดียวกันได้โดยไม่
// ขัดแย้งกัน (ถ้าการ์ดนี้บอก "วันนี้แนะนำ: ขา" ส่วนอีกการ์ดบอก "สัดส่วนขาเยอะไป เพิ่มฝั่งบน" ทั้งคู่ถูกทั้งคู่)
//
// ฟีดแบ็ก (design review รอบใหม่ — "MINT Coach กับ Insight ยังพูดเรื่องเดียวกัน 2 ครั้ง") "แต่ละการ์ดควรมี
// หน้าที่ของตัวเอง: Recovery = สถานะ, MINT Coach = action ('วันนี้ควรทำอะไร'), Insight = เหตุผล/observation
// ไม่ใช่พูดซ้ำคำแนะนำ, Balance = volume" — เดิมทั้ง 2 branch ของฟังก์ชันนี้พูดซ้ำสิ่งที่ MINT Coach
// (AICoachCompactCard.tsx) พูดอยู่แล้วทุกคำ: lowRecoveryCaution branch ซ้ำกับ headline "ควรพักหรือฝึกเบา
// มากๆ" + recoveryTier().adviceTh ("กล้ามเนื้อกลุ่มนี้ยังล้าอยู่ แนะนำพักหรือเล่นเบามากๆ") เป๊ะ ส่วน branch
// ปกติซ้ำกับ headline "Next session · X" + "เหลืออีก N เซ็ตถึงเป้าหมาย" ของ MINT Coach เป๊ะเช่นกัน — ทั้งสอง
// กรณีนี้ Insight จึงไม่มี "ของแถม" อะไรใหม่ให้พูดจริง คืน null แทน (MINT Coach เป็นเจ้าของคำแนะนำ/สถานะพวกนี้
// แต่เพียงผู้เดียว) เหลือไว้แค่กรณีเดียวที่ Insight ยังมีเนื้อหาที่ไม่มีใครพูดถึง: ตอน scheduleOverriddenFrom
// มีค่า (ตารางถูกสลับ) — ใส่กรอบเป็น "เหตุผล" ของกลุ่มตามตารางเดิม (ทำไมถึงควรลด Volume วันนี้) แทนที่จะพูดซ้ำ
// ว่า "วันนี้แนะนำ: X" (นั่นเป็นหน้าที่ MINT Coach เต็มๆ อยู่แล้ว)
export function recommendationInsight(rec: TodaysRecommendation | null): Insight | null {
  if (!rec) return null
  if (rec.lowRecoveryCaution) return null
  if (!rec.scheduleOverriddenFrom) return null
  return {
    id: 'todays-recommendation',
    kind: 'positive',
    icon: '🎯',
    title: `${rec.scheduleOverriddenFrom}ควรลด Volume วันนี้`,
    detail: `ตามตารางคือ${rec.scheduleOverriddenFrom} แต่ Volume การฝึกที่ผ่านมาเพียงพอแล้ว`,
  }
}

export function relativeDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(todayStr() + 'T00:00:00')
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'วันนี้'
  if (diff === 1) return 'เมื่อวาน'
  if (diff > 1) return `${diff} วันที่แล้ว`
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

// ==================== วอลุ่มกล้ามเนื้อที่เพิ่มขึ้นเด่นที่สุด (ใช้ทำ dynamic greeting) ====================
// คนละหน้าที่กับ computeVolumeTrendInsights ด้านบน — ฟังก์ชันนั้นคืน Insight[] (การ์ดเต็ม, อาจได้หลายกลุ่ม)
// ส่วนนี้ต้องการแค่ "กลุ่มเดียวที่เด่นที่สุด" เป็นตัวเลขดิบ ไปประกอบประโยคทักทายบนสุดของ dashboard
export interface VolumeIncrease {
  muscleGroup: string
  pct: number
}

export function computeBestVolumeIncrease(
  thisWeekSets: Record<string, number>,
  lastWeekSets: Record<string, number>,
  minLastWeekSets = 3,
  minPctIncrease = 15
): VolumeIncrease | null {
  let best: VolumeIncrease | null = null
  Object.keys(thisWeekSets).forEach((mg) => {
    const cur = thisWeekSets[mg] ?? 0
    const prev = lastWeekSets[mg] ?? 0
    if (prev < minLastWeekSets || cur <= 0) return
    const pct = Math.round(((cur - prev) / prev) * 100)
    if (pct >= minPctIncrease && (!best || pct > best.pct)) {
      best = { muscleGroup: mg, pct }
    }
  })
  return best
}

// ==================== PR ล่าสุด (quick glance บน Dashboard) ====================
// ไล่ประวัติ (ควรเรียงจากเก่าไปใหม่ก่อนเรียกฟังก์ชันนี้ ไม่งั้นผลลัพธ์ผิด) ทีละแถว พร้อมจำน้ำหนัก
// สูงสุดที่เคยทำของแต่ละท่าไว้ (running best) — แถวไหนหนักกว่า running best เดิม (และเคยมีของเก่ามาก่อน
// ไม่ใช่ครั้งแรกที่ทำท่านั้น) ถือเป็น PR แล้วอัปเดต running best ไปเรื่อยๆ ค่าสุดท้ายที่เจอคือ PR ล่าสุด
export interface LatestPR {
  exerciseName: string
  weightKg: number
  performedAt: string
}

export function computeLatestPR(
  rowsNewestFirst: { exercise_name: string | null; weight_kg: number | null; performed_at: string }[]
): LatestPR | null {
  const sortedOldestFirst = [...rowsNewestFirst]
    .filter((r) => r.exercise_name && r.weight_kg !== null && r.weight_kg > 0)
    .sort((a, b) => a.performed_at.localeCompare(b.performed_at))

  const bestSoFar: Record<string, number> = {}
  let latest: LatestPR | null = null

  for (const r of sortedOldestFirst) {
    const name = r.exercise_name as string
    const weight = r.weight_kg as number
    const prevBest = bestSoFar[name] ?? 0
    if (weight > prevBest) {
      bestSoFar[name] = weight
      if (prevBest > 0) {
        latest = { exerciseName: name, weightKg: weight, performedAt: r.performed_at }
      }
    }
  }
  return latest
}

// ==================== เทียบ Volume เซสชันวันนี้กับเซสชันก่อนหน้าของกล้ามเนื้อกลุ่มเดียวกัน ====================
// ฟีดแบ็ก "State C (เทรนเสร็จแล้ว) ควรโชว์ 'Volume +8% จากครั้งก่อน'" — ต่างจาก Weekly Volume Engine
// (เทียบผลรวมสัปดาห์กับเป้าหมายรายสัปดาห์) ตรงนี้เทียบ "เซสชันต่อเซสชัน" ของกล้ามเนื้อกลุ่มเดียวกัน โดยใช้
// performed_at เป็นตัวแบ่งเซสชัน (แถวที่ performed_at เดียวกัน + muscle_group อยู่ในกลุ่มที่ระบุ = เซสชัน
// เดียวกัน) — ต้องมี volume วันนี้ > 0 (เทรนกลุ่มนี้จริงวันนี้) และมีเซสชันก่อนหน้าอย่างน้อย 1 ครั้งถึงจะ
// เทียบได้ ไม่งั้นคืน null (ไม่เดา/ไม่โชว์ % จากข้อมูลที่ไม่มี)
export interface SessionVolumeChange {
  currentVolumeKg: number
  previousVolumeKg: number
  // null เมื่อเซสชันก่อนหน้ามี volume เป็น 0 (หารด้วยศูนย์ไม่ได้ความหมาย) — currentVolumeKg/previousVolumeKg
  // ยังคืนค่าปกติเผื่อผู้เรียกอยากโชว์ตัวเลขดิบแทน
  changePct: number | null
}

export function computeSessionVolumeChange(
  rows: { muscle_group: string | null; total_volume_kg: number | null; performed_at: string }[],
  muscleGroups: string[],
  today: string
): SessionVolumeChange | null {
  const inGroup = (mg: string | null) => !!mg && muscleGroups.includes(mg)

  const currentVolumeKg = rows
    .filter((r) => r.performed_at === today && inGroup(r.muscle_group))
    .reduce((sum, r) => sum + (r.total_volume_kg ?? 0), 0)
  if (currentVolumeKg <= 0) return null

  const previousDate = rows
    .filter((r) => r.performed_at < today && inGroup(r.muscle_group))
    .map((r) => r.performed_at)
    .sort()
    .pop()
  if (!previousDate) return null

  const previousVolumeKg = rows
    .filter((r) => r.performed_at === previousDate && inGroup(r.muscle_group))
    .reduce((sum, r) => sum + (r.total_volume_kg ?? 0), 0)

  const changePct = previousVolumeKg > 0 ? Math.round(((currentVolumeKg - previousVolumeKg) / previousVolumeKg) * 100) : null
  return { currentVolumeKg, previousVolumeKg, changePct }
}

// ==================== กล้ามเนื้อที่ฝึกมากที่สุดในสัปดาห์นี้ (quick glance บน Dashboard) ====================
// ใช้ thisWeekSets ที่คำนวณไว้แล้ว (รวมเซ็ตต่อกลุ่มกล้ามเนื้อของสัปดาห์นี้) — เลือกกลุ่มที่มีเซ็ตมากที่สุด
export interface TopMuscle {
  muscleGroup: string
  sets: number
}

export function computeTopMuscleThisWeek(thisWeekSets: Record<string, number>): TopMuscle | null {
  const entries = Object.entries(thisWeekSets).filter(([, sets]) => sets > 0)
  if (entries.length === 0) return null
  const [muscleGroup, sets] = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best), entries[0])
  return { muscleGroup, sets }
}

// ==================== ประโยคทักทายแบบมีบริบท (dynamic greeting) ====================
// แทนที่จะทักทายลอยๆ อย่างเดียว ประกอบประโยคที่บอกว่า "วันนี้ควรทำอะไรต่อ" หรือ "มีอะไรดีขึ้นบ้าง"
// ลำดับความสำคัญ: มีโปรแกรมของวันนี้ (มีเรื่องให้ทำต่อ) > วอลุ่มสัปดาห์นี้เพิ่มขึ้นเด่นชัด > เงียบไว้ (ยังไม่มีข้อมูลพอ)
export interface GreetingContext {
  headline: string | null
  detail: string | null
}

export const FULLY_RECOVERED_PCT = 90

export function computeGreetingContext(
  scheduledDayTitle: string | null,
  muscleRecommendation: MuscleRecommendation | null,
  bestVolumeIncrease: VolumeIncrease | null
): GreetingContext {
  if (scheduledDayTitle) {
    const detail =
      muscleRecommendation === null
        ? null
        : muscleRecommendation.pct >= FULLY_RECOVERED_PCT
          ? `${muscleRecommendation.muscleGroup}ฟื้นตัวเต็มที่แล้ว`
          : `${muscleRecommendation.muscleGroup}ฟื้นตัวแล้ว ${muscleRecommendation.pct}%`
    return { headline: `พร้อมสำหรับ ${scheduledDayTitle} หรือยัง?`, detail }
  }

  if (bestVolumeIncrease) {
    // ฟีดแบ็ก (จากรอบตรวจบั๊กทั้งโปรเจครอบใหม่, "Terminology") "Volume ทั้งที่ computeBestVolumeIncrease
    // (ดูจุดเรียกใช้) คำนวณจากจำนวนเซ็ต ไม่ใช่ kg-volume จริง" — ตรงหลักเดียวกับที่แก้ไปแล้วใน
    // HighlightsRow.tsx/session/page.tsx (เอนจินเดียวกันนี้) — ตัดคำว่า "วอลุ่ม" ออก
    return {
      headline: null,
      detail: `จำนวนเซ็ตสัปดาห์นี้ของคุณเพิ่มขึ้น ${bestVolumeIncrease.pct}% จากสัปดาห์ที่แล้ว`,
    }
  }

  return { headline: null, detail: null }
}

// ==================== ข้อความให้กำลังใจแทนตัวเลขล้วนๆ (Motivation) ====================
// ใช้กับการ์ด Weekly Goal — เปลี่ยนจาก "% เฉยๆ" เป็นประโยคที่บอกว่าเหลืออีกกี่ครั้งถึงเป้าหมาย
// weeklyWorkoutGoal นับจากจำนวนวันที่ผู้ใช้ตั้งโปรแกรมไว้เอง (program_days) — ถ้ายังไม่ตั้งเลย ใช้ 3 เป็นค่าเริ่มต้นทั่วไป
// v: ตัดคำว่า "รายสัปดาห์แล้ว" ออกจากปลายประโยค — เดิมข้อความนี้อยู่ใต้การ์ดที่หัวการ์ดเขียนว่า
// "Weekly Goal" อยู่แล้ว และอยู่ข้าง ring ที่โชว์ % ความคืบหน้าไปเป้าหมายเดียวกันอยู่แล้ว การพูดซ้ำว่า
// "เป้าหมายรายสัปดาห์" อีกครั้งในประโยคนี้จึงซ้ำซ้อนกับบริบทรอบข้าง — เหลือแค่ข้อมูลใหม่ (จำนวนครั้งที่เหลือ)
export function computeWorkoutMotivationLabel(workoutsThisWeek: number, weeklyWorkoutGoal: number): string {
  const remaining = weeklyWorkoutGoal - workoutsThisWeek
  if (remaining <= 0) return 'ถึงเป้าหมายแล้ว เก่งมาก 🎉'
  if (remaining === weeklyWorkoutGoal) return `อีก ${remaining} ครั้งถึงเป้าหมาย`
  return `อีกแค่ ${remaining} ครั้งถึงเป้าหมาย`
}

// ==================== Training Quality ต่อกล้ามเนื้อ (Priority 4) ====================
// เดิม FitLog ใช้ "จำนวนเซ็ต" เป็นแกนหลักตัวเดียวของ Training Volume ต่อกล้ามเนื้อ (WeeklyMuscleHeatmap,
// WeeklyVolume ฯลฯ) ซึ่งไม่บอกว่า Volume หนักแค่ไหนจริง (12 เซ็ตน้ำหนักเบา ≠ 12 เซ็ตน้ำหนักหนัก), ฝึกกี่ครั้ง/
// สัปดาห์ (12 เซ็ตในวันเดียว ≠ 12 เซ็ตกระจาย 3 วัน), หรือความหนักเฉลี่ยเป็นอย่างไร — ฟังก์ชันนี้รวบรวม 3
// มิติที่ยังไม่เคยคำนวณต่อกลุ่มกล้ามเนื้อมาก่อน (Volume กก. จริง/Frequency/Intensity) จากแถว workouts ดิบ
// ของสัปดาห์นั้น ให้เรียกครั้งเดียวได้ครบ ไม่ต้องคำนวณซ้ำที่ผู้เรียกแต่ละจุด — recovery % ไม่ได้รวมไว้ในนี้
// เพราะต้องใช้ประวัติย้อนหลังนอกช่วงสัปดาห์ (ดู computeRecoveryPct ด้านบน) ผู้เรียกค่อยประกอบเพิ่มเอง
export interface MuscleTrainingQualityRow {
  muscle_group: string | null
  sets: number | null
  reps: number | null
  weight_kg: number | null
  total_volume_kg: number | null
  rpe: number | null
  performed_at: string
}

export interface MuscleTrainingQuality {
  sets: number
  volumeKg: number
  sessions: number
  avgRpe: number | null
}

export function aggregateMuscleTrainingQuality(rows: MuscleTrainingQualityRow[]): Record<string, MuscleTrainingQuality> {
  const setsByGroup: Record<string, number> = {}
  const volumeByGroup: Record<string, number> = {}
  const sessionDaysByGroup: Record<string, Set<string>> = {}
  const rpeSumByGroup: Record<string, number> = {}
  const rpeCountByGroup: Record<string, number> = {}

  rows.forEach((r) => {
    if (!r.muscle_group) return
    const sets = r.sets ?? 0
    setsByGroup[r.muscle_group] = (setsByGroup[r.muscle_group] ?? 0) + sets
    // total_volume_kg ถ้ามี (แม่นยำกว่าเพราะรวมจากทีละเซ็ตจริง) ไม่งั้น fallback sets*reps*weight_kg —
    // สูตรเดียวกับ lib/workoutDisplay.ts: workoutVolumeKg() แค่ทำงานกับแถวบางส่วนที่ query มา ไม่ใช่ Workout เต็ม
    volumeByGroup[r.muscle_group] =
      (volumeByGroup[r.muscle_group] ?? 0) + (r.total_volume_kg ?? sets * (r.reps ?? 0) * (r.weight_kg ?? 0))
    ;(sessionDaysByGroup[r.muscle_group] ??= new Set()).add(r.performed_at)
    if (r.rpe !== null && r.rpe !== undefined) {
      rpeSumByGroup[r.muscle_group] = (rpeSumByGroup[r.muscle_group] ?? 0) + r.rpe
      rpeCountByGroup[r.muscle_group] = (rpeCountByGroup[r.muscle_group] ?? 0) + 1
    }
  })

  const result: Record<string, MuscleTrainingQuality> = {}
  Object.keys(setsByGroup).forEach((group) => {
    const rpeCount = rpeCountByGroup[group] ?? 0
    result[group] = {
      sets: setsByGroup[group],
      volumeKg: volumeByGroup[group] ?? 0,
      sessions: sessionDaysByGroup[group]?.size ?? 0,
      avgRpe: rpeCount > 0 ? Math.round((rpeSumByGroup[group] / rpeCount) * 10) / 10 : null,
    }
  })
  return result
}

// ==================== Training Consistency ตามแผน (ไม่ใช่ปฏิทินดิบ) ====================
// เดิม ConsistencyStrip.tsx นับ "วันออกกำลังกาย" เทียบกับจำนวนวันทั้งหมดในช่วง (เช่น 7/21 วัน = 33%)
// ทำให้โปรแกรมที่ตั้งไว้แค่ 3 วัน/สัปดาห์ แม้ทำครบทุกวันที่กำหนดจริง ก็ยังโชว์ตัวเลขต่ำอยู่ดี ทั้งที่
// Consistency จริง (เทียบกับแผน) คือ 100% — ฟังก์ชันนี้นับเฉพาะวันที่ "ตั้งโปรแกรมไว้จริง" เป็นตัวส่วน
// plannedWeekdays ว่างเปล่า (ยังไม่ได้ตั้งโปรแกรมเลย) คืน pct เป็น null ให้ผู้เรียกตกกลับไปใช้เมตริกเดิม
// (ไม่มีเส้นฐาน "ตามแผน" ให้เทียบตั้งแต่แรก)
export interface PlannedConsistency {
  plannedCount: number
  completedCount: number
  pct: number | null
}

export function computePlannedConsistency(
  days: { dayOfWeek: number; hasWorkout: boolean }[],
  plannedWeekdays: Set<number>
): PlannedConsistency {
  if (plannedWeekdays.size === 0) return { plannedCount: 0, completedCount: 0, pct: null }
  let plannedCount = 0
  let completedCount = 0
  days.forEach((d) => {
    if (!plannedWeekdays.has(d.dayOfWeek)) return
    plannedCount++
    if (d.hasWorkout) completedCount++
  })
  return { plannedCount, completedCount, pct: plannedCount > 0 ? Math.round((completedCount / plannedCount) * 100) : null }
}

// กลุ่มกล้ามเนื้อที่ปรากฏใน rows เรียงตามลำดับที่เจอครั้งแรก ตัดซ้ำ กรองเฉพาะกลุ่มที่อยู่ใน validGroups —
// helper ภายในของ computePlannedMuscleGroups ด้านล่าง
function uniqueOrderedMuscleGroups(rows: { muscle_group: string | null }[], validGroups: readonly string[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const r of rows) {
    if (r.muscle_group && validGroups.includes(r.muscle_group) && !seen.has(r.muscle_group)) {
      seen.add(r.muscle_group)
      ordered.push(r.muscle_group)
    }
  }
  return ordered
}

// กลุ่มกล้ามเนื้อของ "แผนวันนี้" — มาจาก program_exercises ถ้าตั้งโปรแกรมไว้ ไม่งั้น fallback ไปใช้
// กลุ่มที่เทรนจริงวันนี้ (todayWorkouts กรณีบันทึกอิสระไม่มีโปรแกรม) — ใช้ร่วมกันทั้ง DashboardView.tsx
// (เดสก์ท็อป) และ MobileDashboardView.tsx (ผ่าน getWarmupMoves ใน lib/warmupGuide.ts) กันตรรกะแยกกัน
// สองชุดที่อาจ drift ไม่ตรงกัน
export function computePlannedMuscleGroups(
  todayExercises: { muscle_group: string | null }[],
  todayWorkouts: { muscle_group: string | null }[],
  validGroups: readonly string[]
): string[] {
  const fromPlan = uniqueOrderedMuscleGroups(todayExercises, validGroups)
  if (fromPlan.length > 0) return fromPlan
  return uniqueOrderedMuscleGroups(todayWorkouts, validGroups)
}
