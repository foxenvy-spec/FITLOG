'use client'

import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { BodyMetric, Profile } from '@/lib/types'
import { computeBodyMetricsSummary, bmiCategory, bmiCategoryColor } from '@/lib/bodyMetricsSummary'
import { useWeightUnit } from './WeightUnitProvider'
import Skeleton from './Skeleton'

// ไอคอนรูปจริงชุดเดียวกับหน้าสุขภาพ (health/page.tsx: STAT_ICON_IMAGES) แทนไอคอนเส้น SVG เดิม
// เพื่อให้การ์ดสรุปด้านบนสุดของหน้า Dashboard ใช้ภาษาภาพเดียวกับหน้าสุขภาพ
type MetricIconImageKey = 'weight' | 'bodyFat' | 'muscle' | 'fatMass' | 'bmi'
const METRIC_ICON_IMAGES: Record<MetricIconImageKey, string> = {
  weight: '/icons/weight.png',
  bodyFat: '/icons/body-fat.png',
  muscle: '/icons/skeletal-muscle.png',
  fatMass: '/icons/fat-mass.png',
  bmi: '/icons/bmi.png',
}

// glow สีล้อตามไอคอนของแต่ละการ์ด (เขียว/แดง-ชมพู/เขียว/ส้ม/ฟ้า) ตามมอคอัพ v3 —
// ใช้ทั้งกับ border และ box-shadow เพื่อให้แต่ละใบมีสีเฉพาะตัวแทนขอบเทาเรียบแบบเดิม
const METRIC_GLOW_COLORS: Record<MetricIconImageKey, string> = {
  weight: '#34D399',
  bodyFat: '#FB7185',
  muscle: '#4ADE80',
  fatMass: '#FB923C',
  bmi: '#60A5FA',
}

// exported so DashboardView's AI Coach card can reuse the exact same query (react-query
// dedupes by key — sharing this avoids a second network round-trip for the same data)
export const BODY_METRICS_QUERY_KEY = ['body-metrics-summary']

export async function fetchBodyMetricsData(supabase: ReturnType<typeof createClient>) {
  const [{ data: metricsRows }, { data: profileRow }] = await Promise.all([
    // ดึงย้อนหลังพอสำหรับใช้เอนทรีก่อนหน้าล่าสุดมาเทียบ delta เสมอ ไม่ว่าจะชั่งถี่หรือห่างแค่ไหน
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
  icon: MetricIconImageKey
  label: string
  valueText: string
  deltaText: string | null
  deltaColor: string
  deltaDir: 'up' | 'down' | null
}

function fmtSigned(n: number, decimals: number, suffix: string): string {
  const sign = n > 0 ? '+' : n < 0 ? '' : '±'
  return `${sign}${n.toFixed(decimals)}${suffix}`
}

export default function BodyMetricsRow() {
  const supabase = createClient()
  const { toDisplay, unit } = useWeightUnit()

  const { data, isLoading } = useQuery({
    queryKey: BODY_METRICS_QUERY_KEY,
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
  // label เดียวใช้ร่วมกันทุกการ์ด ปรับข้อความอัตโนมัติตามระยะเวลาจริงระหว่างสองเอนทรีล่าสุด
  // (เช่น "จากเมื่อวาน" / "จาก 3 วันก่อน" / "จากสัปดาห์ที่แล้ว" / "จากเดือนที่แล้ว") แทนคำว่า "จากสัปดาห์ที่แล้ว" ตายตัว
  const period = summary.periodLabel ?? 'จากครั้งก่อน'

  const cards: CardDef[] = [
    {
      key: 'weight',
      icon: 'weight',
      label: 'น้ำหนัก',
      valueText: summary.weight.value != null ? `${toDisplay(summary.weight.value).toFixed(1)} ${unit}` : '—',
      deltaText:
        summary.weight.delta != null ? `${fmtSigned(toDisplay(summary.weight.delta), 1, ` ${unit}`)} ${period}` : null,
      deltaColor: summary.weight.isGood == null ? '#9498A0' : summary.weight.isGood ? '#7A9B57' : '#C1503A',
      deltaDir: summary.weight.delta == null ? null : summary.weight.delta > 0 ? 'up' : summary.weight.delta < 0 ? 'down' : null,
    },
    {
      key: 'bodyFat',
      icon: 'bodyFat',
      label: 'ไขมันในร่างกาย',
      valueText: summary.bodyFatPct.value != null ? `${summary.bodyFatPct.value.toFixed(1)} %` : '—',
      deltaText: summary.bodyFatPct.delta != null ? `${fmtSigned(summary.bodyFatPct.delta, 1, '%')} ${period}` : null,
      deltaColor: summary.bodyFatPct.isGood == null ? '#9498A0' : summary.bodyFatPct.isGood ? '#7A9B57' : '#C1503A',
      deltaDir: summary.bodyFatPct.delta == null ? null : summary.bodyFatPct.delta > 0 ? 'up' : summary.bodyFatPct.delta < 0 ? 'down' : null,
    },
    {
      key: 'muscle',
      icon: 'muscle',
      label: 'กล้ามเนื้อโครงร่าง',
      valueText: summary.skeletalMuscleKg.value != null ? `${toDisplay(summary.skeletalMuscleKg.value).toFixed(1)} ${unit}` : '—',
      deltaText:
        summary.skeletalMuscleKg.delta != null
          ? `${fmtSigned(toDisplay(summary.skeletalMuscleKg.delta), 1, ` ${unit}`)} ${period}`
          : null,
      deltaColor: summary.skeletalMuscleKg.isGood == null ? '#9498A0' : summary.skeletalMuscleKg.isGood ? '#7A9B57' : '#C1503A',
      deltaDir:
        summary.skeletalMuscleKg.delta == null ? null : summary.skeletalMuscleKg.delta > 0 ? 'up' : summary.skeletalMuscleKg.delta < 0 ? 'down' : null,
    },
    {
      key: 'fatMass',
      icon: 'fatMass',
      label: 'มวลไขมัน',
      valueText: summary.fatMassKg.value != null ? `${toDisplay(summary.fatMassKg.value).toFixed(1)} ${unit}` : '—',
      deltaText:
        summary.fatMassKg.delta != null ? `${fmtSigned(toDisplay(summary.fatMassKg.delta), 1, ` ${unit}`)} ${period}` : null,
      deltaColor: summary.fatMassKg.isGood == null ? '#9498A0' : summary.fatMassKg.isGood ? '#7A9B57' : '#C1503A',
      deltaDir: summary.fatMassKg.delta == null ? null : summary.fatMassKg.delta > 0 ? 'up' : summary.fatMassKg.delta < 0 ? 'down' : null,
    },
    {
      key: 'bmi',
      icon: 'bmi',
      label: 'BMI',
      valueText: summary.bmi != null ? summary.bmi.toFixed(1) : '—',
      deltaText: summary.bmi != null ? bmiCategory(summary.bmi) : 'ยังไม่ได้กรอกส่วนสูง',
      deltaColor: summary.bmi != null ? bmiCategoryColor(summary.bmi) : '#9498A0',
      deltaDir: null,
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => {
        const glow = METRIC_GLOW_COLORS[c.icon]
        return (
          <div
            key={c.key}
            className="rounded-lg bg-surface border shadow-elevated px-4 py-4"
            style={{ borderColor: glow + '4D', boxShadow: `0 0 10px ${glow}33` }}
          >
            <p className="flex items-center gap-2 text-[11px] text-muted mb-2.5">
              <span className="w-6 h-6 shrink-0 inline-block" aria-hidden="true">
                <Image src={METRIC_ICON_IMAGES[c.icon]} alt="" width={24} height={24} className="w-full h-full object-contain" />
              </span>
              {c.label}
            </p>
            <p className="font-mono text-xl text-ink">{c.valueText}</p>
            {c.deltaText && (
              <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: c.deltaColor }}>
                {c.deltaDir && <span aria-hidden="true">{c.deltaDir === 'up' ? '↑' : '↓'}</span>}
                {c.deltaText}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
