'use client'

// Data/compute layer เดียวของ Workout Report — ใช้ร่วมกันไม่ว่า UI จะอยู่หน้าไหน (ตอนนี้คือ
// app/(app)/stats/report/page.tsx) กันปัญหา "แก้ Consistency/Training Trend แล้วตัวเลขสองชุดไม่ตรงกัน"
// ถ้ามีใครเผลอ implement ซ้ำอีกจุด — คำนวณจริงทั้งหมดยังอยู่ใน lib/workoutReport.ts (pure functions)
// ไฟล์นี้แค่ orchestrate การดึงข้อมูล + ประกอบผลลัพธ์เป็นก้อนเดียวให้ UI ใช้
import { useEffect, useMemo, useState } from 'react'
import { createClient } from './supabase/client'
import type { Workout, ProgramDay } from './types'
import { todayStr, daysAgoStr } from './weekdays'
import { computePlannedConsistency, type PlannedConsistency } from './dashboardStats'
import { computeBodyMetricsSummary, type BodyMetricsSummary } from './bodyMetricsSummary'
import {
  computePeriodTotals,
  computePctChange,
  buildTrainedDayEntries,
  computeDailyVolumes,
  computeWeeklyVolumesWithLabels,
  composeReportSummary,
  type PeriodTotals,
  type ReportSummary,
} from './workoutReport'
import { fetchBodyMetricsData } from '@/components/BodyMetricsRow'
import { getErrorMessage } from './errors'

export type ReportPeriod = 7 | 30

const THAI_WEEKDAY_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

export interface WorkoutReportData {
  currentTotals: PeriodTotals
  previousTotals: PeriodTotals
  workoutCountDeltaPct: number | null
  durationDeltaPct: number | null
  volumeDeltaPct: number | null
  setsDeltaPct: number | null
  consistency: PlannedConsistency
  trendPoints: { label: string; value: number }[]
  bodySummary: BodyMetricsSummary
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
        const [workoutsRes, daysRes, bodyData] = await Promise.all([
          supabase.from('workouts').select('*').gte('performed_at', since).order('performed_at', { ascending: true }),
          supabase.from('program_days').select('id, day_of_week'),
          fetchBodyMetricsData(supabase),
        ])
        if (cancelled) return
        if (workoutsRes.error) throw new Error(workoutsRes.error.message)
        if (daysRes.error) throw new Error(daysRes.error.message)
        setWorkouts((workoutsRes.data as Workout[]) ?? [])
        setProgramDays((daysRes.data as Pick<ProgramDay, 'id' | 'day_of_week'>[]) ?? [])
        setBodyMetricsInput(bodyData)
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
      trendPoints,
      bodySummary,
      summary,
    }
  }, [workouts, programDays, bodyMetricsInput, period])

  return {
    loading: loading && workouts.length === 0,
    error,
    report,
    retry: () => setRetryCount((c) => c + 1),
  }
}
