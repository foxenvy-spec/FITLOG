import type { Workout } from './types'
import { estimateCardioSessionCalories, DEFAULT_BODYWEIGHT_KG } from './dashboardStats'
import { computeWeeklyHRZoneMinutes, DEFAULT_MAX_HEART_RATE, type HRZoneMinutes } from './heartRate'
import { cadenceUnitFor } from './cadence'

export interface WeeklyCardioVolume {
  totalMinutes: number
  sessions: number
  totalCalories: number
  totalDistanceKm: number
  hrZones: HRZoneMinutes
  // ค่าเฉลี่ย cadence รายสัปดาห์ แยกตามหน่วย (spm ของวิ่ง/เดิน/ว่ายน้ำ, rpm ของปั่นจักรยาน)
  // เพราะสองหน่วยนี้เอามารวมกันตรงๆ ไม่ได้ — null ถ้าไม่มีเซสชันไหนกรอก cadence มาเลยในหน่วยนั้น
  avgCadenceSpm: number | null
  avgCadenceRpm: number | null
  // Priority 12 (Cardio Dashboard) — ค่าเฉลี่ยชีพจรข้ามเซสชันสัปดาห์นี้ (ค่าเฉลี่ยของ avg_heart_rate
  // รายเซสชัน ไม่ใช่ชีพจรต่อเนื่อง) null ถ้าไม่มีเซสชันไหนกรอกชีพจรมาเลย
  avgHeartRate: number | null
}

// cardioWorkoutsThisWeek ควรกรองมาแล้วว่า type === 'cardio' และอยู่ในช่วงสัปดาห์นี้ (getWeekRange)
export function computeWeeklyCardioVolume(
  cardioWorkoutsThisWeek: Workout[],
  bodyWeightKg: number | null = DEFAULT_BODYWEIGHT_KG,
  maxHeartRate: number = DEFAULT_MAX_HEART_RATE
): WeeklyCardioVolume {
  const totalMinutes = cardioWorkoutsThisWeek.reduce((sum, w) => sum + (w.duration_min ?? 0), 0)
  const totalDistanceKm = cardioWorkoutsThisWeek.reduce((sum, w) => sum + (w.distance_km ?? 0), 0)
  const totalCalories = Math.round(
    cardioWorkoutsThisWeek.reduce((sum, w) => sum + estimateCardioSessionCalories(w, bodyWeightKg), 0)
  )
  const hrZones = computeWeeklyHRZoneMinutes(cardioWorkoutsThisWeek, maxHeartRate)

  const spmValues: number[] = []
  const rpmValues: number[] = []
  cardioWorkoutsThisWeek.forEach((w) => {
    if (w.cadence === null || w.cadence === undefined) return
    if (cadenceUnitFor(w.cardio_type) === 'rpm') rpmValues.push(w.cadence)
    else spmValues.push(w.cadence)
  })
  const average = (vals: number[]) => (vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null)
  const heartRates = cardioWorkoutsThisWeek
    .map((w) => w.avg_heart_rate)
    .filter((hr): hr is number => hr !== null && hr !== undefined)

  return {
    totalMinutes,
    sessions: cardioWorkoutsThisWeek.length,
    totalCalories,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    hrZones,
    avgCadenceSpm: average(spmValues),
    avgCadenceRpm: average(rpmValues),
    avgHeartRate: average(heartRates),
  }
}
