'use client'

import Image from 'next/image'
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
      <path d={areaPath} fill={color} fillOpacity={0.15} stroke="none" />
      {/* เส้น glow ฟุ้งบางๆ อยู่หลังเส้นจริง — วาดเส้นเดิมซ้ำแล้ว blur 6px ให้ดู premium ขึ้น (overflow:visible กันไม่ให้ glow โดน viewport ของ svg ตัดขอบ) */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.6}
        style={{ filter: 'blur(6px)' }}
      />
      <path d={linePath} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
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
      deltaColor: summary.weight.isGood == null ? '#9498A0' : summary.weight.isGood ? '#7A9B57' : '#C1503A',
      deltaDir: summary.weight.delta == null ? null : summary.weight.delta > 0 ? 'up' : summary.weight.delta < 0 ? 'down' : null,
      series: weightSeries,
    },
    {
      key: 'bodyFat',
      icon: 'bodyFat',
      label: 'ไขมันในร่างกาย',
      valueText: summary.bodyFatPct.value != null ? `${summary.bodyFatPct.value.toFixed(1)} %` : '—',
      deltaText: summary.bodyFatPct.delta != null ? `${fmtSigned(summary.bodyFatPct.delta, 1, '%')} ${period}` : null,
      deltaColor: summary.bodyFatPct.isGood == null ? '#9498A0' : summary.bodyFatPct.isGood ? '#7A9B57' : '#C1503A',
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
      deltaColor: summary.skeletalMuscleKg.isGood == null ? '#9498A0' : summary.skeletalMuscleKg.isGood ? '#7A9B57' : '#C1503A',
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
      deltaColor: summary.fatMassKg.isGood == null ? '#9498A0' : summary.fatMassKg.isGood ? '#7A9B57' : '#C1503A',
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => {
        const theme = METRIC_THEME[c.icon]
        return (
          <div
            key={c.key}
            className="relative overflow-hidden rounded-lg flex flex-col justify-between h-[124px] 2xl:h-[128px]"
            style={{
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
              boxShadow: `0 2px 6px rgba(0,0,0,.35), 0 12px 30px rgba(0,0,0,.45), inset 0 1px rgba(255,255,255,.05), -6px -6px 20px ${theme.main}33, 6px 6px 20px ${theme.second}33`,
            }}
          >
            {/* ไล่เฉด radial สีธีมจางๆ กลางค่อนไปทางบน ซ้อนอยู่หลังเนื้อหา ให้พื้นหลังดูลึกมีมิติแทนที่จะเป็น dark navy เรียบๆ */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-lg"
              style={{ backgroundImage: `radial-gradient(circle at top left, ${theme.main}14, transparent 45%)` }}
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
                style={{ color: 'rgba(255,255,255,.85)' }}
              >
                <span
                  className="w-12 h-12 shrink-0 inline-flex items-center justify-center rounded-[12px]"
                  style={{ background: `${theme.main}1F`, boxShadow: `0 0 15px ${theme.main}40` }}
                  aria-hidden="true"
                >
                  <Image
                    src={METRIC_ICON_IMAGES[c.icon]}
                    alt=""
                    width={38}
                    height={38}
                    className="w-[38px] h-[38px] object-contain"
                    style={{ filter: `drop-shadow(0 0 4px ${theme.main}CC)` }}
                  />
                </span>
                {c.label}
              </p>
              {/* ตรึงด้วย position:absolute ชิดขอบล่าง/ซ้าย/ขวาของการ์ดโดยตรง แทนการพึ่ง margin-top:auto
                  แถวบน (ตัวเลข+กราฟ) กราฟอยู่ข้างตัวเลขแทนที่จะทับบรรทัดเดลต้าด้านล่าง */}
              <div className="absolute left-0 right-0 bottom-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xl font-bold tracking-tight leading-none text-ink">{c.valueText}</p>
                  <Sparkline series={c.series} color={theme.main} />
                </div>
                {c.deltaText && (
                  <p
                    className="text-[11px] font-semibold whitespace-nowrap flex items-center gap-1"
                    style={{ color: c.deltaColor, marginTop: 6 }}
                  >
                    {c.deltaDir && <span aria-hidden="true">{c.deltaDir === 'up' ? '↑' : '↓'}</span>}
                    {c.deltaText}
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
