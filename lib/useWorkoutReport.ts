'use client'

// Data/compute layer เดียวของ Workout Report — ใช้ร่วมกันไม่ว่า UI จะอยู่หน้าไหน (ตอนนี้คือ
// app/(app)/stats/report/page.tsx) กันปัญหา "แก้ Consistency/Training Trend แล้วตัวเลขสองชุดไม่ตรงกัน"
// ถ้ามีใครเผลอ implement ซ้ำอีกจุด — คำนวณจริงทั้งหมดยังอยู่ใน lib/workoutReport.ts (pure functions)
// ไฟล์นี้แค่ orchestrate การดึงข้อมูล + ประกอบผลลัพธ์เป็นก้อนเดียวให้ UI ใช้
import { useEffect, useMemo, useState } from 'react'
import { createClient } from './supabase/client'
import type { Workout, ProgramDay } from './types'
import { todayStr, daysAgoStr } from './weekdays'
import { computePlannedConsistency, computeCurrentStreak, type PlannedConsistency } from './dashboardStats'
import { computeBodyMetricsSummary, type BodyMetricsSummary } from './bodyMetricsSummary'
import {
  computePeriodTotals,
  computePctChange,
  buildTrainedDayEntries,
  computeDailyVolumes,
  computeWeeklyVolumesWithLabels,
  composeReportSummary,
  findPeakTrendPoint,
  type PeriodTotals,
  type ReportSummary,
  type TrendPoint,
} from './workoutReport'
import { goalProgressPct } from './goalProgress'
import { fetchBodyMetricsData } from '@/components/BodyMetricsRow'
import { getErrorMessage } from './errors'

export type ReportPeriod = 7 | 30

const THAI_WEEKDAY_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

// เท่ากับ STREAK_LOOKBACK_DAYS ใน app/(app)/train/page.tsx เป๊ะ (ค่าเดียวกับ STREAK_WALK_MAX_DAYS ใน
// lib/dashboardStats.ts) — ต้อง query ย้อนหลังไกลกว่าหน้าต่างข้อมูลของ period comparison ปกติมาก เพราะ
// streak จริงอาจยาวกว่า 7/30 วัน การใช้ workouts ที่ fetch มาสำหรับคำนวณ totals อยู่แล้ว (แค่ period*2-1
// วัน) จะได้ตัวเลข streak ที่นับต่ำกว่าความจริงถ้า streak ยาวกว่านั้น — fetch แยกเบาๆ (คอลัมน์เดียว) แทน
const STREAK_LOOKBACK_DAYS = 400

export interface GoalProgressDetail {
  targetValue: number
  progressPct: number | null
}

export interface WorkoutReportData {
  currentTotals: PeriodTotals
  previousTotals: PeriodTotals
  workoutCountDeltaPct: number | null
  durationDeltaPct: number | null
  volumeDeltaPct: number | null
  setsDeltaPct: number | null
  consistency: PlannedConsistency
  // สายโซ่ต่อเนื่องปัจจุบัน (computeCurrentStreak เดียวกับ Dashboard/train page) — ไม่ผูกกับ period ที่
  // เลือกอยู่ เพราะเป็นสายโซ่ "ตอนนี้" เสมอ เหมือนที่อื่นในแอปทุกจุด
  currentStreak: number
  // รายวันของช่วง period (ล่าสุด 5 วัน) สำหรับวาดจุด adherence ใต้โดนัท Consistency — แพ็ค dayEntries ที่
  // คำนวณให้ computePlannedConsistency อยู่แล้วเข้ากับ plannedWeekdays มาให้ใช้ตรงๆ ไม่ใช่ query/สูตรใหม่
  consistencyDays: { dayOfWeek: number; hasWorkout: boolean; planned: boolean }[]
  trendPoints: TrendPoint[]
  trendPeak: TrendPoint | null
  bodySummary: BodyMetricsSummary
  // เฉพาะ weight/bodyFat (ตาราง goals รองรับแค่ goal_type สองแบบนี้ — เหมือน BodyMetricsRow.tsx/หน้า
  // /health ทุกจุด) — muscle ไม่มี goal ให้ใช้จริง จึงไม่มี field นี้ ไม่ใช่แค่ null เฉยๆ
  goalProgress: {
    weight: GoalProgressDetail | null
    bodyFatPct: GoalProgressDetail | null
  }
  summary: ReportSummary
}

export function reportPeriodLabel(period: ReportPeriod): string {
  return period === 7 ? '7 วันที่ผ่านมา' : '30 วันที่ผ่านมา'
}

// ช่วงวันที่จริงของ period ปัจจุบัน (สำหรับหัวรายงาน "16-22 ส.ค. 2569") — แยกจาก periodLabel (ข้อความ
// สื่อความหมาย) เพราะหัวรายงานต้องการวันที่จริงเพื่อความน่าเชื่อถือของ "รายงาน" ที่ export/พิมพ์ออกไปได้
export function reportDateRange(period: ReportPeriod): { startIso: string; endIso: string } {
  return { startIso: daysAgoStr(period - 1), endIso: todayStr() }
}

export function useWorkoutReport(period: ReportPeriod) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [programDays, setProgramDays] = useState<Pick<ProgramDay, 'id' | 'day_of_week'>[]>([])
  const [streakDates, setStreakDates] = useState<string[]>([])
  const [bodyMetricsInput, setBodyMetricsInput] = useState<Awaited<ReturnType<typeof fetchBodyMetricsData>>>({
    metrics: [],
    heightCm: null,
    goals: [],
  })
  // นับรอบให้กด "ลองใหม่" ของ ErrorState เรียกโหลดซ้ำได้ (ErrorState.onRetry ต้องการ callback ที่ trigger
  // การโหลดจริง — เปลี่ยน period อย่างเดียวไม่พอเพราะผู้ใช้อาจกดลองใหม่โดยไม่เปลี่ยน period เลย)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        // เผื่อทั้งช่วงปัจจุบัน + ช่วงก่อนหน้าความยาวเท่ากันสำหรับเทียบ %-change (period*2-1 วันย้อนหลัง)
        const since = daysAgoStr(period * 2 - 1)
        const streakSince = daysAgoStr(STREAK_LOOKBACK_DAYS)
        const [workoutsRes, daysRes, bodyData, streakRes] = await Promise.all([
          supabase.from('workouts').select('*').gte('performed_at', since).order('performed_at', { ascending: true }),
          supabase.from('program_days').select('id, day_of_week'),
          fetchBodyMetricsData(supabase),
          // คอลัมน์เดียว (performed_at) ย้อนหลัง 400 วัน — เบากว่า workouts เต็มแถวมาก ใช้แค่คำนวณ current
          // streak เท่านั้น (เหมือน app/(app)/train/page.tsx ทุกประการ กันตัวเลขสองชุดไม่ตรงกัน)
          supabase.from('workouts').select('performed_at').gte('performed_at', streakSince),
        ])
        if (cancelled) return
        if (workoutsRes.error) throw new Error(workoutsRes.error.message)
        if (daysRes.error) throw new Error(daysRes.error.message)
        if (streakRes.error) throw new Error(streakRes.error.message)
        setWorkouts((workoutsRes.data as Workout[]) ?? [])
        setProgramDays((daysRes.data as Pick<ProgramDay, 'id' | 'day_of_week'>[]) ?? [])
        setBodyMetricsInput(bodyData)
        setStreakDates(Array.from(new Set(((streakRes.data as { performed_at: string }[]) ?? []).map((r) => r.performed_at))))
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })()
    return () => {
      cancelled = true
    }
  }, [period, retryCount, supabase])

  const report = useMemo<WorkoutReportData>(() => {
    const today = todayStr()
    const currentStart = daysAgoStr(period - 1)
    const previousStart = daysAgoStr(period * 2 - 1)
    const currentWorkouts = workouts.filter((w) => w.performed_at >= currentStart)
    const previousWorkouts = workouts.filter((w) => w.performed_at >= previousStart && w.performed_at < currentStart)

    const currentTotals = computePeriodTotals(currentWorkouts)
    const previousTotals = computePeriodTotals(previousWorkouts)

    const trainedDateSet = new Set(workouts.map((w) => w.performed_at))
    const plannedWeekdays = new Set(programDays.map((d) => d.day_of_week))
    const dayEntries = buildTrainedDayEntries(trainedDateSet, period, today)
    const consistency = computePlannedConsistency(dayEntries, plannedWeekdays)
    const currentStreak = computeCurrentStreak(streakDates, plannedWeekdays)
    // เอาแค่ 5 วันล่าสุด (ตัวโดนัทเล็ก ใส่จุดเกิน 7 จุดจะแน่นเกิน) — dayEntries เรียงเก่า->ใหม่อยู่แล้ว
    const consistencyDays = dayEntries
      .slice(-5)
      .map((d) => ({ dayOfWeek: d.dayOfWeek, hasWorkout: d.hasWorkout, planned: plannedWeekdays.has(d.dayOfWeek) }))

    // 7D -> รายวัน, 30D -> รายสัปดาห์ (ตามที่ล็อกไว้) — ส่ง workouts เต็ม (ไม่ใช่ currentWorkouts ที่ตัด
    // ไว้แล้ว) เพราะทั้งสองฟังก์ชันสร้าง bucket วันที่/สัปดาห์ของตัวเองแล้วกรองตรงกับ bucket เท่านั้นอยู่แล้ว
    const dailyTrend = period === 7 ? computeDailyVolumes(workouts, 7) : []
    const weeklyTrend = period === 30 ? computeWeeklyVolumesWithLabels(workouts, Math.ceil(period / 7)) : []
    const trendPoints =
      period === 7
        ? dailyTrend.map((p) => ({
            label: THAI_WEEKDAY_SHORT[new Date(`${p.date}T00:00:00Z`).getUTCDay()],
            value: p.value,
          }))
        : weeklyTrend

    const bodySummary = computeBodyMetricsSummary(bodyMetricsInput.metrics, bodyMetricsInput.heightCm, period)

    // Goal Progress (Body Progress section) — reuse ของเดิมจาก BodyMetricsRow.tsx/lib/goalProgress.ts
    // เป๊ะ (ตาราง goals รองรับแค่ weight/body_fat, ใช้ earliest tracked value แทน starting_value แช่แข็ง
    // เพื่อให้ % คืบหน้าเรียลไทม์ตาม v62 — ดูคอมเมนต์เดิมใน goalProgress.ts) ไม่คิดสูตรใหม่
    const chronologicalMetrics = [...bodyMetricsInput.metrics].reverse()
    const weightGoal = bodyMetricsInput.goals.find((g) => g.goal_type === 'weight')
    const bodyFatGoal = bodyMetricsInput.goals.find((g) => g.goal_type === 'body_fat')
    const earliestWeight = chronologicalMetrics.find((m) => m.weight_kg != null)?.weight_kg ?? null
    const earliestBodyFat = chronologicalMetrics.find((m) => m.body_fat_pct != null)?.body_fat_pct ?? null
    const goalProgress = {
      weight:
        weightGoal?.target_value != null
          ? { targetValue: weightGoal.target_value, progressPct: goalProgressPct(weightGoal, bodySummary.weight.value, earliestWeight) }
          : null,
      bodyFatPct:
        bodyFatGoal?.target_value != null
          ? { targetValue: bodyFatGoal.target_value, progressPct: goalProgressPct(bodyFatGoal, bodySummary.bodyFatPct.value, earliestBodyFat) }
          : null,
    }

    const trendPeak = findPeakTrendPoint(trendPoints)

    const volumeDeltaPct = computePctChange(currentTotals.totalVolumeKg, previousTotals.totalVolumeKg)
    const summary = composeReportSummary({
      workoutCount: currentTotals.workoutCount,
      workoutCountDeltaPct: computePctChange(currentTotals.workoutCount, previousTotals.workoutCount),
      consistencyPct: consistency.pct,
      volumeDeltaPct,
      weightDelta: bodySummary.weight,
      bodyFatDelta: bodySummary.bodyFatPct,
      periodLabel: reportPeriodLabel(period),
    })

    return {
      currentTotals,
      previousTotals,
      workoutCountDeltaPct: computePctChange(currentTotals.workoutCount, previousTotals.workoutCount),
      durationDeltaPct: computePctChange(currentTotals.totalDurationMin, previousTotals.totalDurationMin),
      volumeDeltaPct,
      setsDeltaPct: computePctChange(currentTotals.totalSets, previousTotals.totalSets),
      consistency,
      currentStreak,
      consistencyDays,
      trendPoints,
      trendPeak,
      bodySummary,
      goalProgress,
      summary,
    }
  }, [workouts, programDays, bodyMetricsInput, streakDates, period])

  return {
    loading: loading && workouts.length === 0,
    error,
    report,
    retry: () => setRetryCount((c) => c + 1),
  }
}
