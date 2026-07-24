'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { BodyMetric, Profile } from '@/lib/types'
import { computeBodyMetricsSummary, bmiCategory, bmiCategoryColor } from '@/lib/bodyMetricsSummary'
import { useWeightUnit } from './WeightUnitProvider'
import Skeleton from './Skeleton'

async function fetchBodyMetricsData(supabase: ReturnType<typeof createClient>) {
  const [{ data: metricsRows }, { data: profileRow }] = await Promise.all([
    // 60 วันย้อนหลังพอสำหรับหา entry ของ ~สัปดาห์ที่แล้วเทียบเสมอ ถึงจะไม่ได้ชั่งทุกวัน
    supabase.from('body_metrics').select('*').order('measured_at', { ascending: false }).limit(30),
    supabase.from('profiles').select('height_cm').maybeSingle(),
  ])
  return {
    metrics: (metricsRows as BodyMetric[]) ?? [],
    heightCm: (profileRow as Pick<Profile, 'height_cm'> | null)?.height_cm ?? null,
  }
}

interface CardDef {
  key: string
  icon: string
  label: string
  valueText: string
  deltaText: string | null
  deltaColor: string
}

function fmtSigned(n: number, decimals: number, suffix: string): string {
  const sign = n > 0 ? '+' : n < 0 ? '' : '±'
  return `${sign}${n.toFixed(decimals)}${suffix}`
}

export default function BodyMetricsRow() {
  const supabase = createClient()
  const { toDisplay, unit } = useWeightUnit()

  const { data, isLoading } = useQuery({
    queryKey: ['body-metrics-summary'],
    queryFn: () => fetchBodyMetricsData(supabase),
    staleTime: 60_000,
  })

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg bg-surface border border-line px-4 py-4">
            <Skeleton className="h-3 w-16 mb-3" />
            <Skeleton className="h-6 w-20 mb-2" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    )
  }

  const { metrics, heightCm } = data

  if (metrics.length === 0) {
    return (
      <a
        href="/health"
        className="flex items-center justify-between gap-3 rounded-lg bg-surface border border-line px-4 py-4 hover:border-amber/40 transition"
      >
        <div>
          <p className="text-sm text-ink">ยังไม่มีข้อมูลสัดส่วนร่างกาย</p>
          <p className="text-[11px] text-muted mt-0.5">
            บันทึกน้ำหนัก/ไขมัน/กล้ามเนื้อครั้งแรกที่หน้าสุขภาพ แล้วการ์ดสรุปจะขึ้นตรงนี้
          </p>
        </div>
        <span className="text-xs text-amber shrink-0">บันทึกเลย →</span>
      </a>
    )
  }

  const summary = computeBodyMetricsSummary(metrics, heightCm)

  const cards: CardDef[] = [
    {
      key: 'weight',
      icon: '⚖️',
      label: 'น้ำหนัก',
      valueText: summary.weight.value != null ? `${toDisplay(summary.weight.value).toFixed(1)} ${unit}` : '—',
      deltaText:
        summary.weight.delta != null ? `${fmtSigned(toDisplay(summary.weight.delta), 1, ` ${unit}`)} จากสัปดาห์ที่แล้ว` : null,
      deltaColor: summary.weight.isGood == null ? '#9498A0' : summary.weight.isGood ? '#7A9B57' : '#C1503A',
    },
    {
      key: 'bodyFat',
      icon: '🔥',
      label: 'ไขมันในร่างกาย',
      valueText: summary.bodyFatPct.value != null ? `${summary.bodyFatPct.value.toFixed(1)} %` : '—',
      deltaText: summary.bodyFatPct.delta != null ? `${fmtSigned(summary.bodyFatPct.delta, 1, '%')} จากสัปดาห์ที่แล้ว` : null,
      deltaColor: summary.bodyFatPct.isGood == null ? '#9498A0' : summary.bodyFatPct.isGood ? '#7A9B57' : '#C1503A',
    },
    {
      key: 'muscle',
      icon: '💪',
      label: 'กล้ามเนื้อโครงร่าง',
      valueText: summary.skeletalMuscleKg.value != null ? `${toDisplay(summary.skeletalMuscleKg.value).toFixed(1)} ${unit}` : '—',
      deltaText:
        summary.skeletalMuscleKg.delta != null
          ? `${fmtSigned(toDisplay(summary.skeletalMuscleKg.delta), 1, ` ${unit}`)} จากสัปดาห์ที่แล้ว`
          : null,
      deltaColor: summary.skeletalMuscleKg.isGood == null ? '#9498A0' : summary.skeletalMuscleKg.isGood ? '#7A9B57' : '#C1503A',
    },
    {
      key: 'fatMass',
      icon: '🧈',
      label: 'มวลไขมัน',
      valueText: summary.fatMassKg.value != null ? `${toDisplay(summary.fatMassKg.value).toFixed(1)} ${unit}` : '—',
      deltaText:
        summary.fatMassKg.delta != null ? `${fmtSigned(toDisplay(summary.fatMassKg.delta), 1, ` ${unit}`)} จากสัปดาห์ที่แล้ว` : null,
      deltaColor: summary.fatMassKg.isGood == null ? '#9498A0' : summary.fatMassKg.isGood ? '#7A9B57' : '#C1503A',
    },
    {
      key: 'bmi',
      icon: '📐',
      label: 'BMI',
      valueText: summary.bmi != null ? summary.bmi.toFixed(1) : '—',
      deltaText: summary.bmi != null ? bmiCategory(summary.bmi) : 'ยังไม่ได้กรอกส่วนสูง',
      deltaColor: summary.bmi != null ? bmiCategoryColor(summary.bmi) : '#9498A0',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div key={c.key} className="rounded-lg bg-surface border border-line shadow-elevated px-4 py-4">
          <p className="flex items-center gap-1.5 text-[11px] text-muted mb-2.5">
            <span aria-hidden="true">{c.icon}</span>
            {c.label}
          </p>
          <p className="font-mono text-xl text-ink">{c.valueText}</p>
          {c.deltaText && (
            <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: c.deltaColor }}>
              {c.deltaText}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
