// Workout Report (MVP) — สรุปช่วง 7/30 วันของ /stats ให้อ่านเป็น "เรื่องเดียวกัน" แทนสถิติเรียงกัน
// (ฟีดแบ็ก "ควรตอบ 4 คำถาม: ทำอะไรไป / สม่ำเสมอแค่ไหน / ร่างกายตอบสนองอย่างไร / ควรทำอะไรต่อ")
// ทุกฟังก์ชันในไฟล์นี้เป็น pure function — reuse ของที่มีอยู่แล้วเป็นหลัก (computeTodayTotals,
// computePlannedConsistency, computeRecentWeeklyVolumes, computeBodyMetricsSummary) ไม่คิดสูตรใหม่
// ยกเว้นจุดที่ไม่มีของเดิมให้ใช้จริงๆ (ดูคอมเมนต์ต่อฟังก์ชัน)
import type { Workout } from './types'
import { workoutVolumeKg } from './workoutDisplay'
import { computeTodayTotals, getWeekRange, getPreviousWeekRange } from './dashboardStats'
import { bangkokParts } from './weekdays'
import type { MetricDelta } from './bodyMetricsSummary'

export interface PeriodTotals {
  workoutCount: number
  totalVolumeKg: number
  totalSets: number
  totalDurationMin: number
}

// ตัวเลขรวมของช่วง — สูตรเดียวกับ totals useMemo ใน app/(app)/stats/page.tsx ทุกจุด (workoutCount นับแบบ
// "วันที่มีการฝึก" (distinct performed_at) เหมือนที่หน้านั้นเรียกว่า activeDays ไม่ใช่จำนวนแถว workouts
// ดิบ เพราะ 1 วันฝึกมีได้หลายแถว/หลายท่า — durationMin รวมจาก computeTodayTotals ต่อวันเหมือนเดิม
// (เป็น proxy เวลาจริง ไม่ใช่เลขประมาณ: ใช้ duration_min ของคาร์ดิโอ หรือช่วงเวลาระหว่างท่าแรก-ท่าสุดท้าย
// ของวันนั้นสำหรับวันที่มีแต่เวท)
export function computePeriodTotals(workouts: Workout[]): PeriodTotals {
  const strengthWorkouts = workouts.filter((w) => w.type === 'strength')
  const totalVolumeKg = strengthWorkouts.reduce((sum, w) => sum + workoutVolumeKg(w), 0)
  const totalSets = strengthWorkouts.reduce((sum, w) => sum + (w.sets ?? 1), 0)
  const workoutCount = new Set(workouts.map((w) => w.performed_at)).size

  const byDay = new Map<string, Workout[]>()
  workouts.forEach((w) => {
    const bucket = byDay.get(w.performed_at) ?? []
    bucket.push(w)
    byDay.set(w.performed_at, bucket)
  })
  let totalDurationMin = 0
  byDay.forEach((dayWorkouts) => {
    totalDurationMin += computeTodayTotals(dayWorkouts).durationMin ?? 0
  })

  return { workoutCount, totalVolumeKg: Math.round(totalVolumeKg), totalSets, totalDurationMin }
}

// เปอร์เซ็นต์เปลี่ยนแปลงเทียบช่วงก่อนหน้าความยาวเท่ากัน — สูตรเดียวกับที่ /stats (Training Volume)
// และ WeeklyVolumeRecoveryCard.tsx ใช้อยู่แล้วทุกจุด ไม่คิดสูตรใหม่ (null เมื่อช่วงก่อนหน้าไม่มีข้อมูลอ้างอิง
// เลย กันหารด้วย 0/เลขเปอร์เซ็นต์ที่ไม่มีความหมาย เช่น 0 -> 5 ครั้ง = "เพิ่มขึ้นไม่จำกัด")
export function computePctChange(current: number, previous: number): number | null {
  return previous > 0 ? Math.round(((current - previous) / previous) * 100) : null
}

// สร้าง { dayOfWeek, hasWorkout }[] ของ N วันล่าสุด (รวมวันนี้) ให้ computePlannedConsistency
// (lib/dashboardStats.ts) ใช้ได้ตรงๆ — ตัวช่วยเดียวกับที่ ConsistencyStrip.tsx/DashboardView.tsx ทำ
// อยู่แล้วสำหรับหน้าต่าง 21 วัน แค่ทำให้พารามิเตอร์ปรับความยาวได้แทนที่จะ hardcode 21 อีกจุดที่สาม —
// ไม่แตะสองจุดเดิม (ยังคง inline ของตัวเองเหมือนเดิมทุกประการ) todayIso ต้องเป็นวันที่ปัจจุบันจริง (Bangkok)
// ตามรูปแบบ YYYY-MM-DD (ดู lib/weekdays.ts todayStr()) — รับเป็น parameter แทนเรียก new Date() เองในนี้
// เพื่อให้ฟังก์ชันนี้เป็น pure/testable เหมือนฟังก์ชันอื่นในไฟล์นี้และใน dashboardStats.ts
export function buildTrainedDayEntries(
  trainedDateSet: Set<string>,
  windowDays: number,
  todayIso: string
): { dayOfWeek: number; hasWorkout: boolean }[] {
  const entries: { dayOfWeek: number; hasWorkout: boolean }[] = []
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(`${todayIso}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - i)
    const iso = d.toISOString().slice(0, 10)
    entries.push({ dayOfWeek: d.getUTCDay(), hasWorkout: trainedDateSet.has(iso) })
  }
  return entries
}

export interface DailyVolumePoint {
  date: string
  value: number
}

// วอลุ่มเวทรายวัน N วันล่าสุด (สำหรับ Training Trend มุมมอง 7D) — ไม่มีฟังก์ชันเดิมทำ bucket รายวันของ
// วอลุ่มเวทมาก่อน (computeRecentWeeklyVolumes ทำแค่รายสัปดาห์) จึงเป็นฟังก์ชันใหม่จริง แต่โครงเดียวกับ
// distanceByDay ที่มีอยู่แล้วใน app/(app)/stats/page.tsx (bucket ตายตัวรายวัน + เติม 0 ให้วันที่ไม่มีข้อมูล)
// แค่เปลี่ยนจากระยะทางคาร์ดิโอเป็นวอลุ่มเวท (workoutVolumeKg ตัวเดียวกับทั้งแอป) — reference รับเป็น
// parameter (ไม่เรียก new Date() ตรงๆ) ให้ทดสอบ unit test ได้เหมือน computeRecentWeeklyVolumes
export function computeDailyVolumes(
  workouts: Pick<Workout, 'performed_at' | 'type' | 'total_volume_kg' | 'sets' | 'reps' | 'weight_kg'>[],
  daysCount: number,
  reference: Date = new Date()
): DailyVolumePoint[] {
  const days: string[] = []
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(reference)
    d.setDate(d.getDate() - i)
    days.push(bangkokParts(d))
  }
  const totalsByDay = new Map<string, number>(days.map((d) => [d, 0]))
  workouts
    .filter((w) => w.type === 'strength')
    .forEach((w) => {
      if (!totalsByDay.has(w.performed_at)) return
      totalsByDay.set(w.performed_at, (totalsByDay.get(w.performed_at) ?? 0) + workoutVolumeKg(w as Workout))
    })
  return days.map((d) => ({ date: d, value: Math.round(totalsByDay.get(d) ?? 0) }))
}

export interface WeeklyVolumePoint {
  label: string
  value: number
}

// วอลุ่มเวทรายสัปดาห์ N สัปดาห์ล่าสุด พร้อม label (สำหรับ Training Trend มุมมอง 30D) — ตั้งใจไม่เรียก
// computeRecentWeeklyVolumes (lib/dashboardStats.ts) ตรงๆ เพราะฟังก์ชันนั้นคืนแค่ number[] ไม่มี label
// และมีจุดเรียกใช้อยู่แล้วที่อื่น (lib/aiCoach.ts, app/(app)/coach/page.tsx) เปลี่ยน signature จะกระทบ
// จุดที่ไม่เกี่ยวข้อง — ฟังก์ชันนี้เดินตาม range เดียวกันทุกประการ (getWeekRange/getPreviousWeekRange,
// เรียงเก่า->ใหม่เหมือนกัน) แค่จับคู่ label ไปพร้อมกันในลูปเดียวกันเพื่อกันปัญหา 2 ลูปที่ต้องเรียงตรงกันเป๊ะ
// แต่อาจหลุดซิงค์กันได้ถ้าแก้แยกที่ในอนาคต
export function computeWeeklyVolumesWithLabels(
  workouts: Pick<Workout, 'performed_at' | 'type' | 'total_volume_kg' | 'sets' | 'reps' | 'weight_kg'>[],
  weeksCount: number,
  reference: Date = new Date()
): WeeklyVolumePoint[] {
  const ranges: { start: string; end: string }[] = []
  let range = getWeekRange(reference)
  ranges.push(range)
  for (let i = 1; i < weeksCount; i++) {
    range = getPreviousWeekRange(new Date(`${range.start}T00:00:00Z`))
    ranges.push(range)
  }
  ranges.reverse()

  return ranges.map(({ start, end }) => {
    const value = workouts
      .filter((w) => w.type === 'strength' && w.performed_at >= start && w.performed_at <= end)
      .reduce((sum, w) => sum + workoutVolumeKg(w as Workout), 0)
    const label = new Date(`${start}T00:00:00Z`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    return { label, value: Math.round(value) }
  })
}

export interface ReportSummaryInput {
  workoutCount: number
  workoutCountDeltaPct: number | null
  consistencyPct: number | null
  volumeDeltaPct: number | null
  weightDelta: MetricDelta
  bodyFatDelta: MetricDelta
  periodLabel: string
}

export interface ReportSummary {
  interpretation: string
  nextStep: string
}

// สรุปช่วง 7/30 วันเป็น 1 ประโยคตีความ + 1 ประโยค next-step — ไม่มีของเดิมทำสิ่งนี้ (ทุกจุดใน MINT Coach
// เดิมพูดถึง "วันนี้" เท่านั้น ไม่เคยสรุปข้ามหลายวัน) จึงเป็น logic ใหม่จริง แต่ยึด "เสียง" เดียวกับ
// AICoachCompactCard.tsx/lib/healthInsights.ts ทุกข้อ: ประโยคสั้น ใช้ตัวเลขจริงเท่านั้น (ไม่เดา/ไม่ผูก
// สาเหตุที่ข้อมูลพิสูจน์ไม่ได้), ลำดับความสำคัญแบบ mutually-exclusive if/else-if เดียว ไม่ใช่รวมทุกเงื่อนไข
// เข้าด้วยกัน — เลือกใช้ตัวเลขจริง (kg/%-point) ไม่ใช่เปอร์เซ็นต์เปลี่ยนแปลงล้วนๆ ตามที่ lib/healthInsights.ts
// เคยปรับมาแล้ว (v74/v75/v79: ผู้ใช้อ่าน "ลด 1.7 kg" ง่ายกว่า "ลด 2.6%")
export function composeReportSummary(input: ReportSummaryInput): ReportSummary {
  const { workoutCount, workoutCountDeltaPct, consistencyPct, volumeDeltaPct, weightDelta, bodyFatDelta, periodLabel } = input

  if (workoutCount === 0) {
    return {
      interpretation: `ยังไม่มีการฝึกบันทึกไว้ใน${periodLabel}`,
      nextStep: 'เริ่มเซสชันแรกได้เลยเมื่อพร้อม',
    }
  }

  const weightImproving = weightDelta.delta !== null && weightDelta.isGood === true
  const bodyFatImproving = bodyFatDelta.delta !== null && bodyFatDelta.isGood === true

  // 1) Consistency ต่ำ = ปัญหาหลักที่ควรพูดถึงก่อนเรื่องอื่น (ตรงกับหลักการ "Consistency สำคัญกว่า Volume")
  if (consistencyPct !== null && consistencyPct < 50) {
    return {
      interpretation: `ทำตามแผนได้ ${consistencyPct}% ใน${periodLabel} — ต่ำกว่าที่ตั้งไว้`,
      nextStep: 'ลองตั้งเป้าจำนวนวันที่ทำได้จริงก่อน ค่อยเพิ่มทีหลัง',
    }
  }

  // 2) Consistency ดี + ร่างกายตอบสนองในทิศทางที่ดี — จุดที่ควรชมและตอกย้ำให้ทำต่อ
  if (consistencyPct !== null && consistencyPct >= 80 && (weightImproving || bodyFatImproving)) {
    const bodyClause = weightImproving
      ? `น้ำหนักลดลง ${Math.abs(weightDelta.delta as number).toFixed(1)} kg`
      : `ไขมันลดลง ${Math.abs(bodyFatDelta.delta as number).toFixed(1)}%`
    return {
      interpretation: `ทำตามแผนได้ ${consistencyPct}% และ${bodyClause}`,
      nextStep: 'รักษาความสม่ำเสมอแบบนี้ต่อไป',
    }
  }

  // 3) วอลุ่มเพิ่มชัดเจนแต่สัดส่วนร่างกายยังไม่ขยับ — สังเกต plateau ให้ โดยไม่เดาสาเหตุ (แค่ชวนเช็ค)
  if (volumeDeltaPct !== null && volumeDeltaPct > 10 && !weightImproving && !bodyFatImproving) {
    return {
      interpretation: `วอลุ่มเพิ่มขึ้น ${volumeDeltaPct}% แต่สัดส่วนร่างกายยังใกล้เคียงเดิม`,
      nextStep: 'เช็คโภชนาการ/การพักผ่อนคู่กับปริมาณฝึกที่เพิ่มขึ้น',
    }
  }

  // 4) fallback ทั่วไป — ยังมีข้อมูลไม่พอสำหรับ 3 เคสข้างบน แต่ยังสรุปสิ่งที่ทำไปได้ตรงไปตรงมา
  const trendText =
    workoutCountDeltaPct === null
      ? `ฝึกไป ${workoutCount} ครั้งใน${periodLabel}`
      : workoutCountDeltaPct >= 0
        ? `ฝึกไป ${workoutCount} ครั้ง เพิ่มขึ้น ${workoutCountDeltaPct}% จากช่วงก่อน`
        : `ฝึกไป ${workoutCount} ครั้ง ลดลง ${Math.abs(workoutCountDeltaPct)}% จากช่วงก่อน`
  return {
    interpretation: trendText,
    nextStep: consistencyPct !== null ? 'รักษาจังหวะการฝึกตามแผนต่อไป' : 'ลองตั้งโปรแกรมประจำสัปดาห์เพื่อติดตามง่ายขึ้น',
  }
}

export interface TrendPoint {
  label: string
  value: number
}

// จุดสูงสุดของ Training Trend — ใช้ประกอบประโยค insight ใต้กราฟ ("Volume สูงสุด{label} {value}{unit}")
// คืน null ถ้าไม่มีจุดเลย หรือทุกจุดเป็น 0 (ไม่มีอะไรให้ชี้ "สูงสุด" อย่างมีความหมาย — ช่วงที่ไม่ได้ฝึกเลย)
export function findPeakTrendPoint(points: TrendPoint[]): TrendPoint | null {
  let peak: TrendPoint | null = null
  for (const p of points) {
    if (peak === null || p.value > peak.value) peak = p
  }
  return peak !== null && peak.value > 0 ? peak : null
}
