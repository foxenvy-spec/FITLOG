'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useDashboardSettings } from '@/components/DashboardSettingsProvider'
import Button from '@/components/ui/Button'
import type { ProgramDay, ProgramExercise, Workout, BodyMetric } from '@/lib/types'
import { todayDayOfWeek, todayStr, daysAgoStr } from '@/lib/weekdays'
import {
  computeCurrentStreakDates,
  computeLongestStreak,
  computeTodayTotals,
  computeRecoveryPct,
  recoveryStatusColor,
  recoveryTier,
  findNextProgramDay,
  getWeekRange,
  getPreviousWeekRange,
  computeVolumeTrendInsights,
  computeImbalanceInsights,
  computeMissedMuscleInsights,
  suggestMuscleToTrain,
  computeTodaysRecommendation,
  computeTrainingBalance,
  trainingBalanceInsight,
  recoveryRecommendationLabel,
  computeBestVolumeIncrease,
  computeGreetingContext,
  computeWorkoutMotivationLabel,
  getScheduledMuscleForDay,
  getNextScheduledMuscle,
  computeLatestPR,
  computeTopMuscleThisWeek,
  estimateCaloriesToday,
  type Insight,
  type MuscleRecommendation,
  type TodaysRecommendation,
  type VolumeIncrease,
  type LatestPR,
  type TopMuscle,
  type ScheduledDay,
} from '@/lib/dashboardStats'
import { fetchWeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
import { saveDisplayName } from '@/lib/profile'
import { computePushPullBalance, computeAIDailySummary, bodyFatTrendInsight, muscleMassTrendInsight, workoutFrequencyInsight } from '@/lib/aiCoach'
import { computeBodyMetricsSummary, type BodyMetricsSummary } from '@/lib/bodyMetricsSummary'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { VOLUME_MUSCLES, RECOVERY_MUSCLES, MUSCLE_GROUPS, MUSCLE_GROUP_COLORS, dominantMuscleGroup, type MuscleGroup } from '@/lib/muscle-groups'
import { DEFAULT_DASHBOARD_PREFS, loadDashboardPrefs, saveDashboardPrefs, type DashboardPrefs } from '@/lib/dashboardPrefs'
import { isOnboardingBannerDismissed, dismissOnboardingBanner } from '@/lib/onboarding'
import GoalRing from '@/components/GoalRing'
import DashboardSkeleton from '@/components/DashboardSkeleton'
import InsightCarousel from '@/components/InsightCarousel'
import TodayMuscleChips from '@/components/TodayMuscleChips'
import OnboardingBanner from '@/components/OnboardingBanner'
import ErrorState from '@/components/ErrorState'
import Skeleton from '@/components/Skeleton'
import BodyMetricsRow from '@/components/BodyMetricsRow'
import ConsistencyStrip from '@/components/ConsistencyStrip'
import NotificationButton from '@/components/dashboard/NotificationButton'
import AICoachCompactCard from '@/components/AICoachCompactCard'
import AnimatedBarFill from '@/components/AnimatedBarFill'
import { CARD_GRADIENT_CSS, withAlpha, COLORS, NEUTRAL } from '@/lib/theme'
import { computeFitnessScore } from '@/lib/fitnessScore'

// Below-the-fold widgets are code-split out of the initial dashboard bundle.
// Each fetches its own data independently, so there's no reason to block
// first paint of the hero card on their JS or their network round-trip.
const WeeklyMuscleHeatmap = dynamic(() => import('@/components/WeeklyMuscleHeatmap'), {
  loading: () => <Skeleton className="h-80 w-full rounded-card" />,
})
const WeeklyVolume = dynamic(() => import('@/components/WeeklyVolume'), {
  loading: () => <Skeleton className="h-56 w-full rounded-card" />,
})
const WeeklyCardioVolume = dynamic(() => import('@/components/WeeklyCardioVolume'), {
  loading: () => <Skeleton className="h-56 w-full rounded-card" />,
})
const DashboardSettings = dynamic(() => import('@/components/DashboardSettings'), { ssr: false })

// จ-อา (เริ่มจันทร์) ใช้กับแถวติ๊กถูกในการ์ด Weekly Goal — ตรงกับลำดับของ data.weekDayTicks
// ที่คำนวณจาก getWeekRange() (สัปดาห์เริ่มวันจันทร์) ใน fetchDashboardData ด้านล่าง
export const WEEKDAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

export function greeting() {
  const h = new Date().getHours()
  if (h < 11) return 'สวัสดีตอนเช้า'
  if (h < 17) return 'สวัสดีตอนบ่าย'
  return 'สวัสดีตอนเย็น'
}

// Fallback เมื่อผู้ใช้ยังไม่ได้ตั้ง display_name เอง — ตัดจาก email เหมือนพฤติกรรมเดิม
export function emailDisplayName(email: string | undefined | null) {
  if (!email) return 'นักยก'
  const prefix = email.split('@')[0]
  return prefix.charAt(0).toUpperCase() + prefix.slice(1)
}

export interface DashboardData {
  email: string | null
  profileDisplayName: string | null
  todayWorkouts: Workout[]
  streak: number
  // สายโซ่ต่อเนื่องยาวที่สุดในประวัติ (ไม่ใช่แค่สายที่ต่อถึงวันนี้แบบ `streak`) — ใช้ใน
  // WorkoutStreakDetailSheet เท่านั้น ไม่โชว์บนการ์ดหลักของ Dashboard (ฟีดแบ็ก "ไม่ต้องเอา Best
  // มาไว้ Dashboard")
  bestStreak: number
  programDays: ProgramDay[]
  todayExercises: ProgramExercise[]
  completedCount: number
  // จำนวนท่า ad-hoc ("เพิ่มท่า" ระหว่างเซสชัน) ที่กดจบแล้ววันนี้ — แยกจาก completedCount ตั้งใจ (ดู
  // comment เต็มที่จุดคำนวณใน fetchDashboardData) การ์ด Hero เอาไปบวกกับ completedCount เองตอนแสดงผล
  adhocCompletedCount: number
  completedExerciseIds: string[]
  recoveryDates: Record<string, string | null>
  insights: Insight[]
  aiDailySummary: string
  // เทรนด์น้ำหนัก/ไขมัน/กล้ามเนื้อล่าสุด (เทียบเอนทรีก่อนหน้า) — ใช้ให้การ์ด AI Coach
  // วิเคราะห์สัดส่วนร่างกายเพิ่มจากเดิมที่มีแค่ recovery/push-pull balance
  bodyMetricsSummary: BodyMetricsSummary
  // เฉลี่ย % ของเป้าหมายเซ็ต/สัปดาห์ ข้ามทุกกล้ามเนื้อใน VOLUME_MUSCLES (เพดานที่ 100%
  // ต่อกลุ่ม ก่อนเฉลี่ย) ใช้ตัวเลขเดียวสรุปภาพรวมสำหรับ hero card — รายละเอียดรายกล้ามเนื้อ
  // ยังดูได้เต็ม ๆ ที่ WeeklyVolume ด้านล่าง
  weeklyGoalPct: number
  // ใช้ประกอบ dynamic greeting ด้านบนสุด — กล้ามเนื้อที่ฟื้นตัวมากที่สุด (สำหรับ "X ฟื้นตัวเต็มที่แล้ว")
  // และกลุ่มที่วอลุ่มเพิ่มขึ้นเด่นที่สุดสัปดาห์นี้ (สำหรับ "วอลุ่มเพิ่มขึ้น X%")
  muscleRecommendation: MuscleRecommendation | null
  // muscleRecommendation ต่อยอดด้วยเซ็ตที่เหลือถึงเป้าหมายรายสัปดาห์ของกลุ่มนั้น (จาก Weekly Volume
  // Engine) — ใช้ในป้ายแนะนำของการ์ด Recovery ให้ตอบทั้ง "พร้อมฝึกไหม" และ "เหลืออีกเท่าไหร่" พร้อมกัน
  todaysRecommendation: TodaysRecommendation | null
  // true เมื่อ muscleRecommendation ข้างบนคือกล้ามเนื้อของ "วันนี้" จริงๆ (ยังทำไม่ครบ/ยังไม่ได้เริ่ม) —
  // false เมื่อเป็นคำแนะนำของเซสชัน "ถัดไป" (วันนี้ทำครบแล้ว/เป็นวันพัก) ใช้ตัดสินป้าย "AI Coach · Today"
  // vs "· Next" ให้ตรงกับความเป็นจริง (ดู comment เต็มที่จุดคำนวณ scheduledMuscle ด้านล่าง)
  isRecommendationForToday: boolean
  bestVolumeIncrease: VolumeIncrease | null
  // ใช้กับการ์ด Weekly Goal แบบ motivation — จำนวนครั้งที่ฝึกแล้วสัปดาห์นี้ เทียบกับเป้าหมาย
  // (เป้าหมายนับจากจำนวนวันที่ตั้งโปรแกรมไว้เอง ถ้ายังไม่ตั้งเลยใช้ 3 เป็นค่าเริ่มต้น)
  thisWeekWorkoutDays: number
  weeklyWorkoutGoal: number
  // แถวติ๊กถูกรายวัน (จ-อา) ของสัปดาห์นี้ — ใช้โชว์ในการ์ด Weekly Goal
  weekDayTicks: { iso: string; trained: boolean; isFuture: boolean; inStreak: boolean }[]
  // สองตัวนี้ตอบคำถาม "PR ล่าสุด" และ "กล้ามเนื้อที่ฝึกมากที่สุดสัปดาห์นี้" — โชว์เป็น quick-glance
  // strip ใต้คำทักทาย ให้เห็นครบภายในไม่กี่วินาทีโดยไม่ต้องเลื่อนหรือกดเข้าไปดูหน้าอื่น
  latestPR: LatestPR | null
  topMuscleThisWeek: TopMuscle | null
  // ผู้ใช้ใหม่จริงๆ = ไม่เคยบันทึกอะไรเลย (400 วันย้อนหลัง) และยังไม่ได้ตั้งโปรแกรมเลยด้วย —
  // ใช้ตัดสินว่าควรโชว์ first-run banner (OnboardingBanner) หรือไม่
  hasAnyHistory: boolean
  // จำนวนวันที่ฝึกใน 7 วันล่าสุด (รวมวันนี้) 0-7 — ใช้คำนวณ Fitness Score เท่านั้น
  last7DaysTrainedCount: number
}

export async function fetchDashboardData(supabase: ReturnType<typeof createClient>): Promise<DashboardData> {
  const dow = todayDayOfWeek()
  const today = todayStr()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { start: thisWeekStart, end: thisWeekEnd } = getWeekRange()
  const { start: lastWeekStart } = getPreviousWeekRange()

  // Streak นับต่อเนื่องจะขาดทันทีถ้าเว้นเกิน 1 วัน (ดู computeCurrentStreak) ดังนั้นย้อนหลัง
  // 400 วัน (เกินหนึ่งปี) ก็เกินพอสำหรับ streak ที่มีความหมายจริง — กัน query โตไม่จำกัดตาม
  // อายุการใช้งานของผู้ใช้ (ก่อนหน้านี้ query นี้ดึง performed_at ของทุกแถวที่เคยบันทึกทั้งหมด)
  const STREAK_LOOKBACK_DAYS = 400
  const streakCutoff = daysAgoStr(STREAK_LOOKBACK_DAYS)

  const [
    { data: todayRows },
    { data: allDates },
    { data: dayRows },
    { data: recentStrength },
    { data: twoWeeksStrength },
    weeklyVolumeTargets,
    { data: profileRow },
    { data: bodyMetricRows },
  ] = await Promise.all([
    supabase.from('workouts').select('*').eq('performed_at', today).order('created_at'),
    supabase
      .from('workouts')
      .select('performed_at')
      .gte('performed_at', streakCutoff)
      .order('performed_at', { ascending: false }),
    supabase.from('program_days').select('*').order('day_of_week'),
    supabase
      .from('workouts')
      .select('muscle_group, performed_at, exercise_name, type, weight_kg')
      .eq('type', 'strength')
      .order('performed_at', { ascending: false })
      .limit(1000),
    supabase
      .from('workouts')
      .select('muscle_group, sets, performed_at')
      .eq('type', 'strength')
      .gte('performed_at', lastWeekStart)
      .lte('performed_at', thisWeekEnd),
    // เป้าหมายเซ็ต/สัปดาห์ของผู้ใช้เอง (ตั้งได้ต่อคน) รวมกับ default แล้ว — ดู lib/weeklyVolumeTargets.ts
    fetchWeeklyVolumeTargets(supabase),
    // ชื่อที่แสดงบน Dashboard ที่ผู้ใช้ตั้งเอง (ถ้ามี) — ดู lib/profile.ts
    user
      ? supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null as { display_name: string | null } | null }),
    // เอนทรีล่าสุด 2 รายการพอสำหรับคำนวณ delta (เทียบกับ BodyMetricsRow ที่ดึง 30 รายการ
    // เพราะการ์ดนั้นโชว์ค่าปัจจุบันด้วย ส่วนตรงนี้ใช้แค่เทรนด์ล่าสุดไปทำ insight)
    supabase.from('body_metrics').select('*').order('measured_at', { ascending: false }).limit(2),
  ])

  const todayList = (todayRows as Workout[]) ?? []
  const typedDays = (dayRows as ProgramDay[]) ?? []

  // ฟีดแบ็ก "ดูจากตารางล่วงหน้าที่ลงไว้ วันไหนไม่มีลงคือวันพัก — Scheduled Rest Day ไม่ควรตัด Streak"
  // — weekday ที่มี ProgramDay ตั้งไว้จริง (ไม่ว่าง = วันฝึกตามตาราง) ส่งเข้า compute*Streak เพื่อข้าม
  // วันพักตามแผนตอนนับสายโซ่ (ดู comment เต็มที่ computeCurrentStreak ใน lib/dashboardStats.ts)
  const workoutWeekdays = new Set(typedDays.map((d) => d.day_of_week))

  const distinctDates = Array.from(new Set(((allDates as { performed_at: string }[]) ?? []).map((r) => r.performed_at)))
  // เซตวันที่ที่อยู่ในสายโซ่ต่อเนื่อง "ปัจจุบัน" จริงๆ (เดินสายโซ่เดียวกับ computeCurrentStreak เป๊ะๆ —
  // ใช้ผลลัพธ์ก่อนนับเป็นตัวเลข) ให้ weekDayTicks ด้านล่างแยกได้ว่าวันไหน "ฝึกแล้ว + อยู่ใน streak ที่
  // ตัวเลขข้างบนกำลังนับอยู่จริง" กับวันไหน "ฝึกไปแล้วแต่ streak ขาดไปแล้ว" — กัน "1 วัน" ข้างบนดูขัดกับ
  // จุด ✓ หลายจุดในแถวสัปดาห์ (ฟีดแบ็ก "Current Streak ดูขัดกับ Timeline")
  const streakChainDates = computeCurrentStreakDates(distinctDates, workoutWeekdays)
  const streak = streakChainDates.size
  const bestStreak = computeLongestStreak(distinctDates, workoutWeekdays)

  const strengthRows =
    (recentStrength as {
      muscle_group: string | null
      performed_at: string
      exercise_name: string | null
      weight_kg: number | null
    }[]) ?? []
  const recoveryDates: Record<string, string | null> = {}
  RECOVERY_MUSCLES.forEach((mg) => {
    const match = strengthRows.find((r) => r.muscle_group === mg)
    recoveryDates[mg] = match?.performed_at ?? null
  })
  const latestPR = computeLatestPR(strengthRows)

  const twoWeeksRows =
    (twoWeeksStrength as { muscle_group: string | null; sets: number | null; performed_at: string }[]) ?? []
  const thisWeekSets: Record<string, number> = {}
  const lastWeekSets: Record<string, number> = {}
  twoWeeksRows.forEach((r) => {
    if (!r.muscle_group) return
    const bucket = r.performed_at >= thisWeekStart ? thisWeekSets : lastWeekSets
    bucket[r.muscle_group] = (bucket[r.muscle_group] ?? 0) + (r.sets ?? 0)
  })
  const weeklyGoalPct = Math.round(
    VOLUME_MUSCLES.reduce((sum, mg) => {
      const target = weeklyVolumeTargets[mg]
      const pct = target > 0 ? Math.min(100, ((thisWeekSets[mg] ?? 0) / target) * 100) : 0
      return sum + pct
    }, 0) / VOLUME_MUSCLES.length
  )

  const volumeInsights = computeVolumeTrendInsights(thisWeekSets, lastWeekSets)
  const imbalanceInsights = computeImbalanceInsights(thisWeekSets, VOLUME_MUSCLES)
  const missedInsights = computeMissedMuscleInsights(recoveryDates)
  // Training Balance Engine — imbalanceInsights ด้านบนเตือนทีละกลุ่มที่ต่ำกว่าค่าเฉลี่ย ส่วนอันนี้มองภาพรวม
  // กว่านั้น: ฝั่งบน/ล่างลำตัวเอียงผิดสัดส่วนไหม (เทียบกับอุดมคติตามจำนวนกลุ่มกล้ามเนื้อจริงของแต่ละฝั่ง ไม่ใช่
  // 50/50) พร้อมคะแนน Balance + 2 กลุ่มที่ควรเพิ่มสัปดาห์นี้ในใบเดียว — null เมื่อสมดุลดีอยู่แล้ว
  const trainingBalance = computeTrainingBalance(thisWeekSets, VOLUME_MUSCLES)
  const trainingBalanceInsights = [trainingBalanceInsight(trainingBalance)].filter((i): i is Insight => i !== null)
  // ไม่ slice ที่นี่แล้ว — คอมโพเนนต์เป็นคนรวมกับ body-composition/workout-frequency insight
  // (ที่ต้อง useWeightUnit() ซึ่งเป็น hook เรียกในนี้ไม่ได้) แล้วค่อย slice ทีเดียวตอน render
  const insights = [...imbalanceInsights, ...volumeInsights, ...missedInsights, ...trainingBalanceInsights]

  // เทรนด์สัดส่วนร่างกายล่าสุด — ใช้ทำ insight เพิ่มเติมในการ์ด AI Coach (ดู bodyFatTrendInsight/
  // muscleMassTrendInsight ใน lib/aiCoach.ts) ไม่ต้องใช้ heightCm เพราะ insight พวกนี้ไม่ได้ใช้ BMI
  const bodyMetricsSummary = computeBodyMetricsSummary((bodyMetricRows as BodyMetric[]) ?? [], null)

  const recoveryPctForSummary: Record<string, number> = {}
  RECOVERY_MUSCLES.forEach((mg) => {
    recoveryPctForSummary[mg] = computeRecoveryPct(recoveryDates[mg] ?? null, mg)
  })
  const pushPullBalance = computePushPullBalance(thisWeekSets)
  const bestVolumeIncrease = computeBestVolumeIncrease(thisWeekSets, lastWeekSets)
  const topMuscleThisWeek = computeTopMuscleThisWeek(thisWeekSets)

  // จำนวนครั้งที่ฝึกแล้วสัปดาห์นี้ (นับวันที่ต่างกัน ไม่ใช่จำนวนแถว) — ใช้ distinctDates ที่ดึงมาแล้ว
  // สำหรับคำนวณ streak ด้านบน (ย้อนหลัง 400 วัน ครอบคลุมสัปดาห์นี้แน่นอน) ไม่ต้อง query ซ้ำ
  const thisWeekWorkoutDays = distinctDates.filter((d) => d >= thisWeekStart && d <= thisWeekEnd).length
  // เป้าหมายจำนวนครั้ง/สัปดาห์ นับจากจำนวนวันที่ผู้ใช้ตั้งโปรแกรมไว้เอง (program_days) — สะท้อน
  // ตารางฝึกจริงของแต่ละคน ถ้ายังไม่ตั้งโปรแกรมเลย ใช้ 3 เป็นค่าเริ่มต้นทั่วไป
  const weeklyWorkoutGoal = typedDays.length > 0 ? typedDays.length : 3

  // แถวติ๊กถูกรายวัน (จ-อา) สำหรับการ์ด Weekly Goal — ใช้ distinctDates ชุดเดียวกับที่คำนวณ
  // streak/thisWeekWorkoutDays ด้านบน ไม่ต้อง query ซ้ำ
  const trainedDateSet = new Set(distinctDates)
  const toIsoLocal = (d: Date) => {
    const offset = d.getTimezoneOffset()
    const local = new Date(d.getTime() - offset * 60000)
    return local.toISOString().slice(0, 10)
  }
  const monday = new Date(thisWeekStart + 'T00:00:00')
  const weekDayTicks: { iso: string; trained: boolean; isFuture: boolean; inStreak: boolean }[] = Array.from(
    { length: 7 },
    (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const iso = toIsoLocal(d)
      return { iso, trained: trainedDateSet.has(iso), isFuture: iso > today, inStreak: streakChainDates.has(iso) }
    }
  )

  const currentDay = typedDays.find((d) => d.day_of_week === dow) ?? null

  const { data: exRows } = currentDay
    ? await supabase.from('program_exercises').select('*').eq('program_day_id', currentDay.id).order('position')
    : { data: null as ProgramExercise[] | null }

  const todayExercises = (exRows as ProgramExercise[]) ?? []
  let completedCount = 0
  let completedExerciseIds: string[] = []
  if (todayExercises.length > 0) {
    const { data: completions } = await supabase
      .from('program_completions')
      .select('program_exercise_id')
      .eq('completed_at', today)
      .in(
        'program_exercise_id',
        todayExercises.map((e) => e.id)
      )
    completedExerciseIds = (completions ?? []).map((c) => (c as { program_exercise_id: string }).program_exercise_id)
    completedCount = completedExerciseIds.length
  }

  // ฟีดแบ็ก "Dashboard แสดง 7/8 ทั้งๆที่ประวัติบันทึกไป 8 ท่า" — completedCount ด้านบนนับได้เฉพาะท่าตาม
  // แผน (program_exercise_id) เท่านั้น ท่า ad-hoc ("เพิ่มท่า" ระหว่างเซสชัน) เดิมไม่มีทางบันทึก completion
  // ได้เลย (migration 042 เพิ่ม workout_id ให้ผูกแทนได้) — นับแยกต่างหากเป็น adhocCompletedCount ไม่รวม
  // เข้ากับ completedCount ตัวบน เพราะ completedCount/progressPctForLabel ด้านล่างมีความหมายเจาะจงว่า
  // "ทำครบตามแผนหรือยัง" (ใช้ตัดสิน AI แนะนำกลุ่มกล้ามเนื้อถัดไป) ซึ่งไม่ควรถูกกระทบจากงานพิเศษนอกแผน —
  // การ์ด Hero (ทั้งเดสก์ท็อป/มือถือ) จะเอาสองค่านี้มาบวกกันเองตอน render แทน (ดู completedCount +
  // adhocCompletedCount ด้านล่างไฟล์นี้/MobileDashboardView.tsx)
  const { data: adhocCompletions } = await supabase
    .from('program_completions')
    .select('id')
    .eq('completed_at', today)
    .not('workout_id', 'is', null)
  const adhocCompletedCount = (adhocCompletions ?? []).length

  // % ความคืบหน้าของแผนวันนี้ ใช้ทั้งโชว์ตัวเลขในข้อความแนะนำ และตัดสินว่า "ฝึกวันนี้ไปแล้ว" หรือยัง
  // ถ้าวันนี้ไม่มีแผนกำหนดไว้ (บันทึกอิสระ) ให้ถือว่า 100% ถ้ามี log อย่างน้อย 1 รายการ ไม่งั้นเป็น null (ยังไม่ได้ฝึกอะไรเลย)
  const progressPctForLabel =
    todayExercises.length > 0
      ? Math.round((completedCount / todayExercises.length) * 100)
      : todayList.length > 0
        ? 100
        : null

  // ท่าของ "ทุกวัน" ในตาราง (ไม่ใช่แค่วันนี้) — ใช้หากล้ามเนื้อหลักจริงของแต่ละวันจากท่าที่ตั้งไว้
  // (dominantMuscleGroup) แทนการเดาจาก title ตรงๆ (ดู comment เต็มที่ ScheduledDay ใน lib/dashboardStats.ts
  // — เดิม getScheduledMuscleForDay ต้องตั้งชื่อวันเป็นชื่อกล้ามเนื้อไทยล้วนๆ เช่น "ขา" ถึงจะจับคู่ได้ ทำให้
  // ผู้ใช้ที่ตั้งชื่อวันแบบบรรยาย เช่น "Day 5 — Lower" ไม่เคยได้ประโยชน์จาก "เคารพตารางประจำสัปดาห์" เลย —
  // ฟีดแบ็ก "AI Coach ยังบอก NEXT ทั้งที่ Today's Focus บอก Day 5 — Lower ซึ่งควรเป็นวันนี้จริงๆ") —
  // currentDay ใช้ todayExercises ที่ดึงไปแล้วด้านบน ไม่ต้อง query ซ้ำ ส่วนวันอื่นดึงเพิ่มทีเดียว
  const otherDayIds = typedDays.filter((d) => d.id !== currentDay?.id).map((d) => d.id)
  const { data: otherDaysExRows } =
    otherDayIds.length > 0
      ? await supabase.from('program_exercises').select('program_day_id, muscle_group').in('program_day_id', otherDayIds)
      : { data: [] as { program_day_id: string; muscle_group: string | null }[] }

  const exercisesByDayId: Record<string, { muscle_group: string | null }[]> = {}
  if (currentDay) exercisesByDayId[currentDay.id] = todayExercises
  ;((otherDaysExRows as { program_day_id: string; muscle_group: string | null }[]) ?? []).forEach((row) => {
    exercisesByDayId[row.program_day_id] = exercisesByDayId[row.program_day_id] ?? []
    exercisesByDayId[row.program_day_id].push(row)
  })

  const scheduledDaysWithMuscle: ScheduledDay[] = typedDays.map((d) => ({
    day_of_week: d.day_of_week,
    title: d.title,
    muscleGroup: dominantMuscleGroup(exercisesByDayId[d.id] ?? []),
  }))

  // กล้ามเนื้อที่ควรแนะนำ: ยึดตามตารางโปรแกรมประจำสัปดาห์ก่อน (ถ้ามี) แทนที่จะดู recovery % สูงสุดล้วนๆ
  // เพื่อไม่ให้แนะนำสวนทางกับตาราง เช่น ตารางบอกวันนี้เป็นวันขา แต่ recovery ของอกดันสูงกว่า
  // ถ้าวันนี้ทำครบตามแผนแล้ว หรือวันนี้เป็นวันพัก/ไม่ได้ผูกกล้ามเนื้อไว้ ให้มองไปที่วันถัดไปในตาราง
  const todayScheduledMuscle = getScheduledMuscleForDay(scheduledDaysWithMuscle, dow, MUSCLE_GROUPS)
  const preferTodayMuscle = !!todayScheduledMuscle && (progressPctForLabel === null || progressPctForLabel < 100)
  const scheduledMuscle = preferTodayMuscle
    ? todayScheduledMuscle
    : getNextScheduledMuscle(scheduledDaysWithMuscle, dow, MUSCLE_GROUPS)
  const muscleRecommendation = suggestMuscleToTrain(recoveryPctForSummary, scheduledMuscle)
  // suggestMuscleToTrain ตกกลับไปเลือกกล้ามเนื้อ recovery สูงสุดเงียบๆ ถ้า scheduledMuscle ไม่มีอยู่ใน
  // recoveryPctByMuscle (เช่น วันนี้ตั้งชื่อวันเป็น "ทั้งตัว"/"อื่นๆ" ซึ่งไม่อยู่ใน RECOVERY_MUSCLES) —
  // เช็คว่าผลลัพธ์จริงตรงกับ todayScheduledMuscle เป๊ะๆ ก่อน ไม่ใช่เชื่อแค่ preferTodayMuscle เฉยๆ กัน
  // ป้าย "· Today" ผิดพลาดในเคสขอบนี้
  const isRecommendationForToday = preferTodayMuscle && muscleRecommendation?.muscleGroup === todayScheduledMuscle

  // ต่อยอด muscleRecommendation (recovery ล้วนๆ) ด้วยเซ็ตที่เหลือถึงเป้าหมายรายสัปดาห์ของกลุ่มนั้น
  // (thisWeekSets/weeklyVolumeTargets คำนวณไว้แล้วด้านบนสำหรับการ์ด Weekly Goal/Weekly Volume อยู่แล้ว)
  // ให้คำแนะนำ "วันนี้ควรเล่นอะไร" ตอบทั้งความพร้อม (recovery) และโควตาที่เหลือ (volume) ในคำตอบเดียว
  const todaysRecommendation = computeTodaysRecommendation(muscleRecommendation, thisWeekSets, weeklyVolumeTargets)

  const aiDailySummary = computeAIDailySummary(muscleRecommendation, pushPullBalance, progressPctForLabel)

  // จำนวนวันที่ฝึกใน 7 วันล่าสุด (รวมวันนี้) — ใช้สำหรับ Fitness Score เท่านั้น ใช้ distinctDates
  // ชุดเดียวกับที่คำนวณ streak ด้านบน ไม่ต้อง query ซ้ำ
  const sevenDaysAgo = daysAgoStr(6)
  const last7DaysTrainedCount = distinctDates.filter((d) => d >= sevenDaysAgo && d <= today).length

  return {
    email: user?.email ?? null,
    profileDisplayName: (profileRow as { display_name: string | null } | null)?.display_name ?? null,
    todayWorkouts: todayList,
    streak,
    bestStreak,
    programDays: typedDays,
    todayExercises,
    completedCount,
    adhocCompletedCount,
    completedExerciseIds,
    recoveryDates,
    insights,
    aiDailySummary,
    bodyMetricsSummary,
    weeklyGoalPct,
    muscleRecommendation,
    todaysRecommendation,
    isRecommendationForToday,
    bestVolumeIncrease,
    thisWeekWorkoutDays,
    weeklyWorkoutGoal,
    weekDayTicks,
    latestPR,
    topMuscleThisWeek,
    hasAnyHistory: distinctDates.length > 0 || typedDays.length > 0,
    last7DaysTrainedCount,
  }
}

// ไอคอนรูปจริงชุดเดียวกับหน้าสุขภาพ (health/page.tsx) — ใช้แทน emoji เดิม (📉/📈/💪) เฉพาะ insight
// ที่เป็นเทรนด์สัดส่วนร่างกาย ให้ภาพลักษณ์ตรงกับหน้าสุขภาพเป๊ะๆ คีย์เป็น "id|kind" เพราะ insight
// กล้ามเนื้อใช้ emoji 💪 ตัวเดียวกันทั้งขึ้นและลง แยกทิศทางไม่ได้ด้วย emoji ต้องแยกด้วย kind แทน
// insight อื่น (volume/imbalance/missed-muscle/workout-frequency) ยังใช้ emoji เดิมต่อไป
export const INSIGHT_IMAGE: Record<string, string> = {
  'trend-body-fat|positive': '/icons/trend-improved.png',
  'trend-body-fat|warning': '/icons/body-fat-high.png',
  'trend-muscle-mass|positive': '/icons/muscle-up-icon.png',
  'trend-muscle-mass|warning': '/icons/muscle-down-icon.png',
}

export default function DashboardPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const today = todayStr()

  const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_DASHBOARD_PREFS)
  // ตั้งค่า Dashboard modal ยกไป context กลาง (DashboardSettingsProvider) แล้ว เพราะปุ่มเปิดย้ายไป
  // อยู่ที่ท้าย Sidebar (เห็นได้ทุกหน้า) ไม่ใช่ไอคอนเฟืองในหน้านี้อีกต่อไป
  const { open: settingsOpen, setOpen: setSettingsOpen } = useDashboardSettings()
  const router = useRouter()
  const searchParams = useSearchParams()
  // ค่าเริ่มต้นคงที่ (ไม่ขึ้นกับเวลา) เพื่อให้ตรงกับ HTML ที่ server render มาเป๊ะๆ —
  // แล้วค่อยคำนวณคำทักทายจริงหลัง mount ฝั่ง client เท่านั้น เพราะ server (UTC) กับ
  // เครื่องผู้ใช้ (เวลาไทย) คำนวณ new Date().getHours() ได้คนละค่า ถ้าคำนวณตรงๆ ตอน
  // render จะทำให้ข้อความไม่ตรงกันระหว่างเซิร์ฟเวอร์กับ client (hydration mismatch)
  const [greetingText, setGreetingText] = useState('สวัสดี')
  // เริ่มด้วย true (ซ่อนไว้ก่อน) กันไม่ให้ banner กระพริบโผล่มาแวบเดียวระหว่างรอเช็ค localStorage
  // ตอน mount — ค่อยเปิดออกถ้าเช็คแล้วว่ายังไม่เคยปิด
  const [bannerDismissed, setBannerDismissed] = useState(true)
  // กลุ่มกล้ามเนื้อที่ hover อยู่ตอนนี้ในการ์ด Recovery — ใช้ไฮไลต์แท่งของกลุ่มนั้นในลิสต์ (v48d: เดิม
  // sync กับ RecoveryBodyDiagram ด้วย แต่ตัดรูปตัวคนออกแล้วตามฟีดแบ็ก เหลือแค่ highlight แท่งตัวเอง)
  const [hoveredRecoveryGroup, setHoveredRecoveryGroup] = useState<MuscleGroup | null>(null)

  // v46: "Titanium Reflection — แสงวิ่งบน Card เวลาขยับ Mouse" — จุดสว่างจางๆ ตามตำแหน่งเมาส์บน Hero
  // Card (การ์ดเดียวที่ควรมี effect ใหม่ตามกฎ "Hero มีแค่ใบเดียว") จำลองแสงสะท้อนผิวโลหะเปลี่ยนมุมตามที่
  // มองจริง — ใช้ ref เขียน style ตรงๆ ตอน mousemove แทน useState (กัน re-render ทั้ง component ทุก
  // เฟรมที่เมาส์ขยับ ซึ่งจะหนักเกินจำเป็นสำหรับแค่ตำแหน่ง highlight เดียว)
  const heroSpotlightRef = useRef<HTMLDivElement>(null)
  function handleHeroMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    if (heroSpotlightRef.current) {
      heroSpotlightRef.current.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,.09), transparent 45%)`
    }
  }
  function handleHeroMouseLeave() {
    if (heroSpotlightRef.current) {
      heroSpotlightRef.current.style.background = 'transparent'
    }
  }

  useEffect(() => {
    setPrefs(loadDashboardPrefs())
    setGreetingText(greeting())
    setBannerDismissed(isOnboardingBannerDismissed())
  }, [])

  // มาจากปุ่ม "ตั้งค่า" ใน Sidebar ตอนอยู่หน้าอื่น (เช่น /dashboard?settings=1) — เปิด modal ให้เลย
  // แล้วล้าง query param ทิ้งไม่ให้ค้างอยู่ใน URL
  useEffect(() => {
    if (searchParams.get('settings') === '1') {
      setSettingsOpen(true)
      router.replace('/dashboard')
    }
  }, [searchParams, setSettingsOpen, router])

  function handleDismissBanner() {
    dismissOnboardingBanner()
    setBannerDismissed(true)
  }

  const {
    data,
    isLoading,
    isError,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['dashboard', today],
    queryFn: () => fetchDashboardData(supabase),
  })

  function updatePrefs(next: DashboardPrefs) {
    setPrefs(next)
    saveDashboardPrefs(next)
  }

  async function handleSaveDisplayName(name: string) {
    await saveDisplayName(supabase, name)
    queryClient.invalidateQueries({ queryKey: ['dashboard', today] })
  }

  function retry() {
    queryClient.invalidateQueries({ queryKey: ['dashboard', today] })
  }

  const { toDisplay, unit } = useWeightUnit()
  const dow = todayDayOfWeek()

  // การ์ด AI Coach: รวม insight เทรนด์สัดส่วนร่างกาย (ไขมัน/กล้ามเนื้อ) + ความถี่การฝึก
  // เข้ากับ insight เดิม (volume/imbalance/missed) — สามตัวแรกมาก่อนเพราะเป็นภาพรวมระดับ
  // "ก้าวหน้าไหม" ที่ผู้ใช้อยากเห็นทันที ส่วนที่เหลือเป็นรายละเอียดระดับกล้ามเนื้อย่อย
  const combinedInsights = useMemo(() => {
    if (!data) return []
    const { bodyMetricsSummary } = data
    const muscleDeltaDisplay =
      bodyMetricsSummary.skeletalMuscleKg.delta != null ? toDisplay(bodyMetricsSummary.skeletalMuscleKg.delta) : 0
    const extra = [
      bodyFatTrendInsight(bodyMetricsSummary.bodyFatPct, bodyMetricsSummary.periodLabel),
      muscleMassTrendInsight(bodyMetricsSummary.skeletalMuscleKg, bodyMetricsSummary.periodLabel, muscleDeltaDisplay, unit),
      workoutFrequencyInsight(data.thisWeekWorkoutDays, data.weeklyWorkoutGoal, dow),
    ].filter((i): i is Insight => i != null)
    return [...extra, ...data.insights].slice(0, 4)
  }, [data, toDisplay, unit, dow])

  const scheduledDay = useMemo(
    () => data?.programDays.find((d) => d.day_of_week === dow) ?? null,
    [data?.programDays, dow]
  )
  const next = useMemo(() => (data ? findNextProgramDay(data.programDays, dow) : null), [data, dow])
  // ประโยคทักทายแบบมีบริบท — ลองมีเรื่อง "วันนี้ทำอะไรต่อ" ก่อน ถ้าไม่มีค่อยลองมี "อะไรดีขึ้นบ้างสัปดาห์นี้"
  const greetingContext = useMemo(
    () =>
      data
        ? computeGreetingContext(scheduledDay?.title ?? null, data.muscleRecommendation, data.bestVolumeIncrease)
        : { headline: null, detail: null },
    [data, scheduledDay]
  )
  const totals = useMemo(() => computeTodayTotals(data?.todayWorkouts ?? []), [data?.todayWorkouts])

  // v47: ฟีดแบ็ก "Workout Card ฝั่งซ้ายล่างยังว่างอยู่บ้าง อยากได้ Calories เติม" — ใช้สูตรประมาณเดียวกับ
  // หน้า Session/Stats (estimateCaloriesToday ใน lib/dashboardStats.ts) ไม่ใช่ตัวเลขสมมติ — น้ำหนักตัวใช้
  // ค่าล่าสุดจาก body_metrics ที่มีอยู่แล้ว (bodyMetricsSummary.weight.value) ถ้ายังไม่เคยบันทึกน้ำหนักเลย
  // ฟังก์ชัน fallback ไป DEFAULT_BODYWEIGHT_KG เอง (70kg) เหมือนจุดอื่นที่เรียกฟังก์ชันนี้ทุกที่
  const todayCalories = useMemo(
    () => estimateCaloriesToday(data?.todayWorkouts ?? [], totals.durationMin, data?.bodyMetricsSummary.weight.value ?? null),
    [data, totals.durationMin]
  )

  // สรุปกลุ่มกล้ามเนื้อหลักที่เทรนวันนี้เป็น label เดียว เช่น "อก + แขน" — ใช้แค่ muscle_group หลัก
  // ของแต่ละ workout (ไม่รวม secondary) เพื่อให้สั้นกระชับพอจะโชว์บน hero card ได้ ไล่ตามลำดับที่เทรนก่อน-หลัง
  const todayMuscleLabel = useMemo(() => {
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const w of data?.todayWorkouts ?? []) {
      if (w.muscle_group && (VOLUME_MUSCLES as readonly string[]).includes(w.muscle_group) && !seen.has(w.muscle_group)) {
        seen.add(w.muscle_group)
        ordered.push(w.muscle_group)
      }
    }
    return ordered.length > 0 ? ordered.join(' + ') : null
  }, [data?.todayWorkouts])
  const progressPct =
    data && data.todayExercises.length > 0 ? Math.round((data.completedCount / data.todayExercises.length) * 100) : null
  // กลุ่มกล้ามเนื้อของ "แผนวันนี้" (ไม่ใช่ที่เทรนไปแล้ว) — มาจาก program_exercises ถ้าตั้งโปรแกรมไว้,
  // ไม่งั้น fallback ไปใช้ todayMuscleLabel (กลุ่มที่เทรนจริงวันนี้ กรณีบันทึกอิสระไม่มีโปรแกรม)
  const plannedMuscleLabel = useMemo(() => {
    if (!data) return null
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const e of data.todayExercises) {
      if (e.muscle_group && (VOLUME_MUSCLES as readonly string[]).includes(e.muscle_group) && !seen.has(e.muscle_group)) {
        seen.add(e.muscle_group)
        ordered.push(e.muscle_group)
      }
    }
    if (ordered.length > 0) return ordered.join(' • ')
    return todayMuscleLabel ? todayMuscleLabel.replace(/ \+ /g, ' • ') : null
  }, [data, todayMuscleLabel])
  // จำนวนเซ็ตที่ตั้งเป้าไว้ทั้งหมดของวันนี้ (จากแผน) — ถ้าไม่มีแผน fallback ไปนับเซ็ตที่บันทึกจริงแล้ว
  const plannedTotalSets = useMemo(() => {
    if (!data) return 0
    if (data.todayExercises.length > 0) return data.todayExercises.reduce((s, e) => s + (e.sets ?? 0), 0)
    return data.todayWorkouts.reduce((s, w) => s + (w.sets ?? 0), 0)
  }, [data])
  // เวลาที่ใช้จริงยังไม่มีจนกว่าจะเริ่มบันทึก (totals.durationMin เป็น null) — ระหว่างนั้นประมาณคร่าวๆ
  // จากจำนวนเซ็ต (ราว 1.5 นาที/เซ็ต รวมพักระหว่างเซ็ต) แค่ให้พอเห็นภาพ ไม่ใช่ตัวเลขแม่นยำ
  const estimatedMinutes = Math.max(10, Math.round((plannedTotalSets * 1.5) / 5) * 5)
  const workoutTitle = scheduledDay?.title ?? ((data?.todayWorkouts.length ?? 0) > 0 ? 'บันทึกอิสระ' : null)
  // % ความคืบหน้าที่ใช้กับข้อความแนะนำกล้ามเนื้อ (recoveryRecommendationLabel) — เหมือน progressPct
  // ของ ring ด้านบน แต่ถ้าวันนี้ไม่มีแผนกำหนดไว้ (บันทึกอิสระ) ให้ถือว่า 100% เมื่อมี log อย่างน้อย 1 รายการ
  const recoveryLabelPct =
    progressPct !== null ? progressPct : (data?.todayWorkouts.length ?? 0) > 0 ? 100 : null

  // v45: ฟีดแบ็ก "Header ยังโล่งเกินไป มีพื้นที่ว่างเกือบ 40%" — เพิ่ม Fitness Score (สูตรจริงเดียวกับที่
  // มือถือใช้อยู่แล้ว ดู MobileDashboardView.tsx, ไม่ใช่เลขสมมติใหม่) ลงไปเติมช่องว่างระหว่างชื่อกับ
  // ป้ายวันที่ — สูตร/น้ำหนักปัจจัยตรงกับ MobileDashboardView.tsx เป๊ะ (Workout Completion 30% / Streak
  // 20% / Sleep 20% (ไม่มีข้อมูลเสมอ กระจายน้ำหนักให้ปัจจัยอื่น) / Recovery 15% / Weekly Goal 10% /
  // Activity วันนี้ 5%) — เดสก์ท็อปไม่เคยมี Fitness Score เลยมาก่อนรอบนี้
  const trainedRecoveryMuscles = data ? RECOVERY_MUSCLES.filter((mg) => data.recoveryDates[mg]) : []
  const recoveryPctMap: Record<string, number> = {}
  if (data) {
    RECOVERY_MUSCLES.forEach((mg) => {
      recoveryPctMap[mg] = computeRecoveryPct(data.recoveryDates[mg] ?? null, mg)
    })
  }
  const fitnessScoreRecoveryPct =
    trainedRecoveryMuscles.length > 0
      ? Math.round(trainedRecoveryMuscles.reduce((sum, mg) => sum + recoveryPctMap[mg], 0) / trainedRecoveryMuscles.length)
      : null
  const fitnessScore = useMemo(() => {
    if (!data) return null
    return computeFitnessScore([
      { key: 'workout', label: 'Workout Completion', value: Math.round((data.last7DaysTrainedCount / 7) * 100), weight: 30 },
      { key: 'streak', label: 'Streak', value: Math.min(100, Math.round((data.streak / 14) * 100)), weight: 20 },
      { key: 'sleep', label: 'Sleep', value: null, weight: 20 },
      { key: 'recovery', label: 'Recovery', value: fitnessScoreRecoveryPct, weight: 15 },
      { key: 'weeklyGoal', label: 'Weekly Goal', value: data.weeklyGoalPct, weight: 10 },
      { key: 'activityToday', label: 'Activity Today', value: progressPct ?? (totals.entryCount > 0 ? 100 : 0), weight: 5 },
    ])
  }, [data, fitnessScoreRecoveryPct, progressPct, totals.entryCount])

  if (isLoading || !data) {
    return <DashboardSkeleton />
  }

  if (isError) {
    return <ErrorState title="โหลด Dashboard ไม่สำเร็จ" message="ไม่สามารถโหลด Dashboard ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่" onRetry={retry} />
  }

  return (
    // < 1024px: flat vertical stack, unchanged from before.
    // >= 1024px (lg): the two column wrappers below switch to `lg:contents` so their
    // children become direct items of this 12-col grid — actual row order is controlled
    // per-item via `lg:order-*`, not by where the element sits in the JSX tree.
    // (Single breakpoint on purpose — many 14" laptops report a CSS viewport width
    // somewhere in the 1024–1280px range, so gating this on `xl` left that whole
    // range stuck on an in-between 2-column layout that never really got tested.)
    <>
    <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-4 lg:items-start">
      {/* greeting + settings */}
      <div className="relative z-20 lg:col-span-12 lg:order-1 flex items-start justify-between gap-3 px-1 animate-rise" style={{ animationDelay: '0ms' }}>
        {/* Hero Background — แสงอำพันจางมากๆ (~3% peak) หลัง Header ตรงจุดที่ชื่อ (BANK ฯลฯ) อยู่ ให้
            ตัวหนังสือรู้สึกมีแหล่งกำเนิดแสงอยู่ข้างหลังจริง แทนที่จะลอยอยู่บนพื้นหลังเรียบเฉยๆ — ยึดตำแหน่ง
            ชิดซ้าย (คอลัมน์ชื่อ ไม่ใช่กลางแถวซึ่งจะไปชนฝั่ง Fitness Score/Recovery pill ทางขวา) จางเร็ว
            (transparent ที่ 70% ของรัศมี) กันไม่ให้ลามไปเป็น glow ทั่วทั้งแถว — z-index ต่ำกว่าเนื้อหา
            (ไม่มี z-index ระบุ = 0 ตามค่า default ของ stacking context นี้ วางก่อน children อื่นใน DOM) */}
        <div
          className="absolute -inset-x-4 -top-8 h-40 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(ellipse 60% 100% at 15% 30%, rgba(255,150,30,.03), transparent 70%)',
          }}
          aria-hidden="true"
        />
        <div>
          <p className="text-xs text-muted">👋 {greetingText}</p>
          <p
            className="uppercase mt-1"
            style={{
              fontFamily: 'var(--font-oswald), var(--font-kanit)',
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: '2px',
              lineHeight: 1,
              backgroundImage: 'linear-gradient(180deg, #FFFFFF, #C7CBD1)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              textShadow: '0 0 24px rgba(255,255,255,.05)', // glow ด้านหลังชื่อ เบามาก ~3-5% ตามที่ขอ
            }}
          >
            {data.profileDisplayName || emailDisplayName(data.email)}
          </p>
          {/* เส้น gradient สั้นๆ ใต้ชื่อ (60-80px) คั่นระหว่าง hero name กับบรรทัด insight ด้านล่าง
              v60: ฟีดแบ็ก "เพิ่มระยะห่างระหว่าง BANK กับ BODY FAT... ประมาณ 6-8px จะหายใจขึ้น" —
              marginBottom (ช่องว่างระหว่างเส้นคั่นกับบรรทัด insight ด้านล่าง) 10 -> 18 (+8px) ไม่แตะ
              marginTop (ช่องว่างระหว่างชื่อกับเส้นคั่น) เพราะฟีดแบ็กพูดถึงช่องว่างรวมก่อนถึงบรรทัด Body Fat */}
          <div
            aria-hidden="true"
            style={{
              width: 70,
              height: 3,
              marginTop: 8,
              marginBottom: 18,
              borderRadius: 2,
              background: 'linear-gradient(90deg, rgba(255,255,255,.5), transparent)',
            }}
          />
          {(() => {
            // ลำดับความสำคัญของ insight ใต้ชื่อ: เทรนด์ไขมันดีขึ้น (ข่าวดีเฉพาะตัว) > streak ต่อเนื่อง (สม่ำเสมอ)
            // > fallback เป็น headline/detail เดิม (แผนวันนี้/คำแนะนำกล้ามเนื้อ) ถ้าไม่มี 2 อย่างแรก
            const bf = data.bodyMetricsSummary.bodyFatPct
            if (bf.delta != null && bf.isGood) {
              return (
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 shrink-0 rounded-full border border-moss flex items-center justify-center text-sm">
                    📉
                  </span>
                  <p className="text-sm">
                    <span className="font-display uppercase tracked text-ink">Body Fat</span>{' '}
                    <span className="font-mono font-semibold" style={{ color: COLORS.deltaGood }}>
                      ↓{Math.abs(bf.delta).toFixed(1)}%
                    </span>
                    <span className="ml-2" style={{ color: COLORS.deltaGood }}>
                      ยอดเยี่ยม! 🎉
                    </span>
                  </p>
                </div>
              )
            }
            if (data.streak > 0) {
              return (
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 shrink-0 rounded-full border border-moss flex items-center justify-center text-sm">
                    🔥
                  </span>
                  <p className="text-sm">
                    <span className="font-display uppercase tracked text-ink">Workout Streak</span>
                    <span className="text-muted mx-1.5">•</span>
                    <span className="font-mono font-semibold" style={{ color: COLORS.deltaGood }}>
                      {data.streak} วัน
                    </span>
                  </p>
                </div>
              )
            }
            return (
              <>
                {greetingContext.headline && (
                  <p className="font-display text-sm tracked uppercase text-amber">{greetingContext.headline}</p>
                )}
                {greetingContext.detail && <p className="text-[11px] text-muted mt-1">{greetingContext.detail}</p>}
              </>
            )
          })()}
        </div>

        {/* v45: ฟีดแบ็ก "Header ยังโล่งเกินไป มีพื้นที่ว่างเกือบ 40%" — เติมช่องว่างระหว่างชื่อกับป้ายวันที่
            ด้วยป้าย Fitness Score (คำนวณจริงด้านบน ไม่ใช่เลขสมมติ) วงแหวนเล็ก+ตัวเลข+ระดับ (Excellent/Good
            ฯลฯ) สีตาม tier เดียวกับที่มือถือใช้ (fitnessScore.color)
            v46: ฟีดแบ็ก "Hero Dashboard" (10/10 wishlist) — มอคอัพขอ "👋 Good Evening / BANK / Ready for
            Upper Body / Fitness Score 84 / Recovery Excellent" แบบ Apple Fitness/Whoop — เลือกไม่รื้อ
            เลย์เอาต์ทักทาย/ชื่อทั้งหมด (เพิ่งทำ Fitness Score pill รอบ v45 ไปแล้ว เปลี่ยนโครงทั้งหมดจะทับ
            งานเดิม + เสี่ยงพังเลย์เอาต์ที่ทดสอบแล้ว) แต่เพิ่มสัญญาณ "Recovery" ที่มอคอัพขอเข้ามาแบบเสริม
            (ป้ายที่สอง สีฟ้าไซแอนเดียวกับการ์ด Recovery) วางคู่กับ Fitness Score pill — ครบทั้ง 2 สัญญาณ
            ที่มอคอัพต้องการโดยไม่ต้องรื้อโครงสร้างเดิม — ไม่โชว์ถ้ายังไม่เคยฝึกกลุ่มกล้ามเนื้อไหนเลย (ข้อมูล
            จริงไม่พอให้ประเมิน ไม่เดาให้ ดู fitnessScoreRecoveryPct ด้านบน) */}
        {fitnessScore && (
          <div className="hidden md:flex flex-1 justify-center items-center gap-2.5 self-center">
            <div
              className="inline-flex items-center gap-2.5 rounded-full px-3 py-1.5"
              style={{
                border: '1.5px solid transparent',
                backgroundImage: `${CARD_GRADIENT_CSS}, linear-gradient(135deg, ${fitnessScore.color}14, ${fitnessScore.color}40, ${fitnessScore.color}14)`,
                backgroundOrigin: 'border-box',
                backgroundClip: 'padding-box, border-box',
                boxShadow: `0 4px 14px rgba(0,0,0,.35), 0 0 8px ${fitnessScore.color}1F`,
              }}
            >
              <GoalRing
                pct={fitnessScore.score}
                size={38}
                strokeWidth={4}
                color={fitnessScore.color}
                valueLabel={String(fitnessScore.score)}
                ariaLabel={`Fitness Score ${fitnessScore.score}`}
              />
              <div className="leading-tight">
                <p className="text-[9px] tracked uppercase text-muted">Fitness Score</p>
                <p className="text-xs font-display tracked uppercase" style={{ color: fitnessScore.color }}>
                  {fitnessScore.tierLabel}
                </p>
              </div>
            </div>
            {fitnessScoreRecoveryPct != null && (
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{
                  border: '1.5px solid transparent',
                  backgroundImage: `${CARD_GRADIENT_CSS}, linear-gradient(135deg, ${withAlpha(COLORS.cyan, '14')}, ${withAlpha(COLORS.cyan, '40')}, ${withAlpha(COLORS.cyan, '14')})`,
                  backgroundOrigin: 'border-box',
                  backgroundClip: 'padding-box, border-box',
                  boxShadow: `0 4px 14px rgba(0,0,0,.35), 0 0 8px ${withAlpha(COLORS.cyan, '1F')}`,
                }}
              >
                <span aria-hidden="true">💤</span>
                <div className="leading-tight">
                  <p className="text-[9px] tracked uppercase text-muted">Recovery</p>
                  <p className="text-xs font-display tracked uppercase" style={{ color: COLORS.cyan }}>
                    {fitnessScoreRecoveryPct >= 76 ? 'Excellent' : fitnessScoreRecoveryPct >= 41 ? 'Good' : 'Needs Rest'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          <span
            // v41: "Version 3" — พื้นกรมท่าเดิม (#13233A/#08121F) เปลี่ยนเป็น CARD_GRADIENT_CSS (titanium
            // เดียวกับทั้งแอป) + glow ลดลง (12px/33 -> 8px/1F)
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full text-[11px] text-ink px-3 py-1.5"
            style={{
              border: '1.5px solid transparent',
              backgroundImage: `${CARD_GRADIENT_CSS}, linear-gradient(135deg, ${withAlpha(COLORS.amber, '14')}, ${withAlpha(COLORS.amber, '40')}, ${withAlpha(COLORS.amber, '14')})`,
              backgroundOrigin: 'border-box',
              backgroundClip: 'padding-box, border-box',
              boxShadow: `0 4px 14px rgba(0,0,0,.35), 0 0 8px ${withAlpha(COLORS.amber, '1F')}`,
            }}
          >
            📅 {new Date(today + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <NotificationButton latestPR={data.latestPR} topMuscleThisWeek={data.topMuscleThisWeek} />
        </div>
      </div>

      {!data.hasAnyHistory && !bannerDismissed && (
        <div className="lg:col-span-12 lg:order-2">
          <OnboardingBanner onDismiss={handleDismissBanner} />
        </div>
      )}

      {/* body composition snapshot — weight/body fat/skeletal muscle/fat mass/BMI with
          week-over-week deltas, pulled from the same body_metrics rows as the /health page.
          Sits above the fold since it's the first thing a user checks each morning. */}
      <div className="lg:col-span-12 lg:order-3 animate-rise" style={{ animationDelay: '15ms' }}>
        {/* v41: ฟีดแบ็ก "ทำเป็น Version 3 (Minimal Dark Titanium)" — เดสก์ท็อปเคยใช้ชุดสีนีออนอิ่มตัวเต็มที่
            แยกต่างหากจากมือถือ (ผ่าน colorScheme="vibrant") — สลับมาใช้ชุดสี/glow เดียวกับมือถือแล้ว
            (compact ยังเป็น false ตามเดิม — โครงเลย์เอาต์ 5 คอลัมน์ของเดสก์ท็อปไม่กระทบ แค่สี/ความเข้ม glow
            เปลี่ยน) v43: prop colorScheme ตัดออกทั้งหมดแล้ว (ไม่มีจุดไหนใช้ "default" อีกเลย ดู
            BodyMetricsRow.tsx) เหลือแค่ชุดสีเดียวเป็นดีฟอลต์ ไม่ต้องส่ง prop นี้อีกต่อไป */}
        <BodyMetricsRow />
      </div>

      {/* PR ล่าสุด / ฝึกมากสุดสัปดาห์นี้ ย้ายไปอยู่ในกระดิ่งแจ้งเตือนที่ header แล้ว (ดู NotificationButton)
          แทนที่จะกินพื้นที่แถวเต็มความกว้างตรงนี้ */}

      {/* Cards cluster (lg+): hero, recovery, weekly goal, AI coach, quick actions, heatmaps.
          This is its own nested grid (lg:grid, not lg:contents) so row numbers below (row-start-1..4)
          are LOCAL to this cluster — mixing an explicit-column item (AI Coach, col-start-10) with
          fully-automatic items (quick actions row, heatmaps) in the outer grid's auto-placement
          flow was leaving phantom empty rows before AI Coach and before the quick-actions row
          (an auto-placement cursor quirk). Explicit col-start / row-start classes on every item
          below sidestep that entirely — placement no longer depends on auto-placement order. */}
      <div className="space-y-6 lg:space-y-0 lg:col-span-12 lg:order-5 lg:grid lg:grid-cols-12 lg:gap-4 lg:items-start">
      {/* left column (lg+): today's workout, quick start, muscle heatmap. */}
      <div className="space-y-6 lg:space-y-0 lg:contents">
      {/* card 1: hero — today's workout. Sets the visual tone: everything else below is
          intentionally quieter (no shadow-hero, smaller type) so the eye has exactly one
          obvious place to land first. */}
      <div
        // v49: ฟีดแบ็ก "แต่ละ Card ใช้ Radius คนละแบบ" — เดิม rounded-lg (8px) ต่างจาก PremiumCard/
        // AICoachCompactCard/WeeklyVolume ที่ 24px มาก เปลี่ยนเป็น rounded-card (token เดียวกัน) ให้
        // มุมโค้งตรงกันทั้งแอป — border/shadow-hero ยังคงไว้เหมือนเดิม (จุดเด่นเฉพาะ Hero การ์ดเดียว)
        className={`relative rounded-card border border-amber/30 shadow-hero overflow-hidden hero-card-cq lg:col-start-1 lg:col-span-5 lg:row-start-1 ${
          totals.entryCount === 0 ? 'animate-hero-enter' : 'animate-rise'
        }`}
        style={{
          // v41: "Version 3 (Minimal Dark Titanium)" — glow เดิม 14px/40 alpha เข้มไป ลดลงให้ Hero
          // ยังเด่นอยู่ (การ์ดเดียวที่ควรมี glow ตามกฎ "Hero มีแค่ใบเดียว") แต่ไม่จัดจ้านเท่าเดิม
          boxShadow: `0 0 8px ${withAlpha(COLORS.amber, '26')}, 0 0 1px ${withAlpha(COLORS.amber, '66')}`,
          ...(totals.entryCount === 0 ? undefined : { animationDelay: '60ms' }),
        }}
        onMouseMove={handleHeroMouseMove}
        onMouseLeave={handleHeroMouseLeave}
      >
        {/* v45: ฟีดแบ็ก "ภาพคนดูธรรมดา ใช้ Dumbbell/Orange Spark จะเข้ากับ Theme มากกว่า" — เดิมเป็นรูปถ่าย
            จริง (/images/workout-hero.jpg) คนละภาษากับวัสดุไทเทเนียม/แสงพลังงานส้มที่การ์ดอื่นทั้งแอปใช้
            เปลี่ยนเป็น CSS/SVG ล้วนตอนนั้น (เงาดัมเบล + orange spark) แทนรูปถ่าย
            v47: ฟีดแบ็ก "Dumbbell Blur เยอะไป (~70%) จนแทบไม่รู้ว่าเป็นอะไร ผมว่าประมาณ 40% ก็พอ" — ปรับ
            opacity/พื้นที่ตาม "Option A: ใช้ Dumbbell เต็มพื้นที่ Ring ซ้อนอยู่มุมขวาล่าง แบบ Apple Fitness"
            v52: วิเคราะห์มอคอัพหลายชุด (ฉาก gym เต็ม + คำโปรยอังกฤษ vs. product shot ดัมเบลพื้นดำ) แล้วให้
            คะแนน product shot สูงสุด (ตรงกับทิศทาง CSS เดิมที่สุด แค่เป็นรูปถ่ายจริงแทนเงา SVG) ผู้ใช้อัปโหลด
            รูปที่เลือกมาที่ public/images/today-workout-hero-dumbbell.png — เปลี่ยนจากเงา SVG + orange spark
            กลับมาเป็นรูปถ่ายจริงอีกครั้ง (คนละจุดกับ workout-hero.jpg เดิมที่ถูกตัดไปเพราะ "เป็นภาพคนดู
            ธรรมดา" — รูปนี้เป็น product shot ดัมเบลพื้นดำ ไม่มีคน ตรงกับที่ฟีดแบ็กบอกว่าอยากได้ตั้งแต่ v45)
            ยังคง gradient fade ซ้ายให้ตัวหนังสืออ่านง่ายเหมือนเดิมทุกประการ วางรูปเป็นชั้นล่างสุด แล้ว
            gradient ทับอยู่ชั้นบน (สลับจากเดิมที่ gradient เป็นพื้นแล้ว SVG ลอยทับ เพราะตอนนี้รูปคือเนื้อหา
            หลัก ไม่ใช่ของตกแต่งอีกต่อไป)
            v53: ฟีดแบ็ก "จอ 14 นิ้ว รูปดัมเบลเห็นไม่ครบ แต่จอ 24 นิ้วไม่ต้องแก้ไขอะไร" — ความสูงการ์ดนี้
            ค่อนข้างคงที่ (คุมด้วยเนื้อหาตัวหนังสือ/ring ไม่ใช่ %) ขณะที่ความกว้างการ์ดแปรผันมากตาม viewport
            (12-col grid) ทำให้กรอบรูป (w-2/3 เดิม) ที่ 14" แคบกว่ามาก อัตราส่วนภาพเลยแคบลงจนเห็นดัมเบลได้
            น้อยกว่าที่ 24" มาก (วัดจริง: การ์ดกว้าง ~431px ที่ viewport 1280px ให้กรอบรูป aspect ~1.84 เทียบ
            กับ ~2.98 ที่การ์ดกว้าง ~697px ของ viewport 1920px) — ใช้ container query (.hero-card-cq ใน
            globals.css) ขยายกรอบรูปเป็น 92% เฉพาะตอนการ์ดแคบกว่า 550px เท่านั้น ให้เห็นดัมเบลครบขึ้นชัดเจน
            จอ 24" (การ์ดกว้างเกิน threshold มาก) ไม่โดนกฎนี้เลย หน้าตาเดิม 100%
            v54: ฟีดแบ็ก "ภาพดัมเบลคมเกินไป เหมือนรูปสินค้า แย่งความสนใจจากข้อความ" — เพิ่ม blur(1.5px) +
            contrast(.92) บนตัวรูป และรวม overlay มืดแนวตั้ง (บาง 18-32%) เข้ากับ gradient เดิม ให้รูปกลาย
            เป็น "บรรยากาศพื้นหลัง" แทนที่จะเป็น product shot คมกริบ — ลดขนาดดัมเบลลง ~8-10% ผ่าน
            transform: scale(.92) (จำเป็นต้องมี overflow-hidden เพิ่มที่กรอบรูปกันรูปสเกลแล้วล้นออกนอก
            กรอบตอน blur) + transform-origin ขยับจุดหมุนไปทาง 60% 42% ให้พื้นที่ว่างที่เพิ่มมาไปอยู่ฝั่งขวา/
            ล่างเป็นหลัก (ไม่ดันชนข้อความฝั่งซ้าย ตามที่ขอ "บาลานซ์กับข้อความ")
            v55: ฟีดแบ็ก "ภาพยังอยู่กลางเกินไป อยากเลื่อนไปทางขวาอีก 8-10%" — objectPosition 68% -> 76%
            (เลื่อนจุดโฟกัสของรูปไปทางขวาเพิ่ม ให้พื้นที่ว่างฝั่งซ้าย ซึ่งเป็นที่อยู่ของ panel ข้อความ
            "หายใจ" มากขึ้นตามที่ขอ) — "ปรับแสงของดัมเบล ตอนนี้ขาวไป อยากให้ warm ขึ้น (4200K)" — เพิ่ม
            sepia(.18) saturate(1.15) hue-rotate(-6deg) บน filter เดิม (blur/contrast คงไว้) ให้โทนสีรูป
            อุ่นขึ้นไปทางเดียวกับสีอำพัน (accent สีเดียวที่ใช้ทั้งแอป) แทนแสงขาวเย็นเดิม
            v56: ฟีดแบ็ก "ตอนนี้ blur+มืด+contrast ต่ำ เลยกลายเป็นเหมือน Texture มากกว่า Hero Image อยากได้
            ความรู้สึก 'วันนี้คือวันลุย' ไม่ใช่ 'มีดัมเบลอยู่'" — v54/v55 กดหนักไปฝั่ง "กลืนเป็นพื้นหลัง" จน
            รายละเอียดหาย ปรับกลับ: blur 1.5px -> 0.4px, contrast .92 -> 1.05, brightness .98 -> 1.02
            (คมและสว่างขึ้นชัดเจน เห็นลาย/พื้นผิวดัมเบลจริง) overlay มืดแนวตั้งลดจาก .18/.32 -> .08/.18
            (บางลงเกินครึ่ง) glow อำพันเดิม (radial 88% 28%) เพิ่ม alpha .16 -> .28 (~75%) ให้ความรู้สึก
            "แสงพลังงาน" เด่นขึ้นแทนที่จะจมอยู่ใต้ความมืด — เพิ่มเลเยอร์ "rim light" ใหม่ (เส้นไล่สีอำพันแนวตั้ง
            บางๆ ตรงรอยต่อระหว่างรูปกับ gradient fade ซ้าย, mixBlendMode: screen ให้เรืองแสงจริงไม่ใช่ทาสีทับ)
            จำลองขอบแสงกระทบดัมเบล ให้มีมิติมากกว่าแค่ภาพแบน
            v59: ฟีดแบ็ก "รูปดัมเบลยังนิ่ง อยากเพิ่มฝุ่นลอย/particle/แสงสะท้อน/flare นิดเดียว ไม่ถึงกับ Gaming
            แต่เหมือนถ่ายในสตูดิโอ" — เพิ่มเลเยอร์ specular flare (เส้นทแยงบางๆ ไล่ขาว/ครีมอ่อนๆ mixBlendMode:
            overlay จำลองแสงสะท้อนผิวโลหะแบบสตูดิโอ ไม่ใช่แสง flare แบบเกม) วางทับรูปแต่ใต้ overlay มืด/glow
            เดิม */}
        <div className="absolute inset-0 bg-surface overflow-hidden">
          <div className="absolute inset-y-0 right-0 w-full sm:w-2/3 hero-image-box overflow-hidden">
            <div className="absolute inset-0" style={{ transform: 'scale(0.92)', transformOrigin: '60% 42%' }}>
              <Image
                src="/images/today-workout-hero-dumbbell.png"
                alt=""
                fill
                className="object-cover"
                style={{
                  objectPosition: '76% 45%',
                  // v62: ฟีดแบ็ก "ภาพดัมเบลยังคมกว่า Card ฝั่งข้อความมาก สายตาโดนดึงไปที่ดัมเบลก่อน DAY 3/
                  // LEGS อยากได้ Text เป็น Hero รูปเป็น Supporting แบบ Apple" — ลด contrast ~10% (1.05 ->
                  // 0.95) + เพิ่ม blur เล็กน้อย (0.4px -> 0.7px, "sharpness ลดนิดเดียว") ให้รูปถอยไปเป็น
                  // บรรยากาศพื้นหลังชัดเจนขึ้น ไม่แย่งสายตาจากข้อความ — saturate ลดตามสัดส่วนเดียวกันเล็กน้อย
                  // (1.25 -> 1.2) กัน contrast ที่ลดลงทำให้สีดูซีดขึ้นสวนทาง (คงความอุ่นไว้) brightness 1.02 ->
                  // 1.0 (เดิมชดเชย overlay มืดที่ตัดไปเยอะแล้วจาก v56 ไม่จำเป็นต้องชดเชยเพิ่มอีก)
                  filter: 'blur(0.7px) contrast(0.95) sepia(0.15) saturate(1.2) hue-rotate(-6deg) brightness(1.0)',
                }}
                priority
              />
            </div>
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `linear-gradient(90deg, ${withAlpha(COLORS.amber, '00')} 0%, ${withAlpha(COLORS.amber, '55')} 8%, transparent 22%)`,
                mixBlendMode: 'screen',
              }}
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'linear-gradient(115deg, transparent 38%, rgba(255,255,255,.10) 47%, rgba(255,244,224,.16) 50%, rgba(255,255,255,.08) 53%, transparent 62%)',
                mixBlendMode: 'overlay',
              }}
              aria-hidden="true"
            />
            {/* v61: ฟีดแบ็ก "พื้นที่หลังดัมเบลยังโล่ง อยากเพิ่มฝุ่น/particle/แสง/หมอกบางๆ ให้หลังดัมเบล แบบ
                Nike/Apple Fitness/Whoop" — โซนล่างขวาของรูป (หลัง/ใต้ดัมเบล) ค่อนข้างว่างเปล่าหลังผ่าน
                overlay มืด/vignette หลายรอบ เพิ่มหมอกอุ่นบางๆ (radial ต่ำมาก 10% alpha) เติมเต็มโซนนั้น
                โดยเฉพาะ ไม่ใช่ครอบทั้งรูป */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 70% 60% at 82% 72%, rgba(255,180,90,.10), transparent 75%)' }}
              aria-hidden="true"
            />
          </div>
          <div
            className="absolute inset-y-0 right-0 w-full sm:w-2/3 hero-gradient-box"
            style={{
              // v58: ฟีดแบ็ก "ใส่ glow สีส้มอ่อนด้านหลังดัมเบลนิดเดียว ไม่ใช่ให้เห็นเป็นวง แต่ให้รู้สึกว่า
              // 'แสงกำลังตกที่ดัมเบล'" — glow เดิม (v56, ellipse 65%/55% ค่อนข้างกลม + fade ที่ 62% ค่อนข้าง
              // แข็ง) เริ่มอ่านเป็นรูปทรงวง/blob ชัดเจนไป — ขยาย ellipse ให้ใหญ่/รีกว่าเดิมมาก (95%/80%,
              // ไม่กลมแบบเดิม) ลด alpha (.28 -> .18) และยืด fade ให้นุ่มมาก (62% -> 82%) ให้ไม่มีขอบชัดเจน
              // ตำแหน่งศูนย์กลางยังอยู่บริเวณเดิม (มุมบนขวา เหนือหัวดัมเบล) ตามภาพร่างที่ให้มา (ประกาย/แสงอยู่
              // เหนือวัตถุ) — อ่านเป็น "แสงกระจายอุ่นๆ ตกกระทบ" แทนที่จะเป็นวงเรืองแสงลอยอยู่ต่างหาก
              backgroundImage: [
                'linear-gradient(180deg, rgba(7,9,13,.08), rgba(7,9,13,.18))',
                'radial-gradient(ellipse 95% 80% at 85% 25%, rgba(255,154,22,.18), transparent 82%)',
                'linear-gradient(90deg, rgba(28,31,36,1) 0%, rgba(28,31,36,0.55) 35%, rgba(28,31,36,0.15) 70%)',
              ].join(', '),
            }}
          />
          {/* v48: ฟีดแบ็ก "โซน Dumbbell (~35% ของการ์ด) มีแค่รูปดัมเบลอย่างเดียว อยากเพิ่ม Glow/Particle
              เบาๆ ให้ดูมีชีวิต" — จุดกระพริบเล็กๆ กระจายรอบไอคอน (เทคนิคเดียวกับ "Particles" ใน
              TodaysWorkoutCompactCard.tsx ขนาด/ตำแหน่งไม่เท่ากันจำลองประกายลอยในอากาศ ไม่ใช่ pattern
              ซ้ำเป๊ะ) — สีทองอุ่นเดียวกับ spark SVG เดิม (#FFB84A) ให้เป็นชุดสีเดียวกัน ยังใช้ได้ดีทับรูปถ่าย
              จริง เพราะรูปที่เลือกมามีฝุ่นกระจายอยู่แล้ว เข้ากับธีมประกายลอยในอากาศพอดี
              v54: ฟีดแบ็ก "เพิ่มฝุ่นหรือ Spark ไม่ต้องเยอะ 2-3 จุดพอ จะดู Cinematic แบบ Nike/Under Armour" —
              เดิมมี 5 จุดเล็กคมเท่ากันหมด (sharp dot ล้วน) ลดเหลือ 3 จุด ผสม 2 แบบ: ฝุ่น/chalk (วงกลม
              เบลอนุ่มๆ ใหญ่กว่า ให้ความรู้สึกเป็นละอองฝุ่นลอย ไม่ใช่จุดคมแข็ง) 2 จุด + spark สว่างคมจุดเดียว
              (คงกลิ่นอายแสงระยิบเดิมไว้ 1 จุด ไม่ให้หายไปทั้งหมด)
              v55: ฟีดแบ็ก "เพิ่ม particle อีกนิด: ฝุ่นทอง 2-3 จุด + bokeh เล็กๆ เฉพาะบริเวณบนของดัมเบล" —
              เพิ่มอีก 2 จุด (bokeh วงใหญ่เบลอจาง + ฝุ่นทองเล็ก) รวมเป็น 5 ทั้งหมด แต่ทุกจุดใหม่กระจุกอยู่
              โซนบนของดัมเบล (top ~10-22%) ตามที่ขอเจาะจง ไม่ใช่กระจายทั่วการ์ดเหมือนเซ็ตเดิม
              v56: ฟีดแบ็ก "particle/dust/orange glow เพิ่มความรู้สึก 'วันนี้คือวันลุย'" — เพิ่มอีก 2 จุด
              (bokeh กลางเฟรม + spark ฝั่งขวาล่าง) รวมเป็น 7 จุด ให้ภาพดูมีพลัง/เคลื่อนไหวมากขึ้น
              v59: ฟีดแบ็ก "รูปดัมเบลยังนิ่ง อยากเพิ่มฝุ่นลอย นิดเดียว" — เพิ่ม animation ลอยเบาๆ (translate
              ไม่กี่ px, 6-8.5s/รอบ) ให้ 3 จุดที่เบลอนุ่มอยู่แล้ว (ไม่ใส่กับจุด spark คมๆ กันดูรบกวนเกินไป)
              — เพิ่ม 2 จุดฝุ่นจางมากๆ (opacity .22-.28) ที่ฝั่งซ้ายของการ์ด (นอกกรอบรูปเดิม เข้าไปในโซน
              ข้อความ) ให้ทั้งการ์ดรู้สึกเป็นฉากเดียวกัน ไม่ใช่รูปกับข้อความคนละที่ (ดู "การ์ดกับรูปแยกกัน" ด้านล่าง) */}
          <div
            className="absolute rounded-full pointer-events-none hero-dust-float-a"
            style={{ left: '58%', top: '16%', width: 22, height: 22, background: 'radial-gradient(circle, rgba(255,200,120,.22), transparent 70%)', filter: 'blur(3px)' }}
            aria-hidden="true"
          />
          <div
            className="absolute rounded-full pointer-events-none hero-dust-float-b"
            style={{ left: '68%', top: '10%', width: 10, height: 10, background: 'radial-gradient(circle, rgba(255,244,224,.35), transparent 70%)', filter: 'blur(1.5px)' }}
            aria-hidden="true"
          />
          <div
            className="absolute rounded-full pointer-events-none"
            style={{ left: '86%', top: '22%', width: 14, height: 14, background: 'radial-gradient(circle, rgba(255,184,74,.28), transparent 70%)', filter: 'blur(2px)' }}
            aria-hidden="true"
          />
          <div
            className="absolute rounded-full pointer-events-none hero-dust-float-c"
            style={{ left: '50%', top: '45%', width: 12, height: 12, background: 'radial-gradient(circle, rgba(255,184,74,.18), transparent 70%)', filter: 'blur(2px)' }}
            aria-hidden="true"
          />
          <span
            className="absolute rounded-full pointer-events-none"
            style={{ left: '73%', top: '14%', width: 2.5, height: 2.5, background: '#FFF4E0', opacity: 0.85, boxShadow: '0 0 5px 1.5px rgba(255,184,74,.7)' }}
            aria-hidden="true"
          />
          <span
            className="absolute rounded-full pointer-events-none"
            style={{ left: '80%', top: '58%', width: 2, height: 2, background: '#FFF4E0', opacity: 0.6, boxShadow: '0 0 4px 1px rgba(255,184,74,.55)' }}
            aria-hidden="true"
          />
          <span
            className="absolute rounded-full pointer-events-none"
            style={{ left: '92%', top: '38%', width: 2, height: 2, background: '#FFF4E0', opacity: 0.55, boxShadow: '0 0 4px 1px rgba(255,184,74,.5)' }}
            aria-hidden="true"
          />
          <span
            className="absolute rounded-full pointer-events-none hero-dust-float-d"
            style={{ left: '4%', top: '30%', width: 2, height: 2, background: '#FFF4E0', opacity: 0.28, boxShadow: '0 0 4px 1px rgba(255,184,74,.3)' }}
            aria-hidden="true"
          />
          <span
            className="absolute rounded-full pointer-events-none"
            style={{ left: '-2%', top: '68%', width: 1.5, height: 1.5, background: '#FFF4E0', opacity: 0.22, boxShadow: '0 0 3px 1px rgba(255,184,74,.25)' }}
            aria-hidden="true"
          />
          {/* v61: อีก 3 จุดเติมโซนล่างขวาที่ว่างเปล่า (ดูคอมเมนต์หมอกด้านบน) — bokeh ใหญ่จาง 1 จุด + spark
              เล็ก 2 จุด ให้สอดคล้องกับสัดส่วน bokeh:spark ของคลัสเตอร์เดิมด้านบน */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{ left: '95%', top: '75%', width: 16, height: 16, background: 'radial-gradient(circle, rgba(255,190,110,.2), transparent 70%)', filter: 'blur(2.5px)' }}
            aria-hidden="true"
          />
          <span
            className="absolute rounded-full pointer-events-none"
            style={{ left: '88%', top: '80%', width: 2, height: 2, background: '#FFF4E0', opacity: 0.5, boxShadow: '0 0 4px 1px rgba(255,184,74,.45)' }}
            aria-hidden="true"
          />
          <span
            className="absolute rounded-full pointer-events-none"
            style={{ left: '78%', top: '85%', width: 1.5, height: 1.5, background: '#FFF4E0', opacity: 0.4, boxShadow: '0 0 3px 1px rgba(255,184,74,.4)' }}
            aria-hidden="true"
          />
        </div>

        {/* v59: ฟีดแบ็ก "Card กับรูปยังแยกกัน เหมือนเอา Card มาวางทับรูป ไม่ได้เชื่อมกัน อยากได้ vignette ให้
            Card รู้สึกลอยอยู่ในฉากเดียวกัน" — เพิ่ม vignette ครอบทั้งการ์ด (ไม่ใช่แค่ครึ่งรูป) มืดขอบ 4 มุม
            เบาๆ เท่ากันทั้งใบ ให้ฝั่งข้อความ (ซ้าย) กับฝั่งรูป (ขวา) ถูกมืดขอบแบบเดียวกัน อ่านเป็นภาพถ่ายเดียว
            ที่มีการ์ด (กระจก) ลอยอยู่ข้างใน แทนที่จะเป็น 2 พื้นผิวแยกกันชัดเจน — วางไว้เหนือทุกเลเยอร์ของภาพ/
            gradient เดิมแต่ใต้ ring/ข้อความ (pointer-events-none, ไม่มี z ระบุ = อยู่ในลำดับ DOM ปกติ ก่อน
            ring/ข้อความที่มี z-10 อยู่แล้ว) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 130% 130% at 50% 45%, transparent 55%, rgba(0,0,0,.30) 100%)' }}
          aria-hidden="true"
        />

        {/* v62: ฟีดแบ็ก "อยากได้ Warm Glow ด้านหลังข้อความแทน ให้ Text เป็น Hero รูปเป็น Supporting" —
            วงรีเรืองแสงอำพันนุ่มๆ วางไว้หลังโซนข้อความ (ซ้าย) โดยเฉพาะ ทะลุผ่านแผ่นกระจกกึ่งโปร่งแสง
            (rgba(18,20,26,.55) ด้านล่าง) ออกมาเป็นไอความอุ่นรอบๆ panel แทนที่จะให้ข้อความลอยอยู่บนพื้นเรียบ
            เฉยๆ — วางไว้ก่อนเลเยอร์ ring/ข้อความ (ต่ำกว่า z-10) ให้กระจกทับอยู่ด้านบนเสมอ */}
        <div
          className="absolute pointer-events-none"
          style={{ top: 0, bottom: 0, left: 0, width: 280, background: 'radial-gradient(ellipse 90% 80% at 20% 45%, rgba(255,170,60,.24), transparent 75%)' }}
          aria-hidden="true"
        />

        {/* v46: "Titanium Reflection" — จุดสว่างจางๆ ตามตำแหน่งเมาส์ (เขียน background ตรงผ่าน ref ใน
            handleHeroMouseMove ด้านบน ไม่ผ่าน React state) วางไว้เหนือชั้นวัสดุพื้นแต่ใต้เนื้อหา (z-10) */}
        <div ref={heroSpotlightRef} className="absolute inset-0 pointer-events-none" aria-hidden="true" />

        {/* v47: "Option A" — Ring ลอย absolute มุมขวาล่าง ซ้อนทับบน Dumbbell background แบบ Apple Fitness
            hero (เดิมอยู่เป็น flex sibling ข้างตัวหนังสือ ดันเลย์เอาต์ให้ Dumbbell เหลือพื้นที่แคบ) —
            glow เดิม (AMBER) คงไว้ผ่าน filter drop-shadow เดียวกับวงอื่นๆ ในหน้า ให้เข้าธีม
            v48: ฟีดแบ็ก "Ring ยังเด่นไปนิด สายตาไปที่ Ring ก่อนแทนที่จะไป DAY 3 / LEGS อยากลดประมาณ
            10-15%" — 100 -> 87 (-13%) strokeWidth ลดตามสัดส่วนเดียวกัน 8 -> 7
            v54: ฟีดแบ็ก "วงกลม 100% ดูลอย อยากให้มี Glow จากพื้นหรือ Reflection จางๆ เหมือน HUD" — ลองทำ
            reflection จริง (ring พลิกกลับแนวตั้งวางใต้ตัวจริง + mask ไล่จาง) ก่อน แต่ GoalRing render
            ตัวเลข "% + label" อยู่กลางวงเสมอ พอพลิกกลับแล้วข้อความอ่านไม่ออกกลายเป็นเงาตัวหนังสือเบลอๆ
            ดูเหมือนจุดบกพร่องมากกว่าลูกเล่น (ตรวจด้วยสกรีนช็อตซูม) — ตัดออก เหลือแค่วงรีเรืองแสงอำพันเบลอ
            กว้างวางอยู่ใต้/หลัง ring จำลองแสงตกกระทบพื้นผิวการ์ดเพียงอย่างเดียว (ไม่มีตัวอักษรให้พลิกผิด
            รูปทรง) ก็ให้ความรู้สึก "วางอยู่บนพื้นผิว" มากขึ้นกว่าเดิมแล้วโดยไม่เสี่ยงเรื่อง readability
            v55: ฟีดแบ็ก "วง 100% สวยแล้ว แต่ถ้าทำให้เหมือน HUD อีกนิด เช่น outer ring หมุนช้าๆ + จุดเล็กๆ
            วิ่งรอบวง จะดู Premium มาก" — เพิ่มอีก 2 เลเยอร์ตกแต่งล้วนๆ (ไม่แตะ GoalRing/ตรรกะคำนวณ %
            เดิมเลย): วงประ (dashed) รัศมีกว้างกว่า ring จริงเล็กน้อยหมุนช้าๆ รอบตัวเอง (8s/รอบ, .hud-outer-
            ring ใน globals.css) จำลองกรอบ HUD + จุดสว่างเล็กดวงเดียวโคจรรอบ ring (4s/รอบ, .hud-bead-orbit)
            ทั้งคู่ pointer-events-none และอยู่ z ต่ำกว่า ring จริง (z-10) ไม่บังคลิก/ไม่ทับตัวเลข %
            v56: ฟีดแบ็ก "Today's Workout Ring ค่อนข้างใหญ่ ลดลงประมาณ 15% จะบาลานซ์กว่า เพราะพระเอกของ
            การ์ดคือ DAY 3 / LEGS ไม่ใช่วงกลม" — 87 -> 74 (-15%, วิธีคิดแบบเดียวกับ v48 ที่เคยลด 100 -> 87
            มาก่อน) strokeWidth ตามสัดส่วนเดียวกัน 7 -> 6 — HUD dashed ring/bead orbit (v55) ปรับขนาดตาม
            ring จริงให้ยังพอดีรอบวงเหมือนเดิม (93 -> 80, คงระยะห่างจาก ring จริง +6px เท่าเดิม)
            v57: ฟีดแบ็ก "ยังรู้สึกใหญ่กว่าที่ควรนิดเดียว ลดอีกประมาณ 10-15%" — 74 -> 64 (-13%, วิธีคิด
            เดียวกันต่อเนื่อง) strokeWidth ตามสัดส่วน 6 -> 5 — HUD outer ring/bead orbit ตามขนาดใหม่ (80 ->
            70, คงระยะห่าง +6px เท่าเดิม) — ที่ 64px ตัว label "ความพร้อม" (ฟอนต์ text-[9px] คงที่ใน GoalRing
            ไม่ผูกกับ size) เริ่มกว้างเกินเส้นผ่านศูนย์กลางวงจริง ล้นทับเส้นวง (ตรวจด้วยสกรีนช็อตซูม) — ใช้
            GoalRing.label แบบ ReactNode (เพิ่งขยายรองรับจาก v56) ส่ง span ฟอนต์เล็กลงเฉพาะจุดนี้แทน string
            เดิม (text-[9px] -> text-[7px]) ไม่กระทบ instance อื่นของ GoalRing ที่ยังพอดีที่ขนาดเดิมอยู่แล้ว
            v58: ฟีดแบ็ก "ตอนนี้เกือบชนขอบล่าง ขยับขึ้นอีกนิดประมาณ 8px จะหายใจมากขึ้น" — ขยับทั้งชุด (glow
            พื้น, HUD outer ring, bead orbit, ring จริง) ขึ้นพร้อมกัน +8px คงระยะห่างสัมพัทธ์ระหว่างกันทุกจุด
            เท่าเดิมทุกประการ (bottom-4 -> bottom-6 ของ ring จริง/bead orbit, -14 -> -6 / -3 -> 5 ของ glow/
            outer ring ตามกัน) ไม่แตะแกน right เลย เพราะฟีดแบ็กพูดถึงแค่แนวตั้ง */}
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: -6,
            right: -10,
            width: 140,
            height: 50,
            background: `radial-gradient(ellipse 55% 100% at 50% 50%, ${withAlpha(COLORS.amber, '4D')}, transparent 72%)`,
            filter: 'blur(3px)',
          }}
          aria-hidden="true"
        />
        <div
          className="absolute rounded-full pointer-events-none hud-outer-ring"
          style={{ bottom: 5, right: -3, width: 70, height: 70, border: `1px dashed ${withAlpha(COLORS.amber, '40')}` }}
          aria-hidden="true"
        />
        <div className="absolute bottom-6 right-4 pointer-events-none hud-bead-orbit" style={{ width: 64, height: 64 }} aria-hidden="true">
          <span
            className="absolute rounded-full"
            style={{ left: '50%', top: -1, width: 4, height: 4, transform: 'translateX(-50%)', background: '#FFF4E0', boxShadow: '0 0 6px 2px rgba(255,184,74,.8)' }}
          />
        </div>
        {/* v60: ฟีดแบ็ก "วงแหวนตอนนี้ดูดีแล้ว แต่ถ้า Glow เบาลงอีก 10% จะดูแพงขึ้น (Apple ชอบทำ Glow บางมาก)"
            — drop-shadow alpha '40' (25.1%) ลด ~10% เชิงสัมพัทธ์ -> '3A' (22.7%) */}
        <div className="absolute bottom-6 right-4 z-10" style={{ filter: `drop-shadow(0 0 6px ${withAlpha(COLORS.amber, '3A')})` }}>
          <GoalRing
            pct={progressPct ?? (totals.entryCount > 0 ? 100 : 0)}
            size={64}
            strokeWidth={5}
            color={COLORS.amber}
            label={<span className="text-[7px]">ความพร้อม</span>}
            ariaLabel="ความพร้อมของวันนี้"
            glow
          />
        </div>

        <div className="relative z-10 px-5 py-6">
          <p className="text-[10px] tracked uppercase text-muted flex items-center gap-1.5">
            <span aria-hidden="true">🔥</span> Today&apos;s Workout
          </p>

          <div className="mt-4">
            {/* v46: "Glass Layer" — ฟีดแบ็ก "Card มี Layer 2 ชั้นเหมือน Apple Vision Pro" — เพิ่มแผ่นกระจก
                (backdrop-blur) ลอยอยู่หลังโซนตัวหนังสือเท่านั้น (ไม่ครอบทั้งการ์ด กันไม่ให้เบลอโซน
                Dumbbell/Spark ทางขวาซึ่งควรคมชัด) แยกชั้น "โลหะ" (พื้นการ์ด) ออกจากชั้น "กระจก" (แผงข้อความ)
                ให้เห็นความลึก 2 ชั้นจริง ไม่ใช่พื้นผิวเดียวแบน
                v47: "Option A" — เลิก flex row ร่วมกับ Ring เดิม (ย้ายไปลอย absolute มุมขวาล่างแล้ว ดูด้านบน)
                จำกัด max-width แทน กันตัวหนังสือยาวเกินไปชนโซน Ring/Dumbbell มุมขวาล่าง
                v55: ฟีดแบ็ก "เพิ่ม Depth ระหว่างข้อความกับพื้นหลัง กล่องข้อความเรียบไป ลองทำ Glass เบาๆ" —
                ของเดิม (v46) เบาบางมาก (blur-sm 4px, bg แทบมองไม่เห็นแค่ highlight gradient จาง ๆ) อัปเกรด
                ตามค่าที่ขอเป๊ะ: bg ทึบขึ้น rgba(18,20,26,.55) + backdrop-blur 16px (blur-sm -> ตัวเลขตรง
                ผ่าน style ปกติเพราะ Tailwind ไม่มี blur-16 ในสเกลดีฟอลต์) + border rgba(255,255,255,.06)
                ให้แผงข้อความ "ลอย" เหนือภาพชัดเจนขึ้นตามที่ขอ */}
            <div className="min-w-0 max-w-[230px] relative">
              <div
                className="absolute -inset-3 rounded-xl pointer-events-none"
                style={{
                  background: 'rgba(18,20,26,.55)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,.06)',
                }}
                aria-hidden="true"
              />
              <div className="relative">
              {(() => {
                const title = workoutTitle ?? 'ยังไม่ได้ตั้งโปรแกรม'
                const splitAt = title.search(/\s[—-]\s/)
                const dayLabel = splitAt >= 0 ? title.slice(0, splitAt) : null
                const restLabel = splitAt >= 0 ? title.slice(splitAt + 3) : title
                return (
                  <>
                    {dayLabel && (
                      <p className="font-display text-lg tracked uppercase text-amber leading-tight">{dayLabel}</p>
                    )}
                    <p className="font-display text-xl tracked uppercase text-ink leading-tight truncate">
                      {restLabel}
                    </p>
                  </>
                )
              })()}

              {plannedMuscleLabel && (
                <p className="text-xs text-amber mt-1.5 truncate">{plannedMuscleLabel}</p>
              )}

              {/* ฟีดแบ็ก "เพิ่มท่า/เพิ่ม Set ระหว่างเซสชัน แต่พอจบ หน้านี้ไม่แสดงตามความจริง" — เดิม Exercises
                  ใช้ data.todayExercises.length (จำนวนแผนล้วนๆ) ตรงๆ ตราบใดที่มีแผนตั้งไว้ (>0 ก็ truthy
                  แล้ว) ไม่เคยเช็ค totals.entryCount (จำนวนที่ log จริงวันนี้) เลย — Sets ก็เช่นกัน
                  plannedTotalSets มาจากผลรวม target sets ของแผนล้วนๆ ไม่บวกรวมเซ็ต/ท่า ad-hoc ที่เพิ่ม
                  เข้าไประหว่างเซสชัน (ดู makeAdhocExercise ใน session/page.tsx) ผลคือ "6 Exercises/20 Sets"
                  ค้างอยู่แบบเดิมแม้ผู้ใช้เพิ่มท่าที่ 7 + เซ็ตรวม 24 จริงไปแล้ว — เปลี่ยนเป็น Math.max(แผน,
                  จริง) แทน: ถ้ายังไม่เริ่ม/ทำได้ไม่ครบแผน ยังโชว์ตัวเลขแผนเหมือนเดิม (ไม่ลดฮวบกลางเซสชัน) แต่
                  ถ้าทำเกินแผน (เพิ่มท่า/เซ็ตเอง) ตัวเลขจะขยับตามจริงทันที ไม่ค้างที่แผนเดิมอีกต่อไป —
                  totals.entryCount/totals.sets มาจาก computeTodayTotals(data.todayWorkouts) ซึ่งนับจาก
                  ข้อมูล log จริงอยู่แล้ว (ใช้ค่าเดียวกับที่ "นาที"/"kcal" สองช่องถัดไปใช้ ไม่ต้องคำนวณซ้ำ) */}
              <div className="flex items-center gap-4 mt-3 flex-wrap">
                <div>
                  <p className="font-mono text-lg text-ink leading-none">{Math.max(data.todayExercises.length, totals.entryCount)}</p>
                  <p className="text-[10px] text-muted mt-0.5">Exercises</p>
                </div>
                <div>
                  <p className="font-mono text-lg text-ink leading-none">{Math.max(plannedTotalSets, totals.sets)}</p>
                  <p className="text-[10px] text-muted mt-0.5">Sets</p>
                </div>
                <div>
                  <p className="font-mono text-lg text-ink leading-none">
                    {totals.durationMin !== null ? Math.round(totals.durationMin) : `~${estimatedMinutes}`}
                  </p>
                  <p className="text-[10px] text-muted mt-0.5">นาที</p>
                </div>
                {/* v47: โชว์เฉพาะมีกิจกรรมจริงวันนี้แล้ว (ไม่เหมือน Exercises/Sets/นาทีด้านบนที่โชว์แผนได้แม้
                    ยังไม่เริ่ม) เพราะแคลอรี่คำนวณจาก workout ที่บันทึกจริงเท่านั้น โชว์ "0 kcal" ก่อนเริ่มจะดู
                    เหมือนบัคมากกว่าข้อมูลที่มีความหมาย */}
                {todayCalories > 0 && (
                  <div>
                    <p className="font-mono text-lg text-ink leading-none">{todayCalories}</p>
                    <p className="text-[10px] text-muted mt-0.5">kcal</p>
                  </div>
                )}
              </div>

              {/* กล้ามเนื้อที่เทรนวันนี้ — ฝังเป็นชิปเล็กในการ์ดนี้เลย แทนที่จะแยกเป็นการ์ดใหญ่
                  ต่างหาก (เคยซ้ำซ้อนกับการ์ด "สัดส่วนกล้ามเนื้อ (สัปดาห์นี้)" ด้านล่าง) */}
              <TodayMuscleChips todayWorkouts={data.todayWorkouts} />

              {/* v49 (Design System Phase 2): เดิม bg-amber เรียบๆ ไม่มี glow ต่างจากปุ่ม CTA หลักของ
                  AI Coach (AMBER_GRADIENT_CSS+glow) ทั้งที่ทำหน้าที่เดียวกัน (primary action) — เปลี่ยน
                  มาใช้ Button component กลาง (components/ui/Button.tsx) ให้เป็นสไตล์เดียวกันทั้งแอป
                  v56: ฟีดแบ็ก "ปุ่มไปต่อดีมากแล้ว แต่ถ้าจะสุด ทำ Glow วิ่งช้าๆ ทุก 5-6 วินาที จะดูเหมือน App
                  จริง" — เพิ่ม className "cta-sweep" (นิยามใน globals.css) สโคปเฉพาะปุ่มนี้เท่านั้น ไม่แตะ
                  Button.tsx ที่ใช้ร่วมกันทั่วแอป (Program/Session/Coach/ฯลฯ ยังไม่มี sweep นี้ — ฟีดแบ็กพูดถึง
                  ปุ่มนี้ปุ่มเดียวบน Dashboard) ทำผ่าน ::after pseudo-element ล้วนๆ ไม่ต้องแก้ Button component
                  เลย คุมจังหวะด้วย keyframe ที่ sweep ผ่านเร็ว (~1s) แล้วหยุดนิ่งอยู่นอกกรอบที่เหลือของรอบ
                  5.5s ให้ความรู้สึก "แสงวิ่งผ่านเป็นระยะ" ไม่ใช่ sweep วนต่อเนื่องซึ่งจะดูรบกวนเกินไป
                  v61: ฟีดแบ็ก "ปุ่มไปต่อยังเด่นเกินไปนิด Glow เยอะ ลด Glow ลงประมาณ 20% แล้วเพิ่ม Inner
                  Shadow แทน จะ Premium กว่า" + "Hover ยกขึ้น 2px" — เดิมปุ่มใช้ AMBER_GLOW_SHADOW (ค่า
                  กลางใน lib/theme.ts ใช้ร่วมกับ Button ทุกจุดในแอป) override เฉพาะจุดนี้ผ่าน style prop
                  (Button.tsx spread ...style ทับ default อยู่แล้ว) เป็นเวอร์ชัน alpha ทุกสต็อปลด ~20% +
                  inset shadow มืดด้านบน/สว่างจางด้านล่างให้ผิวปุ่มดูนูน ไม่ใช่แบนเรืองแสง — ไม่แตะ
                  AMBER_GLOW_SHADOW เดิมหรือ Button.tsx เลย (ฟีดแบ็กพูดถึงปุ่มนี้ปุ่มเดียว เหมือน cta-sweep
                  ด้านบน) — hover:-translate-y-0.5 (Tailwind, -2px) ยกปุ่มขึ้นตอน hover ใช้ transition
                  ที่ Button.tsx มีอยู่แล้ว (ครอบคลุม transform) ไม่ต้องเพิ่ม utility ใหม่ */}
              {scheduledDay ? (
                <Button
                  as={Link}
                  href="/session"
                  size="md"
                  className="mt-4 cta-sweep hover:-translate-y-0.5"
                  style={{
                    boxShadow:
                      '0 0 2px rgba(255,255,255,.48), 0 0 8px rgba(255,210,120,.48), 0 0 22px rgba(255,150,20,.28), 0 0 60px rgba(255,130,0,.10), inset 0 1px 2px rgba(0,0,0,.25), inset 0 -1px 0 rgba(255,255,255,.12)',
                  }}
                >
                  {totals.entryCount > 0 ? 'ไปต่อ' : 'เริ่มเทรนเลย'} <span aria-hidden="true">▶</span>
                </Button>
              ) : (
                <Button
                  as={Link}
                  href="/log"
                  size="md"
                  className="mt-4 cta-sweep hover:-translate-y-0.5"
                  style={{
                    boxShadow:
                      '0 0 2px rgba(255,255,255,.48), 0 0 8px rgba(255,210,120,.48), 0 0 22px rgba(255,150,20,.28), 0 0 60px rgba(255,130,0,.10), inset 0 1px 2px rgba(0,0,0,.25), inset 0 -1px 0 rgba(255,255,255,.12)',
                  }}
                >
                  เริ่มเทรนเลย <span aria-hidden="true">▶</span>
                </Button>
              )}

              {!scheduledDay && (
                <p className="text-[11px] text-muted mt-2">
                  ยังไม่มีโปรแกรมวันนี้ —{' '}
                  <Link href="/program" className="text-amber hover:underline">
                    ตั้งโปรแกรม
                  </Link>{' '}
                  หรือ{' '}
                  <Link href="/templates" className="text-amber hover:underline">
                    เริ่มจากเทมเพลต
                  </Link>
                </p>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* quick start actions — วางไว้ใต้ Today's Workout เสมอ กันผู้ใช้ใหม่ที่ยังไม่มีโปรแกรม/ประวัติ
          ไม่รู้จะกดอะไรต่อ ต่างจาก quick actions ชุดล่างที่เป็นทางลัดทั่วไป (บันทึก/เทมเพลต/สถิติ) —
          ชุดนี้เน้น 3 ทางเริ่มต้นที่ใช้บ่อยที่สุดตอนเปิดแอปครั้งแรก */}
      <div
        className={`grid gap-2 animate-rise lg:hidden ${data.hasAnyHistory ? 'grid-cols-2 min-[380px]:grid-cols-3' : 'grid-cols-2'}`}
        style={{ animationDelay: '120ms' }}
      >
        <QuickAction href="/log" label="บันทึกสถิติ" icon="➕" accent="moss" />
        <QuickAction href="/templates" label="เลือกโปรแกรม" icon="📋" accent="steel" />
        {data.hasAnyHistory && <QuickAction href="/coach" label="ถาม AI" icon="🤖" accent="violet" />}
      </div>

      </div>

      {/* right column (lg+): recovery, weekly goal, AI coach.
          lg:contents — same trick as the left column above. space-y-3 (not -6) below lg so
          Weekly Goal sits snug under Recovery/against AI Coach instead of floating with a
          gap that reads like a missing card. */}
      <div className="space-y-3 lg:space-y-0 lg:contents">
      {/* card 2: recovery — secondary weight on purpose: quieter border, no shadow, tighter
          padding than the hero card above, so it reads as supporting info, not competing for focus */}
      {prefs.showRecovery && (
        <div
          // v41: "Version 3 (Minimal Dark Titanium)" — เดิมมี border+boxShadow สีฟ้าเรืองแสงถาวรทั้งใบ
          // (Recovery เป็นการ์ดรอง ไม่ใช่ Hero) ตัด glow ระดับการ์ดออก เหลือแค่ border-line กลางเหมือน
          // การ์ดรองอื่นๆ ในแอป — สีฟ้ายังอยู่ที่วงแหวนด้านในเท่านั้น (ดู drop-shadow ของ GoalRing ด้านล่าง)
          // v49: rounded-lg (8px) -> rounded-card (24px, token เดียวกับ PremiumCard) ตามฟีดแบ็ก Radius
          // v53: ฟีดแบ็ก "จอ 14 นิ้ว ตัวเลข % ทะลุกรอบการ์ด แต่จอ 24 นิ้วไม่ต้องแก้" — วัดจริงพบว่าที่ความ
          // กว้างการ์ด ~341-355px (viewport 1280-1366px ซึ่งเป็นช่วง 14" laptop ทั่วไป) แถบ badge สถานะ
          // (Excellent/Good/...) + เลข % รวมกันกว้างเกินพื้นที่ที่เหลือหลังจาก ring หัก min-width ของ bar
          // ไปแล้ว ทะลุกรอบแถวออกมาจริงตามที่แจ้ง — ใช้ CSS container query (ไม่ใช่ viewport breakpoint)
          // ผูกกับความกว้างจริงของการ์ดนี้เอง ให้ซ่อน badge สถานะเฉพาะตอนการ์ดแคบกว่า 360px (ครอบคลุม
          // ช่วง 14" ที่วัดได้พอดี พร้อม margin กันขอบ) เหลือแค่เลข % (สีเดียวกับ badge เดิม ข้อมูลไม่หาย
          // แค่กระชับขึ้น) — จอ 24" (การ์ดกว้าง ~555px+) กว้างกว่า threshold มาก ไม่โดนกฎนี้เลย หน้าตาเดิม
          // 100% ตามที่ขอ ("จอ 24 นิ้วไม่ต้องแก้ไขอะไร")
          className="rounded-card bg-surface2/40 border border-line overflow-hidden animate-rise lg:col-start-6 lg:col-span-4 lg:row-start-1 recovery-card-cq"
          style={{ animationDelay: '240ms', containerType: 'inline-size' }}
        >
          <Link href="/recovery" className="block px-4 py-4 active:bg-surface2 transition">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] tracked uppercase text-muted">Recovery</p>
            </div>

            {(() => {
              // recoveryPctMap คำนวณไว้แล้วที่ระดับ component (ใช้ร่วมกับ Fitness Score บน header ด้วย)
              // ไม่ต้องคำนวณซ้ำในนี้อีกรอบ
              // ใช้ตัวที่คำนวณไว้แล้วฝั่งบน (ยึดตามตารางโปรแกรมประจำสัปดาห์ก่อน ถ้ามี) แทนที่จะคำนวณใหม่
              // จาก recovery % ล้วนๆ ตรงนี้ กันไม่ให้การ์ดนี้แนะนำสวนทางกับ hero message ด้านบน
              // v: เดิมใช้ data.muscleRecommendation (recovery % ล้วนๆ) — เปลี่ยนมาใช้
              // data.todaysRecommendation แทน ซึ่งมีฟิลด์เดียวกันครบ (muscleGroup/pct) บวก
              // setsRemaining (เซ็ตที่เหลือถึงเป้าหมายรายสัปดาห์ของกลุ่มนั้น จาก Weekly Volume Engine)
              // ให้ป้ายแนะนำตอบทั้ง "พร้อมฝึกไหม" และ "ยังขาดอีกเท่าไหร่" ในข้อความเดียว
              const recommendation = data.todaysRecommendation
              return (
                <>
                  {recommendation &&
                    (() => {
                      // v45: ฟีดแบ็ก "Recovery เป็นสีเขียว แต่ Ring เป็นฟ้า อยากได้ Palette เดียวกัน" —
                      // ป้ายแนะนำ + badge "พร้อมลุย" เดิมใช้ recoveryStatusColor() (เขียว/เหลือง/แดงตาม %)
                      // ขณะที่วงแหวน "ฟื้นตัวรวม" ด้านล่าง fix เป็นฟ้าไซแอนคงที่ตามธีมการ์ดนี้อยู่แล้ว —
                      // เปลี่ยนป้ายให้ใช้สีฟ้าไซแอนเดียวกับวงแหวนแทน ให้ทั้งการ์ดเป็นโทนเดียวกัน (เฉพาะ
                      // 2 จุดนี้ — จุดสีเขียว/เหลือง/แดงในลิสต์รายกลุ่มกล้ามเนื้อด้านล่างยังคงไว้ เพราะเป็น
                      // สัญญาณข้อมูลจริงว่ากลุ่มไหนพร้อม/ไม่พร้อม ไม่ใช่แค่สีตกแต่ง)
                      const recColor = COLORS.cyan
                      // 90 mirrors FULLY_RECOVERED_PCT in lib/dashboardStats.ts (not exported,
                      // so re-checked here purely for the badge — doesn't change any computed pct)
                      const isFullyReady = recommendation.pct >= 90
                      return (
                        // v49: ฟีดแบ็ก "แถบ Notification สูงเกิน กินพื้นที่เกือบ 20% ทั้งที่ข้อความสั้น
                        // อยากลดความสูงประมาณ 20%" — py-2 (8px) -> py-1.5 (6px) และไอคอน 💪 text-sm (14px)
                        // -> text-xs (12px) ให้ line-height สูงสุดในแถวลดลงด้วย (ไม่ใช่แค่ padding อย่าง
                        // เดียว) รวมกันลดความสูงจริงประมาณ 20% ตามที่ขอ
                        <div
                          className="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 mb-3"
                          style={{ backgroundColor: withAlpha(recColor, '1A') }}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="text-xs shrink-0" aria-hidden="true">💪</span>
                            <p className="text-xs text-ink whitespace-pre-line">
                              {recoveryRecommendationLabel(recoveryLabelPct)}{' '}
                              <span className="font-display tracked uppercase" style={{ color: recColor }}>
                                {recommendation.muscleGroup}
                              </span>{' '}
                              <span className="text-muted">— ฟื้นตัวแล้ว {recommendation.pct}%</span>
                              {/* v: เชื่อม Weekly Volume Engine เข้ากับคำแนะนำวันนี้ — โชว์เฉพาะตอนยังเหลือ
                                  โควตาจริง (setsRemaining > 0) ไม่โชว์ตอนเกินเป้าแล้วเพื่อไม่ให้ป้ายนี้ดู
                                  เหมือนตักเตือน (มีสัญญาณ "เกินเป้า" อยู่แล้วที่การ์ด Weekly Volume) */}
                              {recommendation.setsRemaining > 0 && (
                                <span className="text-muted"> · เหลืออีก {recommendation.setsRemaining} เซ็ตถึงเป้าหมาย</span>
                              )}
                            </p>
                          </span>
                          {isFullyReady && (
                            <span
                              className="shrink-0 text-[10px] font-display tracked uppercase rounded-full px-2.5 py-1"
                              style={{ backgroundColor: recColor, color: NEUTRAL.onAmberText }}
                            >
                              พร้อมลุย
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  {/* v49: ฟีดแบ็ก "ย้าย ring มาอยู่ด้านข้างแบบมอคอัพ V1" — เดิม ring กับลิสต์อยู่กันคนละ
                      บล็อก (ring บล็อกเดี่ยวด้านบน, ลิสต์เต็มความกว้างด้านล่าง) ย้ายมาอยู่แถวเดียวกัน
                      (ring ซ้าย, ลิสต์ขวาเต็มที่เหลือ) items-center ให้ ring อยู่กึ่งกลางแนวตั้งของลิสต์
                      4-7 แถว ตามมอคอัพเป๊ะ — ไม่แตะ logic การคำนวณ/hover/สีใดๆ แค่ย้ายเลย์เอาต์ */}
                  <div className="flex items-center gap-4 mt-3">
                    {(() => {
                      // ฟื้นตัวรวม — ค่าเฉลี่ยของทุกกลุ่มกล้ามเนื้อ แสดงเป็นวงแหวนคู่กับลิสต์รายกลุ่ม
                      // (ตามมอคอัพ v3: ring "พื้นตัวรวม" ข้างๆ list แทนที่จะโชว์แค่ list เดี่ยวๆ)
                      const overallRecoveryPct = Math.round(
                        RECOVERY_MUSCLES.reduce((sum, mg) => sum + recoveryPctMap[mg], 0) /
                          RECOVERY_MUSCLES.length
                      )
                      return (
                        // สีฟ้าไซแอน + glow ตามมอคอัพ v3 — เดิมใช้ recoveryStatusColor() ที่เปลี่ยนสีตามเปอร์เซ็นต์
                        // (เขียว/เหลือง/แดง) ตอนนี้ fix เป็นฟ้าให้เข้าธีมเดียวกับวงแหวนอื่นๆ ในมอคอัพ (v45 —
                        // ring คงสีฟ้าคงที่เป็น "ภาพรวม" เสมอ ไม่ผูกกับ tier แบบแท่งรายกลุ่มด้านล่าง)
                        // v47: ฟีดแบ็ก "การ์ดนี้ข้อมูลเยอะแต่ Ring ยังเล็ก ขยายประมาณ 15% จะบาลานซ์กว่า" —
                        // 84 -> 97 (+15%)
                        // v49: ฟีดแบ็ก "Ring ควรเป็น Hero ของการ์ด ตอนนี้ดูเหมือน icon — อยากได้สัดส่วน
                        // Ring 35% / List 65% (เดิม ~20/80)" — 97 -> 128 (+32%) strokeWidth ขยายตามสัดส่วน
                        // เดียวกัน (9 -> 12) — label เปลี่ยนจากข้อความคงที่ "พื้นตัวรวม" (ซ้ำกับหัวการ์ด
                        // "Recovery" ที่มีอยู่แล้วด้านบน) เป็นคำสถานะ (Excellent/Good/...) จาก recoveryTier()
                        // เดียวกับที่ใช้กับแท่งรายกลุ่ม ให้ตรงกับตัวอย่างที่ขอ ("95% Recovery Excellent")
                        //
                        // v50: ฟีดแบ็ก "Ring ยังใหญ่ไปนิด ดึงสายตาเยอะกว่ารายการทั้งหมด ลดประมาณ 70→58-60px
                        // (สัดส่วนเดียวกัน ~-17%), Glow ลดลงประมาณ 30%" — 128 -> 106 (-17%) strokeWidth
                        // ตามสัดส่วน (12 -> 10) — glow: alpha .40 (25%) ลด 30% เหลือ ~18% (.2D) + blur
                        // 4px -> 3px ให้จางลงตามสัดส่วนเดียวกัน
                        //
                        // v51: ฟีดแบ็ก "Ring ยังชิดซ้ายไปนิด ขยับไปทางขวาอีก 12-16px ให้ Card ดูกึ่งกลางขึ้น"
                        // — เพิ่ม ml-3 (12px) ที่ wrapper นี้ ไม่กระทบตำแหน่ง/ความกว้างของลิสต์ด้านขวา
                        // (ยังเป็น flex-1 เท่าเดิม แค่ปรับจุดเริ่มต้นของ ring เข้ามาจากขอบซ้ายของการ์ด)
                        //
                        // v51: ฟีดแบ็ก "คำว่า Recovering ใต้ % สื่อว่า 'กำลังฟื้นตัว' (เหมือนสถานะ) ไม่ใช่
                        // 'คะแนนการฟื้นตัวโดยรวม' อยากได้ Overall/Recovery/ฟื้นตัวรวม แทน" — เดิม label เป็น
                        // recoveryTier(...).labelEn (คำสถานะ 1 ใน 4 คำ เปลี่ยนไปตาม % เช่น Recovering ที่
                        // ทำให้เข้าใจผิดได้) เปลี่ยนกลับเป็นข้อความคงที่ แต่เลือก "Overall" (ไม่ใช่ "Recovery"
                        // ที่จะซ้ำกับหัวการ์ดตรงๆ ตามเหตุผลเดิมของ v49) ให้สื่อว่าเป็น "ภาพรวม" ของตัวเลข ไม่ใช่
                        // สถานะที่เปลี่ยนไปตาม tier
                        //
                        // v56: ฟีดแบ็ก "Ring ดูโล่งไปนิด อยากได้ 'Recovery' ตามด้วยสถานะ (Recovering/...) 2
                        // บรรทัด แทน 'Overall' บรรทัดเดียว" — v51 กังวลว่าโชว์แค่คำสถานะ (Recovering) เดี่ยวๆ
                        // จะเข้าใจผิดว่าเป็นสถานะลอยๆ ไม่ใช่คะแนนภาพรวม — รอบนี้แก้ตรงจุดกังวลนั้นได้จริง โดย
                        // โชว์ทั้งคู่พร้อมกัน "Recovery" (บริบท, มา ก่อน) + "Recovering" (สถานะจาก
                        // recoveryTier() ตัวเดียวกับที่ใช้กับแท่งรายกลุ่มด้านล่าง สีตาม tier) ให้อ่านออกว่า
                        // เป็น "สถานะของ Recovery" ไม่ใช่คำลอยๆ — GoalRing.label เพิ่งขยายรับ ReactNode ได้
                        // (ดู GoalRing.tsx) เลยส่ง 2 บรรทัดสีต่างกันเข้าไปแทน string เดี่ยว
                        //
                        // v57: ฟีดแบ็ก "ด้านซ้าย (ในวง) ยังค่อนข้างโล่ง ลองเพิ่มบรรทัดเล็กๆ เช่น 'Recovered
                        // 4/7' ให้วงดูมีน้ำหนักขึ้นโดยไม่รก" — เพิ่มบรรทัดที่ 3 (เล็กกว่า 2 บรรทัดบน, มืดกว่า)
                        // นับจำนวนกลุ่มกล้ามเนื้อที่ pct >= 65 (เกณฑ์ "Good" เดียวกับ RECOVERY_TIERS ใน
                        // dashboardStats.ts — ต่ำกว่านี้คือ Recovering/Rest แปลว่ายังไม่พร้อมจริง) จาก
                        // ทั้งหมด RECOVERY_MUSCLES.length (7) ให้ตัวเลขสอดคล้องกับสีของแท่ง/badge รายกลุ่ม
                        // ด้านขวาเป๊ะ ไม่ใช่เกณฑ์แยกต่างหาก
                        //
                        // v60: ฟีดแบ็ก "ตอนนี้เหลือเยอะไปนิด (3 บรรทัด) ข้อมูลด้านขวาก็บอกอยู่แล้วว่า 7
                        // กล้ามเนื้อเหลืออะไร ไม่ต้องบอกซ้ำ" — ตัดบรรทัดที่ 3 ("Recovered X/7" จาก v57) ออก
                        // กลับไปเหลือ 2 บรรทัดเหมือน v56 ("Recovery" + สถานะ) — glow ก็เบาลง ~10% ตามฟีดแบ็ก
                        // "วงแหวนดูดีแล้ว แต่ถ้า Glow เบาลงอีก 10% จะดูแพงขึ้น แบบ Apple" alpha '2D' (17.6%)
                        // -> '28' (15.7%)
                        <div className="shrink-0 ml-3" style={{ filter: `drop-shadow(0 0 3px ${withAlpha(COLORS.cyan, '28')})` }}>
                          <GoalRing
                            pct={overallRecoveryPct}
                            size={106}
                            strokeWidth={10}
                            color={COLORS.cyan}
                            label={
                              <span className="flex flex-col items-center leading-tight">
                                <span className="text-muted">Recovery</span>
                                <span style={{ color: recoveryStatusColor(overallRecoveryPct) }}>
                                  {recoveryTier(overallRecoveryPct).labelEn}
                                </span>
                              </span>
                            }
                            ariaLabel="ฟื้นตัวรวมทุกกลุ่มกล้ามเนื้อ"
                            glow
                          />
                        </div>
                      )
                    })()}
                    {/* v48d: ฟีดแบ็ก "ไม่อยากได้รูปกล้ามเนื้อ (ตัวคน) จุดนี้" — ตัด RecoveryBodyDiagram ออก
                        ทั้งหมด เหลือแค่ลิสต์แท่งยาวตาม % hover ยังไฮไลต์แท่งตัวเองได้เหมือนเดิม แค่ไม่มีคู่
                        ตัวคนให้ sync ด้วยแล้ว */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                    {RECOVERY_MUSCLES.map((mg) => {
                      const pct = recoveryPctMap[mg]
                      const color = recoveryStatusColor(pct)
                      const isHovered = mg === hoveredRecoveryGroup
                      return (
                        <div
                          key={mg}
                          onMouseEnter={() => setHoveredRecoveryGroup(mg)}
                          onMouseLeave={() => setHoveredRecoveryGroup(null)}
                          className="rounded-md px-2 py-1.5 flex items-center gap-2 transition"
                          style={{
                            backgroundColor: isHovered ? '#1D2129' : '#171A20',
                            boxShadow: isHovered ? `0 0 8px ${color}80` : undefined,
                          }}
                        >
                          {/* v49: วิเคราะห์มอคอัพ 4 เวอร์ชัน — จุดร่วมที่ดีที่สุดคือแยกสี "กล้ามเนื้อไหน"
                              (จุดนี้ ใช้ MUSCLE_GROUP_COLORS เดียวกับ WeeklyVolume/WorkoutHeatmap) ออกจากสี
                              "ฟื้นตัวแค่ไหน" (แท่ง+% ด้านล่าง ใช้ recoveryStatusColor ตามเดิม) — เดิมทั้งแถว
                              ใช้ recoveryStatusColor เดียวกันหมด (พื้นหลัง/glow/แท่ง/%) ทำให้ไม่มีสัญญาณสีที่
                              บอกกล้ามเนื้อเลย ต้องอ่านจากตัวหนังสือเท่านั้น — พื้นหลัง/glow ของทั้งแถวยังคงเป็น
                              status color เดิม (เอาไว้บอก hover state ทั้งแถว ไม่ใช่จุดประสงค์เดียวกับจุดนี้)
                              v57: ฟีดแบ็ก "พื้นหลังแต่ละแถวสีต่างกันหมด (เขียว/น้ำตาล/แดง/ม่วง) สวยแต่มีโอกาส
                              ดู Premium ขึ้นอีกถ้าพื้นทุกแถวเหมือนกัน (#171A20) แล้วใช้แค่จุดสี/แท่ง/badge
                              บอกสถานะแทน ลดจำนวนสีที่แข่งกันบนจอ" — background พื้นแถว (idle) เปลี่ยนจาก
                              status-color tint (${'{'}color{'}'}14) เป็น #171A20 คงที่ทุกแถวทุกสถานะ hover
                              ก็เปลี่ยนเป็นสีเทาเข้มขึ้นเล็กน้อยคงที่ (#1D2129) แทน status-color tint เดิม
                              เช่นกัน — glow ตอน hover (boxShadow) ยังคงใช้สี status เดิม เพราะเป็น interaction
                              feedback ชั่วคราวตอนโฟกัสแถวเดียว ไม่ใช่สีพื้นถาวรที่แข่งกันบนจอเหมือนที่ฟีดแบ็ก
                              บ่น — สัญญาณสถานะทั้งหมดตอนนี้อยู่ที่จุดสี(กล้ามเนื้อ)/แท่ง(สถานะ)/badge(สถานะ)
                              ล้วนๆ ตามที่ขอ */}
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: MUSCLE_GROUP_COLORS[mg] }}
                            aria-hidden="true"
                          />
                          <span className="text-[9px] text-ink w-11 shrink-0 truncate">{mg}</span>
                          {/* v49: ฟีดแบ็ก "ทุกแท่งหน้าตาเหมือนกันหมด (██████) เลยอ่านยาก อยากใช้ Badge
                              สถานะ (Excellent/Good/Recovering/Rest) แทน Progress Bar ทั้งหมด จะ Premium
                              กว่า" — เดิม AnimatedBarFill (แท่งยาว ∝ %) ตัดออกทั้งหมด แทนที่ด้วย badge
                              ข้อความสถานะจาก recoveryTier() (ตัวเดียวกับที่คุม color ของแถวนี้อยู่แล้ว —
                              ไม่มีทางหลุดซิงค์กัน) — glow เบาๆ ตามฟีดแบ็ก "ใช้ Glow เบาๆ" ข้อ 5
                              v50: ฟีดแบ็ก "อยากได้ทั้ง Bar บางๆ (5-6px) กับ Badge คู่กัน ไม่ใช่แค่อย่างใด
                              อย่างหนึ่ง" — เพิ่ม AnimatedBarFill กลับมาแบบเรียบที่สุด (ไม่มี glow/gradient/
                              inset-shadow เหมือนรอบ v48 ที่ทำให้ "รู้สึกหนัก" — พร็อพดีฟอลต์ทั้งหมด สีเรียบ
                              ล้วนบางๆ h-1 (4px) แบบ Apple/Notion) คั่นกลางระหว่างชื่อกับ badge/%
                              v58: ฟีดแบ็ก "Bar หนาได้อีกนิด ตอนนี้ ~5px ลองใช้ 7-8px จะดู Luxury กว่า แบบ
                              Apple Fitness/Garmin/Oura" — h-1 (4px) -> h-2 (8px, ตรงกับตัวเลือกบนของ 2 ค่า
                              ที่เสนอมาเป๊ะ และเป็น Tailwind step มาตรฐานพอดี ไม่ต้องใช้ arbitrary value
                              v61: ฟีดแบ็ก "Bar ยังดูแบน อยากได้ glow บางๆ/highlight บนแท่ง แบบ Apple
                              Activity" — ย้อนกลับการตัดสินใจ v50 บางส่วน (ตอนนั้นตัด glow ออกเพราะรู้สึก
                              "หนัก" — แต่ตอนนี้ bar หนาขึ้นเป็น h-2 แล้วตั้งแต่ v58 บาลานซ์กับ inset
                              highlight ได้ดีกว่าตอน h-1 บางๆ) — เปิด prop glow ของ AnimatedBarFill (มีอยู่
                              แล้วตั้งแต่ v48 แต่ปิดไว้ default false ไม่กระทบจุดเรียกอื่น) ให้ inset highlight
                              บนแท่ง (rgba(255,255,255,.3)) + inset shadow ล่าง + glow นอกบางๆ สีเดียวกับ
                              badge/สถานะแถวนั้นอยู่แล้ว ไม่ต้องเพิ่ม prop สีใหม่ */}
                          <span className="relative flex-1 min-w-[18px] h-2 rounded-full overflow-hidden bg-black/40">
                            <AnimatedBarFill pct={pct} color={color} glow />
                          </span>
                          {/* v50: ฟีดแบ็ก "% อยู่ห่างจาก Badge เหมือนมีข้อมูล 3 จุด (ชื่อ/Badge/%) สายตา
                              กระโดด อยากให้ Badge กับ % รู้สึกเป็นคู่เดียวกัน" — ห่อ badge+% ไว้ในกลุ่มเดียว
                              gap แคบกว่า (gap-1) แยกจาก gap ของแถวหลัก (gap-2) ให้ 2 ตัวนี้อ่านเป็นหน่วย
                              เดียวกันจริงๆ แทนที่จะเป็น element เรียงเท่าๆ กัน 3 ชิ้น
                              v56: ฟีดแบ็ก "แถวนี้ดูเป็น Table มากกว่า Dashboard อยากได้ ●ชื่อ + แท่ง +
                              สถานะ (Excellent) แทนที่จะมีเลข % แยกอีกคอลัมน์" — ตัดเลข % ตัวเลขดิบออก
                              (สีของแท่ง + badge สถานะ สื่อระดับเดียวกันอยู่แล้ว ตัวเลขดิบเป็นข้อมูลซ้ำที่ทำให้
                              รู้สึกเหมือนตาราง/สเปรดชีต) เหลือ dot+ชื่อ+แท่ง+badge บนแถวเดียวเหมือนเดิม — เลือก
                              ไม่ตัดขึ้นเป็น 3 บรรทัดแยก (ตามมอคอัพทางเลือกที่ 2 ที่เสนอมา) เพราะจะทำให้ลิสต์นี้
                              สูงขึ้น ~3 เท่า ชนกับสัดส่วน ring/list ที่ปรับสมดุลกันมาหลายรอบแล้ว (v49-v51)
                              ยุบ wrapper กลุ่ม badge+% เดิม (v50) ออกด้วยเพราะเหลือ badge ตัวเดียวแล้ว */}
                          <span
                            className="recovery-tier-badge shrink-0 text-[8px] font-display font-semibold tracked uppercase rounded-full px-1.5 py-0.5"
                            style={{
                              backgroundColor: withAlpha(color, '22'),
                              color,
                              boxShadow: `0 0 4px ${withAlpha(color, '55')}`,
                            }}
                          >
                            {recoveryTier(pct).labelEn}
                          </span>
                        </div>
                      )
                    })}
                    </div>
                  </div>
                  {/* v49: ฟีดแบ็ก "View Detail เล็กไปนิด ลองทำเป็นเส้นคั่นด้านบน + View Recovery Detail →
                      จะดูเป็น Apple มากกว่า" — เพิ่มเส้นคั่นบาง (border-t) แยกจากลิสต์ด้านบนชัดเจน แล้ว
                      ขยายข้อความจาก "View Detail" เป็น "View Recovery Detail" ตามตัวอย่างแรกที่ให้มา
                      v56: ฟีดแบ็ก "'View Recovery Detail' ยังเป็น Link แต่การ์ดทั้งใบ Premium มากแล้ว
                      ลองเปลี่ยนเป็น 'See Full Recovery'/'Recovery Details'/'View Insights'" — เลือก
                      "Recovery Details" (ตัวเลือกที่ 2 ที่เสนอมา) เพราะสั้นกระชับสุดใน 3 ตัวเลือกแต่ยัง
                      สื่อตรงว่าลิงก์นี้พาไปหน้ารายละเอียด (/recovery) เหมือนเดิมทุกประการ ไม่ใช้ "View
                      Insights" เพราะกว้างเกินไป ฟังดูเหมือนมีบทวิเคราะห์/คำแนะนำเพิ่มที่หน้า /recovery
                      ไม่มีจริง */}
                  <p className="mt-3 pt-3 border-t border-white/5 text-right text-xs text-amber">
                    Recovery Details →
                  </p>
                </>
              )
            })()}
          </Link>
        </div>
      )}

      {/* card 4: weekly goal — secondary weight, matches recovery/AI-coach treatment.
          uses the same ring as the hero card's daily progress so "goal completion" reads
          consistently as a ring throughout the dashboard, instead of a ring in one place
          and a flat percent-bar in another. */}
      <div
        // v41: เหตุผลเดียวกับการ์ด Recovery ด้านบน — ตัด glow ระดับการ์ดออก เหลือ border-line กลาง
        // v49: rounded-lg (8px) -> rounded-card (24px, token เดียวกับ PremiumCard) ตามฟีดแบ็ก Radius
        className="rounded-card bg-surface2/40 border border-line overflow-hidden animate-rise lg:col-start-10 lg:col-span-3 lg:row-start-1"
        style={{ animationDelay: '300ms' }}
      >
        <div className="px-4 py-4">
          <p className="text-[10px] tracked uppercase text-muted mb-3">Weekly Goal</p>

          <div className="flex items-center gap-4">
            {/* v45: ฟีดแบ็ก "วงกลมชมพูโดดออกมา ไม่เข้ากับ Dark Titanium — เปลี่ยนเป็น Orange/Titanium
                Gold เข้ากว่า" — สีม่วงชมพูนีออน (#E339A6) เดิมมาจากมอคอัพ v3 ตอนนั้น ไม่ใช่โทนไทเทเนียม/
                อำพันที่เหลือทั้งแอปใช้ — เปลี่ยนเป็น COLORS.amber เดียวกับ Hero Ring/ปุ่ม CTA ทั่วแอป
                v47: ฟีดแบ็ก "อยากให้มี Animation เช่น Ring Glow เวลาครบเป้า" — ครบเป้า (pct >= 100) เดียว
                เท่านั้นที่ขึ้น (ไม่ใช่ ambient ตลอดเวลา ตามงบ motion ที่คุยกันไว้) ยืม .animate-pr-glow
                (ripple 2 ครั้งแล้วหยุด ใช้กับการ์ด PR celebration อยู่แล้ว) มาใช้ซ้ำแทนสร้าง keyframe ใหม่ */}
            <div
              className={data.weeklyGoalPct >= 100 ? 'rounded-full animate-pr-glow' : undefined}
              style={{ filter: `drop-shadow(0 0 4px ${withAlpha(COLORS.amber, '40')})`, ...({ '--pr-glow': 'rgba(232,163,61,.5)' } as React.CSSProperties) }}
            >
              <GoalRing
                pct={data.weeklyGoalPct}
                size={72}
                strokeWidth={7}
                color={COLORS.amber}
                label="Goal"
                ariaLabel="Weekly Goal"
                glow
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2.5">
                <span className="text-xl leading-none shrink-0" aria-hidden="true">🔥</span>
                <div>
                  <p className="text-sm text-ink">
                    <span className="font-mono font-medium">{data.thisWeekWorkoutDays}</span> ครั้งแล้วในสัปดาห์นี้
                  </p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {computeWorkoutMotivationLabel(data.thisWeekWorkoutDays, data.weeklyWorkoutGoal)}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-muted mt-2.5">
                <span className="text-ink font-mono">{data.streak}</span> Day Streak
              </p>
            </div>
          </div>

          {/* day-tick row (จ-อา) — เช็คว่าวันไหนของสัปดาห์นี้ออกกำลังกายแล้วบ้าง */}
          <div className="grid grid-cols-7 gap-1.5 mt-4">
            {data.weekDayTicks.map((tick, i) => (
              <div
                key={tick.iso}
                className="flex flex-col items-center gap-1"
                role="img"
                aria-label={`${WEEKDAY_LABELS[i]}: ${tick.trained ? 'ฝึกแล้ว' : tick.isFuture ? 'ยังไม่ถึงวัน' : 'ยังไม่ได้ฝึก'}`}
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0"
                  style={
                    tick.trained
                      ? { backgroundColor: COLORS.moss, color: NEUTRAL.onAmberText }
                      : { backgroundColor: NEUTRAL.chipInactive, color: NEUTRAL.mutedIcon }
                  }
                  aria-hidden="true"
                >
                  {tick.trained ? '✓' : ''}
                </span>
                <span className={`text-[9px] ${tick.isFuture ? 'text-muted/50' : 'text-muted'}`} aria-hidden="true">
                  {WEEKDAY_LABELS[i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* card 5 (optional): AI coach — sits under Weekly Goal in the rightmost column and
          spans down alongside the quick-actions/heatmap rows (lg:row-span-2 — the cluster is
          now only 3 rows tall since the standalone "today muscle" row was folded into the
          hero card above).
          v42: ฟีดแบ็ก "Version 3" มอคอัพมี AI Coach panel เป็นทรง ring-avatar + headline + recovery bar
          + gradient CTA เหมือนกับที่มือถือมี AICoachCompactCard อยู่แล้ว (ไม่ใช่ list InsightCard เฉยๆ
          แบบเดิม) — สลับมาใช้ AICoachCompactCard ตัวเดียวกับมือถือตรงๆ (รับ props message/
          muscleRecommendation ชุดเดียวกับที่ MobileDashboardView ส่งอยู่แล้ว ไม่ต้องเขียนใหม่) เป็นชิ้นบนสุด
          — insight list เดิม (เทรนด์ไขมัน/กล้ามเนื้อ/วอลุ่ม ฯลฯ) ยังเก็บไว้ครบ วางต่อท้ายด้านล่างแทนที่จะ
          ทิ้ง เพราะเป็นข้อมูลที่ AICoachCompactCard เองไม่ได้ครอบคลุม — เอา wrapper กรอบ/พื้นหลังเดิมออก
          (bg-surface2/40 border) เพราะ AICoachCompactCard มีกรอบไทเทเนียม+badge "อัปเดตล่าสุด" ของตัวเอง
          อยู่แล้ว ซ้อนกรอบซ้ำจะกลายเป็นการ์ดในการ์ด ส่วน InsightCard เองก็มีกรอบตัวเองอยู่แล้วเช่นกัน —
          ป้าย "อัปเดต" เดิมตรงนี้ตัดออกด้วย (ซ้ำกับ badge ในตัว AICoachCompactCard) เช่นเดียวกับ fallback
          block เดิม (ไม่มี insight) เพราะ AICoachCompactCard เองมี fallback แสดง message อยู่แล้วในตัว —
          ส่วนบล็อกสรุปสถิติรายสัปดาห์ที่เคยอยู่ใน fallback นั้นตัดออกเพราะซ้ำกับการ์ด Weekly Goal ที่อยู่
          เหนือขึ้นไปแล้ว (ครั้งที่ฝึกสัปดาห์นี้ + weeklyGoalPct) */}
      {prefs.showAICoach && (
        <div
          className="flex flex-col gap-3 animate-rise lg:col-start-10 lg:col-span-3 lg:row-start-2 lg:row-span-2"
          style={{ animationDelay: '360ms' }}
        >
          <AICoachCompactCard
            message={data.aiDailySummary}
            muscleRecommendation={data.todaysRecommendation}
            href="/coach"
            lastUpdatedAt={dataUpdatedAt}
            recoveryDates={data.recoveryDates}
            isRecommendationForToday={data.isRecommendationForToday}
            todayWorkoutTitle={workoutTitle}
          />
          {/* v48: ฟีดแบ็ก "Insight มี 2 ใบ วางซ้อนกันแนวตั้งกินพื้นที่ ทำเป็น Carousel จะดีกว่า" —
              เดิม map วาง InsightCard เรียงต่อกัน space-y-2 (สูงเท่าจำนวนใบรวมกัน) เปลี่ยนเป็น
              InsightCarousel ปัดแนวนอนทีละใบแทน สูงคงที่แค่ 1 ใบเสมอไม่ว่าจะมีกี่ insight */}
          <InsightCarousel insights={combinedInsights} imageFor={(insight) => INSIGHT_IMAGE[`${insight.id}|${insight.kind}`]} />
        </div>
      )}
      </div>

      {/* merged quick actions — lg only. Below lg, the two original quick-action groups
          above/below (quick-start + log/templates/stats) stay as-is; at xl they're both
          hidden and replaced by this single deduplicated row so the 12-col grid doesn't
          show the same "บันทึก"/"เทมเพลต" shortcuts twice. Narrowed to col-span-9 (from 12)
          so it sits beside the AI Coach card instead of running underneath it. */}
      <div
        className={`hidden lg:grid lg:col-start-1 lg:col-span-9 lg:row-start-2 gap-3 ${data.hasAnyHistory ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}
      >
        <QuickAction href="/log" label="บันทึกสถิติ" icon="➕" accent="moss" />
        <QuickAction href="/templates" label="เลือกโปรแกรม" icon="📋" accent="steel" />
        <QuickAction href="/health" label="วิเคราะห์ร่างกาย" icon="🔍" accent="amber" />
        <QuickAction href="/stats" label="สถิติ" icon="📈" accent="rust" />
        {data.hasAnyHistory && <QuickAction href="/coach" label="ถาม AI" icon="🤖" accent="violet" />}
      </div>

      {/* full width (lg+): below-the-fold charts, insights, quick actions
          Order follows a "what happened -> am I on track -> what's next" reading flow:
          full graphic heatmap + weekly volume (side by side, lined up with AI Coach) ->
          today's trained-muscle heatmap -> muscle share card -> consistency calendar
          (recent workouts / PRs per day) -> next-up + quick actions last.
          Narrowed to col-span-9 (from 12), same reason as the quick-actions row above —
          leaves room 10-12 for the AI Coach card. */}
      <div className="grid grid-cols-1 gap-6 items-start lg:contents">
        <div className="lg:col-start-1 lg:col-span-6 lg:row-start-3">
          <WeeklyMuscleHeatmap />
        </div>
        <div className="lg:col-start-7 lg:col-span-3 lg:row-start-3">
          <WeeklyVolume />
        </div>
      </div>
      </div>
      {/* end cards cluster sub-grid */}

      {/* Consistency card is full-width here — its own 4 stat tiles (workout days, streak
          weeks, weekly volume, weekly exercise count) render beside the calendar grid inside
          ConsistencyStrip itself (two-column on lg+), matching the reference layout instead
          of duplicating streak/PR numbers in separate cards next to it. */}
      <div className="lg:col-span-12 lg:order-15">
        <ConsistencyStrip />
      </div>

      {/* Next up in program — kept near the end so the top-to-bottom flow reads as
          "what happened this week" before "what's coming up next". PR history lives
          on the Statistics page alongside the rest of the analytics. */}
      {next && (
        // v49: rounded-lg (8px) -> rounded-card (24px, token เดียวกับ PremiumCard) ตามฟีดแบ็ก Radius
        <div className="rounded-card bg-surface border border-line shadow-elevated overflow-hidden lg:col-span-12 lg:order-20">
          <div className="px-4 py-3 flex items-center justify-between">
            <p className="text-[11px] text-muted">
              Next up: <span className="text-ink">{next.day.title}</span>
            </p>
            <span className="text-[11px] font-mono text-muted">
              {next.daysAway === 1 ? 'พรุ่งนี้' : `อีก ${next.daysAway} วัน`}
            </span>
          </div>
        </div>
      )}

      <div className="lg:col-span-12 lg:order-21">
        <WeeklyCardioVolume />
      </div>

      {/* quick actions — hidden at xl, superseded by the merged row placed with lg:order-9 above */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:hidden">
        <QuickAction href="/log" label="บันทึกสถิติ" icon="✚" accent="moss" />
        <QuickAction href="/templates" label="เทมเพลต" icon="📋" accent="steel" />
        <QuickAction href="/health" label="วิเคราะห์" icon="🔍" accent="amber" />
        <QuickAction href="/stats" label="สถิติ" icon="📈" accent="rust" />
      </div>
      </div>

      {settingsOpen && (
        <DashboardSettings
          open={settingsOpen}
          prefs={prefs}
          onChange={updatePrefs}
          onClose={() => setSettingsOpen(false)}
          displayName={data.profileDisplayName ?? ''}
          displayNamePlaceholder={emailDisplayName(data.email)}
          onSaveDisplayName={handleSaveDisplayName}
        />
      )}
    </>
  )
}

// v49: ฟีดแบ็ก "แต่ละ Card ใช้สีคนละแบบ...ควรมี Design System อิง Token เดียว" — เดิมไฟล์นี้มี object นี้
// ประกาศ hex ซ้ำกับ COLORS ใน lib/theme.ts เป๊ะทั้ง 5 ค่า (amber/steel/moss/violet/rust) แยกเป็นชุด
// ของตัวเอง ถ้าใครเปลี่ยนสีใน lib/theme.ts จะไม่มีผลกับปุ่ม Quick Action เลย — เก็บแค่ type ที่จำกัด 5
// คีย์ไว้ (QuickAction ตั้งใจให้เลือกได้แค่ 5 สีนี้ ไม่ใช่ทุกสีใน COLORS) แต่ดึงค่าจริงจาก COLORS แทน
type QuickActionAccent = 'amber' | 'steel' | 'moss' | 'violet' | 'rust'

function QuickAction({
  href,
  label,
  icon,
  accent = 'amber',
}: {
  href: string
  label: string
  icon: string
  accent?: QuickActionAccent
}) {
  const hex = COLORS[accent]
  return (
    <>
      {/* v45: ฟีดแบ็ก "Quick Action ยังเรียบไป อยากได้ Glass Button + Glow ตอน Hover" — เดิมพื้นทึบ
          bg-surface เรียบๆ ไม่มี glow เลย — เปลี่ยนพื้นเป็นกระจกโปร่งแสง (backdrop-blur เดียวกับ
          GlassCard.tsx) พักตอนปกติไม่มี glow เลย (กัน 4-5 ปุ่มเรืองแสงพร้อมกันทั้งแถว ขัดกฎ "Less Glow
          More Material") glow สีตามแอคเซนต์เดิมของแต่ละปุ่มโผล่เฉพาะตอน hover เท่านั้น
          v47: ฟีดแบ็ก "ยังดูเป็น Button ธรรมดา ถ้าทำ Hover Glow + Glass Shadow จะดูเหมือน Apple มาก" —
          เพิ่ม inset rim light บางๆ ขอบบน (มองเห็นได้แม้ตอนปกติ ไม่ต้อง hover ก่อน ให้รู้สึกเป็น "กระจก" ตั้งแต่
          แรกเห็น ไม่ใช่กล่องทึบ) + เงาลอยเบาๆ ตอนปกติ (contact shadow) — ตอน hover ยกขึ้นเล็กน้อย (-1px)
          พร้อม glow สีแอคเซนต์ + เงากว้างขึ้น ให้รู้สึกเป็นปุ่มกระจกยกตัวแบบ Apple จริงๆ ไม่ใช่แค่ขอบเรืองแสง —
          border/boxShadow ย้ายจาก inline style มาไว้ใน <style jsx> ทั้งคู่ (rest + hover) เพราะ inline
          style attribute มี specificity สูงกว่า stylesheet เสมอ (ไม่ว่า pseudo-class จะเจาะจงแค่ไหน) —
          ตอนแรก border/boxShadow ยังอยู่ใน inline style เดิมทำให้กฎ :hover ด้านล่างไม่มีทางชนะ เขียนสอง
          property นี้ไปแล้วแต่ hover ไม่เห็นผลจริงเลย (ตรวจพบจาก computed style ไม่ตรงกับที่คาด) */}
      <Link
        href={href}
        className="quick-action relative rounded-lg backdrop-blur-md flex items-center gap-2.5 px-3 py-3 transition active:scale-[0.99]"
        style={{ backgroundImage: 'linear-gradient(180deg, #1B1D20cc, #0D0E10cc)' }}
      >
        <span
          className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 text-base"
          style={{ backgroundColor: `${hex}22` }}
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="text-[11px] font-display tracked uppercase text-ink truncate">{label}</span>
      </Link>
      <style jsx>{`
        .quick-action {
          border: 1px solid rgba(255, 255, 255, 0.06);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 2px 8px rgba(0, 0, 0, 0.25);
        }
        @media (hover: hover) {
          .quick-action:hover {
            border-color: ${hex}66;
            transform: translateY(-1px);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 6px 16px rgba(0, 0, 0, 0.3), 0 0 16px ${hex}4d;
          }
        }
      `}</style>
    </>
  )
}
