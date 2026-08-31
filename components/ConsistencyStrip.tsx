'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange, computePlannedConsistency, computeCurrentStreakDates, computeLongestStreak } from '@/lib/dashboardStats'
import { daysAgoStr, bangkokParts } from '@/lib/weekdays'
import { workoutVolumeKg } from '@/lib/workoutDisplay'
import { buildDisplaySets } from '@/components/ExerciseCard'
import type { Workout, WorkoutSet } from '@/lib/types'

const WEEKDAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']
const WINDOW_DAYS = 21 // 3 สัปดาห์เต็ม (จ-อา) ย้อนหลัง — พอเห็นแพทเทิร์นโดยไม่ยาวเทอะทะ

// บั๊ก (เจอตอนไล่เช็คทั้งโปรเจค): toIso เดิมแปลง Date -> string ผ่าน timezone ของเครื่องที่รันโค้ด (เหมือน
// getWeekRange เดิมที่เพิ่งแก้ไปใน lib/dashboardStats.ts) ทั้งที่ "วันนี้"/หน้าต่างเวลาทั้งหมดในไฟล์นี้ควร
// ยึดปฏิทินไทยเสมอ (ตรงกับ performed_at ที่บันทึกด้วย todayStr() จาก lib/weekdays.ts) — เปลี่ยน toIso ให้
// เป็นแค่ตัวแปลง Date (ที่ anchor เป็น UTC midnight ของวันนั้นแล้วเสมอ) -> string ตรงๆ ไม่ยุ่งกับ timezone
// เครื่องอีกเลย แล้วใช้ bangkokToday() ด้านล่างเป็นจุดเริ่มต้นแทน new Date() ตรงๆ ทุกจุดที่เคยพลาด
function toIso(d: Date) {
  return d.toISOString().slice(0, 10)
}

// "วันนี้" ตามปฏิทินไทยเสมอ คืนเป็น Date ที่ anchor ไว้ที่เที่ยงคืน UTC ของวันนั้น — เลขคณิตวันต่อจากนี้
// (บวก/ลบวัน, หา day-of-week) ต้องใช้ .setUTCDate()/.getUTCDate()/.getUTCDay() เท่านั้น ไม่ใช่ .setDate()/
// .getDay() ปกติ (ซึ่งจะกลับไปอ่านตาม timezone เครื่องอีกครั้งหลัง anchor เป็น UTC แล้ว)
function bangkokToday(): Date {
  return new Date(`${bangkokParts(new Date())}T00:00:00Z`)
}

function shortThaiDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

type Level = 'none' | 'low' | 'mid' | 'high'

const LEVEL_COLOR: Record<Level, string> = {
  none: '#2E333A',
  low: '#C1503A',
  mid: '#E8A33D',
  high: '#7A9B57',
}

const LEVEL_LABEL: Record<Level, string> = {
  high: 'ดีมาก',
  mid: 'ปานกลาง',
  low: 'น้อย',
  none: 'ไม่มีข้อมูล',
}

// รายละเอียดพอสำหรับ tooltip/แผงสรุปวัน — ไม่ต้อง fetch ซ้ำตอนคลิก
const WINDOW_ROW_SELECT =
  'performed_at, sets, reps, weight_kg, total_volume_kg, type, exercise_name, muscle_group, cardio_type, duration_min, calories_kcal'

// ฟีดแบ็ก "Consistency ยังมีพื้นที่ให้พัฒนาเยอะ — เพิ่ม Trend (ดีขึ้น/แย่ลงจากช่วงก่อน) + Milestone
// (อีกกี่วันถึงจะทำสถิติใหม่)" — ทั้งสองอย่างต้องการข้อมูลนอกช่วงหน้าต่าง 21 วันที่มีอยู่เดิม:
// prevWindowRows (ช่วง 21 วันก่อนหน้าช่วงปัจจุบัน สำหรับ trend) และ streakRows (ประวัติย้อนหลัง 400 วัน
// สำหรับ current/best streak ตัวเดียวกับที่ DashboardView.tsx ใช้คำนวณ streak หลักของแอปอยู่แล้ว — เรียก
// computeCurrentStreakDates/computeLongestStreak ตัวเดียวกันเป๊ะ ไม่คำนวณสูตรแยกใหม่)
async function fetchConsistencyData(supabase: ReturnType<typeof createClient>) {
  const today = bangkokToday()
  const windowStart = new Date(today)
  windowStart.setUTCDate(windowStart.getUTCDate() - (WINDOW_DAYS - 1))
  const prevWindowEnd = new Date(windowStart)
  prevWindowEnd.setUTCDate(prevWindowEnd.getUTCDate() - 1)
  const prevWindowStart = new Date(prevWindowEnd)
  prevWindowStart.setUTCDate(prevWindowStart.getUTCDate() - (WINDOW_DAYS - 1))
  const { start: weekStart, end: weekEnd } = getWeekRange()
  const streakCutoff = daysAgoStr(400)

  const [{ data: windowRows }, { data: prevWindowRows }, { data: weekRows }, { data: programDayRows }, { data: streakRows }] =
    await Promise.all([
      supabase.from('workouts').select(WINDOW_ROW_SELECT).gte('performed_at', toIso(windowStart)).lte('performed_at', toIso(today)),
      supabase.from('workouts').select('performed_at').gte('performed_at', toIso(prevWindowStart)).lte('performed_at', toIso(prevWindowEnd)),
      supabase.from('workouts').select('exercise_name, type, sets, reps, weight_kg, total_volume_kg').gte('performed_at', weekStart).lte('performed_at', weekEnd),
      // ฟีดแบ็ก "Consistency ควรวัดกับ Plan ไม่ใช่ปฏิทินดิบ — โปรแกรมตั้งไว้ 3 วัน/สัปดาห์ ทำครบ 3 วันทุก
      // สัปดาห์ควรนับ 100% ไม่ใช่ 7/21 = 33%" — ดึงวันที่ตั้งโปรแกรมไว้ (day_of_week) มาเป็นตัวส่วนแทนที่จะ
      // นับ "วันออกกำลังกาย" เทียบกับจำนวนวันในช่วงเฉยๆ เหมือนเดิม
      supabase.from('program_days').select('day_of_week'),
      supabase.from('workouts').select('performed_at').gte('performed_at', streakCutoff).order('performed_at', { ascending: false }),
    ])

  const windowWorkouts = (windowRows as Workout[]) ?? []

  const setsByDay: Record<string, number> = {}
  const workoutsByDay: Record<string, Workout[]> = {}
  windowWorkouts.forEach((r) => {
    if (r.type === 'strength') setsByDay[r.performed_at] = (setsByDay[r.performed_at] ?? 0) + (r.sets ?? 0)
    ;(workoutsByDay[r.performed_at] ??= []).push(r)
  })

  const weekWorkouts = (weekRows as Workout[]) ?? []
  const weekVolumeKg = weekWorkouts.filter((w) => w.type === 'strength').reduce((s, w) => s + workoutVolumeKg(w), 0)
  const weekExerciseCount = new Set(weekWorkouts.map((w) => w.exercise_name).filter(Boolean)).size

  const plannedWeekdays = new Set(((programDayRows as { day_of_week: number }[]) ?? []).map((d) => d.day_of_week))

  // ช่วงก่อนหน้า (21 วันก่อน windowStart) เทียบเปอร์เซ็นต์ตาม Plan แบบเดียวกับช่วงปัจจุบัน (ใช้ plannedWeekdays
  // เดียวกัน — โปรแกรมที่ตั้งไว้ตอนนี้ถือว่าใช้ตลอดทั้งสองช่วงเพื่อความง่าย ไม่มีประวัติ versioning ของ program_days)
  const prevWorkoutDates = new Set(((prevWindowRows as { performed_at: string }[]) ?? []).map((r) => r.performed_at))
  const prevDays: { dayOfWeek: number; hasWorkout: boolean }[] = []
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(prevWindowStart)
    d.setUTCDate(d.getUTCDate() + i)
    prevDays.push({ dayOfWeek: d.getUTCDay(), hasWorkout: prevWorkoutDates.has(toIso(d)) })
  }
  const previousConsistencyPct = computePlannedConsistency(prevDays, plannedWeekdays).pct

  // Current/Best streak (นับวัน ไม่ใช่สัปดาห์ — ตัวเดียวกับ Dashboard "Workout Streak") ใช้หา milestone
  const distinctStreakDates = Array.from(new Set(((streakRows as { performed_at: string }[]) ?? []).map((r) => r.performed_at)))
  const currentStreak = computeCurrentStreakDates(distinctStreakDates, plannedWeekdays).size
  const bestStreakEver = computeLongestStreak(distinctStreakDates, plannedWeekdays)

  return {
    setsByDay,
    workoutsByDay,
    windowStartIso: toIso(windowStart),
    todayIso: toIso(today),
    weekVolumeKg,
    weekExerciseCount,
    plannedWeekdays,
    previousConsistencyPct,
    currentStreak,
    bestStreakEver,
  }
}

// ฟีดแบ็ก "ปฏิทิน 21 วันมีพื้นที่ว่างเยอะบนจอกว้าง — ทำปุ่มลูกศร < > เลื่อนดูช่วงก่อนหน้าได้ จะเห็นภาพรวม
// ระยะยาวดีขึ้น" — เลือกทำ pagination (ไม่ขยาย WINDOW_DAYS ตายตัว) เพราะขยายจะเพิ่มความสูงการ์ดบนมือถือ
// ที่เพิ่งผ่านการลดความสูงมาหลายรอบก่อนหน้า — ดึงเฉพาะแถวดิบของ "ช่วง WINDOW_DAYS วัน ที่ weekOffset ช่วง
// ก่อนช่วงปัจจุบัน" (weekOffset=0 ไม่เรียกฟังก์ชันนี้เลย ใช้ data จาก fetchConsistencyData ตรงๆ ซ้อนกันพอดี
// อยู่แล้ว ไม่ query ซ้ำ) — Consistency%/สัปดาห์ติด (StatTile) ยังคงอิงจาก fetchConsistencyData (วันนี้)
// เสมอ ไม่เปลี่ยนตามช่วงที่กำลังเลื่อนดู เพราะเป็น "สถานะตอนนี้" ไม่ใช่สถิติของช่วงย้อนหลังที่กำลังดู
async function fetchWindowRows(supabase: ReturnType<typeof createClient>, weekOffset: number) {
  const refEnd = bangkokToday()
  refEnd.setUTCDate(refEnd.getUTCDate() - weekOffset * WINDOW_DAYS)
  const refStart = new Date(refEnd)
  refStart.setUTCDate(refStart.getUTCDate() - (WINDOW_DAYS - 1))
  const { data: rows } = await supabase
    .from('workouts')
    .select(WINDOW_ROW_SELECT)
    .gte('performed_at', toIso(refStart))
    .lte('performed_at', toIso(refEnd))
  const windowWorkouts = (rows as Workout[]) ?? []
  const setsByDay: Record<string, number> = {}
  const workoutsByDay: Record<string, Workout[]> = {}
  windowWorkouts.forEach((r) => {
    if (r.type === 'strength') setsByDay[r.performed_at] = (setsByDay[r.performed_at] ?? 0) + (r.sets ?? 0)
    ;(workoutsByDay[r.performed_at] ??= []).push(r)
  })
  return { setsByDay, workoutsByDay, windowStartIso: toIso(refStart), windowEndIso: toIso(refEnd) }
}

// คำนวณกริดปฏิทิน (padded/workoutDays/consecutiveWeeks) จากชุด setsByDay/workoutsByDay ของ "ช่วงใดก็ได้"
// แยกออกมาจาก consistencyPct (ซึ่งต้องอิงวันนี้เสมอ ไม่ผูกกับช่วงที่กริดนี้กำลังแสดง — ดู liveStats/
// displayGrid ในคอมโพเนนต์หลัก) ให้ใช้ร่วมกันได้ทั้งช่วงปัจจุบันและช่วงย้อนหลังที่เลื่อนดู
function buildCalendarGrid(windowStartIso: string, setsByDay: Record<string, number>, workoutsByDay: Record<string, Workout[]>) {
  const maxSets = Math.max(1, ...Object.values(setsByDay))
  const days: { iso: string; level: Level; workouts: Workout[] }[] = []
  const start = new Date(`${windowStartIso}T00:00:00Z`)
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + i)
    const iso = toIso(d)
    const sets = setsByDay[iso] ?? 0
    const dayWorkouts = workoutsByDay[iso] ?? []
    let level: Level = 'none'
    if (sets > 0) {
      const ratio = sets / maxSets
      level = ratio > 2 / 3 ? 'high' : ratio > 1 / 3 ? 'mid' : 'low'
    } else if (dayWorkouts.length > 0) {
      // บั๊ก: วันที่มีแต่คาร์ดิโอ (ไม่มี strength sets เลย) setsByDay[iso] เป็น 0 ตกไปที่ level='none'
      // เดียวกับวันพักจริงๆ — สีเซลล์/นับ "วันออกกำลังกาย"/"สัปดาห์ติด" มองข้ามวันนั้นไปหมด ทั้งที่กดดูราย
      // ละเอียด (DayDetail) กลับเห็นรายการคาร์ดิโอปกติ ขัดกันเอง — ให้วันที่มีคาร์ดิโออย่างน้อย 1 รายการนับ
      // เป็น 'low' (ระดับต่ำสุดที่ยังไม่ใช่ none) แทน — ไม่ได้จัดระดับความหนักของคาร์ดิโอเทียบกับ maxSets
      // (คนละหน่วยกัน วัดจากจำนวนเซ็ต strength ล้วนๆ) แค่ทำให้นับว่า "มีกิจกรรมวันนั้น" ถูกต้อง
      level = 'low'
    }
    days.push({ iso, level, workouts: dayWorkouts })
  }
  const firstDow = (new Date(`${days[0].iso}T00:00:00Z`).getUTCDay() + 6) % 7 // 0=จันทร์
  const padded: (typeof days[number] | null)[] = Array(firstDow).fill(null)
  padded.push(...days)
  while (padded.length % 7 !== 0) padded.push(null)
  const workoutDays = days.filter((d) => d.level !== 'none').length
  const weeks: Level[][] = []
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7).map((d) => d?.level ?? 'none'))
  let consecutiveWeeks = 0
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].some((l) => l !== 'none')) consecutiveWeeks++
    else break
  }
  return { padded, workoutDays, consecutiveWeeks }
}

// สรุปแถวเดียวเป็นข้อความสั้นๆ ใช้ทั้งใน title (hover) และแผงรายละเอียด
function describeWorkout(w: Workout): string {
  if (w.type === 'strength') {
    const parts = [w.exercise_name ?? 'ท่าออกกำลังกาย']
    if (w.sets && w.reps) parts.push(`${w.sets}x${w.reps}`)
    if (w.weight_kg) parts.push(`${w.weight_kg}กก.`)
    return parts.join(' ')
  }
  const parts = [w.cardio_type ?? 'คาร์ดิโอ']
  if (w.duration_min) parts.push(`${w.duration_min} นาที`)
  return parts.join(' ')
}

// ฟีดแบ็ก "ตอน Streak ขยับแตะสถิติใหม่ (เช่น 2 วัน → 3 วัน) ใส่ Micro-celebration เล็กๆ เช่นไอคอนไฟสั่น
// ดุ๊กดิ๊ก+ประกาย" — เทียบ currentStreak กับค่าล่าสุดที่เคยเห็น (เก็บใน localStorage ฝั่งเครื่อง ไม่ต้อง
// query/ตาราง DB เพิ่ม) ถ้าเพิ่มขึ้นจริง = เพิ่งต่อ streak สำเร็จ ให้เล่น animation ครั้งเดียวแล้วจำค่าใหม่
// ไว้ — ครั้งแรกที่ไม่เคยมีค่าเก่าเลย (localStorage ว่าง) แค่บันทึก baseline ไว้เฉยๆ ไม่เล่น animation
// (กันกรณีเปิดแอปครั้งแรกแล้วมี streak อยู่แล้วจากประวัติเก่า ไม่ควรฉลองทันทีที่โหลดหน้า)
const STREAK_SEEN_KEY = 'fitlog:lastSeenStreak'

export default function ConsistencyStrip() {
  const supabase = createClient()
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null)
  const [showMoreStats, setShowMoreStats] = useState(false)
  const [celebrateStreak, setCelebrateStreak] = useState(false)
  // ฟีดแบ็ก "ทำปุ่มลูกศร < > เลื่อนดูสัปดาห์ก่อนหน้า" — 0 = ช่วงปัจจุบัน (WINDOW_DAYS วันล่าสุด), 1 = ช่วง
  // WINDOW_DAYS วันก่อนหน้านั้น, ฯลฯ ย้อนไปได้ไม่จำกัด (แอปส่วนตัว ไม่ต้อง cap)
  const [weekOffset, setWeekOffset] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['consistency-strip'],
    queryFn: () => fetchConsistencyData(supabase),
    staleTime: 60_000,
  })

  // เฉพาะตอนเลื่อนดูช่วงอื่นที่ไม่ใช่ปัจจุบัน (weekOffset !== 0) ถึงจะ query เพิ่ม — ช่วงปัจจุบันใช้ data
  // จาก fetchConsistencyData ข้างบนตรงๆ อยู่แล้ว (ดู activeWindow ด้านล่าง) ไม่ต้อง fetch ซ้ำ
  // ระหว่างเช็คบัค: สลับ weekOffset ทำให้ queryKey เปลี่ยน react-query เลยดรอปข้อมูลเก่าทันทีเป็นค่าเริ่มต้น
  // (data=undefined จนกว่าจะโหลดช่วงใหม่เสร็จ) กระพริบเป็น skeleton ทุกครั้งที่กดปุ่มลูกศร ทั้งที่กริดเก่า
  // ยังโชว์ต่อได้ระหว่างรอ — placeholderData: keepPreviousData (v5 API) ให้คงข้อมูลของช่วงก่อนหน้าไว้โชว์
  // จนกว่าช่วงใหม่จะโหลดเสร็จแทน — แต่ query นี้ enabled:false อยู่ตอน weekOffset===0 (ไม่เคย fetch มาก่อน
  // เลย) ทำให้ปุ่ม ‹ ครั้งแรกจากช่วงปัจจุบัน ยังไม่มี placeholder ให้ keepPreviousData ใช้ ยังกระพริบอยู่ดี
  // (บั๊กที่เจอตอน re-review) — แก้ด้วย activeWindow fallback ด้านล่างแทน: ถ้ายังไม่มี offsetWindow เลย
  // (ครั้งแรกจริงๆ) ให้ใช้กริดของช่วงปัจจุบัน (data) ไปพลางๆ ก่อน ดีกว่าโชว์ skeleton ว่างเปล่า — ครั้งต่อๆ
  // ไปจะมี placeholder จาก keepPreviousData ให้ใช้เองแล้วไม่ต้องพึ่ง fallback นี้อีก
  const { data: offsetWindow } = useQuery({
    queryKey: ['consistency-strip-window', weekOffset],
    queryFn: () => fetchWindowRows(supabase, weekOffset),
    enabled: weekOffset !== 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })

  const currentLiveWindow = data
    ? { setsByDay: data.setsByDay, workoutsByDay: data.workoutsByDay, windowStartIso: data.windowStartIso, windowEndIso: data.todayIso }
    : null
  const activeWindow = weekOffset === 0 ? currentLiveWindow : offsetWindow ?? currentLiveWindow

  function goToOffset(next: number) {
    setSelectedDayIso(null)
    setWeekOffset(Math.max(0, next))
  }

  useEffect(() => {
    if (!data) return
    let stored: number | null = null
    try {
      const raw = window.localStorage.getItem(STREAK_SEEN_KEY)
      stored = raw != null ? Number(raw) : null
    } catch {
      // localStorage ใช้ไม่ได้ (private mode/ปิดไว้) — ข้าม celebration เฉยๆ ไม่ throw
      return
    }
    if (stored != null && data.currentStreak > stored) {
      setCelebrateStreak(true)
      const t = setTimeout(() => setCelebrateStreak(false), 1500)
      try {
        window.localStorage.setItem(STREAK_SEEN_KEY, String(data.currentStreak))
      } catch {
        // ignore
      }
      return () => clearTimeout(t)
    }
    try {
      window.localStorage.setItem(STREAK_SEEN_KEY, String(data.currentStreak))
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.currentStreak])

  const selectedDayWorkouts = selectedDayIso ? activeWindow?.workoutsByDay[selectedDayIso] ?? [] : null

  // ฟีดแบ็ก "ปุ่มเลื่อนดูสัปดาห์ก่อนหน้าไม่ควรทำให้ Consistency%/สัปดาห์ติด เปลี่ยนไปด้วย — ทั้งคู่สื่อ
  // 'สถานะตอนนี้' ไม่ใช่สถิติของช่วงที่กำลังเลื่อนดู" — คำนวณจาก data (ช่วง WINDOW_DAYS วันล่าสุดจริง)
  // เสมอ ไม่ขึ้นกับ weekOffset เลย
  const liveStats = useMemo(() => {
    if (!data) return null
    const dayEntries: { dayOfWeek: number; hasWorkout: boolean }[] = []
    const start = new Date(`${data.windowStartIso}T00:00:00Z`)
    for (let i = 0; i < WINDOW_DAYS; i++) {
      const d = new Date(start)
      d.setUTCDate(d.getUTCDate() + i)
      dayEntries.push({ dayOfWeek: d.getUTCDay(), hasWorkout: (data.workoutsByDay[toIso(d)] ?? []).length > 0 })
    }
    // ฟีดแบ็ก "Training Consistency ควรวัดกับ Plan ไม่ใช่ปฏิทินดิบ" — เดิม workoutDays (นับวันที่มี log
    // เทียบกับ WINDOW_DAYS ทั้งหมด) ทำให้โปรแกรมที่ตั้งไว้ 3 วัน/สัปดาห์แล้วทำครบทุกวันที่กำหนดจริง ยังโชว์
    // "7/21 วัน" (33%) ทั้งที่ Consistency จริงคือ 100% — computePlannedConsistency (lib/dashboardStats.ts)
    // นับเฉพาะวันที่ "ตั้งโปรแกรมไว้จริง" (day_of_week ตรงกับ program_days) เป็นตัวส่วนแทน
    const { plannedCount, completedCount: completedPlannedCount, pct: consistencyPct } = computePlannedConsistency(
      dayEntries,
      data.plannedWeekdays
    )
    // "สัปดาห์ติด"/"วันออกกำลังกาย" ของช่วงปัจจุบัน (ไม่ใช่ของช่วงที่กำลังเลื่อนดู)
    const { consecutiveWeeks, workoutDays } = buildCalendarGrid(data.windowStartIso, data.setsByDay, data.workoutsByDay)
    return { consistencyPct, plannedCount, completedPlannedCount, consecutiveWeeks, workoutDays }
  }, [data])

  // กริดปฏิทินที่ "เห็นจริง" บนจอ — เปลี่ยนตาม weekOffset (ตัวเดียวที่ pagination มีผล)
  const displayGrid = useMemo(() => {
    if (!activeWindow) return null
    return buildCalendarGrid(activeWindow.windowStartIso, activeWindow.setsByDay, activeWindow.workoutsByDay)
  }, [activeWindow])

  return (
    <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden lg:grid lg:grid-cols-3">
      {/* left: calendar grid + legend — spans 2/3 on lg+ so the 4 stat tiles can sit
          beside it as a 2x2 block instead of stacking in a row underneath */}
      {/* ฟีดแบ็ก "Consistency สามารถลดความสูงลงได้ประมาณ 15-20%" — ลด padding แนวตั้งของทั้งสองโซน
          (หัวการ์ด + บริเวณปฏิทิน) ลงเล็กน้อย ไม่แตะขนาดกริดปฏิทิน/ขนาดตัวอักษร (เสี่ยงกระทบ readability
          มากกว่า) รวมกันแล้วลดความสูงจริงได้ตามสัดส่วนที่ขอโดยไม่ต้องตัดข้อมูลออก */}
      <div className="lg:col-span-2 lg:border-r lg:border-line">
        <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] tracked uppercase text-muted">Consistency</p>
            {activeWindow && (
              <p className="text-[11px] text-muted mt-0.5">
                {weekOffset === 0 ? `ย้อนหลัง ${WINDOW_DAYS} วัน` : `ย้อนหลัง ${WINDOW_DAYS} วัน (${weekOffset} ช่วงก่อนหน้า)`} •{' '}
                {shortThaiDate(activeWindow.windowStartIso)} - {shortThaiDate(activeWindow.windowEndIso)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* ฟีดแบ็ก "ทำปุ่มลูกศร < > เลื่อนดูสัปดาห์ก่อนหน้า จะช่วยเห็นภาพรวมระยะยาวได้ดีขึ้น" — เลื่อนทีละ
                WINDOW_DAYS วัน (เท่ากับความกว้างกริดที่แสดง) ปุ่ม › (ไปข้างหน้า/กลับสู่ปัจจุบัน) ปิดเมื่อ
                weekOffset=0 อยู่แล้ว (ไปข้างหน้ากว่า "ตอนนี้" ไม่ได้) */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goToOffset(weekOffset + 1)}
                aria-label="ดูช่วงก่อนหน้า"
                className="w-6 h-6 rounded-full flex items-center justify-center text-muted hover:text-ink border border-line"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => goToOffset(weekOffset - 1)}
                disabled={weekOffset === 0}
                aria-label="ดูช่วงถัดไป"
                className="w-6 h-6 rounded-full flex items-center justify-center text-muted hover:text-ink border border-line disabled:opacity-30 disabled:pointer-events-none"
              >
                ›
              </button>
            </div>
            <a href="/calendar" className="text-[11px] text-amber shrink-0">
              ดูปฏิทินทั้งหมด →
            </a>
          </div>
        </div>

        <div className="px-4 pb-3 flex gap-4 flex-wrap">
          <div className="max-w-[220px] shrink-0">
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {WEEKDAY_LABELS.map((d) => (
                <p key={d} className="text-[10px] text-muted text-center">
                  {d}
                </p>
              ))}
            </div>
            {!displayGrid ? (
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 21 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-md bg-surface2 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1.5">
                {displayGrid.padded.map((day, i) => {
                  if (!day) return <div key={`pad-${i}`} className="aspect-square" />
                  const hasData = day.workouts.length > 0
                  const tooltip = hasData
                    ? `${shortThaiDate(day.iso)} — ${day.workouts.map(describeWorkout).join(', ')}`
                    : `${shortThaiDate(day.iso)} — ${LEVEL_LABEL[day.level]}`
                  const isSelected = selectedDayIso === day.iso
                  return (
                    <button
                      key={day.iso}
                      type="button"
                      title={tooltip}
                      disabled={!hasData}
                      onClick={() => setSelectedDayIso((cur) => (cur === day.iso ? null : day.iso))}
                      className="aspect-square rounded-md disabled:cursor-default enabled:cursor-pointer transition-shadow"
                      style={{
                        backgroundColor: LEVEL_COLOR[day.level],
                        boxShadow: isSelected ? '0 0 0 2px #E8A33D' : 'none',
                      }}
                    />
                  )
                })}
              </div>
            )}

            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {(['high', 'mid', 'low', 'none'] as Level[]).map((level) => (
                <span key={level} className="flex items-center gap-1.5 text-[10px] text-muted">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: LEVEL_COLOR[level] }} />
                  {LEVEL_LABEL[level]}
                </span>
              ))}
            </div>
          </div>

          {/* detail of a clicked day — sits in the space beside the calendar, only rendered once a day is selected */}
          {selectedDayIso && selectedDayWorkouts && (
            <DayDetail
              key={selectedDayIso}
              iso={selectedDayIso}
              workouts={selectedDayWorkouts}
              onClose={() => setSelectedDayIso(null)}
            />
          )}
        </div>
      </div>

      {/* ฟีดแบ็ก "Consistency กินพื้นที่มาก — Hero ควรเหลือแค่ % + streak ส่วน กก./ท่าออกกำลังกาย ควรซ่อนไว้
          ก่อน" — เดิมโชว์ 4 tile พร้อมกันเสมอ ลดเหลือ 2 tile หลัก (Consistency%, สัปดาห์ติด) ที่เห็นทันที
          ส่วนน้ำหนักรวม/ท่าออกกำลังกายซ่อนหลังปุ่ม toggle แทน (ข้อมูลเดิมทุกตัวเลข ไม่มีอะไรหายไป แค่ไม่ต้อง
          โชว์พร้อมกันทั้งหมดตั้งแต่แรกเห็น) */}
      <div className="border-t border-line lg:border-t-0 lg:col-span-1">
        <div className="grid grid-cols-2 divide-x divide-line">
          {/* ฟีดแบ็ก "ปุ่มเลื่อนดูปฏิทินไม่ควรทำให้ Consistency%/สัปดาห์ติด เปลี่ยน" — ทั้งคู่อ่านจาก
              liveStats (คำนวณจาก data ตรงๆ เสมอ) ไม่ใช่ displayGrid ที่เปลี่ยนตาม weekOffset */}
          {liveStats?.consistencyPct !== null && liveStats?.consistencyPct !== undefined ? (
            <StatTile
              value={`${liveStats.consistencyPct}%`}
              label="Training Consistency"
              caption={`${liveStats.completedPlannedCount}/${liveStats.plannedCount} ครั้งตามแผน`}
              trend={data?.previousConsistencyPct != null ? liveStats.consistencyPct - data.previousConsistencyPct : null}
            />
          ) : (
            <StatTile value={liveStats?.workoutDays ?? 0} label="วันออกกำลังกาย" caption={`จาก ${WINDOW_DAYS} วัน`} />
          )}
          {/* ฟีดแบ็ก "'สัปดาห์ติด' + caption 'สถิติดีที่สุด' อ่านเหมือนเป็น all-time record ระบบเดียวกับ
              'สถิติเดิม X วัน' ของ Day Streak ด้านล่าง ทั้งที่จริงคนละ metric — แถมไม่มีการคำนวณ longest
              week-streak ตลอดกาลจริงๆ ด้วย (consecutiveWeeks นับแค่ย้อนหลังจากขอบเขต WINDOW_DAYS ที่แสดง
              อยู่ ไม่ได้เทียบกับสถิติสูงสุดที่เคยทำได้เลย)" — caption เดิมเป็นข้อความหลอกที่ไม่มีตัวเลขรองรับ
              จริง เปลี่ยนเป็นข้อความที่ตรงกับสิ่งที่นับจริง (ขอบเขต 3 สัปดาห์ที่เห็นในปฏิทินด้านซ้าย) */}
          <StatTile value={liveStats?.consecutiveWeeks ?? 0} label="สัปดาห์ติด" caption={`จาก ${Math.ceil(WINDOW_DAYS / 7)} สัปดาห์ล่าสุด`} />
        </div>
        <button
          type="button"
          onClick={() => setShowMoreStats((v) => !v)}
          className="w-full text-center text-[11px] font-medium py-2 border-t border-line"
          style={{ color: '#E8A33D' }}
        >
          {showMoreStats ? 'ซ่อนรายละเอียดเพิ่มเติม ↑' : 'ดูรายละเอียดเพิ่มเติม →'}
        </button>
        {showMoreStats && (
          <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
            <StatTile value={data ? Math.round(data.weekVolumeKg).toLocaleString('th-TH') : 0} label="กก. น้ำหนักรวม" caption="สัปดาห์นี้" />
            <StatTile value={data?.weekExerciseCount ?? 0} label="ท่าออกกำลังกาย" caption="สัปดาห์นี้" />
          </div>
        )}
      </div>

      {/* ฟีดแบ็ก "เพิ่ม milestone: อีก 2 วัน → ทำสถิติใหม่ — Gamification จะทำให้ Dashboard มีแรงจูงใจมากขึ้น"
          — เทียบ current streak (นับวัน) กับสถิติสูงสุดที่เคยทำได้ ตัวเดียวกับ Dashboard "Workout Streak"
          (ดู comment เต็มที่ fetchConsistencyData) ไม่โชว์ตอนไม่มีข้อมูลพอ (ยังไม่เคยมี streak เลย) */}
      {data && data.bestStreakEver > 0 && (
        <div className="lg:col-span-3 border-t border-line px-4 py-2.5">
          {data.currentStreak >= data.bestStreakEver ? (
            <p className="text-[11px] text-center" style={{ color: '#E8A33D' }}>
              {/* ฟีดแบ็ก "ตอน Streak ขยับแตะสถิติใหม่ ใส่ Micro-celebration เล็กๆ ไอคอนไฟสั่นดุ๊กดิ๊ก+ประกาย" —
                  celebrateStreak คำนวณจากการเทียบ localStorage ด้านบน เล่นครั้งเดียวตอน currentStreak
                  เพิ่งขยับขึ้นจริง (ไม่ใช่ทุกครั้งที่โหลดหน้า) */}
              <span className={celebrateStreak ? 'streak-celebrate inline-block' : 'inline-block'}>🔥</span> กำลังทำสถิติต่อเนื่องที่ดีที่สุดของคุณอยู่ ({data.currentStreak} วันติด)
            </p>
          ) : (
            <p className="text-[11px] text-center text-muted">
              <span className={celebrateStreak ? 'streak-celebrate inline-block' : 'inline-block'}>🔥</span> อีก <span className="text-amber font-medium">{data.bestStreakEver - data.currentStreak}</span> วัน → ทำสถิติต่อเนื่องใหม่
              (สถิติเดิม {data.bestStreakEver} วัน)
            </p>
          )}
        </div>
      )}
      <style jsx>{`
        @keyframes streak-celebrate-shake {
          0%,
          100% {
            transform: rotate(0deg) scale(1);
          }
          20% {
            transform: rotate(-14deg) scale(1.15);
          }
          40% {
            transform: rotate(12deg) scale(1.15);
          }
          60% {
            transform: rotate(-8deg) scale(1.1);
          }
          80% {
            transform: rotate(6deg) scale(1.05);
          }
        }
        .streak-celebrate {
          animation: streak-celebrate-shake 0.6s ease-in-out 2;
          filter: drop-shadow(0 0 6px rgba(232, 163, 61, 0.7));
        }
        @media (prefers-reduced-motion: reduce) {
          .streak-celebrate {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}

function DayDetail({ iso, workouts, onClose }: { iso: string; workouts: Workout[]; onClose: () => void }) {
  const supabase = createClient()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const strengthIds = useMemo(() => workouts.filter((w) => w.type === 'strength').map((w) => w.id), [workouts])

  const { data: setsByWorkoutId } = useQuery({
    queryKey: ['consistency-strip-day-sets', iso, strengthIds.join(',')],
    queryFn: async () => {
      const { data } = await supabase.from('workout_sets').select('*').in('workout_id', strengthIds).order('set_number')
      const byId: Record<string, WorkoutSet[]> = {}
      ;((data as WorkoutSet[]) ?? []).forEach((s) => {
        ;(byId[s.workout_id] ??= []).push(s)
      })
      return byId
    },
    enabled: strengthIds.length > 0,
    staleTime: 60_000,
  })

  const totalSets = workouts.filter((w) => w.type === 'strength').reduce((s, w) => s + (w.sets ?? 0), 0)
  const totalVolumeKg = workouts.filter((w) => w.type === 'strength').reduce((s, w) => s + workoutVolumeKg(w), 0)

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex-1 min-w-[180px] border-l border-line pl-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] text-ink font-medium">{shortThaiDate(iso)}</p>
          <p className="text-[9px] text-muted mt-0.5">
            {workouts.length} รายการ • {totalSets} เซ็ต • {Math.round(totalVolumeKg).toLocaleString('th-TH')} กก.
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-[11px] text-muted hover:text-ink shrink-0 leading-none px-1" aria-label="ปิด">
          ✕
        </button>
      </div>
      <div className="mt-2 overflow-y-auto max-h-[220px]">
        {workouts.length === 0 ? (
          <p className="text-[11px] text-muted py-2">ไม่มีข้อมูลวันนี้</p>
        ) : (
          <ul className="space-y-1">
            {workouts.map((w, i) => {
              const displaySets = w.type === 'strength' ? buildDisplaySets(w, setsByWorkoutId?.[w.id] ?? []) : []
              const canExpand = w.type === 'strength' && displaySets.length > 0
              const isOpen = expandedIds.has(w.id)
              return (
                <li key={w.id ?? i}>
                  <button
                    type="button"
                    disabled={!canExpand}
                    onClick={() => toggle(w.id)}
                    className="w-full text-left text-[11px] text-ink py-0.5 flex items-center justify-between gap-2 disabled:cursor-default enabled:cursor-pointer group"
                  >
                    <span>{describeWorkout(w)}</span>
                    {canExpand && (
                      <span
                        className="text-muted text-[9px] shrink-0 transition-transform group-hover:text-amber"
                        style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
                        aria-hidden="true"
                      >
                        ▼
                      </span>
                    )}
                  </button>
                  {isOpen && canExpand && (
                    <div className="grid grid-cols-3 gap-1 mb-1.5 mt-1">
                      {displaySets.map((s) => (
                        <div key={s.id} className="rounded-md bg-surface2 px-1.5 py-1 text-center">
                          <p className="text-[8px] tracked uppercase text-muted">เซ็ต {s.set_number}</p>
                          <p className="font-mono text-[10px] font-semibold text-ink tabular">
                            {s.weight_kg ?? '—'}กก. × {s.reps ?? '—'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatTile({
  value,
  label,
  caption,
  trend,
}: {
  value: number | string
  label: string
  caption: string
  // ฟีดแบ็ก "Consistency ควรเห็นเทรนด์ ดีขึ้น/แย่ลง ไม่ใช่แค่เลขลอยๆ" — เทียบกับช่วง 21 วันก่อนหน้า
  // (ตัวเลขเดียวกับ computePlannedConsistency ที่ใช้คำนวณค่าปัจจุบัน) undefined = ไม่มีข้อมูลพอเทียบ
  trend?: number | null
}) {
  return (
    <div className="px-3 py-3 text-center flex flex-col items-center justify-center">
      <p className="font-mono text-lg text-amber">{value}</p>
      <p className="text-[10px] text-ink mt-0.5">{label}</p>
      <p className="text-[9px] text-muted">{caption}</p>
      {trend != null && trend !== 0 && (
        <p className="text-[9px] mt-0.5" style={{ color: trend > 0 ? '#7A9B57' : '#C1503A' }}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% จากช่วงก่อน
        </p>
      )}
    </div>
  )
}
