'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { BodyMetric, Profile } from '@/lib/types'
import { computeBodyMetricsSummary, bmiCategory, bmiCategoryColor, bmiOf } from '@/lib/bodyMetricsSummary'
import { useWeightUnit } from './WeightUnitProvider'
import Skeleton from './Skeleton'
import MetricCard, { type MetricIconImageKey, type MetricCardTheme } from './MetricCard'
import { COLORS, NEUTRAL } from '@/lib/theme'

// ธีมสีต่อการ์ด (main + second) ตามสเปคที่ให้มา — มี 4 ธีม (เขียว/แดง/ส้ม/ฟ้า) แต่ 5 การ์ด
// น้ำหนักกับกล้ามเนื้อโครงร่างใช้ธีมเขียวร่วมกัน (ทั้งคู่เป็นโทนเขียวอยู่แล้วก่อนหน้านี้)
const METRIC_THEME: Record<MetricIconImageKey, MetricCardTheme> = {
  weight: { main: '#00ff88', second: '#00d0ff' },
  muscle: { main: '#00ff88', second: '#00d0ff' },
  bodyFat: { main: '#ff2f5d', second: '#ff00c8' },
  fatMass: { main: '#ff9d00', second: '#ff6600' },
  bmi: { main: '#1b8cff', second: '#3f6cff' },
}

// ธีมสีชุดที่ 2 (colorScheme="vibrant") — ตามมอคอัพใหม่: น้ำหนัก=ส้ม, ไขมัน=ชมพู, กล้ามเนื้อ=ฟ้า,
// มวลไขมัน=เขียว ต่างจากชุดเดิมด้านบนไปเลย (ที่ยังใช้กับเดสก์ท็อปอยู่) จึงแยกเป็นอีกชุดแทนที่จะ
// แก้ของเดิม — ป้องกันไม่ให้กระทบหน้าเดสก์ท็อปที่ยังอ้างอิง METRIC_THEME ชุดแรก
const METRIC_THEME_VIBRANT: Record<MetricIconImageKey, MetricCardTheme> = {
  weight: { main: '#FFA23D', second: '#FF7A1A' },
  bodyFat: { main: '#ff2f5d', second: '#ff00c8' },
  muscle: { main: '#3DA5FF', second: '#1B6EFF' },
  fatMass: { main: '#4ADE80', second: '#22C55E' },
  bmi: { main: '#1b8cff', second: '#3f6cff' },
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
  series: number[]
}

function fmtSigned(n: number, decimals: number, suffix: string): string {
  const sign = n > 0 ? '+' : n < 0 ? '' : '±'
  return `${sign}${n.toFixed(decimals)}${suffix}`
}

export default function BodyMetricsRow({
  showLastMeasuredDate = false,
  colorScheme = 'default',
  maxCards,
  compact = false,
}: {
  showLastMeasuredDate?: boolean
  colorScheme?: 'default' | 'vibrant'
  maxCards?: number
  // เฉพาะ Mobile Dashboard v2 — ลด padding การ์ดเมตริกลงให้กระชับขึ้นใน grid 2x2 (ดู MetricCard.tsx)
  compact?: boolean
} = {}) {
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
  // วันที่ของเอนทรีล่าสุด (metrics เรียง desc มาแล้วจาก query) — ทุกเมตริกมาจากแถวเดียวกันเสมอ
  // (บันทึกน้ำหนัก/ไขมัน/กล้ามเนื้อพร้อมกันในครั้งเดียว) จึงใช้วันที่เดียวกันได้ทุกการ์ด
  const lastMeasuredText = showLastMeasuredDate
    ? `ล่าสุด ${new Date(metrics[0].measured_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : null

  // metrics เรียงใหม่->เก่า (measured_at desc) กลับด้านเป็นเก่า->ใหม่ ให้กราฟไล่จากซ้ายไปขวาตามเวลา
  const chronological = [...metrics].reverse()
  const seriesFor = (pick: (m: BodyMetric) => number | null): number[] =>
    chronological.map(pick).filter((v): v is number => v != null)

  const weightSeries = seriesFor((m) => m.weight_kg)
  const bodyFatSeries = seriesFor((m) => m.body_fat_pct)
  const muscleSeries = seriesFor((m) => m.skeletal_muscle_kg ?? m.muscle_kg ?? null)
  const fatMassSeries = seriesFor((m) => {
    if (m.body_fat_kg != null) return m.body_fat_kg
    if (m.weight_kg != null && m.body_fat_pct != null) return (m.weight_kg * m.body_fat_pct) / 100
    return null
  })
  const bmiSeries = seriesFor((m) => bmiOf(m.weight_kg, heightCm))

  const cards: CardDef[] = [
    {
      key: 'weight',
      icon: 'weight',
      label: 'น้ำหนัก',
      valueText: summary.weight.value != null ? `${toDisplay(summary.weight.value).toFixed(1)} ${unit}` : '—',
      deltaText:
        summary.weight.delta != null ? `${fmtSigned(toDisplay(summary.weight.delta), 1, ` ${unit}`)} ${period}` : null,
      deltaColor: summary.weight.isGood == null ? NEUTRAL.mutedIcon : summary.weight.isGood ? COLORS.deltaGood : COLORS.rust,
      deltaDir: summary.weight.delta == null ? null : summary.weight.delta > 0 ? 'up' : summary.weight.delta < 0 ? 'down' : null,
      series: weightSeries,
    },
    {
      key: 'bodyFat',
      icon: 'bodyFat',
      label: 'ไขมันในร่างกาย',
      valueText: summary.bodyFatPct.value != null ? `${summary.bodyFatPct.value.toFixed(1)} %` : '—',
      deltaText: summary.bodyFatPct.delta != null ? `${fmtSigned(summary.bodyFatPct.delta, 1, '%')} ${period}` : null,
      deltaColor: summary.bodyFatPct.isGood == null ? NEUTRAL.mutedIcon : summary.bodyFatPct.isGood ? COLORS.deltaGood : COLORS.rust,
      deltaDir: summary.bodyFatPct.delta == null ? null : summary.bodyFatPct.delta > 0 ? 'up' : summary.bodyFatPct.delta < 0 ? 'down' : null,
      series: bodyFatSeries,
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
      deltaColor:
        summary.skeletalMuscleKg.isGood == null ? NEUTRAL.mutedIcon : summary.skeletalMuscleKg.isGood ? COLORS.deltaGood : COLORS.rust,
      deltaDir:
        summary.skeletalMuscleKg.delta == null ? null : summary.skeletalMuscleKg.delta > 0 ? 'up' : summary.skeletalMuscleKg.delta < 0 ? 'down' : null,
      series: muscleSeries,
    },
    {
      key: 'fatMass',
      icon: 'fatMass',
      label: 'มวลไขมัน',
      valueText: summary.fatMassKg.value != null ? `${toDisplay(summary.fatMassKg.value).toFixed(1)} ${unit}` : '—',
      deltaText:
        summary.fatMassKg.delta != null ? `${fmtSigned(toDisplay(summary.fatMassKg.delta), 1, ` ${unit}`)} ${period}` : null,
      deltaColor: summary.fatMassKg.isGood == null ? NEUTRAL.mutedIcon : summary.fatMassKg.isGood ? COLORS.deltaGood : COLORS.rust,
      deltaDir: summary.fatMassKg.delta == null ? null : summary.fatMassKg.delta > 0 ? 'up' : summary.fatMassKg.delta < 0 ? 'down' : null,
      series: fatMassSeries,
    },
    {
      key: 'bmi',
      icon: 'bmi',
      label: 'BMI',
      valueText: summary.bmi != null ? summary.bmi.toFixed(1) : '—',
      deltaText: summary.bmi != null ? bmiCategory(summary.bmi) : 'ยังไม่ได้กรอกส่วนสูง',
      deltaColor: summary.bmi != null ? bmiCategoryColor(summary.bmi) : NEUTRAL.mutedIcon,
      deltaDir: null,
      series: bmiSeries,
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.slice(0, maxCards ?? cards.length).map((c) => (
        <MetricCard
          key={c.key}
          icon={c.icon}
          label={c.label}
          valueText={c.valueText}
          deltaText={c.deltaText}
          deltaColor={c.deltaColor}
          deltaDir={c.deltaDir}
          series={c.series}
          theme={colorScheme === 'vibrant' ? METRIC_THEME_VIBRANT[c.icon] : METRIC_THEME[c.icon]}
          lastMeasuredText={lastMeasuredText}
          tall={showLastMeasuredDate}
          radius={colorScheme === 'vibrant' ? 'xl20' : 'lg'}
          compact={compact}
        />
      ))}
    </div>
  )
}
