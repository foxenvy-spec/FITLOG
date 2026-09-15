import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProgramDay, ProgramExercise } from './types'
import { getWeekRange, getPreviousWeekRange, computeRecoveryPct, getScheduledMuscleForDay, getNextScheduledMuscle, suggestMuscleToTrain, type MuscleRecommendation, type ScheduledDay } from './dashboardStats'
import { RECOVERY_MUSCLES, MUSCLE_GROUPS, dominantMuscleGroup } from './muscle-groups'
import { fetchWeeklyVolumeTargets, type WeeklyVolumeTargets } from './weeklyVolumeTargets'

// 6D P1-2A — extraction boundary ที่ล็อกไว้กับผู้ใช้: ดึงเฉพาะ query/data preparation ที่เป็น dependency
// ของ suggestMuscleToTrain()/computeTodaysAction() ออกจาก DashboardView.tsx's fetchDashboardData() มาไว้
// จุดเดียว ให้ /train เรียกใช้ชุดเดียวกันได้ ไม่ต้อง reimplement recommendation logic แยกต่างหาก — พอร์ต
// query filter/order/limit และ pure computation ทุกจุด "1:1" จาก fetchDashboardData เดิม (ดู comment
// เต็มที่แต่ละ query ที่ DashboardView.tsx) ไม่มีการปรับ optimize/เปลี่ยน concurrency โดยเจตนา (ตกลงกันแล้ว
// ว่า data/semantic equivalence เท่านั้นที่ต้องเหมือนเดิม ไม่ใช่ query timing) — ไม่แตะ suggestMuscleToTrain/
// computeRecoveryPct/dominantMuscleGroup/getScheduledMuscleForDay/getNextScheduledMuscle เลย
//
// จงใจไม่ query ข้อมูล "วันนี้" เอง (todayMuscleGroups/progressPctForLabel) — เดิมสองค่านี้เกี่ยวข้องกับ
// completion truth ของผู้เรียกโดยตรง (Dashboard/Train ต่างมีข้อมูลนี้อยู่แล้วจากคนละ query กัน) ผู้เรียก
// ต้องคำนวณเองแล้วส่งเข้ามา กัน query ซ้ำ/กัน mismatch ระหว่างสอง completion pipeline ที่แยกกันอยู่แล้ว
//
// หมายเหตุ (พบระหว่าง implement, นอกเหนือ 6 field ที่ล็อกไว้ตอนแรก): เพิ่ม todayScheduledMuscle เป็น field
// ที่ 7 — Dashboard เดิมใช้ค่านี้ต่อ (ไม่ใช่แค่ผ่านเข้า suggestMuscleToTrain) สำหรับ isRecommendationForToday/
// aiDailySummary ของตัวเอง (Dashboard-only concern) หาก Dashboard คำนวณ todayScheduledMuscle ซ้ำเองจาก
// programDayMuscleGroups[dow] จะไม่ตรงกับค่าที่ engine ใช้จริงเป๊ะในเคส edge case ที่ dominantMuscleGroup
// คืน null แต่ day.title ตรงกับชื่อกล้ามเนื้อพอดี (getScheduledMuscleForDay มี title fallback, ขณะที่
// programDayMuscleGroups ไม่มี) — ส่งค่าเดียวกับที่ engine ใช้ตัดสินภายในออกไปตรงๆ กัน mismatch นี้
export interface MuscleRecommendationResult {
  recommendation: MuscleRecommendation | null
  programDayMuscleGroups: Record<number, string | null>
  recoveryDates: Record<string, string | null>
  thisWeekSets: Record<string, number>
  lastWeekSets: Record<string, number>
  weeklyVolumeTargets: WeeklyVolumeTargets
  todayScheduledMuscle: string | null
}

export async function loadMuscleRecommendation(
  supabase: SupabaseClient,
  params: {
    programDays: ProgramDay[]
    currentDay: ProgramDay | null
    // day_of_week ของ "วันนี้" จริงๆ (todayDayOfWeek()) — ต้องส่งแยกจาก currentDay?.day_of_week เสมอ
    // เพราะ currentDay เป็น null ได้ตอนวันนี้ไม่มีโปรแกรมตั้งไว้ (rest day/ยังไม่ตั้งโปรแกรม) แต่
    // getNextScheduledMuscle ยังต้องรู้ว่าจะเริ่มไล่หาวันถัดไปจากวันไหน (ดู comment เต็มที่
    // getNextScheduledMuscle ใน lib/dashboardStats.ts) — เดิม fetchDashboardData ใช้ dow = todayDayOfWeek()
    // ตรงๆ ไม่ผูกกับ currentDay เลย จุดนี้ต้องพอร์ตพฤติกรรมนั้นมาเป๊ะ
    todayDayOfWeek: number
    todayExercises: ProgramExercise[]
    todayMuscleGroups: string[]
    progressPctForLabel: number | null
  }
): Promise<MuscleRecommendationResult> {
  const { programDays, currentDay, todayDayOfWeek: dow, todayExercises, todayMuscleGroups, progressPctForLabel } = params

  const { start: thisWeekStart, end: thisWeekEnd } = getWeekRange()
  const { start: lastWeekStart } = getPreviousWeekRange()

  const otherDayIds = programDays.filter((d) => d.id !== currentDay?.id).map((d) => d.id)

  const [{ data: recentStrength }, { data: twoWeeksStrength }, weeklyVolumeTargets, { data: otherDaysExRows }] = await Promise.all([
    supabase
      .from('workouts')
      .select('muscle_group, performed_at, exercise_name, type, weight_kg, total_volume_kg')
      .eq('type', 'strength')
      .order('performed_at', { ascending: false })
      .limit(1000),
    supabase
      .from('workouts')
      .select('muscle_group, sets, performed_at')
      .eq('type', 'strength')
      .gte('performed_at', lastWeekStart)
      .lte('performed_at', thisWeekEnd),
    fetchWeeklyVolumeTargets(supabase),
    otherDayIds.length > 0
      ? supabase.from('program_exercises').select('program_day_id, muscle_group').in('program_day_id', otherDayIds)
      : Promise.resolve({ data: [] as { program_day_id: string; muscle_group: string | null }[] }),
  ])

  const strengthRows =
    (recentStrength as {
      muscle_group: string | null
      performed_at: string
      exercise_name: string | null
      weight_kg: number | null
      total_volume_kg: number | null
    }[]) ?? []
  const recoveryDates: Record<string, string | null> = {}
  RECOVERY_MUSCLES.forEach((mg) => {
    const match = strengthRows.find((r) => r.muscle_group === mg)
    recoveryDates[mg] = match?.performed_at ?? null
  })
  const recoveryPctForSummary: Record<string, number | null> = {}
  RECOVERY_MUSCLES.forEach((mg) => {
    recoveryPctForSummary[mg] = computeRecoveryPct(recoveryDates[mg] ?? null, mg)
  })

  const twoWeeksRows = (twoWeeksStrength as { muscle_group: string | null; sets: number | null; performed_at: string }[]) ?? []
  const thisWeekSets: Record<string, number> = {}
  const lastWeekSets: Record<string, number> = {}
  twoWeeksRows.forEach((r) => {
    if (!r.muscle_group) return
    const bucket = r.performed_at >= thisWeekStart ? thisWeekSets : lastWeekSets
    bucket[r.muscle_group] = (bucket[r.muscle_group] ?? 0) + (r.sets ?? 0)
  })

  const exercisesByDayId: Record<string, { muscle_group: string | null }[]> = {}
  if (currentDay) exercisesByDayId[currentDay.id] = todayExercises
  ;((otherDaysExRows as { program_day_id: string; muscle_group: string | null }[]) ?? []).forEach((row) => {
    exercisesByDayId[row.program_day_id] = exercisesByDayId[row.program_day_id] ?? []
    exercisesByDayId[row.program_day_id].push(row)
  })

  const scheduledDaysWithMuscle: ScheduledDay[] = programDays.map((d) => ({
    day_of_week: d.day_of_week,
    title: d.title,
    muscleGroup: dominantMuscleGroup(exercisesByDayId[d.id] ?? []),
  }))
  const programDayMuscleGroups: Record<number, string | null> = {}
  scheduledDaysWithMuscle.forEach((d) => {
    programDayMuscleGroups[d.day_of_week] = d.muscleGroup ?? null
  })

  const todayScheduledMuscle = getScheduledMuscleForDay(scheduledDaysWithMuscle, dow, MUSCLE_GROUPS)
  const preferTodayMuscle =
    !!todayScheduledMuscle &&
    !todayMuscleGroups.includes(todayScheduledMuscle) &&
    (progressPctForLabel === null || progressPctForLabel < 100)
  const scheduledMuscle = preferTodayMuscle ? todayScheduledMuscle : getNextScheduledMuscle(scheduledDaysWithMuscle, dow, MUSCLE_GROUPS)

  const recommendation = suggestMuscleToTrain(recoveryPctForSummary, scheduledMuscle, thisWeekSets, weeklyVolumeTargets)

  return { recommendation, programDayMuscleGroups, recoveryDates, thisWeekSets, lastWeekSets, weeklyVolumeTargets, todayScheduledMuscle }
}
