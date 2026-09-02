'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/client'
import type { ProgramDay, Workout } from '@/lib/types'
import {
  generateWorkoutForMuscle,
  toAdhocProgramExercises,
  candidateExercisesForMuscle,
  mapAiExercisesToWorkout,
  swapExerciseAt,
  type GeneratedWorkout,
} from '@/lib/workoutGenerator'
import { GENERATED_SESSION_STORAGE_KEY, type StoredGeneratedSession } from '@/lib/generatedSession'
import { MUSCLE_GROUPS, VOLUME_MUSCLES, dominantMuscleGroup, describeMuscleFocus, type MuscleGroup } from '@/lib/muscle-groups'
import { todayStr } from '@/lib/weekdays'
import {
  computeRecoveryPct,
  suggestMuscleToTrain,
  computeImbalanceInsights,
  computeTrainingBalance,
  getWeekRange,
  getScheduledMuscleForDay,
  getNextScheduledMuscle,
  recoveryTier,
  recoveryVerdictEmoji,
  computeRecentWeeklyVolumes,
  type Insight,
  type ScheduledDay,
  type MuscleRecommendation,
} from '@/lib/dashboardStats'
import {
  computePushPullBalance,
  pushPullInsight,
  computeProgressiveOverload,
  computeAIDailySummary,
  buildSkippedExerciseInsight,
  detectDeloadSignal,
  deloadInsight,
  type PushPullBalance,
  type OverloadPlan,
} from '@/lib/aiCoach'
import { fetchWeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
import Skeleton from '@/components/Skeleton'
import InsightCard from '@/components/InsightCard'
import ErrorState from '@/components/ErrorState'
import AnimatedBarFill from '@/components/AnimatedBarFill'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { useExerciseLibrary } from '@/lib/useExerciseLibrary'
import PremiumCard from '@/components/ui/PremiumCard'
import Button from '@/components/ui/Button'
import { COLORS } from '@/lib/theme'

const MAX_OVERLOAD_EXERCISES = 3

const ACTION_LABEL: Record<OverloadPlan['action'], { text: string; color: string }> = {
  increase_weight: { text: 'เพิ่มน้ำหนัก', color: 'text-amber' },
  increase_reps: { text: 'เพิ่ม Reps', color: 'text-ink' },
  deload: { text: 'ลดน้ำหนัก (Deload)', color: 'text-rusttext' },
}

interface CoachData {
  dailySummary: string
  balance: PushPullBalance
  balanceInsights: Insight[]
  overloadPlans: OverloadPlan[]
  skippedInsight: Insight | null
  skippedExerciseNames: string[]
  deloadWarning: Insight | null
  muscleRecommendation: MuscleRecommendation | null
  todayProgressPct: number | null
  // ถ้าตารางโปรแกรมประจำสัปดาห์ระบุกล้ามเนื้อของวันนี้/ครั้งหน้าไว้ชัดเจน (ดู getScheduledMuscleForDay) —
  // ใช้บอก Gemini ว่าคำแนะนำนี้มาจากตาราง ไม่ใช่จาก recovery % ล้วนๆ ให้เรียบเรียงคำพูดได้ตรงบริบทขึ้น
  scheduledMuscle: string | null
  // ฟีดแบ็ก "AI Coach ควรกลายเป็น Decision Engine ที่มีเหตุผล ไม่ใช่แค่ Widget" — recovery % ของกลุ่ม
  // กล้ามเนื้อที่เกี่ยวข้องกับ muscleRecommendation ทั้งหมด (ไม่ใช่แค่ตัวหลักตัวเดียว) ใช้ describeMuscleFocus
  // (ตารางเดียวกับที่ Dashboard/TodaysFocusCard ใช้อยู่แล้ว) render เป็น bullet "🟢 อก ฟื้นตัวแล้ว 100%"
  reasoningGroups: { muscleGroup: string; pct: number }[]
}

function topExerciseNames(rows: { exercise_name: string | null }[], limit: number): string[] {
  const counts: Record<string, number> = {}
  rows.forEach((r) => {
    if (!r.exercise_name) return
    counts[r.exercise_name] = (counts[r.exercise_name] ?? 0) + 1
  })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name)
}

export default function CoachPage() {
  const supabase = createClient()
  const router = useRouter()
  const { format } = useWeightUnit()
  const { data: exercises = [] } = useExerciseLibrary()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CoachData | null>(null)

  // โปรแกรมที่สร้างแบบ rule-based (ปุ่ม "Generate Workout") — เก็บแยกจาก data เพราะเป็น action ของ
  // ผู้ใช้เอง ไม่ใช่ค่าที่คำนวณตอนโหลดหน้า — เก็บแยกไว้เพื่อให้กด Start Workout ได้ทันทีที่ generate เสร็จ
  // (เดิมเคยมีปุ่ม "สุ่มใหม่" แต่เอาออกแล้ว — ขัดกับ framing "AI Coach วิเคราะห์มาให้แล้ว" เมื่ออยู่
  // คู่กับปุ่ม "ให้ AI ปรุงแต่งท่า" ทำให้ผู้ใช้สับสนว่าโปรแกรมที่เห็นคือสุ่มมาเฉยๆ หรือวิเคราะห์จริง)
  const [generatedWorkout, setGeneratedWorkout] = useState<GeneratedWorkout | null>(null)
  // ให้ Gemini ปรุงแต่งทับโปรแกรม rule-based ที่มีอยู่แล้ว — opt-in เหมือน requestAiInsight
  // ถ้าพัง ต้องไม่แทนที่ generatedWorkout เดิม (fallback กลับไปใช้ rule-based เสมอ)
  const [aiWorkoutLoading, setAiWorkoutLoading] = useState(false)
  const [aiWorkoutError, setAiWorkoutError] = useState<string | null>(null)
  // สลับท่าเดียว (ไม่ใช่ทั้งโปรแกรม) — ใช้ตอนผู้ใช้เจอท่าที่เล่นไม่ได้ เก็บ error แยกจาก aiWorkoutError
  // เพราะคนละ action กัน (สลับท่า vs ให้ AI ปรุงแต่งทั้งชุด)
  const [swapError, setSwapError] = useState<string | null>(null)
  // คำแนะนำเชิงลึกจาก Gemini — แยกจาก data.dailySummary (rule-based, คำนวณฟรีทันที) โดยตั้งใจ
  // เพราะเป็น opt-in (ผู้ใช้กดขอเอง ไม่เรียกอัตโนมัติ) กันชนโควต้าฟรีของ Gemini — ถ้าพังให้ตกกลับไป
  // ใช้ dailySummary เดิมเสมอ (ดู aiError ด้านล่าง ไม่แทนที่ dailySummary)
  const [aiMessage, setAiMessage] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { start: thisWeekStart, end: thisWeekEnd } = getWeekRange()

      const [{ data: rows }, weeklyVolumeTargets] = await Promise.all([
        supabase
          .from('workouts')
          .select('*')
          .eq('type', 'strength')
          .order('performed_at', { ascending: false })
          .limit(2000),
        // เป้าหมายเซ็ต/สัปดาห์ — ให้ suggestMuscleToTrain ด้านล่างเช็ค Weekly Volume ก่อนแนะนำตามตาราง
        // (ฟีดแบ็ก "Legs ฟื้นตัวแล้ว ≠ Legs ควรฝึก" — เดิมหน้านี้ยึดตารางเงียบๆ ไม่เคยเช็ค Volume เหมือน
        // Dashboard ก่อนแก้ ทำให้แนะนำขัดกันได้)
        fetchWeeklyVolumeTargets(supabase),
      ])

      const allEntries = (rows as Workout[]) ?? []

      // --- Recovery ของแต่ละกล้ามเนื้อ ---
      const lastTrainedByMuscle: Record<string, string> = {}
      allEntries.forEach((w) => {
        if (!w.muscle_group) return
        if (!lastTrainedByMuscle[w.muscle_group]) lastTrainedByMuscle[w.muscle_group] = w.performed_at
      })
      const recoveryPctMap: Record<string, number> = {}
      MUSCLE_GROUPS.forEach((mg) => {
        recoveryPctMap[mg] = computeRecoveryPct(lastTrainedByMuscle[mg] ?? null, mg)
      })

      // --- สมดุลกล้ามเนื้อสัปดาห์นี้ ---
      const thisWeekSets: Record<string, number> = {}
      allEntries.forEach((w) => {
        if (!w.muscle_group) return
        if (w.performed_at < thisWeekStart || w.performed_at > thisWeekEnd) return
        thisWeekSets[w.muscle_group] = (thisWeekSets[w.muscle_group] ?? 0) + (w.sets ?? 0)
      })
      const balance = computePushPullBalance(thisWeekSets)
      const balanceWarning = pushPullInsight(balance)
      const balanceInsights: Insight[] = [
        ...(balanceWarning ? [balanceWarning] : []),
        ...computeImbalanceInsights(thisWeekSets, VOLUME_MUSCLES),
      ]

      // --- Smart Deload Detector — Volume สูงต่อเนื่องหลายสัปดาห์ + RPE เฉลี่ยสัปดาห์นี้ ---
      const weeklyVolumeKg = computeRecentWeeklyVolumes(allEntries, 4)
      const thisWeekRpeValues = allEntries
        .filter((w) => w.performed_at >= thisWeekStart && w.performed_at <= thisWeekEnd && w.rpe !== null)
        .map((w) => w.rpe as number)
      const avgRecentRpe =
        thisWeekRpeValues.length > 0
          ? Math.round((thisWeekRpeValues.reduce((a, b) => a + b, 0) / thisWeekRpeValues.length) * 10) / 10
          : null
      const deloadSignal = detectDeloadSignal(weeklyVolumeKg, avgRecentRpe)
      const deloadWarning = deloadInsight(deloadSignal)

      // --- Progressive Overload สำหรับท่าที่ทำบ่อยที่สุด ---
      const names = topExerciseNames(allEntries, MAX_OVERLOAD_EXERCISES)
      const overloadPlans = names
        .map((name) => computeProgressiveOverload(name, allEntries, exercises))
        .filter((p): p is OverloadPlan => p !== null)

      // --- ตารางโปรแกรมทั้งสัปดาห์ (ใช้ยึดคำแนะนำให้ตรงตาราง แทนที่จะดู recovery % ล้วนๆ) ---
      const { data: allProgramDayRows } = await supabase.from('program_days').select('id, day_of_week, title')
      const allProgramDays = (allProgramDayRows as { id: string; day_of_week: number; title: string }[]) ?? []

      // ท่าของทุกวันในตาราง — ใช้หากล้ามเนื้อหลักจริงของแต่ละวัน (dominantMuscleGroup) แทนการเดาจาก title
      // ตรงๆ (เดิม getScheduledMuscleForDay ต้องตั้งชื่อวันเป็นชื่อกล้ามเนื้อไทยล้วนๆ เช่น "ขา" ถึงจะจับคู่
      // ได้ ทำให้ผู้ใช้ที่ตั้งชื่อวันแบบบรรยาย เช่น "Day 5 — Lower" ไม่เคยได้ประโยชน์จากตารางเลย — ดู comment
      // เต็มที่ ScheduledDay ใน lib/dashboardStats.ts)
      const { data: allProgramExRows } =
        allProgramDays.length > 0
          ? await supabase
              .from('program_exercises')
              .select('program_day_id, muscle_group')
              .in(
                'program_day_id',
                allProgramDays.map((d) => d.id)
              )
          : { data: [] as { program_day_id: string; muscle_group: string | null }[] }
      const exercisesByDayId: Record<string, { muscle_group: string | null }[]> = {}
      ;((allProgramExRows as { program_day_id: string; muscle_group: string | null }[]) ?? []).forEach((row) => {
        exercisesByDayId[row.program_day_id] = exercisesByDayId[row.program_day_id] ?? []
        exercisesByDayId[row.program_day_id].push(row)
      })
      const scheduledDaysWithMuscle: ScheduledDay[] = allProgramDays.map((d) => ({
        day_of_week: d.day_of_week,
        title: d.title,
        muscleGroup: dominantMuscleGroup(exercisesByDayId[d.id] ?? []),
      }))

      // --- % ความคืบหน้าของแผนวันนี้ (ใช้กับ dailySummary ด้านล่าง) ---
      const today = todayStr()
      const trainedAnyToday = allEntries.some((w) => w.performed_at?.slice(0, 10) === today)
      // ใช้เช็คว่ากลุ่มกล้ามเนื้อของวันนี้ถูกล็อกเซ็ตจริงไปแล้วหรือยัง (ดู comment เต็มที่จุดใช้ preferToday
      // ด้านล่าง — บั๊กเดียวกับที่แก้ใน DashboardView.tsx/recovery/page.tsx)
      const todayMuscleGroups = new Set(
        allEntries.filter((w) => w.performed_at?.slice(0, 10) === today && w.muscle_group).map((w) => w.muscle_group as string)
      )
      const todayDow = new Date(today + 'T00:00:00').getDay()
      const todayDayId = allProgramDays.find((d) => d.day_of_week === todayDow)?.id ?? null

      let todayProgressPct: number | null = null
      if (todayDayId) {
        const { data: todayExRows } = await supabase
          .from('program_exercises')
          .select('id')
          .eq('program_day_id', todayDayId)
        const todayExerciseIds = (todayExRows as { id: string }[] | null)?.map((r) => r.id) ?? []
        if (todayExerciseIds.length > 0) {
          const { data: todayCompletions } = await supabase
            .from('program_completions')
            .select('program_exercise_id')
            .eq('completed_at', today)
            .in('program_exercise_id', todayExerciseIds)
          todayProgressPct = Math.round(((todayCompletions?.length ?? 0) / todayExerciseIds.length) * 100)
        } else {
          todayProgressPct = trainedAnyToday ? 100 : null
        }
      } else {
        todayProgressPct = trainedAnyToday ? 100 : null
      }

      // --- กล้ามเนื้อที่ควรแนะนำ: ยึดตามตารางโปรแกรมก่อน ---
      // ถ้าวันนี้ยังทำไม่ครบ (< 100%) และตารางระบุกล้ามเนื้อของ "วันนี้" ไว้ชัดเจน ให้ใช้ตัวนั้น
      // ถ้าวันนี้ทำครบแล้ว หรือวันนี้เป็นวันพัก/ไม่ได้ผูกกล้ามเนื้อไว้ ให้มองไปที่วันถัดไปในตารางที่ระบุไว้
      // ถ้าไม่มีตารางเลย (ผู้ใช้ยังไม่ได้ตั้งโปรแกรม) ตกกลับไปใช้ recovery % สูงสุดเหมือนเดิมทั้งหมด
      const todayScheduledMuscle = getScheduledMuscleForDay(scheduledDaysWithMuscle, todayDow, MUSCLE_GROUPS)
      // บั๊ก (ฟีดแบ็ก "MINT Coach บอกเล่นอกครั้งหน้า ทั้งที่เพิ่งเล่นอกไปและฟื้นตัว 0% แล้ว") — todayProgressPct
      // ตั้งใจนับเฉพาะท่าที่ติ๊กครบตามแผน (program_completions) ไม่นับงานนอกแผน แต่ถ้ากล้ามเนื้อนี้ถูกล็อก
      // เซ็ตจริงวันนี้ไปแล้ว (recovery ร่วงแล้ว) ก็ไม่ควรแนะนำซ้ำว่า "วันนี้" อีก แม้ยังติ๊กไม่ครบทุกท่าตามแผน
      // (ดู comment เต็มที่ DashboardView.tsx จุดเดียวกัน)
      const preferToday =
        !!todayScheduledMuscle && !todayMuscleGroups.has(todayScheduledMuscle) && (todayProgressPct === null || todayProgressPct < 100)
      const scheduledMuscle = preferToday
        ? todayScheduledMuscle
        : getNextScheduledMuscle(scheduledDaysWithMuscle, todayDow, MUSCLE_GROUPS)

      const recommendation = suggestMuscleToTrain(recoveryPctMap, scheduledMuscle, thisWeekSets, weeklyVolumeTargets)
      // suggestMuscleToTrain ตกกลับไปเลือกกล้ามเนื้อ recovery สูงสุดเงียบๆ ถ้า scheduledMuscle ไม่มีข้อมูล
      // recovery — เช็คผลลัพธ์จริงตรงกับ todayScheduledMuscle เป๊ะๆ ก่อน (เหมือน DashboardView.tsx
      // isRecommendationForToday) ส่งต่อให้ computeAIDailySummary กันข้อความพูดว่า "วันนี้ควรเล่น"
      // ทั้งที่จริงๆ กำลังแนะนำของครั้งถัดไป — scheduleOverriddenFrom ก็ยังนับว่า "เรื่องของวันนี้" เหมือนกัน
      const isRecommendationForToday =
        preferToday && (recommendation?.muscleGroup === todayScheduledMuscle || recommendation?.scheduleOverriddenFrom === todayScheduledMuscle)
      // Training Balance Engine (Priority 2) — เดิม dailySummary เห็นแค่ recovery + push/pull ไม่รู้เรื่อง
      // สัดส่วนบน/ล่างลำตัวเทียบเป้าหมายเลย ทั้งที่ thisWeekSets ด้านบนมีพร้อมใช้อยู่แล้ว
      const trainingBalance = computeTrainingBalance(thisWeekSets, VOLUME_MUSCLES)
      const dailySummary = computeAIDailySummary(recommendation, balance, todayProgressPct, trainingBalance, isRecommendationForToday)

      // เหตุผลเบื้องหลังคำแนะนำ — recovery % ของกลุ่มกล้ามเนื้อที่เกี่ยวข้องทั้งหมด (ไม่ใช่แค่ muscleGroup
      // หลักตัวเดียว) ใช้ describeMuscleFocus ตัวเดียวกับ TodaysFocusCard/AICoachCompactCard
      const reasoningGroups = recommendation
        ? describeMuscleFocus(recommendation.muscleGroup as MuscleGroup).relatedGroups.map((mg) => ({
            muscleGroup: mg,
            pct: recoveryPctMap[mg] ?? 100,
          }))
        : []

      // --- ท่าที่ข้ามไปในเซสชันโปรแกรมล่าสุด ---
      let skippedInsight: Insight | null = null
      let skippedExerciseNames: string[] = []
      const { data: lastCompletionRow } = await supabase
        .from('program_completions')
        .select('completed_at')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastCompletionRow) {
        const lastDate = (lastCompletionRow as { completed_at: string }).completed_at
        const lastDow = new Date(lastDate + 'T00:00:00').getDay()
        const { data: dayRow } = await supabase
          .from('program_days')
          .select('*')
          .eq('day_of_week', lastDow)
          .maybeSingle()

        if (dayRow) {
          const typedDay = dayRow as ProgramDay
          const [{ data: planRows }, { data: completionRows }] = await Promise.all([
            supabase.from('program_exercises').select('id, exercise_name, muscle_group').eq('program_day_id', typedDay.id),
            supabase.from('program_completions').select('program_exercise_id').eq('completed_at', lastDate),
          ])
          const completedIds = new Set(
            ((completionRows as { program_exercise_id: string }[]) ?? []).map((c) => c.program_exercise_id)
          )
          const typedPlanRows = (planRows as { id: string; exercise_name: string; muscle_group: string | null }[]) ?? []
          skippedInsight = buildSkippedExerciseInsight(typedDay.title, lastDate, typedPlanRows, completedIds)
          skippedExerciseNames = typedPlanRows.filter((ex) => !completedIds.has(ex.id)).map((ex) => ex.exercise_name)
        }
      }

      setData({
        dailySummary,
        balance,
        balanceInsights,
        overloadPlans,
        skippedInsight,
        skippedExerciseNames,
        deloadWarning,
        muscleRecommendation: recommendation,
        todayProgressPct,
        scheduledMuscle,
        reasoningGroups,
      })
    } catch (err) {
      console.error('Coach page load failed', err)
      Sentry.captureException(err, { tags: { source: 'coach-page' } })
      setError('ไม่สามารถโหลดข้อมูล AI Coach ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
    } finally {
      setLoading(false)
    }
  }, [supabase, exercises])

  useEffect(() => {
    load()
  }, [load])

  // ข้อมูลเปลี่ยน (เช่นกด retry) แล้วคำแนะนำ AI เดิมอาจไม่ตรงกับข้อมูลใหม่แล้ว — เคลียร์ทิ้งเพื่อให้
  // ผู้ใช้กดขอใหม่เอง (ไม่ auto-refetch อัตโนมัติ ตามหลัก opt-in เดิม)
  useEffect(() => {
    setAiMessage(null)
    setAiError(null)
    setGeneratedWorkout(null)
    setAiWorkoutError(null)
    setSwapError(null)
  }, [data])

  async function requestAiInsight() {
    if (!data) return
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/ai-coach-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          muscleRecommendation: data.muscleRecommendation,
          balance: data.balance,
          overloadPlans: data.overloadPlans.map((p) => ({
            exerciseName: p.exerciseName,
            action: p.action,
            currentWeight: p.currentWeight,
            currentReps: p.currentReps,
            targetWeight: p.targetWeight,
            targetReps: p.targetReps,
            avgRpe: p.avgRpe,
          })),
          skippedExercises: data.skippedExerciseNames.length > 0 ? data.skippedExerciseNames : null,
          todayProgressPct: data.todayProgressPct,
          scheduledMuscle: data.scheduledMuscle,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setAiError(json.error ?? 'ขอคำแนะนำจาก AI ไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      setAiMessage(json.message)
    } catch (err) {
      console.error('AI coach insight request failed', err)
      setAiError('ขอคำแนะนำจาก AI ไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
    } finally {
      setAiLoading(false)
    }
  }

  function handleGenerateWorkout() {
    if (!data?.muscleRecommendation) return
    const workout = generateWorkoutForMuscle(data.muscleRecommendation.muscleGroup as MuscleGroup, exercises)
    setGeneratedWorkout(workout)
    setAiWorkoutError(null)
    setSwapError(null)
  }

  // สลับท่าเดียวที่ index นี้ — เผื่อผู้ใช้เจอท่าที่เล่นไม่ได้ (เช่น ยิมไม่มีอุปกรณ์) โดยไม่ต้อง
  // สร้างทั้งโปรแกรมใหม่ ถ้าคลังท่าของกล้ามเนื้อนี้ไม่มีท่าอื่นเหลือแล้วจะแจ้ง error แทนสลับให้ท่าซ้ำ
  function handleSwapExercise(index: number) {
    if (!generatedWorkout) return
    const swapped = swapExerciseAt(generatedWorkout, index, exercises)
    if (!swapped) {
      setSwapError('ไม่มีท่าอื่นเหลือให้สลับแล้วสำหรับกล้ามเนื้อกลุ่มนี้')
      return
    }
    setSwapError(null)
    setGeneratedWorkout(swapped)
  }

  async function handleEnhanceWithAi() {
    if (!generatedWorkout || !data) return
    setAiWorkoutLoading(true)
    setAiWorkoutError(null)
    try {
      const res = await fetch('/api/generate-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          muscleGroup: generatedWorkout.muscleGroup,
          exerciseCount: generatedWorkout.exercises.length,
          candidates: candidateExercisesForMuscle(generatedWorkout.muscleGroup, exercises),
          // ยังไม่มีรายการ "เพิ่งเล่นล่าสุด" แยกต่างหากในหน้านี้ — ใช้ชื่อท่าจาก Progressive Overload
          // plans (ท่าที่ทำบ่อยที่สุด) เป็น proxy ที่ใกล้เคียงที่สุดที่มีอยู่แล้ว
          recentExerciseNames: data.overloadPlans.map((p) => p.exerciseName),
          overloadHints: data.overloadPlans.map((p) => ({ exerciseName: p.exerciseName, action: p.action })),
          balanceStatus: data.balance.status,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setAiWorkoutError(json.error ?? 'ให้ AI ปรุงแต่งโปรแกรมไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      const enhanced = mapAiExercisesToWorkout(generatedWorkout.muscleGroup, json.exercises ?? [], exercises)
      if (enhanced.exercises.length === 0) {
        setAiWorkoutError('AI ไม่ได้เลือกท่าที่ใช้ได้ กลับไปใช้โปรแกรมเดิม')
        return
      }
      setGeneratedWorkout(enhanced)
    } catch (err) {
      console.error('AI workout enhance request failed', err)
      setAiWorkoutError('ให้ AI ปรุงแต่งโปรแกรมไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
    } finally {
      setAiWorkoutLoading(false)
    }
  }

  function handleStartGeneratedWorkout() {
    if (!generatedWorkout) return
    const stored: StoredGeneratedSession = {
      muscleGroup: generatedWorkout.muscleGroup,
      title: `เล่น${generatedWorkout.muscleGroup} (AI Coach)`,
      createdAt: new Date().toISOString(),
      exercises: toAdhocProgramExercises(generatedWorkout),
    }
    // sessionStorage เท่านั้น (ไม่เขียนลง DB) — /session อ่านค่านี้ตอนโหลดถ้า ?source=generated
    sessionStorage.setItem(GENERATED_SESSION_STORAGE_KEY, JSON.stringify(stored))
    router.push('/session?source=generated')
  }

  return (
    <div className="space-y-5 lg:max-w-2xl lg:mx-auto">
      <div>
        <h1 className="font-display text-2xl tracked uppercase">AI Coach</h1>
        <p className="text-xs text-muted mt-0.5">
          วิเคราะห์จากประวัติการฝึกของคุณ — สมดุลกล้ามเนื้อ, Progressive Overload และ Recovery ไม่ใช่คำแนะนำทางการแพทย์
        </p>
      </div>

      {error ? (
        <ErrorState title="โหลด AI Coach ไม่สำเร็จ" message={error} onRetry={load} />
      ) : loading ? (
        // v52: ฟีดแบ็ก "หน้าอื่นควรอิงภาษาเดียวกับ Dashboard" — เดิม rounded-lg (8px) ไม่ตรงกับ
        // PremiumCard ที่ตัว skeleton นี้จำลอง (rounded-card, 24px) เปลี่ยนให้ตรงกัน กันไม่ให้กระตุก
        // ตอนสลับจาก skeleton เป็นการ์ดจริง
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-32 w-full rounded-card" />
          <Skeleton className="h-40 w-full rounded-card" />
        </div>
      ) : data ? (
        <>
          <PremiumCard className="px-4 py-3.5 space-y-3">
            <div className="flex items-start gap-2.5">
              <span className="text-lg leading-none shrink-0">✨</span>
              <div className="min-w-0">
                <p className="text-sm text-ink whitespace-pre-line">{data.dailySummary}</p>
                {/* ฟีดแบ็ก "AI Coach ควรกลายเป็น Decision Engine ที่มีเหตุผล ไม่ใช่แค่ Widget" — โชว์
                    recovery % ของกลุ่มกล้ามเนื้อที่เกี่ยวข้องทั้งหมดเป็น bullet แทนที่จะให้ dailySummary
                    ประโยคเดียวพูดแทนทุกอย่าง ให้ผู้ใช้เห็นเหตุผลจริงเบื้องหลังคำแนะนำ */}
                {/* ฟีดแบ็ก (จากรอบตรวจ Recovery, "Typography") "ไม่ลดต่ำกว่า 12px สำหรับข้อความรอง" — หน้านี้
                    เขียนก่อนกฎนี้ถูกยึดเป็นมาตรฐาน (9px/10px/11px หลายจุดในหน้านี้) ปรับให้ตรงมาตรฐานเดียวกับ
                    Dashboard/Recovery ที่แก้ไปแล้ว */}
                {data.reasoningGroups.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    <p className="text-[12px] tracked uppercase text-muted">เหตุผล</p>
                    {data.reasoningGroups.map((g) => {
                      const tier = recoveryTier(g.pct)
                      return (
                        <p key={g.muscleGroup} className="text-[12px]" style={{ color: tier.color }}>
                          {recoveryVerdictEmoji(g.pct)} {g.muscleGroup} ฟื้นตัวแล้ว {g.pct}%
                        </p>
                      )
                    })}
                    {/* ฟีดแบ็ก (จากรอบตรวจ Dashboard/Recovery, "Terminology") "Volume ทั้งที่ metric จริงคือ
                        จำนวนเซ็ต" — ตัดคำว่า Volume ออก ตรงหลักเดียวกับที่แก้ไปแล้วบน Dashboard/Recovery */}
                    {data.muscleRecommendation?.scheduleOverriddenFrom && (
                      <p className="text-[12px]" style={{ color: COLORS.rust }}>
                        🔴 {data.muscleRecommendation.scheduleOverriddenFrom} ยังฝึกเกินเป้าหมาย
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {data.muscleRecommendation && (
              <div className="border-t border-white/5 pt-3 space-y-2.5">
                {!generatedWorkout ? (
                  <button
                    type="button"
                    onClick={handleGenerateWorkout}
                    className="text-xs font-display tracked uppercase text-amber border border-amber/40 rounded-lg px-3 py-2 active:scale-[0.99] transition"
                  >
                    🏋️ สร้างโปรแกรม{data.muscleRecommendation.muscleGroup}
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    {generatedWorkout.source === 'ai' && (
                      <p className="text-[12px] font-display tracked uppercase text-violet">🔮 ปรุงแต่งโดย Gemini</p>
                    )}
                    <ul className="space-y-1.5">
                      {generatedWorkout.exercises.map((g, i) => (
                        <li key={g.exerciseDef.id} className="text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-ink min-w-0 truncate">
                              {g.exerciseDef.icon} {g.exerciseDef.name}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono text-muted">
                                {g.sets}×{g.targetReps}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleSwapExercise(i)}
                                title="สลับท่านี้ (เช่น ยิมไม่มีอุปกรณ์นี้)"
                                className="text-[12px] text-muted hover:text-amber active:scale-[0.99] transition"
                              >
                                🔄
                              </button>
                            </div>
                          </div>
                          {g.rationale && <p className="text-[12px] text-violet/80 mt-0.5">{g.rationale}</p>}
                        </li>
                      ))}
                    </ul>
                    {swapError && <p className="text-[12px] text-rusttext">{swapError}</p>}
                    {/* v52: ฟีดแบ็ก "หน้าอื่นควรอิงภาษาเดียวกับ Dashboard" — เดิม bg-amber เรียบๆ
                        ไม่มี glow เปลี่ยนมาใช้ Button component กลาง (Phase 2) */}
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={handleStartGeneratedWorkout}>
                        ▶ Start Workout
                      </Button>
                      {generatedWorkout.source === 'rule' && (
                        <button
                          type="button"
                          onClick={handleEnhanceWithAi}
                          disabled={aiWorkoutLoading}
                          className="text-xs font-display tracked uppercase text-violet border border-violet/40 rounded-lg px-3 py-2 active:scale-[0.99] transition disabled:opacity-50"
                        >
                          {aiWorkoutLoading ? 'กำลังปรุงแต่ง...' : '🔮 ให้ AI ปรุงแต่งท่า'}
                        </button>
                      )}
                    </div>
                    {aiWorkoutError && <p className="text-[12px] text-rusttext">{aiWorkoutError}</p>}
                  </div>
                )}
              </div>
            )}

            {aiMessage ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-violet/25 bg-violetdim/30 px-3 py-3">
                <span className="text-base leading-none shrink-0">🔮</span>
                <div className="min-w-0">
                  <p className="text-[12px] font-display tracked uppercase text-violet mb-1">Gemini Insight</p>
                  <p className="text-sm text-ink whitespace-pre-line">{aiMessage}</p>
                </div>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={requestAiInsight}
                  disabled={aiLoading}
                  className="text-xs font-display tracked uppercase text-violet border border-violet/40 rounded-lg px-3 py-2 active:scale-[0.99] transition disabled:opacity-50"
                >
                  {aiLoading ? 'กำลังวิเคราะห์...' : '🔮 ขอคำแนะนำเชิงลึกจาก AI'}
                </button>
                {aiError && <p className="text-[12px] text-rusttext mt-2">{aiError}</p>}
              </div>
            )}
          </PremiumCard>

          {data.deloadWarning && <InsightCard insight={data.deloadWarning} />}
          {data.skippedInsight && <InsightCard insight={data.skippedInsight} />}

          <section className="space-y-2.5">
            <h2 className="font-display text-sm tracked uppercase text-muted">สมดุล Push / Pull</h2>
            <PremiumCard className="px-4 py-3.5 space-y-3">
              {(() => {
                const maxSets = Math.max(data.balance.pushSets, data.balance.pullSets, 1)
                const pushPct = Math.round((data.balance.pushSets / maxSets) * 100)
                const pullPct = Math.round((data.balance.pullSets / maxSets) * 100)
                return (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Push (อก/ไหล่)</span>
                      <span className="font-mono text-ink">{data.balance.pushSets} เซ็ต</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-surface2 overflow-hidden">
                      <AnimatedBarFill pct={pushPct} color={COLORS.rust} />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Pull (หลัง)</span>
                      <span className="font-mono text-ink">{data.balance.pullSets} เซ็ต</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-surface2 overflow-hidden">
                      <AnimatedBarFill pct={pullPct} color={COLORS.steel} />
                    </div>
                  </>
                )
              })()}
              <p className="text-[12px] text-muted pt-1">
                {data.balance.status === 'insufficient_data'
                  ? 'ยังมีข้อมูลสัปดาห์นี้ไม่พอให้วิเคราะห์สมดุล'
                  : data.balance.status === 'balanced'
                    ? 'สมดุลดีในสัปดาห์นี้'
                    : `อัตราส่วน Push:Pull ≈ ${data.balance.ratio}:1`}
              </p>
            </PremiumCard>
            {data.balanceInsights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </section>

          <section className="space-y-2.5">
            <h2 className="font-display text-sm tracked uppercase text-muted">Progressive Overload</h2>
            {data.overloadPlans.length === 0 ? (
              <PremiumCard className="px-4 py-3.5">
                <p className="text-[12px] text-muted">
                  ยังไม่มีประวัติพอให้แนะนำ —{' '}
                  <a href="/log" className="text-amber hover:underline">
                    บันทึกเซ็ตแรก
                  </a>
                </p>
              </PremiumCard>
            ) : (
              data.overloadPlans.map((plan) => {
                const action = ACTION_LABEL[plan.action]
                return (
                  <PremiumCard
                    as="a"
                    key={plan.exerciseName}
                    href={`/exercises/${encodeURIComponent(plan.exerciseName)}`}
                    className="block px-4 py-3.5 active:bg-surface2 transition"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="font-display text-base tracked uppercase text-ink">{plan.exerciseName}</p>
                      <span className={`text-[12px] tracked uppercase font-display ${action.color}`}>{action.text}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-2">
                      <div>
                        <p className="text-[12px] tracked uppercase text-muted">Current</p>
                        <p className="font-mono text-base text-muted">
                          {format(plan.currentWeight)} × {plan.currentReps}
                        </p>
                      </div>
                      <div>
                        <p className="text-[12px] tracked uppercase text-muted">Target</p>
                        <p className={`font-mono text-base ${action.color}`}>
                          {format(plan.targetWeight)} × {plan.targetReps}
                        </p>
                      </div>
                    </div>
                    <p className="text-[12px] text-muted">{plan.rationale}</p>
                  </PremiumCard>
                )
              })
            )}
          </section>

          <a href="/recovery" className="block text-center text-xs tracked uppercase text-muted hover:text-amber transition py-2">
            ดู Recovery รายกลุ่มกล้ามเนื้อแบบเต็ม →
          </a>
        </>
      ) : null}
    </div>
  )
}

