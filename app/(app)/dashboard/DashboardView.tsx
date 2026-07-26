'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
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
  relativeDayLabel,
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
import TodayMuscleHeatmap from '@/components/TodayMuscleHeatmap'
import OnboardingBanner from '@/components/OnboardingBanner'
import ErrorState from '@/components/ErrorState'
import Skeleton from '@/components/Skeleton'
import BodyMetricsRow from '@/components/BodyMetricsRow'
import MuscleShareCard from '@/components/MuscleShareCard'
import ConsistencyStrip from '@/components/ConsistencyStrip'

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
const WEEKDAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

function greeting() {
  const h = new Date().getHours()
  if (h < 11) return 'สวัสดีตอนเช้า'
  if (h < 17) return 'สวัสดีตอนบ่าย'
  return 'สวัสดีตอนเย็น'
}

// Fallback เมื่อผู้ใช้ยังไม่ได้ตั้ง display_name เอง — ตัดจาก email เหมือนพฤติกรรมเดิม
function emailDisplayName(email: string | undefined | null) {
  if (!email) return 'นักยก'
  const prefix = email.split('@')[0]
  return prefix.charAt(0).toUpperCase() + prefix.slice(1)
}

interface DashboardData {
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
}

async function fetchDashboardData(supabase: ReturnType<typeof createClient>): Promise<DashboardData> {
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
  }
}

// ไอคอนรูปจริงชุดเดียวกับหน้าสุขภาพ (health/page.tsx) — ใช้แทน emoji เดิม (📉/📈/💪) เฉพาะ insight
// ที่เป็นเทรนด์สัดส่วนร่างกาย ให้ภาพลักษณ์ตรงกับหน้าสุขภาพเป๊ะๆ คีย์เป็น "id|kind" เพราะ insight
// กล้ามเนื้อใช้ emoji 💪 ตัวเดียวกันทั้งขึ้นและลง แยกทิศทางไม่ได้ด้วย emoji ต้องแยกด้วย kind แทน
// insight อื่น (volume/imbalance/missed-muscle/workout-frequency) ยังใช้ emoji เดิมต่อไป
const INSIGHT_IMAGE: Record<string, string> = {
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  // ค่าเริ่มต้นคงที่ (ไม่ขึ้นกับเวลา) เพื่อให้ตรงกับ HTML ที่ server render มาเป๊ะๆ —
  // แล้วค่อยคำนวณคำทักทายจริงหลัง mount ฝั่ง client เท่านั้น เพราะ server (UTC) กับ
  // เครื่องผู้ใช้ (เวลาไทย) คำนวณ new Date().getHours() ได้คนละค่า ถ้าคำนวณตรงๆ ตอน
  // render จะทำให้ข้อความไม่ตรงกันระหว่าง server กับ client (hydration mismatch)
  const [greetingText, setGreetingText] = useState('สวัสดี')
  // เริ่มด้วย true (ซ่อนไว้ก่อน) กันไม่ให้ banner กระพริบโผล่มาแวบเดียวระหว่างรอเช็ค localStorage
  // ตอน mount — ค่อยเปิดออกถ้าเช็คแล้วว่ายังไม่เคยปิด
  const [bannerDismissed, setBannerDismissed] = useState(true)

  useEffect(() => {
    setPrefs(loadDashboardPrefs())
    setGreetingText(greeting())
    setBannerDismissed(isOnboardingBannerDismissed())
  }, [])

  function handleDismissBanner() {
    dismissOnboardingBanner()
    setBannerDismissed(true)
  }

  const {
    data,
    isLoading,
    isError,
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
      <div className="lg:col-span-12 lg:order-1 flex items-start justify-between gap-3 px-1 animate-rise" style={{ animationDelay: '0ms' }}>
        <div>
          <p className="text-xs text-muted">👋 {greetingText}</p>
          <p className="font-display text-lg tracked uppercase text-ink mt-0.5">
            {data.profileDisplayName || emailDisplayName(data.email)}
          </p>
          {greetingContext.headline && (
            <p className="font-display text-sm tracked uppercase text-amber mt-1.5">{greetingContext.headline}</p>
          )}
          {greetingContext.detail && <p className="text-[11px] text-muted mt-1">{greetingContext.detail}</p>}
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="ปรับแต่ง Dashboard"
          className="shrink-0 text-muted hover:text-amber transition p-1 -mr-1 -mt-1"
        >
          ⚙️
        </button>
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
        <BodyMetricsRow />
      </div>

      {/* quick-glance strip: answers "PR ล่าสุด" and "กล้ามเนื้อที่ฝึกมากที่สุดสัปดาห์นี้" —
          the two questions nothing else on this screen answers directly. "วันนี้เล่นไหม" and
          "เป้าหมายใกล้ถึงหรือยัง" are already the hero card / goal ring below, and "สัปดาห์นี้กี่ครั้ง"
          is in the Weekly Goal card — this strip fills the remaining gaps without duplicating them. */}
      {(data.latestPR || data.topMuscleThisWeek) && (
        <div
          className="lg:col-span-12 lg:order-4 grid grid-cols-2 gap-2 px-1 animate-rise"
          style={{ animationDelay: '30ms' }}
        >
          <div className="rounded-lg bg-surface2/40 border border-line/60 px-3 py-2.5">
            <p className="text-[9px] tracked uppercase text-muted">🏆 PR ล่าสุด</p>
            {data.latestPR ? (
              <>
                <p className="text-sm text-ink truncate mt-0.5">{data.latestPR.exerciseName}</p>
                <p className="text-[11px] text-violet mt-0.5">
                  <span className="font-mono font-semibold">{data.latestPR.weightKg}kg</span>{' '}
                  <span className="text-muted">· {relativeDayLabel(data.latestPR.performedAt)}</span>
                </p>
              </>
            ) : (
              <p className="text-[11px] text-muted mt-1.5">ยังไม่มี PR — ลุยเลย</p>
            )}
          </div>
          <div className="rounded-lg bg-surface2/40 border border-line/60 px-3 py-2.5">
            <p className="text-[9px] tracked uppercase text-muted">💪 ฝึกมากสุดสัปดาห์นี้</p>
            {data.topMuscleThisWeek ? (
              <>
                <p className="text-sm text-ink truncate mt-0.5">{data.topMuscleThisWeek.muscleGroup}</p>
                <p className="text-[11px] text-muted mt-0.5">
                  <span className="font-mono text-ink">{data.topMuscleThisWeek.sets}</span> Sets
                </p>
              </>
            ) : (
              <p className="text-[11px] text-muted mt-1.5">ยังไม่ได้บันทึกสัปดาห์นี้</p>
            )}
          </div>
        </div>
      )}

      {/* left column (lg+): today's workout, quick start, muscle heatmap.
          lg:contents removes this div's own box so its children become direct items of
          the 12-col grid above — each child then places itself via lg:col-span/lg:order. */}
      <div className="space-y-6 lg:space-y-0 lg:contents">
      {/* card 1: hero — today's workout. Sets the visual tone: everything else below is
          intentionally quieter (no shadow-hero, smaller type) so the eye has exactly one
          obvious place to land first. */}
      <div
        className={`relative rounded-lg border border-amber/25 shadow-hero overflow-hidden lg:col-span-5 lg:order-5 ${
          totals.entryCount === 0 ? 'animate-hero-enter' : 'animate-rise'
        }`}
        style={totals.entryCount === 0 ? undefined : { animationDelay: '60ms' }}
      >
        {/* decorative background — dark vignette + real photo on the right, faded into the
            card's own bg on the left so text stays readable. Photo lives at
            /public/images/workout-hero.jpg. (Previously an abstract <HeroTorsoArt /> SVG
            silhouette rendered on top of this as a fallback for when no photo existed yet —
            now that a real photo is in place, that overlay has been removed since it was
            painting a gray shape over the photo with no way to condition it off.) */}
        <div className="absolute inset-0 bg-surface">
          <div
            className="absolute inset-y-0 right-0 w-full sm:w-2/3 opacity-90"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(28,31,36,1) 0%, rgba(28,31,36,0.55) 35%, rgba(28,31,36,0.15) 70%), url('/images/workout-hero.jpg')",
              backgroundSize: 'cover',
              // Anchored to the right — the subject in workout-hero.jpg sits near the photo's
              // right edge, with empty dark space on the left. 'center' cropped symmetrically
              // and cut the subject down to a sliver of an arm; anchoring right instead crops
              // away the empty left side and keeps the torso fully in frame.
              backgroundPosition: 'right center',
            }}
          />
        </div>

        <div className="relative z-10 px-5 py-6">
          <p className="text-[10px] tracked uppercase text-muted flex items-center gap-1.5">
            <span aria-hidden="true">🔥</span> Today&apos;s Workout
          </p>

          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
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
              </div>

              {scheduledDay ? (
                <a
                  href="/session"
                  className="inline-flex items-center gap-1.5 mt-4 text-sm font-display tracked uppercase text-bg bg-amber rounded-full px-5 py-2.5 active:scale-[0.99] transition"
                >
                  {totals.entryCount > 0 ? 'ไปต่อ' : 'เริ่มเทรนเลย'} <span aria-hidden="true">▶</span>
                </a>
              ) : (
                <a
                  href="/log"
                  className="inline-flex items-center gap-1.5 mt-4 text-sm font-display tracked uppercase text-bg bg-amber rounded-full px-5 py-2.5 active:scale-[0.99] transition"
                >
                  เริ่มเทรนเลย <span aria-hidden="true">▶</span>
                </a>
              )}

              {!scheduledDay && (
                <p className="text-[11px] text-muted mt-2">
                  ยังไม่มีโปรแกรมวันนี้ —{' '}
                  <a href="/program" className="text-amber hover:underline">
                    ตั้งโปรแกรม
                  </a>{' '}
                  หรือ{' '}
                  <a href="/templates" className="text-amber hover:underline">
                    เริ่มจากเทมเพลต
                  </a>
                </p>
              )}
            </div>

            <GoalRing
              pct={progressPct ?? (totals.entryCount > 0 ? 100 : 0)}
              size={100}
              strokeWidth={8}
              label="ความพร้อม"
              ariaLabel="ความพร้อมของวันนี้"
            />
          </div>
        </div>
      </div>

      {/* quick start actions — วางไว้ใต้ Today's Workout เสมอ กันผู้ใช้ใหม่ที่ยังไม่มีโปรแกรม/ประวัติ
          ไม่รู้จะกดอะไรต่อ ต่างจาก quick actions ชุดล่างที่เป็นทางลัดทั่วไป (บันทึก/เทมเพลต/สถิติ) —
          ชุดนี้เน้น 3 ทางเริ่มต้นที่ใช้บ่อยที่สุดตอนเปิดแอปครั้งแรก */}
      <div
        className={`grid gap-2 animate-rise lg:hidden ${data.hasAnyHistory ? 'grid-cols-3' : 'grid-cols-2'}`}
        style={{ animationDelay: '120ms' }}
      >
        <QuickAction href="/log" label="บันทึกอิสระ" icon="➕" accent="moss" />
        <QuickAction href="/templates" label="เลือกโปรแกรม" icon="📋" accent="steel" />
        {data.hasAnyHistory && <QuickAction href="/coach" label="ถาม AI" icon="🤖" accent="violet" />}
      </div>

      {/* muscles trained today — heat-map chips built from today's workout rows */}
      <div className="animate-rise lg:col-span-9 lg:order-12" style={{ animationDelay: '180ms' }}>
        <TodayMuscleHeatmap todayWorkouts={data.todayWorkouts} />
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
        <div className="rounded-lg bg-surface2/40 border border-line/60 overflow-hidden animate-rise lg:col-span-4 lg:order-6" style={{ animationDelay: '240ms' }}>
          <a href="/recovery" className="block px-4 py-4 active:bg-surface2 transition">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] tracked uppercase text-muted">Recovery</p>
            </div>

            {(() => {
              const recoveryPctMap: Record<string, number> = {}
              RECOVERY_MUSCLES.forEach((mg) => {
                recoveryPctMap[mg] = computeRecoveryPct(data.recoveryDates[mg] ?? null, mg)
              })
              // ใช้ตัวที่คำนวณไว้แล้วฝั่งบน (ยึดตามตารางโปรแกรมประจำสัปดาห์ก่อน ถ้ามี) แทนที่จะคำนวณใหม่
              // จาก recovery % ล้วนๆ ตรงนี้ กันไม่ให้การ์ดนี้แนะนำสวนทางกับ hero message ด้านบน
              const recommendation = data.muscleRecommendation
              return (
                <>
                  {recommendation &&
                    (() => {
                      const recColor = recoveryStatusColor(recommendation.pct)
                      // 90 mirrors FULLY_RECOVERED_PCT in lib/dashboardStats.ts (not exported,
                      // so re-checked here purely for the badge — doesn't change any computed pct)
                      const isFullyReady = recommendation.pct >= 90
                      return (
                        <div
                          className="flex items-center justify-between gap-2 rounded-md px-2.5 py-2 mb-3"
                          style={{ backgroundColor: recColor + '1A' }}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="text-sm shrink-0">💪</span>
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
                  <div className="grid grid-cols-2 gap-2">
                    {RECOVERY_MUSCLES.map((mg) => {
                      const pct = recoveryPctMap[mg]
                      const color = recoveryStatusColor(pct)
                      return (
                        <div
                          key={mg}
                          className="flex items-center justify-between gap-2 rounded-md bg-surface2 px-2.5 py-2"
                        >
                          <span className="flex items-center gap-1.5 text-xs text-ink">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            {mg}
                          </span>
                          <span className="font-mono text-xs shrink-0" style={{ color }}>
                            {pct}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-3 text-right text-xs text-amber">View Detail →</p>
                </>
              )
            })()}
          </a>
        </div>
      )}

      {/* card 4: weekly goal — secondary weight, matches recovery/AI-coach treatment.
          uses the same ring as the hero card's daily progress so "goal completion" reads
          consistently as a ring throughout the dashboard, instead of a ring in one place
          and a flat percent-bar in another. */}
      <div className="rounded-lg bg-surface2/40 border border-line/60 overflow-hidden animate-rise lg:col-span-3 lg:order-7" style={{ animationDelay: '300ms' }}>
        <div className="px-4 py-4">
          <p className="text-[10px] tracked uppercase text-muted mb-3">Weekly Goal</p>

          <div className="flex items-center gap-4">
            <GoalRing pct={data.weeklyGoalPct} size={72} strokeWidth={7} label="Goal" ariaLabel="Weekly Goal" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2.5">
                <span className="text-xl leading-none shrink-0">🔥</span>
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
              <div key={tick.iso} className="flex flex-col items-center gap-1">
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
                <span className={`text-[9px] ${tick.isFuture ? 'text-muted/50' : 'text-muted'}`}>
                  {WEEKDAY_LABELS[i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* card 5 (optional): AI coach — sits under Weekly Goal in the rightmost column and
          spans down alongside the quick-actions/heatmap rows (lg:row-span-3), showing the
          same insights as before but as a proper card instead of a one-line summary. */}
      {prefs.showAICoach && (
        <div
          className="rounded-lg bg-surface2/40 border border-line/60 overflow-hidden animate-rise lg:col-start-10 lg:col-span-3 lg:row-span-3 lg:order-8"
          style={{ animationDelay: '360ms' }}
        >
          <div className="px-4 py-4 flex items-center justify-between">
            <p className="text-[10px] tracked uppercase text-muted">✨ AI Coach</p>
            {combinedInsights.length > 0 && (
              <span className="text-[10px] tracked uppercase text-amber bg-amber/10 rounded-full px-2 py-0.5">
                อัปเดต
              </span>
            )}
          </div>
          {combinedInsights.length > 0 ? (
            <div className="px-4 pb-4 space-y-2">
              {combinedInsights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} imageSrc={INSIGHT_IMAGE[`${insight.id}|${insight.kind}`]} />
              ))}
            </div>
          ) : (
            <div className="px-4 pb-4 space-y-2">
              {/* ยังไม่มี insight คำนวณได้ (เช่น ข้อมูลยังน้อยเกินไป) — โชว์เป็นการ์ดสไตล์เดียวกับ
                  InsightCard แทนที่จะเป็นข้อความลอยบรรทัดเดียว กันไม่ให้การ์ดดูโล่งว่างเปล่า */}
              <div className="rounded-lg bg-surface border border-line shadow-elevated border-l-[3px] border-l-amber px-4 py-3 flex items-start gap-3">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-base leading-none"
                  style={{ backgroundColor: '#E8A33D22' }}
                  aria-hidden="true"
                >
                  🤖
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] tracked uppercase text-muted">Insight</p>
                  <p className="font-display text-sm tracked uppercase mt-0.5 text-amber">แนะนำวันนี้</p>
                  <p className="text-xs text-muted mt-0.5 whitespace-pre-line">{data.aiDailySummary}</p>
                </div>
              </div>
              <div className="rounded-lg bg-surface2/60 border border-line/60 px-4 py-3">
                <p className="text-xs text-ink">
                  สัปดาห์นี้ฝึกไปแล้ว{' '}
                  <span className="font-mono text-amber">{data.thisWeekWorkoutDays}</span>
                  <span className="text-muted">/{data.weeklyWorkoutGoal} ครั้ง</span> — เฉลี่ยเป้าหมายรวม{' '}
                  <span className="font-mono text-amber">{data.weeklyGoalPct}%</span>
                </p>
              </div>
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
        className={`hidden lg:grid lg:col-span-9 lg:order-9 gap-3 ${data.hasAnyHistory ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}
      >
        <QuickAction href="/log" label="บันทึกอิสระ" icon="➕" accent="moss" />
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
        <div className="lg:col-span-6 lg:order-10">
          <WeeklyMuscleHeatmap />
        </div>
        <div className="lg:col-span-3 lg:order-11">
          <WeeklyVolume />
        </div>
      </div>

      <div className="lg:col-span-12 lg:order-13">
        <MuscleShareCard />
      </div>

      <div className="lg:col-span-8 lg:order-15">
        <ConsistencyStrip />
      </div>

      {/* stat mini-cards — lg only, sit next to Consistency to fill the 8/1/1/1/1 row.
          Reuses data already shown higher up (streak, weekly days, PR, top muscle) so
          nothing new needs fetching; below lg those live in their existing spots only. */}
      <div className="hidden lg:block lg:col-span-1 lg:order-16 rounded-lg bg-surface2/40 border border-line/60 px-3 py-3 text-center">
        <p className="font-mono text-lg text-amber">{data.streak}</p>
        <p className="text-[10px] text-muted mt-0.5">Day Streak</p>
      </div>
      <div className="hidden lg:block lg:col-span-1 lg:order-17 rounded-lg bg-surface2/40 border border-line/60 px-3 py-3 text-center">
        <p className="font-mono text-lg text-amber">{data.thisWeekWorkoutDays}</p>
        <p className="text-[10px] text-muted mt-0.5">ครั้งสัปดาห์นี้</p>
      </div>
      <div className="hidden lg:block lg:col-span-1 lg:order-18 rounded-lg bg-surface2/40 border border-line/60 px-3 py-3 text-center">
        <p className="font-mono text-lg text-amber truncate">{data.latestPR ? `${data.latestPR.weightKg}kg` : '—'}</p>
        <p className="text-[10px] text-muted mt-0.5">PR ล่าสุด</p>
      </div>
      <div className="hidden lg:block lg:col-span-1 lg:order-19 rounded-lg bg-surface2/40 border border-line/60 px-3 py-3 text-center">
        <p className="font-mono text-lg text-amber">{data.topMuscleThisWeek?.sets ?? '—'}</p>
        <p className="text-[10px] text-muted mt-0.5">เซ็ตสูงสุด</p>
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
        <QuickAction href="/log" label="บันทึก" icon="✚" accent="moss" />
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
    <a
      href={href}
      className="rounded-lg border border-line bg-surface flex items-center gap-2.5 px-3 py-3 transition active:scale-[0.99] hover:border-line/40"
    >
      <span
        className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 text-base"
        style={{ backgroundColor: `${hex}22` }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="text-[11px] font-display tracked uppercase text-ink truncate">{label}</span>
    </a>
  )
}
