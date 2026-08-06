'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useDashboardSettings } from '@/components/DashboardSettingsProvider'
import type { ProgramDay, ProgramExercise, Workout, BodyMetric } from '@/lib/types'
import { todayDayOfWeek, todayStr, daysAgoStr } from '@/lib/weekdays'
import {
  computeCurrentStreak,
  computeTodayTotals,
  computeRecoveryPct,
  recoveryStatusColor,
  findNextProgramDay,
  getWeekRange,
  getPreviousWeekRange,
  computeVolumeTrendInsights,
  computeImbalanceInsights,
  computeMissedMuscleInsights,
  suggestMuscleToTrain,
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
  type VolumeIncrease,
  type LatestPR,
  type TopMuscle,
} from '@/lib/dashboardStats'
import { fetchWeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
import { saveDisplayName } from '@/lib/profile'
import { computePushPullBalance, computeAIDailySummary, bodyFatTrendInsight, muscleMassTrendInsight, workoutFrequencyInsight } from '@/lib/aiCoach'
import { computeBodyMetricsSummary, type BodyMetricsSummary } from '@/lib/bodyMetricsSummary'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { VOLUME_MUSCLES, RECOVERY_MUSCLES, MUSCLE_GROUPS } from '@/lib/muscle-groups'
import { DEFAULT_DASHBOARD_PREFS, loadDashboardPrefs, saveDashboardPrefs, type DashboardPrefs } from '@/lib/dashboardPrefs'
import { isOnboardingBannerDismissed, dismissOnboardingBanner } from '@/lib/onboarding'
import GoalRing from '@/components/GoalRing'
import DashboardSkeleton from '@/components/DashboardSkeleton'
import InsightCard from '@/components/InsightCard'
import TodayMuscleChips from '@/components/TodayMuscleChips'
import OnboardingBanner from '@/components/OnboardingBanner'
import ErrorState from '@/components/ErrorState'
import Skeleton from '@/components/Skeleton'
import BodyMetricsRow from '@/components/BodyMetricsRow'
import ConsistencyStrip from '@/components/ConsistencyStrip'
import NotificationButton from '@/components/dashboard/NotificationButton'
import AICoachCompactCard from '@/components/AICoachCompactCard'
import { CARD_GRADIENT_CSS } from '@/lib/theme'
import { computeFitnessScore } from '@/lib/fitnessScore'

// Below-the-fold widgets are code-split out of the initial dashboard bundle.
// Each fetches its own data independently, so there's no reason to block
// first paint of the hero card on their JS or their network round-trip.
const WeeklyMuscleHeatmap = dynamic(() => import('@/components/WeeklyMuscleHeatmap'), {
  loading: () => <Skeleton className="h-80 w-full rounded-lg" />,
})
const WeeklyVolume = dynamic(() => import('@/components/WeeklyVolume'), {
  loading: () => <Skeleton className="h-56 w-full rounded-lg" />,
})
const WeeklyCardioVolume = dynamic(() => import('@/components/WeeklyCardioVolume'), {
  loading: () => <Skeleton className="h-56 w-full rounded-lg" />,
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
  programDays: ProgramDay[]
  todayExercises: ProgramExercise[]
  completedCount: number
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
  bestVolumeIncrease: VolumeIncrease | null
  // ใช้กับการ์ด Weekly Goal แบบ motivation — จำนวนครั้งที่ฝึกแล้วสัปดาห์นี้ เทียบกับเป้าหมาย
  // (เป้าหมายนับจากจำนวนวันที่ตั้งโปรแกรมไว้เอง ถ้ายังไม่ตั้งเลยใช้ 3 เป็นค่าเริ่มต้น)
  thisWeekWorkoutDays: number
  weeklyWorkoutGoal: number
  // แถวติ๊กถูกรายวัน (จ-อา) ของสัปดาห์นี้ — ใช้โชว์ในการ์ด Weekly Goal
  weekDayTicks: { iso: string; trained: boolean; isFuture: boolean }[]
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

  const distinctDates = Array.from(new Set(((allDates as { performed_at: string }[]) ?? []).map((r) => r.performed_at)))
  const streak = computeCurrentStreak(distinctDates)

  const typedDays = (dayRows as ProgramDay[]) ?? []

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
  // ไม่ slice ที่นี่แล้ว — คอมโพเนนต์เป็นคนรวมกับ body-composition/workout-frequency insight
  // (ที่ต้อง useWeightUnit() ซึ่งเป็น hook เรียกในนี้ไม่ได้) แล้วค่อย slice ทีเดียวตอน render
  const insights = [...imbalanceInsights, ...volumeInsights, ...missedInsights]

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
  const weekDayTicks: { iso: string; trained: boolean; isFuture: boolean }[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const iso = toIsoLocal(d)
    return { iso, trained: trainedDateSet.has(iso), isFuture: iso > today }
  })

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

  // % ความคืบหน้าของแผนวันนี้ ใช้ทั้งโชว์ตัวเลขในข้อความแนะนำ และตัดสินว่า "ฝึกวันนี้ไปแล้ว" หรือยัง
  // ถ้าวันนี้ไม่มีแผนกำหนดไว้ (บันทึกอิสระ) ให้ถือว่า 100% ถ้ามี log อย่างน้อย 1 รายการ ไม่งั้นเป็น null (ยังไม่ได้ฝึกอะไรเลย)
  const progressPctForLabel =
    todayExercises.length > 0
      ? Math.round((completedCount / todayExercises.length) * 100)
      : todayList.length > 0
        ? 100
        : null

  // กล้ามเนื้อที่ควรแนะนำ: ยึดตามตารางโปรแกรมประจำสัปดาห์ก่อน (ถ้ามี) แทนที่จะดู recovery % สูงสุดล้วนๆ
  // เพื่อไม่ให้แนะนำสวนทางกับตาราง เช่น ตารางบอกวันนี้เป็นวันขา แต่ recovery ของอกดันสูงกว่า
  // ถ้าวันนี้ทำครบตามแผนแล้ว หรือวันนี้เป็นวันพัก/ไม่ได้ผูกกล้ามเนื้อไว้ ให้มองไปที่วันถัดไปในตาราง
  const todayScheduledMuscle = getScheduledMuscleForDay(typedDays, dow, MUSCLE_GROUPS)
  const scheduledMuscle =
    todayScheduledMuscle && (progressPctForLabel === null || progressPctForLabel < 100)
      ? todayScheduledMuscle
      : getNextScheduledMuscle(typedDays, dow, MUSCLE_GROUPS)
  const muscleRecommendation = suggestMuscleToTrain(recoveryPctForSummary, scheduledMuscle)

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
    programDays: typedDays,
    todayExercises,
    completedCount,
    completedExerciseIds,
    recoveryDates,
    insights,
    aiDailySummary,
    bodyMetricsSummary,
    weeklyGoalPct,
    muscleRecommendation,
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
      { key: 'workout', value: Math.round((data.last7DaysTrainedCount / 7) * 100), weight: 30 },
      { key: 'streak', value: Math.min(100, Math.round((data.streak / 14) * 100)), weight: 20 },
      { key: 'sleep', value: null, weight: 20 },
      { key: 'recovery', value: fitnessScoreRecoveryPct, weight: 15 },
      { key: 'weeklyGoal', value: data.weeklyGoalPct, weight: 10 },
      { key: 'activityToday', value: progressPct ?? (totals.entryCount > 0 ? 100 : 0), weight: 5 },
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
          {/* เส้น gradient สั้นๆ ใต้ชื่อ (60-80px) คั่นระหว่าง hero name กับบรรทัด insight ด้านล่าง */}
          <div
            aria-hidden="true"
            style={{
              width: 70,
              height: 3,
              marginTop: 8,
              marginBottom: 10,
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
                    <span className="font-mono font-semibold" style={{ color: '#8CB264' }}>
                      ↓{Math.abs(bf.delta).toFixed(1)}%
                    </span>
                    <span className="ml-2" style={{ color: '#8CB264' }}>
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
                    <span className="font-mono font-semibold" style={{ color: '#8CB264' }}>
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
                  backgroundImage: `${CARD_GRADIENT_CSS}, linear-gradient(135deg, #22D3EE14, #22D3EE40, #22D3EE14)`,
                  backgroundOrigin: 'border-box',
                  backgroundClip: 'padding-box, border-box',
                  boxShadow: '0 4px 14px rgba(0,0,0,.35), 0 0 8px #22D3EE1F',
                }}
              >
                <span aria-hidden="true">💤</span>
                <div className="leading-tight">
                  <p className="text-[9px] tracked uppercase text-muted">Recovery</p>
                  <p className="text-xs font-display tracked uppercase" style={{ color: '#22D3EE' }}>
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
              backgroundImage: `${CARD_GRADIENT_CSS}, linear-gradient(135deg, #E8A33D14, #E8A33D40, #E8A33D14)`,
              backgroundOrigin: 'border-box',
              backgroundClip: 'padding-box, border-box',
              boxShadow: '0 4px 14px rgba(0,0,0,.35), 0 0 8px #E8A33D1F',
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
        className={`relative rounded-lg border border-amber/30 shadow-hero overflow-hidden lg:col-start-1 lg:col-span-5 lg:row-start-1 ${
          totals.entryCount === 0 ? 'animate-hero-enter' : 'animate-rise'
        }`}
        style={{
          // v41: "Version 3 (Minimal Dark Titanium)" — glow เดิม 14px/40 alpha เข้มไป ลดลงให้ Hero
          // ยังเด่นอยู่ (การ์ดเดียวที่ควรมี glow ตามกฎ "Hero มีแค่ใบเดียว") แต่ไม่จัดจ้านเท่าเดิม
          boxShadow: '0 0 8px #E8A33D26, 0 0 1px #E8A33D66',
          ...(totals.entryCount === 0 ? undefined : { animationDelay: '60ms' }),
        }}
        onMouseMove={handleHeroMouseMove}
        onMouseLeave={handleHeroMouseLeave}
      >
        {/* v45: ฟีดแบ็ก "ภาพคนดูธรรมดา ใช้ Dumbbell/Orange Spark จะเข้ากับ Theme มากกว่า" — เดิมเป็นรูปถ่าย
            จริง (/images/workout-hero.jpg) คนละภาษากับวัสดุไทเทเนียม/แสงพลังงานส้มที่การ์ดอื่นทั้งแอปใช้
            (Energy Core ของปุ่ม Start Workout, glow อำพันทั่วไป) — เปลี่ยนเป็น CSS/SVG ล้วน (ไม่ต้องมี asset
            รูปใหม่): แสงพลังงานส้มระเบิดจากมุมขวา (Orange Spark, โทนเดียวกับ FIRE_GRADIENT/Energy Core) +
            เงาดัมเบลขนาดใหญ่จางๆ ทับอยู่ ให้ความรู้สึก "อุปกรณ์ฝึก" แทนภาพคนจริง ยังคง fade ซ้ายให้ตัวหนังสือ
            อ่านง่ายเหมือนเดิมทุกประการ
            v47: ฟีดแบ็ก "Dumbbell Blur เยอะไป (~70%) จนแทบไม่รู้ว่าเป็นอะไร ผมว่าประมาณ 40% ก็พอ" — เพิ่ม
            opacity 0.16 -> 0.4 + ขยายพื้นที่ 58%/240px -> 78%/320px ตามที่เลือก "Option A: ใช้ Dumbbell
            เต็มพื้นที่ Ring ซ้อนอยู่มุมขวาล่าง แบบ Apple Fitness" — Ring ย้ายออกจาก flex row เดิม (เคยอยู่ข้าง
            ตัวหนังสือ) ไปวางลอย absolute มุมขวาล่างแทน (ดูด้านล่าง) ให้ Dumbbell เป็นพื้นหลังเต็มพื้นที่จริงๆ
            ไม่ใช่แค่ไอคอนเล็กๆ ลอยเดี่ยว */}
        <div className="absolute inset-0 bg-surface overflow-hidden">
          <div
            className="absolute inset-y-0 right-0 w-full sm:w-2/3"
            style={{
              backgroundImage: [
                'radial-gradient(ellipse 65% 55% at 88% 28%, rgba(255,154,22,.22), transparent 62%)',
                'radial-gradient(ellipse 55% 50% at 96% 78%, rgba(255,180,70,.14), transparent 65%)',
                'linear-gradient(90deg, rgba(28,31,36,1) 0%, rgba(28,31,36,0.55) 35%, rgba(28,31,36,0.15) 70%)',
              ].join(', '),
            }}
          />
          <svg
            className="absolute pointer-events-none"
            style={{ right: '2%', top: '50%', width: '78%', maxWidth: 320, transform: 'translateY(-50%) rotate(-16deg)', opacity: 0.4 }}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2 12h2M20 12h2M5 9v6M19 9v6M8 7v10M16 7v10M8 12h8"
              stroke="#FFB84A"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* v46: "Titanium Reflection" — จุดสว่างจางๆ ตามตำแหน่งเมาส์ (เขียน background ตรงผ่าน ref ใน
            handleHeroMouseMove ด้านบน ไม่ผ่าน React state) วางไว้เหนือชั้นวัสดุพื้นแต่ใต้เนื้อหา (z-10) */}
        <div ref={heroSpotlightRef} className="absolute inset-0 pointer-events-none" aria-hidden="true" />

        {/* v47: "Option A" — Ring ลอย absolute มุมขวาล่าง ซ้อนทับบน Dumbbell background แบบ Apple Fitness
            hero (เดิมอยู่เป็น flex sibling ข้างตัวหนังสือ ดันเลย์เอาต์ให้ Dumbbell เหลือพื้นที่แคบ) —
            glow เดิม (AMBER) คงไว้ผ่าน filter drop-shadow เดียวกับวงอื่นๆ ในหน้า ให้เข้าธีม */}
        <div className="absolute bottom-4 right-4 z-10" style={{ filter: 'drop-shadow(0 0 6px #E8A33D40)' }}>
          <GoalRing
            pct={progressPct ?? (totals.entryCount > 0 ? 100 : 0)}
            size={100}
            strokeWidth={8}
            color="#E8A33D"
            label="ความพร้อม"
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
                จำกัด max-width แทน กันตัวหนังสือยาวเกินไปชนโซน Ring/Dumbbell มุมขวาล่าง */}
            <div className="min-w-0 max-w-[230px] relative">
              <div
                className="absolute -inset-3 rounded-xl backdrop-blur-sm pointer-events-none"
                style={{
                  backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,.035), rgba(255,255,255,.008))',
                  border: '1px solid rgba(255,255,255,.05)',
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

              <div className="flex items-center gap-4 mt-3 flex-wrap">
                <div>
                  <p className="font-mono text-lg text-ink leading-none">{data.todayExercises.length || totals.entryCount}</p>
                  <p className="text-[10px] text-muted mt-0.5">Exercises</p>
                </div>
                <div>
                  <p className="font-mono text-lg text-ink leading-none">{plannedTotalSets}</p>
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

              {scheduledDay ? (
                <Link
                  href="/session"
                  className="inline-flex items-center gap-1.5 mt-4 text-sm font-display tracked uppercase text-bg bg-amber rounded-full px-5 py-2.5 active:scale-[0.99] transition"
                >
                  {totals.entryCount > 0 ? 'ไปต่อ' : 'เริ่มเทรนเลย'} <span aria-hidden="true">▶</span>
                </Link>
              ) : (
                <Link
                  href="/log"
                  className="inline-flex items-center gap-1.5 mt-4 text-sm font-display tracked uppercase text-bg bg-amber rounded-full px-5 py-2.5 active:scale-[0.99] transition"
                >
                  เริ่มเทรนเลย <span aria-hidden="true">▶</span>
                </Link>
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
          className="rounded-lg bg-surface2/40 border border-line overflow-hidden animate-rise lg:col-start-6 lg:col-span-4 lg:row-start-1"
          style={{ animationDelay: '240ms' }}
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
              const recommendation = data.muscleRecommendation
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
                      const recColor = '#22D3EE'
                      // 90 mirrors FULLY_RECOVERED_PCT in lib/dashboardStats.ts (not exported,
                      // so re-checked here purely for the badge — doesn't change any computed pct)
                      const isFullyReady = recommendation.pct >= 90
                      return (
                        <div
                          className="flex items-center justify-between gap-2 rounded-md px-2.5 py-2 mb-3"
                          style={{ backgroundColor: recColor + '1A' }}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="text-sm shrink-0" aria-hidden="true">💪</span>
                            <p className="text-xs text-ink whitespace-pre-line">
                              {recoveryRecommendationLabel(recoveryLabelPct)}{' '}
                              <span className="font-display tracked uppercase" style={{ color: recColor }}>
                                {recommendation.muscleGroup}
                              </span>{' '}
                              <span className="text-muted">— ฟื้นตัวแล้ว {recommendation.pct}%</span>
                            </p>
                          </span>
                          {isFullyReady && (
                            <span
                              className="shrink-0 text-[10px] font-display tracked uppercase rounded-full px-2.5 py-1"
                              style={{ backgroundColor: recColor, color: '#14161A' }}
                            >
                              พร้อมลุย
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  {(() => {
                    // ฟื้นตัวรวม — ค่าเฉลี่ยของทุกกลุ่มกล้ามเนื้อ แสดงเป็นวงแหวนคู่กับลิสต์รายกลุ่ม
                    // (ตามมอคอัพ v3: ring "พื้นตัวรวม" ข้างๆ list แทนที่จะโชว์แค่ list เดี่ยวๆ)
                    const overallRecoveryPct = Math.round(
                      RECOVERY_MUSCLES.reduce((sum, mg) => sum + recoveryPctMap[mg], 0) /
                        RECOVERY_MUSCLES.length
                    )
                    return (
                      <div className="flex items-center gap-4">
                        {/* สีฟ้าไซแอน + glow ตามมอคอัพ v3 — เดิมใช้ recoveryStatusColor() ที่เปลี่ยนสีตามเปอร์เซ็นต์
                            (เขียว/เหลือง/แดง) ตอนนี้ fix เป็นฟ้าให้เข้าธีมเดียวกับวงแหวนอื่นๆ ในมอคอัพ
                            v47: ฟีดแบ็ก "การ์ดนี้ข้อมูลเยอะแต่ Ring ยังเล็ก ขยายประมาณ 15% จะบาลานซ์กว่า" —
                            84 -> 97 (+15%), strokeWidth ขยายตามสัดส่วนเดียวกัน (8 -> 9) */}
                        <div style={{ filter: 'drop-shadow(0 0 4px #22D3EE40)' }}>
                          <GoalRing
                            pct={overallRecoveryPct}
                            size={97}
                            strokeWidth={9}
                            color="#22D3EE"
                            label="พื้นตัวรวม"
                            ariaLabel="ฟื้นตัวรวมทุกกลุ่มกล้ามเนื้อ"
                            glow
                          />
                        </div>
                        {/* v47: ฟีดแบ็ก "Recovery ยังเป็น Box เยอะ ถ้าทำเป็น Heatmap หรือ Muscle Grid จะดู
                            ฉลาดกว่า" — เปลี่ยนจาก list 2 คอลัมน์ (จุดสี+ชื่อ+%) เป็น grid ไทล์สี่เหลี่ยม 4
                            คอลัมน์แบบ GitHub contribution graph — สีพื้นไทล์เข้มขึ้นตาม % ฟื้นตัว (ยิ่งฟื้นตัว
                            มาก ไทล์ยิ่ง "เต็ม") ใช้สีเดียวกับ recoveryStatusColor() เดิมทุกประการ (แดง/เหลือง/
                            เขียว 3 ระดับ) แค่เปลี่ยนวิธีนำเสนอ ไม่ใช่คิดสเกลสีใหม่ */}
                        <div className="grid grid-cols-4 gap-1.5 flex-1 min-w-0">
                          {RECOVERY_MUSCLES.map((mg) => {
                            const pct = recoveryPctMap[mg]
                            const color = recoveryStatusColor(pct)
                            // อัลฟาพื้นไทล์ไล่ตาม % (21-99 hex ~ 13%-60%) ให้ยิ่งฟื้นตัวมากไทล์ยิ่งทึบ/เข้ม
                            // เหมือน "ชาร์จเต็ม" แทนที่จะเป็นสีเดียวกันหมดแล้วต่างแค่ตัวเลข
                            const alphaHex = Math.round(33 + (pct / 100) * 120)
                              .toString(16)
                              .padStart(2, '0')
                            return (
                              <div
                                key={mg}
                                className="rounded-md px-1 py-2 flex flex-col items-center justify-center gap-0.5 text-center"
                                style={{ backgroundColor: `${color}${alphaHex}`, border: `1px solid ${color}40` }}
                              >
                                {/* leading-tight ให้ตัดขึ้นบรรทัดใหม่แทน truncate — "แกนกลางลำตัว" (ชื่อยาวสุด)
                                    ตัดกลาง ".." แล้วอ่านไม่รู้เรื่องถ้าใช้ truncate บรรทัดเดียวในไทล์แคบขนาดนี้ */}
                                <span className="text-[9px] text-ink leading-tight">{mg}</span>
                                <span className="font-mono text-[10px] leading-none" style={{ color }}>
                                  {pct}%
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                  <p className="mt-3 text-right text-xs text-amber">View Detail →</p>
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
        className="rounded-lg bg-surface2/40 border border-line overflow-hidden animate-rise lg:col-start-10 lg:col-span-3 lg:row-start-1"
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
              style={{ filter: 'drop-shadow(0 0 4px #E8A33D40)', ...({ '--pr-glow': 'rgba(232,163,61,.5)' } as React.CSSProperties) }}
            >
              <GoalRing
                pct={data.weeklyGoalPct}
                size={72}
                strokeWidth={7}
                color="#E8A33D"
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
                      ? { backgroundColor: '#7A9B57', color: '#14161A' }
                      : { backgroundColor: '#2E333A', color: '#9498A0' }
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
            muscleRecommendation={data.muscleRecommendation}
            href="/coach"
            lastUpdatedAt={dataUpdatedAt}
          />
          {combinedInsights.length > 0 && (
            <div className="space-y-2">
              {combinedInsights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} imageSrc={INSIGHT_IMAGE[`${insight.id}|${insight.kind}`]} />
              ))}
            </div>
          )}
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
        <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden lg:col-span-12 lg:order-20">
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

const QUICK_ACTION_ACCENTS = {
  amber: '#E8A33D',
  steel: '#6C8CA8',
  moss: '#7A9B57',
  violet: '#9C7CC4',
  rust: '#C1503A',
} as const

function QuickAction({
  href,
  label,
  icon,
  accent = 'amber',
}: {
  href: string
  label: string
  icon: string
  accent?: keyof typeof QUICK_ACTION_ACCENTS
}) {
  const hex = QUICK_ACTION_ACCENTS[accent]
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
