'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ProgramDay, ProgramExercise, Workout, WorkoutTemplate, WorkoutTemplateExercise } from '@/lib/types'
import { todayStr, todayDayOfWeek, daysAgoStr } from '@/lib/weekdays'
import { computeCurrentStreak, relativeDayLabel, computeTodaysAction, STREAK_WALK_MAX_DAYS, type TodaysAction } from '@/lib/dashboardStats'
import { loadMuscleRecommendation } from '@/lib/muscleRecommendationData'
import { computeDaySummary } from '@/lib/workoutDisplay'
import { startTemplateAsWorkoutLog } from '@/lib/startTemplate'
import { calculatePlates } from '@/lib/plateCalculator'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { getErrorMessage } from '@/lib/errors'
import { getActiveMakeupDayId } from '@/lib/activeMakeupSession'
import { withAlpha } from '@/lib/theme'
import { DS } from '@/lib/designSystem'
import PremiumCard from '@/components/ui/PremiumCard'
import LoadingState from '@/components/LoadingState'
import ErrorState from '@/components/ErrorState'

// หน้า "Train" — เดิมมีแค่ปุ่มลิงก์ลอยๆ ไม่ดึงข้อมูลอะไรเลย บนจอคอมเลยดูโล่งมาก (ฟีดแบ็ก "พื้นที่ว่าง
// เหลือมากกว่า 70%") เปลี่ยนเป็น "Workout Launchpad" ที่ดึงข้อมูลจริงมาแสดง (โปรแกรมวันนี้/เซสชันล่าสุด/
// เทมเพลตที่บันทึกไว้/streak) — จอใหญ่จัด 2 คอลัมน์ (~60:40) จอมือถือเรียงเป็นคอลัมน์เดียวโดยจงใจเรียง
// ลำดับให้ปุ่ม action หลัก (เริ่มเทรน/บันทึกอิสระ/เครื่องมือ) ขึ้นก่อนการ์ดเสริม (เซสชันล่าสุด/เทมเพลตด่วน)
// ด้วย order-* (มือถือ) คู่กับ lg:col-start/row-start (จอใหญ่) แบบเดียวกับที่ DashboardView.tsx ใช้อยู่แล้ว

const SECONDARY = [
  { href: '/program', icon: '📅', label: 'โปรแกรม' },
  { href: '/templates', icon: '📋', label: 'เทมเพลต' },
  { href: '/timer', icon: '⏱', label: 'ไทม์เมอร์' },
  { href: '/exercises', icon: '🏋', label: 'คลังท่าออกกำลัง' },
]

interface RecentSession {
  date: string
  workouts: Workout[]
}

interface TrainData {
  currentDay: ProgramDay | null
  todayExercises: ProgramExercise[]
  completedCount: number
  // 6D P1-2B — ท่าที่จบผ่าน workout_id (ad-hoc/สลับกลางเซสชัน) ของแผนวันนี้โดยเฉพาะ — ไม่รวมเข้า
  // completedCount ตัวบน (ความหมายเดิม "ทำครบตามแผนหรือยัง" คงเดิม) แต่ต้องรวมเข้า completion truth
  // (todaysAction.isCompletedToday) ให้ตรงกับ Dashboard เป๊ะ — ดู comment เต็มที่ adhocCompletedCount ใน
  // DashboardView.tsx
  adhocCompletedCount: number
  streak: number
  // 6D P1-2B — canonical source of truth เดียวกับ Dashboard (computeTodaysAction, lib/dashboardStats.ts)
  // sessionHref/isCompletedToday/scheduleOverriddenFrom ของหน้านี้ต้องอ่านจากตรงนี้เท่านั้น ห้าม
  // reconstruct เอง (เดิม sessionHrefWithMakeup() รู้จักแค่เคส makeup resume ไม่รู้จัก scheduleOverriddenFrom)
  todaysAction: TodaysAction
  // มีเซสชันชดเชย "แท้จริง" ค้างอยู่ไหม (isGenuineMakeupSession() ยืนยันแล้วตอน session/page.tsx set ค่านี้ —
  // ไม่มีทางเป็น schedule-override session เลยตาม invariant ที่ล็อกไว้ P1-2B) ใช้แสดง banner "กำลังทำแผนชดเชย"
  activeMakeupDayId: string | null
  activeMakeupDayTitle: string | null
  recentSessions: RecentSession[]
  templates: WorkoutTemplate[]
  exercisesByTemplate: Record<string, WorkoutTemplateExercise[]>
}

// เซตต่อกล้ามเนื้อของโปรแกรมวันนี้ เรียงมากไปน้อย เอาแค่ 3 อันดับแรก (เช่น "อก 16 เซ็ต · ไหล่ 7 เซ็ต")
function muscleSplitSummary(exercises: ProgramExercise[]): { group: string; sets: number }[] {
  const totals = new Map<string, number>()
  exercises.forEach((e) => {
    if (!e.muscle_group) return
    totals.set(e.muscle_group, (totals.get(e.muscle_group) ?? 0) + (e.sets ?? 0))
  })
  return Array.from(totals.entries())
    .map(([group, sets]) => ({ group, sets }))
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 3)
}

export default function TrainPage() {
  const supabase = createClient()
  const [data, setData] = useState<TrainData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [startingTemplateId, setStartingTemplateId] = useState<string | null>(null)
  const [templateMessage, setTemplateMessage] = useState<string | null>(null)
  const [repeatingDate, setRepeatingDate] = useState<string | null>(null)
  const [repeatResult, setRepeatResult] = useState<{ date: string; message: string } | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const today = todayStr()
      const dow = todayDayOfWeek()
      const streakCutoff = daysAgoStr(STREAK_WALK_MAX_DAYS)

      const [
        { data: dayRows, error: dayErr },
        { data: dateRows },
        { data: recentWorkouts },
        { data: templateRows },
      ] = await Promise.all([
        supabase.from('program_days').select('*').order('day_of_week'),
        supabase
          .from('workouts')
          .select('performed_at')
          .gte('performed_at', streakCutoff)
          .order('performed_at', { ascending: false }),
        supabase
          .from('workouts')
          .select('*')
          .order('performed_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(120),
        supabase.from('workout_templates').select('*').order('created_at', { ascending: false }).limit(6),
      ])

      if (dayErr) {
        setLoadError(dayErr.message)
        return
      }

      const typedDays = (dayRows as ProgramDay[]) ?? []
      const currentDay = typedDays.find((d) => d.day_of_week === dow) ?? null

      let todayExercises: ProgramExercise[] = []
      if (currentDay) {
        const { data: exRows } = await supabase
          .from('program_exercises')
          .select('*')
          .eq('program_day_id', currentDay.id)
          .order('position')
        todayExercises = (exRows as ProgramExercise[]) ?? []
      }

      let completedCount = 0
      if (todayExercises.length > 0) {
        const { data: completions } = await supabase
          .from('program_completions')
          .select('program_exercise_id')
          .eq('completed_at', today)
          .in(
            'program_exercise_id',
            todayExercises.map((e) => e.id)
          )
        completedCount = completions?.length ?? 0
      }

      // 6D P1-2B — ท่าที่จบผ่าน workout_id (ad-hoc/สลับกลางเซสชัน) ของแผนวันนี้ — พอร์ต 1:1 จาก
      // DashboardView.tsx (ดู comment เต็มที่ adhocCompletedCount ที่นั่น) ให้ completion truth ของ Train
      // ตรงกับ Dashboard เป๊ะ ไม่ใช่แค่ program_exercise_id ตามแผนเท่านั้น
      const { data: adhocCompletions } = await supabase
        .from('program_completions')
        .select('id, workout_id')
        .eq('completed_at', today)
        .not('workout_id', 'is', null)
      const typedAdhocCompletions = (adhocCompletions as { id: string; workout_id: string }[]) ?? []
      const adhocWorkoutIds = typedAdhocCompletions.map((c) => c.workout_id)
      const { data: adhocWorkoutDays } =
        adhocWorkoutIds.length > 0
          ? await supabase.from('workouts').select('id, program_day_id').in('id', adhocWorkoutIds)
          : { data: [] as { id: string; program_day_id: string | null }[] }
      const adhocWorkoutDayById = new Map(
        ((adhocWorkoutDays as { id: string; program_day_id: string | null }[]) ?? []).map((w) => [w.id, w.program_day_id])
      )
      const adhocCompletedCount = currentDay
        ? typedAdhocCompletions.filter((c) => adhocWorkoutDayById.get(c.workout_id) === currentDay.id).length
        : 0

      // recentWorkouts เรียง performed_at ใหม่สุดก่อนแล้ว (ไม่มี date filter) จึงรวมแถวของ "วันนี้" อยู่แล้ว
      // โดยไม่ต้อง query ใหม่ — ใช้เป็น todayList แทน (ตามขอบเขตที่ล็อกไว้: ห้ามเพิ่ม query สำหรับ todayWorkouts)
      const allRecent = (recentWorkouts as Workout[]) ?? []
      const todayList = allRecent.filter((w) => w.performed_at === today)
      const todayMuscleGroups = Array.from(new Set(todayList.map((w) => w.muscle_group).filter((mg): mg is string => !!mg)))

      // progressPctForLabel: สูตรเดียวกับ DashboardView.tsx เป๊ะ (ไม่รวม adhoc โดยเจตนา — ดู comment เต็ม
      // ที่จุดเดียวกันในไฟล์นั้น) ป้อนเป็น input ของ loadMuscleRecommendation() เท่านั้น ไม่ใช้แสดงผลที่นี่
      const progressPctForLabel =
        todayExercises.length > 0
          ? Math.round((completedCount / todayExercises.length) * 100)
          : todayList.length > 0
            ? 100
            : null

      const { recommendation, programDayMuscleGroups } = await loadMuscleRecommendation(supabase, {
        programDays: typedDays,
        currentDay,
        todayDayOfWeek: dow,
        todayExercises,
        todayMuscleGroups,
        progressPctForLabel,
      })

      // hasMakeupToday/todayCompletedRaw: พอร์ต 1:1 จาก DashboardView.tsx (ดู comment เต็มที่จุดเดียวกัน)
      const hasMakeupToday = todayList.some((w) => w.program_day_id && w.program_day_id !== currentDay?.id)
      const adhocAwareProgressPct =
        todayExercises.length > 0 ? Math.min(100, Math.round(((completedCount + adhocCompletedCount) / todayExercises.length) * 100)) : null
      const todayCompletedRaw =
        (adhocAwareProgressPct !== null && adhocAwareProgressPct >= 100) || (adhocAwareProgressPct === null && todayList.length > 0)

      const activeMakeupDayId = getActiveMakeupDayId()
      // P1-01/P1-02 — computeTodaysAction ตอนนี้ต้องการตัวเลขดิบสำหรับ completed/total ด้วย (canonical
      // ให้ Desktop/Mobile/BottomNav) — หน้านี้ไม่เคยอ่าน todaysAction.completed/total เลย (ใช้แค่
      // .sessionHref/.isCompletedToday ที่ CTA ด้านล่าง) ส่งตัวเลขจริงที่มีอยู่แล้วในสโคปนี้ไปเฉยๆ เพื่อ
      // ความถูกต้อง ไม่กระทบพฤติกรรมของหน้านี้แต่อย่างใด (นอกสโคป P1-03 — ไม่แตะ/ไม่ใช้ค่านี้)
      const todaysAction = computeTodaysAction({
        recommendation,
        programDays: typedDays,
        programDayMuscleGroups,
        activeMakeupDayId,
        hasMakeupToday,
        todayCompletedRaw,
        todayExercisesCount: todayExercises.length,
        completedCount,
        adhocCompletedCount,
        entryCount: todayList.filter((w) => !w.program_day_id || w.program_day_id === currentDay?.id).length,
      })
      const activeMakeupDayTitle = activeMakeupDayId ? (typedDays.find((d) => d.id === activeMakeupDayId)?.title ?? null) : null

      const distinctDates = Array.from(
        new Set(((dateRows as { performed_at: string }[]) ?? []).map((r) => r.performed_at))
      )
      const workoutWeekdays = new Set(typedDays.map((d) => d.day_of_week))
      const streak = computeCurrentStreak(distinctDates, workoutWeekdays)

      // 2 เซสชันล่าสุด "ที่ไม่ใช่วันนี้" — กันไม่ให้ซ้ำกับการ์ดโปรแกรมวันนี้ด้านบนที่คุยเรื่องวันนี้อยู่แล้ว
      const pastWorkouts = allRecent.filter((w) => w.performed_at !== today)
      const recentDates: string[] = []
      pastWorkouts.forEach((w) => {
        if (recentDates.length < 2 && !recentDates.includes(w.performed_at)) recentDates.push(w.performed_at)
      })
      const recentSessions: RecentSession[] = recentDates.map((date) => ({
        date,
        workouts: pastWorkouts.filter((w) => w.performed_at === date),
      }))

      const templates = (templateRows as WorkoutTemplate[]) ?? []
      const exercisesByTemplate: Record<string, WorkoutTemplateExercise[]> = {}
      if (templates.length > 0) {
        const { data: exRows2 } = await supabase
          .from('workout_template_exercises')
          .select('*')
          .in(
            'template_id',
            templates.map((t) => t.id)
          )
          .order('position')
        ;((exRows2 as WorkoutTemplateExercise[]) ?? []).forEach((ex) => {
          exercisesByTemplate[ex.template_id] = exercisesByTemplate[ex.template_id] ?? []
          exercisesByTemplate[ex.template_id].push(ex)
        })
      }

      setData({
        currentDay,
        todayExercises,
        completedCount,
        adhocCompletedCount,
        streak,
        todaysAction,
        activeMakeupDayId,
        activeMakeupDayTitle,
        recentSessions,
        templates,
        exercisesByTemplate,
      })
    } catch (err) {
      setLoadError(getErrorMessage(err))
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load, reloadToken])

  async function handleStartTemplate(template: WorkoutTemplate) {
    if (!data) return
    const exercises = data.exercisesByTemplate[template.id] ?? []
    if (exercises.length === 0) return

    setStartingTemplateId(template.id)
    setTemplateMessage(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setTemplateMessage('กรุณาเข้าสู่ระบบใหม่')
        return
      }
      const { error, count } = await startTemplateAsWorkoutLog(supabase, user.id, exercises)
      if (error) {
        setTemplateMessage(`เริ่ม "${template.title}" ไม่สำเร็จ: ${error}`)
        return
      }
      setTemplateMessage(`บันทึก "${template.title}" (${count} ท่า) เข้า Log วันนี้แล้ว ✓`)
    } catch (err) {
      setTemplateMessage(getErrorMessage(err))
    } finally {
      setStartingTemplateId(null)
    }
  }

  async function handleRepeatSession(session: RecentSession) {
    setRepeatingDate(session.date)
    setRepeatResult(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setRepeatResult({ date: session.date, message: 'กรุณาเข้าสู่ระบบใหม่' })
        return
      }
      // บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจค): เดิม payload ขาด total_volume_kg/avg_heart_rate/calories_kcal/
      // cadence ทั้งที่ Workout ต้นทาง (w) มีค่าจริงอยู่แล้ว และทุกจุด insert workouts อื่นในแอป (session/
      // page.tsx persistSets, log/page.tsx handleSubmit) ส่งครบทั้ง 4 ฟิลด์นี้ — ผลคือ "เล่นเหมือนรอบนี้"
      // ทำให้แถวที่ก๊อปมาไม่มี total_volume_kg (workoutVolumeKg() ต้อง fallback ไปคูณจาก top-set แทนผลรวม
      // จริงจากแต่ละเซ็ต ถ้าเซสชันต้นทางเป็น pyramid/drop set volume จะคำนวณผิด) และคาร์ดิโอเสีย HR/แคล/
      // cadence ไปเลยแบบเงียบๆ
      // 6F-P1 — UUID เดียวกันสำหรับทั้ง bulk insert นี้ แยกรอบ "ก๊อปปี้" นี้จากรอบอื่น/producer อื่นที่
      // program_day_id เป็น null เหมือนกัน (AI quick-start, generated session, template quick-start) — ดู
      // findExtraLoggedExercises() ใน lib/workoutSession.ts
      const sessionId = crypto.randomUUID()
      const payload = session.workouts.map((w) => ({
        user_id: user.id,
        type: w.type,
        performed_at: todayStr(),
        exercise_name: w.exercise_name,
        muscle_group: w.muscle_group,
        secondary_muscles: w.secondary_muscles,
        exercise_library_id: w.exercise_library_id,
        sets: w.sets,
        reps: w.reps,
        weight_kg: w.weight_kg,
        rpe: w.rpe,
        cardio_type: w.cardio_type,
        distance_km: w.distance_km,
        duration_min: w.duration_min,
        avg_heart_rate: w.avg_heart_rate,
        cadence: w.cadence,
        calories_kcal: w.calories_kcal,
        total_volume_kg: w.total_volume_kg,
        notes: w.notes,
        session_id: sessionId,
      }))
      const { error } = await supabase.from('workouts').insert(payload)
      if (error) {
        setRepeatResult({ date: session.date, message: `ก๊อปปี้ไม่สำเร็จ: ${error.message}` })
        return
      }
      setRepeatResult({ date: session.date, message: `บันทึก ${payload.length} ท่าเข้า Log วันนี้แล้ว ✓` })
    } catch (err) {
      setRepeatResult({ date: session.date, message: getErrorMessage(err) })
    } finally {
      setRepeatingDate(null)
    }
  }

  return (
    <div className="pb-4">
      <div className="mb-5">
        <h1 className="font-display text-2xl tracked uppercase text-ink">เทรน</h1>
      </div>

      {loadError ? (
        <ErrorState message={loadError} onRetry={() => setReloadToken((n) => n + 1)} />
      ) : !data ? (
        <LoadingState />
      ) : (
        <TrainBody
          data={data}
          startingTemplateId={startingTemplateId}
          templateMessage={templateMessage}
          repeatingDate={repeatingDate}
          repeatResult={repeatResult}
          onStartTemplate={handleStartTemplate}
          onRepeatSession={handleRepeatSession}
        />
      )}
    </div>
  )
}

function TrainBody({
  data,
  startingTemplateId,
  templateMessage,
  repeatingDate,
  repeatResult,
  onStartTemplate,
  onRepeatSession,
}: {
  data: TrainData
  startingTemplateId: string | null
  templateMessage: string | null
  repeatingDate: string | null
  repeatResult: { date: string; message: string } | null
  onStartTemplate: (t: WorkoutTemplate) => void
  onRepeatSession: (s: RecentSession) => void
}) {
  const totalToday = data.todayExercises.length
  const startedCount = data.completedCount + data.adhocCompletedCount
  // 6D P1-2B — CTA priority order locked: (1) genuine makeup resume (activeMakeupDayId — provably genuine,
  // ไม่มีทาง overlap กับ schedule-override เพราะ isGenuineMakeupSession() คุมการเขียนค่านี้ไว้แล้ว), (2)
  // isCompletedToday (adhoc-aware, จาก computeTodaysAction เดียวกับ Dashboard), (3) schedule-override ไม่มี
  // label เฉพาะของตัวเอง — ใช้ label เดียวกับ (4)/(5)/(6) ตาม completion state (ตาม Dashboard's own precedent:
  // ปุ่มไม่เปลี่ยนคำอธิบายตาม override เลย มีแค่ href ที่ต่างไป) (4)-(6) ตาม totalToday/startedCount เดิม
  const sessionHref = data.todaysAction.sessionHref
  const ctaLabel = data.activeMakeupDayId
    ? 'ไปต่อ'
    : data.todaysAction.isCompletedToday
      ? 'ทบทวนเวิร์กเอาต์วันนี้'
      : totalToday === 0
        ? 'เริ่มเทรนเลย'
        : startedCount > 0
          ? 'ไปต่อเวิร์กเอาต์นี้'
          : 'เริ่มเวิร์กเอาต์นี้'
  const splits = muscleSplitSummary(data.todayExercises)
  const previewNames = data.todayExercises
    .slice(0, 3)
    .map((e) => e.exercise_name)
    .join(', ')
  const previewExtra = totalToday > 3 ? ` และอีก ${totalToday - 3} ท่า` : ''

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
      {/* ฝั่งซ้าย ~60% — โปรแกรมวันนี้ + บันทึกอิสระ + เซสชันล่าสุด */}
      <div className="order-1 lg:order-none lg:col-start-1 lg:col-span-7 lg:row-start-1">
        <PremiumCard className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[12px] tracked uppercase text-accent-primary">โปรแกรมวันนี้</p>
            <p className="shrink-0 text-[12px] text-muted whitespace-nowrap">🔥 {data.streak} วันติด</p>
          </div>

          {data.currentDay ? (
            <div>
              <h2 className="font-display text-lg tracked uppercase text-ink">{data.currentDay.title}</h2>
              {splits.length > 0 && (
                <p className="text-xs text-muted mt-1.5">{splits.map((s) => `${s.group} ${s.sets} เซ็ต`).join(' · ')}</p>
              )}
              {previewNames && (
                <p className="text-[12px] text-muted/80 mt-1.5">
                  พรีวิว: {previewNames}
                  {previewExtra}
                </p>
              )}
              {/* P1-03 — เลขที่โชว์เปลี่ยนมาใช้ todaysAction.completed/total (canonical เดียวกับ Dashboard/
                  Mobile/BottomNav หลัง P1-01/P1-02) แทน data.completedCount/totalToday เดิม (นับเฉพาะแผน
                  ไม่รวม ad-hoc/makeup เลย ทำให้ CTA ข้างล่าง ซึ่งอ่าน isCompletedToday แบบ adhoc-aware
                  อยู่แล้ว ขัดกับเลขที่เห็นได้ เช่น CTA บอก "ทบทวนเวิร์กเอาต์วันนี้" แต่เลขยังโชว์ "3/5")
                  totalToday (เงื่อนไขซ่อน/โชว์แถวนี้) ยังคงเป็น data.todayExercises.length เป๊ะเหมือนเดิม —
                  ตั้งใจไม่เปลี่ยน ให้ ad-hoc-only/no-plan ยังซ่อนแถวนี้เหมือนเดิมทุกประการ (ล็อกไว้แล้ว) */}
              {totalToday > 0 && (
                <p className="text-[12px] text-muted mt-2">
                  {data.todaysAction.completed}/{data.todaysAction.total} ท่าเสร็จแล้ว
                </p>
              )}
            </div>
          ) : (
            <div>
              <h2 className="font-display text-lg tracked uppercase text-ink">วันนี้ยังไม่ได้ตั้งโปรแกรม</h2>
              <p className="text-xs text-muted mt-1.5">ตั้งตารางฝึกล่วงหน้าได้ที่หน้าโปรแกรม หรือกดเริ่ม/บันทึกอิสระด้านล่างได้เลย</p>
            </div>
          )}

          {/* 6D P1-2B (state 1 ของ CTA matrix) — card ด้านบนยังโชว์ข้อมูลแผนวันนี้เอง (title/splits/preview)
              เป็น context ของตาราง ไม่ใช่คำอ้างว่าปุ่มด้านล่างจะพาไปที่นั่น — เพิ่มบรรทัดนี้บอกตรงๆ ว่ากำลัง
              จะไปต่อเซสชันชดเชยที่ค้างอยู่แทน กัน mismatch ระหว่างเนื้อหาการ์ดกับปลายทางจริงของปุ่ม (ข้อความ
              เดียวกับ DashboardView.tsx's "🔄 กำลังทำแผนชดเชย" เป๊ะ — activeMakeupDayId ยืนยันแล้วว่าเป็น
              genuine makeup เท่านั้น ไม่มีทางเป็น schedule-override เพราะ isGenuineMakeupSession() คุมไว้) */}
          {data.activeMakeupDayId && (
            <p className="text-[13px] text-amber flex items-center gap-1.5">
              <span aria-hidden="true">🔄</span> กำลังทำแผนชดเชย{data.activeMakeupDayTitle ? ` · ${data.activeMakeupDayTitle}` : ''}
            </p>
          )}

          <a
            href={sessionHref}
            className="flex items-center justify-center gap-2 rounded-xl bg-accent-primary text-bg font-display text-sm tracked uppercase py-3 active:scale-[0.99] transition"
          >
            <span aria-hidden="true">▶</span> {ctaLabel}
          </a>
        </PremiumCard>
      </div>

      <div className="order-2 lg:order-none lg:col-start-1 lg:col-span-7 lg:row-start-2">
        <PremiumCard as="a" href="/log" className="flex items-center gap-3 px-4 py-3.5 active:scale-[0.99] transition">
          <span className="shrink-0 w-9 h-9 rounded-full bg-accent-primary/15 text-accent-primary flex items-center justify-center text-base">✚</span>
          <div className="min-w-0">
            <p className="font-display tracked uppercase text-ink text-xs">บันทึกเวิร์กเอาต์แบบอิสระ</p>
            <p className="text-[12px] text-muted mt-0.5 truncate">จดเซ็ต น้ำหนัก คาร์ดิโอ แบบอิสระ</p>
          </div>
        </PremiumCard>
      </div>

      {data.recentSessions.length > 0 && (
        <div className="order-4 lg:order-none lg:col-start-1 lg:col-span-7 lg:row-start-3 space-y-2.5">
          <p className="text-[12px] tracked uppercase text-muted">เซสชันล่าสุดที่เล่นไป</p>
          {data.recentSessions.map((session) => {
            const summary = computeDaySummary(session.workouts)
            return (
              <PremiumCard key={session.date} className="px-4 py-3.5 space-y-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {relativeDayLabel(session.date)}
                    {summary.muscleGroups.length > 0 ? ` — ${summary.muscleGroups.join(' · ')}` : ''}
                  </p>
                  <p className="text-[12px] text-muted mt-0.5">
                    {summary.exerciseCount} ท่า · {summary.totalSets} เซ็ต
                    {summary.totalVolumeKg > 0 ? ` · ${Math.round(summary.totalVolumeKg).toLocaleString('th-TH')} kg` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a
                    href="/history"
                    className="flex-1 text-center text-xs text-muted border border-line rounded-lg py-2 hover:text-ink transition"
                  >
                    ดูรายละเอียด
                  </a>
                  <button
                    type="button"
                    onClick={() => onRepeatSession(session)}
                    disabled={repeatingDate !== null}
                    className="flex-1 text-center text-xs text-accent-primary border border-accent-primary/40 rounded-lg py-2 hover:bg-accent-primary/10 transition disabled:opacity-50"
                  >
                    {repeatingDate === session.date ? 'กำลังบันทึก...' : 'เล่นเหมือนรอบนี้'}
                  </button>
                </div>
                {repeatResult && repeatResult.date === session.date && (
                  <p className="text-[12px] text-muted">{repeatResult.message}</p>
                )}
              </PremiumCard>
            )
          })}
        </div>
      )}

      {/* ฝั่งขวา ~40% — เทมเพลตด่วน + เครื่องมือ */}
      {data.templates.length > 0 && (
        <div className="order-5 lg:order-none lg:col-start-8 lg:col-span-5 lg:row-start-1">
          <p className="text-[12px] tracked uppercase text-muted mb-2">เทมเพลตด่วน</p>
          <PremiumCard className="divide-y divide-white/5">
            {data.templates.map((t) => {
              const exs = data.exercisesByTemplate[t.id] ?? []
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink truncate">{t.title}</p>
                    <p className="text-[12px] text-muted mt-0.5">{exs.length} ท่า</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onStartTemplate(t)}
                    disabled={startingTemplateId !== null || exs.length === 0}
                    className="shrink-0 text-xs font-display tracked uppercase text-accent-primary border border-accent-primary/40 rounded-full px-3 py-1.5 hover:bg-accent-primary/10 transition disabled:opacity-50"
                  >
                    {startingTemplateId === t.id ? '...' : 'เริ่มทันที'}
                  </button>
                </div>
              )
            })}
          </PremiumCard>
          {templateMessage && <p className="text-[12px] text-muted mt-2">{templateMessage}</p>}
        </div>
      )}

      <div className="order-3 lg:order-none lg:col-start-8 lg:col-span-5 lg:row-start-2">
        <p className="text-[12px] tracked uppercase text-muted mb-2">เครื่องมือ</p>
        <div className="grid grid-cols-2 gap-2.5">
          {SECONDARY.map((item) => (
            <PremiumCard
              as="a"
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center gap-1.5 py-5 text-muted hover:text-accent-primary transition"
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[12px] font-display tracked uppercase">{item.label}</span>
            </PremiumCard>
          ))}
        </div>
      </div>

      <div className="order-6 lg:order-none lg:col-start-8 lg:col-span-5 lg:row-start-3">
        <PlateCalculatorWidget />
      </div>
    </div>
  )
}

// เครื่องคิดเลขแผ่นเหล็กแบบด่วน — ใช้ calculatePlates เดิม (lib/plateCalculator.ts) ตัวเดียวกับที่โผล่ใน
// session ระหว่างเทรนอยู่แล้ว แค่ยังไม่เคยมีที่ให้กดใช้แบบเดี่ยวๆ นอกเซสชัน (เช่น เช็คก่อนเข้ายิมว่าต้องใส่
// แผ่นอะไรบ้างสำหรับท่าที่ตั้งใจจะเล่น)
function PlateCalculatorWidget() {
  const { unit } = useWeightUnit()
  const [input, setInput] = useState('')
  // บาร์เปล่าเริ่มที่ 0 เสมอ — บาร์แต่ละยิมไม่เท่ากันจริง (ต่างจาก session ที่มี default 20kg/45lb
  // เพราะรู้อยู่แล้วว่ากำลังเทรนที่ไหน) ให้ผู้ใช้กรอกเองว่าบาร์ที่ใช้จริงหนักเท่าไหร่
  const [barWeightInput, setBarWeightInput] = useState('0')
  const targetWeight = Number(input)
  const barWeight = barWeightInput.trim() !== '' && Number.isFinite(Number(barWeightInput)) && Number(barWeightInput) >= 0
    ? Number(barWeightInput)
    : 0
  const breakdown =
    input.trim() !== '' && Number.isFinite(targetWeight) && targetWeight > 0
      ? calculatePlates(targetWeight, unit, barWeight)
      : null

  return (
    <div>
      <p className="text-[12px] tracked uppercase text-muted mb-2">คำนวณแผ่นเหล็ก</p>
      <PremiumCard className="px-4 py-3.5 space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`น้ำหนักรวมที่ต้องการ (${unit})`}
            className="flex-1 min-w-0 bg-surface2 text-ink text-sm font-mono rounded px-3 py-2 border border-line outline-none focus:border-accent-primary"
          />
          <span className="text-xs text-muted shrink-0">{unit}</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={barWeightInput}
            onChange={(e) => setBarWeightInput(e.target.value)}
            placeholder={`น้ำหนักบาร์เปล่า (${unit})`}
            className="flex-1 min-w-0 bg-surface2 text-ink text-sm font-mono rounded px-3 py-2 border border-line outline-none focus:border-accent-primary"
          />
          <span className="text-xs text-muted shrink-0">{unit}</span>
        </div>
        {breakdown && (
          <div className="rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap" style={{ background: 'rgba(255,255,255,.04)' }}>
            <span className="text-[12px] tracked uppercase text-muted shrink-0">
              แผ่น/ข้าง (บาร์ {breakdown.barWeight}{unit})
            </span>
            {breakdown.perSide.length === 0 ? (
              <span className="text-[12px] font-mono" style={{ color: '#CFD4DE' }}>
                บาร์เปล่า
              </span>
            ) : (
              breakdown.perSide.map((p) => (
                <span
                  key={p.plate}
                  className="rounded-md px-1.5 py-0.5 text-[12px] font-mono"
                  style={{ background: withAlpha(DS.domain.strength, '26'), color: DS.domain.strength }}
                >
                  {p.plate}×{p.count}
                </span>
              ))
            )}
            {breakdown.leftoverPerSide > 0 && (
              <span className="text-[12px] tracked text-muted">
                (แบ่งแผ่นไม่ลงตัว เหลือ {breakdown.leftoverPerSide}{unit}/ข้าง)
              </span>
            )}
          </div>
        )}
      </PremiumCard>
    </div>
  )
}
