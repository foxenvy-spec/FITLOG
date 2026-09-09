'use client'

// Workout Report (MVP) — ส่วนหัวของ /stats ที่รวม Workout/Consistency/Body/Coach เป็นเรื่องเดียวกัน
// แทนสถิติเรียงกันเฉยๆ (ฟีดแบ็ก "ควรตอบ: ทำอะไรไป / สม่ำเสมอแค่ไหน / ร่างกายตอบสนองยังไง / ทำอะไรต่อ")
// — สโคป 7D/30D เท่านั้นตามที่ล็อกไว้ (ไม่ทำ 90D/1Y, ไม่ทำ Muscle Distribution/Recovery แยก section,
// ไม่ทำกราฟหลายตัว, ไม่เพิ่ม nav ใหม่) ตัวเลือกช่วงเวลาเป็น state ของตัวเองแยกจาก timeframe selector
// เดิมของทั้งหน้า /stats (30/90/180/365/all) — pattern เดียวกับที่ BodyMetricsRow.tsx มี selector
// 7D/30D/90D/All ของตัวเองแยกจาก Dashboard อยู่แล้ว — ดึงข้อมูลของตัวเองต่างหาก (ไม่ใช้ workouts ที่
// /stats/page.tsx โหลดไว้แล้ว) กัน Report พึ่งพา timeframe selector เดิมของหน้าโดยไม่ตั้งใจ (ถ้าผู้ใช้
// เลือกหน้าเป็น "30 วัน" ตัวเลือก 30D ของ Report ยังต้องถูกต้องเหมือนเดิมไม่ว่าอย่างไร)
import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import type { Workout, ProgramDay } from '@/lib/types'
import { todayStr, daysAgoStr } from '@/lib/weekdays'
import { computePlannedConsistency } from '@/lib/dashboardStats'
import { computeBodyMetricsSummary, type BodyMetricsSummary } from '@/lib/bodyMetricsSummary'
import {
  computePeriodTotals,
  computePctChange,
  buildTrainedDayEntries,
  computeDailyVolumes,
  computeWeeklyVolumesWithLabels,
  composeReportSummary,
} from '@/lib/workoutReport'
import { fetchBodyMetricsData } from '@/components/BodyMetricsRow'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import PremiumCard from '@/components/ui/PremiumCard'
import { COLORS, NEUTRAL, withAlpha } from '@/lib/theme'
import { getErrorMessage } from '@/lib/errors'

type ReportPeriod = 7 | 30
const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: 7, label: '7D' },
  { value: 30, label: '30D' },
]

const THAI_WEEKDAY_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

export default function WorkoutReportSection() {
  const supabase = createClient()
  const { unit, toDisplay, format } = useWeightUnit()
  const [period, setPeriod] = useState<ReportPeriod>(7)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [programDays, setProgramDays] = useState<Pick<ProgramDay, 'id' | 'day_of_week'>[]>([])
  const [bodyMetricsInput, setBodyMetricsInput] = useState<Awaited<ReturnType<typeof fetchBodyMetricsData>>>({
    metrics: [],
    heightCm: null,
    goals: [],
  })

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
    })()
    return () => {
      cancelled = true
    }
  }, [period, supabase])

  const report = useMemo(() => {
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

    const bodySummary: BodyMetricsSummary = computeBodyMetricsSummary(bodyMetricsInput.metrics, bodyMetricsInput.heightCm, period)

    const volumeDeltaPct = computePctChange(currentTotals.totalVolumeKg, previousTotals.totalVolumeKg)
    const summary = composeReportSummary({
      workoutCount: currentTotals.workoutCount,
      workoutCountDeltaPct: computePctChange(currentTotals.workoutCount, previousTotals.workoutCount),
      consistencyPct: consistency.pct,
      volumeDeltaPct,
      weightDelta: bodySummary.weight,
      bodyFatDelta: bodySummary.bodyFatPct,
      periodLabel: period === 7 ? '7 วันที่ผ่านมา' : '30 วันที่ผ่านมา',
    })

    return {
      currentTotals,
      previousTotals,
      volumeDeltaPct,
      durationDeltaPct: computePctChange(currentTotals.totalDurationMin, previousTotals.totalDurationMin),
      setsDeltaPct: computePctChange(currentTotals.totalSets, previousTotals.totalSets),
      workoutCountDeltaPct: computePctChange(currentTotals.workoutCount, previousTotals.workoutCount),
      consistency,
      trendPoints,
      bodySummary,
      summary,
    }
  }, [workouts, programDays, bodyMetricsInput, period])

  if (loading && workouts.length === 0) {
    return (
      <PremiumCard className="p-4 animate-pulse">
        <div className="h-4 w-32 rounded bg-white/5" />
        <div className="h-24 mt-3 rounded bg-white/5" />
      </PremiumCard>
    )
  }

  if (error) {
    return (
      <PremiumCard className="p-4">
        <p className="text-sm text-rusttext">โหลด Workout Report ไม่สำเร็จ: {error}</p>
      </PremiumCard>
    )
  }

  const periodLabel = period === 7 ? '7 วันที่ผ่านมา' : '30 วันที่ผ่านมา'

  return (
    <PremiumCard className="p-4 space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display text-sm tracked uppercase text-muted">Workout Report</h2>
        <div className="shrink-0 flex items-center gap-0.5 rounded-full border border-line bg-surface2 p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriod(opt.value)}
              className="px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors"
              style={period === opt.value ? { backgroundColor: withAlpha(COLORS.amber, '22'), color: COLORS.amber } : { color: NEUTRAL.mutedIcon }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. Workout Summary */}
      <div>
        <p className="text-[12px] tracked uppercase text-muted mb-2">Workout Summary · {periodLabel}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SummaryTile label="Workouts" value={report.currentTotals.workoutCount} unit="ครั้ง" deltaPct={report.workoutCountDeltaPct} accent={COLORS.amber} />
          <SummaryTile
            label="Duration"
            value={Math.round(report.currentTotals.totalDurationMin)}
            unit="นาที"
            deltaPct={report.durationDeltaPct}
            accent={COLORS.steel}
          />
          <SummaryTile
            label="Volume"
            value={Math.round(toDisplay(report.currentTotals.totalVolumeKg))}
            unit={unit}
            deltaPct={report.volumeDeltaPct}
            accent={COLORS.moss}
          />
          <SummaryTile label="Sets" value={report.currentTotals.totalSets} unit="เซ็ต" deltaPct={report.setsDeltaPct} accent={COLORS.violet} />
        </div>
      </div>

      {/* 2. Consistency */}
      <div>
        <p className="text-[12px] tracked uppercase text-muted mb-2">Consistency</p>
        {report.consistency.pct === null ? (
          <p className="text-sm text-muted">ยังไม่ได้ตั้งโปรแกรมประจำสัปดาห์ — ตั้งได้ที่หน้าโปรแกรม</p>
        ) : (
          <PremiumCard className="p-3">
            <div className="flex items-baseline justify-between">
              <p className="font-mono font-bold text-2xl text-ink">{report.consistency.pct}%</p>
              <p className="text-[12px] text-muted">
                ทำตามแผน {report.consistency.completedCount} / {report.consistency.plannedCount} วัน
              </p>
            </div>
            <div className="h-2 mt-2 rounded-full overflow-hidden" style={{ background: NEUTRAL.chipInactive }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, report.consistency.pct)}%`, background: COLORS.amber }}
              />
            </div>
          </PremiumCard>
        )}
      </div>

      {/* 3. Training Trend (Volume เท่านั้นตามที่ล็อกไว้) */}
      <div>
        <p className="text-[12px] tracked uppercase text-muted mb-2">
          Training Trend · Volume ({period === 7 ? 'รายวัน' : 'รายสัปดาห์'})
        </p>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.trendPoints.map((p) => ({ ...p, value: Math.round(toDisplay(p.value)) }))} margin={{ top: 4, right: 4, left: -4, bottom: 0 }}>
              <CartesianGrid stroke={NEUTRAL.chipInactive} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: NEUTRAL.mutedIcon, fontSize: 10 }} axisLine={{ stroke: NEUTRAL.chipInactive }} tickLine={false} />
              <YAxis
                tick={{ fill: NEUTRAL.mutedIcon, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${v}`)}
              />
              <Tooltip
                cursor={{ fill: 'rgba(108,140,168,0.08)' }}
                contentStyle={{ background: '#1C1F24', border: `1px solid ${NEUTRAL.chipInactive}`, borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: NEUTRAL.mutedIcon }}
                itemStyle={{ color: '#F3F0E8' }}
                formatter={(v: number) => [`${v} ${unit}`, 'วอลุ่ม']}
              />
              <Bar dataKey="value" fill={COLORS.steel} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Body Progress — เปรียบเทียบต้นช่วง -> ปัจจุบัน ใช้ computeBodyMetricsSummary ตรงๆ ไม่คิด metric ใหม่ */}
      <div>
        <p className="text-[12px] tracked uppercase text-muted mb-2">Body Progress</p>
        <div className="space-y-2">
          <BodyProgressRow label="น้ำหนัก" delta={report.bodySummary.weight} unit={unit} format={format} />
          <BodyProgressRow label="ไขมัน" delta={report.bodySummary.bodyFatPct} unit="%" decimals={1} />
          <BodyProgressRow label="กล้ามเนื้อ" delta={report.bodySummary.skeletalMuscleKg} unit={unit} format={format} />
        </div>
      </div>

      {/* 5. MINT Summary — 1 ประโยคตีความ + 1 next-step เท่านั้น ไม่ใช่ chat/AI dashboard ใหม่ */}
      <PremiumCard className="p-3.5" style={{ background: withAlpha(COLORS.violet, '0d'), border: `1px solid ${withAlpha(COLORS.violet, '30')}` }}>
        <p className="text-[11px] font-display tracked uppercase" style={{ color: COLORS.violet }}>
          ✨ MINT Summary
        </p>
        <p className="text-sm text-ink mt-1.5 font-medium">{report.summary.interpretation}</p>
        <p className="text-[12px] text-muted mt-1">{report.summary.nextStep}</p>
      </PremiumCard>
    </PremiumCard>
  )
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null || pct === 0) return null
  const color = pct > 0 ? COLORS.moss : COLORS.rust
  return (
    <span className="text-[11px] font-mono font-semibold" style={{ color }}>
      {pct > 0 ? '↑' : '↓'} {Math.abs(pct)}%
    </span>
  )
}

function SummaryTile({
  label,
  value,
  unit,
  deltaPct,
  accent,
}: {
  label: string
  value: number
  unit: string
  deltaPct: number | null
  accent: string
}) {
  return (
    <div className="border shadow-glow rounded-card px-3 py-2.5" style={{ borderColor: withAlpha(accent, '33'), backgroundColor: '#1C1F24' }}>
      <p className="text-[11px] tracked uppercase text-muted">{label}</p>
      <p className="font-mono text-lg text-ink mt-0.5">
        {value.toLocaleString()} <span className="text-[11px] text-muted">{unit}</span>
      </p>
      <div className="mt-0.5 h-3.5">
        <DeltaBadge pct={deltaPct} />
      </div>
    </div>
  )
}

function BodyProgressRow({
  label,
  delta,
  unit,
  decimals = 1,
  format,
}: {
  label: string
  delta: { value: number | null; delta: number | null; isGood: boolean | null }
  unit: string
  decimals?: number
  format?: (kg: number | null | undefined, decimals?: number) => string
}) {
  if (delta.value === null) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="text-muted">— ยังไม่มีข้อมูล</span>
      </div>
    )
  }
  const startValue = delta.delta !== null ? delta.value - delta.delta : null
  const displayValue = (v: number) => (format ? format(v, decimals) : v.toFixed(decimals))
  const color = delta.isGood === null ? NEUTRAL.mutedIcon : delta.isGood ? COLORS.moss : COLORS.rust
  return (
    <div className="flex items-center justify-between text-sm gap-2 flex-wrap">
      <span className="text-muted shrink-0">{label}</span>
      <span className="font-mono text-ink text-right">
        {startValue !== null ? (
          <>
            {displayValue(startValue)} → {displayValue(delta.value)} {unit}
          </>
        ) : (
          <>
            {displayValue(delta.value)} {unit}
          </>
        )}
        {delta.delta !== null && (
          <span className="ml-1.5 font-semibold" style={{ color }}>
            {delta.delta > 0 ? '↑' : delta.delta < 0 ? '↓' : ''} {Math.abs(delta.delta).toFixed(decimals)}
          </span>
        )}
      </span>
    </div>
  )
}
