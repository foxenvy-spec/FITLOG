'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { BodyMetric, Goal, Profile } from '@/lib/types'
import { computeBodyMetricsSummary, bmiCategory, bmiCategoryColor, bmiOf, type MetricsTimeframe } from '@/lib/bodyMetricsSummary'
import { goalProgressPct } from '@/lib/goalProgress'
import { useWeightUnit } from './WeightUnitProvider'
import Skeleton from './Skeleton'
import MetricCard, { type MetricIconImageKey, type MetricCardTheme } from './MetricCard'
import MetricDetailSheet from './dashboard/MetricDetailSheet'
import { COLORS, NEUTRAL } from '@/lib/theme'
import { dashboardSpec } from '@/lib/dashboardSpec'

// ธีมสีต่อการ์ด (main + second) ตาม Color token ล่าสุด: น้ำหนัก=ส้ม #F59E0B, ไขมัน=ชมพู #EC4899,
// กล้ามเนื้อ=ฟ้า #3B82F6, มวลไขมัน=เขียว #22C55E — second เป็นเฉดเข้มกว่าของสีเดียวกัน (ใช้กับ glow
// มุมขวาล่างของการ์ด)
//
// glow (0-100): ความเข้ม glow มุมการ์ดต่อเมตริก — เดิมทุกใบใช้ alpha คงที่เท่ากันหมด (33 hex ≈ 20%)
// ทำให้ glow ทุกใบสว่างเท่ากันดูไม่เป็นธรรมชาติ ตามฟีดแบ็กที่ขอให้แต่ละใบไม่เท่ากัน — น้ำหนัก (การ์ด
// แรกสุด สายตาเห็นก่อน) เข้มสุด ไล่ลงตามลำดับความสำคัญ/ตำแหน่งในกริด
// v2: ลดทั้งชุดลงอีก ~20% (18/14/12/10 -> 14/11/9/8) ตามคำขอ "Less glow, more material" รอบล่าสุด —
// สีธีมต่อเมตริก (ส้ม/ชมพู/ฟ้า/เขียว) ไม่แตะ ยังคงเดิมทุกประการตามที่ขอ "Keep all current colors"
// v29: ฟีดแบ็ก "การ์ดภาพรวมร่างกาย ขอแบบเดิมได้ไหม" — ย้อน v28 (Metric Card แยกวัสดุ/สีต่อ icon —
// Purple Smoke/Blue Energy/Green Crystal) กลับไปเป็นไทเทเนียมชุดเดียวกันทุกใบเหมือนเดิม รวมสี bodyFat
// ที่เคยเปลี่ยนเป็นม่วง (#A855F7) กลับไปเป็นชมพูเดิม (#EC4899) ด้วย
// v43: เดิมมีสองชุดสี (METRIC_THEME นีออนอิ่มตัวเต็มที่ ใช้เฉพาะเดสก์ท็อป colorScheme="default" กับชุดนี้
// ที่ใช้กับ colorScheme="vibrant") — ตั้งแต่ v41 ("Minimal Dark Titanium") เดสก์ท็อปสลับมาใช้ "vibrant"
// เหมือนมือถือแล้ว ไม่มีจุดไหนเรียก "default" อีกเลย เอา METRIC_THEME (ชุดนีออน) กับ prop colorScheme
// ออกทั้งคู่ ให้เหลือชุดสีเดียวที่ทั้งแอปใช้จริง ไม่ใช่โค้ดตายที่ต้องดูแลคู่ขนานไปเรื่อยๆ
// v44: ฟีดแบ็ก "ลด Glow ของ Card ภาพรวมร่างกายลง 10-15% ให้ดู Premium มากกว่า Gaming" — ค่า glow
// (theme.glow, MetricCard.tsx อ่านค่านี้ผ่าน glowAlpha/coreAlpha เฉพาะ branch compact=มือถือเท่านั้น
// ดู comment "v41/v48" ในไฟล์นั้น — เดสก์ท็อปไม่อ่านค่านี้เลย จึงไม่กระทบ) ลดลงทั้งชุด ~12%
// (14/11/9/8/9 -> 12/10/8/7/8) คงสัดส่วนไล่ลำดับเดิมไว้ (น้ำหนักเข้มสุด ไล่ลงตามลำดับในกริด)
// v45: ฟีดแบ็ก "Body Overview ดีแล้ว อย่าขยายเพิ่ม แต่ลดความเข้มของ Glow และเส้นกราฟนิดหนึ่ง ไม่ให้แย่ง
// ความสนใจกับ Today's Workout" — ลดต่ออีกขั้นเบาๆ ~10% (12/10/8/7/8 -> 11/9/7/6/7)
// v46: ฟีดแบ็ก "ลด Glow/Shadow ของ Metric Cards ประมาณ 5-10%" (รอบ polish สุดท้าย) — ลดอีกขั้นเบาๆ
// ~10% (11/9/7/6/7 -> 10/8/6/5/6)
// ฟีดแบ็ก "Hero Area ลด Metric Cards จาก 5 → 4 — Fat Mass กับ Body Fat % สัมพันธ์กันสูง ไม่จำเป็นต้อง
// เห็นทั้งคู่ตั้งแต่ Dashboard" — Fat Mass ยังดูได้เต็มรูปแบบที่ /health (มี section ของตัวเองอยู่แล้ว,
// ไม่ใช่ component นี้) แถวนี้ (ใช้เฉพาะ Dashboard) จึงตัดการ์ด fatMass ออกจาก cards ด้านล่าง เหลือแค่
// Weight/Body Fat/Muscle/BMI — เก็บ entry fatMass ไว้ใน record นี้ต่อ (type ยังต้องครอบ MetricIconImageKey
// เต็มรูปแบบ เพราะ CardDef.icon ใช้ type เดียวกัน ไม่คุ้มจะแยก type ย่อยเพื่อเอนทรีที่ไม่ได้ใช้แค่จุดเดียว)
const METRIC_THEME: Record<MetricIconImageKey, MetricCardTheme> = {
  weight: { main: '#F59E0B', second: '#D97706', glow: 10 },
  bodyFat: { main: '#EC4899', second: '#DB2777', glow: 8 },
  muscle: { main: '#3B82F6', second: '#2563EB', glow: 6 },
  fatMass: { main: '#22C55E', second: '#16A34A', glow: 5 },
  bmi: { main: '#1b8cff', second: '#3f6cff', glow: 6 },
}

// exported so DashboardView's AI Coach card can reuse the exact same query (react-query
// dedupes by key — sharing this avoids a second network round-trip for the same data)
export const BODY_METRICS_QUERY_KEY = ['body-metrics-summary']

export async function fetchBodyMetricsData(supabase: ReturnType<typeof createClient>) {
  const [{ data: metricsRows }, { data: profileRow }, { data: goalRows }] = await Promise.all([
    // ฟีดแบ็ก "อยากเลือกดูแนวโน้ม 7/30/90 วัน หรือทั้งหมด" — เดิม limit 30 พอแค่สำหรับ "เอนทรีก่อนหน้า
    // ล่าสุด" (ไม่ว่าจะห่างกี่วัน) แต่ไม่พอสำหรับผู้ใช้ที่บันทึกถี่ (รายวัน) จะเทียบกรอบ 90 วัน/ทั้งหมด
    // ได้จริง (30 แถวของคนบันทึกทุกวัน = ย้อนได้แค่ 30 วัน) — เพิ่มเป็น 400 (>1 ปีสำหรับคนบันทึกรายวัน)
    supabase.from('body_metrics').select('*').order('measured_at', { ascending: false }).limit(400),
    supabase.from('profiles').select('height_cm').maybeSingle(),
    // ตารางเดียวกับที่หน้า /health ใช้อยู่แล้ว (goal_type weight/body_fat) — เอาไว้แสดง Goal Progress
    // ใน MetricDetailSheet ตอนแตะการ์ด ไม่ต้องเพิ่ม field/schema ใหม่ (ดู lib/goalProgress.ts)
    supabase.from('goals').select('*').in('goal_type', ['weight', 'body_fat']).eq('status', 'active'),
  ])
  return {
    metrics: (metricsRows as BodyMetric[]) ?? [],
    heightCm: (profileRow as Pick<Profile, 'height_cm'> | null)?.height_cm ?? null,
    goals: (goalRows as Goal[]) ?? [],
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
  // เฉพาะ weight/bodyFat (ตาราง goals รองรับแค่ goal_type สองแบบนี้) — ใช้โชว์ Goal Progress ใน
  // MetricDetailSheet ตอนแตะการ์ด (compact/มือถือเท่านั้น) null = ยังไม่ได้ตั้งเป้าหมาย
  goal: { targetText: string; progressPct: number | null } | null
}

function fmtSigned(n: number, decimals: number, suffix: string): string {
  const sign = n > 0 ? '+' : n < 0 ? '' : '±'
  return `${sign}${n.toFixed(decimals)}${suffix}`
}

export default function BodyMetricsRow({
  showLastMeasuredDate = false,
  maxCards,
  compact = false,
  title,
  titleHref,
}: {
  showLastMeasuredDate?: boolean
  maxCards?: number
  // เฉพาะ Mobile Dashboard v2 — ลด padding การ์ดเมตริกลงให้กระชับขึ้นใน grid 2x2 (ดู MetricCard.tsx)
  compact?: boolean
  // ฟีดแบ็ก "แถวปุ่มเลือกช่วงเวลากินพื้นที่แค่มุมขวา ~20% เหลือพื้นที่ว่างซ้าย-กลาง 80% ก่อนถึงการ์ด" —
  // เดิม MobileDashboardView.tsx มีหัวข้อ "ภาพรวมร่างกาย" ของตัวเองอยู่แล้วเป็นแถวแยกต่างหากเหนือ
  // component นี้ (ทำให้เกิดแถวว่างซ้ำซ้อนอีกชั้นตอนเพิ่ม pill เข้าไป) ส่วน DashboardView.tsx (เดสก์ท็อป)
  // ไม่เคยมีหัวข้อเลยตั้งแต่แรก — ย้ายหัวข้อมาเป็น prop ของ component นี้แทน ให้ title กับ pill อยู่แถว
  // เดียวกันเสมอ (flex justify-between) ทั้งสองแพลตฟอร์ม — undefined = ไม่โชว่หัวข้อ (พฤติกรรมเดิม)
  title?: string
  // ลิงก์ "ดูทั้งหมด →" เล็กๆ ข้างหัวข้อ (มือถือเดิมมีอยู่แล้วแยกต่างหาก) — ไม่มีค่า = ไม่โชว์ลิงก์นี้
  titleHref?: string
} = {}) {
  const supabase = createClient()
  const { toDisplay, unit } = useWeightUnit()

  const { data, isLoading } = useQuery({
    queryKey: BODY_METRICS_QUERY_KEY,
    queryFn: () => fetchBodyMetricsData(supabase),
    staleTime: 60_000,
  })

  // key ของการ์ดที่กำลังเปิด MetricDetailSheet อยู่ (compact/มือถือเท่านั้น) — null = ปิดอยู่
  const [openKey, setOpenKey] = useState<string | null>(null)

  // ฟีดแบ็ก "อยากเลือกดูแนวโน้ม 7/30/90 วัน หรือทั้งหมด แทนที่ระบบเลือกช่วงเวลาเอง" — ดีฟอลต์ 30 วัน
  // (กรอบมาตรฐานที่แอปติดตามน้ำหนัก/ฟิตเนสทั่วไปใช้เป็นค่าเริ่มต้น) ทุกการ์ดใช้กรอบเวลาเดียวกัน เพราะ
  // ทุกเมตริกมาจากแถวเดียวกันเสมอ (บันทึกน้ำหนัก/ไขมัน/กล้ามเนื้อพร้อมกันในครั้งเดียว)
  const [timeframe, setTimeframe] = useState<MetricsTimeframe>(30)
  const TIMEFRAME_OPTIONS: { value: MetricsTimeframe; label: string }[] = [
    { value: 7, label: '7D' },
    { value: 30, label: '30D' },
    { value: 90, label: '90D' },
    { value: 'all', label: 'All' },
  ]

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

  const { metrics, heightCm, goals } = data

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

  const summary = computeBodyMetricsSummary(metrics, heightCm, timeframe)
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
  // v39: เดิม (m) => m.skeletal_muscle_kg ?? m.muscle_kg ?? null ผสมสองฟิลด์ที่เป็นคนละตัวชี้วัดกันจริง
  // (ดู comment ยาวใน lib/bodyMetricsSummary.ts) เข้าเป็นเส้นกราฟเดียว — ถ้าเอนทรีเก่ามีแต่ muscle_kg
  // (กล้ามเนื้อรวม ~58kg) แล้วเอนทรีใหม่เปลี่ยนมาบันทึก skeletal_muscle_kg (กล้ามเนื้อโครงร่าง ~36kg)
  // กราฟจะวาดเป็นเส้นดิ่งลงหนักที่ไม่ใช่การเปลี่ยนแปลงจริงเลย — ล็อกให้ทั้งกราฟใช้ฟิลด์เดียวกับเอนทรีล่าสุด
  // เท่านั้น (เอนทรีเก่าที่ไม่มีฟิลด์นั้นจะถูกกรองออกจากกราฟไปเลย ไม่ใช่ไปหยิบฟิลด์อื่นมาแทน)
  const latestMuscleField: (m: BodyMetric) => number | null =
    metrics[0]?.skeletal_muscle_kg != null ? (m) => m.skeletal_muscle_kg : (m) => m.muscle_kg
  const muscleSeries = seriesFor(latestMuscleField)
  const bmiSeries = seriesFor((m) => bmiOf(m.weight_kg, heightCm))

  // เป้าหมาย active ล่าสุดต่อประเภท (ตาราง goals รองรับแค่ weight/body_fat — เหมือนหน้า /health)
  const weightGoal = goals.find((g) => g.goal_type === 'weight')
  const bodyFatGoal = goals.find((g) => g.goal_type === 'body_fat')
  // v62: ฟีดแบ็ก "ทำ progress % เป็นเรียลไทม์ตลอดการบันทึก แทนที่จะแช่แข็งตอนตั้งเป้าหมาย" (จาก /health) —
  // หาค่าเก่าที่สุดที่มีบันทึกจริงจาก chronological (เรียงเก่า→ใหม่อยู่แล้ว) ส่งเข้า goalProgressPct แทนการ
  // ปล่อยให้ใช้ starting_value ที่แช่แข็งไว้ตอนสร้างเป้าหมายเสมอ — ให้ตรงกับพฤติกรรมหน้า /health เป๊ะ
  const earliestWeight = chronological.find((m) => m.weight_kg != null)?.weight_kg ?? null
  const earliestBodyFat = chronological.find((m) => m.body_fat_pct != null)?.body_fat_pct ?? null
  const weightGoalDetail =
    weightGoal?.target_value != null
      ? { targetText: `${toDisplay(weightGoal.target_value).toFixed(1)} ${unit}`, progressPct: goalProgressPct(weightGoal, summary.weight.value, earliestWeight) }
      : null
  const bodyFatGoalDetail =
    bodyFatGoal?.target_value != null
      ? { targetText: `${bodyFatGoal.target_value.toFixed(1)} %`, progressPct: goalProgressPct(bodyFatGoal, summary.bodyFatPct.value, earliestBodyFat) }
      : null

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
      goal: weightGoalDetail,
    },
    {
      key: 'bodyFat',
      icon: 'bodyFat',
      // ย่อจาก "ไขมันในร่างกาย" — ชื่อเดิมยาวจนตัดบรรทัด ("ไขมันใน" / "ร่างกาย") บนการ์ดมือถือแคบๆ
      // ทำให้การ์ดสูงขึ้นโดยไม่จำเป็น เปลี่ยนเป็นย่อที่ยังสื่อความหมายชัดเจนในบริบทการ์ด body composition
      label: 'ไขมัน (%)',
      valueText: summary.bodyFatPct.value != null ? `${summary.bodyFatPct.value.toFixed(1)} %` : '—',
      deltaText: summary.bodyFatPct.delta != null ? `${fmtSigned(summary.bodyFatPct.delta, 1, '%')} ${period}` : null,
      deltaColor: summary.bodyFatPct.isGood == null ? NEUTRAL.mutedIcon : summary.bodyFatPct.isGood ? COLORS.deltaGood : COLORS.rust,
      deltaDir: summary.bodyFatPct.delta == null ? null : summary.bodyFatPct.delta > 0 ? 'up' : summary.bodyFatPct.delta < 0 ? 'down' : null,
      series: bodyFatSeries,
      goal: bodyFatGoalDetail,
    },
    {
      key: 'muscle',
      icon: 'muscle',
      // ย่อจาก "กล้ามเนื้อโครงร่าง" — เหตุผลเดียวกับ "ไขมัน (%)" ด้านบน
      label: 'กล้ามเนื้อ',
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
      goal: null,
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
      goal: null,
    },
  ]

  const openCard = cards.find((c) => c.key === openKey) ?? null

  // compact (มือถือ): cardGap จาก dashboardSpec.metricCard.gridGap (12px) แหล่งความจริงเดียว —
  // ใช้ style แทน Tailwind class เพราะ JIT อ่านค่าจากตัวแปรไม่ได้ (เหมือนจุดอื่นในไฟล์ที่ใช้ token)
  return (
    <>
      {/* ฟีดแบ็ก "แถวปุ่มเลือกช่วงเวลากินพื้นที่แค่มุมขวา ~20% เหลือพื้นที่ว่างซ้าย-กลาง 80%" — เลือก
          แบบที่ 1 ที่ผู้ใช้แนะนำ: ใส่หัวข้อฝั่งซ้าย (title/titleHref prop) ให้แถวนี้สมดุลซ้าย-ขวา แทนที่
          จะปล่อยว่างเปล่า — title เป็น undefined เมื่อจุดเรียกไม่ได้ส่งมา (ไม่โชว่อะไรฝั่งซ้ายเหมือนเดิม)
          pill เดียวกับแพทเทิร์นที่ WeeklyMuscleHeatmap.tsx ใช้ (rounded-full border bg-surface2, active =
          amber tint) เปลี่ยนกรอบเวลาแล้วทุกการ์ดคำนวณ delta ใหม่ทันที (ไม่ query ซ้ำ — ข้อมูลดิบ 400 แถว
          ล่าสุดโหลดมาแล้วครั้งเดียว แค่เลือกเอนทรีที่ใช้เทียบใหม่) */}
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {title && (
            <p
              className={compact ? 'font-display text-ink' : 'font-display text-sm tracked uppercase text-ink'}
              style={compact ? { fontSize: 17, fontWeight: 700 } : undefined}
            >
              {title}
            </p>
          )}
          {titleHref && (
            <Link href={titleHref} className="text-[11px] text-amber hover:underline shrink-0">
              ดูทั้งหมด →
            </Link>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-0.5 rounded-full border border-line bg-surface2 p-0.5">
          {TIMEFRAME_OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => setTimeframe(opt.value)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
              style={timeframe === opt.value ? { backgroundColor: '#E8A33D22', color: '#E8A33D' } : { color: '#9498A0' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 ${compact ? '' : 'gap-3'}`}
        style={compact ? { gap: dashboardSpec.metricCard.gridGap } : undefined}
      >
        {cards.slice(0, maxCards ?? cards.length).map((c) => {
          const card = (
            <MetricCard
              icon={c.icon}
              label={c.label}
              valueText={c.valueText}
              deltaText={c.deltaText}
              deltaColor={c.deltaColor}
              deltaDir={c.deltaDir}
              series={c.series}
              theme={METRIC_THEME[c.icon]}
              lastMeasuredText={lastMeasuredText}
              tall={showLastMeasuredDate}
              radius="xl20"
              compact={compact}
            />
          )
          // เพิ่ม hierarchy ให้ "น้ำหนัก" เป็นการ์ดหลัก โดยไม่แตะขนาด/font/glow ของ MetricCard.tsx เอง
          // (component ที่ tuned มาหลายสิบรอบ และใช้ร่วมกับหน้า /health ด้วย) — ลดน้ำหนักภาพของการ์ดรอง
          // ผ่าน wrapper เฉยๆ แทนที่จะเพิ่มความเข้มให้การ์ดน้ำหนัก โดย BMI ลดเพิ่มอีกขั้น เพราะ
          // actionable value ต่ำกว่า Weight/Fat/Muscle สำหรับหน้า Dashboard นี้
          const secondaryStyle = c.key === 'weight' ? undefined : c.key === 'bmi' ? { opacity: 0.8 } : { opacity: 0.92 }
          // แตะเปิด MetricDetailSheet ได้เฉพาะ compact (มือถือ) — เดสก์ท็อปมี Goal Progress ของตัวเอง
          // อยู่แล้วที่หน้า /health (Health Score banner) ไม่ต้องซ้ำจุดนี้
          if (!compact) return <div key={c.key} style={secondaryStyle}>{card}</div>
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setOpenKey(c.key)}
              className="w-full text-left"
              style={secondaryStyle}
              aria-haspopup="dialog"
            >
              {card}
            </button>
          )
        })}
      </div>

      {compact && (
        <MetricDetailSheet
          open={openCard != null}
          onClose={() => setOpenKey(null)}
          card={
            openCard && {
              icon: openCard.icon,
              label: openCard.label,
              valueText: openCard.valueText,
              deltaText: openCard.deltaText,
              deltaColor: openCard.deltaColor,
              deltaDir: openCard.deltaDir,
              theme: METRIC_THEME[openCard.icon],
              goal: openCard.goal,
              series: openCard.series,
            }
          }
        />
      )}
    </>
  )
}
