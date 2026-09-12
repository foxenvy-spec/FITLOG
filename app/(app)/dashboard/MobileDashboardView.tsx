'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useDashboardSettings } from '@/components/DashboardSettingsProvider'
import { todayDayOfWeek, todayStr, daysAgoStr } from '@/lib/weekdays'
import { getActiveMakeupDayId } from '@/lib/activeMakeupSession'
import { computeTodayTotals, computeDashboardNotifications, computePlannedConsistency } from '@/lib/dashboardStats'
import { goalProgressPct } from '@/lib/goalProgress'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { saveDisplayName } from '@/lib/profile'
import { DEFAULT_DASHBOARD_PREFS, loadDashboardPrefs, saveDashboardPrefs, type DashboardPrefs } from '@/lib/dashboardPrefs'
import { fetchDashboardData, greeting, emailDisplayName, FITLOG_PR_RECENT_DAYS } from './DashboardView'
import { dashboardSpec } from '@/lib/dashboardSpec'
import MobileDashboardSkeleton from '@/components/MobileDashboardSkeleton'
import ErrorState from '@/components/ErrorState'
import Header from '@/components/dashboard/Header'
import BodyOverviewCard from '@/components/dashboard/BodyOverviewCard'
import TodayCard from '@/components/dashboard/TodayCard'
import WeeklyProgressCard from '@/components/dashboard/WeeklyProgressCard'
import GoalCardsRow from '@/components/dashboard/GoalCardsRow'
import AICoachCompactCard from '@/components/AICoachCompactCard'

const DashboardSettings = dynamic(() => import('@/components/DashboardSettings'), { ssr: false })

/**
 * เขียนใหม่ตาม "New_mobile_app.zip" (ผู้ใช้เลือก "ทำเฉพาะหน้า Home" ให้ใช้ทิศทางนี้แทน "brief 2 / option
 * 6a" เดิมที่เพิ่งทำเสร็จไปทั้งมื้อก่อนหน้า) — สเปกใหม่ไม่มี hero photo/Fitness Score ring ใน Header,
 * ไม่มีการ์ด Recovery, แทนที่ด้วย 5 ส่วนตาม README/markup จริงใน "FITLOG.dc.html":
 * Header (โลโก้+กระดิ่ง+ทักทาย) → Body Overview (น้ำหนัก/ไขมัน/กล้ามเนื้อ) → Today (รวม Focus+Workout
 * เดิมเป็นการ์ด hero ไล่สีส้มใบเดียว) → Weekly Progress (เรียบกว่าเดิม ไม่มีแถววงกลม 7 วัน) → Goal Cards
 * (เนื้อหาใหม่ที่ไม่เคยมีมาก่อน) → AI Coach
 *
 * ยังใช้ fetchDashboardData/DashboardData ชุดเดียวกับเดสก์ท็อป (import จาก DashboardView) — ข้อมูล/
 * business logic (เช่น การตรวจจับเซสชันชดเชย, ตัวเลข completed/total, notifications) เป็นแหล่งเดียว
 * ไม่ได้รื้อสร้างใหม่ มีแค่ "จะ render อะไรบนหน้าจอ" ที่เปลี่ยนไปตามสเปกใหม่
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
  // จริงก่อนตัดสินว่า "กำลังทำอยู่" สำหรับสลับตัวเลข completed/total ที่ส่งเข้า Today
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

  const workoutTitle = scheduledDay?.title ?? ((data?.todayWorkouts.length ?? 0) > 0 ? 'Free Log' : null)
  const progressPct =
    data && data.todayExercises.length > 0
      ? Math.min(100, Math.round(((data.completedCount + data.adhocCompletedCount) / data.todayExercises.length) * 100))
      : null

  const muscleRecommendation = data?.todaysRecommendation ?? null

  // ความคืบหน้าสัปดาห์นี้ "ตามแผน" (ไม่ใช่ปฏิทินดิบ 7 วัน) — สูตรเดียวกับ ConsistencyStrip.tsx/
  // DashboardView.tsx เดสก์ท็อป (computePlannedConsistency) ใช้ data.weekDayTicks ที่มีอยู่แล้ว (เดิมใช้
  // วาดแถววงกลม 7 วันของ WorkoutStreakCard.tsx) แปลงเป็น {dayOfWeek, hasWorkout} ตามที่ฟังก์ชันนี้ต้องการ
  // — plannedWeekdays ว่าง (ยังไม่เคยตั้งโปรแกรม) จะได้ pct: null กลับมา ใช้ fallback ไปนับปฏิทินดิบแทน
  const plannedWeekdays = useMemo(() => new Set((data?.programDays ?? []).map((d) => d.day_of_week)), [data?.programDays])
  const weeklyConsistencyDays = useMemo(
    () =>
      (data?.weekDayTicks ?? []).map((t) => ({
        dayOfWeek: new Date(`${t.iso}T00:00:00Z`).getUTCDay(),
        hasWorkout: t.trained,
      })),
    [data?.weekDayTicks]
  )
  const plannedConsistency = computePlannedConsistency(weeklyConsistencyDays, plannedWeekdays)
  const weeklyTrainedCount = (data?.weekDayTicks ?? []).filter((t) => t.trained).length
  const weeklyCompletedCount = plannedConsistency.plannedCount > 0 ? plannedConsistency.completedCount : weeklyTrainedCount
  const weeklyPlannedCount = plannedConsistency.plannedCount > 0 ? plannedConsistency.plannedCount : 7
  const weeklyPct = plannedConsistency.pct ?? Math.round((weeklyTrainedCount / 7) * 100)

  if (isLoading || !data) {
    return <MobileDashboardSkeleton />
  }

  if (isError) {
    return <ErrorState title="โหลด Dashboard ไม่สำเร็จ" message="ไม่สามารถโหลด Dashboard ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่" onRetry={retry} />
  }

  const hasTodayPlan = data.todayExercises.length > 0
  const hasLoggedToday = data.todayWorkouts.length > 0
  const hasAnyProgram = data.programDays.length > 0
  const workoutCardVariant: 'active' | 'restDay' | 'noProgram' =
    hasTodayPlan || hasLoggedToday ? 'active' : hasAnyProgram ? 'restDay' : 'noProgram'

  const todayCompleted = (progressPct !== null && progressPct >= 100) || (progressPct === null && data.todayWorkouts.length > 0)
  const todayCardCompleted =
    workoutCardVariant === 'active' && makeupSessionActive && totals.entryCount === 0
      ? makeupExercisesCompleted
      : data.todayExercises.length > 0
        ? data.completedCount + data.adhocCompletedCount
        : totals.entryCount
  const todayCardTotal =
    workoutCardVariant === 'active' && makeupSessionActive && totals.entryCount === 0
      ? Math.max(makeupTotalExercises, 1)
      : Math.max(data.todayExercises.length, totals.entryCount, 1)
  const todayCardHref =
    workoutCardVariant === 'active' && makeupSessionActive && totals.entryCount === 0 ? sessionHref : scheduledDay ? sessionHref : '/log'

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

  const weightGoalPct =
    data.weightGoalTarget != null && data.bodyMetricsSummary.weight.value != null
      ? goalProgressPct({ target_value: data.weightGoalTarget, starting_value: data.weightGoalStart }, data.bodyMetricsSummary.weight.value, data.earliestTrackedWeight)
      : null
  const bodyFatGoalPct =
    data.bodyFatGoalTarget != null && data.bodyMetricsSummary.bodyFatPct.value != null
      ? goalProgressPct({ target_value: data.bodyFatGoalTarget, starting_value: data.bodyFatGoalStart }, data.bodyMetricsSummary.bodyFatPct.value, data.earliestTrackedBodyFat)
      : null

  const weightGoalCard =
    data.weightGoalTarget != null && data.bodyMetricsSummary.weight.value != null
      ? {
          fromValue: toDisplay(data.bodyMetricsSummary.weight.value),
          toValue: toDisplay(data.weightGoalTarget),
          unit,
          decimals: 1,
          pct: weightGoalPct ?? 0,
          // ฟีดแบ็ก "'X to go' อ่านคลุมเครือ เปลี่ยนเป็น 'X remaining' ให้ชัดว่าคือส่วนที่เหลือของเป้าหมาย"
          statusText: weightGoalReached ? 'Goal reached 🎉' : weightRemaining ? `${weightRemaining.value.toFixed(1)} ${weightRemaining.unit} remaining` : '',
        }
      : null
  const bodyFatGoalCard =
    data.bodyFatGoalTarget != null && data.bodyMetricsSummary.bodyFatPct.value != null
      ? {
          fromValue: data.bodyMetricsSummary.bodyFatPct.value,
          toValue: data.bodyFatGoalTarget,
          unit: '%',
          decimals: 1,
          pct: bodyFatGoalPct ?? 0,
          // ฟีดแบ็ก "'4.2% remaining' อ่านกำกวม — เป็นส่วนต่างแบบ percentage point (22.2% -> 18.0%) ไม่ใช่
          // '4.2%' เชิงสัดส่วน — เปลี่ยนหน่วยเป็น 'pts' ให้ชัดว่าเป็นจุดเปอร์เซ็นต์ ไม่ใช่เปอร์เซ็นต์ซ้อน"
          statusText: bodyFatGoalReached ? 'Goal reached 🎉' : bodyFatRemaining != null ? `${bodyFatRemaining.toFixed(1)} pts remaining` : '',
        }
      : null

  return (
    <>
      <div className="relative animate-fade-scale-in" style={{ background: '#0a0d12' }}>
        <div className="relative" style={{ display: 'flex', flexDirection: 'column', gap: dashboardSpec.screen.sectionGap }}>
          <Header
            greetingText={greetingText}
            displayName={data.profileDisplayName || emailDisplayName(data.email)}
            notifications={notifications}
          />

          {/* ฟีดแบ็ก "ขยับ Body Overview ขึ้นไปทับรูป ให้อยู่ใต้ Better Than Yesterday" → "ทับรูปไปเลย
              ให้อยู่ใต้คำว่า Better than yesterday พอดี" (รอบแรกทับแค่ 23px ยังเหลือช่องว่างเห็นรูปภูเขา
              ระหว่าง tagline กับการ์ด — ลองรอบสองที่ -65 ดันทับซ้อนกับตัวหนังสือ tagline พอดี ลดกลับมา -54
              ให้ tagline เห็นเต็มบรรทัดพอดีไม่มีช่องว่างเหลือ) */}
          <div style={{ marginTop: -54, position: 'relative' }}>
            <BodyOverviewCard
              weight={{ value: weightDisplay, delta: weightDeltaDisplay, isGood: data.bodyMetricsSummary.weight.isGood }}
              weightUnit={unit}
              bodyFatPct={data.bodyMetricsSummary.bodyFatPct}
              muscleKg={data.bodyMetricsSummary.skeletalMuscleKg}
            />
          </div>

          <TodayCard
            workoutTitle={workoutTitle}
            muscleRecommendation={muscleRecommendation}
            todayExercises={data.todayExercises}
            variant={workoutCardVariant}
            completed={todayCardCompleted}
            total={todayCardTotal}
            href={todayCardHref}
          />

          {/* ฟีดแบ็ก (poster "Version 2 — 9.3/10", โพลิช "ปรับระยะห่าง Workout → Progress") — sectionGap
              เดียวกันทั้งหมด (dashboardSpec.screen.sectionGap) ใช้ร่วมทุกคู่การ์ด เพิ่ม marginTop เสริม
              เฉพาะคู่นี้แทนแก้ token กลาง (ไม่กระทบระยะห่างคู่อื่น) */}
          <div style={{ marginTop: 6 }}>
            <WeeklyProgressCard
              completedCount={weeklyCompletedCount}
              plannedCount={weeklyPlannedCount}
              pct={weeklyPct}
              streak={data.streak}
            />
          </div>

          <GoalCardsRow weight={weightGoalCard} bodyFat={bodyFatGoalCard} />

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
            variant="flat"
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
    </>
  )
}
