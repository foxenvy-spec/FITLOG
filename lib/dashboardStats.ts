import type { ProgramDay, Workout } from './types'
import { todayStr } from './weekdays'
import type { ExerciseDef } from './exerciseLibrary'
import { COLORS, FIRE_ACCENT } from './theme'

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
}

// scheduledMuscle: ถ้ามีตารางโปรแกรมประจำสัปดาห์ระบุไว้ (เช่น พฤหัส = "ขา") ให้ยึดตามตารางก่อนเสมอ
// แทนที่จะเลือกจาก recovery % สูงสุดล้วนๆ — ป้องกันกรณีแนะนำสวนทางตาราง (เช่น ตารางบอกขา แต่ recovery
// อกดันสูงกว่าเลยแนะนำอกแทน) ถ้า scheduledMuscle ไม่มีข้อมูล recovery ให้ตกกลับไปใช้ recovery สูงสุดตามเดิม
export function suggestMuscleToTrain(
  recoveryPctByMuscle: Record<string, number>,
  scheduledMuscle?: string | null
): MuscleRecommendation | null {
  const entries = Object.entries(recoveryPctByMuscle)
  if (entries.length === 0) return null

  if (scheduledMuscle && scheduledMuscle in recoveryPctByMuscle) {
    return { muscleGroup: scheduledMuscle, pct: recoveryPctByMuscle[scheduledMuscle] }
  }

  const [muscleGroup, pct] = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best), entries[0])
  return { muscleGroup, pct }
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
export function recoveryRecommendationLabel(progressPct: number | null): string {
  if (progressPct === null) return 'วันนี้ควรเล่น'
  if (progressPct >= 100) return 'ฝึกวันนี้ไปแล้ว ✅\nครั้งหน้าแนะนำเล่น'
  return `🟢 วันนี้ทำได้ ${progressPct}% ของเป้าหมายแล้ว\n🎯 ครั้งหน้าแนะนำเล่น`
}

// ==================== Next PR แนะนำ ====================
export interface PRSuggestion {
  exerciseName: string
  lastWeight: number
  lastReps: number
  targetWeight: number
  targetReps: number
}

export function suggestNextPR(exerciseName: string, allTimeEntries: Workout[], exercises: ExerciseDef[] = []): PRSuggestion | null {
  const entries = allTimeEntries.filter((w) => w.type === 'strength' && w.exercise_name === exerciseName && w.weight_kg)
  if (entries.length === 0) return null

  const best = entries.reduce((max, w) => ((w.weight_kg ?? 0) > (max.weight_kg ?? 0) ? w : max), entries[0])
  const lastWeight = best.weight_kg ?? 0
  const lastReps = best.reps ?? 0

  const known = exercises.find((ex) => ex.name === exerciseName || ex.nameTh === exerciseName)
  const increment = known?.equipment === 'ดัมเบล' ? 1 : 2.5

  return {
    exerciseName,
    lastWeight,
    lastReps,
    targetWeight: Math.round((lastWeight + increment) * 10) / 10,
    targetReps: lastReps,
  }
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

export function getWeekRange(reference: Date = new Date()): { start: string; end: string } {
  const dow = (reference.getDay() + 6) % 7 // Mon=0..Sun=6
  const monday = new Date(reference)
  monday.setDate(reference.getDate() - dow)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const toIso = (d: Date) => {
    const offset = d.getTimezoneOffset()
    const local = new Date(d.getTime() - offset * 60000)
    return local.toISOString().slice(0, 10)
  }
  return { start: toIso(monday), end: toIso(sunday) }
}

// สัปดาห์ก่อนหน้า ใช้เทียบวอลุ่มเพื่อดูเทรนด์ (สัปดาห์นี้ vs สัปดาห์ที่แล้ว)
export function getPreviousWeekRange(reference: Date = new Date()): { start: string; end: string } {
  const { start } = getWeekRange(reference)
  const monday = new Date(start + 'T00:00:00')
  const prevMonday = new Date(monday)
  prevMonday.setDate(monday.getDate() - 7)
  const prevSunday = new Date(prevMonday)
  prevSunday.setDate(prevMonday.getDate() + 6)
  const toIso = (d: Date) => {
    const offset = d.getTimezoneOffset()
    const local = new Date(d.getTime() - offset * 60000)
    return local.toISOString().slice(0, 10)
  }
  return { start: toIso(prevMonday), end: toIso(prevSunday) }
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
  tier?: 'attention' | 'watch' | 'good'
  // v54: ฟีดแบ็ก "การ์ด Insight อ่านเหมือนรายงาน ไม่ใช่ Dashboard — detail เป็น paragraph ยาว อยากได้
  // ↑3.7% · 90 วัน แบบ chip สั้นๆ แยกจากคำแนะนำ" — optional เหมือน tier: มีเฉพาะ computeHealthTrendInsights
  // ตัวสร้าง insight อื่น (เช่น computeVolumeTrendInsights) ไม่ใส่ = undefined = InsightCard fallback ไปโชว์
  // detail แบบเดิมเป๊ะ ไม่กระทบจุดใช้ร่วม (Dashboard/Coach)
  deltaLabel?: string
  actionLabel?: string
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

export type VolumeStatus = 'behind' | 'onTrack' | 'met'

// เทียบเซ็ตที่ทำแล้วกับเป้าหมายที่ปรับตามสัดส่วนวันที่ผ่านไปแล้วของสัปดาห์ (ไม่รอถึงวันอาทิตย์ถึงจะเตือน)
export function volumeStatus(setsDone: number, weeklyTarget: number, dayOfWeek1to7: number): VolumeStatus {
  if (setsDone >= weeklyTarget) return 'met'
  const proratedTarget = (weeklyTarget * dayOfWeek1to7) / 7
  if (setsDone >= proratedTarget * 0.8) return 'onTrack'
  return 'behind'
}

// วัดความสมดุลของการกระจายเซ็ตข้ามกลุ่มกล้ามเนื้อ — ใช้สัมประสิทธิ์การแปรผัน (coefficient of
// variation) ของสัดส่วน แล้วแปลงกลับเป็น 0-100 (100 = กระจายเท่ากันทุกกลุ่มเป๊ะ, ต่ำ = กระจุกตัว)
// เป็นตัวชี้วัดคร่าวๆ ให้เห็นภาพรวม ไม่ใช่คำแนะนำทางการแพทย์/โภชนาการ
// (เดิมอยู่ใน MuscleShareCard.tsx — ย้ายมาไว้ตรงกลางเพื่อให้ WeeklyVolume เรียกใช้ได้ด้วย)
export function computeMuscleBalance(shares: number[]): number {
  const nonZero = shares.filter((s) => s > 0)
  if (nonZero.length <= 1) return nonZero.length === 0 ? 0 : 100
  const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length
  const variance = nonZero.reduce((a, b) => a + (b - mean) ** 2, 0) / nonZero.length
  const cv = Math.sqrt(variance) / mean
  return Math.max(0, Math.round(100 - cv * 100))
}

export type BalanceStatusTier = 'good' | 'ok' | 'poor'

export const BALANCE_STATUS_LABEL: Record<BalanceStatusTier, string> = {
  good: 'สมดุลดี',
  ok: 'ปานกลาง',
  poor: 'ควรปรับปรุง',
}

export function balanceStatusTier(score: number): BalanceStatusTier {
  if (score >= 80) return 'good'
  if (score >= 50) return 'ok'
  return 'poor'
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

const FULLY_RECOVERED_PCT = 90

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
    return {
      headline: null,
      detail: `วอลุ่มสัปดาห์นี้ของคุณเพิ่มขึ้น ${bestVolumeIncrease.pct}% จากสัปดาห์ที่แล้ว`,
    }
  }

  return { headline: null, detail: null }
}

// ==================== ข้อความให้กำลังใจแทนตัวเลขล้วนๆ (Motivation) ====================
// ใช้กับการ์ด Weekly Goal — เปลี่ยนจาก "% เฉยๆ" เป็นประโยคที่บอกว่าเหลืออีกกี่ครั้งถึงเป้าหมาย
// weeklyWorkoutGoal นับจากจำนวนวันที่ผู้ใช้ตั้งโปรแกรมไว้เอง (program_days) — ถ้ายังไม่ตั้งเลย ใช้ 3 เป็นค่าเริ่มต้นทั่วไป
export function computeWorkoutMotivationLabel(workoutsThisWeek: number, weeklyWorkoutGoal: number): string {
  const remaining = weeklyWorkoutGoal - workoutsThisWeek
  if (remaining <= 0) return 'ถึงเป้าหมายรายสัปดาห์แล้ว เก่งมาก 🎉'
  if (remaining === weeklyWorkoutGoal) return `อีก ${remaining} ครั้ง ก็ถึงเป้าหมายรายสัปดาห์แล้ว`
  return `อีกแค่ ${remaining} ครั้ง ก็ถึงเป้าหมายรายสัปดาห์แล้ว`
}
