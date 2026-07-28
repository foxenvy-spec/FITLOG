'use client'

import { useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { BodyMetric, Profile } from '@/lib/types'
import { computeBodyMetricsSummary, bmiCategory, bmiCategoryColor, bmiOf } from '@/lib/bodyMetricsSummary'
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

// ธีมสีต่อการ์ด (main + second) ตามสเปคที่ให้มา — มี 4 ธีม (เขียว/แดง/ส้ม/ฟ้า) แต่ 5 การ์ด
// น้ำหนักกับกล้ามเนื้อโครงร่างใช้ธีมเขียวร่วมกัน (ทั้งคู่เป็นโทนเขียวอยู่แล้วก่อนหน้านี้)
const METRIC_THEME: Record<MetricIconImageKey, { main: string; second: string }> = {
  weight: { main: '#00ff88', second: '#00d0ff' },
  muscle: { main: '#00ff88', second: '#00d0ff' },
  bodyFat: { main: '#ff2f5d', second: '#ff00c8' },
  fatMass: { main: '#ff9d00', second: '#ff6600' },
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

// เส้นกราฟจิ๋วมุมขวาล่างของการ์ด — เส้นโค้งมน (Catmull-Rom สมูทตาม tension) พร้อมพื้นที่ใต้เส้น
// เติมสีจางๆ (15% alpha) ล้อสีเดียวกับเส้น ตามสเปคที่ขอ (คล้าย Chart.js: borderColor / backgroundColor / tension)
function Sparkline({ series, color }: { series: number[]; color: string }) {
  const glowId = useId()
  if (series.length < 2) return null
  const w = 64
  const h = 30
  const pad = 3 // กันเส้นชนขอบบน-ล่างตอนค่าสูงสุด/ต่ำสุด
  const tension = 0.6 // ยกจาก 0.45 ให้เส้นโค้งมนขึ้น (ลดความรู้สึกหักมุมแข็งๆ แบบเส้นตรงต่อกัน)
  const min = Math.min(...series)
  const max = Math.max(...series)
  const range = max - min || 1
  const step = w / (series.length - 1)
  const points: [number, number][] = series.map((v, i) => [
    i * step,
    h - pad - ((v - min) / range) * (h - pad * 2),
  ])

  const n = points.length
  let linePath = `M ${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2 < n ? i + 2 : n - 1]
    const cp1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension
    const cp1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension
    const cp2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension
    const cp2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension
    linePath += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`
  }
  const areaPath = `${linePath} L ${points[n - 1][0].toFixed(2)},${h} L ${points[0][0].toFixed(2)},${h} Z`

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" style={{ overflow: 'visible' }} aria-hidden="true">
      <defs>
        {/* 2 filter: อันแรก blur แคบ (ใกล้เส้น) อันที่สอง blur กว้างกว่า (ฟุ้งไกลกว่า) ซ้อนกัน
            ให้ glow มีมิติ/รู้สึกได้ชัดขึ้นที่ขนาดกราฟจิ๋วนี้ รวม opacity อยู่ในช่วง 15-20% ตามที่ขอ */}
        <filter id={`sparkline-glow-tight-${glowId}`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <filter id={`sparkline-glow-wide-${glowId}`} x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="4.5" />
        </filter>
        {/* พื้นที่ใต้กราฟเป็น gradient จาง (เข้มใกล้เส้น ค่อยๆ จางหายไปด้านล่าง) แทนสีเรียบ fillOpacity เดิม
            ให้เข้าชุดกับ icon/card ที่เป็น gradient ทั้งหมดแล้ว */}
        <linearGradient id={`sparkline-area-${glowId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#sparkline-area-${glowId})`} stroke="none" />
      {/* glow ชั้นกว้าง (ฟุ้งไกล, opacity ต่ำสุด) วาดก่อน อยู่ล่างสุด */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeOpacity={0.15}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#sparkline-glow-wide-${glowId})`}
      />
      {/* glow ชั้นชิด (สว่างกว่าเล็กน้อย, blur น้อยกว่า) อยู่หลังเส้นจริง สีเดียวกับเส้น */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeOpacity={0.2}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#sparkline-glow-tight-${glowId})`}
      />
      {/* เส้นจริง หนาขึ้นจาก 3px เป็น 3.5px (+0.5px ตามที่ขอ) */}
      <path d={linePath} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function fmtSigned(n: number, decimals: number, suffix: string): string {
  const sign = n > 0 ? '+' : n < 0 ? '' : '±'
  return `${sign}${n.toFixed(decimals)}${suffix}`
}

// แยก "65.4 kg" หรือ "24.2 %" ออกเป็นตัวเลข + หน่วย (แยกที่ช่องว่างแรก) เพื่อให้ใส่ font-weight/ขนาด
// ต่างกันได้ (ตัวเลขหนัก 800 เด่นกว่า, หน่วยเบา 500 เล็กกว่า) — ถ้าไม่มีช่องว่างเลย (เช่น BMI "23.2") ให้ unit เป็นค่าว่าง
function splitValueUnit(text: string): { num: string; unit: string } {
  const spaceIdx = text.indexOf(' ')
  if (spaceIdx === -1) return { num: text, unit: '' }
  return { num: text.slice(0, spaceIdx), unit: text.slice(spaceIdx + 1) }
}

export default function BodyMetricsRow({ showLastMeasuredDate = false }: { showLastMeasuredDate?: boolean } = {}) {
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
      deltaColor: summary.weight.isGood == null ? '#9498A0' : summary.weight.isGood ? '#8CB264' : '#C1503A',
      deltaDir: summary.weight.delta == null ? null : summary.weight.delta > 0 ? 'up' : summary.weight.delta < 0 ? 'down' : null,
      series: weightSeries,
    },
    {
      key: 'bodyFat',
      icon: 'bodyFat',
      label: 'ไขมันในร่างกาย',
      valueText: summary.bodyFatPct.value != null ? `${summary.bodyFatPct.value.toFixed(1)} %` : '—',
      deltaText: summary.bodyFatPct.delta != null ? `${fmtSigned(summary.bodyFatPct.delta, 1, '%')} ${period}` : null,
      deltaColor: summary.bodyFatPct.isGood == null ? '#9498A0' : summary.bodyFatPct.isGood ? '#8CB264' : '#C1503A',
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
      deltaColor: summary.skeletalMuscleKg.isGood == null ? '#9498A0' : summary.skeletalMuscleKg.isGood ? '#8CB264' : '#C1503A',
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
      deltaColor: summary.fatMassKg.isGood == null ? '#9498A0' : summary.fatMassKg.isGood ? '#8CB264' : '#C1503A',
      deltaDir: summary.fatMassKg.delta == null ? null : summary.fatMassKg.delta > 0 ? 'up' : summary.fatMassKg.delta < 0 ? 'down' : null,
      series: fatMassSeries,
    },
    {
      key: 'bmi',
      icon: 'bmi',
      label: 'BMI',
      valueText: summary.bmi != null ? summary.bmi.toFixed(1) : '—',
      deltaText: summary.bmi != null ? bmiCategory(summary.bmi) : 'ยังไม่ได้กรอกส่วนสูง',
      deltaColor: summary.bmi != null ? bmiCategoryColor(summary.bmi) : '#9498A0',
      deltaDir: null,
      series: bmiSeries,
    },
  ]

  return (
    <>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => {
        const theme = METRIC_THEME[c.icon]
        return (
          <div
            key={c.key}
            className={`metric-card relative overflow-hidden rounded-lg flex flex-col justify-between ${showLastMeasuredDate ? 'h-[138px] 2xl:h-[142px]' : 'h-[124px] 2xl:h-[128px]'}`}
            style={{
              transition: 'transform 200ms ease, filter 200ms ease, box-shadow 200ms ease', // duration 180-220ms ตามที่ขอ
              padding: '16px 18px 12px', // ลด padding-bottom ลงอีกนิด ให้บรรทัดเดลต้าที่ถูกดันไปด้วย margin-top:auto ชิดขอบล่างเห็นผลชัดขึ้น
              border: '1.5px solid transparent',
              // 4 background ซ้อนกัน วาดถึง border-box (เพื่อทำ "ขอบไล่สี"), เรียงจากบนสุด(วาดทับ)ไปล่างสุด:
              // 1) ไล่สีเข้มพรีเมียมด้านใน + จุดสว่างจางๆ กลางการ์ด (radial, #1B2230 ~5%) กันไม่ให้กลางการ์ดดำตันเกินไป
              //    วาดถึงแค่ padding-box (คือพื้นการ์ดจริง ทับซ่อนกลางของ 2-4 ไว้)
              // 2) radial glow ที่มุมซ้ายบน (สี main) 3) radial glow ที่มุมขวาล่าง (สี second)
              // 4) เข้ม→อ่อน→เข้ม แนวทแยง (แทนสีพื้นจางๆ เรียบๆ เดิม) กันไม่ให้ช่วงกลางขอบ/มุมอื่นดูเป็นเส้นแข็งทื่อ
              // ผลคือขอบเรืองแสงชัดเฉพาะ 2 มุมตรงข้ามกัน ส่วนช่วงกลางขอบก็ยังไล่เฉดนุ่มๆ ไม่ใช่เส้นตรงแข็งๆ
              backgroundImage: `radial-gradient(circle at 50% 55%, #1B2230, transparent 60%), linear-gradient(180deg, #13233A, #08121F), radial-gradient(120% 120% at 0% 0%, ${theme.main}, transparent 55%), radial-gradient(120% 120% at 100% 100%, ${theme.second}, transparent 55%), linear-gradient(135deg, ${theme.main}14, ${theme.main}40, ${theme.main}14)`,
              backgroundOrigin: 'border-box',
              backgroundClip: 'padding-box, padding-box, border-box, border-box, border-box',
              // 5 ชั้นซ้อนกัน: contact shadow (เงาคมใกล้ตัว) + ambient shadow (เงานุ่มฟุ้งกว้าง)
              // + inset highlight บนขอบบน (ผิวมีไฮไลต์) + glow สีธีมเยื้อง offset ไปมุมซ้ายบน/ขวาล่าง
              // (แทนที่จะเป็น 0 0 แผ่เท่ากันทุกด้าน) ให้ธีมสีเรืองแสงเฉพาะ 2 มุมตรงข้ามให้เข้ากับขอบ
              boxShadow: `0 2px 6px rgba(0,0,0,.35), 0 8px 24px 2px rgba(0,0,0,.4), inset 0 1px rgba(255,255,255,.05), -6px -6px 20px ${theme.main}33, 6px 6px 20px ${theme.second}33`,
            }}
          >
            {/* ไล่เฉด radial สีธีมจางๆ กลางค่อนไปทางบน ซ้อนอยู่หลังเนื้อหา ให้พื้นหลังดูลึกมีมิติแทนที่จะเป็น dark navy เรียบๆ */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-lg"
              style={{ backgroundImage: `radial-gradient(circle at top left, ${theme.main}14, transparent 45%)` }}
            />
            {/* ชั้นเพิ่มเติมบางเบามาก (opacity 4%) สีขาวล้วน (ไม่ใช่สีธีม) จากมุมซ้ายบน — เพิ่มมิติแบบผู้ใช้แทบไม่รู้ตัว
                แยกจากชั้นสีธีมด้านบน เพราะอันนี้ให้ความรู้สึก "แสงทั่วไป" ไม่ใช่ "แสงจากไอคอน" */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-lg"
              style={{ backgroundImage: `radial-gradient(circle at top left, rgba(255,255,255,.03), transparent 50%)` }}
            />
            {/* จุดแสงฟุ้ง (glow blob) มุมซ้ายบน ให้ความรู้สึกมีแสงจากไอคอนกระจายเข้าไปในการ์ด — blur กว้างขึ้น + opacity ~8% ตามที่ขอ ให้ดูลึกขึ้น */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-full"
              style={{
                width: 160,
                height: 160,
                left: -60,
                top: -60,
                background: theme.main,
                filter: 'blur(60px)',
                opacity: 0.08,
              }}
            />

            <div className="relative h-full">
              <p
                className="flex items-center gap-2 text-[11px] font-semibold"
                style={{ color: 'rgba(255,255,255,.94)', fontWeight: 700 }}
              >
                <span
                  className="relative w-[42px] h-[42px] shrink-0 inline-flex items-center justify-center rounded-[10px] overflow-hidden"
                  style={{
                    // ฐานเป็นกระจกเข้มเป็นกลาง ไล่จาก "มุมบนสว่างกว่า" ไป "มุมล่างเข้มกว่า" ชัดเจนขึ้น (180deg ตรงๆ
                    // แทน 145deg เดิมที่ contrast น้อยไป) ให้ความรู้สึกกระจกโค้งแบบ Apple Vision Pro
                    // + จุดสีธีมจางๆ ที่มุมบนซ้าย เป็นการ "แต้ม" สี ไม่ใช่ "ย้อม" ทั้งกล่อง
                    background: `linear-gradient(180deg, #232C40, #0A0E18)`,
                    backgroundImage: `radial-gradient(circle at 30% 25%, ${theme.main}55, transparent 65%), linear-gradient(180deg, #232C40, #0A0E18)`,
                    // border บาง 1px สีธีม (คมชัด แทนเส้นหนาๆ) + inset highlight ลดความสว่างลง (.35→.15) ให้เป็น
                    // แค่ "ผิวมัน" บางๆ ไม่ใช่เส้นขอบขาวหนา ปล่อยให้ glow ด้านนอกทำหน้าที่เน้นความเด่นแทน
                    border: `1px solid ${theme.main}55`,
                    boxShadow: `inset 0 1px rgba(255,255,255,.15), inset 0 -3px 6px rgba(0,0,0,.5), 0 0 15px ${theme.main}33`,
                  }}
                  aria-hidden="true"
                >
                  {/* glass reflection: ย้ายจากแถบเต็มความกว้างด้านบน มาเป็นจุดไฮไลต์เล็กๆ แค่มุมซ้ายบน (~15-20% ของพื้นที่)
                      จำลองแสงตกกระทบจากมุมเดียวแบบของจริง แทนที่จะสว่างเท่ากันทั้งแถบบน */}
                  <span
                    className="pointer-events-none absolute top-0 left-0"
                    style={{
                      width: '65%',
                      height: '45%',
                      background: 'radial-gradient(circle at 15% 15%, rgba(255,255,255,.3), transparent 80%)',
                    }}
                  />
                  {/* ไอคอนเดิมเป็น PNG สีเดียวล้วน — recolor ด้วย CSS mask ให้เป็น gradient สว่าง(บน)→เข้ม(ล่าง)
                      ตามสีธีมของการ์ดนั้นๆ (ไม่ได้เพิ่ม glow ใดๆ ตามที่ขอ แค่ไล่สีในตัวไอคอนเอง) */}
                  <span
                    className="relative block"
                    style={{
                      width: 38,
                      height: 38,
                      backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${theme.main} 65%, white), color-mix(in srgb, ${theme.main} 85%, black))`,
                      WebkitMaskImage: `url(${METRIC_ICON_IMAGES[c.icon]})`,
                      maskImage: `url(${METRIC_ICON_IMAGES[c.icon]})`,
                      WebkitMaskSize: 'contain',
                      maskSize: 'contain',
                      WebkitMaskRepeat: 'no-repeat',
                      maskRepeat: 'no-repeat',
                      WebkitMaskPosition: 'center',
                      maskPosition: 'center',
                      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))',
                    }}
                  />
                </span>
                {c.label}
              </p>
              {/* ตรึงด้วย position:absolute ชิดขอบล่าง/ซ้าย/ขวาของการ์ดโดยตรง แทนการพึ่ง margin-top:auto
                  แถวบน (ตัวเลข+กราฟ) กราฟอยู่ข้างตัวเลขแทนที่จะทับบรรทัดเดลต้าด้านล่าง */}
              <div className="absolute left-0 right-0 bottom-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xl tracking-tight leading-none text-ink">
                    <span style={{ fontWeight: 800 }}>{splitValueUnit(c.valueText).num}</span>
                    {splitValueUnit(c.valueText).unit && (
                      <span style={{ fontWeight: 500, fontSize: '0.82em' }}> {splitValueUnit(c.valueText).unit}</span>
                    )}
                  </p>
                  <Sparkline series={c.series} color={theme.main} />
                </div>
                {c.deltaText && (
                  <>
                    <p
                      className="text-[11px] font-semibold whitespace-nowrap flex items-center gap-1"
                      style={{ color: c.deltaColor, marginTop: 6 }}
                    >
                      {c.deltaDir && <span aria-hidden="true">{c.deltaDir === 'up' ? '↑' : '↓'}</span>}
                      {c.deltaText}
                    </p>
                    {lastMeasuredText && (
                      <p className="text-[9px] text-muted/70 truncate" style={{ marginTop: 2 }}>
                        {lastMeasuredText}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
    {/* Hover effect เฉพาะเว็บ/เดสก์ท็อป (@media hover:hover กันไม่ให้ค้างบนมือถือที่ไม่มี hover จริง)
        scale 1.00→1.015 + translateY -2px ตามสเปคที่ขอ, ส่วน "shadow/glow เพิ่ม 10%" ใช้ brightness+contrast
        แทนการคำนวณ alpha สีธีมทีละใบ (ง่ายกว่า/เสถียรกว่า แต่ให้ความรู้สึกใกล้เคียงกัน คือการ์ดดู "เด่นขึ้น" เมื่อชี้เมาส์) */}
    <style jsx>{`
      @media (hover: hover) {
        .metric-card:hover {
          transform: translateY(-2px) scale(1.015);
          filter: brightness(1.06) contrast(1.04);
        }
      }
    `}</style>
    </>
  )
}
