import type { Workout } from './types'
import { RECOVERY_WINDOW_DAYS } from './dashboardStats'
import { RECOVERY_MUSCLES, type MuscleGroup } from './muscle-groups'

// ==================== วอลุ่มรายเดือน / รายปี ====================
// ใช้ total_volume_kg ก่อนเสมอ (แม่นยำกว่า) เหมือนที่หน้า /stats ทำกับ weekly volume
// fallback เป็น sets*reps*weight_kg สำหรับแถวเก่าที่ยังไม่มีค่านี้
function volumeOfWorkout(w: Workout): number {
  if (w.total_volume_kg !== null && w.total_volume_kg !== undefined) return w.total_volume_kg
  return (w.sets ?? 0) * (w.reps ?? 0) * (w.weight_kg ?? 0)
}

export interface PeriodBucket {
  key: string
  label: string
  value: number
}

// รวมวอลุ่มเวทเทรนนิ่งเป็นก้อนรายเดือน — monthsCount เดือนล่าสุด (รวมเดือนปัจจุบัน)
export function aggregateVolumeByMonth(
  workouts: Workout[],
  monthsCount: number,
  reference: Date = new Date()
): PeriodBucket[] {
  const buckets: PeriodBucket[] = []
  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(reference.getFullYear(), reference.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
    buckets.push({ key, label, value: 0 })
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]))
  workouts
    .filter((w) => w.type === 'strength')
    .forEach((w) => {
      const bucket = byKey.get(w.performed_at.slice(0, 7))
      if (bucket) bucket.value += volumeOfWorkout(w)
    })
  return buckets.map((b) => ({ ...b, value: Math.round(b.value) }))
}

// รวมวอลุ่มเวทเทรนนิ่งเป็นก้อนรายปีปฏิทิน — yearsCount ปีล่าสุด (รวมปีปัจจุบัน)
export function aggregateVolumeByYear(
  workouts: Workout[],
  yearsCount: number,
  reference: Date = new Date()
): PeriodBucket[] {
  const buckets: PeriodBucket[] = []
  for (let i = yearsCount - 1; i >= 0; i--) {
    const year = reference.getFullYear() - i
    buckets.push({ key: String(year), label: String(year), value: 0 })
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]))
  workouts
    .filter((w) => w.type === 'strength')
    .forEach((w) => {
      const bucket = byKey.get(w.performed_at.slice(0, 4))
      if (bucket) bucket.value += volumeOfWorkout(w)
    })
  return buckets.map((b) => ({ ...b, value: Math.round(b.value) }))
}

// ==================== Training Load (Acute:Chronic Workload Ratio) ====================
// แนวคิดมาตรฐานจากวงการกีฬา: เทียบ "โหลดเฉลี่ย 7 วันล่าสุด" (acute, การฝึกช่วงสั้นๆ)
// กับ "โหลดเฉลี่ย 28 วันล่าสุด" (chronic, ฐานความฟิตระยะยาว) — อัตราส่วน (ACWR) สูงเกินไป
// (>1.3) บ่งชี้ว่าฝึกหนักขึ้นเร็วกว่าที่ร่างกายปรับตัวทัน เสี่ยงบาดเจ็บ/overtraining
// ต่ำเกินไป (<0.8) บ่งชี้ว่าฝึกเบาลงมากจากฐานเดิม (detraining)
// หมายเหตุ: เป็นตัวชี้วัดอ้างอิงทั่วไป ไม่ใช่การวินิจฉัยทางการแพทย์ และ "โหลด" ที่ใช้ที่นี่
// เป็นค่าประมาณจากวอลุ่มเวท + สัดส่วนเวลา/ความหนักของคาร์ดิโอ ไม่ใช่ sRPE ที่วัดจริงรายเซสชัน
export type TrainingLoadZone = 'undertraining' | 'optimal' | 'high-risk'

export interface TrainingLoadPoint {
  date: string
  dailyLoad: number
  acuteLoad: number
  chronicLoad: number
  ratio: number | null
  zone: TrainingLoadZone
}

// ค่าประมาณ "โหลด" ของคาร์ดิโอหนึ่งเซสชัน: นาที x ความหนักโดยประมาณจากชีพจรเฉลี่ย
// (ถ้าไม่มีชีพจรให้ใช้ค่าความหนักกลางๆ) ปรับสเกลให้อยู่ในระดับใกล้เคียงกับวอลุ่มเวท (กก.)
// เพื่อให้รวมกันเป็นตัวเลข "โหลดรวมต่อวัน" เดียวกันได้อย่างมีความหมายเชิงเปรียบเทียบ (ไม่ใช่หน่วยจริง)
function cardioLoadOf(w: Workout): number {
  const intensity = w.avg_heart_rate ? w.avg_heart_rate / 20 : 6
  return (w.duration_min ?? 0) * intensity
}

export function zoneForRatio(ratio: number | null): TrainingLoadZone {
  if (ratio === null) return 'optimal'
  if (ratio > 1.3) return 'high-risk'
  if (ratio < 0.8) return 'undertraining'
  return 'optimal'
}

export function computeTrainingLoad(
  workouts: Workout[],
  days: number,
  reference: Date = new Date()
): TrainingLoadPoint[] {
  const dayKeys: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(reference)
    d.setDate(reference.getDate() - i)
    dayKeys.push(d.toISOString().slice(0, 10))
  }
  const dayIndex = new Map(dayKeys.map((d, i) => [d, i]))
  const loadByDay = new Array(dayKeys.length).fill(0)

  workouts.forEach((w) => {
    const idx = dayIndex.get(w.performed_at)
    if (idx === undefined) return
    loadByDay[idx] += w.type === 'strength' ? volumeOfWorkout(w) : cardioLoadOf(w)
  })

  return dayKeys.map((date, idx) => {
    const acuteStart = Math.max(0, idx - 6)
    const acuteSlice = loadByDay.slice(acuteStart, idx + 1)
    const acuteLoad = acuteSlice.reduce((s, v) => s + v, 0) / acuteSlice.length

    const chronicStart = Math.max(0, idx - 27)
    const chronicSlice = loadByDay.slice(chronicStart, idx + 1)
    const chronicLoad = chronicSlice.reduce((s, v) => s + v, 0) / chronicSlice.length

    // ต้องมีข้อมูลอย่างน้อย ~2 สัปดาห์ก่อนจะเชื่อถือ chronic load ได้ (กันอัตราส่วนเพี้ยนตอนเริ่มต้น)
    const hasEnoughHistory = idx >= 13
    const ratio = hasEnoughHistory && chronicLoad > 0 ? Number((acuteLoad / chronicLoad).toFixed(2)) : null

    return {
      date,
      dailyLoad: Math.round(loadByDay[idx]),
      acuteLoad: Math.round(acuteLoad),
      chronicLoad: Math.round(chronicLoad),
      ratio,
      zone: zoneForRatio(ratio),
    }
  })
}

// ==================== ประวัติ Recovery Score ย้อนหลัง ====================
// สร้าง time-series ของ "recovery score เฉลี่ยรวมทุกกลุ่มกล้ามเนื้อ" ย้อนหลังทีละวัน
// โดยไล่ทับ lastTrained ของแต่ละกล้ามเนื้อไปทีละวันตามประวัติจริง (ใช้สูตรเดียวกับ
// computeRecoveryPct ใน dashboardStats.ts ทุกประการ เพื่อให้ตัวเลขตรงกับหน้า /recovery)
// หมายเหตุ: logs ที่ส่งเข้ามาควรมีย้อนหลังมากกว่า `days` พอสมควร (เผื่อ lastTrained ก่อนเริ่มช่วง)
// ไม่งั้นวันแรกๆ ของกราฟจะเห็น recovery 100% เกินจริงเพราะไม่รู้ว่าเคยฝึกมาก่อนหน้านั้น
export interface RecoveryHistoryPoint {
  date: string
  overallPct: number
}

export function computeRecoveryHistory(
  strengthLogs: { muscle_group: string | null; performed_at: string }[],
  days: number,
  reference: Date = new Date()
): RecoveryHistoryPoint[] {
  const dayKeys: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(reference)
    d.setDate(reference.getDate() - i)
    dayKeys.push(d.toISOString().slice(0, 10))
  }

  const validMuscles = new Set<string>(RECOVERY_MUSCLES)
  const logsByDate = new Map<string, string[]>()
  strengthLogs.forEach((l) => {
    if (!l.muscle_group || !validMuscles.has(l.muscle_group)) return
    const arr = logsByDate.get(l.performed_at) ?? []
    arr.push(l.muscle_group)
    logsByDate.set(l.performed_at, arr)
  })

  // เริ่ม lastTrained จากประวัติที่เก่ากว่าวันแรกของกราฟ (ถ้ามี) เพื่อไม่ให้วันแรกๆ เข้าใจผิดว่า 100%
  const lastTrained: Record<string, string | null> = {}
  RECOVERY_MUSCLES.forEach((mg) => {
    lastTrained[mg] = null
  })
  const firstDay = dayKeys[0]
  strengthLogs.forEach((l) => {
    if (!l.muscle_group || !validMuscles.has(l.muscle_group)) return
    if (l.performed_at >= firstDay) return
    const cur = lastTrained[l.muscle_group]
    if (!cur || l.performed_at > cur) lastTrained[l.muscle_group] = l.performed_at
  })

  return dayKeys.map((date) => {
    ;(logsByDate.get(date) ?? []).forEach((mg) => {
      lastTrained[mg] = date
    })

    const pcts = RECOVERY_MUSCLES.map((mg) => {
      const last = lastTrained[mg]
      if (!last) return 100
      const daysSince = Math.round(
        (new Date(date + 'T00:00:00').getTime() - new Date(last + 'T00:00:00').getTime()) / 86400000
      )
      const windowDays = RECOVERY_WINDOW_DAYS[mg] ?? 2
      return Math.max(0, Math.min(100, Math.round((daysSince / windowDays) * 100)))
    })
    const overallPct = Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length)
    return { date, overallPct }
  })
}

// ==================== แนวโน้มชีพจรรายสัปดาห์ ====================
// ค่าเฉลี่ยชีพจรถ่วงน้ำหนักด้วยเวลา (นาที) ของแต่ละสัปดาห์ — ถ่วงน้ำหนักเพราะเซสชันที่นานกว่า
// ควรมีผลต่อค่าเฉลี่ยของสัปดาห์มากกว่าเซสชันสั้นๆ
export interface HRTrendPoint {
  weekLabel: string
  avgHeartRate: number | null
  sessionCount: number
}

export function computeWeeklyHRTrend(
  cardioWorkouts: { performed_at: string; avg_heart_rate: number | null; duration_min: number | null }[],
  weeksCount: number,
  reference: Date = new Date()
): HRTrendPoint[] {
  const now = new Date(reference)
  now.setHours(0, 0, 0, 0)
  const buckets: { start: Date; end: Date; label: string; weightedSum: number; totalMin: number; sessionCount: number }[] = []
  for (let i = weeksCount - 1; i >= 0; i--) {
    const end = new Date(now)
    end.setDate(now.getDate() - i * 7)
    const start = new Date(end)
    start.setDate(end.getDate() - 6)
    buckets.push({
      start,
      end,
      label: start.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
      weightedSum: 0,
      totalMin: 0,
      sessionCount: 0,
    })
  }

  cardioWorkouts.forEach((w) => {
    if (w.avg_heart_rate === null || w.avg_heart_rate === undefined) return
    const d = new Date(w.performed_at + 'T00:00:00')
    const bucket = buckets.find((b) => d >= b.start && d <= b.end)
    if (!bucket) return
    const minutes = w.duration_min ?? 1
    bucket.weightedSum += w.avg_heart_rate * minutes
    bucket.totalMin += minutes
    bucket.sessionCount += 1
  })

  return buckets.map((b) => ({
    weekLabel: b.label,
    avgHeartRate: b.totalMin > 0 ? Math.round(b.weightedSum / b.totalMin) : null,
    sessionCount: b.sessionCount,
  }))
}
