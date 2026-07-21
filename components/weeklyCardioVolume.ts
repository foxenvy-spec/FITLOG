import type { Workout } from './types'
import { estimateCardioSessionCalories, DEFAULT_BODYWEIGHT_KG } from './dashboardStats'
import { computeWeeklyHRZoneMinutes, DEFAULT_MAX_HEART_RATE, type HRZoneMinutes } from './heartRate'

export interface WeeklyCardioVolume {
  totalMinutes: number
  sessions: number
  totalCalories: number
  totalDistanceKm: number
  hrZones: HRZoneMinutes
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

  return {
    totalMinutes,
    sessions: cardioWorkoutsThisWeek.length,
    totalCalories,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    hrZones,
  }
}
