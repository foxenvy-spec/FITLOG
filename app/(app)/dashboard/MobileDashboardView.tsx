'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useDashboardSettings } from '@/components/DashboardSettingsProvider'
import { todayDayOfWeek, todayStr, daysAgoStr } from '@/lib/weekdays'
import { getActiveMakeupDayId } from '@/lib/activeMakeupSession'
import { computeTodayTotals, computeRecoveryPct, computeDashboardNotifications } from '@/lib/dashboardStats'
import { goalProgressPct } from '@/lib/goalProgress'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { saveDisplayName } from '@/lib/profile'
import { RECOVERY_MUSCLES } from '@/lib/muscle-groups'
import { DEFAULT_DASHBOARD_PREFS, loadDashboardPrefs, saveDashboardPrefs, type DashboardPrefs } from '@/lib/dashboardPrefs'
import { fetchDashboardData, greeting, emailDisplayName, FITLOG_PR_RECENT_DAYS } from './DashboardView'
import { computeFitnessScore } from '@/lib/fitnessScore'
import { dashboardSpec } from '@/lib/dashboardSpec'
import {
  NOISE_BG,
  DASHBOARD_BG_CSS,
  VIGNETTE_CSS,
  DIAGONAL_TITANIUM_CSS,
  DIAGONAL_TITANIUM_FADE_MASK,
  DIAGONAL_TITANIUM_MICRO_REFLECTION_CSS,
  AMBIENT_ORANGE_CSS,
  BLUE_AMBIENT_CSS,
  RADIAL_SHADOW_CSS,
  PAGE_REFLECTION_CSS,
  HAIRLINE_SCRATCH_BG,
} from '@/lib/theme'
import MobileDashboardSkeleton from '@/components/MobileDashboardSkeleton'
import ErrorState from '@/components/ErrorState'
import Header from '@/components/dashboard/Header'
import TriStatRow from '@/components/dashboard/TriStatRow'
import WorkoutStreakCard from '@/components/WorkoutStreakCard'
import TodaysFocusCard from '@/components/TodaysFocusCard'
import TodaysWorkoutCompactCard from '@/components/TodaysWorkoutCompactCard'
import TodaysWorkoutEmptyCard from '@/components/TodaysWorkoutEmptyCard'
import AICoachCompactCard from '@/components/AICoachCompactCard'

const DashboardSettings = dynamic(() => import('@/components/DashboardSettings'), { ssr: false })

/**
 * เขียนใหม่ทั้งหมดตาม mockup "Version 5 — Hero + Card Focus" ("ทำให้เหมือน Version 5 100% ไม่ต้องสน
 * โครงสร้างเดิม แก้ใหม่หมดเลย") — โครงสร้างเดิม (Quick Actions/แผนที่พลาด/Health Stats/Body Goal card/
 * ท่าวอร์มอัป/Onboarding Banner/Body Overview กริด 2x2) ถูกตัดออกทั้งหมด เหลือแค่ 6 ส่วนตาม mockup:
 * Header (headline + วง Fitness Score ใหญ่) → Recovery/Body Fat/Weight (3 การ์ด) → Today's Focus →
 * Today's Workout → Weekly Activity (การ์ดสัปดาห์เดียวกับที่มีอยู่แล้ว WorkoutStreakCard) → AI Coach
 *
 * ยังใช้ fetchDashboardData/DashboardData ชุดเดียวกับเดสก์ท็อป (import จาก DashboardView) — ข้อมูล/
 * business logic (เช่น การตรวจจับเซสชันชดเชย, ตัวเลข completed/total, notifications) เป็นแหล่งเดียว
 * ไม่ได้รื้อสร้างใหม่ มีแค่ "จะ render อะไรบนหน้าจอ" ที่เปลี่ยนไปตาม mockup
 */
export default function MobileDashboardView() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const today = todayStr()

  const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_DASHBOARD_PREFS)
  const { open: settingsOpen, setOpen: setSettingsOpen } = useDashboardSettings()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [greetingText, setGreetingText] = useState('สวัสดี')
  const { toDisplay, unit } = useWeightUnit()

  useEffect(() => {
    setPrefs(loadDashboardPrefs())
    setGreetingText(greeting())
  }, [])

  useEffect(() => {
    if (searchParams.get('settings') === '1') {
      setSettingsOpen(true)
      router.replace('/dashboard')
    }
  }, [searchParams, setSettingsOpen, router])

  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
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

  const dow = todayDayOfWeek()

  const scheduledDay = useMemo(
    () => data?.programDays.find((d) => d.day_of_week === dow) ?? null,
    [data?.programDays, dow]
  )
  // กรอง workout ที่ระบุ program_day_id ของแผน "อื่น" (เซสชันชดเชย) ออกก่อนนับ ไม่ให้ปนกับสถิติ
  // Exercises/Sets ของแผนจริงวันนี้ (เหตุผลเดียวกับ DashboardView.tsx เดสก์ท็อป)
  const totals = useMemo(() => {
    const relevantWorkouts = (data?.todayWorkouts ?? []).filter(
      (w) => !w.program_day_id || w.program_day_id === scheduledDay?.id
    )
    return computeTodayTotals(relevantWorkouts)
  }, [data?.todayWorkouts, scheduledDay])
  const hasMakeupToday = (data?.todayWorkouts ?? []).some(
    (w) => w.program_day_id && w.program_day_id !== scheduledDay?.id
  )
  // pointer เซสชันชดเชยที่ยังไม่จบ (localStorage, ไม่ใช่ source of truth) — ใช้ตัดสิน "จะพาไปที่ไหน"
  // (sessionHref) เท่านั้น re-read ทุกครั้งที่ query data เปลี่ยน (โหลดหน้าครั้งแรก/refetch)
  const [activeMakeupDay, setActiveMakeupDay] = useState<string | null>(null)
  useEffect(() => {
    setActiveMakeupDay(getActiveMakeupDayId())
  }, [])
  const sessionHref = activeMakeupDay ? `/session?day=${activeMakeupDay}` : '/session'

  // ยืนยันกับ DB ว่าเซสชันชดเชยที่ pointer ชี้อยู่จบครบตามแผนนั้นแล้วจริงหรือยัง (ตรรกะเดียวกับ
  // allFinished ใน session/page.tsx) — pointer เดียวอาจค้างผิดได้ (จบจากอีกอุปกรณ์) ต้องเช็คซ้ำกับข้อมูล
  // จริงก่อนตัดสินว่า "กำลังทำอยู่" สำหรับสลับตัวเลข completed/total ที่ส่งเข้า Today's Workout
  const [makeupSessionFinished, setMakeupSessionFinished] = useState<boolean | null>(null)
  const [makeupTotalExercises, setMakeupTotalExercises] = useState(0)
  useEffect(() => {
    if (!activeMakeupDay) {
      setMakeupSessionFinished(null)
      setMakeupTotalExercises(0)
      return
    }
    let cancelled = false
    setMakeupSessionFinished(null)
    ;(async () => {
      const { data: exRows } = await supabase.from('program_exercises').select('id').eq('program_day_id', activeMakeupDay)
      const exerciseIds = ((exRows as { id: string }[]) ?? []).map((r) => r.id)
      if (cancelled) return
      setMakeupTotalExercises(exerciseIds.length)
      if (exerciseIds.length === 0) {
        setMakeupSessionFinished(true)
        return
      }
      const { data: compRows } = await supabase
        .from('program_completions')
        .select('id')
        .eq('completed_at', today)
        .in('program_exercise_id', exerciseIds)
      if (cancelled) return
      setMakeupSessionFinished((compRows?.length ?? 0) >= exerciseIds.length)
    })()
    return () => {
      cancelled = true
    }
  }, [activeMakeupDay, supabase, today])
  const makeupSessionActive = !!activeMakeupDay && makeupSessionFinished === false
  const makeupExercisesCompleted = (data?.todayWorkouts ?? []).filter((w) => w.program_day_id === activeMakeupDay).length

  const workoutTitle = scheduledDay?.title ?? ((data?.todayWorkouts.length ?? 0) > 0 ? 'บันทึกอิสระ' : null)
  const progressPct =
    data && data.todayExercises.length > 0
      ? Math.min(100, Math.round(((data.completedCount + data.adhocCompletedCount) / data.todayExercises.length) * 100))
      : null

  const recoveryPctMap = useMemo(() => {
    const map: Record<string, number> = {}
    RECOVERY_MUSCLES.forEach((mg) => {
      map[mg] = computeRecoveryPct(data?.recoveryDates[mg] ?? null, mg)
    })
    return map
  }, [data])

  const muscleRecommendation = data?.todaysRecommendation ?? null

  if (isLoading || !data) {
    return <MobileDashboardSkeleton />
  }

  if (isError) {
    return <ErrorState title="โหลด Dashboard ไม่สำเร็จ" message="ไม่สามารถโหลด Dashboard ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่" onRetry={retry} />
  }

  // ปัจจัย Recovery ของ Fitness Score เท่านั้น — เอาเฉพาะกลุ่มกล้ามเนื้อที่มีประวัติฝึกจริงมาเฉลี่ย (เหตุผล
  // เต็มดู DashboardView.tsx เดสก์ท็อป) ค่าเดียวกันนี้ใช้ซ้ำกับการ์ด Recovery ใน TriStatRow ด้านล่างด้วย
  // (ไม่คำนวณ Recovery ภาพรวมแยกอีกชุด — กันบั๊ก "ตัวเลขเดียวกันคนละที่ไม่ตรงกัน" ที่เคยเจอมาก่อน)
  const trainedRecoveryMuscles = RECOVERY_MUSCLES.filter((mg) => data?.recoveryDates[mg])
  const fitnessScoreRecoveryPct =
    trainedRecoveryMuscles.length > 0
      ? Math.round(trainedRecoveryMuscles.reduce((sum, mg) => sum + recoveryPctMap[mg], 0) / trainedRecoveryMuscles.length)
      : null

  const fitnessScore = computeFitnessScore([
    { key: 'workout', label: 'Workout Completion', value: Math.round((data.last7DaysTrainedCount / 7) * 100), weight: 30 },
    { key: 'streak', label: 'Streak', value: Math.min(100, Math.round((data.streak / 14) * 100)), weight: 20 },
    { key: 'sleep', label: 'Sleep', value: null, weight: 20 },
    { key: 'recovery', label: 'Recovery (Avg)', value: fitnessScoreRecoveryPct, weight: 15 },
    { key: 'weeklyGoal', label: 'Weekly Goal', value: data.weeklyGoalPct, weight: 10 },
    { key: 'activityToday', label: 'Activity Today', value: progressPct ?? (totals.entryCount > 0 ? 100 : 0), weight: 5 },
  ])

  const hasTodayPlan = data.todayExercises.length > 0
  const hasLoggedToday = data.todayWorkouts.length > 0
  const hasAnyProgram = data.programDays.length > 0
  const workoutCardVariant: 'active' | 'restDay' | 'noProgram' =
    hasTodayPlan || hasLoggedToday ? 'active' : hasAnyProgram ? 'restDay' : 'noProgram'

  const todayCompleted = (progressPct !== null && progressPct >= 100) || (progressPct === null && data.todayWorkouts.length > 0)
  const weightGoalReached =
    data.weightGoalTarget != null && data.bodyMetricsSummary.weight.value != null
      ? (goalProgressPct({ target_value: data.weightGoalTarget, starting_value: data.weightGoalStart }, data.bodyMetricsSummary.weight.value, data.earliestTrackedWeight) ?? 0) >= 100
      : false
  const bodyFatGoalReached =
    data.bodyFatGoalTarget != null && data.bodyMetricsSummary.bodyFatPct.value != null
      ? (goalProgressPct({ target_value: data.bodyFatGoalTarget, starting_value: data.bodyFatGoalStart }, data.bodyMetricsSummary.bodyFatPct.value, data.earliestTrackedBodyFat) ?? 0) >= 100
      : false
  const weightRemaining =
    data.weightGoalTarget != null && data.bodyMetricsSummary.weight.value != null && !weightGoalReached
      ? { value: Math.abs(toDisplay(data.bodyMetricsSummary.weight.value) - toDisplay(data.weightGoalTarget)), unit }
      : null
  const bodyFatRemaining =
    data.bodyFatGoalTarget != null && data.bodyMetricsSummary.bodyFatPct.value != null && !bodyFatGoalReached
      ? Math.abs(data.bodyMetricsSummary.bodyFatPct.value - data.bodyFatGoalTarget)
      : null
  const latestPRForNotif =
    data.latestPR && data.latestPR.performedAt >= daysAgoStr(FITLOG_PR_RECENT_DAYS)
      ? { exerciseName: data.latestPR.exerciseName, weight: Math.round(toDisplay(data.latestPR.weightKg) * 10) / 10, unit }
      : null
  const notifications = computeDashboardNotifications({
    scheduledWorkoutTitle: scheduledDay?.title ?? null,
    todayCompleted,
    recommendation: data.todaysRecommendation,
    bodyFatDelta: data.bodyMetricsSummary.bodyFatPct.delta,
    bodyFatIsGood: data.bodyMetricsSummary.bodyFatPct.isGood,
    weightRemaining,
    bodyFatRemaining,
    latestPR: latestPRForNotif,
    activeMakeupDayId: activeMakeupDay,
  })

  const weightDisplay = data.bodyMetricsSummary.weight.value != null ? toDisplay(data.bodyMetricsSummary.weight.value) : null
  // toDisplay = kgToUnit (kg<->lb conversion, คูณอย่างเดียวไม่มีค่าคงที่บวก) แปลง delta ตรงๆ ได้เลย
  // ไม่ต้องคำนวณผ่าน toDisplay(value) - toDisplay(value - delta) ให้ซับซ้อนเกินจำเป็น
  const weightDeltaDisplay = data.bodyMetricsSummary.weight.delta != null ? toDisplay(data.bodyMetricsSummary.weight.delta) : null

  return (
    <>
      <div className="relative animate-fade-scale-in" style={{ backgroundImage: DASHBOARD_BG_CSS }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute inset-0" style={{ backgroundImage: PAGE_REFLECTION_CSS }} />
          <div className="absolute inset-0" style={{ backgroundImage: BLUE_AMBIENT_CSS }} />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: DIAGONAL_TITANIUM_CSS,
              WebkitMaskImage: DIAGONAL_TITANIUM_FADE_MASK,
              maskImage: DIAGONAL_TITANIUM_FADE_MASK,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: DIAGONAL_TITANIUM_MICRO_REFLECTION_CSS,
              WebkitMaskImage: DIAGONAL_TITANIUM_FADE_MASK,
              maskImage: DIAGONAL_TITANIUM_FADE_MASK,
            }}
          />
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ WebkitMaskImage: DIAGONAL_TITANIUM_FADE_MASK, maskImage: DIAGONAL_TITANIUM_FADE_MASK }}
          >
            <div
              className="absolute"
              style={{
                inset: '-50%',
                backgroundImage: HAIRLINE_SCRATCH_BG,
                backgroundSize: '160px 160px',
                transform: 'rotate(115deg)',
                opacity: 0.02,
                mixBlendMode: 'overlay',
              }}
            />
          </div>
          <div className="absolute inset-0" style={{ backgroundImage: AMBIENT_ORANGE_CSS }} />
          <div className="absolute inset-0" style={{ backgroundImage: NOISE_BG, opacity: 0.02, mixBlendMode: 'overlay' }} />
          <div className="absolute inset-0" style={{ backgroundImage: RADIAL_SHADOW_CSS }} />
          <div className="page-light-sweep absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            <div className="page-light-sweep-band" />
          </div>
          <div className="absolute inset-0" style={{ backgroundImage: VIGNETTE_CSS }} />
        </div>

        <div className="relative" style={{ display: 'flex', flexDirection: 'column', gap: dashboardSpec.screen.sectionGap }}>
          <Header
            greetingText={greetingText}
            notifications={notifications}
            fitnessScore={fitnessScore}
            isRestDay={workoutCardVariant === 'restDay'}
          />

          <TriStatRow
            recoveryPct={fitnessScoreRecoveryPct}
            bodyFat={data.bodyMetricsSummary.bodyFatPct}
            weight={{ value: weightDisplay, delta: weightDeltaDisplay, isGood: data.bodyMetricsSummary.weight.isGood }}
            weightUnit={unit}
          />

          <TodaysFocusCard
            workoutTitle={workoutTitle}
            muscleRecommendation={muscleRecommendation}
            isRestDay={workoutCardVariant === 'restDay'}
            href={scheduledDay ? sessionHref : '/log'}
            todayExercises={data.todayExercises}
          />

          {workoutCardVariant === 'active' && makeupSessionActive && totals.entryCount === 0 ? (
            <TodaysWorkoutCompactCard
              completed={makeupExercisesCompleted}
              total={Math.max(makeupTotalExercises, 1)}
              href={sessionHref}
              volumeChangePct={null}
            />
          ) : workoutCardVariant === 'active' ? (
            <TodaysWorkoutCompactCard
              completed={data.todayExercises.length > 0 ? data.completedCount + data.adhocCompletedCount : totals.entryCount}
              total={Math.max(data.todayExercises.length, totals.entryCount, 1)}
              href={scheduledDay ? sessionHref : '/log'}
              volumeChangePct={todayCompleted ? data.sessionVolumeChange?.changePct ?? null : null}
            />
          ) : (
            <TodaysWorkoutEmptyCard variant={workoutCardVariant} />
          )}

          <WorkoutStreakCard streak={data.streak} bestStreak={data.bestStreak} weekDayTicks={data.weekDayTicks} today={today} />

          <AICoachCompactCard
            message={data.aiDailySummary}
            muscleRecommendation={muscleRecommendation}
            isRestDay={workoutCardVariant === 'restDay'}
            lastUpdatedAt={dataUpdatedAt}
            isRecommendationForToday={data.isRecommendationForToday}
            todayWorkoutTitle={workoutTitle}
            thisWeekWorkoutDays={data.thisWeekWorkoutDays}
            hasMakeupToday={hasMakeupToday && !makeupSessionActive && totals.entryCount === 0}
            makeupSessionActive={makeupSessionActive && totals.entryCount === 0}
            missedPlanCount={0}
            missedPlanTitle={null}
          />
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
      <style jsx>{`
        .page-light-sweep-band {
          position: absolute;
          inset: 0;
          height: 100%;
          background: linear-gradient(180deg, transparent 45%, rgba(255, 255, 255, 0.035) 50%, transparent 55%);
          transform: translateY(-100%);
          animation: page-light-sweep-move 20s ease-in-out infinite;
          will-change: transform;
        }
        @keyframes page-light-sweep-move {
          0% {
            transform: translateY(-100%);
          }
          45%,
          100% {
            transform: translateY(200%);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .page-light-sweep-band {
            animation: none;
            opacity: 0;
          }
        }
      `}</style>
    </>
  )
}
