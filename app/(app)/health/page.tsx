'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  ResponsiveContainer,
  LineChart,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  ReferenceLine,
  LabelList,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import type { BodyMetric, Goal, Profile, ProgressPhoto } from '@/lib/types'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import GoalRing from '@/components/GoalRing'
import InsightCard from '@/components/InsightCard'
import type { Insight } from '@/lib/dashboardStats'
import { zoneOf, classifyMetric, computeHealthTrendInsights, type Direction, type Zone } from '@/lib/healthInsights'
import { computeHealthScore, type HealthScoreRanges, type HealthScoreResult, type ScoreDirection } from '@/lib/healthScore'
import { periodLabelOf } from '@/lib/bodyMetricsSummary'
import { goalProgressPct as sharedGoalProgressPct } from '@/lib/goalProgress'
import { saveAge } from '@/lib/profile'
import { computeBmr, computeTdee, ACTIVITY_MULTIPLIERS, ACTIVITY_LEVEL_LABELS, type ActivityLevel } from '@/lib/bmr'
import PremiumCard from '@/components/ui/PremiumCard'
import BeforeAfterSlider from '@/components/BeforeAfterSlider'
import ProgressTimelineCard from '@/components/ProgressTimelineCard'
import { CARD_GRADIENT_CSS } from '@/lib/theme'
import Sparkline from '@/components/dashboard/Sparkline'

function todayStr() {
  const d = new Date()
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 10)
}

function shortLabel(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

// ฟีดแบ็ก "↑ 0.9 kg / จาก 3 สัปดาห์ก่อน / น้ำหนักเพิ่ม... — สามบรรทัดเยอะไปนิด อยากได้ ↑ 0.9 kg · 3 สัปดาห์
// รวมบรรทัดเดียว" — รูปแบบสั้นกว่า periodLabelOf (lib/bodyMetricsSummary — คืนวลีเต็ม "จาก X ก่อน" ไว้ใช้
// เป็นประโยคเดี่ยว) ตัดคำ "จาก"/"ก่อน"/"ที่แล้ว" ออก เหลือแค่ระยะเวลาล้วนๆ สำหรับต่อท้ายเดลต้าด้วย "·"
function compactPeriodLabel(latest: BodyMetric | null, previous: BodyMetric | null): string | null {
  if (!latest || !previous) return null
  const days = Math.round((new Date(latest.measured_at).getTime() - new Date(previous.measured_at).getTime()) / 86400000)
  if (days <= 0) return null
  if (days === 1) return 'เมื่อวาน'
  if (days <= 6) return `${days} วัน`
  if (days <= 13) return '1 สัปดาห์'
  if (days <= 24) return `${Math.round(days / 7)} สัปดาห์`
  if (days <= 45) return '1 เดือน'
  return `${Math.round(days / 30)} เดือน`
}

// ฟีดแบ็ก "Health Score Banner อยากได้บล็อก 'ล่าสุด' เป็นวันที่ + เวลา (เช่น 4 ส.ค. 2569 / 09:15 น.)" —
// ใช้ created_at (timestamptz จริง ตอนบันทึกแถว) ไม่ใช่ measured_at (แค่วันที่ผู้ใช้เลือกเอง อาจย้อนหลังได้
// ไม่มีเวลา) — th-TH locale ให้ปี พ.ศ. + รูปแบบวันที่ไทยให้อัตโนมัติ
function formatDateTimeTH(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: `${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`,
  }
}

// ปัดเป็นหน่วยหยาบพอ (นาที/ชม./วัน) ไม่ต้อง re-render ทุกวินาที — รูปแบบเดียวกับ relativeUpdatedLabel ใน
// AICoachCompactCard.tsx (คนละไฟล์ คนละโดเมนข้อมูล เลยไม่ import ข้ามมา แต่ตั้งใจให้เขียนข้อความออกมาเหมือนกัน
// ให้ทั้งแอปพูดเรื่อง "อัปเดตล่าสุด" ด้วยภาษาเดียวกัน)
function relativeUpdatedLabel(lastUpdatedAt: number): string {
  const diffMs = Date.now() - lastUpdatedAt
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'เมื่อสักครู่'
  if (mins < 60) return `${mins} นาทีที่แล้ว`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ชม.ที่แล้ว`
  const days = Math.floor(hours / 24)
  return `${days} วันที่แล้ว`
}

function bmiOf(weightKg: number | null, heightCm: number | null) {
  if (!weightKg || !heightCm) return null
  const h = heightCm / 100
  return weightKg / (h * h)
}

// มวลไร้ไขมัน (Lean Body Mass) = น้ำหนักตัว - มวลไขมัน — ใช้ body_fat_kg ถ้ามีจากเครื่องชั่ง bioimpedance
// โดยตรง ไม่งั้นคำนวณจาก weight * body_fat_pct (สูตรเดียวกับ fatMassOf ใน lib/bodyMetricsSummary.ts)
function lbmOf(m: { weight_kg: number | null; body_fat_kg: number | null; body_fat_pct: number | null }): number | null {
  const w = m.weight_kg
  if (w == null) return null
  const fatMass = m.body_fat_kg ?? (m.body_fat_pct != null ? (w * m.body_fat_pct) / 100 : null)
  if (fatMass == null) return null
  return w - fatMass
}

// v40: เปลี่ยนจากหารด้วยน้ำหนักตัวรวม (proteinKg / weightKg) มาหารด้วย "มวลไร้ไขมัน (LBM)" แทน —
// โปรตีนเป็นส่วนประกอบของ LBM เท่านั้น (ไขมันมีโปรตีนแทบ 0%) หารด้วยน้ำหนักตัวรวมจะปนสถานะไขมันเข้ากับ
// สถานะโปรตีน (คนไขมันเยอะขึ้นจะโดนตัดสินว่า "โปรตีนต่ำ" ทั้งที่โปรตีนจริงอาจปกติดี) — หมายเหตุ: นี่เป็น
// การตัดสินใจเชิงวิธีคิด ไม่ใช่บั๊กที่ยืนยันได้ชัดเจน — ค้นข้อมูลเพิ่มพบว่าเครื่องชั่ง bioimpedance ทั่วไปใน
// ตลาดมักรายงาน "Protein %" เทียบกับน้ำหนักตัวรวม (แบบเดิม) ไม่ใช่ LBM และไม่พบแหล่งอ้างอิงที่ยืนยันตรงๆ
// ว่าเกณฑ์ 18-22%/14-18% ในนี้ถูกออกแบบมาสำหรับฝั่งไหนกันแน่ — เลือกใช้ LBM ตามที่ยืนยันกับผู้ใช้แล้ว เพราะ
// แยกสถานะโปรตีนออกจากระดับไขมันได้แม่นยำกว่าทางทฤษฎี แม้จะไม่ตรง convention ตลาดทั่วไปก็ตาม — เกณฑ์
// ตัวเลขคงเดิมทั้งหมด (ตรงกับสัดส่วนโปรตีนใน LBM ตามหลักสรีรวิทยาทั่วไป ~20% พอดี) ไม่ต้องปรับ
// ถ้ายังไม่ตั้งเพศไว้ในโปรไฟล์ หรือไม่มีข้อมูลไขมันให้คำนวณ LBM จะคืนค่า null (ยังประเมินไม่ได้ ไม่เดาให้)
function proteinPctZone(proteinKg: number, lbmKg: number, sex: 'male' | 'female' | null): Zone | null {
  if (!lbmKg || !sex) return null
  const pct = (proteinKg / lbmKg) * 100
  const [low, high] = sex === 'male' ? [18, 22] : [14, 18]
  if (pct < low) return 'Low'
  if (pct > high) return 'High'
  return 'Standard'
}

// เกณฑ์ % ไขมันในร่างกาย — แยกตามเพศ (สรีระชายมีสัดส่วนไขมันตามธรรมชาติต่ำกว่าหญิง):
// ชาย: min 2, มาตรฐาน 10-20%, max 40 | หญิง: min 8, มาตรฐาน 18-28%, max 48
// ถ้ายังไม่ตั้งเพศไว้ในโปรไฟล์ จะ fallback ไปใช้เกณฑ์ผู้หญิง (ช่วงกว้างกว่า จึงระมัดระวังกว่า)
function bodyFatPctRange(sex: 'male' | 'female' | null): { min: number; low: number; high: number; max: number } {
  if (sex === 'male') return { min: 2, low: 10, high: 20, max: 40 }
  return { min: 8, low: 18, high: 28, max: 48 }
}

// สัดส่วนน้ำในร่างกายต่อน้ำหนักตัว (%) — เกณฑ์แยกตามเพศ (สรีระชาย/หญิงมีสัดส่วนไขมัน-กล้ามเนื้อต่างกัน):
// ชาย: ต่ำ < 55%, มาตรฐาน 55-65%, สูง > 65% | หญิง: ต่ำ < 45%, มาตรฐาน 45-60%, สูง > 60%
// ถ้ายังไม่ตั้งเพศไว้ในโปรไฟล์ จะคืนค่า null (ยังประเมินไม่ได้ ไม่เดาเพศให้)
function bodyWaterPctZone(waterKg: number, weightKg: number, sex: 'male' | 'female' | null): Zone | null {
  if (!weightKg || !sex) return null
  const pct = (waterKg / weightKg) * 100
  const [low, high] = sex === 'male' ? [55, 65] : [45, 60]
  if (pct < low) return 'Low'
  if (pct > high) return 'High'
  return 'Standard'
}

import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'
import ImportBodyReportPhoto, { ExtractedBodyReport } from '@/components/ImportBodyReportPhoto'

type TrendDef = {
  key: string
  label: string
  color: string
  unit: string
  data: { label: string; value: number }[]
  iconKey?: 'weight' | 'fat' | 'muscle' | 'water' | 'bmi' | 'salt' | 'protein' | 'fire' | 'ruler' | 'heart' | 'bone'
  range?: { low: number; high: number; min: number; max: number; note?: string }
  direction?: Direction
  decimals?: number
}

export default function HealthPage() {
  const supabase = createClient()
  const { unit, toDisplay, format } = useWeightUnit()
  const [metrics, setMetrics] = useState<BodyMetric[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [photos, setPhotos] = useState<(ProgressPhoto & { url?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจครอบใหม่): ปุ่มลบ body_metric แถวเดียวเดิมไม่เช็ค error ของ Supabase เลย —
  // ถ้าลบพัง (RLS/เน็ตหลุด) UI จะยัง optimistic-update ว่าลบสำเร็จ (แถวหายจากลิสต์) ทั้งที่แถวจริงในฐานข้อมูล
  // ไม่เปลี่ยน แล้ว "โผล่กลับมา" เงียบๆ ตอนโหลดหน้าใหม่ครั้งถัดไปโดยไม่มี error ให้เห็นเลย
  const [metricDeleteError, setMetricDeleteError] = useState<string | null>(null)
  const [tab, setTab] = useState<'overview' | 'trends' | 'log' | 'photos'>('overview')
  const [trendGroup, setTrendGroup] = useState<'comp' | 'measure'>('comp')
  const [trendMetric, setTrendMetric] = useState<number | 'all'>('all')
  const [trendPeriodDays, setTrendPeriodDays] = useState<7 | 30 | 90>(90)
  const [showAllMetrics, setShowAllMetrics] = useState(false)
  // v59: ฟีดแบ็ก (เอกสาร handoff P1) "แยกเกณฑ์ที่อ้างอิงทั่วไป (BMI/Body Fat/Visceral Fat) ออกจากเป้าหมาย
  // ส่วนบุคคล (Weight/Muscle/Body Fat target) ให้ชัด" — สองอย่างนี้แยกตำแหน่งอยู่แล้วจริงๆ (zone pill บนการ์ด
  // = อ้างอิงทั่วไป, คอลัมน์ "เป้าหมายร่างกาย" ใน Health Score banner = เป้าหมายส่วนตัว) แต่ไม่เคยระบุ
  // ความสัมพันธ์นี้ตรงๆ ที่ไหนเลย — เพิ่มปุ่ม ⓘ toggle ข้างหัวข้อ Key Metrics (กลไกเดียวกับที่การ์ด Body Age
  // มีอยู่แล้ว) แทนข้อความถาวร กันเพิ่มความสูงหน้าแบบไม่จำเป็น (ฟีดแบ็กหลายรอบก่อนขอให้ลด density)
  const [showRangeVsGoalInfo, setShowRangeVsGoalInfo] = useState(false)
  const [goals, setGoals] = useState<Goal[]>([])
  // เวลาที่โหลดข้อมูลหน้านี้สำเร็จจริงล่าสุด (ไม่ใช่วันที่ "วัดร่างกาย" ซึ่งเป็นคนละความหมาย — measured_at
  // เป็นวันที่ไม่มีเวลา ส่วนอันนี้คือเวลาจริงที่ดึงข้อมูลจาก Supabase สำเร็จ) ใช้โชว์ "อัปเดตล่าสุด Xนาทีที่แล้ว"
  // แบบมีข้อมูลจริงรองรับ (เหมือน lastUpdatedAt ใน AICoachCompactCard.tsx) แทนการใส่ "Connected [ชื่อเครื่อง]"
  // หรือเวลา sync แบบเป๊ะนาทีที่แอปไม่มีข้อมูลจริงรองรับ (ไม่มีระบบเชื่อมต่ออุปกรณ์ Bluetooth ในแอปนี้)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const [metricsRes, profileRes, photosRes, goalsRes] = await Promise.all([
      supabase.from('body_metrics').select('*').order('measured_at', { ascending: false }).limit(60),
      supabase.from('profiles').select('*').maybeSingle(),
      supabase.from('progress_photos').select('*').order('taken_at', { ascending: false }),
      supabase.from('goals').select('*').in('goal_type', ['weight', 'body_fat']).eq('status', 'active'),
    ])

    const firstError = metricsRes.error ?? profileRes.error ?? photosRes.error
    if (firstError) {
      setLoadError(firstError.message)
      setLoading(false)
      return
    }

    setMetrics((metricsRes.data as BodyMetric[]) ?? [])
    setProfile((profileRes.data as Profile) ?? (user ? { user_id: user.id, height_cm: null, sex: null, updated_at: '' } : null))
    setGoals((goalsRes.data as Goal[]) ?? [])

    const photoRows = (photosRes.data as ProgressPhoto[]) ?? []
    if (photoRows.length > 0) {
      const { data: signed } = await supabase.storage
        .from('progress-photos')
        .createSignedUrls(
          photoRows.map((p) => p.storage_path),
          3600
        )
      const urlMap = new Map((signed ?? []).map((s) => [s.path, s.signedUrl ?? undefined]))
      setPhotos(photoRows.map((p) => ({ ...p, url: urlMap.get(p.storage_path) ?? undefined })))
    } else {
      setPhotos([])
    }
    setLoading(false)
    setLastSyncedAt(Date.now())
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const saveHeight = useCallback(
    async (heightCm: number) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        console.error('saveHeight: ไม่พบ user ที่ล็อกอินอยู่')
        throw new Error('กรุณาเข้าสู่ระบบใหม่')
      }
      const { data, error } = await supabase
        .from('profiles')
        .upsert({ user_id: user.id, height_cm: heightCm, updated_at: new Date().toISOString() })
        .select()
        .single()
      if (error) {
        console.error('saveHeight: บันทึกส่วนสูงไม่สำเร็จ', error)
        throw error
      }
      if (data) setProfile(data as Profile)
    },
    [supabase]
  )

  const handleAgeChanged = useCallback(
    async (age: number) => {
      await saveAge(supabase, age)
      setProfile((prev) => (prev ? { ...prev, age } : prev))
    },
    [supabase]
  )

  const latest = metrics[0] ?? null
  const bmi = bmiOf(latest?.weight_kg ?? null, profile?.height_cm ?? null)
  const latestLbm = latest ? lbmOf(latest) : null

  // เฉพาะข้อมูลในช่วงเวลาที่เลือกดู (7/30/90 วัน) ใช้กับกราฟแนวโน้มเท่านั้น — แท็บภาพรวมยังใช้ค่าล่าสุดจาก metrics ทั้งหมด
  const periodMetrics = useMemo(() => {
    const since = new Date()
    since.setDate(since.getDate() - trendPeriodDays)
    const offset = since.getTimezoneOffset()
    const sinceStr = new Date(since.getTime() - offset * 60000).toISOString().slice(0, 10)
    return metrics.filter((m) => m.measured_at >= sinceStr)
  }, [metrics, trendPeriodDays])

  const weightTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.weight_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.weight_kg as number) }))
  }, [periodMetrics, toDisplay])

  const bodyFatTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.body_fat_pct !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.body_fat_pct as number }))
  }, [periodMetrics])

  const muscleTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.muscle_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.muscle_kg as number) }))
  }, [periodMetrics, toDisplay])

  const waistTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.waist_cm !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.waist_cm as number }))
  }, [periodMetrics])

  const chestTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.chest_cm !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.chest_cm as number }))
  }, [periodMetrics])

  const armTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.arm_cm !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.arm_cm as number }))
  }, [periodMetrics])

  const thighTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.thigh_cm !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.thigh_cm as number }))
  }, [periodMetrics])

  const bodyFatKgTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.body_fat_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.body_fat_kg as number) }))
  }, [periodMetrics, toDisplay])

  const bodyWaterTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.body_water_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.body_water_kg as number) }))
  }, [periodMetrics, toDisplay])

  const inorganicSaltTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.inorganic_salt_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.inorganic_salt_kg as number) }))
  }, [periodMetrics, toDisplay])

  const proteinTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.protein_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.protein_kg as number) }))
  }, [periodMetrics, toDisplay])

  const skeletalMuscleTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.skeletal_muscle_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.skeletal_muscle_kg as number) }))
  }, [periodMetrics, toDisplay])

  const visceralFatTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.visceral_fat_grade !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.visceral_fat_grade as number }))
  }, [periodMetrics])

  const bmrTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.bmr_kcal !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.bmr_kcal as number }))
  }, [periodMetrics])

  const bodyAgeTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.body_age_years !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.body_age_years as number }))
  }, [periodMetrics])

  const boneMassTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.bone_mass_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.bone_mass_kg as number) }))
  }, [periodMetrics, toDisplay])

  const bmiTrend = useMemo(() => {
    if (!profile?.height_cm) return []
    return [...periodMetrics]
      .filter((m) => m.weight_kg !== null)
      .reverse()
      .map((m) => {
        const b = bmiOf(m.weight_kg, profile.height_cm)
        return b !== null ? { label: shortLabel(m.measured_at), value: Math.round(b * 10) / 10 } : null
      })
      .filter((v): v is { label: string; value: number } => v !== null)
  }, [periodMetrics, profile?.height_cm])

  // Muscle fat analysis (Low/Standard/High bar) — ใช้ค่าล่าสุดของแต่ละตัว จับคู่กับช่วงมาตรฐาน
  // ล่าสุดที่เคยกรอกไว้ (ไม่จำเป็นต้องมาจากแถวเดียวกัน เผื่อผู้ใช้กรอกช่วงไว้แค่ครั้งแรก)
  function latestNonNull(field: keyof BodyMetric): number | null {
    for (const m of metrics) {
      const v = m[field]
      if (typeof v === 'number') return v
    }
    return null
  }

  // ผลต่างของค่าล่าสุด vs ค่าที่กรอกไว้ก่อนหน้า (สแกนหาสองแถวล่าสุดที่มีค่านี้จริงๆ ไม่จำเป็นต้องเป็นแถวติดกัน)
  function fieldDelta(field: keyof BodyMetric, toDisplayFn?: (v: number) => number): number | null {
    const nonNull: number[] = []
    for (const m of metrics) {
      const v = m[field]
      if (typeof v === 'number') {
        nonNull.push(toDisplayFn ? toDisplayFn(v) : v)
        if (nonNull.length === 2) break
      }
    }
    if (nonNull.length < 2) return null
    return nonNull[0] - nonNull[1]
  }

  // BMI จากค่าน้ำหนักที่กรอกไว้ก่อนหน้า (ใช้ส่วนสูงปัจจุบันเดียวกัน เพราะส่วนสูงไม่ค่อยเปลี่ยน)
  const previousBmi = useMemo(() => {
    if (!profile?.height_cm) return null
    const nonNull: number[] = []
    for (const m of metrics) {
      if (typeof m.weight_kg === 'number') {
        nonNull.push(m.weight_kg)
        if (nonNull.length === 2) break
      }
    }
    if (nonNull.length < 2) return null
    return bmiOf(nonNull[1], profile.height_cm)
  }, [metrics, profile?.height_cm])

  // v29: ฟีดแบ็ก "Weight/Skeletal Muscle เป็น Primary, Fat Mass เป็น Secondary...ผู้ใช้ไม่ควรต้องตีความเอง
  // ว่าเลขนั้นดีหรือไม่ดี" — เพิ่ม primary (สำหรับความหนาแน่นภาพ) + delta จริง (fieldDelta เดียวกับ Key
  // Metrics/Health Score ใช้ ไม่คำนวณใหม่) ให้ MuscleFatBarRow สร้างประโยค interpretation เองจาก zone+delta
  const muscleFatItems = useMemo(() => {
    const defs: { label: string; value: number | null; low: number | null; high: number | null; delta: number | null; primary: boolean }[] = [
      {
        label: 'Weight',
        value: latest?.weight_kg ?? null,
        low: latestNonNull('weight_range_low'),
        high: latestNonNull('weight_range_high'),
        delta: fieldDelta('weight_kg', toDisplay),
        primary: true,
      },
      {
        label: 'Skeletal Muscle',
        value: latest?.skeletal_muscle_kg ?? null,
        low: latestNonNull('skeletal_muscle_range_low'),
        high: latestNonNull('skeletal_muscle_range_high'),
        delta: fieldDelta('skeletal_muscle_kg', toDisplay),
        primary: true,
      },
      {
        label: 'Fat Mass',
        value: latest?.body_fat_kg ?? null,
        low: latestNonNull('fat_mass_range_low'),
        high: latestNonNull('fat_mass_range_high'),
        delta: fieldDelta('body_fat_kg', toDisplay),
        primary: false,
      },
    ]
    return defs
      .filter((d) => d.value !== null && d.low !== null && d.high !== null && (d.high as number) > (d.low as number))
      .map((d) => ({
        label: d.label,
        value: toDisplay(d.value as number),
        low: toDisplay(d.low as number),
        high: toDisplay(d.high as number),
        delta: d.delta,
        primary: d.primary,
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics, latest, toDisplay])

  // ช่วงมาตรฐานของน้ำหนัก/กล้ามเนื้อโครงร่าง/มวลไขมัน มาจากค่าที่ผู้ใช้กรอกเองจากรายงานเครื่องชั่ง (ดู muscleFatItems ด้านบน)
  // ส่วน Body Fat%/BMI/ไขมันช่องท้อง ใช้เกณฑ์อ้างอิงทั่วไปที่ใช้กันแพร่หลาย (เช่นเดียวกับ ObesityAnalysisChart)
  // น้ำในร่างกาย/โปรตีน ก็ใช้เกณฑ์ %ต่อน้ำหนักตัวแบบเดียวกับแท็บภาพรวม/คะแนนสุขภาพ (แทนที่จะใช้ช่วงที่นำเข้าจากรูปรายงาน)
  // เพื่อให้สถานะ Low/Standard/High ตรงกันทั้งแอป ไม่ว่าจะดูจากแท็บไหน
  const weightRangeLow = latestNonNull('weight_range_low')
  const weightRangeHigh = latestNonNull('weight_range_high')
  const skeletalRangeLow = latestNonNull('skeletal_muscle_range_low')
  const skeletalRangeHigh = latestNonNull('skeletal_muscle_range_high')
  const fatMassRangeLow = latestNonNull('fat_mass_range_low')
  const fatMassRangeHigh = latestNonNull('fat_mass_range_high')
  const muscleRangeLow = latestNonNull('muscle_range_low')
  const muscleRangeHigh = latestNonNull('muscle_range_high')
  const bodyAgeRangeLow = latestNonNull('body_age_range_low')
  const bodyAgeRangeHigh = latestNonNull('body_age_range_high')
  const saltRangeLow = latestNonNull('inorganic_salt_range_low')
  const saltRangeHigh = latestNonNull('inorganic_salt_range_high')
  const boneMassRangeLow = latestNonNull('bone_mass_range_low')
  const boneMassRangeHigh = latestNonNull('bone_mass_range_high')

  // น้ำหนักตัวล่าสุด (kg ดิบ ไม่แปลงหน่วย) ใช้เป็นฐานคำนวณช่วง %ต่อน้ำหนักตัวของน้ำในร่างกาย/โปรตีน
  const weightKgForPct = latest?.weight_kg ?? null

  const bodyWaterUniversalRange = useMemo(() => {
    if (weightKgForPct === null || !profile?.sex) return undefined
    const [lowPct, highPct] = profile.sex === 'male' ? [55, 65] : [45, 60]
    const low = (weightKgForPct * lowPct) / 100
    const high = (weightKgForPct * highPct) / 100
    return {
      low: toDisplay(low),
      high: toDisplay(high),
      min: toDisplay(low) * 0.85,
      max: toDisplay(high) * 1.15,
      note: 'เกณฑ์ % น้ำต่อน้ำหนักตัว (มาตรฐานทั่วไป)',
    }
  }, [weightKgForPct, profile?.sex, toDisplay])

  const proteinUniversalRange = useMemo(() => {
    if (weightKgForPct === null) return undefined
    const low = (weightKgForPct * 16) / 100
    const high = (weightKgForPct * 20) / 100
    return {
      low: toDisplay(low),
      high: toDisplay(high),
      min: toDisplay(low) * 0.85,
      max: toDisplay(high) * 1.15,
      note: 'เกณฑ์ % โปรตีนต่อน้ำหนักตัว (มาตรฐานทั่วไป)',
    }
  }, [weightKgForPct, toDisplay])

  const compTrends: TrendDef[] = useMemo(
    () => [
      {
        key: 'weight',
        label: 'น้ำหนัก',
        color: '#E8A33D',
        unit,
        data: weightTrend,
        iconKey: 'weight',
        direction: 'neutral',
        range:
          weightRangeLow !== null && weightRangeHigh !== null
            ? { low: toDisplay(weightRangeLow), high: toDisplay(weightRangeHigh), min: toDisplay(weightRangeLow) * 0.85, max: toDisplay(weightRangeHigh) * 1.15 }
            : undefined,
      },
      {
        key: 'bodyFat',
        label: 'ไขมันในร่างกาย',
        color: '#C1503A',
        unit: '%',
        data: bodyFatTrend,
        iconKey: 'fat',
        direction: 'lowerBetter',
        range: { low: 18, high: 28, min: 8, max: 48, note: 'เกณฑ์อ้างอิงทั่วไป' },
      },
      {
        key: 'muscleMass',
        label: 'มวลกล้ามเนื้อ',
        color: '#5FA88C',
        unit,
        data: muscleTrend,
        iconKey: 'muscle',
        direction: 'higherBetter',
        range:
          muscleRangeLow !== null && muscleRangeHigh !== null
            ? { low: toDisplay(muscleRangeLow), high: toDisplay(muscleRangeHigh), min: toDisplay(muscleRangeLow) * 0.85, max: toDisplay(muscleRangeHigh) * 1.15 }
            : undefined,
      },
      {
        key: 'bodyFatKg',
        label: 'มวลไขมัน',
        color: '#C1503A',
        unit,
        data: bodyFatKgTrend,
        iconKey: 'fat',
        direction: 'lowerBetter',
        range:
          fatMassRangeLow !== null && fatMassRangeHigh !== null
            ? { low: toDisplay(fatMassRangeLow), high: toDisplay(fatMassRangeHigh), min: toDisplay(fatMassRangeLow) * 0.6, max: toDisplay(fatMassRangeHigh) * 1.4 }
            : undefined,
      },
      {
        key: 'bodyWater',
        label: 'น้ำในร่างกาย',
        color: '#3D8FE8',
        unit,
        data: bodyWaterTrend,
        iconKey: 'water',
        direction: 'neutral',
        range: bodyWaterUniversalRange,
      },
      {
        key: 'salt',
        label: 'เกลือแร่',
        color: '#A89F5F',
        unit,
        data: inorganicSaltTrend,
        iconKey: 'salt',
        direction: 'neutral',
        range:
          saltRangeLow !== null && saltRangeHigh !== null
            ? { low: toDisplay(saltRangeLow), high: toDisplay(saltRangeHigh), min: toDisplay(saltRangeLow) * 0.85, max: toDisplay(saltRangeHigh) * 1.15 }
            : undefined,
      },
      {
        key: 'protein',
        label: 'โปรตีน',
        color: '#5FA8A0',
        unit,
        data: proteinTrend,
        iconKey: 'protein',
        direction: 'neutral',
        range: proteinUniversalRange,
      },
      {
        key: 'skeletalMuscle',
        label: 'กล้ามเนื้อโครงร่าง',
        color: '#7FA85F',
        unit,
        data: skeletalMuscleTrend,
        iconKey: 'muscle',
        direction: 'higherBetter',
        range:
          skeletalRangeLow !== null && skeletalRangeHigh !== null
            ? { low: toDisplay(skeletalRangeLow), high: toDisplay(skeletalRangeHigh), min: toDisplay(skeletalRangeLow) * 0.85, max: toDisplay(skeletalRangeHigh) * 1.15 }
            : undefined,
      },
      {
        key: 'visceralFat',
        label: 'ไขมันช่องท้อง',
        color: '#C1503A',
        unit: 'ระดับ',
        data: visceralFatTrend,
        iconKey: 'fat',
        direction: 'lowerBetter',
        decimals: 0,
        range: { low: 1, high: 9, min: 1, max: 20, note: 'เกณฑ์อ้างอิงทั่วไป' },
      },
      {
        key: 'bmi',
        label: 'BMI',
        color: '#6C8CA8',
        unit: 'kg/m²',
        data: bmiTrend,
        iconKey: 'bmi',
        direction: 'neutral',
        range: { low: 18.5, high: 25, min: 10, max: 40, note: 'เกณฑ์อ้างอิงทั่วไป' },
      },
      {
        key: 'boneMass',
        label: 'มวลกระดูก',
        color: '#B08968',
        unit,
        data: boneMassTrend,
        iconKey: 'bone',
        direction: 'neutral',
        range:
          boneMassRangeLow !== null && boneMassRangeHigh !== null
            ? { low: toDisplay(boneMassRangeLow), high: toDisplay(boneMassRangeHigh), min: toDisplay(boneMassRangeLow) * 0.7, max: toDisplay(boneMassRangeHigh) * 1.3 }
            : undefined,
      },
      {
        key: 'bmr',
        label: 'BMR',
        color: '#5FA85F',
        unit: 'kcal',
        data: bmrTrend,
        iconKey: 'fire',
        decimals: 0,
        range: { low: 1400, high: 2000, min: 1000, max: 2500, note: 'ช่วงอ้างอิงทั่วไป ไม่ใช่ค่าคำนวณเฉพาะบุคคล' },
      },
      {
        key: 'bodyAge',
        label: 'อายุร่างกาย',
        color: '#CF715F',
        unit: 'ปี',
        data: bodyAgeTrend,
        iconKey: 'heart',
        direction: 'lowerBetter',
        decimals: 0,
        range:
          bodyAgeRangeLow !== null && bodyAgeRangeHigh !== null
            ? { low: bodyAgeRangeLow, high: bodyAgeRangeHigh, min: bodyAgeRangeLow * 0.6, max: bodyAgeRangeHigh * 1.3 }
            : undefined,
      },
    ],
    [
      unit,
      toDisplay,
      weightTrend,
      bodyFatTrend,
      muscleTrend,
      bodyFatKgTrend,
      bodyWaterTrend,
      inorganicSaltTrend,
      proteinTrend,
      skeletalMuscleTrend,
      visceralFatTrend,
      bmiTrend,
      bmrTrend,
      bodyAgeTrend,
      weightRangeLow,
      weightRangeHigh,
      skeletalRangeLow,
      skeletalRangeHigh,
      fatMassRangeLow,
      fatMassRangeHigh,
      muscleRangeLow,
      muscleRangeHigh,
      bodyAgeRangeLow,
      bodyAgeRangeHigh,
      bodyWaterUniversalRange,
      saltRangeLow,
      saltRangeHigh,
      proteinUniversalRange,
      boneMassTrend,
      boneMassRangeLow,
      boneMassRangeHigh,
    ]
  )

  const measureTrends: TrendDef[] = useMemo(
    () => [
      { key: 'waist', label: 'รอบเอว', color: '#6C8CA8', unit: 'ซม.', data: waistTrend, iconKey: 'ruler' },
      { key: 'chest', label: 'รอบอก', color: '#A87F5F', unit: 'ซม.', data: chestTrend, iconKey: 'ruler' },
      { key: 'arm', label: 'รอบต้นแขน', color: '#8C6CA8', unit: 'ซม.', data: armTrend, iconKey: 'ruler' },
      { key: 'thigh', label: 'รอบต้นขา', color: '#5F8FA8', unit: 'ซม.', data: thighTrend, iconKey: 'ruler' },
    ],
    [waistTrend, chestTrend, armTrend, thighTrend]
  )

  // ทิศทางที่ "ดีขึ้น" ของน้ำหนัก/BMI อ้างอิงจากเป้าหมายน้ำหนักที่ตั้งไว้ (ถ้ามี): ถ้าเป้าหมายต่ำกว่าจุดเริ่มต้นคือลดน้ำหนัก, สูงกว่าคือเพิ่มน้ำหนัก
  // ถ้ายังไม่ได้ตั้งเป้าหมาย ใช้ค่าเริ่มต้นเป็น "ลดน้ำหนักคือดีขึ้น" ซึ่งเป็นกรณีที่พบบ่อยที่สุด — ย้ายมาไว้ก่อน
  // engine คะแนนสุขภาพใหม่ (เดิมอยู่หลังจุดนี้) เพราะตอนนี้ต้องใช้ weightDirection คำนวณหมวด Progress ด้วย
  const weightGoal = goals.find((g) => g.goal_type === 'weight' && g.status === 'active')
  const weightDirection: Direction =
    weightGoal && weightGoal.target_value !== null && weightGoal.starting_value !== null
      ? weightGoal.target_value < weightGoal.starting_value
        ? 'lowerBetter'
        : weightGoal.target_value > weightGoal.starting_value
          ? 'higherBetter'
          : 'neutral'
      : 'lowerBetter'

  // v32: สูตร Health Score — แทนที่ pass/fail เดิม (computeScoreItems) ทั้งหมด เอนจิ้นจริงอยู่ที่
  // lib/healthScore.ts (มีเทสต์ครบ) ไฟล์นี้แค่ประกอบ ranges/age/heightCm จากข้อมูลจริงแล้วเรียกใช้ — น้ำหนัก
  // ต่อหมวดล่าสุดดูที่คอมเมนต์หัวไฟล์ lib/healthScore.ts (เปลี่ยนหลายรอบแล้ว ไม่ทวนซ้ำที่นี่กันหลุดจากกัน)
  // v35: เพิ่ม age/heightCm เข้า params เพื่อคำนวณ BMR ที่คาดหวัง (Mifflin-St Jeor) เทียบกับ BMR วัดจริง
  const healthScoreRanges: HealthScoreRanges = {
    skeletalMuscleLow: skeletalRangeLow,
    skeletalMuscleHigh: skeletalRangeHigh,
    muscleLow: muscleRangeLow,
    muscleHigh: muscleRangeHigh,
    bodyAgeLow: bodyAgeRangeLow,
    bodyAgeHigh: bodyAgeRangeHigh,
  }
  // computeHealthScore รับแค่ lowerBetter/higherBetter (ไม่มี neutral) — กรณี weightDirection เป็น neutral
  // (เป้าหมายน้ำหนักตั้งค่าเป้าหมาย = จุดเริ่มต้นเป๊ะ กรณีหายากมาก) fallback เป็น lowerBetter เหมือนดีฟอลต์เดิม
  const scoreWeightDirection: ScoreDirection = weightDirection === 'higherBetter' ? 'higherBetter' : 'lowerBetter'

  const healthScoreResult = useMemo(
    () =>
      computeHealthScore({
        row: latest,
        prevRow: metrics[1] ?? null,
        bmi,
        sex: profile?.sex ?? null,
        ranges: healthScoreRanges,
        weightDirection: scoreWeightDirection,
        age: profile?.age ?? null,
        heightCm: profile?.height_cm ?? null,
      }),
    [latest, metrics, bmi, profile?.sex, profile?.age, profile?.height_cm, healthScoreRanges, scoreWeightDirection]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  )

  // แถวข้อมูลที่ใกล้เคียง "1 เดือนก่อน" มากที่สุด (ล่าสุดที่บันทึกไว้ ณ หรือก่อนวันนั้น) — ใช้เทียบคะแนนสุขภาพย้อนหลัง
  // ฟีดแบ็ก "จะแนะนำให้ทำ month-over-month trend ไหม" — เตือนไว้เองว่าถ้า log ไม่สม่ำเสมอ เอนทรีที่ใกล้ 30 วัน
  // ที่สุดอาจห่างจริงเกินไป (เช่น 90 วัน) แล้วป้าย "จากเดือนที่แล้ว" จะโกหก — เดิม findIndex ไม่มีขอบเขตเลย รับ
  // เอนทรีไหนก็ได้ที่ <= cutoff ไม่ว่าจะห่างแค่ไหน เพิ่มการเช็คระยะห่างจริงจาก latest.measured_at ถ้าห่างเกิน
  // 45 วัน (เผื่อ ±15 วันรอบเป้า 30 วัน) ถือว่าไม่ใช่ "เดือนที่แล้ว" จริงๆ แล้ว ไม่โชว์ trend แทนที่จะโชว์ผิดๆ
  const oneMonthAgoIndex = useMemo(() => {
    if (!latest) return -1
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const offset = cutoff.getTimezoneOffset()
    const cutoffStr = new Date(cutoff.getTime() - offset * 60000).toISOString().slice(0, 10)
    const idx = metrics.findIndex((m) => m.measured_at <= cutoffStr && m.id !== latest.id)
    if (idx < 0) return -1
    const daysGap = Math.abs(
      (new Date(latest.measured_at + 'T00:00:00').getTime() - new Date(metrics[idx].measured_at + 'T00:00:00').getTime()) /
        (1000 * 60 * 60 * 24)
    )
    return daysGap <= 45 ? idx : -1
  }, [metrics, latest])
  const oneMonthAgoMetric = oneMonthAgoIndex >= 0 ? metrics[oneMonthAgoIndex] : null
  const previousBmiForScore = bmiOf(oneMonthAgoMetric?.weight_kg ?? null, profile?.height_cm ?? null)

  const healthScoreResultPrevMonth = useMemo(
    () =>
      oneMonthAgoMetric
        ? computeHealthScore({
            row: oneMonthAgoMetric,
            prevRow: oneMonthAgoIndex >= 0 ? metrics[oneMonthAgoIndex + 1] ?? null : null,
            bmi: previousBmiForScore,
            sex: profile?.sex ?? null,
            ranges: healthScoreRanges,
            weightDirection: scoreWeightDirection,
            age: profile?.age ?? null,
            heightCm: profile?.height_cm ?? null,
          })
        : null,
    [
      oneMonthAgoMetric,
      oneMonthAgoIndex,
      metrics,
      previousBmiForScore,
      profile?.sex,
      profile?.age,
      profile?.height_cm,
      healthScoreRanges,
      scoreWeightDirection,
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  )

  // ผลต่างคะแนนสุขภาพเทียบเดือนที่แล้ว — ทั้งคู่เป็นคะแนนรวม 0-100 จากสูตรเดียวกันอยู่แล้ว ลบตรงๆ ได้เลย
  const healthScoreMonthDeltaPct =
    healthScoreResult && healthScoreResultPrevMonth ? healthScoreResult.overall - healthScoreResultPrevMonth.overall : null

  // เปอร์เซ็นต์ไทล์ของคะแนนวันนี้ เทียบกับ "ประวัติคะแนนของตัวเองย้อนหลัง" (ไม่ใช่เทียบกับผู้ใช้คนอื่น
  // เพราะแอปนี้ยังไม่มีข้อมูลรวมของผู้ใช้ทุกคนให้เทียบแบบนั้นได้จริง) ต้องมีประวัติอย่างน้อย 6 ครั้งถึงจะมีความหมาย
  const healthScorePercentile = useMemo(() => {
    if (!healthScoreResult) return null
    const history = metrics
      .map((m, i) =>
        computeHealthScore({
          row: m,
          prevRow: metrics[i + 1] ?? null,
          bmi: bmiOf(m.weight_kg, profile?.height_cm ?? null),
          sex: profile?.sex ?? null,
          ranges: healthScoreRanges,
          weightDirection: scoreWeightDirection,
          age: profile?.age ?? null,
          heightCm: profile?.height_cm ?? null,
        })
      )
      .map((r) => r?.overall ?? null)
      .filter((v): v is number => v !== null)
    if (history.length < 6) return null
    const beatCount = history.filter((v) => v <= healthScoreResult.overall).length
    return Math.max(1, Math.min(100, Math.round((beatCount / history.length) * 100)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics, profile?.height_cm, profile?.sex, profile?.age, healthScoreResult, healthScoreRanges, scoreWeightDirection])

  // Insight ที่คำนวณจากการเปลี่ยนแปลงจริงในช่วงเวลาที่เลือกดู (ไม่ใช่คำแนะนำทั่วไปที่ไม่มีข้อมูลรองรับ)
  // v49: ฟีดแบ็ก "Top Summary บอกไขมันลด แต่ Insight ด้านล่างบอกไขมันเพิ่ม — คนละฐานเวลากันแต่ไม่บอกให้ชัด"
  // — insight นี้อิง periodMetrics/trendPeriodDays (ค่าเริ่มต้น 90 วัน) ต่างจาก Top Summary ที่อิง fieldDelta
  // (ล่าสุด vs ก่อนหน้าล่าสุด) — ส่ง periodLabel ที่ระบุจำนวนวันจริงเข้าไปให้ทุก insight พูดชัดว่าเทียบช่วงไหน
  // (การ์ดนี้ใช้ทั้งในแท็บ Overview และแท็บ แนวโน้ม — แท็บแนวโน้มมี picker 7/30/90 ให้เห็นอยู่แล้ว แต่ Overview
  // ไม่มี ข้อความเลยต้องบอกในตัวเองให้ครบ ไม่พึ่ง UI context ข้างนอก)
  const healthInsights: Insight[] = useMemo(() => {
    const firstLast = (data: { value: number }[]) => (data.length > 1 ? { first: data[0].value, last: data[data.length - 1].value } : undefined)
    return computeHealthTrendInsights({
      weight: firstLast(weightTrend),
      bodyFatPct: firstLast(bodyFatTrend),
      skeletalMuscle: firstLast(skeletalMuscleTrend),
      bodyFatKg: firstLast(bodyFatKgTrend),
      muscleMass: firstLast(muscleTrend),
      bodyAge: firstLast(bodyAgeTrend),
      periodLabel: `ในช่วง ${trendPeriodDays} วันที่ผ่านมา`,
      periodShortLabel: `${trendPeriodDays} วัน`,
      weightDirection: scoreWeightDirection,
      // v60: ฟีดแบ็ก "Top Summary/Body Insights ขัดกันในสายตา (คนละช่วงเวลา) — บอกแนวโน้มล่าสุดด้วย" — เรียก
      // fieldDelta/periodLabelOf ตรงๆ แทนตัวแปร bodyFatDeltaForCard/changePeriodLabel ที่ถูก declare "หลัง"
      // useMemo นี้ในไฟล์ (const ปกติอ่านก่อนประกาศไม่ได้ — TDZ) ทั้งสองฟังก์ชันนี้ประกาศไว้ก่อนหน้าแล้วเรียกได้
      // ปลอดภัย เป็นค่าเดียวกันเป๊ะกับที่ Top Summary ใช้จริง
      recentBodyFatDelta: fieldDelta('body_fat_pct'),
      recentPeriodLabel: periodLabelOf(latest, metrics[1] ?? null) ?? undefined,
      // v75: weightTrend เป็นค่าที่ toDisplay แปลงหน่วยมาแล้ว (kg/lb ตามที่ผู้ใช้ตั้งไว้) ส่ง unit จริงเข้าไป
      // ให้ deltaLabel ของน้ำหนักแสดงหน่วยถูกต้อง (ไม่ใช่ hardcode 'kg' เสมอ)
      weightUnit: unit,
    })
  }, [weightTrend, bodyFatTrend, skeletalMuscleTrend, bodyFatKgTrend, muscleTrend, bodyAgeTrend, trendPeriodDays, scoreWeightDirection, latest, metrics, unit])

  function goalCurrentValue(goal: Goal): number | null {
    if (goal.goal_type === 'weight') return latest?.weight_kg ?? null
    if (goal.goal_type === 'body_fat') return latest?.body_fat_pct ?? null
    return null
  }

  // v60: ฟีดแบ็ก "คืบหน้าสู่เป้าหมาย 0% ทั้งที่น้ำหนัก/ไขมันลดมาใกล้เป้าหมายแล้ว" — เจอสาเหตุจริง: starting_value
  // ถูกบันทึกครั้งเดียวตอน "สร้างเป้าหมาย" (calendar/page.tsx currentBaseline() = ค่าล่าสุด ณ วันนั้น) นับ
  // ความคืบหน้าตั้งแต่วันตั้งเป้าเท่านั้น ถ้ายังไม่ได้บันทึกค่าใหม่หลังตั้งเป้าเลยจะติด 0% แม้ประวัติทั้งหมด
  // (ก่อนตั้งเป้า) จะใกล้เป้าหมายไปมากแล้ว
  // v62: ฟีดแบ็ก "ทำให้เรียลไทม์ตลอดการบันทึก" — เปลี่ยนจากใช้ starting_value เป็น fallback (ตอน null) มาใช้
  // earliestTrackedValue (ค่าเก่าที่สุดที่มีบันทึกจริงใน metrics ทั้งหมด ไม่ใช่แค่ตอนตั้งเป้า) แทนเสมอ ผ่าน
  // goalProgressPct กลางใน lib/goalProgress.ts (ตัวเดียวกับที่ BodyMetricsRow.tsx ใช้ในแดชบอร์ดมือถือ — เดิม
  // มีสูตรซ้ำกันคนละไฟล์ 2 ชุด รวมเป็นจุดเดียวกันความไม่ตรงกันในอนาคตด้วย) ทุกครั้งที่บันทึกข้อมูลใหม่ ทั้ง
  // current และ (ถ้าเป็นเอนทรีเก่าสุด) earliestTrackedValue ขยับตามอัตโนมัติ ไม่ต้อง refresh อะไรเพิ่ม
  function goalEarliestTrackedValue(goal: Goal): number | null {
    if (goal.goal_type === 'weight') {
      for (let i = metrics.length - 1; i >= 0; i--) {
        if (metrics[i].weight_kg != null) return metrics[i].weight_kg
      }
    } else if (goal.goal_type === 'body_fat') {
      for (let i = metrics.length - 1; i >= 0; i--) {
        if (metrics[i].body_fat_pct != null) return metrics[i].body_fat_pct
      }
    }
    return null
  }

  function goalProgressPct(goal: Goal): number | null {
    return sharedGoalProgressPct(goal, goalCurrentValue(goal), goalEarliestTrackedValue(goal))
  }

  const activeTrendList = trendGroup === 'comp' ? compTrends : measureTrends
  const availableTrendIdx = activeTrendList.findIndex((t) => t.data.length > 1)
  const selectedTrend =
    trendMetric !== 'all'
      ? (activeTrendList[trendMetric]?.data.length ?? 0) > 1
        ? activeTrendList[trendMetric]
        : activeTrendList[availableTrendIdx]
      : undefined
  const allTrendsWithData = activeTrendList.filter((t) => t.data.length > 1)

  if (loading) {
    return <LoadingState />
  }

  if (loadError) {
    return <ErrorState title="โหลดข้อมูลสุขภาพไม่สำเร็จ" message={loadError} onRetry={load} />
  }

  async function handleShare() {
    const shareText = `สุขภาพร่างกายของฉัน — น้ำหนัก ${latest?.weight_kg != null ? toDisplay(latest.weight_kg).toFixed(1) : '—'} ${unit}, BMI ${bmi !== null ? bmi.toFixed(1) : '—'}`
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'สุขภาพร่างกาย', text: shareText })
      } catch {
        // ผู้ใช้กดยกเลิก share sheet — ไม่ต้องทำอะไรต่อ
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(shareText)
    }
  }

  // ฟีดแบ็ก "Card ยัง Information ไม่มี Insight" — ข้อความสั้นๆ ใต้เดลต้าของการ์ดน้ำหนัก/ไขมันในร่างกาย
  // (สองการ์ดที่ฟีดแบ็กยกตัวอย่างมาตรงๆ) คำนวณจากขนาดของเดลต้าจริง ไม่ใช่ copy สำเร็จรูปที่ขึ้นเสมอ
  const weightDeltaForCard = fieldDelta('weight_kg', toDisplay)

  // ฟีดแบ็ก "↑ 0.9 kg ไม่ควรเป็นสีแดงเสมอ — ถ้าไขมันลดและกล้ามเนื้อเพิ่มพร้อมกัน น้ำหนักที่เพิ่มน่าจะมาจาก
  // กล้ามเนื้อ ซึ่งเป็นเรื่องดี" — เดิม weightDirection มาจากเป้าหมายน้ำหนักเพียงอย่างเดียว (ไม่มีเป้าหมาย =
  // ตั้งต้นเป็น "ยิ่งลดยิ่งดี" เสมอ ทำให้น้ำหนักขึ้นโดนตัดสินเป็นสีแดงทันทีไม่ว่าจะมาจากไขมันหรือกล้ามเนื้อ) —
  // เช็คสัญญาณองค์ประกอบร่างกายจริงก่อน (ไขมันไม่เพิ่ม + กล้ามเนื้อเพิ่ม ขณะน้ำหนักเพิ่ม) ถ้าเข้าเงื่อนไข
  // ให้ใช้สีกลาง (neutral/titanium แทนแดง) และเปลี่ยนข้อความ insight เป็นคำอธิบายที่มาแทนคำแนะนำทั่วไป
  const muscleDeltaForWeightCheck = fieldDelta('muscle_kg', toDisplay)
  const bodyFatDeltaForWeightCheck = fieldDelta('body_fat_pct')
  const weightGainLooksLikeMuscle =
    weightDeltaForCard !== null &&
    weightDeltaForCard > 0 &&
    bodyFatDeltaForWeightCheck !== null &&
    bodyFatDeltaForWeightCheck <= 0 &&
    muscleDeltaForWeightCheck !== null &&
    muscleDeltaForWeightCheck > 0
  // v23: ฟีดแบ็ก semantic color — "อย่าใช้สีเขียวกับทุกการเปลี่ยนแปลง...น้ำหนักเพิ่ม/ลด ควรเป็น Neutral เสมอ
  // ต่างจากไขมันลด/กล้ามเนื้อเพิ่มที่มีทิศทาง 'ดี/ไม่ดี' ชัดเจนในตัวเอง — ตัวเลขน้ำหนักอย่างเดียวไม่ควรถูก
  // ตัดสินว่าดี/แย่ (ต้องดูองค์ประกอบร่างกายประกอบ ซึ่ง weightInsight ด้านล่างเป็นคนอธิบายบริบทแทน)" — เดิม
  // บังคับ neutral เฉพาะกรณี muscle-driven เท่านั้น กรณีอื่นยังเขียว/แดงตาม weightDirection ปกติ — ตอนนี้
  // บังคับ neutral เสมอไม่ว่ากรณีไหน (ไม่ได้ลบ weightGainLooksLikeMuscle ทิ้ง ยังใช้กับ bmiCardDirection/
  // weightInsight/trendTag ต่อไปตามเดิม)
  const weightCardDirection: Direction = 'neutral'
  // ฟีดแบ็ก "BMI ↑0.3 เป็นจุดเดียวที่ดูผิดทิศ — BMI 23.5 ยังอยู่ในช่วงปกติ ถ้าไขมันลด/กล้ามเพิ่มพร้อมกัน
  // การขึ้นของ BMI ไม่ควรตัดสินเป็นสีแดง" — BMI ขยับตามน้ำหนักโดยตรง จึงใช้เงื่อนไขเดียวกับการ์ดน้ำหนักได้เลย
  // ไม่ต้องคำนวณแยก
  const bmiCardDirection: Direction = weightGainLooksLikeMuscle ? 'neutral' : weightDirection

  // ฟีดแบ็ก "ข้อความอธิบายดีมากแล้ว แต่ปรับให้ Premium ขึ้นอีกนิด" — เปลี่ยนจากวลีสั้นห้วนๆ เป็นประโยคสมบูรณ์
  // v65: ฟีดแบ็ก "'มาจากมวลกล้ามเนื้อเป็นหลัก' ฟันธงเกินไป — ค่าจากเครื่องวัดองค์ประกอบร่างกายมีความผันผวนได้"
  // — เปลี่ยนจากประโยคเชิงสาเหตุ (อ้างว่าน้ำหนักที่ขึ้น "มาจาก" กล้ามเนื้อ) เป็นประโยคเชิงบรรยายสถานะคู่ขนาน
  // (น้ำหนักขึ้น + สัดส่วนร่างกายดีขึ้น) ไม่ฟันธงความเป็นเหตุเป็นผล เงื่อนไขการเข้าเงื่อนไข (weightGainLooksLikeMuscle)
  // ไม่เปลี่ยน ยังคงคำนวณจากไขมันไม่เพิ่ม+กล้ามเนื้อเพิ่มเหมือนเดิม แค่เปลี่ยนคำพูดให้ตรงกับสิ่งที่ข้อมูลยืนยันได้จริง
  const weightInsight = weightGainLooksLikeMuscle
    ? 'น้ำหนักเพิ่มขึ้น แต่สัดส่วนร่างกายมีแนวโน้มดีขึ้น'
    : weightDeltaForCard === null
      ? null
      : Math.abs(weightDeltaForCard) < 0.5
        ? 'อยู่ในช่วงผันผวนปกติ'
        : (weightDirection === 'lowerBetter' ? weightDeltaForCard < 0 : weightDeltaForCard > 0)
          ? 'แนวโน้มดี ทำต่อไป'
          : 'ลองติดตามใกล้ชิดขึ้น'

  // ฟีดแบ็ก "Weight Card ยังมีพื้นที่ว่างอยู่ ถ้าข้อมูลในช่วง 30 วันมีไม่พอวาดกราฟ (< 2 จุด) การ์ดจะโล่งอีก
  // ทั้งที่มีข้อมูลเก่ากว่านั้นให้เทียบได้" — compactPeriodLabel ใช้ "เอนทรีก่อนหน้าล่าสุดไม่ว่าจะห่างกี่วัน"
  // (ไม่ผูกกรอบ 30 วัน) จึงให้ผลลัพธ์ที่มีความหมายแม้ผู้ใช้ log ไม่ถี่ — ต่อท้ายเดลต้าด้วย "·" บรรทัดเดียวกัน
  // v8: ฟีดแบ็ก "↑ 0.9 kg / จาก 3 สัปดาห์ก่อน คนละบรรทัดเยอะไป อยากได้ ↑ 0.9 kg · 3 สัปดาห์ รวมบรรทัดเดียว"
  // — เปลี่ยนจาก periodLabelOf (คืนประโยคเต็ม "จาก X ก่อน" ไว้ใช้เดี่ยวๆ) เป็น compactPeriodLabel (คืนแค่
  // ระยะเวลาล้วนๆ ไว้ต่อท้ายเดลต้าด้วย "·")
  const weightPeriodCaption = compactPeriodLabel(latest, metrics[1] ?? null)

  // ฟีดแบ็ก "Body Fat Card ยังไม่บอกว่าดีหรือยัง อยากเห็น Badge (Good/Normal)" — ใช้เกณฑ์ % ไขมันตามเพศ
  // เดียวกับที่คะแนนสุขภาพรวมใช้อยู่แล้ว (bodyFatPctRange) ไม่ได้คิดเกณฑ์ใหม่แยกต่างหาก
  const bodyFatRangeForZone = bodyFatPctRange(profile?.sex ?? null)
  const bodyFatZone: Zone | null = latest?.body_fat_pct != null ? zoneOf(latest.body_fat_pct, bodyFatRangeForZone.low, bodyFatRangeForZone.high) : null

  const bodyFatDeltaForCard = fieldDelta('body_fat_pct')
  // ฟีดแบ็ก "Metric Cards ควรอ่านได้ใน 1 วินาที — ไขมันลดลงต่อเนื่อง ทำได้ดี ตัดเหลือ ไขมันลดลงต่อเนื่อง
  // เพียง 3 ระดับพอ (ค่า/เดลต้า/insight) ไม่จำเป็นต้องทำทุกอย่างให้เด่น" — ตัดคำชื่นชมท้ายประโยค ("ทำได้ดี")
  // ออก เหลือแค่ข้อเท็จจริงสั้นๆ
  const bodyFatInsight =
    bodyFatDeltaForCard === null
      ? null
      : Math.abs(bodyFatDeltaForCard) < 0.3
        ? 'อยู่ในช่วงผันผวนปกติ'
        : bodyFatDeltaForCard < 0
          ? 'ไขมันลดลงต่อเนื่อง'
          : 'ไขมันเพิ่มขึ้น ลองเพิ่มคาร์ดิโอ'

  // v63: ฟีดแบ็ก "Muscle Mass Card มีพื้นที่ว่างและขาด interpretation เทียบกับ Weight/Body Fat" — สูตรเดียวกับ
  // weightInsight/bodyFatInsight ด้านบน (เกณฑ์ผันผวน 0.3 เดียวกับ Body Fat เพราะหน่วยเดียวกัน — kg) มวลกล้ามเนื้อ
  // higherBetter เสมอ (ไม่มีทิศทางกำกวมแบบน้ำหนัก) ไม่ต้องเช็คเป้าหมายก่อนเหมือน weightInsight
  const muscleDeltaForCard = fieldDelta('muscle_kg', toDisplay)
  const muscleInsight =
    muscleDeltaForCard === null
      ? null
      : Math.abs(muscleDeltaForCard) < 0.3
        ? 'อยู่ในช่วงผันผวนปกติ'
        : muscleDeltaForCard > 0
          ? 'มวลกล้ามเนื้อเพิ่มขึ้นต่อเนื่อง'
          : 'ลองเพิ่มการฝึกแรงต้าน'

  // v32: trendScorePct (สัดส่วนตัวชี้วัดที่ "ขยับไปทางที่ดี" แบบ pass/fail) ถูกแทนที่ด้วยหมวด PROGRESS
  // ในเอนจิ้นคะแนนสุขภาพใหม่แล้ว (healthScoreResult.categories — คำนวณแบบ magnitude-aware ไม่ใช่แค่ y/n)
  // ไม่ต้องคำนวณแยกซ้ำอีกต่อไป

  // ฟีดแบ็ก "พื้นที่ด้านขวาของ Health Score ยังว่างค่อนข้างเยอะ — อยากได้สรุปประโยคเดียวแทนที่จะเพิ่ม metric
  // อีกตัว จะทำให้ Health Score กลายเป็น Insight ไม่ใช่แค่คะแนน" — ใช้ delta ไขมัน/กล้ามเนื้อที่มีอยู่แล้ว
  // (เดียวกับที่การ์ดน้ำหนักใช้เช็ค "น้ำหนักเพิ่มจากกล้ามเนื้อ") ไม่ได้คำนวณอะไรใหม่ — ถ้าเป้าหมายเป็นลดน้ำหนัก/
  // ไขมันด้วย ให้ประโยคพูดถึงเป้าหมายตรงๆ
  // v15: ฟีดแบ็ก "ตัดคำว่า 'กำลัง' ออก — ลดไขมัน พร้อมรักษามวลกล้ามเนื้อ สั้นและพรีเมียมกว่า อยู่ใต้ Health
  // Score แล้วไม่ต้องอธิบายเยอะ" — เอา 'กำลัง' นำหน้าออก เหลือกริยาสั้นตรงประเด็น
  const bodyCompositionSummary: string | null =
    bodyFatDeltaForCard !== null && bodyFatDeltaForCard < 0 && muscleDeltaForWeightCheck !== null && muscleDeltaForWeightCheck > 0
      ? weightDirection === 'lowerBetter'
        ? 'ลดไขมัน พร้อมรักษามวลกล้ามเนื้อ'
        : 'องค์ประกอบร่างกายดีขึ้นอย่างต่อเนื่อง'
      : bodyFatDeltaForCard !== null && bodyFatDeltaForCard < 0
        ? 'ไขมันในร่างกายลดลงต่อเนื่อง'
        : muscleDeltaForWeightCheck !== null && muscleDeltaForWeightCheck > 0
          ? 'มวลกล้ามเนื้อเพิ่มขึ้นต่อเนื่อง'
          : null

  // v80: ฟีดแบ็ก "93% ดีมาก ข้างบน กับ 🔴 ควรปรับปรุง 2 ใบด้านล่าง — user อาจสงสัยว่าตกลงสุขภาพดีหรือไม่ดี" —
  // เพิ่มบรรทัดเชื่อมสั้นๆ ใต้ summary เดิม บอกจำนวนจุดที่เป็น tier attention จริง (นับจาก healthInsights ที่
  // คำนวณอยู่แล้ว ไม่ fabricate ตัวเลข) ไม่โชว์เลยถ้าไม่มีจุดที่ต้องติดตาม (attentionCount === 0) — คำนำหน้า
  // "ภาพรวมดีขึ้น"/"ภาพรวมทรงตัว" อิงจาก healthScoreMonthDeltaPct จริง ไม่เดา (null/0 = ใช้ "ภาพรวม" เฉยๆ)
  const attentionCount = healthInsights.filter((i) => i.tier === 'attention').length
  const healthScoreCaveat =
    attentionCount > 0
      ? `${healthScoreMonthDeltaPct !== null && healthScoreMonthDeltaPct !== undefined ? (healthScoreMonthDeltaPct > 0 ? 'ภาพรวมดีขึ้น' : healthScoreMonthDeltaPct < 0 ? 'ภาพรวมยังต้องระวัง' : 'ภาพรวมทรงตัว') : 'ภาพรวม'} แต่ยังมี ${attentionCount} ด้านที่ควรติดตาม`
      : null

  // ฟีดแบ็ก "เป้าหมายควรเป็นข้อมูลที่ actionable — แทนที่จะเขียนแค่ 65.0 kg / น้ำหนักเป้าหมาย อยากได้
  // 65.0 kg / เป้าหมาย · เหลือ 1.3 kg ผู้ใช้เห็นแล้วรู้ทันทีว่าต้องไปทางไหน"
  // v17: ฟีดแบ็ก "แสดง 2 เป้าหมายพร้อมกัน (น้ำหนัก + Body Fat) ไม่ใช่แค่ตัวเดียวแบบ fallback — ข้อมูลใน
  // FITLOG มีทั้งน้ำหนัก/Body Fat/Muscle Mass เป้าหมายจึงควรสะท้อนองค์ประกอบร่างกาย ไม่ใช่แค่น้ำหนักอย่างเดียว
  // ผู้ใช้จะได้เข้าใจทันทีว่ากำลังลดไขมันโดยพยายามรักษากล้ามเนื้อ ไม่ใช่แค่ 'น้ำหนักต้องลง X kg'" — เดิม
  // weight เป็นตัวหลัก, body fat เป็นแค่ fallback ตอนไม่มีเป้าหมายน้ำหนัก — เปลี่ยนเป็น array แสดงทั้งคู่พร้อม
  // กันถ้ามีทั้งสองเป้าหมายที่ active อยู่ (ยังคงเรียงน้ำหนักก่อน เพราะเป็น primary metric ของหน้านี้)
  const bodyFatGoalForBanner = goals.find((g) => g.goal_type === 'body_fat' && g.status === 'active')
  // v19: ฟีดแบ็ก "เพิ่ม Progress เล็กๆ ใต้เป้าหมาย — เส้นบางๆ 2-3px ผู้ใช้จะเห็นทันทีว่ากำลังเข้าใกล้เป้าหมาย
  // แทนที่จะต้องคำนวณเองจากตัวเลข" — ใช้ goalProgressPct() ที่มีอยู่แล้ว (การ์ด "เป้าหมายของคุณ" ด้านล่างใช้
  // ตัวเดียวกันอยู่แล้ว ไม่ได้คำนวณซ้ำแบบใหม่) ไม่ต้องเพิ่ม field/ที่มาข้อมูลใหม่
  // v25: ฟีดแบ็ก "อยากให้เห็น 67.1 → 60.0 kg ไม่ใช่แค่ 60.0 kg เฉยๆ — เห็นทั้งจุดเริ่มและเป้าหมายพร้อมกัน
  // อ่านเป็น progress ทันทีโดยไม่ต้องคำนวณเอง" — ใส่ค่าปัจจุบัน (latest) นำหน้าลูกศรเมื่อมีข้อมูล ไม่มี = แสดง
  // แค่เป้าหมายเหมือนเดิม (พฤติกรรมเดิม กันพังตอนยังไม่มี metric ล่าสุด)
  const goalRows: { valueText: string; label: string; subText: string | null; progressPct: number | null }[] = []
  if (weightGoal?.target_value != null) {
    const targetText = `${toDisplay(weightGoal.target_value).toFixed(1)} ${unit}`
    goalRows.push({
      valueText: latest?.weight_kg != null ? `${toDisplay(latest.weight_kg).toFixed(1)} → ${targetText}` : targetText,
      label: 'น้ำหนักเป้าหมาย',
      subText:
        latest?.weight_kg != null
          ? `เหลือ ${Math.abs(toDisplay(latest.weight_kg) - toDisplay(weightGoal.target_value)).toFixed(1)} ${unit}`
          : null,
      progressPct: goalProgressPct(weightGoal),
    })
  }
  if (bodyFatGoalForBanner?.target_value != null) {
    const bodyFatDiff = latest?.body_fat_pct != null ? latest.body_fat_pct - bodyFatGoalForBanner.target_value : null
    const bodyFatTargetText = `${bodyFatGoalForBanner.target_value.toFixed(1)}%`
    goalRows.push({
      valueText: latest?.body_fat_pct != null ? `${latest.body_fat_pct.toFixed(1)}% → ${bodyFatTargetText}` : bodyFatTargetText,
      label: 'Body Fat เป้าหมาย',
      // ฟีดแบ็ก "เป้าหมายควรให้ความรู้สึกเป็น Progress ไม่ใช่รายงานข้อมูล — เหลือ 6.3 kg / เหลืออีก 1.9%
      // Body Fat อ่านง่ายกว่า" — เดิม "ลดอีก X% / เพิ่มอีก X%" แยกคำตามทิศทาง ตอนนี้รวมเป็น "เหลืออีก X%"
      // เดียวกันทั้งสองทิศทาง (ระยะห่างจากเป้าหมายยังสื่อความหมายเดิม ไม่ว่าจะต้องลดหรือเพิ่ม) ต่อท้ายด้วย
      // "Body Fat" ให้อ่านคู่กับ "เหลือ X kg" ของน้ำหนักได้โดยไม่ต้องมี label แยกบรรทัดข้างบนอีกต่อไป
      // v27: ฟีดแบ็ก "25.1 → 20.0 คือ 5.1 percentage points ไม่ใช่ลดลง 5.1% เชิง relative — 'เหลืออีก 5.1%
      // Body Fat' อ่านกำกวม" — เดิมเติม "เพื่อถึงเป้าหมาย" ต่อท้ายแทน (หลีกเลี่ยงศัพท์ "จุดเปอร์เซ็นต์")
      // v60: ฟีดแบ็ก "25.1 → 20.0 คือลดลง 5.1 percentage points ไม่ใช่ลด 5.1% เชิงสัมพัทธ์ — ควรเขียนว่า
      // 'เหลือ 5.1 จุดเปอร์เซ็นต์' ตรงๆ" — ยืนยันขอศัพท์นี้ตรงๆ รอบนี้ (กลับคำตัดสินใจ v27 ที่เคยเลี่ยงคำนี้)
      // เปลี่ยนจาก "เหลืออีก X% เพื่อถึงเป้าหมาย" เป็น "เหลือ X จุดเปอร์เซ็นต์" ไม่กระทบตัวเลขหรือการคำนวณใดๆ
      subText: bodyFatDiff === null || bodyFatDiff === 0 ? null : `เหลือ ${Math.abs(bodyFatDiff).toFixed(1)} จุดเปอร์เซ็นต์`,
      progressPct: goalProgressPct(bodyFatGoalForBanner),
    })
  }

  // ฟีดแบ็ก "ล่าสุด อยากได้วันที่ + เวลา (4 ส.ค. 2569 / 09:15 น.) ไม่ใช่แค่วันที่เฉยๆ" — created_at คือเวลา
  // จริงตอนบันทึกแถว (ต่างจาก measured_at ซึ่งเป็นแค่วันที่ผู้ใช้เลือกเอง ไม่มีเวลา อาจย้อนหลังได้)
  const latestDateTime = latest?.created_at ? formatDateTimeTH(latest.created_at) : null

  // ฟีดแบ็ก "ลด Information Density...ยุบ Additional Metrics เป็นตาราง" — ข้อมูล/สูตร zone แต่ละแถว
  // เหมือนกับที่การ์ด IconStatCard 7 ใบเดิมเคยใช้ทุกประการ (ดูคอมเมนต์เดิมที่จุดเรียกใช้ AdditionalMetricsTable)
  // ย้ายมาเป็น row object ล้วนๆ เพื่อ map เป็นตารางแทน — ไม่ได้คำนวณอะไรใหม่หรือเปลี่ยน field ที่ใช้เลย
  const additionalMetricRows: AdditionalMetricRow[] = [
    {
      key: 'protein',
      label: 'โปรตีนในร่างกาย',
      value: latest?.protein_kg != null ? `${toDisplay(latest.protein_kg).toFixed(1)} ${unit}` : '—',
      zone:
        latest?.protein_kg != null && latestLbm != null
          ? proteinPctZone(latest.protein_kg, latestLbm, profile?.sex ?? null)
          : null,
      direction: 'neutral',
      delta: fieldDelta('protein_kg', toDisplay),
      deltaUnit: unit,
      decimals: 1,
      // v64: ฟีดแบ็ก "เอา 🔴 ออกจาก Protein ก่อน — 'สูงกว่าเกณฑ์' ต้องมั่นใจทิศทางจริงๆ" — proteinPctZone
      // มีเกณฑ์จริง (ไม่ใช่เดา) แต่ไม่มีข้อมูลยืนยันว่าสูง/ต่ำกว่าเกณฑ์นี้ "ดี" หรือ "ไม่ดี" ต่างจาก Skeletal
      // Muscle ที่รู้ชัดว่า higherBetter — บังคับสีกลาง ไม่ตัดสิน แทนการฟันธงแดง/เขียว
      neutralStatus: true,
    },
    {
      key: 'visceralFat',
      label: 'ไขมันช่องท้อง',
      value: latest?.visceral_fat_grade != null ? `${latest.visceral_fat_grade} ระดับ` : '—',
      zone: latest?.visceral_fat_grade != null ? (latest.visceral_fat_grade <= 9 ? 'Standard' : 'High') : null,
      direction: 'lowerBetter',
      delta: fieldDelta('visceral_fat_grade'),
      deltaUnit: 'ระดับ',
      decimals: 0,
    },
    {
      key: 'fatMass',
      label: 'มวลไขมัน',
      value: latest?.body_fat_kg != null ? `${toDisplay(latest.body_fat_kg).toFixed(1)} ${unit}` : '—',
      zone: null,
      direction: 'lowerBetter',
      delta: fieldDelta('body_fat_kg', toDisplay),
      deltaUnit: unit,
      decimals: 1,
    },
    {
      key: 'skeletalMuscle',
      label: 'กล้ามเนื้อโครงร่าง',
      value: latest?.skeletal_muscle_kg != null ? `${toDisplay(latest.skeletal_muscle_kg).toFixed(1)} ${unit}` : '—',
      zone: null,
      direction: 'higherBetter',
      delta: fieldDelta('skeletal_muscle_kg', toDisplay),
      deltaUnit: unit,
      decimals: 1,
    },
    {
      key: 'boneMass',
      label: 'มวลกระดูก',
      value: latest?.bone_mass_kg != null ? `${toDisplay(latest.bone_mass_kg).toFixed(1)} ${unit}` : '—',
      zone: null,
      direction: 'neutral',
      delta: fieldDelta('bone_mass_kg', toDisplay),
      deltaUnit: unit,
      decimals: 1,
    },
    {
      key: 'bodyAge',
      label: 'อายุร่างกาย',
      value: latest?.body_age_years != null ? `${latest.body_age_years.toFixed(0)} ปี` : '—',
      zone: null,
      direction: 'lowerBetter',
      delta: fieldDelta('body_age_years'),
      deltaUnit: 'ปี',
      decimals: 0,
    },
    {
      key: 'bmr',
      label: 'อัตราการเผาผลาญ',
      value: latest?.bmr_kcal != null ? `${latest.bmr_kcal.toFixed(0)} kcal` : '—',
      zone: null,
      direction: 'neutral',
      delta: null,
      deltaUnit: 'kcal',
      decimals: 0,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracked uppercase">สุขภาพร่างกาย</h1>
          <p className="text-xs text-muted mt-0.5">
            {lastSyncedAt ? `อัปเดตล่าสุด ${relativeUpdatedLabel(lastSyncedAt)}` : 'ติดตามและวิเคราะห์การเปลี่ยนแปลงของร่างกายคุณ'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-1.5 text-[12px] font-display tracked uppercase text-muted border border-line rounded-full px-3 py-2 active:scale-[0.99] transition"
          >
            <ShareIcon />
            แชร์รายงาน
          </button>
          {latest?.measured_at && (
            <span className="flex items-center gap-1.5 text-[12px] font-mono text-muted border border-line rounded-full px-3 py-2 whitespace-nowrap">
              <CalendarIcon />
              {shortLabel(latest.measured_at)}
            </span>
          )}
        </div>
      </div>

      {/* v59: ฟีดแบ็ก (เอกสาร handoff P0 "Sticky navigation") "sidebar active และ top tabs ต้องคงอยู่ระหว่าง
          scroll" — sidebar เป็น sticky อยู่แล้ว (SidebarNav.tsx) แต่แถบแท็บนี้ยังเลื่อนหายไปกับเนื้อหาปกติ ทำให้
          สลับแท็บได้ต้องเลื่อนกลับขึ้นบนสุดก่อน — เพิ่ม sticky top wrapper (พื้นหลัง+blur กันเนื้อหาทะลุตอนติด
          ขอบบน) top ใช้ env(safe-area-inset-top) แทน 0 ตรงๆ กันแถบไปติดใต้ notch/status bar บนมือถือที่มี
          safe-area (เดียวกับที่ .safe-top ของ main ใช้อยู่แล้ว — ดู globals.css) */}
      <div className="sticky z-10 bg-bg/95 backdrop-blur py-1.5" style={{ top: 'env(safe-area-inset-top)' }}>
        <div className="flex rounded-full bg-surface p-1 border border-line">
          {(
            [
              { key: 'overview', label: 'ภาพรวม' },
              { key: 'trends', label: 'แนวโน้ม' },
              { key: 'log', label: 'บันทึกข้อมูล' },
              { key: 'photos', label: 'Photo' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 rounded-full text-[12px] sm:text-sm font-display tracked uppercase transition ${
                tab === t.key ? (t.key === 'photos' ? 'bg-rust text-ink' : 'bg-steel text-bg') : 'text-muted'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        // ฟีดแบ็ก "OBESITY ANALYSIS / MUSCLE & FAT ANALYSIS ถูกดันลงจนแทบไม่เห็นในจอ 1892x1002 — อยากให้
        // Summary + จุดเริ่มของ Analysis อยู่ใน viewport เดียว" — ลด space-y-6 (24px) เหลือ space-y-5 (20px)
        // ทั้งแท็บ ร่วมกับลด padding/gap ของการ์ดใน grid ด้านล่าง (ดูคอมเมนต์ตรงนั้น) แทนการตัดเนื้อหาออก
        <div className="space-y-5">
          <OverviewHealthScoreHeader
            result={healthScoreResult}
            monthDeltaPct={healthScoreMonthDeltaPct}
            bodyFatDeltaPct={fieldDelta('body_fat_pct')}
            muscleMassDelta={fieldDelta('muscle_kg', toDisplay)}
            goalRows={goalRows}
            updatedDateLabel={latestDateTime?.date ?? null}
            updatedTimeLabel={latestDateTime?.time ?? null}
            unit={unit}
            summary={bodyCompositionSummary}
            caveat={healthScoreCaveat}
            changePeriodLabel={periodLabelOf(latest, metrics[1] ?? null)}
          />
          {profile && !profile.sex && (
            <SexPrompt profile={profile} onSaved={(p) => setProfile(p)} />
          )}

          {/* v51: ฟีดแบ็ก "Insight & Recommendation มี Potential สูงมาก ควรเป็นสมองของ FITLOG ที่เข้าใจได้ใน
              3-5 วินาที" (Priority 3) — เดิมอยู่เกือบท้ายสุดของแท็บ Overview (หลัง BMR estimate) ผู้ใช้ต้อง
              เลื่อนผ่านทุกอย่างก่อนถึงจะเห็น ย้ายมาไว้ต่อจาก Health Score ทันที (ก่อนกราฟเทรนด์) พร้อมกรอบสี Gold
              (#E8A33D) ตามระบบสีความหมายที่ผู้ใช้เสนอเอง (Gold = Brand/Highlight) ให้สอดคล้องกับกรอบ steel
              (#6C8CA8, detail tier) ของการ์ด Analysis ด้านล่าง */}
          {healthInsights.length > 0 && (
            // v56: ฟีดแบ็ก "Health Score + Body Insights อยู่ติดกันแน่นไป ลดความหนาแน่น ~10-15%" — p-4→p-3.5,
            // mb-3→mb-2.5, grid gap-3→gap-2.5 (ดูคอมเมนต์เพิ่มเติมที่ InsightCard.tsx เรื่อง padding/font
            // ภายในการ์ดแต่ละใบ)
            <PremiumCard className="p-3.5 border-l-2" style={{ borderLeftColor: '#E8A33D' }}>
              <h2 className="flex items-center gap-2 font-display text-sm tracked uppercase text-ink mb-2.5">
                Body Insights
                <span className="text-muted">
                  <InfoIcon />
                </span>
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {healthInsights.slice(0, 4).map((insight) => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    imageSrc={INSIGHT_ICON_IMAGES[`${insight.id}|${insight.icon}`]}
                    recommendationsHref="#recommendations"
                    minHeightClassName="min-h-[108px]"
                  />
                ))}
              </div>
              {healthInsights.length > 4 && (
                <button
                  type="button"
                  onClick={() => setTab('trends')}
                  className="mt-3 w-full text-center text-[12px] font-display tracked uppercase text-bg bg-amber rounded-lg py-2 transition active:scale-[0.99] hover:opacity-90"
                >
                  ดูคำแนะนำเพิ่มเติม
                </button>
              )}
            </PremiumCard>
          )}

          {/* v69: ฟีดแบ็ก "ควรมีชั้น 'What should I do' ต่อจาก Body Insights (why) — ไม่ใช่แค่ Data/Interpretation
              แต่ต้องมี Action ด้วย" — RecommendationsCard มีอยู่แล้ว (การ์ดเดิมชื่อ 'คำแนะนำสำหรับคุณ' ที่แนะนำ
              โปรแกรมฝึก/น้ำ/นอน ตาม insight ที่มี priority สูงสุด) แต่เดิมอยู่แค่แท็บ "แนวโน้ม" เท่านั้น — แท็บ
              "ภาพรวม" (ที่เห็นเป็นค่าเริ่มต้นเสมอ) ไม่มีชั้น "What to do" เลย ย้ายมาแสดงตรงนี้ด้วย (โค้ด/ตรรกะเดิม
              ทั้งหมด ไม่ได้สร้าง insight หรือคำแนะนำใหม่ที่ไม่มีข้อมูลรองรับ) ให้ flow ครบ Data → Why → Action
              โดยไม่ต้องรื้อโครงสร้างหน้าใหม่ */}
          {healthInsights.length > 0 && (
            <RecommendationsCard insights={healthInsights} latestWeightKg={latest?.weight_kg ?? null} />
          )}

          <OverviewTrendChart
            metrics={metrics}
            unit={unit}
            toDisplay={toDisplay}
            weightDelta={weightDeltaForCard}
            bodyFatDelta={bodyFatDeltaForCard}
            muscleDelta={fieldDelta('muscle_kg', toDisplay)}
            changePeriodLabel={periodLabelOf(latest, metrics[1] ?? null)}
            weightGoalTarget={weightGoal?.target_value ?? null}
            bodyFatGoalTarget={bodyFatGoalForBanner?.target_value ?? null}
            weightDirection={scoreWeightDirection}
          />

          {/* v3: ฟีดแบ็ก "Card ไม่มีระดับความสำคัญ" — เรียงลำดับตามความสำคัญจริง
              v6: ฟีดแบ็ก "ผมจะให้ความสำคัญของข้อมูลแบบนี้ — ระดับ 1 (ต้องรู้ทันที): น้ำหนัก/ไขมันในร่างกาย/
              กล้ามเนื้อ, ระดับ 2 (ติดตาม): BMI/น้ำในร่างกาย/มวลไขมัน/กล้ามเนื้อโครงร่าง, ระดับ 3 (ประกอบ):
              โปรตีน/ไขมันช่องท้อง/อายุร่างกาย/BMR/มวลกระดูก" — ปรับ tier ให้ตรงตามนี้ (BMI ย้ายจาก tier 1
              ไป 2, โปรตีน/ไขมันช่องท้อง ย้ายจาก tier 2 ไป 3) แทนเดิมที่กลุ่ม 2 กับ 3 ไม่ตรงกับที่ขอรอบนี้ */}
          {/* ฟีดแบ็ก "อยากได้ตำแหน่ง card แบบนี้" (เทียบ mockup ที่แบ่ง KEY METRICS/ADDITIONAL METRICS
              ชัดเจนเป็น 2 แถว) — เดิม grid เดียวยาว 12 การ์ด ใช้ tier (1/2/3) แค่จัดลำดับ/ความหนาแน่นของ
              grid-flow-dense เท่านั้น ไม่มี label แบ่งหมวดให้เห็นชัดว่าอันไหน "หลัก" อันไหน "เพิ่มเติม" — แบ่ง
              เป็น 2 grid แยกกันตรงๆ (5 การ์ดแรก = หลัก, 7 การ์ดที่เหลือ = เพิ่มเติม ตามลำดับเดิมเป๊ะ ไม่ได้
              เปลี่ยนว่าการ์ดไหนอยู่ก่อน/หลัง) พร้อม label กำกับ ไม่แตะ tier prop ของการ์ดแต่ละใบ (ยังใช้ปรับ
              ขนาด/ความหนาแน่นใน grid ของตัวเองต่อไป) */}
          {/* ฟีดแบ็ก "Weight/Body Fat/Muscle ไม่ควรปรากฏซ้ำในหลาย section โดยไม่มีข้อมูลใหม่" (Priority 3) —
              เดิม 3 การ์ดนี้มีเส้นเทรนด์ 30 วันจิ๋ว (18px) ท้ายการ์ดด้วย ซึ่งตอนนี้ซ้ำกับ Body Progress
              (OverviewTrendChart) ด้านบนที่โชว์เทรนด์ 3 ตัวนี้แบบใหญ่กว่า ปรับช่วงเวลาได้ ละเอียดกว่ามาก —
              ตัด series ออกจากการ์ด Key Metrics เหล่านี้ (ลบ weightTrend30/bodyFatTrend30/muscleTrend30
              ที่ไม่มีจุดใช้อื่นแล้วออกไปด้วย) ให้การ์ด Key Metrics โฟกัสแค่ "ค่าปัจจุบัน + เดลต้า" (Level 1)
              ส่วนเทรนด์เป็นหน้าที่ของ Body Progress (Level 2) เพียงจุดเดียว ไม่ซ้ำข้อมูลกันอีก */}
          <div>
            <p className="text-[12px] tracked uppercase mb-2 flex items-center gap-1" style={{ color: '#B8BBC2' }}>
              Key Metrics
              <button
                type="button"
                onClick={() => setShowRangeVsGoalInfo((v) => !v)}
                className="text-muted shrink-0 transition hover:text-ink"
                aria-label="ความแตกต่างระหว่างช่วงอ้างอิงกับเป้าหมายส่วนตัว"
              >
                <InfoIcon />
              </button>
            </p>
            {showRangeVsGoalInfo && (
              <p className="text-[12px] text-muted mb-2 -mt-1">
                ป้ายสถานะ (เช่น &quot;ปกติ&quot;) บนการ์ดคือช่วงอ้างอิงทั่วไป ไม่ใช่เป้าหมายส่วนตัวของคุณ — เป้าหมายที่ตั้งไว้ดูได้ที่คอลัมน์ &quot;เป้าหมายร่างกาย&quot; ในคะแนนสุขภาพด้านบน
              </p>
            )}
            {/* v56: ฟีดแบ็ก (2 รอบติดกัน) "น้ำหนัก/ไขมัน/มวลกล้ามเนื้อ เป็นข้อมูลหลัก BMI/น้ำในร่างกายเป็นข้อมูล
                รอง อยากให้สายตารู้ทันทีว่า 3 ตัวไหนสำคัญที่สุด" — เดิมทั้ง 5 การ์ดอยู่ grid เดียวกัน (แค่ลด
                opacity/texture ตาม tier ซึ่งยังไม่พอ) ตอนนี้แยกเป็น 2 grid จริงๆ: Primary (น้ำหนัก/ไขมัน/
                มวลกล้ามเนื้อ — 3 การ์ดพอดี ให้การ์ดน้ำหนัก primary span 2x2 เหลือพื้นที่ 1 คอลัมน์ 2 แถวให้อีก
                2 ใบพอดี ไม่มีช่องว่างเหลือแบบตอนแบ่ง 5 การ์ดใน grid เดียว) + Secondary (BMI/น้ำในร่างกาย) แยก
                คนละ block มี label กำกับ เหมือนที่ Additional Metrics มีอยู่แล้ว */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 items-stretch">
            <IconStatCard
              label="น้ำหนัก"
              subLabel="WEIGHT"
              icon="weight"
              imageKey="weight"
              color="#E8A33D"
              value={latest?.weight_kg != null ? toDisplay(latest.weight_kg) : null}
              unit={unit}
              delta={weightDeltaForCard}
              deltaUnit={unit}
              direction={weightCardDirection}
              trendLabel="30 DAY TREND"
              trendTag={weightGainLooksLikeMuscle ? 'Muscle-driven ↑' : null}
              trendColor="#9498A0"
              trendEndpointColor="#8CB264"
              lastMeasuredLabel={latest?.measured_at ? shortLabel(latest.measured_at) : null}
              periodCaption={weightPeriodCaption}
              insight={weightInsight}
              insightTone={weightGainLooksLikeMuscle ? 'good' : undefined}
            />
            <IconStatCard
              label="ไขมันในร่างกาย"
              subLabel="BODY FAT"
              icon="fat"
              imageKey="bodyFat"
              color="#C1503A"
              value={latest?.body_fat_pct ?? null}
              unit="%"
              delta={bodyFatDeltaForCard}
              deltaUnit="จุดเปอร์เซ็นต์"
              direction="lowerBetter"
              zone={bodyFatZone}
              zoneScheme="lowerOk"
              insight={bodyFatInsight}
            />
            {/* v54: ฟีดแบ็ก "Muscle Mass 46.9kg กับ Skeletal Muscle 28.1kg ผู้ใช้อาจสงสัยว่ากล้ามเนื้อจริงๆ
                คือตัวไหน — terminology ต้องชัด" — ใช้กลไก ⓘ infoText เดียวกับที่การ์ด Body Age มีอยู่แล้ว
                (ปุ่มเล็กข้าง label, toggle ข้อความอธิบายใต้การ์ด) แทนการเพิ่มกลไกใหม่ */}
            <IconStatCard
              label="มวลกล้ามเนื้อ"
              subLabel="MUSCLE MASS"
              icon="muscle"
              imageKey="muscleMass"
              color="#5FA88C"
              value={latest?.muscle_kg != null ? toDisplay(latest.muscle_kg) : null}
              unit={unit}
              delta={muscleDeltaForCard}
              deltaUnit={unit}
              direction="higherBetter"
              insight={muscleInsight}
              infoText="มวลกล้ามเนื้อ (Muscle Mass) คือน้ำหนักกล้ามเนื้อรวมทั้งหมด ส่วน Skeletal Muscle ในหมวด Additional Metrics ด้านล่างนับเฉพาะกล้ามเนื้อลายที่บังคับได้ — เป็นคนละตัวเลขกัน ไม่ใช่พิมพ์ผิดหรือขัดแย้งกัน"
            />
            </div>
            {/* ฟีดแบ็ก "จัด Priority การ์ด: ⭐ Weight/Body Fat/Muscle Mass, ◉ BMI/Fat Mass/Skeletal Muscle/
                Visceral Fat, ○ Body Water/Protein/Bone Mass/Body Age/BMR (ข้อมูลประกอบ)" — เดิม Body Water
                อยู่ tier 2 (◉ สำคัญรอง) ย้ายไป tier 3 (○ ข้อมูลประกอบ) ตามลำดับใหม่ ตัวอื่นใน tier 2/3 ตรงกับ
                ที่ขอไว้แล้วจากรอบก่อนๆ ไม่ต้องแก้ */}
            <p className="text-[12px] tracked uppercase mt-3 mb-2" style={{ color: '#6E7178' }}>Secondary</p>
            <div className="grid grid-cols-2 gap-2.5 items-stretch">
            <IconStatCard
              label="ดัชนีมวลกาย"
              subLabel="BMI"
              icon="bmi"
              imageKey="bmi"
              color="#6C8CA8"
              value={bmi}
              decimals={1}
              delta={previousBmi !== null && bmi !== null ? bmi - previousBmi : null}
              deltaUnit=""
              direction={bmiCardDirection}
              zone={bmi !== null ? zoneOf(bmi, 18.5, 25) : null}
              zoneScheme="symmetric"
              tier={2}
              forceZonePill
            />
            <IconStatCard
              label="น้ำในร่างกาย"
              subLabel="BODY WATER"
              icon="water"
              imageKey="bodyWater"
              color="#3D8FE8"
              value={latest?.body_water_kg != null ? toDisplay(latest.body_water_kg) : null}
              unit={unit}
              delta={fieldDelta('body_water_kg', toDisplay)}
              deltaUnit={unit}
              direction="neutral"
              zone={
                latest?.body_water_kg != null && latest?.weight_kg != null
                  ? bodyWaterPctZone(latest.body_water_kg, latest.weight_kg, profile?.sex ?? null)
                  : null
              }
              zoneScheme="higherOk"
              tier={3}
              forceZonePill
            />
            </div>
          </div>

          {/* ฟีดแบ็ก "Key Metrics เยอะเกินไป...12 metrics รวมกับที่ซ้ำด้านล่างอีก ทำให้หน้าเริ่มเป็น Data
              Warehouse มากกว่า Health Dashboard — ลด Information Density จาก 12+ metrics visible เหลือ
              ประมาณ 6-8" (Priority 1 จากที่จัดลำดับไว้) — Additional Metrics เดิมเป็นการ์ด IconStatCard 7 ใบ
              เต็มยศ (icon+label+value+delta+graph) หนักสายตาเท่า Key Metrics ทั้งที่เป็นข้อมูลระดับรอง —
              ยุบเป็นตารางกะทัดรัด (label+value+status บรรทัดเดียว) พร้อมยุบเหลือ 4 แถวแรกโดยดีฟอลต์ + ปุ่ม
              "ดูตัวชี้วัดเพิ่มเติม" ขยายดูครบ 7 — ข้อมูล/การคำนวณ zone ทุกตัวเหมือนเดิมทุกประการ ย้ายแค่การแสดงผล
              ไม่ตัดตัวชี้วัดไหนออกจริง (กดขยายดูได้ครบ ไม่ใช่ซ่อนถาวร) */}
          <AdditionalMetricsTable rows={additionalMetricRows} />

          <div className="grid lg:grid-cols-2 gap-4 items-start">
            {(bmi !== null || latest?.body_fat_pct != null) && (
              <ObesityAnalysisChart
                bmi={bmi}
                bodyFatPct={latest?.body_fat_pct ?? null}
                sex={profile?.sex ?? null}
                bmiDelta={previousBmi !== null && bmi !== null ? bmi - previousBmi : null}
                bodyFatDelta={bodyFatDeltaForCard}
                periodLabel={periodLabelOf(latest, metrics[1] ?? null)}
              />
            )}

            {muscleFatItems.length > 0 ? (
              <MuscleFatAnalysisChart items={muscleFatItems} unit={unit} periodLabel={periodLabelOf(latest, metrics[1] ?? null)} />
            ) : (
              <PremiumCard className="text-[12px] text-muted px-4 py-3">
                อยากดูกราฟ Muscle Fat Analysis (น้ำหนัก/กล้ามเนื้อโครงร่าง/มวลไขมัน เทียบช่วงมาตรฐาน) — กรอกช่วงมาตรฐานจากรายงานเครื่องชั่งในฟอร์มด้านล่าง (ช่อง &quot;ช่วงมาตรฐาน&quot;) สักครั้ง แล้วกราฟจะขึ้นให้อัตโนมัติ
              </PremiumCard>
            )}
          </div>

          {/* BMR ที่วัดจากเครื่องชั่งจริง (latest.bmr_kcal, การ์ด IconStatCard ด้านบน) แม่นกว่าค่าประมาณ
              จากสูตรเสมอ — โชว์การ์ดนี้เฉพาะตอนยังไม่มีค่าจากเครื่องชั่ง กันข้อมูลสองชุดขัดกันจนงง */}
          {!latest?.bmr_kcal && <BmrEstimateCard profile={profile} weightKg={latest?.weight_kg ?? null} />}
        </div>
      )}

      {tab === 'trends' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setTrendGroup('comp')
                  setTrendMetric('all')
                }}
                className={`px-3 py-2 rounded-full text-[12px] font-display tracked uppercase transition ${
                  trendGroup === 'comp' ? 'bg-amber text-bg' : 'bg-surface border border-line text-muted'
                }`}
              >
                น้ำหนัก/ไขมัน/กล้ามเนื้อ
              </button>
              <button
                type="button"
                onClick={() => {
                  setTrendGroup('measure')
                  setTrendMetric('all')
                }}
                className={`px-3 py-2 rounded-full text-[12px] font-display tracked uppercase transition ${
                  trendGroup === 'measure' ? 'bg-amber text-bg' : 'bg-surface border border-line text-muted'
                }`}
              >
                สัดส่วนร่างกาย
              </button>
            </div>
            <div className="flex rounded-full bg-surface p-1 border border-line shrink-0">
              {([7, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setTrendPeriodDays(d)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-display tracked uppercase transition ${
                    trendPeriodDays === d ? 'bg-steel text-bg' : 'text-muted'
                  }`}
                >
                  {d} วัน
                </button>
              ))}
            </div>
          </div>

          {trendGroup === 'comp' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <TopStatCard
                label="น้ำหนัก"
                value={latest?.weight_kg != null ? toDisplay(latest.weight_kg) : null}
                unit={unit}
                low={weightRangeLow != null ? toDisplay(weightRangeLow) : null}
                high={weightRangeHigh != null ? toDisplay(weightRangeHigh) : null}
                iconKey="weight"
                imageKey="weight"
                color="#E8A33D"
                data={weightTrend}
                direction="neutral"
                periodLabel={`${trendPeriodDays} วัน`}
              />
              <TopStatCard
                label="ไขมันในร่างกาย"
                value={latest?.body_fat_pct ?? null}
                unit="%"
                low={bodyFatPctRange(profile?.sex ?? null).low}
                high={bodyFatPctRange(profile?.sex ?? null).high}
                iconKey="fat"
                imageKey="bodyFat"
                color="#C1503A"
                data={bodyFatTrend}
                direction="lowerBetter"
                periodLabel={`${trendPeriodDays} วัน`}
              />
              <TopStatCard
                label="กล้ามเนื้อโครงร่าง"
                value={latest?.skeletal_muscle_kg != null ? toDisplay(latest.skeletal_muscle_kg) : null}
                unit={unit}
                low={skeletalRangeLow != null ? toDisplay(skeletalRangeLow) : null}
                high={skeletalRangeHigh != null ? toDisplay(skeletalRangeHigh) : null}
                iconKey="muscle"
                imageKey="skeletalMuscle"
                color="#7FA85F"
                data={skeletalMuscleTrend}
                direction="higherBetter"
                periodLabel={`${trendPeriodDays} วัน`}
              />
              <TopStatCard
                label="มวลไขมัน"
                value={latest?.body_fat_kg != null ? toDisplay(latest.body_fat_kg) : null}
                unit={unit}
                low={fatMassRangeLow != null ? toDisplay(fatMassRangeLow) : null}
                high={fatMassRangeHigh != null ? toDisplay(fatMassRangeHigh) : null}
                iconKey="fat"
                imageKey="fatMass"
                color="#CF9A3D"
                data={bodyFatKgTrend}
                direction="lowerBetter"
                periodLabel={`${trendPeriodDays} วัน`}
              />
              <TopStatCard
                label="BMI"
                value={bmi}
                unit="kg/m²"
                low={18.5}
                high={25}
                iconKey="bmi"
                imageKey="bmi"
                color="#6C8CA8"
                data={bmiTrend}
                direction="neutral"
                periodLabel={`${trendPeriodDays} วัน`}
              />
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-display text-sm tracked uppercase text-muted flex items-center gap-1.5">
                  แนวโน้มรายตัวชี้วัด
                  <span className="text-muted">
                    <InfoIcon />
                  </span>
                </h2>
                <select
                  value={trendMetric === 'all' ? 'all' : activeTrendList.findIndex((t) => t === selectedTrend)}
                  onChange={(e) => setTrendMetric(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="input text-xs py-1.5 w-auto max-w-[55%] sm:max-w-[220px]"
                >
                  <option value="all">แสดงทั้งหมด</option>
                  {activeTrendList.map((t, i) => (
                    <option key={t.key} value={i} disabled={t.data.length < 2}>
                      แนวโน้ม{t.label}
                      {t.data.length < 2 ? ' (ยังไม่มีข้อมูลพอ)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {trendMetric === 'all' ? (
                allTrendsWithData.length > 0 ? (
                  <div className="space-y-4">
                    {(showAllMetrics ? allTrendsWithData : allTrendsWithData.slice(0, 5)).map((t) => (
                      <MetricRowCard key={t.key} trend={t} periodLabel={`${trendPeriodDays} วัน`} />
                    ))}
                    {allTrendsWithData.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setShowAllMetrics((v) => !v)}
                        className="w-full flex items-center justify-center gap-1.5 text-[12px] font-display tracked uppercase text-muted border border-line rounded-lg py-2.5 active:scale-[0.99] transition"
                      >
                        {showAllMetrics ? 'แสดงน้อยลง' : 'ดูตัวชี้วัดเพิ่มเติม'}
                        <span className={`transition-transform ${showAllMetrics ? '-rotate-90' : 'rotate-90'}`}>
                          <ChevronRightIcon />
                        </span>
                      </button>
                    )}
                  </div>
                ) : (
                  <PremiumCard className="text-[12px] text-muted px-4 py-3">
                    ยังไม่มีข้อมูลพอสำหรับดูแนวโน้มในหมวดนี้ — บันทึกข้อมูลอย่างน้อย 2 ครั้งก่อน แล้วกราฟจะขึ้นให้อัตโนมัติ
                  </PremiumCard>
                )
              ) : selectedTrend && selectedTrend.data.length > 1 ? (
                <MetricRowCard trend={selectedTrend} periodLabel={`${trendPeriodDays} วัน`} />
              ) : (
                <PremiumCard className="text-[12px] text-muted px-4 py-3">
                  ยังไม่มีข้อมูลพอสำหรับดูแนวโน้มในหมวดนี้ — บันทึกข้อมูลอย่างน้อย 2 ครั้งก่อน แล้วกราฟจะขึ้นให้อัตโนมัติ
                </PremiumCard>
              )}

              {trendGroup === 'comp' && <ForecastCard metrics={metrics} toDisplay={toDisplay} unit={unit} />}
            </div>

            <div className="space-y-4">
              <HealthScoreCard result={healthScoreResult} monthDeltaPct={healthScoreMonthDeltaPct} selfPercentile={healthScorePercentile} />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm tracked uppercase text-muted flex items-center gap-1.5">
                    Body Insights
                    <span className="text-muted">
                      <InfoIcon />
                    </span>
                  </h2>
                </div>
                {healthInsights.length > 0 ? (
                  <div className="space-y-2">
                    {healthInsights.map((insight) => (
                      <InsightCard key={insight.id} insight={insight} showChevron imageSrc={INSIGHT_ICON_IMAGES[`${insight.id}|${insight.icon}`]} />
                    ))}
                  </div>
                ) : (
                  <PremiumCard className="text-[12px] text-muted px-4 py-3">
                    ยังไม่มีการเปลี่ยนแปลงที่ชัดเจนพอในช่วง {trendPeriodDays} วันนี้
                  </PremiumCard>
                )}
              </div>

              <RecommendationsCard insights={healthInsights} latestWeightKg={latest?.weight_kg ?? null} />

              <GoalsCard
                goals={goals}
                unit={unit}
                goalCurrentValue={goalCurrentValue}
                goalProgressPct={goalProgressPct}
                goalStartValue={(g) => goalEarliestTrackedValue(g) ?? g.starting_value ?? null}
              />
            </div>
          </div>

          <ProgressTimelineCard heightCm={profile?.height_cm ?? null} />
        </div>
      )}

      {tab === 'log' && (
        <div className="space-y-6">
          <MetricForm
            profile={profile}
            onSaved={(m) => setMetrics((prev) => [m, ...prev.filter((x) => x.id !== m.id)])}
            onHeightExtracted={saveHeight}
            onAgeChanged={handleAgeChanged}
          />

          <section>
            <h2 className="font-display text-sm tracked uppercase text-muted mb-3">ประวัติการวัดผล</h2>
            {metricDeleteError && <p className="text-[12px] text-rusttext mb-2">{metricDeleteError}</p>}
            {metrics.length === 0 ? (
              <PremiumCard className="px-4 py-8 text-center space-y-3">
                <div className="text-3xl">📏</div>
                <p className="text-sm text-muted">ยังไม่มีข้อมูล เริ่มบันทึกครั้งแรกได้เลย</p>
                <a
                  href="#metric-form"
                  className="inline-block text-[12px] font-display tracked uppercase text-bg bg-amber rounded-lg px-4 py-2 active:scale-[0.99] transition"
                >
                  + บันทึกครั้งแรก
                </a>
              </PremiumCard>
            ) : (
              <PremiumCard className="divide-y divide-white/5">
                {metrics.map((m) => (
                  <div key={m.id} className="tally-row px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-muted">{shortLabel(m.measured_at)}</span>
                      <button
                        onClick={async () => {
                          const { error } = await supabase.from('body_metrics').delete().eq('id', m.id)
                          if (error) {
                            setMetricDeleteError('ลบไม่สำเร็จ ลองใหม่อีกครั้ง')
                            return
                          }
                          setMetricDeleteError(null)
                          setMetrics((prev) => prev.filter((x) => x.id !== m.id))
                        }}
                        className="text-muted hover:text-rust text-xs transition"
                      >
                        ลบ
                      </button>
                    </div>
                    <p className="text-sm text-ink mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {m.weight_kg !== null && <span>น้ำหนัก {format(m.weight_kg)}</span>}
                      {m.body_fat_pct !== null && <span>Body Fat {m.body_fat_pct}%</span>}
                      {m.muscle_kg !== null && <span>Muscle {format(m.muscle_kg)}</span>}
                      {m.waist_cm !== null && <span>เอว {m.waist_cm} ซม.</span>}
                      {m.chest_cm !== null && <span>อก {m.chest_cm} ซม.</span>}
                      {m.hip_cm !== null && <span>สะโพก {m.hip_cm} ซม.</span>}
                      {m.arm_cm !== null && <span>ต้นแขน {m.arm_cm} ซม.</span>}
                      {m.thigh_cm !== null && <span>ต้นขา {m.thigh_cm} ซม.</span>}
                      {m.body_fat_kg !== null && <span>มวลไขมัน {format(m.body_fat_kg)}</span>}
                      {m.body_water_kg !== null && <span>น้ำในร่างกาย {format(m.body_water_kg)}</span>}
                      {m.inorganic_salt_kg !== null && <span>เกลือแร่ {format(m.inorganic_salt_kg)}</span>}
                      {m.protein_kg !== null && <span>โปรตีน {format(m.protein_kg)}</span>}
                      {m.skeletal_muscle_kg !== null && <span>กล้ามเนื้อโครงร่าง {format(m.skeletal_muscle_kg)}</span>}
                      {m.visceral_fat_grade !== null && <span>ไขมันช่องท้อง ระดับ {m.visceral_fat_grade}</span>}
                      {m.bmr_kcal !== null && <span>BMR {m.bmr_kcal} kcal</span>}
                    </p>
                  </div>
                ))}
              </PremiumCard>
            )}
          </section>
        </div>
      )}

      {tab === 'photos' && <PhotosTab photos={photos} onChanged={load} />}
    </div>
  )
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.3 10.7 15.7 6.3M8.3 13.3 15.7 17.7" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

function TrendUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 17 9 11 13 15 21 6" />
      <polyline points="14 6 21 6 21 13" />
    </svg>
  )
}

function ScaleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="10" width="18" height="10" rx="2" />
      <circle cx="12" cy="15" r="2" />
      <path d="M8 10 L12 4 L16 10" />
    </svg>
  )
}

function MuscleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 20c0-5 1-8 2-10 1-2 3-3 5-3 3 0 5 2 5 5 0 2-1 3-3 3-1 0-2-1-2-2" />
      <path d="M8 20c0-3 .5-5 1.5-7" />
    </svg>
  )
}

function DropletsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="8" cy="9" r="2" />
      <circle cx="16" cy="9" r="1.5" />
      <circle cx="12" cy="16" r="2.5" />
    </svg>
  )
}

// v: ฟีดแบ็ก "ป้าย 'สูง' คำเดียวยังดูเหมือน Progress Bar ธรรมดา อยากได้ 'Above Standard' แบบมีทิศทางบอก
// ชัดกว่า" — เปลี่ยนจากคำเดี่ยว (ต่ำ/มาตรฐาน/สูง) เป็นวลีเทียบเกณฑ์ที่สื่อความหมายมากกว่า
const ZONE_LABEL_TH: Record<'Low' | 'Standard' | 'High', string> = {
  Low: 'ต่ำกว่าเกณฑ์',
  Standard: 'ปกติ',
  High: 'สูงกว่าเกณฑ์',
}
// ลูกศรบอกทิศทางตำแหน่งจริง (ไม่ใช่สีดี/แย่ ซึ่ง ZoneBadge คำนวณแยกจาก classifyMetric อยู่แล้ว) — Standard
// ไม่มีลูกศรเพราะอยู่ตรงกลางเกณฑ์พอดี ไม่มีทิศทางให้ชี้
const ZONE_ARROW: Record<'Low' | 'Standard' | 'High', string> = { Low: '↓', Standard: '', High: '↑' }

// v: สีป้ายเดิมตายตัวตามโซน (Low=ฟ้า, Standard=เขียว, High=แดง) ไม่สนทิศทางที่ "ดี" ของตัวชี้วัดนั้นเลย —
// ทำให้กล้ามเนื้อโครงร่าง "สูง" (ซึ่งเป็นเรื่องดี เพราะยิ่งเยอะยิ่งดี) ขึ้นสีแดงเหมือนน้ำหนัก/ไขมัน/BMI "สูง"
// ที่เป็นเรื่องไม่ดี ดูสับสนว่า "ทำไมสูงหมด" — เปลี่ยนมาใช้ classifyMetric ตัวเดียวกับที่คำนวณคะแนนสุขภาพ
// รวม (ดูฟังก์ชันด้านบนสุดของไฟล์) ให้สีป้ายสะท้อนว่าค่านั้น "ดี/มาตรฐาน" (เขียว) หรือ "ควรปรับปรุง" (แดง)
// จริงๆ ตามทิศทางของตัวชี้วัด ไม่ใช่แค่ตำแหน่งบน/ล่างช่วงมาตรฐานเฉยๆ
// v28: ฟีดแบ็ก "สีเขียวถูกใช้เยอะเกินไป — Standard/'ปกติ' ไม่ใช่ favorable จริงๆ แค่อยู่ในช่วงคาดหวัง
// ไม่ควรเขียวเหมือน 'good' — Green ควรสงวนไว้เฉพาะ Positive/Healthy/Goal achieved" — เดิม status
// 'good' กับ 'standard' (จาก classifyMetric) ถูกจับกลุ่มเป็นเขียวเหมือนกันหมด แยก standard ออกมาใช้
// steel (โทนกลาง) แทน เหลือเขียวไว้เฉพาะ 'good' เท่านั้น
// v63: ฟีดแบ็ก "Skeletal Muscle 28.1 kg ↑ สูงกว่าเกณฑ์ (higherBetter — สีเขียวถูกแล้ว) แต่คำว่า 'สูงกว่าเกณฑ์'
// เฉยๆ ฟังดูเหมือนผิดปกติ ทั้งที่จริงคือเรื่องดี — สีอย่างเดียวไม่พอ ต้องดูออกจากคำด้วย" — ZoneBadge เดิมใช้
// ZONE_LABEL_TH ("สูงกว่าเกณฑ์"/"ต่ำกว่าเกณฑ์") ตรงๆ ทุกกรณีไม่ว่าจะ favorable หรือไม่ (ต่างจาก IconStatCard ที่
// มีกลไก "favorable → เพียงพอ ✓/อยู่ในเกณฑ์ดี ✓" อยู่แล้วตั้งแต่ v55) — เอากลไกเดียวกันมาใช้กับ ZoneBadge ด้วย
// ให้สอดคล้องกันทั้งแอป ไม่ต้องคิดคำใหม่
// v65: ฟีดแบ็ก "28.1 kg สูงกว่า ideal range บน (28.0) จริง แต่ badge บอก 'อยู่ในเกณฑ์ดี' ซึ่งแปลว่า 'อยู่ใน
// ช่วง' — สับสนเพราะจริงๆ อยู่นอกช่วง แค่เป็นทิศทางที่ดี" — เดิม ZoneBadge ใช้ข้อความ "อยู่ในเกณฑ์ดี ✓" คงที่
// ทุก favorable zone ไม่ว่า High/Low (ต่างจาก IconStatCard ที่แยก High="เพียงพอ ✓" อยู่แล้ว) แก้ให้ตรงกับ
// IconStatCard: High ใช้ "เพียงพอ ✓" (ไม่อ้างว่า "อยู่ในช่วง") เหลือ "อยู่ในเกณฑ์ดี ✓" ไว้เฉพาะ Low favorable
// v66: ฟีดแบ็ก "'เพียงพอ' ดีกว่า 'อยู่ในเกณฑ์ดี' แล้ว แต่ยังไม่ค่อยสัมพันธ์กับแถบ Ideal Range ที่โชว์คู่กันอยู่ —
// ถ้าอยากเป็นมิตร ไม่จำเป็นต้องพูดเรื่องเกิน/ไม่เกินช่วงเลยด้วยซ้ำ (28.1 vs 28.0 ต่างกันแค่ 0.1 kg)" — เปลี่ยน
// เป็นคำเดียวกลางๆ "ดี ✓" ทั้ง High/Low favorable (ไม่อ้างตำแหน่งเทียบช่วงเลย ตัดปัญหา "อยู่ใน/นอกช่วง" ทั้งสองด้าน
// ไปพร้อมกัน ไม่ใช่แค่ฝั่ง High ที่เจอฟีดแบ็ก — ฝั่ง Low เดิมก็มีปัญหาความหมายเดียวกันแฝงอยู่ เพียงแต่ยังไม่มีคนทัก)
function ZoneBadge({ zone, direction = 'neutral' }: { zone: 'Low' | 'Standard' | 'High'; direction?: Direction }) {
  const status = classifyMetric(zone, direction)
  const cls = status === 'needsWork' ? 'bg-rustdim text-rusttext' : status === 'good' ? 'bg-mossdim text-moss' : 'bg-steeldim text-steel'
  const zoneIsFavorable = zone === 'High' ? direction === 'higherBetter' : zone === 'Low' ? direction === 'lowerBetter' : false
  return (
    <span className={`text-[12px] font-display tracked uppercase px-2 py-1 rounded-full whitespace-nowrap ${cls}`}>
      {zoneIsFavorable ? (
        'ดี ✓'
      ) : (
        <>
          {ZONE_ARROW[zone] && `${ZONE_ARROW[zone]} `}
          {ZONE_LABEL_TH[zone]}
        </>
      )}
    </span>
  )
}

type AdditionalMetricRow = {
  key: string
  label: string
  value: string
  zone: Zone | null
  direction: Direction
  delta: number | null
  deltaUnit: string
  decimals: number
  // v64: ฟีดแบ็ก "Protein 🔴 สูงกว่าเกณฑ์ — คำว่า 'สูงกว่าเกณฑ์' ต้องมี reference range ที่มั่นใจจริงๆ ว่า
  // ทิศทางไหนดี ไม่งั้นไม่ควรตัดสินว่าสูง=ผิดปกติ" — proteinPctZone มีเกณฑ์จริง (ไม่ใช่เดา, verify แล้วรอบก่อน)
  // แต่ไม่มีข้อมูลยืนยันว่า "สูง" ดีหรือไม่ดี (direction ไม่ชัดพอจะ higherBetter/lowerBetter) — ตัวเลือกนี้
  // ให้แถวยังโชว์ zone label ได้ (ยังมีประโยชน์เชิงข้อมูล) แต่บังคับสีเป็นกลาง (steel, เหมือน Standard) เสมอ
  // ไม่ตัดสินว่าดี/ไม่ดี แทนการเอา zone ออกทั้งหมด (เสียข้อมูลบริบท) หรือฟันธงเขียว/แดง (มั่นใจเกินจริง)
  neutralStatus?: boolean
}

// v30: ฟีดแบ็ก "Additional Metrics ยังดูแบนกว่าส่วนอื่น...visual hierarchy ยังดูเหมือน table ขณะที่ส่วนอื่น
// ดู Premium มาก — ไม่จำเป็นต้องเพิ่มกราฟ แค่เพิ่มสถานะ/คำอธิบายเล็กๆ เช่น 🔴 สูงกว่าเกณฑ์/🔵 ปกติ" — เดิมมีแค่
// ZoneBadge pill เดียว เปลี่ยนเป็นวงกลมสี + ข้อความสถานะเต็ม (บรรทัดแยกใต้ label+value) ให้เข้าภาษาเดียวกับ
// interpretation line ที่เพิ่งเพิ่มใน Analysis ด้านล่าง — สีวงกลมอิง classifyMetric เดียวกับ ZoneBadge หลัง
// แก้ปัญหาสีเขียวใช้เยอะเกินไป (🔵 ปกติ, 🟢 เฉพาะ favorable จริง, 🔴 needsWork) ไม่มี zone = โชว์เดลต้าแทน
// เหมือนเดิม (ไม่เดา zone ที่ไม่มีข้อมูลรองรับ)
// v59: ฟีดแบ็ก (เอกสาร handoff P1) "Metric card ต้องใช้ anatomy เดียวกันทุกใบ — ลดการตีความต่างกันระหว่าง
// key และ secondary metric" — เดิมแถวนี้โชว์ zone-status "หรือ" delta อย่างใดอย่างหนึ่งเท่านั้น (zone ตัด
// delta ทิ้งถ้ามีทั้งคู่) ทั้งที่การ์ด Key Metrics (IconStatCard) โชว์ทั้ง zone pill และ delta พร้อมกันเสมอถ้า
// มีข้อมูลทั้งคู่ — เปลี่ยนให้แถวนี้แสดงทั้งสองอย่างพร้อมกันเมื่อมีข้อมูลจริง ให้ anatomy ตรงกับ Key Metrics
function AdditionalMetricStatus({
  zone,
  direction,
  delta,
  deltaUnit,
  decimals,
  neutralStatus,
}: Pick<AdditionalMetricRow, 'zone' | 'direction' | 'delta' | 'deltaUnit' | 'decimals' | 'neutralStatus'>) {
  const zoneNode = zone
    ? (() => {
        const status = neutralStatus ? 'standard' : classifyMetric(zone, direction)
        const dot = status === 'needsWork' ? '🔴' : status === 'good' ? '🟢' : '🔵'
        const color = status === 'needsWork' ? '#CF715F' : status === 'good' ? '#8CB264' : '#9DA0A8'
        return (
          <span className="text-[12px] whitespace-nowrap" style={{ color }}>
            {dot} {ZONE_ARROW[zone] && `${ZONE_ARROW[zone]} `}
            {ZONE_LABEL_TH[zone]}
          </span>
        )
      })()
    : null
  const deltaNode =
    delta !== null
      ? (() => {
          const good = direction !== 'neutral' && (direction === 'higherBetter' ? delta > 0 : delta < 0)
          const bad = direction !== 'neutral' && (direction === 'higherBetter' ? delta < 0 : delta > 0)
          const cls = good ? 'text-moss' : bad ? 'text-rusttext' : 'text-muted'
          return (
            <span className={`text-[12px] font-mono whitespace-nowrap ${cls}`}>
              {delta > 0 ? '↑' : delta < 0 ? '↓' : '·'} {Math.abs(delta).toFixed(decimals)} {deltaUnit}
            </span>
          )
        })()
      : null
  if (!zoneNode && !deltaNode) return <span className="text-[12px] text-muted">—</span>
  return (
    <span className="flex items-center gap-2 flex-wrap justify-end">
      {deltaNode}
      {zoneNode}
    </span>
  )
}

// ฟีดแบ็ก "ลด Information Density...ยุบ Additional Metrics เป็นตาราง Metric/Value/Status + View all
// metrics" (Priority 1) — แถวเดียว label+value+status กะทัดรัดกว่าการ์ด IconStatCard เต็มยศมาก ดีฟอลต์โชว์
// แค่ 4 แถวแรก กดขยายดูครบ 7 ได้ (รูปแบบเดียวกับปุ่ม "ดูตัวชี้วัดเพิ่มเติม" ในแท็บแนวโน้ม)
function AdditionalMetricsTable({ rows }: { rows: AdditionalMetricRow[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? rows : rows.slice(0, 4)
  return (
    <div>
      <p className="text-[12px] tracked uppercase mb-2" style={{ color: '#B8BBC2' }}>Additional Metrics</p>
      {/* v55: การ์ดรอง (ชื่อก็บอกอยู่แล้วว่า "Additional") ลด texture ลงครึ่งหนึ่งเหมือน tier 2/3 ของ Key Metrics
          v60: ฟีดแบ็ก "Card ใหญ่เกินข้อมูล ลดความสูงประมาณ 30-40%" — ลด padding รอบการ์ด (py-1→py-0.5) และ
          ต่อแถว (py-2.5→py-1.5, ช่องว่างระหว่างบรรทัดค่า/สถานะ mt-1→mt-0.5) ไม่ลดฟอนต์/ตัดข้อมูลใดออก แค่ลด
          ช่องว่างล้วนๆ (ไม่รวมเป็นแถวเดียวเพราะบางแถวมีทั้ง delta+zone พร้อมกันแล้ว อาจล้นความกว้างมือถือแคบ) */}
      <PremiumCard className="px-4 py-0.5" reducedTexture>
        <div className="divide-y divide-line/60">
          {visible.map((r) => (
            <div key={r.key} className="py-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-ink">{r.label}</span>
                <span className="font-mono text-xs tabular text-ink whitespace-nowrap">{r.value}</span>
              </div>
              <div className="flex justify-end mt-0.5">
                <AdditionalMetricStatus
                  zone={r.zone}
                  direction={r.direction}
                  delta={r.delta}
                  deltaUnit={r.deltaUnit}
                  decimals={r.decimals}
                  neutralStatus={r.neutralStatus}
                />
              </div>
            </div>
          ))}
        </div>
      </PremiumCard>
      {rows.length > 4 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex flex-col items-center justify-center gap-0.5 text-[12px] font-display tracked uppercase text-muted border border-line rounded-lg py-2 mt-2 active:scale-[0.99] transition"
        >
          <span className="flex items-center gap-1.5">
            {expanded ? 'แสดงน้อยลง' : 'ดูตัวชี้วัดเพิ่มเติม'}
            <span className={`transition-transform ${expanded ? '-rotate-90' : 'rotate-90'}`}>
              <ChevronRightIcon />
            </span>
          </span>
          {/* v70: ฟีดแบ็ก "ปุ่มพับไม่บอกว่าข้างในมีอะไรบ้าง — เพิ่ม preview เช่น 'BMI • Visceral Fat • ...'" —
              ใช้ label จริงของแถวที่ถูกซ่อนอยู่ (rows.slice(4)) ไม่ fabricate ชื่อใหม่ ไม่ใช่ตัวช่วยลดความสูงหน้า
              (section นี้พับอยู่แล้วตั้งแต่ก่อนหน้า) แค่ทำให้ปุ่มสื่อสารได้ตรงว่ากดแล้วจะเจออะไร */}
          {!expanded && (
            <span className="normal-case tracking-normal text-[12px] text-muted/70 truncate max-w-full px-2">
              {rows.slice(4).map((r) => r.label).join(' • ')}
            </span>
          )}
        </button>
      )}
    </div>
  )
}

function FireIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 2c1 3-3 4-3 7a3 3 0 0 0 6 0c1.5 1.5 2 3.5 2 5a5 5 0 0 1-10 0c0-4 3-5 3-9 0-1 .5-2.2 2-3z" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20c1-4 3.8-6 6.5-6s5.5 2 6.5 6" />
    </svg>
  )
}

function RulerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="8" width="18" height="8" rx="1.5" />
      <path d="M7 8v3M11 8v3M15 8v3" />
    </svg>
  )
}

function LeafIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 19c8 1 13-4 14-14-9 0-14 5-14 14z" />
      <path d="M5 19c2-4 5-7 9-9" />
    </svg>
  )
}

function DiamondIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3 20 12 12 21 4 12z" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 20.5s-7.5-4.6-9.8-9.3C.8 7.7 2.6 4.5 6 4c2-.3 3.7.7 6 3 2.3-2.3 4-3.3 6-3 3.4.5 5.2 3.7 3.8 7.2-2.3 4.7-9.8 9.3-9.8 9.3z" />
    </svg>
  )
}

function BoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.5 6.5c1-1 1-2.5 0-3.5s-2.5-1-3.5 0c-.6.6-.8 1.4-.7 2.1L7.1 11.3c-.7-.1-1.5.1-2.1.7-1 1-1 2.5 0 3.5s2.5 1 3.5 0c.6-.6.8-1.4.7-2.1l6.2-6.2c.7.1 1.5-.1 2.1-.7z" />
    </svg>
  )
}

const TREND_ICONS: Record<string, () => JSX.Element> = {
  weight: ScaleIcon,
  fat: DropletsIcon,
  muscle: MuscleIcon,
  water: DropletsIcon,
  bmi: PersonIcon,
  salt: DiamondIcon,
  protein: LeafIcon,
  fire: FireIcon,
  ruler: RulerIcon,
  heart: HeartIcon,
  bone: BoneIcon,
}

// ===== Metric Icons: รูปจริงจากชุด "FITLOG – Metric Icons" ที่ผู้ใช้ส่งมา =====
// ไฟล์ทั้งชุดอยู่ที่ /public/icons/*.png แล้ว — ด้านล่างคือ 12 ตัวที่ใช้ในหน้าสุขภาพตอนนี้
// ส่วนที่เหลือ (activity, calories, goals, heart-rate, history, hydration, metabolism,
// progress, settings, sleep, workouts, achievements) เตรียมไว้ใช้ในหน้าอื่นต่อได้เลย
const STAT_ICON_IMAGES: Record<string, string> = {
  weight: '/icons/weight.png',
  bmi: '/icons/bmi.png',
  bodyFat: '/icons/body-fat.png',
  muscleMass: '/icons/muscle-mass.png',
  fatMass: '/icons/fat-mass.png',
  visceralFat: '/icons/visceral-fat.png',
  bodyWater: '/icons/body-water.png',
  protein: '/icons/protein.png',
  skeletalMuscle: '/icons/skeletal-muscle.png',
  boneMass: '/icons/bone-mass.png',
  bodyAge: '/icons/body-age.png',
  bmr: '/icons/bmr.png',
  // ไอคอนชุดที่ 2 เฉพาะสำหรับการ์ด Obesity Analysis (BMI / Body fat rate) — คนละรูปกับตัวชี้วัดด้านบน
  // เพื่อไม่ให้ซ้ำหน้าตากับการ์ดสรุปด้านบนสุดของหน้าเดียวกัน
  bmiObesity: '/icons/bmi-obesity.png',
  bodyFatObesity: '/icons/body-fat-obesity.png',
}

// ไอคอนสำหรับการ์ด Insight แต่ละแบบ — คีย์เป็น "id|emoji เดิม" เพราะบาง insight (เช่น trend-weight)
// ใช้ id เดียวกันทั้งสองทิศทาง (ขึ้น/ลง) แล้วแยกกันด้วย emoji แทน ต้องรวมสองอย่างถึงจะระบุแบบไม่ซ้ำได้
// ถ้า id|emoji ไหนไม่มีรูป จะ fallback ไปใช้ emoji เดิมของ insight นั้น
const INSIGHT_ICON_IMAGES: Record<string, string> = {
  'trend-bodyfat-down|🔥': '/icons/trend-improved.png',
  'trend-bodyfat-up|⚠️': '/icons/body-fat-high.png',
  'trend-muscle-up|💪': '/icons/muscle-up-icon.png',
  'trend-muscle-down|⚠️': '/icons/muscle-down-icon.png',
  'trend-musclemass-up|💪': '/icons/muscle-up-icon.png',
  'trend-musclemass-down|⚠️': '/icons/muscle-down-icon.png',
  'trend-weight|📉': '/icons/weight-down.png',
  'trend-weight|📈': '/icons/weight-good.png',
}

// trend.key ส่วนใหญ่ตรงกับคีย์ใน STAT_ICON_IMAGES อยู่แล้ว (เช่น 'weight', 'bmi', 'skeletalMuscle')
// ยกเว้นบางตัวที่ตั้งชื่อไม่ตรงกัน — ตารางนี้ไว้แปลงเฉพาะกรณีนั้น
const TREND_KEY_TO_IMAGE_KEY: Record<string, string> = { bodyFatKg: 'fatMass' }

// หา imageKey ที่ใช้ได้จริงจาก trend.key (คืน undefined ถ้าไม่มีรูปสำหรับตัวชี้วัดนั้น เช่น เกลือแร่/รอบเอว ฯลฯ)
function imageKeyFor(trendKey: string): string | undefined {
  const mapped = TREND_KEY_TO_IMAGE_KEY[trendKey] ?? trendKey
  return STAT_ICON_IMAGES[mapped] ? mapped : undefined
}

// ไอคอนตัวชี้วัด — ใช้รูปจริงจากชุดไอคอนถ้ามี (ไม่ต้องมีวงกลมพื้นหลัง เพราะรูปมีสี/พื้นหลังในตัวอยู่แล้ว)
// ถ้าตัวชี้วัดนั้นยังไม่มีรูป (เช่น เกลือแร่, รอบเอว) ใช้ไอคอนเส้น SVG เดิม + วงกลมสีพื้นหลังแทน
// v47: ฟีดแบ็ก "ตรวจสอบหน้าอื่นๆ ที่ยังไม่ได้ผ่านธีม Dark Titanium" — ไอคอนชิปนี้เดิมไม่มีพื้นวัสดุเลย (รูป
// ลอยเปล่าๆ) หรือพื้นทึบสีเดียว (แบบ Icon fallback) คนละภาษากับชิปไอคอนของ MetricCard บน Dashboard
// (CARD_GRADIENT_CSS ไทเทเนียม + จุดสีธีมแต้มมุม) ทั้งที่ใช้ไอคอนชุดเดียวกัน (STAT_ICON_IMAGES ตรงกับ
// METRIC_ICON_IMAGES ของ Dashboard) — เปลี่ยนให้ใช้สูตรเดียวกันเป๊ะ ให้สองหน้าดูเป็นภาษาเดียวกัน
function MetricIconChip({ iconKey, imageKey, color, size = 28 }: { iconKey: string; imageKey?: string; color: string; size?: number }) {
  const src = imageKey ? STAT_ICON_IMAGES[imageKey] : undefined
  const Icon = TREND_ICONS[iconKey] ?? ScaleIcon
  return (
    <span
      className="relative shrink-0 rounded-[10px] overflow-hidden flex items-center justify-center"
      style={{
        width: size,
        height: size,
        backgroundImage: `radial-gradient(circle at 30% 25%, ${color}55, transparent 65%), ${CARD_GRADIENT_CSS}`,
        border: `1px solid ${color}55`,
        boxShadow: `inset 0 1px rgba(255,255,255,.15), inset 0 -2px 4px rgba(0,0,0,.5), 0 0 10px ${color}33`,
      }}
    >
      {src ? (
        <Image src={src} alt="" width={size} height={size} className="relative" style={{ width: '68%', height: '68%', objectFit: 'contain' }} />
      ) : (
        <span className="relative flex items-center justify-center" style={{ color }}>
          <Icon />
        </span>
      )}
    </span>
  )
}

// การ์ดสรุปตัวเลขล่าสุดด้านบน (พร้อม badge Low/Standard/High) — ใช้ค่า "ล่าสุดจริง" ไม่ขึ้นกับช่วงเวลาที่เลือกดูกราฟ
function TopStatCard({
  label,
  value,
  unit,
  decimals = 1,
  low,
  high,
  iconKey,
  imageKey,
  color = '#6C8CA8',
  data,
  direction = 'neutral',
  periodLabel,
}: {
  label: string
  value: number | null | undefined
  unit: string
  decimals?: number
  low?: number | null
  high?: number | null
  iconKey: string
  imageKey?: string
  color?: string
  data?: { label: string; value: number }[]
  direction?: Direction
  periodLabel?: string
}) {
  const zone = value != null && low != null && high != null ? zoneOf(value, low, high) : null
  const hasSpark = data && data.length > 1
  const first = hasSpark ? data![0].value : null
  const last = hasSpark ? data![data!.length - 1].value : null
  const delta = first !== null && last !== null ? last - first : null
  const deltaGood = delta !== null && direction !== 'neutral' && (direction === 'higherBetter' ? delta > 0 : delta < 0)
  const deltaBad = delta !== null && direction !== 'neutral' && (direction === 'higherBetter' ? delta < 0 : delta > 0)
  const deltaColor = deltaGood ? 'text-moss' : deltaBad ? 'text-rusttext' : 'text-muted'
  const gradientId = `spark-${iconKey}-${label}`.replace(/[^a-zA-Z0-9-]/g, '')

  return (
    <PremiumCard className="px-4 py-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <MetricIconChip iconKey={iconKey} imageKey={imageKey} color={color} size={24} />
        <span className="text-[12px] tracked uppercase text-muted truncate">{label}</span>
      </div>
      <p className="font-mono text-xl tabular text-ink">
        {value != null ? value.toFixed(decimals) : '—'}
        <span className="text-xs text-muted ml-1">{unit}</span>
        {delta !== null && (
          <span className={`text-[12px] font-mono ml-1.5 ${deltaColor}`}>
            {delta > 0 ? '↑' : delta < 0 ? '↓' : '·'} {Math.abs(delta).toFixed(decimals)}
          </span>
        )}
      </p>
      {periodLabel && <p className="text-[12px] text-muted mt-0.5">จาก{periodLabel}ก่อน</p>}
      {hasSpark ? (
        <div className="h-8 -mx-1 mt-1.5">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={`url(#${gradientId})`} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : zone ? (
        <div className="mt-1.5">
          <ZoneBadge zone={zone} direction={direction} />
        </div>
      ) : null}
    </PremiumCard>
  )
}

type OverviewTrendMetricKey = 'weight' | 'bodyFat' | 'muscle'

// v27: ฟีดแบ็ก "ข้อมูลขัดกันเอง — เดลต้า/insight เดิมของการ์ดนี้ผูกกับ range 7D-1Y ที่เลือกดู ต่างจาก
// Health Score/Key Metrics ที่ใช้ fieldDelta (ล่าสุด vs ก่อนหน้าล่าสุด) ทำให้ตัวเลขไม่ตรงกัน" — เดลต้า/
// changePeriodLabel ไม่ผูกกับ range นี้แล้ว (ดูคอมเมนต์จุดเรียก OverviewTrendChart) เหลือแค่คุมว่ากราฟย้อนดู
// ข้อมูลไกลแค่ไหน — เคยมี longLabel ต่อท้ายเดลต้าด้วย ตอนนี้ไม่ได้ใช้แล้วเลยตัดออก
const OVERVIEW_TREND_RANGES: { days: number; label: string }[] = [
  { days: 7, label: '7D' },
  { days: 30, label: '30D' },
  { days: 90, label: '3M' },
  { days: 180, label: '6M' },
  { days: 365, label: '1Y' },
]

const OVERVIEW_TREND_METRICS: Record<OverviewTrendMetricKey, { label: string; color: string }> = {
  weight: { label: 'น้ำหนัก', color: '#E8A33D' },
  bodyFat: { label: 'ไขมัน', color: '#C1503A' },
  muscle: { label: 'มวลกล้ามเนื้อ', color: '#7FA85F' },
}

// v38: ฟีดแบ็ก "เส้นกราฟควรมี depth — ไม่ใช่สีส้มบางๆ แบนๆ" — ไล่เฉด (มืด→สี metric เดิม→สว่าง) ทำเส้นแบบ
// metallic gradient แทนสีเดียวแบน ใช้สี metric เดิมของแต่ละแท็บเป็นฐาน (ไม่ผูกสีทองตายตัวแบบที่แนะนำมา เพราะ
// การ์ดนี้สลับได้ 3 ตัวชี้วัด สีต้องตามด้วย ไม่ใช่แค่ตอนดูน้ำหนัก) — amt ติดลบ = เข้มขึ้น, บวก = สว่างขึ้น
function shadeColor(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt > 0 ? c + (255 - c) * amt : c + c * amt)))
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`
}

// ฟีดแบ็ก "ให้คะแนน วิเคราะห์" mockup 4 เวอร์ชัน แล้วเลือกทำ "Version 3" — จุดเด่นสุดคือกราฟเทรนด์เป็น
// พระเอกของหน้า Overview พร้อมสลับช่วงเวลา (7D-1Y) และตัวชี้วัดได้ในตัว — เพิ่มเป็น section ใหม่เหนือ
// Key Metrics เดิม (ไม่ทุบ IconStatCard grid ที่เพิ่งจัดหมวด Key/Additional Metrics เสร็จตามฟีดแบ็กรอบก่อน)
// ใช้ recharts LineChart สไตล์เดียวกับ MetricRowCard ในแท็บ "แนวโน้ม" ด้านล่าง แต่ผูก state ช่วงเวลา
// ของตัวเองแยกต่างหาก (7D-1Y คนละบริบทกับ trendPeriodDays 7/30/90 ของแท็บแนวโน้ม)
// ฟีดแบ็ก "❗ ข้อมูลขัดกันเอง — ด้านบนบอก ↓0.4% ไขมัน แต่ Insight ใต้กราฟบอก Body Fat เพิ่มขึ้น 3.2%...
// Critical UX/Data issue เพราะผู้ใช้จะไม่รู้ว่าควรเชื่ออันไหน" — สาเหตุคือ Insight เดิมคำนวณเดลต้าจาก
// "จุดแรก/จุดสุดท้ายในกราฟช่วงที่เลือกดู" (7D-1Y) ซึ่งเป็นคนละฐานกับ Health Score/Key Metrics ทั้งหน้าที่ใช้
// fieldDelta (ค่าล่าสุด vs ค่าก่อนหน้าล่าสุด เท่านั้น ไม่ผูกกับ range) — ทำให้ตัวเลขไม่ตรงกันได้จริงถ้ามีการวัด
// หลายครั้งในช่วงที่เลือก — แก้โดยรับ weightDelta/bodyFatDelta/muscleDelta/changePeriodLabel จาก parent
// (คำนวณครั้งเดียวด้วย fieldDelta เดียวกับที่ Health Score header ใช้ ผ่าน props แทนคำนวณซ้ำในนี้) ให้
// เดลต้า/Insight ในการ์ดนี้เป็น "ค่าเดียวกันเป๊ะ" กับที่ Health Score/Key Metrics แสดงเสมอ ไม่มีทางขัดกันอีก —
// range selector (7D-1Y) ตอนนี้คุมแค่ "กราฟจะย้อนดูข้อมูลไกลแค่ไหน" ไม่ได้คุมตัวเลขเดลต้า/Insight แล้ว
// v29: ฟีดแบ็ก "hover/point ควรแสดง 24 Aug / 67.1 kg / +0.6 kg แทนที่จะพยายามแสดง label ทุกจุด" — เดลต้า
// เป็นแค่การเปลี่ยนแปลงระหว่างจุด ไม่ตัดสินว่าดี/ไม่ดี (ทิศทางที่ "ดี" ต่างกันไปตามตัวชี้วัด/เป้าหมายผู้ใช้
// ซึ่ง tooltip นี้ไม่รู้บริบทนั้น) เลยใช้สีกลางเสมอ ไม่ใช้เขียว/แดงตามเครื่องหมาย +/- กันสื่อความหมายผิด
function ChartPointTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean
  payload?: { payload: { value: number; delta: number | null } }[]
  label?: string
  unit: string
}) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0].payload
  return (
    <div style={{ background: '#1C1F24', border: '1px solid #2E333A', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
      <p style={{ color: '#9498A0', marginBottom: 2 }}>{label}</p>
      <p style={{ color: '#F3F0E8', fontWeight: 600 }}>
        {point.value.toFixed(1)} {unit}
      </p>
      {point.delta !== null && (
        <p style={{ color: '#9DA0A8', marginTop: 2 }}>
          {point.delta > 0 ? '+' : point.delta < 0 ? '−' : '·'} {Math.abs(point.delta).toFixed(1)} {unit}
        </p>
      )}
    </div>
  )
}

// v36: ฟีดแบ็ก "ให้คะแนน 4 มockup สี แล้วเลือก Version 1 (Amber)" ตามด้วย "ทำตามแบบนี้เลยดีไหม" (มี stat
// row เฉลี่ย/ต่ำสุด/สูงสุด, เส้นเป้าหมายประปราย, ป้ายค่าตัวเลขลอยที่จุดแรก/ต่ำสุด/ล่าสุดบนกราฟ, badge เป้าหมาย
// ใต้ตัวเลขหลัก) — เพิ่มฟีเจอร์เหล่านี้ตามภาพ mockup ที่ยังไม่มีในโค้ดจริง (เดิมมีแค่ tabs/range picker/
// headline/insight — ไม่มี stat row, ไม่มีเส้นเป้าหมาย, ไม่มี label ค้างบนจุด) ส่วน insight card ใช้ 💡 อยู่
// แล้ว (ไม่ใช่ ⭐ ตามที่เห็นใน mockup ซึ่งเป็นแค่ภาพตัวอย่างจาก AI ไม่ใช่โค้ดจริง) และ period label
// (changePeriodLabel) แยกจาก range selector (7D-1Y) อยู่แล้วตั้งแต่ v27 — ทั้งสองจุดนี้ไม่ต้องแก้เพิ่ม
function OverviewTrendChart({
  metrics,
  unit,
  toDisplay,
  weightDelta,
  bodyFatDelta,
  muscleDelta,
  changePeriodLabel,
  weightGoalTarget,
  bodyFatGoalTarget,
  weightDirection,
}: {
  metrics: BodyMetric[]
  unit: string
  toDisplay: (v: number) => number
  weightDelta: number | null
  bodyFatDelta: number | null
  muscleDelta: number | null
  changePeriodLabel: string | null
  weightGoalTarget: number | null
  bodyFatGoalTarget: number | null
  // v46: ฟีดแบ็ก "อยากให้ต่ำสุด/สูงสุดของแท็บน้ำหนักมีลูกศรสีตามทิศทางเป้าหมายด้วย เหมือน Body Fat/Muscle" —
  // ยืนยันแล้วว่ายอมรับความเสี่ยงที่เคยเตือนไว้ (กรณีน้ำหนักขึ้นจากกล้ามเนื้อ จะเห็นลูกศรแดงทั้งที่จริงๆ ดี) —
  // ใช้ scoreWeightDirection เดียวกับที่ Health Score ใช้คำนวณ Progress (lowerBetter/higherBetter เท่านั้น
  // ไม่มี neutral — ฝั่ง parent coerce neutral เป็น lowerBetter ไว้แล้ว)
  weightDirection: ScoreDirection
}) {
  const [metricKey, setMetricKey] = useState<OverviewTrendMetricKey>('weight')
  const [rangeDays, setRangeDays] = useState(30)
  const meta = OVERVIEW_TREND_METRICS[metricKey]
  const valueUnit = metricKey === 'bodyFat' ? '%' : unit

  const data = useMemo(() => {
    const since = new Date()
    since.setDate(since.getDate() - rangeDays)
    const offset = since.getTimezoneOffset()
    const sinceStr = new Date(since.getTime() - offset * 60000).toISOString().slice(0, 10)
    const filtered = metrics.filter((m) => m.measured_at >= sinceStr)
    const rows =
      metricKey === 'weight'
        ? filtered.filter((m) => m.weight_kg !== null).map((m) => ({ measured_at: m.measured_at, value: toDisplay(m.weight_kg as number) }))
        : metricKey === 'bodyFat'
          ? filtered.filter((m) => m.body_fat_pct !== null).map((m) => ({ measured_at: m.measured_at, value: m.body_fat_pct as number }))
          : filtered.filter((m) => m.muscle_kg !== null).map((m) => ({ measured_at: m.measured_at, value: toDisplay(m.muscle_kg as number) }))
    const reversed = rows.reverse()
    // v29: ฟีดแบ็ก "hover/point ควรแสดง 24 Aug / 67.1 kg / +0.6 kg แทนที่จะพยายามแสดง label ทุกจุด" — เดลต้า
    // ต่อจุด (เทียบจุดก่อนหน้าในกราฟเดียวกันเท่านั้น ไม่ใช่ fieldDelta ของทั้งหน้า) ใช้เฉพาะใน tooltip ตอน hover
    return reversed.map((r, i) => ({ label: shortLabel(r.measured_at), value: r.value, delta: i > 0 ? r.value - reversed[i - 1].value : null }))
  }, [metrics, rangeDays, metricKey, toDisplay])

  const latestVal = data.length > 0 ? data[data.length - 1].value : null
  const headlineDelta = metricKey === 'weight' ? weightDelta : metricKey === 'bodyFat' ? bodyFatDelta : muscleDelta

  // v42: ฟีดแบ็ก "↑ 0.6 kg ควรมีสีบอกว่าดีขึ้น/แย่ลงชัดเจนไหม" — ใส่สีให้เฉพาะ Body Fat (ลง=ดีเสมอ) กับ
  // Muscle (ขึ้น=ดีเสมอ) เพราะทิศทาง "ดี" ของสองตัวนี้ไม่ผูกกับบริบทอะไรเลย ตัดสินได้ตรงไปตรงมา — Weight
  // จงใจให้เป็นสีกลางต่อไป (ไม่ใช่ bug ที่ลืมใส่สี) ตามหลักการเดิมของทั้งแอปที่ตัดสินใจไว้แล้วรอบก่อนๆ (v39/
  // Round 23-5 "Weight delta always neutral color") เพราะน้ำหนักขึ้นอาจมาจากกล้ามเนื้อเพิ่ม (ดี) หรือไขมัน
  // เพิ่ม (ไม่ดี) พอๆ กัน สีเขียว/แดงตายตัวจะสื่อความหมายผิดได้ — ให้ดูสัญญาณจากไขมัน/กล้ามเนื้อในบรรทัดเดียวกัน
  // (Insight ใต้กราฟ) แทนสำหรับแท็บน้ำหนัก
  const headlineDeltaGood =
    headlineDelta === null || headlineDelta === 0
      ? null
      : metricKey === 'bodyFat'
        ? headlineDelta < 0
        : metricKey === 'muscle'
          ? headlineDelta > 0
          : null

  // v44: ฟีดแบ็ก "ต่ำสุด/สูงสุด ควรมีลูกศร/สีบอกด้วยไหม" — ย้อนกลับไปเจอปัญหาเดียวกับ v43 ถ้าใส่แบบเดียวกันหมด
  // (น้ำหนักสูงสุด = แดงเสมอ ไม่จริงเพราะอาจมาจากกล้ามเนื้อ) — ใส่เฉพาะ Body Fat/Muscle ที่มีทิศทาง "ดี" ชัด
  // ในตัวเอง เหมือน headlineDeltaGood ด้านบน (คนละค่ากันเพราะ min/max ไม่ใช่เดลต้า): Body Fat ต่ำสุด=ดี(เขียว),
  // สูงสุด=แย่(แดง) / Muscle สูงสุด=ดี(เขียว), ต่ำสุด=แย่(แดง)
  // v46: ฟีดแบ็ก "อยากให้น้ำหนักมีลูกศรสีตามทิศทางเป้าหมายด้วย" — ยืนยันยอมรับความเสี่ยงที่เตือนไว้แล้ว (น้ำหนัก
  // ขึ้นจากกล้ามเนื้อจะโดนตัดสินเป็นแดงทั้งที่จริงๆ ดี) ใช้ weightDirection: lowerBetter = ต่ำสุด(ใกล้เป้าหมาย)
  // เป็นดี, higherBetter = สูงสุด(ใกล้เป้าหมาย)เป็นดีแทน
  const minIsGood =
    metricKey === 'bodyFat' ? true : metricKey === 'muscle' ? false : metricKey === 'weight' ? weightDirection === 'lowerBetter' : null
  const maxIsGood =
    metricKey === 'bodyFat' ? false : metricKey === 'muscle' ? true : metricKey === 'weight' ? weightDirection === 'higherBetter' : null

  // v36: เป้าหมาย (เส้นประ + badge) มีเฉพาะน้ำหนัก/Body Fat เพราะเป็น goal_type เดียวที่แอปนี้รองรับ (ไม่มี
  // เป้าหมายมวลกล้ามเนื้อ) — น้ำหนักแปลงหน่วยแสดงผลด้วย toDisplay เหมือนค่าอื่นในกราฟนี้, Body Fat ไม่ต้องแปลง
  const goalTarget =
    metricKey === 'weight' && weightGoalTarget !== null
      ? toDisplay(weightGoalTarget)
      : metricKey === 'bodyFat' && bodyFatGoalTarget !== null
        ? bodyFatGoalTarget
        : null

  // v36: สรุปเฉลี่ย/ต่ำสุด/สูงสุดของช่วงที่กำลังดูอยู่ (data ตัวเดียวกับที่ขึ้นกราฟ — ไม่ใช่ตัวเลขแยกชุด)
  const stats = useMemo(() => {
    if (data.length === 0) return null
    const values = data.map((d) => d.value)
    const avg = values.reduce((s, v) => s + v, 0) / values.length
    return { avg, min: Math.min(...values), max: Math.max(...values) }
  }, [data])

  // v39: ฟีดแบ็ก "Y-axis พัง เห็นเลขแปลกๆ (9999, 1.935, 1.935, 3.935)" — สาเหตุจริงคือ v38 คำนวณ domain
  // จากตัวเลขทศนิยมตรงๆ (เช่น lo=58.935) แล้วปล่อยให้ recharts auto-generate tick ระหว่างขอบเขตทศนิยมพวกนั้น
  // เอง (default tickCount 5, หารเท่าๆ กันไม่ลงตัว) ได้ tick เป็นเลขทศนิยมยาวๆ ไม่ลงตัว (เช่น 61.2425) ซึ่ง
  // ยาวเกินความกว้างแกนจนโดนตัดบางส่วน อ่านไม่ออก — แก้ที่ต้นตอ: ปัด domain ให้เป็นเลขจำนวนเต็มก่อน (floor/
  // ceil) แล้วสร้าง ticks เองเป็นขั้นละ 1 หน่วย (kg/%) ให้เป็นเลขกลมเสมอ ไม่ยกให้ recharts เดาระยะห่าง tick เอง
  // อีกต่อไป — ฟีดแบ็ก "อย่าใช้ scale แคบเกินไป กราฟ 65.8→67.1 ดูใหญ่เกินจริง" ก็แก้ไปพร้อมกันในตัว เพราะ
  // domain ที่ครอบคลุมถึง goal (60) ทำให้ช่วงกว้างขึ้นเป็น ~8-10 หน่วยอยู่แล้ว ไม่แคบจนเกินจริงอีกต่อไป
  const yDomain = useMemo((): [number, number] | undefined => {
    if (!stats) return undefined
    let lo = stats.min
    let hi = stats.max
    if (goalTarget !== null) {
      lo = Math.min(lo, goalTarget)
      hi = Math.max(hi, goalTarget)
    }
    const pad = Math.max((hi - lo) * 0.15, 1)
    return [Math.floor(lo - pad), Math.ceil(hi + pad)]
  }, [stats, goalTarget])

  const yTicks = useMemo(() => {
    if (!yDomain) return undefined
    const [lo, hi] = yDomain
    const range = hi - lo
    const step = range <= 10 ? 1 : range <= 20 ? 2 : range <= 50 ? 5 : Math.ceil(range / 10 / 10) * 10
    const ticks: number[] = []
    for (let v = lo; v <= hi + 0.001; v += step) ticks.push(v)
    return ticks
  }, [yDomain])

  // v54: ฟีดแบ็ก "ตัวเลขบน Graph เยอะไปนิด (66.3/65.8/67.1 พร้อมกัน) ถ้ามี 30 จุดจริงจะรก — จุดล่าสุดควร
  // แสดง label จุดอื่นดูจาก tooltip แทน" — เดิม (v36) ค้าง label จุดแรก/ต่ำสุด/ล่าสุดพร้อมกันเสมอ 3 ป้าย
  // ตอนนี้เหลือแค่จุดล่าสุด จุดอื่นยังกดดู tooltip ได้ปกติ (ChartPointTooltip ด้านล่าง ไม่ได้ถูกตัดออก)
  const labelIndices = useMemo(() => {
    if (data.length === 0) return new Set<number>()
    return new Set([data.length - 1])
  }, [data])

  // v38: ฟีดแบ็ก "จุดล่าสุดควรเด่นที่สุด — ● 67.1 kg พร้อม glow เล็กๆ แบบ floating titanium pill" — จุด
  // ล่าสุดตอนนี้มีทั้งหน่วยต่อท้าย (67.1 kg แทน 67.1 เฉยๆ) และ bullet นำหน้า ส่วนจุดอื่น (แรก/ต่ำสุด) ยังเป็น
  // ตัวเลขล้วนไม่มีหน่วยเหมือนเดิม (สั้นกว่า อ่านไว กันรก) — บับเบิลจุดล่าสุดกว้างขึ้นให้พอดีกับข้อความที่ยาวขึ้น
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts' LabelList content prop type doesn't expose a usable prop shape to narrow against
  const renderPointLabel = (props: any) => {
    const { x, y, index, value } = props as { x?: number; y?: number; index?: number; value?: number }
    if (x === undefined || y === undefined || index === undefined || value === undefined || !labelIndices.has(index)) return null
    const isLatest = index === data.length - 1
    // v40: ฟีดแบ็ก "จุดล่าสุดควรบอกชัดว่าเป็น Current/ล่าสุด ไม่ใช่แค่จุดข้อมูลธรรมดา" — เปลี่ยนจาก bullet
    // นำหน้า (● 67.1 kg) เป็นคำว่า "ล่าสุด" ตรงๆ ชัดกว่า ไม่ต้องตีความสัญลักษณ์
    const text = isLatest ? `ล่าสุด ${value.toFixed(1)} ${valueUnit}` : value.toFixed(1)
    // v37: ฟีดแบ็ก (จากสกรีนช็อตจริง) "ป้าย 67.x ของจุดล่าสุดโดนตัดที่ขอบขวาการ์ด" — บับเบิลเดิม center
    // ที่ x เป๊ะ (x-21..x+21) ทำให้ครึ่งขวาล้นออกไปนอกกราฟถ้าจุดนั้นอยู่ชิดขอบขวาสุด (จุดล่าสุดเป็นแบบนี้เสมอ) —
    // เฉพาะจุดล่าสุด เลื่อนบับเบิลไปทางซ้ายให้ขอบขวาบับเบิลชนกับจุดพอดีแทนที่จะ center ทับจุด กันล้นขอบ
    const width = isLatest ? 92 : 42
    const rectX = isLatest ? x - width + 6 : x - width / 2
    // v39: ฟีดแบ็ก "pill สีทองทึบดูหนักไป — เปลี่ยนเป็น Dark Titanium + gold border บางๆ จะดู premium กว่า"
    // เปลี่ยนจาก fill ทึบสี meta.color เป็น fill เข้มเหมือนจุดอื่น + stroke สี meta.color บางๆ แทน
    // v41: ฟีดแบ็ก "จุดแรก/ต่ำสุด มี tooltip สีดำเด่นดีอยู่แล้ว แต่อาจเพิ่ม border/glow บางๆ ให้สัมพันธ์กับ
    // ล่าสุด" — เดิม stroke สีเทากลาง #2E333A ไม่เกี่ยวกับตัวชี้วัดเลย เปลี่ยนเป็นสี meta.color แบบจางมาก (25%
    // alpha) แทน ให้เห็นว่าเป็นตระกูลเดียวกับจุดล่าสุด บวก glow แผ่วๆ (เบากว่าจุดล่าสุดมาก — 4px/~10% เทียบกับ
    // จุดล่าสุดที่ 6px/~40%) ไม่ให้แย่งความเด่นไปจากจุดล่าสุด
    return (
      <g style={{ filter: `drop-shadow(0 0 ${isLatest ? 6 : 4}px ${meta.color}${isLatest ? '66' : '1a'})` }}>
        <rect
          x={rectX}
          y={y - 28}
          width={width}
          height={18}
          rx={9}
          fill="#14161A"
          stroke={isLatest ? meta.color : `${meta.color}40`}
          strokeWidth={isLatest ? 1.25 : 1}
        />
        <text x={rectX + width / 2} y={y - 15} textAnchor="middle" fontSize={11} fontFamily="ui-monospace, monospace" fontWeight={600} fill={isLatest ? meta.color : '#F3F0E8'}>
          {text}
        </text>
      </g>
    )
  }

  // v38: ฟีดแบ็ก "จุดข้อมูลไม่ต้องใหญ่ แต่ให้มีวงแหวนเรืองแสงบางๆ" — วงกลมทึบเล็กเหมือนเดิม (r 2/3) แต่เพิ่ม
  // วงแหวนโปร่งแสงล้อมรอบ (opacity ต่ำ) จำลอง glow แทนการใช้ SVG filter blur จริง (เบากว่า เรนเดอร์ไวกว่า)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts' custom dot prop type doesn't expose a usable shape to narrow against
  const renderDot = (props: any) => {
    const { cx, cy, index } = props as { cx?: number; cy?: number; index?: number }
    if (cx === undefined || cy === undefined) return null
    const isLatest = index === data.length - 1
    return (
      <g key={`dot-${index}`}>
        <circle cx={cx} cy={cy} r={isLatest ? 7 : 5} fill={meta.color} opacity={0.16} />
        <circle cx={cx} cy={cy} r={isLatest ? 3 : 2} fill={meta.color} />
      </g>
    )
  }

  // ฟีดแบ็ก "Graph ใหญ่ดีแล้ว แต่ควรเพิ่ม Insight...FITLOG ไม่ควรเป็นแค่ 'ดูข้อมูล' แต่ควรเป็น 'เข้าใจข้อมูล'"
  // + "FITLOG ควรเป็น Coach ที่ให้คำแนะนำ มากกว่าเป็นระบบเตือน — ไม่ชอบคำว่า 'ควรทบทวน'" — ใช้ weightDelta/
  // bodyFatDelta (fieldDelta เดียวกับ Health Score) ไม่ใช่เดลต้าในกราฟ กันข้อมูลขัดกันตามที่แจ้ง — สัญญาณหลัก
  // คือทิศทางไขมัน (bodyFatDelta) เพราะเป็นตัวชี้วัดที่ Health Score ใช้ตัดสิน "ดี/ควรปรับ" อยู่แล้ว (เดียวกับ
  // bodyCompositionSummary) ลดลง = แนวโน้มดี (เขียว, 💡) เพิ่มขึ้น = ควรติดตาม (อำพัน ไม่ใช่แดง — ไม่ใช่การเตือน
  // แบบระบบ) พ่วงมวลกล้ามเนื้อเข้าไปด้วยเฉพาะตอนเป็นสัญญาณดีและมีข้อมูลจริงว่าเพิ่มขึ้น ไม่เดาถ้าไม่มีข้อมูล
  // v60: ฟีดแบ็ก "ประโยคนี้ควรเป็น Interpretation (ทำไม) ส่วนตัวเลข +0.6kg/−0.4%/+0.6kg เป็น Evidence
  // (breakdown chip ที่เพิ่มไปรอบก่อนหน้าอยู่แล้วใต้ประโยคนี้) — ไม่ต้องพูดตัวเลขซ้ำในประโยคเดิม" — เดิมประโยค
  // นี้พูดตัวเลขเองด้วย (ซ้ำกับ chip ด้านล่าง) เปลี่ยนให้เหลือแค่ "ทำไม" (เช่น น้ำหนักขึ้นเพราะกล้ามเนื้อ ไม่ใช่
  // ไขมัน) ไม่ fabricate เหตุผลใหม่ — ยังคงใช้เงื่อนไขจริงเดิมทั้งหมด (bodyFatDelta/weightDelta/muscleDelta)
  // v66: ฟีดแบ็ก "'มาจากมวลกล้ามเนื้อเป็นหลัก' ฟันธงเกินข้อมูล — ควรเป็น 'น้ำหนักเพิ่มขึ้น ขณะที่มวลกล้ามเนื้อ
  // เพิ่มและมวลไขมันลดลง' สั้นกว่า ไม่อ้างเหตุ-ผล แค่บรรยายสิ่งที่เกิดขึ้นพร้อมกัน" — เดียวกับที่แก้ weightInsight
  // (การ์ดน้ำหนัก) ไปแล้วก่อนหน้า ตอนนี้ผู้ใช้ยืนยันให้แก้ประโยคนี้ (กราฟ) ด้วยเช่นกัน เงื่อนไข muscleDriven ไม่เปลี่ยน
  const combinedInsight = (() => {
    if (weightDelta === null || bodyFatDelta === null) return null
    if (Math.abs(weightDelta) < 0.1 && Math.abs(bodyFatDelta) < 0.1) return null
    if (bodyFatDelta < 0) {
      const muscleDriven = weightDelta > 0.1 && muscleDelta !== null && muscleDelta > 0
      const text = muscleDriven
        ? 'น้ำหนักเพิ่มขึ้น ขณะที่มวลกล้ามเนื้อเพิ่มและมวลไขมันลดลง'
        : weightDelta < -0.1
          ? 'น้ำหนักและไขมันลดลงไปพร้อมกัน'
          : 'ไขมันลดลงต่อเนื่อง'
      return { icon: '💡', tag: 'แนวโน้มดีขึ้น', tagColor: '#8CB264', text }
    }
    if (bodyFatDelta > 0) {
      const text = weightDelta > 0.1 ? 'น้ำหนักและไขมันเพิ่มขึ้นไปพร้อมกัน' : 'ไขมันเพิ่มขึ้น แม้น้ำหนักจะไม่ค่อยเปลี่ยน'
      return { icon: '⚠️', tag: 'ควรติดตาม', tagColor: '#D8A34A', text }
    }
    return { icon: '💡', tag: null, tagColor: '', text: 'น้ำหนักเปลี่ยนแปลง ไขมันไม่ค่อยเปลี่ยน' }
  })()

  return (
    <PremiumCard className="p-4">
      {/* v40: ฟีดแบ็ก "ช่องว่างด้านบนเยอะไปนิด บนมือถือจะเห็นข้อมูลได้น้อยลง — ลด vertical spacing ~10-15%" —
          mb-3 (12px) ทั้งแถวแท็บ/ตัวเลือกช่วงเวลา และแถวตัวเลขหลัก+summary ลดเหลือ mb-2.5 (10px, ลด ~17%) */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(OVERVIEW_TREND_METRICS) as OverviewTrendMetricKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setMetricKey(k)}
              className={`px-3 py-2 rounded-full text-[12px] font-display tracked uppercase transition ${
                metricKey === k ? 'text-bg' : 'bg-surface border border-line text-muted'
              }`}
              style={metricKey === k ? { background: OVERVIEW_TREND_METRICS[k].color } : undefined}
            >
              {OVERVIEW_TREND_METRICS[k].label}
            </button>
          ))}
        </div>
        <div className="flex rounded-full bg-surface p-1 border border-line shrink-0">
          {OVERVIEW_TREND_RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setRangeDays(r.days)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-display tracked uppercase transition ${
                rangeDays === r.days ? 'bg-steel text-bg' : 'text-muted'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {data.length > 1 ? (
        <>
          {/* v40: ฟีดแบ็ก "ตัวเลข/label เดิม mb-3 อยู่แล้ว ลดเหลือ mb-2.5 ตามด้านบน" */}
          <div className="flex items-start justify-between gap-3 flex-wrap mb-2.5">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono tabular text-2xl text-ink">
                  {latestVal?.toFixed(1)}
                  <span className="text-xs text-muted ml-1">{valueUnit}</span>
                </span>
                {/* v40: ฟีดแบ็ก "จากสัปดาห์ที่แล้ว contrast ต่ำไปนิด บนจอมือถือ/brightness ต่ำอาจอ่านยาก —
                    เพิ่ม brightness/opacity secondary text ~10-20%" — text-muted (#9498A0) → #9DA0A8 สำหรับ
                    เดลต้า, ตัด /70 ออกจาก period label (เดิมจาง #9498A0 ที่ 70% alpha คือส่วนที่จางสุดในบรรทัด)
                    v42: ฟีดแบ็ก "ควรมีสีบอกดีขึ้น/แย่ลงชัดเจนไหม" — ใส่สีเขียว/แดงเฉพาะ Body Fat/Muscle (ดู
                    headlineDeltaGood ด้านบน) ตัวเลขเดลต้าเปลี่ยนสีตามนั้น ส่วน period label ท้ายสุดคงสีกลาง
                    #9DA0A8 เสมอ (เป็นแค่บอกช่วงเวลา ไม่ใช่ตัวเลขที่ต้องตัดสินดี/ไม่ดี) */}
                {headlineDelta !== null && (
                  <span
                    className="text-xs font-mono"
                    style={{ color: headlineDeltaGood === null ? '#9DA0A8' : headlineDeltaGood ? '#8CB264' : '#C1503A' }}
                  >
                    {headlineDelta > 0 ? '↑' : headlineDelta < 0 ? '↓' : '·'} {Math.abs(headlineDelta).toFixed(1)} {valueUnit}
                    {changePeriodLabel && <span style={{ color: '#9DA0A8' }}> · {changePeriodLabel}</span>}
                  </span>
                )}
              </div>
              {/* v36: badge เป้าหมาย — โผล่เฉพาะน้ำหนัก/Body Fat ที่มีเป้าหมาย active อยู่ (ดู goalTarget ด้านบน)
                  v71: ฟีดแบ็ก "เส้น target อยู่ไกลด้านล่าง ทำให้รู้สึกว่ายังไกลมาก — เพิ่ม 'เหลือ X' ให้ progress
                  มีความหมายขึ้น" — ต่อท้าย badge เดิมด้วยระยะห่างจริง (latestVal ที่มีอยู่แล้วในกราฟนี้ ไม่ใช่
                  ตัวเลขใหม่) Body Fat ใช้ "จุดเปอร์เซ็นต์" ให้ตรงกับ convention เดียวกับจุดอื่นของหน้า ไม่ใช่ % */}
              {goalTarget !== null && (
                <p className="inline-flex items-center gap-1 text-[12px] mt-1.5 px-2 py-0.5 rounded-full bg-surface border border-line text-muted">
                  <span aria-hidden="true">🎯</span> เป้าหมาย {goalTarget.toFixed(1)} {valueUnit}
                  {latestVal !== null && (
                    <span>
                      {' '}
                      · เหลือ {Math.abs(latestVal - goalTarget).toFixed(1)} {metricKey === 'bodyFat' ? 'จุดเปอร์เซ็นต์' : valueUnit}
                    </span>
                  )}
                </p>
              )}
            </div>
            {/* v38: ฟีดแบ็ก "Summary เล็กกลืนพื้นหลัง — ทำเป็น titanium glass capsule ตัวเลขเด่นกว่า label
                1.5-2 เท่า" — สลับลำดับเป็นตัวเลขก่อน (text-sm มากกว่า label text-[9px] ~2 เท่า) แล้ว label
                ใต้ พื้นหลังทำ glass effect (gradient ขาวจางๆ ทับพื้นเข้ม + ขอบสว่างบางๆ) แทน bg-surface เรียบ
                v39: ฟีดแบ็ก "ยังดูลอยอยู่เฉยๆ — ลด border รอบนอกให้บางลง (rgba(255,255,255,.06)) แล้วเพิ่ม
                divider บางมากคั่นระหว่าง 3 คอลัมน์แทน ไม่ควรมี border ชัดเกินไป" — border รอบนอก 0.09→0.06,
                เพิ่ม divider เส้นตั้งบางๆ (0.06 เท่ากัน) คั่นระหว่างเฉลี่ย/ต่ำสุด/สูงสุด
                v43: ฟีดแบ็ก "min เขียว/max แดงข้างๆ delta ที่เพิ่งทำให้เขียว=ดี/แดง=แย่ (v42) ดูขัดกัน โดยเฉพาะ
                แท็บน้ำหนักที่ delta เป็นกลาง แต่ 'สูงสุด' ในนี้ยังแดงอยู่ — สื่อว่าน้ำหนักสูงสุด=แย่ ทั้งที่ไม่ใช่"
                — เฉลี่ย/ต่ำสุด/สูงสุด เป็นข้อเท็จจริงเชิงตัวเลขล้วนๆ (ค่าต่ำ-สูงสุดที่ log ไว้ในช่วงที่ดู) ไม่ใช่
                การตัดสินดี/แย่ เปลี่ยนทั้ง 3 ตัวเป็นสีกลาง (text-ink) เหมือนกันหมด เก็บสีเขียว/แดงไว้ให้ delta
                เท่านั้น ไม่ให้ความหมายชนกัน
                v44: ฟีดแบ็ก "ต่ำสุด/สูงสุด ควรมีลูกศร/สีบอกด้วยไหม" — ใส่กลับเฉพาะ Body Fat/Muscle (ดู
                minIsGood/maxIsGood ด้านบน) ที่มีทิศทาง "ดี" ชัดในตัวเอง ไม่ขัดกับ v43 เพราะ Weight ยัง
                minIsGood/maxIsGood เป็น null ทั้งคู่ = ไม่มีลูกศร/สี เหมือนเดิมทุกประการ */}
            {stats && (
              <div
                className="flex items-stretch rounded-2xl px-4 py-2.5"
                style={{
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
                  border: '1px solid rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(6px)',
                }}
              >
                {/* v48: ฟีดแบ็ก "ข้างหน้าเฉลี่ยควรใส่สัญลักษณ์อะไร" — เลือก ~ (ประมาณ/เฉลี่ย ความหมายที่คนคุ้น
                    อยู่แล้ว เช่น "~65 kg") สีกลาง #9DA0A8 เหมือน label ไม่ใช่เขียว/แดงแบบลูกศรต่ำสุด-สูงสุด
                    เพราะค่าเฉลี่ยไม่มีทิศทางดี/แย่ในตัวเอง — ขนาด 13px เท่าลูกศร แต่ไม่ bold (ไม่ได้ตัดสินอะไร) */}
                <div className="text-center px-3">
                  <p className="font-mono text-sm text-ink">
                    <span aria-hidden="true" style={{ color: '#9DA0A8', fontSize: 13 }}>
                      ~{' '}
                    </span>
                    {stats.avg.toFixed(1)}
                  </p>
                  <p className="text-[12px] tracked uppercase mt-0.5" style={{ color: '#9DA0A8' }}>
                    เฉลี่ย
                  </p>
                </div>
                <div className="w-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                {/* v45: ฟีดแบ็ก "ลูกศรสีถูกแล้ว แต่ตัวเลขไม่ต้องตามสีลูกศร" — เดิมสี style อยู่ที่ <p> ครอบทั้ง
                    ลูกศร+ตัวเลข ทำให้ตัวเลขติดสีไปด้วย แยกให้ลูกศรมีสีเขียว/แดงของตัวเอง ส่วนตัวเลขคง text-ink
                    กลางเสมอไม่ว่า minIsGood จะเป็นอะไร
                    v47: ฟีดแบ็ก "ลูกศรดูยากไปนิด ควรเด่นกว่านี้" — เดิมลูกศรใช้ font-weight/ขนาดเดียวกับตัวเลข
                    (font-mono ปกติ ไม่ bold) สีก็เลยเป็นตัวช่วยแยกอย่างเดียว มองเร็วๆ ไม่ทันสังเกต — เพิ่ม
                    font-weight 700 + ขนาดใหญ่ขึ้นเล็กน้อย (13px) เฉพาะตัวลูกศร ให้เด่นขึ้นโดยไม่ต้องเปลี่ยนสี */}
                <div className="text-center px-3">
                  <p className="font-mono text-sm text-ink">
                    {minIsGood !== null && (
                      <span aria-hidden="true" style={{ color: minIsGood ? '#8CB264' : '#C1503A', fontWeight: 700, fontSize: 13 }}>
                        ↓{' '}
                      </span>
                    )}
                    {stats.min.toFixed(1)}
                  </p>
                  <p className="text-[12px] tracked uppercase mt-0.5" style={{ color: '#9DA0A8' }}>
                    ต่ำสุด
                  </p>
                </div>
                <div className="w-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <div className="text-center px-3">
                  <p className="font-mono text-sm text-ink">
                    {maxIsGood !== null && (
                      <span aria-hidden="true" style={{ color: maxIsGood ? '#8CB264' : '#C1503A', fontWeight: 700, fontSize: 13 }}>
                        ↑{' '}
                      </span>
                    )}
                    {stats.max.toFixed(1)}
                  </p>
                  <p className="text-[12px] tracked uppercase mt-0.5" style={{ color: '#9DA0A8' }}>
                    สูงสุด
                  </p>
                </div>
              </div>
            )}
          </div>
          {/* v40: ฟีดแบ็ก "background texture (diagonal lines ของ PremiumCard) แข่งกับกราฟในบริเวณ plot area
              โดยเฉพาะ — ลด opacity ตรงนั้นลง" — ไม่แตะ texture ของ PremiumCard เอง (ใช้ทั่วทั้งแอป เปลี่ยน
              ตรงนั้นจะกระทบทุกการ์ด ไม่ใช่แค่กราฟนี้) แต่ซ้อน overlay สีพื้นเข้มโปร่งแสงเฉพาะบริเวณกราฟแทน ทำให้
              texture ที่ทะลุมาจากพื้น PremiumCard จางลงเฉพาะจุดนี้เท่านั้น */}
          {/* v56: ฟีดแบ็ก "Graph กินพื้นที่เยอะเทียบกับจำนวนจุดข้อมูลจริง — ลดความสูงลง ~15-20% ให้ Key
              Metrics ขึ้นมาเร็วขึ้น" — h-56 (224px) → h-48 (192px), ลดลง ~14% ไม่แตะ margin/yDomain/label
              logic อื่นที่จูนมาละเอียดแล้ว (yTicks ยัง generic ตาม yDomain เดิม ไม่ผูกกับความสูงพิกเซล) */}
          <div className="h-48 rounded-xl" style={{ background: 'rgba(10,11,13,0.28)' }}>
            <ResponsiveContainer width="100%" height="100%">
              {/* v37: ฟีดแบ็ก (จากสกรีนช็อตจริง) "ตัวเลขแกน Y โดนตัดเหลือแค่หลักเดียว (69→9 ทำนองนี้)" —
                  margin.left เดิม -20 ดึงทั้งกราฟ (รวมแกน Y) ล้นไปทางซ้ายเกินขอบการ์ดที่เป็น overflow-hidden
                  (rounded corner) ตัวเลข 2 หลักเลยโดนตัดครึ่งซ้าย — เปลี่ยนเป็น -4 (ยังกระชับกว่า default
                  แต่ไม่ล้นขอบ) และเผื่อ width แกนเพิ่มเล็กน้อย (32→36) กันตัวเลขทศนิยม/2 หลักโดนตัดอีก
                  ส่วน margin.right เพิ่มเป็น 22 ให้บับเบิลป้ายจุดล่าสุดมีที่ว่างพอ (ดูคอมเมนต์ renderPointLabel)
                  v38: เปลี่ยนจาก LineChart เป็น ComposedChart เพื่อวาง Area (gradient fade ใต้เส้น) กับ Line
                  (gradient stroke + glow) ซ้อนกันได้ในกราฟเดียว — ดูคอมเมนต์ defs/Area/Line ด้านล่าง */}
              <ComposedChart data={data} margin={{ top: 28, right: 22, left: -4, bottom: 0 }}>
                <defs>
                  {/* v38: ฟีดแบ็ก "เส้นควรมี depth ไม่ใช่สีแบนๆ" — ไล่เฉดมืด→สี metric เดิม→สว่าง แทนสีเดียวแบน
                      (เห็นชัดสุดตอนเส้นเอียงแนวนอน เพราะ gradient แนวนอนขวางเส้น) ยังใช้สี metric เดิมเป็นฐาน
                      ไม่ผูกสีทองตายตัว เพราะแท็บนี้สลับได้ 3 ตัวชี้วัด (น้ำหนัก/ไขมัน/กล้ามเนื้อ) */}
                  <linearGradient id={`trendLineGrad-${metricKey}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={shadeColor(meta.color, -0.3)} />
                    <stop offset="50%" stopColor={meta.color} />
                    <stop offset="100%" stopColor={shadeColor(meta.color, 0.35)} />
                  </linearGradient>
                  {/* v39: ฟีดแบ็ก "ไม่ต้องทองเต็มพื้นที่หนักๆ ให้เป็นแค่ประมาณ 10-15% ด้านบน → 0% ด้านล่าง จะดู
                      แพงกว่า" — ลดจาก 26% ที่เคยใช้ (v38) ลงเหลือ 13% */}
                  <linearGradient id={`trendAreaGrad-${metricKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={meta.color} stopOpacity={0.13} />
                    <stop offset="100%" stopColor={meta.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                {/* v38: ฟีดแบ็ก "ลด grid ลง 30-40% — major ~10-12%, minor ~3-5%, แนวตั้งบางแทบมองไม่เห็น" —
                    เดิม CartesianGrid เดียว stroke ทึบ #2E333A (ไม่มี opacity control, ไม่มีเส้นแนวตั้งเลย)
                    แยกเป็น 2 ชั้น: แนวนอน (major) opacity 11%, แนวตั้ง (minor) opacity 4%
                    v40: ฟีดแบ็ก "background texture ยังแข่งกับกราฟเล็กน้อยในบริเวณ plot area — ลด opacity อีกนิด"
                    — ลดต่อจาก 11%/4% เหลือ 8%/3% (ดูคอมเมนต์ overlay ที่ div ครอบกราฟด้านล่างด้วย ซึ่งเป็นอีก
                    ส่วนที่ช่วยลด texture ของพื้น PremiumCard ที่ทะลุมาให้เห็นในบริเวณกราฟโดยเฉพาะ) */}
                <CartesianGrid stroke="#B8BBC2" strokeOpacity={0.08} horizontal vertical={false} />
                <CartesianGrid stroke="#B8BBC2" strokeOpacity={0.03} horizontal={false} vertical />
                {/* v40: ฟีดแบ็ก "แกน X contrast ต่ำไปนิด" — #9498A0 (text-muted ปกติ) → #9DA0A8 (~10% สว่างขึ้น) */}
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#9DA0A8', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                {/* v29: ฟีดแบ็ก "เส้นกราฟเด่นกว่าข้อมูล และตัวเลขแกน Y ค่อนข้างเบา" — สว่างแกน Y ขึ้น
                    (#9498A0 → #B8BBC2 เทียบเท่าระดับ Level 2 ที่ใช้ใน Health Score banner) พร้อมลดความหนา
                    เส้น (2px → 1.5px) ให้ตัวเลขไม่โดนเส้นกลบ
                    v38: ฟีดแบ็ก "เป้าหมาย 60.0 kg อยู่บนหัวการ์ด แต่กราฟไม่มีเส้นเป้าหมายให้เห็น เพราะ target
                    ต่ำกว่าช่วงกราฟ — ควรขยาย Y-axis ให้เห็นเส้นเป้าหมายด้วย" — domain เดิม ['auto','auto']
                    เปลี่ยนเป็น yDomain ที่คำนวณเองครอบคลุมทั้งข้อมูลและเป้าหมาย (ดู yDomain ด้านบน) */}
                {/* v39: allowDecimals={false} + ticks ที่คำนวณเองเป็นเลขจำนวนเต็มขั้นละ 1 หน่วยเสมอ (ดู
                    yTicks ด้านบน) กันไม่ให้ recharts auto-generate tick เป็นทศนิยมยาวๆ ไม่ลงตัวอีก
                    v41: ฟีดแบ็ก "ตัวเลขแกน Y ยังจางเล็กน้อย เพิ่ม contrast อีก ~10%" — #B8BBC2 → #C4C7CC */}
                <YAxis
                  tick={{ fill: '#C4C7CC', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  domain={yDomain ?? ['auto', 'auto']}
                  ticks={yTicks}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartPointTooltip unit={valueUnit} />} />
                {/* v36: เส้นเป้าหมายประปราย ตาม mockup — โผล่เฉพาะตอนมี goal target สำหรับตัวชี้วัดที่กำลังดูอยู่
                    v38: บางลง (1.5px) และใช้ muted green (#7A9B57 โทนเดียวกับ moss ที่ใช้ทั่วแอป) แทน #8CB264
                    เดิมที่สดไปหน่อย — ตอนนี้เห็นเส้นจริงในกราฟแล้วเพราะ yDomain ขยายให้ครอบคลุมแล้ว
                    v39: ฟีดแบ็ก "เขียวเป้าหมายอย่าสดเกิน จะหลุดจาก Dark Titanium — ใช้ #7FAF72" — เปลี่ยนตาม
                    เฉดที่ระบุมาเป๊ะ
                    v41: ฟีดแบ็ก "เส้น Target ค่อนข้าง subtle — เพิ่ม opacity เล็กน้อยให้เห็นเป้าหมายเร็วขึ้น"
                    — 0.7 → 0.85 (สีเดิม #7FAF72 ไม่เปลี่ยน แค่ทึบขึ้น) */}
                {goalTarget !== null && (
                  <ReferenceLine
                    y={goalTarget}
                    stroke="#7FAF72"
                    strokeWidth={1.5}
                    strokeOpacity={0.85}
                    strokeDasharray="4 4"
                    label={{ value: `🎯 เป้าหมาย ${goalTarget.toFixed(1)} ${valueUnit}`, position: 'insideBottomRight', fill: '#7FAF72', fontSize: 10 }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="none"
                  fill={`url(#trendAreaGrad-${metricKey})`}
                  isAnimationActive={false}
                  activeDot={false}
                />
                {/* v38: ฟีดแบ็ก "เส้นประมาณ 2-2.5px + glow เบาๆ รอบเส้น" — หนาขึ้น 1.5→2.2px, glow ผ่าน
                    CSS drop-shadow (เบากว่า SVG filter blur จริง, สีเดียวกับเส้นแต่โปร่งแสง ให้รู้สึกเรืองแสง
                    บางๆ ไม่ใช่ neon เต็มๆ แบบเกม)
                    v39: ฟีดแบ็ก "glow blur 8-12px / opacity 15-20%" — ปรับจาก blur 4px/opacity ~33% (v38)
                    ตามตัวเลขที่ระบุมาเป๊ะ (blur 8px, opacity ~18%) */}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={`url(#trendLineGrad-${metricKey})`}
                  strokeWidth={2.2}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts' dot prop type doesn't accept a custom render function's inferred signature cleanly
                  dot={renderDot as any}
                  isAnimationActive={false}
                  style={{ filter: `drop-shadow(0 0 8px ${meta.color}2e)` }}
                >
                  <LabelList dataKey="value" content={renderPointLabel} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* v40: ฟีดแบ็ก "ข้อความ insight ด้านล่าง contrast ต่ำไปนิด" — #A8ACB4 → #B8BBC2 (~10% สว่างขึ้น
              เทียบเท่าระดับ Level 2 ที่ใช้กับแกน Y/ป้าย 'ล่าสุด' ในหัวข้อ Health Score banner) */}
          {/* v57: ฟีดแบ็ก "อยากยกระดับประโยคนี้เป็น Insight หลักของกราฟ พร้อม breakdown เช่น +0.6 kg Weight ·
              −0.4% Body Fat · +0.6 kg Muscle ให้ไม่ต้องอ่านกราฟเองก็เข้าใจ" — ประโยคเดิม (combinedInsight)
              รวมตัวเลขไว้ในประโยคอยู่แล้ว เพิ่มแถว chip ย่อยด้านล่างให้ scan ตัวเลขแยกทีละตัวได้เร็วขึ้น โดยไม่
              คำนวณอะไรใหม่ (ใช้ weightDelta/bodyFatDelta/muscleDelta ตัวเดียวกับที่ประโยคด้านบนใช้อยู่แล้ว) */}
          {combinedInsight && (
            <div className="mt-3 pt-3 border-t border-line">
              <p className="text-xs" style={{ color: '#B8BBC2' }}>
                {combinedInsight.icon}{' '}
                {combinedInsight.tag && (
                  <span className="font-medium" style={{ color: combinedInsight.tagColor }}>
                    {combinedInsight.tag}
                  </span>
                )}
                {combinedInsight.tag ? ' — ' : ''}
                {combinedInsight.text}
              </p>
              <div className="flex flex-wrap gap-x-2.5 gap-y-1 mt-1.5">
                {weightDelta !== null && Math.abs(weightDelta) >= 0.05 && (
                  <span className="text-[10.5px] font-mono whitespace-nowrap" style={{ color: '#9DA0A8' }}>
                    {weightDelta > 0 ? '+' : ''}
                    {weightDelta.toFixed(1)} {unit} <span style={{ color: '#6E7178' }}>น้ำหนัก</span>
                  </span>
                )}
                {bodyFatDelta !== null && Math.abs(bodyFatDelta) >= 0.05 && (
                  <span className="text-[10.5px] font-mono whitespace-nowrap" style={{ color: '#9DA0A8' }}>
                    {bodyFatDelta > 0 ? '+' : ''}
                    {bodyFatDelta.toFixed(1)} จุดเปอร์เซ็นต์ <span style={{ color: '#6E7178' }}>ไขมัน</span>
                  </span>
                )}
                {muscleDelta !== null && Math.abs(muscleDelta) >= 0.05 && (
                  <span className="text-[10.5px] font-mono whitespace-nowrap" style={{ color: '#9DA0A8' }}>
                    {muscleDelta > 0 ? '+' : ''}
                    {muscleDelta.toFixed(1)} {unit} <span style={{ color: '#6E7178' }}>กล้ามเนื้อ</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-[12px] text-muted px-1 py-10 text-center">
          ยังไม่มีข้อมูลพอสำหรับดูแนวโน้มช่วงนี้ — บันทึกข้อมูลอย่างน้อย 2 ครั้งในช่วงเวลาที่เลือก แล้วกราฟจะขึ้นให้อัตโนมัติ
        </p>
      )}
    </PremiumCard>
  )
}

// การ์ดแนวโน้มรายตัวชี้วัดแบบกะทัดรัด — ไอคอน+ชื่อ+ค่าปัจจุบัน (คอลัมน์ซ้าย), กราฟเส้น (คอลัมน์กลาง),
// แถบ Low/Standard/High (คอลัมน์ขวา) เรียงเป็นแถวเดียวกัน บนจอเล็กจะวางซ้อนกันแนวตั้งแทน
function MetricRowCard({ trend, periodLabel }: { trend: TrendDef; periodLabel: string }) {
  const data = trend.data
  const dec = trend.decimals ?? 1
  const latestVal = data.length > 0 ? data[data.length - 1].value : null
  const firstVal = data.length > 1 ? data[0].value : null
  const delta = latestVal !== null && firstVal !== null ? latestVal - firstVal : null
  const zone = trend.range && latestVal !== null ? zoneOf(latestVal, trend.range.low, trend.range.high) : null
  const deltaGood = delta !== null && (trend.direction === 'higherBetter' ? delta >= 0 : delta <= 0)

  return (
    <PremiumCard as="section" className="p-4">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,150px)_1fr_minmax(0,170px)] gap-3 sm:gap-4 sm:items-center">
        {/* คอลัมน์ซ้าย: ไอคอน + ชื่อตัวชี้วัด (อยู่ข้างหน้า) + ค่าปัจจุบัน + การเปลี่ยนแปลง (แสดงติดกับค่า) */}
        <div className="flex items-start gap-2 min-w-0">
          <MetricIconChip iconKey={trend.iconKey ?? 'ruler'} imageKey={imageKeyFor(trend.key)} color={trend.color} size={36} />
          <div className="min-w-0">
            <span className="block font-display text-xs tracked uppercase text-ink truncate">{trend.label}</span>
            <span className="font-mono text-lg tabular text-ink whitespace-nowrap">
              {latestVal !== null ? latestVal.toFixed(dec) : '—'}
              <span className="text-xs text-muted ml-1">{trend.unit}</span>
            </span>
            {delta !== null && (
              <span className={`block text-[12px] font-mono mt-0.5 ${deltaGood ? 'text-moss' : 'text-rusttext'}`}>
                {delta > 0 ? '↑' : delta < 0 ? '↓' : '·'} {Math.abs(delta).toFixed(dec)} {trend.unit}
              </span>
            )}
            {zone && (
              <div className="mt-1">
                <ZoneBadge zone={zone} direction={trend.direction} />
              </div>
            )}
          </div>
        </div>

        {/* คอลัมน์กลาง: กราฟเส้น พร้อมป้ายวันที่แรก/ล่าสุดใต้กราฟ */}
        <div>
          {data.length > 1 ? (
            <>
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#2E333A" vertical={false} />
                    <XAxis dataKey="label" hide />
                    <YAxis tick={{ fill: '#9498A0', fontSize: 9 }} axisLine={false} tickLine={false} width={26} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{ background: '#1C1F24', border: '1px solid #2E333A', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#9498A0' }}
                      itemStyle={{ color: '#F3F0E8' }}
                      formatter={(v: number) => [`${v} ${trend.unit}`, trend.label]}
                    />
                    <Line type="monotone" dataKey="value" stroke={trend.color} strokeWidth={2} dot={{ r: 2, fill: trend.color }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between text-[12px] text-muted mt-0.5">
                <span>{data[0].label}</span>
                <span>{data[data.length - 1].label}</span>
              </div>
            </>
          ) : (
            <p className="text-[12px] text-muted py-6 text-center">ยังไม่มีข้อมูลพอในช่วง{periodLabel} — บันทึกอย่างน้อย 2 ครั้ง</p>
          )}
        </div>

        {/* คอลัมน์ขวา: แถบ Low/Standard/High */}
        {trend.range ? (
          <div>
            <div className="flex text-[12px] mb-1 text-center">
              <span className="flex-1 text-steel">Low</span>
              <span className="flex-1 text-moss">Standard</span>
              <span className="flex-1 text-rusttext">High</span>
            </div>
            <div className="flex h-1.5 rounded-full overflow-hidden">
              <div className="flex-1 bg-steel/70" />
              <div className="flex-1 bg-moss/70" />
              <div className="flex-1 bg-rust/70" />
            </div>
            <div className="flex justify-between text-[12px] text-muted mt-1">
              <span>{trend.range.low.toFixed(dec)}</span>
              <span className="text-ink">
                {((trend.range.low + trend.range.high) / 2).toFixed(dec)}
              </span>
              <span>{trend.range.high.toFixed(dec)}</span>
            </div>
            <p className="text-[12px] text-muted mt-1">
              (Ideal {trend.range.low.toFixed(dec)} - {trend.range.high.toFixed(dec)})
            </p>
            {trend.range.note && <p className="text-[12px] text-muted mt-0.5 italic">{trend.range.note}</p>}
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}
      </div>
    </PremiumCard>
  )
}

// ประมาณค่าล่วงหน้าแบบเส้นตรง (linear regression) จากจุดข้อมูล {t: เวลา (ms), value} — ใช้เทรนด์ปัจจุบันภายนอกช่วงข้อมูลจริง
function linearForecast(rows: { t: number; value: number }[], daysAhead: number): number | null {
  if (rows.length < 3) return null
  const t0 = rows[0].t
  const xs = rows.map((r) => (r.t - t0) / 86400000)
  const ys = rows.map((r) => r.value)
  const n = xs.length
  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0)
  const sumXX = xs.reduce((a, x) => a + x * x, 0)
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return ys[ys.length - 1]
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  const lastX = xs[xs.length - 1]
  return intercept + slope * (lastX + daysAhead)
}

// การ์ดคาดการณ์ 4 สัปดาห์ข้างหน้า — คำนวณจากแนวโน้มเชิงเส้นของข้อมูล 90 วันล่าสุด (ไม่ใช่การพยากรณ์ทางการแพทย์ เป็นเพียงการประมาณจากแนวโน้มที่ผ่านมา)
function ForecastCard({ metrics, toDisplay, unit }: { metrics: BodyMetric[]; toDisplay: (v: number) => number; unit: string }) {
  const forecast = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const offset = cutoff.getTimezoneOffset()
    const cutoffStr = new Date(cutoff.getTime() - offset * 60000).toISOString().slice(0, 10)
    const within = metrics.filter((m) => m.measured_at >= cutoffStr)

    function rowsFor(field: 'weight_kg' | 'body_fat_pct' | 'skeletal_muscle_kg' | 'body_fat_kg', display?: boolean) {
      return [...within]
        .filter((m) => m[field] !== null)
        .reverse()
        .map((m) => ({ t: new Date(m.measured_at + 'T00:00:00').getTime(), value: display ? toDisplay(m[field] as number) : (m[field] as number) }))
    }

    const weightRows = rowsFor('weight_kg', true)
    const fatPctRows = rowsFor('body_fat_pct')
    const muscleRows = rowsFor('skeletal_muscle_kg', true)
    const fatKgRows = rowsFor('body_fat_kg', true)

    const weight = linearForecast(weightRows, 28)
    const fatPct = linearForecast(fatPctRows, 28)
    const muscle = linearForecast(muscleRows, 28)
    const fatKg = linearForecast(fatKgRows, 28)

    const curWeight = weightRows.length > 0 ? weightRows[weightRows.length - 1].value : null
    const curFatPct = fatPctRows.length > 0 ? fatPctRows[fatPctRows.length - 1].value : null
    const curMuscle = muscleRows.length > 0 ? muscleRows[muscleRows.length - 1].value : null
    const curFatKg = fatKgRows.length > 0 ? fatKgRows[fatKgRows.length - 1].value : null

    const items = [
      { label: 'น้ำหนัก', value: weight, delta: weight !== null && curWeight !== null ? weight - curWeight : null, unit },
      { label: 'ไขมันในร่างกาย', value: fatPct, delta: fatPct !== null && curFatPct !== null ? fatPct - curFatPct : null, unit: '%' },
      { label: 'กล้ามเนื้อโครงร่าง', value: muscle, delta: muscle !== null && curMuscle !== null ? muscle - curMuscle : null, unit },
      { label: 'มวลไขมัน', value: fatKg, delta: fatKg !== null && curFatKg !== null ? fatKg - curFatKg : null, unit },
    ].filter((it) => it.value !== null)

    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics, toDisplay, unit])

  return (
    <PremiumCard className="p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-amber">
          <TrendUpIcon />
        </span>
        <h2 className="font-display text-sm tracked uppercase text-ink">คาดการณ์ 4 สัปดาห์ข้างหน้า</h2>
      </div>
      {forecast.length === 0 ? (
        <p className="text-[12px] text-muted mt-2">
          ยังมีข้อมูลไม่พอสำหรับคาดการณ์ — บันทึกข้อมูลอย่างน้อย 3 ครั้งในช่วง 90 วันที่ผ่านมา แล้วระบบจะคาดการณ์แนวโน้มให้อัตโนมัติ
        </p>
      ) : (
        <>
          <p className="text-[12px] text-muted mb-3">หากทำตามแนวโน้มปัจจุบันต่อเนื่อง คาดว่าภายใน 4 สัปดาห์...</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {forecast.map((it) => (
              <div key={it.label}>
                <p className="text-[12px] tracked uppercase text-muted truncate">{it.label}</p>
                <p className="font-mono text-base text-ink">
                  {it.value!.toFixed(1)}
                  <span className="text-[12px] text-muted ml-1">{it.unit}</span>
                </p>
                {it.delta !== null && (
                  <p className={`text-[12px] font-mono ${it.delta < 0 ? 'text-moss' : it.delta > 0 ? 'text-rusttext' : 'text-muted'}`}>
                    {it.delta > 0 ? '↑' : it.delta < 0 ? '↓' : '·'} {Math.abs(it.delta).toFixed(1)} {it.unit}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="text-[12px] text-muted mt-3 italic">
            * ประมาณจากแนวโน้มข้อมูล 90 วันที่ผ่านมา ไม่ใช่คำแนะนำทางการแพทย์
          </p>
        </>
      )}
    </PremiumCard>
  )
}

// วงแหวนสรุป + สัดส่วน ดีมาก/มาตรฐาน/ควรปรับปรุง จากตัวชี้วัดล่าสุดที่มีช่วงอ้างอิงให้เทียบ
// ระดับคะแนนสุขภาพรวม → label + สี ring — แยกเป็นฟังก์ชันกลางให้ HealthScoreCard (แท็บ "แนวโน้ม") และ
// OverviewHealthScoreHeader (แท็บ "ภาพรวม") ใช้สูตรเดียวกันเป๊ะ (ไล่ตามคะแนนจริง: แดง/น้ำเงิน/เขียว) แทนสีคงที่
// ตายตัวสีเดียว — กันไม่ให้สองแท็บพูดภาษาสีคนละชุดกัน และกันชนกับความหมายสีที่จองไว้แล้วที่อื่นในแอป (เช่น
// cyan = Recovery ring บน Dashboard)
// v52: ฟีดแบ็ก "P4 ใช้ระบบสีความหมายให้ครบ (Gold = Brand/Highlight เท่านั้น)" — เดิมระดับ "มาตรฐาน" ใช้สีทอง
// (#E8A33D) เป็นสีบอกระดับ ชนกับบทบาท Brand ของ Gold ที่เพิ่งกำหนดให้การ์ด Insight & Recommendation —
// เปลี่ยนเป็น steel/blue (#6C8CA8, Neutral tier) ตามระบบสีที่เสนอเอง ให้ Gold เหลือความหมายเดียวจริงๆ ในแอปนี้
function healthScoreTier(pct: number): { label: string; color: string } {
  if (pct >= 85) return { label: 'ดีมาก', color: '#7A9B57' }
  if (pct >= 65) return { label: 'ดี', color: '#7A9B57' }
  if (pct >= 40) return { label: 'มาตรฐาน', color: '#6C8CA8' }
  return { label: 'ควรปรับปรุง', color: '#C1503A' }
}

// สรุปคะแนนสุขภาพแบบย่อ บนสุดของแท็บ "ภาพรวม" — v2: ฟีดแบ็ก "เหมือนเอา Text มาเรียง ไม่มี Visual Focus,
// สูงไป (130-140px อยากได้ ~100px), อยากได้สไตล์ Apple Health/Whoop" — ตัดกล่องข้อมูลสามช่องเท่ากันหมด
// (ล่าสุด/การเปลี่ยนแปลง/เป้าหมาย) ที่แย่งความสนใจจากตัวเลขคะแนนออก เหลือแค่วง+ระดับเป็นจุดโฟกัสเดียว
// แถวเดียว แล้วเสริม "percentile เทียบประวัติตัวเอง" (คำนวณอยู่แล้ว ใช้ร่วมกับ HealthScoreCard ในแท็บ
// "แนวโน้ม") + ป้าย signal สั้นๆ (ดีขึ้น/ไขมันลด/กล้ามเพิ่ม ฯลฯ) แทนตัวเลข delta ดิบ — ทุกป้ายคำนวณจากข้อมูล
// จริง ไม่ใช่ข้อความสำเร็จรูปที่ขึ้นเสมอ (ถ้าไขมันเพิ่มขึ้นจริงจะขึ้น "ไขมันเพิ่ม" สีแดง ไม่ใช่ทำเนียนเป็นข่าวดี)
// วันที่วัดล่าสุด/เป้าหมายน้ำหนัก ยังดูได้ตามปกติจากป้ายวันที่ที่ header บนสุดของหน้า และการ์ด "เป้าหมายของคุณ"
// ในแท็บ "แนวโน้ม" อยู่แล้ว ไม่ต้องพูดซ้ำสองที่
function OverviewHealthScoreHeader({
  result,
  monthDeltaPct,
  bodyFatDeltaPct,
  muscleMassDelta,
  goalRows,
  updatedDateLabel,
  updatedTimeLabel,
  unit,
  summary,
  caveat,
  changePeriodLabel,
}: {
  // v32: แทนที่ score/items/trendScorePct เดิม (pass/fail summarizeHealthScore) ด้วยผลลัพธ์จาก
  // computeHealthScore ตรงๆ — result.categories คือหมวดคะแนนพร้อมใช้ (Body Composition/Muscle/Metabolic
  // Health/Progress) ไม่ต้องจัดกลุ่ม items เองในนี้อีกต่อไป
  result: HealthScoreResult | null
  monthDeltaPct?: number | null
  bodyFatDeltaPct: number | null
  muscleMassDelta: number | null
  // ฟีดแบ็ก "เป้าหมายควรเป็นข้อมูลที่ actionable — 65.0 kg / เป้าหมาย · เหลือ 1.3 kg แทนแค่ 65.0 kg เฉยๆ...
  // แสดง 2 เป้าหมาย (น้ำหนัก + Body Fat) พร้อมกัน ไม่ใช่แค่ตัวเดียว" — คำนวณ array ที่จุดเรียกใช้แล้ว (มี
  // weightGoal/bodyFatGoal/latest ครบอยู่แล้วตรงนั้น) แต่ละแถวคือเป้าหมายหนึ่งตัว (น้ำหนักมาก่อนถ้ามีทั้งคู่)
  goalRows: { valueText: string; label: string; subText: string | null; progressPct: number | null }[]
  // ฟีดแบ็ก "ล่าสุด อยากได้วันที่ + เวลา" — แยกสองบรรทัด (วันที่เด่นกว่า, เวลาจางกว่า) แทน updatedLabel เดิม
  // ที่มีแค่วันที่บรรทัดเดียว
  updatedDateLabel: string | null
  updatedTimeLabel: string | null
  unit: string
  // v8: ฟีดแบ็ก "พื้นที่ด้านขวาของ Health Score ยังว่างค่อนข้างเยอะ — อยากได้สรุปประโยคเดียวแทน metric อีกตัว
  // จะทำให้ Health Score กลายเป็น Insight ไม่ใช่แค่คะแนน" — คำนวณที่จุดเรียกใช้ (มีข้อมูล delta/เป้าหมาย
  // ครบอยู่แล้ว) ส่งมาเป็นประโยคสำเร็จรูป ไม่ต้องคำนวณซ้ำในนี้
  summary: string | null
  // v80: ฟีดแบ็ก "93% ดีมาก กับ 🔴 ควรปรับปรุง 2 ใบด้านล่าง — user อาจสงสัยว่าตกลงสุขภาพดีหรือไม่ดี" — บรรทัด
  // เชื่อมสั้นๆ ต่อจาก summary บอกจำนวนจุดที่เป็น tier attention จริง (คำนวณที่จุดเรียกใช้จาก healthInsights ที่
  // มีอยู่แล้ว ไม่ fabricate) null = ไม่มีจุดที่ต้องติดตาม ไม่โชว์บรรทัดนี้เลย
  caveat: string | null
  // v24: ฟีดแบ็ก "การเปลี่ยนแปลง ควรบอกว่าเทียบกับช่วงไหน ไม่งั้นดูลอยๆ" — ระยะห่างจริงระหว่างการวัดล่าสุด
  // 2 ครั้ง (periodLabelOf จาก lib/bodyMetricsSummary — คืนวลีเต็ม "จาก X ก่อน" พร้อมใช้) ไม่ใช่ "1 สัปดาห์"
  // ตายตัว เพราะผู้ใช้บางคนอาจ log ทุกวัน บางคน 2 สัปดาห์ครั้ง — ไม่ระบุ = ไม่โชว์ (ข้อมูลไม่พอเทียบ)
  changePeriodLabel: string | null
}) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  if (!result) return null
  const pct = result.overall
  const { label, color: ringColor } = healthScoreTier(pct)

  // ป้าย signal ต่อการ์ด — v3: ฟีดแบ็ก "อยากได้ Chip แบบ Apple (✔ Fat ↓)" เปลี่ยนจากวลีสำเร็จรูปที่ผูก
  // ทิศทางไว้ในข้อความ (เช่น "ไขมันลด") มาเป็น label สั้น + ลูกศรทิศทางแยกท้ายสุด ให้สแกนอ่านเร็วขึ้น
  // v6: ฟีดแบ็ก "✓ ดูเหมือน checklist ธรรมดาไปนิดสำหรับ UI Titanium — อยากได้ ↓ ไขมัน 2.3% แบบไม่มี ✓"
  // ตัดสัญลักษณ์ ✓/! ออก ให้ลูกศรทิศทางขึ้นนำหน้าแทน ใส่ตัวเลขเดลต้าจริง (valueText) ต่อท้าย label แทนที่จะ
  // มีแค่ label เฉยๆ — อ่านได้ข้อมูลมากขึ้นในพื้นที่เท่าเดิม เหมือน Fitness Analytics มากกว่า checklist
  // v27: ฟีดแบ็ก "↓ 10 คะแนน แต่ไม่บอกว่าเทียบกับช่วงไหน — user อาจสงสัยทำไมลด 10 คะแนนแต่ยังดีมาก...
  // แนะนำ ↓ 10 คะแนน จากสัปดาห์ที่แล้ว" — periodOverride เฉพาะแถวนี้ (ไม่ใช้ changePeriodLabel ของ header
  // ร่วมกับแถวไขมัน/กล้ามเนื้อ) เพราะ monthDeltaPct คำนวณเทียบ "เดือนที่แล้ว" เสมอ (ดู healthScoreMonthDeltaPct
  // ที่จุดเรียกใช้ — คนละฐานเวลากับ changePeriodLabel ที่มาจาก fieldDelta ของแถวไขมัน/กล้ามเนื้อ ซึ่งคือ
  // "ล่าสุด vs ก่อนหน้าล่าสุด" อาจเป็นวัน/สัปดาห์ก็ได้) — ใช้คำที่ตรงกับสิ่งที่คำนวณจริง ("จากเดือนที่แล้ว")
  // แทนการก็อปคำตัวอย่าง "จากสัปดาห์ที่แล้ว" มาเฉยๆ ซึ่งจะไม่ตรงกับข้อมูลจริง
  // v30: ฟีดแบ็ก "↓ 10 คะแนน คะแนนสุขภาพ · จากเดือนที่แล้ว อยู่ข้าง 90% ดีมาก รู้สึก conflict — ทำไมดีมาก
  // ถ้าคะแนนลดลง 10? แนะนำ ↓ 10 คะแนน จากเดือนที่แล้ว แล้วเพิ่ม context เช่น ยังอยู่ในระดับดีมาก" — ตัด
  // label 'คะแนนสุขภาพ' ออก (ซ้ำซ้อนอยู่แล้วเพราะติดกับตัวเลขคะแนนใหญ่ด้านซ้าย) ย้าย 'จากเดือนที่แล้ว' ไปเป็น
  // label หลักแทน แล้วต่อท้ายด้วย "ยังอยู่ในระดับ{tier}" เฉพาะตอนคะแนนลดแต่ tier ปัจจุบันยังดี (ดี/ดีมาก
  // เท่านั้น — pct>=65 ตรงกับเกณฑ์ใน healthScoreTier ด้านล่าง) ไม่ใส่ข้อความปลอบใจถ้า tier จริงๆ ไม่ดีแล้ว
  const signals: { label: string; dir: 'up' | 'down'; good: boolean; valueText: string; periodOverride?: string }[] = []
  if (monthDeltaPct !== null && monthDeltaPct !== undefined && monthDeltaPct !== 0) {
    signals.push({
      label: 'จากเดือนที่แล้ว',
      dir: monthDeltaPct > 0 ? 'up' : 'down',
      good: monthDeltaPct > 0,
      valueText: `${Math.abs(monthDeltaPct)} คะแนน`,
      periodOverride: monthDeltaPct < 0 && pct >= 65 ? `ยังอยู่ในระดับ${label}` : undefined,
    })
  }
  // v34: ฟีดแบ็ก "การเปลี่ยนแปลง · จากสัปดาห์ที่แล้ว (heading) แต่ ↑ 3 คะแนน จากเดือนที่แล้ว (แถวคะแนน) —
  // อย่าให้ heading กับตัวเลขอ้างอิงคนละช่วงเวลา" — แถวคะแนนใช้ฐานเวลาคงที่ "เดือนที่แล้ว" เสมอ (เทียบ
  // healthScoreResultPrevMonth) ต่างจาก changePeriodLabel ที่มาจาก "ล่าสุด vs ก่อนหน้าล่าสุด" (อาจวัน/
  // สัปดาห์/เดือนก็ได้) ซึ่งเป็นฐานเวลาจริงของสองแถวนี้ (ไขมัน/กล้ามเนื้อ มาจาก fieldDelta ตัวเดียวกัน) — ตัด
  // changePeriodLabel ออกจาก heading รวม (ไม่ผูกทุกแถวเป็นช่วงเดียวกันอีกต่อไป) แล้วใส่ periodOverride ให้
  // สองแถวนี้แสดงช่วงเวลาจริงของตัวเองแทน ไม่ยืมของ heading เดา
  if (bodyFatDeltaPct !== null && bodyFatDeltaPct !== 0) {
    signals.push({
      label: 'ไขมัน',
      dir: bodyFatDeltaPct < 0 ? 'down' : 'up',
      good: bodyFatDeltaPct < 0,
      valueText: `${Math.abs(bodyFatDeltaPct).toFixed(1)} จุดเปอร์เซ็นต์`,
      periodOverride: changePeriodLabel ?? undefined,
    })
  }
  if (muscleMassDelta !== null && muscleMassDelta !== 0) {
    signals.push({
      label: 'กล้ามเนื้อ',
      dir: muscleMassDelta > 0 ? 'up' : 'down',
      good: muscleMassDelta > 0,
      valueText: `${Math.abs(muscleMassDelta).toFixed(1)} ${unit}`,
      periodOverride: changePeriodLabel ?? undefined,
    })
  }

  const categoryRows = result.categories

  return (
    <div
      className="relative overflow-hidden rounded-card px-5 py-3"
      // ฟีดแบ็ก "Background ไม่ต้องดำสนิท -> ใช้ charcoal gradient...Orange glow เฉพาะรอบวง Score และขอบ
      // ด้านบนเล็กน้อย" — รอบก่อนพื้นเป็นดำเกือบสนิท (#0A0B0D) + amber wash กระจายทั่วทั้งการ์ด (radial ที่
      // 6% 30% รัศมี 55% ครอบคลุมเกือบทั้งใบ) — รอบนี้เปลี่ยนเป็น charcoal ล้วน (เทาเข้มอมฟ้า ไม่ใช่ดำ) และ
      // ตัด glow กระจายทั่วออก เหลือแค่ highlight บางๆ ที่ขอบบนเท่านั้น (inset) ส่วน glow รอบวง Score ย้ายไป
      // ทำเป็น drop-shadow เฉพาะจุดที่ตัว GoalRing แทน (ดูด้านล่าง) — สีส้มจึงเป็น "accent เฉพาะจุด" ไม่ใช่
      // สีที่แผ่ครอบคลุมพื้นหลังทั้งการ์ดอีกต่อไป
      style={{
        background: 'linear-gradient(160deg, #1B1D21 0%, #131417 55%, #0F1013 100%)',
        boxShadow:
          '0 2px 4px rgba(0,0,0,.4), 0 16px 36px -10px rgba(0,0,0,.55), 0 0 0 1px rgba(232,163,61,.18), inset 0 1px rgba(232,163,61,.10)',
      }}
    >
      {/* ฟีดแบ็ก "วงยังใหญ่กว่าที่จำเป็นนิดหนึ่ง (ตอนนี้ ~200px) ลดลงประมาณ 10-15% แล้วใช้ soft orange glow
          แทนการเพิ่มขนาด" — ลดจาก 150 เหลือ 130px (strokeWidth ตามสัดส่วนเดิม) drop-shadow รอบวงยังอยู่ตามเดิม
          ชดเชยความโดดเด่นที่ลดขนาดไป ให้ HEALTH SCORE มีพื้นที่หายใจมากขึ้นตามที่ขอ
          ฟีดแบ็ก "ช่องว่างด้านขวายังเยอะเกินไป — ไม่อยากเพิ่มข้อมูลมั่วๆ แต่ให้ขยาย 4 sections ให้สมดุลกับ
          Card โดยแต่ละ column มี width ใกล้เคียงกันมากขึ้น" — เดิมเส้นแบ่งเป็น flex item แยก (w-px) ทำให้
          justify-between กระจายช่องว่างรอบเส้นแบ่งแปลกๆ ได้ — ย้ายเส้นแบ่งไปเป็น border-l ติดกับบล็อกถัดไปแทน
          (ไม่ใช่ elemente ลอย) แล้วใส่ justify-between ที่ container ให้ 4 บล็อกกระจายเต็มความกว้างการ์ดเอง
          โดยไม่ต้องเพิ่มข้อมูลใหม่ */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* ฟีดแบ็ก "ขยับกลุ่ม Health Score เข้าหาวงอีกนิด — ตอนนี้วง -> ช่องว่างเยอะ -> HEALTH SCORE ทำให้
            90% กับดีมาก ดูแยกกัน อยากให้วงกับข้อความรู้สึกเป็นโมดูลเดียวกัน" — ลด gap จาก gap-4 (16px) เหลือ
            gap-2 (8px) แค่ระยะห่างเท่านั้น ไม่แตะขนาด/สีอะไรอื่น */}
        {/* ฟีดแบ็ก "แก้เรื่องตัวหนังสือโดยใช้ Hierarchy ไม่ใช่เพิ่มทุกอย่างให้ใหญ่ — Level 2 (HEALTH SCORE/
            ล่าสุด/การเปลี่ยนแปลง/เป้าหมายร่างกาย) ควรเป็นเทาอ่อน, Level 3 (09:20 น./น้ำหนักเป้าหมาย/Body Fat
            เป้าหมาย) เป็นเทากลาง — ตอนนี้บางส่วน Level 3-4 จางเกินไป" — เดิมทั้ง header คอลัมน์และ detail
            text ใช้ text-muted (#9498A0) เหมือนกันหมด ไม่มีการแยกระดับ — กำหนด 2 โทนใหม่เฉพาะใน panel นี้:
            LEVEL2_COLOR (#B8BBC2, header คอลัมน์) สว่างกว่า LEVEL3_COLOR (#9DA0A8, รายละเอียดย่อย) ซึ่งเองก็
            สว่างกว่า text-muted เดิมเล็กน้อยตามที่ขอ */}
        <div className="flex items-center gap-2 shrink-0">
          <div style={{ filter: 'drop-shadow(0 0 12px rgba(232,163,61,.35))' }}>
            <GoalRing pct={pct} size={130} strokeWidth={11} color="#E8A33D" ariaLabel="คะแนนสุขภาพรวม" />
          </div>
          <div className="min-w-0">
            {/* v23: ฟีดแบ็ก "HEALTH SCORE กับ ดีมาก อยู่ใกล้กันเกินไปในสายตา อยากให้ Score ดูเหมือนผลลัพธ์
                สำคัญ ไม่ใช่แค่ข้อมูลอีกช่องหนึ่ง — HEALTH SCORE 14-15px, ดีมาก 28-32px/semibold, คำอธิบาย
                14px" — เดิม 3 บรรทัดนี้คือ text-[10px]/fontSize 25/text-xs (12px) ใกล้เคียงกันเกินไปให้รู้สึก
                เป็นกลุ่มเดียวแบนๆ — ขยับทั้ง 3 ระดับขึ้นตามตัวเลขที่ขอเป๊ะ พร้อมเพิ่ม margin-top เล็กน้อยตาม
                สัดส่วน ให้แต่ละระดับแยกจากกันชัดขึ้นไม่ใช่แค่ตัวใหญ่ขึ้นเฉยๆ */}
            <button
              type="button"
              onClick={() => setShowBreakdown((v) => !v)}
              className="flex items-center gap-1 text-sm tracked uppercase transition hover:text-ink"
              style={{ color: '#B8BBC2' }}
            >
              Health Score
              <InfoIcon />
            </button>
            <span className="font-display font-semibold block mt-1.5 tracked uppercase" style={{ color: ringColor, fontSize: 30 }}>
              {label}
            </span>
            {summary && <p className="text-sm text-ink/65 mt-1.5 max-w-[190px]">{summary}</p>}
            {caveat && <p className="text-xs text-muted mt-1 max-w-[190px]">{caveat}</p>}
            {/* v28: ฟีดแบ็ก "90% มาจากอะไร? ไม่จำเป็นต้องเพิ่มข้อมูลเยอะ แค่ทำให้รู้ว่าคะแนนนี้มีเหตุผล —
                อาจมีปุ่ม 'ดูรายละเอียดคะแนน ›'" — breakdown (หมวด+% ต่อหมวด) มีอยู่แล้วหลัง ⓘ (ไม่ทำถาวรเพิ่ม
                เพราะจะย้อนกลับไปหนาแน่นแบบที่เพิ่งลดไป) แค่เพิ่ม affordance ให้เห็นชัดว่ากดดูรายละเอียดได้
                ไม่ใช่แค่ไอคอน ⓘ เล็กๆ เดา — ซ่อนทันทีที่กางออกแล้ว (ไม่ต้องซ้ำกับ breakdown ที่โชว์อยู่) */}
            {!showBreakdown && categoryRows.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBreakdown(true)}
                className="text-xs mt-1.5 transition hover:text-ink"
                style={{ color: '#9DA0A8' }}
              >
                ดูรายละเอียดคะแนน ›
              </button>
            )}
          </div>
        </div>

        {/* v26: ฟีดแบ็ก "Health Score ยังใหญ่และหนักไปนิด...จะลดความสำคัญของส่วน 'ล่าสุด' ลงหน่อย เพราะ
            ข้อมูลนี้ไม่ได้สำคัญเท่า Score/Progress" — เดิมวันที่ใช้ text-sm/text-ink (สว่างเท่าตัวเลขสำคัญ
            อื่นในการ์ด) แยกวันที่/เวลาคนละบรรทัด — ลดลงเหลือ text-xs/#9DA0A8 (โทนเดียวกับ Tertiary อื่นในการ์ด)
            รวมวันที่+เวลาเป็นบรรทัดเดียวด้วย "·" ให้กินพื้นที่แนวตั้งน้อยลงด้วย ไม่ได้ซ่อนข้อมูล แค่ลดน้ำหนักภาพ */}
        {updatedDateLabel && (
          <div className="shrink-0 border-l border-line/40 pl-5">
            <p className="text-[12px] tracked uppercase" style={{ color: '#B8BBC2' }}>ล่าสุด</p>
            <p className="font-mono text-xs mt-0.5" style={{ color: '#9DA0A8' }}>
              {updatedDateLabel}
              {updatedTimeLabel && <span> · {updatedTimeLabel}</span>}
            </p>
          </div>
        )}

        {/* v23: แถวสัญญาณ (Secondary) เดิม gap-0.5 ชิดกันเกินไปเมื่อมี 2-3 แถว — เพิ่มเป็น gap-1.5 พร้อมขยับ
            label ท้ายแถว (Tertiary) จาก text-[11px] เป็น text-xs ให้จับคู่กับระดับ Tertiary อื่นๆ ในการ์ดนี้ */}
        {signals.length > 0 && (
          <div className="shrink-0 border-l border-line/40 pl-5">
            {/* v34: ตัด changePeriodLabel ออกจาก heading รวม — แต่ละแถวด้านล่างมีช่วงเวลาของตัวเองแล้ว
                (periodOverride) เพราะฐานเวลาจริงไม่เท่ากันเสมอไป (แถวคะแนน = เดือนที่แล้วคงที่, แถวไขมัน/
                กล้ามเนื้อ = ล่าสุด vs ก่อนหน้าล่าสุด) ผูก heading เป็นช่วงเดียวจะโกหกบางแถวอยู่ดี ดูคอมเมนต์
                จุดสร้าง signals ด้านบน */}
            <p className="text-[12px] tracked uppercase mb-1" style={{ color: '#B8BBC2' }}>
              การเปลี่ยนแปลง
            </p>
            <div className="flex flex-col gap-1.5">
              {signals.map((s) => (
                <p key={s.label} className="whitespace-nowrap">
                  <span className="font-mono font-semibold text-sm" style={{ color: s.good ? '#8CB264' : '#C1503A' }}>
                    {s.dir === 'up' ? '↑' : '↓'} {s.valueText}
                  </span>{' '}
                  <span className="text-xs" style={{ color: '#9DA0A8' }}>
                    {s.label}
                    {s.periodOverride && <span className="text-muted/70"> · {s.periodOverride}</span>}
                  </span>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* ฟีดแบ็ก "เป้าหมาย -> เป้าหมายร่างกาย เพราะนี่ไม่ใช่ Goal ธรรมดา แต่เป็นเป้าหมาย Body Composition" —
            เปลี่ยนหัวข้อคอลัมน์ให้สื่อความหมายตรงขึ้น
            ฟีดแบ็ก "เหลือ 6.3 kg กับ ลดอีก 1.9% ยังไม่เท่ากันทางสายตา — ทำตัวเลขเป้าหมายให้เด่นที่สุด แล้วข้อความ
            รองเล็กลง: 60.0 kg (บรรทัดเดี่ยว) ตามด้วย น้ำหนักเป้าหมาย · เหลือ 6.3 kg" — เดิมค่า+label อยู่
            บรรทัดเดียวกัน แล้ว subText แยกบรรทัดล่างเดี่ยวๆ — ย้ายค่ามาเป็นบรรทัดเด่นบรรทัดแรก แล้วรวม
            label+subText เป็นบรรทัดรองบรรทัดเดียวด้วย " · " แทน ให้เห็นชัดว่าอะไรคือตัวเลขหลัก
            ฟีดแบ็ก "พื้นที่ว่างด้านขวาเยอะ — ไม่อยากเพิ่มข้อมูลมั่วๆ ให้ขยาย Target block กว้างขึ้นเล็กน้อย
            แทน" — บรรทัดรอง label · subText ยาวขึ้นกว่าเดิมตามธรรมชาติ ทำให้บล็อกกว้างขึ้นเองโดยไม่ต้องเติม
            ข้อมูลใหม่ */}
        {/* v23: ฟีดแบ็ก "เปลี่ยนความรู้สึกจากรายงานข้อมูล -> ความก้าวหน้า เช่น 60.0 kg / เหลือ 6.3 kg แทน
            60.0 kg / น้ำหนักเป้าหมาย · เหลือ 6.3 kg — อ่านง่ายกว่า สมองประมวลผลเร็วกว่า" — เดิมทุกแถวมี label
            (น้ำหนักเป้าหมาย/Body Fat เป้าหมาย) นำหน้า subText ด้วย " · " ซ้ำซ้อนกับหัวข้อคอลัมน์
            "เป้าหมายร่างกาย" ที่ครอบทั้งบล็อกอยู่แล้ว — ตัด label ออกจากสิ่งที่แสดงผล (ยังเก็บไว้ใน data
            เป็น key เท่านั้น) เหลือแค่ valueText เด่น + subText (สีเขียว, ระยะที่เหลือ) บรรทัดเดียว */}
        <div className="shrink-0 border-l border-line/40 pl-5">
          <p className="text-[12px] tracked uppercase mb-1" style={{ color: '#B8BBC2' }}>เป้าหมายร่างกาย</p>
          {goalRows.length > 0 ? (
            <div className="flex flex-col gap-2">
              {goalRows.map((g) => (
                <div key={g.label}>
                  <p className="font-mono text-xs whitespace-nowrap" style={{ color: '#9DA0A8' }}>{g.valueText}</p>
                  {/* v28: ฟีดแบ็ก "สีเขียวถูกใช้เยอะเกินไป — Orange ควรใช้กับ Primary metric/progress/active
                      แทน" — "เหลือ X kg" เป็นข้อความความคืบหน้า (ยังไปไม่ถึงเป้า) ไม่ใช่ผลสำเร็จ เดิมใช้เขียว
                      (#8CB264) ตายตัวเหมือนเป็นเรื่องดีเสร็จสมบูรณ์แล้ว — เปลี่ยนเป็นอำพัน (#D8A34A) ให้เข้าคู่
                      กับแถบ progress bar (bg-amber) ด้านล่างที่เป็นสีเดียวกันอยู่แล้ว
                      v72: ฟีดแบ็ก "เหลือ 7.1 kg ควรเด่นกว่า 67.1 → 60.0 kg เพราะเป็นตัวเลขที่ actionable จริง
                      (บอกว่าต้องไปอีกเท่าไหร่) ส่วน A → B เป็นแค่ context" — สลับน้ำหนักภาพ: valueText (A → B)
                      ลดจาก text-sm/semibold/ink เป็น text-xs/สีจาง, subText (เหลือ X) ขยับขึ้นมาเป็น
                      text-sm/font-semibold แทน ไม่เปลี่ยนลำดับการวาง (A → B ยังอยู่บนเหมือนเดิม) */}
                  {g.subText && (
                    <p className="font-mono font-semibold text-sm whitespace-nowrap mt-0.5" style={{ color: '#D8A34A' }}>
                      {g.subText}
                    </p>
                  )}
                  {/* v25: ฟีดแบ็ก "อยากให้ progress เป็น visual มากขึ้น เช่นแถบยาว + '41% toward goal' ชัดๆ
                      ไม่ใช่แค่เส้นบางๆ" — ขยายแถบจาก 3px เป็น 6px (ยังเป็นสไตล์ progress bar เดิม ไม่ใช่
                      ปุ่ม CTA) พร้อมข้อความเปอร์เซ็นต์กำกับใต้แถบ (คำเดียวกับที่ใช้ทั่วแอป "ความคืบหน้า") */}
                  {/* v60: ฟีดแบ็ก "0% ทำให้งงว่าทำไมยัง 0% ทั้งที่ค่าจริงเข้าใกล้เป้าหมายแล้ว — ถ้าหมายถึงยัง
                      ไม่มี baseline ควรเขียนให้ชัด" — progressPct === null ตอนนี้แปลว่า "ไม่มีข้อมูลเก่าพอ
                      คำนวณ" จริงๆ (ดูคอมเมนต์ goalProgressPct) ไม่ใช่แค่ 0% ที่ปัดตก — บอกตรงๆ แทนการซ่อนเงียบ
                      v61: ฟีดแบ็ก "'ยังไม่มีข้อมูลเริ่มต้นสำหรับคำนวณความคืบหน้า' ยังยาว/เทคนิคไปนิด" — สั้นลง
                      ตามคำที่เสนอตรงๆ */}
                  {g.progressPct === null ? (
                    <p className="text-[12px] text-muted mt-1.5">ยังไม่มีข้อมูลความคืบหน้า</p>
                  ) : (
                    <div className="mt-1.5">
                      <div className="h-1.5 w-28 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-amber" style={{ width: `${g.progressPct}%` }} />
                      </div>
                      {/* v34: ฟีดแบ็ก "PROGRESS 71% (breakdown) กับ คืบหน้า 0% (เป้าหมาย) ตรงนี้ดูขัดกัน —
                          ต้องแยกให้ชัดว่าคนละเรื่อง" — เดิม "คืบหน้า" เฉยๆ ชวนสับสนกับหมวด PROGRESS ใน
                          breakdown ด้านบน ทั้งที่นี่คือ % ระยะทางถึงเป้าหมาย ไม่ใช่คะแนนแนวโน้ม — เติม "สู่
                          เป้าหมาย" ให้ชัดว่าคนละตัวเลขคนละความหมาย */}
                      <p className="text-[12px] text-muted mt-1">คืบหน้าสู่เป้าหมาย {Math.round(g.progressPct)}%</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              <p className="font-mono text-sm" style={{ color: '#9DA0A8' }}>ยังไม่ได้ตั้ง</p>
              <a href="/calendar" className="text-[12px] text-amber transition hover:text-ink">
                + ตั้งเป้าหมาย
              </a>
            </>
          )}
        </div>
      </div>

      {showBreakdown && categoryRows.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line">
          {/* ฟีดแบ็ก "HEALTH SCORE ยังไม่บอกว่า 90% มาจากอะไร — เพิ่ม ⓘ แล้วกดดูรายละเอียดได้ พร้อมคำอธิบาย
              สั้นๆ ว่าคะแนนประเมินจากอะไรบ้าง" — ใส่ไว้บรรทัดแรกสุดของ breakdown ก่อนแจกแจงเป็นหมวด
              v34: ฟีดแบ็ก "breakdown มี 4 หมวดจริง (Body Composition/Muscle/Metabolic Health/Progress) ควรพูด
              ให้ตรงกับ 4 หมวดนั้น" — เดิมพูดถึง "แนวโน้มไขมัน มวลกล้ามเนื้อ BMI" (คำละคำจากตัว metric ไม่ใช่
              ชื่อหมวด) เปลี่ยนให้ใช้ชื่อ 4 หมวดจริงตามลำดับที่แสดงผลด้านล่าง */}
          <p className="text-[12px] text-muted mb-2.5">คะแนนนี้ประเมินจากองค์ประกอบร่างกาย มวลกล้ามเนื้อ สุขภาพเมตาบอลิก และความคืบหน้าโดยรวม</p>
          {/* v31: ฟีดแบ็ก "ควรเป็น Health Score → เปิดดู breakdown ของสูตรที่มีอยู่แล้ว ไม่ใช่สร้าง sub-score
              ใหม่ — UI ควรสะท้อนสูตรจริง 1:1" — categoryRows เป็นข้อมูลจริงที่มีอยู่แล้ว (ไม่เปลี่ยน scoring
              model เลย)
              v34: ฟีดแบ็ก "96/100/100/71 เฉลี่ยเท่ากันได้ 91.75 ไม่ใช่ 94 — ถ้าน้ำหนักไม่เท่ากัน UI ต้องโชว์
              น้ำหนักจริง อย่าให้ดูสัมพันธ์กันด้วยสายตาอย่างเดียว" — เพิ่ม row.weight (คำนวณจริงใน
              lib/healthScore.ts, normalize จากน้ำหนักที่ยังมีข้อมูลเท่านั้น) ต่อท้ายชื่อหมวด และเพิ่มคำอธิบาย
              สั้นๆ ใต้ PROGRESS โดยเฉพาะ (จุดที่ผู้ใช้สับสนกับ Goal Progress ด้านล่างสุด — ไม่ใช่ % ถึงเป้าหมาย
              แต่เป็นคะแนนแนวโน้ม) กันตีความผิดว่า "ทำเป้าหมายสำเร็จแล้ว 71%"
              v60: ฟีดแบ็ก "จุด 5 จุดสื่อได้แค่ ~20%/จุด ไม่พอสำหรับค่าละเอียดแบบ 94%/98%/100%/71% — เปลี่ยนเป็น
              progress bar ต่อเนื่อง" + "จากแนวตั้ง → แนวนอน 4 columns" — เลิกปัดเป็น 5 ระดับ (Math.round(pct/20))
              ใช้ row.pct ตรงๆ เป็นความกว้างแถบ (แม่นยำ 100%) และเปลี่ยน layout จาก space-y (สแตกแนวตั้ง) เป็น
              grid 2 คอลัมน์บนมือถือ/4 คอลัมน์ตั้งแต่ sm ขึ้นไป (พอดีกับ 4 หมวดพอดี ไม่ล้นความกว้าง panel เดิม) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2.5">
            {categoryRows.map((row) => {
              const color = healthScoreTier(row.pct).color
              return (
                <div key={row.title} className="text-[12px] min-w-0">
                  <p className="tracked uppercase text-muted truncate">{row.title}</p>
                  <p className="normal-case tracking-normal text-muted/60">น้ำหนัก {row.weight}%</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${row.pct}%`, backgroundColor: color }} />
                    </div>
                    <span className="font-mono font-medium shrink-0" style={{ color }}>
                      {row.pct}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          {/* v61: ฟีดแบ็ก "'คะแนนแนวโน้มล่าสุด' อยู่ใต้ PROGRESS อาจทำให้เข้าใจว่า Health Score ทั้งก้อนเป็นแค่
              Trend Score — ควรเป็นข้อความปิดท้ายทั้ง breakdown แทน บอกว่า Health Score คือคะแนนสุขภาพโดยรวม
              ไม่ใช่ % ความสำเร็จเป้าหมาย" — ย้ายจาก caption เฉพาะแถว PROGRESS มาเป็นบรรทัดปิดท้ายทั้ง 4 หมวด */}
          <p className="text-[12px] text-muted mt-3">Health Score เป็นคะแนนสุขภาพโดยรวม ไม่ใช่ % ความสำเร็จของเป้าหมาย</p>
        </div>
      )}
    </div>
  )
}

function HealthScoreCard({
  result,
  monthDeltaPct,
  selfPercentile,
}: {
  result: HealthScoreResult | null
  monthDeltaPct?: number | null
  selfPercentile?: number | null
}) {
  const pct = result?.overall ?? 0
  const { label, color: ringColor } = healthScoreTier(pct)
  return (
    <PremiumCard className="p-4">
      <h2 className="font-display text-sm tracked uppercase text-muted mb-3">คะแนนสุขภาพรวม</h2>
      {!result ? (
        <p className="text-[12px] text-muted">กรอกช่วงมาตรฐานในฟอร์มบันทึกข้อมูล เพื่อดูคะแนนสุขภาพตรงนี้</p>
      ) : (
        <div className="flex items-center gap-4">
          <GoalRing pct={pct} size={88} strokeWidth={8} color={ringColor} ariaLabel="คะแนนสุขภาพรวม" />
          <div className="text-xs min-w-0 flex-1">
            <p className="font-display text-sm tracked uppercase" style={{ color: ringColor }}>
              {label}
            </p>
            {monthDeltaPct !== null && monthDeltaPct !== undefined && monthDeltaPct !== 0 && (
              <p className={`text-[12px] mt-1 ${monthDeltaPct > 0 ? 'text-moss' : 'text-rusttext'}`}>
                {monthDeltaPct > 0 ? 'ดีขึ้นจากเดือนที่แล้ว' : 'แย่ลงจากเดือนที่แล้ว'}{' '}
                <span className="font-mono">
                  {monthDeltaPct > 0 ? '↑' : '↓'} {Math.abs(monthDeltaPct)} คะแนน
                </span>
              </p>
            )}
            <div className="mt-2.5">
              <div className="relative h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg, #C1503A, #E8A33D, #7A9B57)' }}>
                <div
                  className="absolute top-1/2 w-3 h-3 rounded-full bg-ink border-2"
                  style={{ left: `${Math.max(2, Math.min(98, pct))}%`, transform: 'translate(-50%, -50%)', borderColor: ringColor }}
                />
              </div>
              <div className="flex justify-between text-[12px] text-muted mt-1">
                <span>แย่</span>
                <span>ดีเยี่ยม</span>
              </div>
            </div>
            {selfPercentile !== null && selfPercentile !== undefined && (
              <p className="flex items-start gap-1.5 text-[12px] text-muted mt-2">
                <span>🏆</span>
                <span>
                  คุณอยู่ใน <span className="text-ink">{selfPercentile}%</span> แรก เมื่อเทียบกับข้อมูลย้อนหลังของคุณเอง
                </span>
              </p>
            )}
          </div>
        </div>
      )}
    </PremiumCard>
  )
}

// การ์ดเป้าหมาย (จากตาราง goals) — รองรับเฉพาะ goal_type น้ำหนัก/Body Fat เพราะเป็นค่าที่หน้านี้มีให้เทียบ
function GoalsCard({
  goals,
  unit,
  goalCurrentValue,
  goalProgressPct,
  goalStartValue,
}: {
  goals: Goal[]
  unit: string
  goalCurrentValue: (g: Goal) => number | null
  goalProgressPct: (g: Goal) => number | null
  // ค่าเริ่มต้นที่ goalProgressPct ใช้จริง (earliestTrackedValue ?? starting_value — ดูคอมเมนต์ v62
  // ที่จุดคำนวณ) เอาไว้ทำเป็นปลายซ้ายของเส้น slider ให้ตรงกับตัวเลขที่ % ก้าวหน้าคำนวณจากจริง แทนที่จะ
  // เดา/ใช้ starting_value เฉยๆ ซึ่งอาจไม่ตรงกับสิ่งที่ % จริงอ้างอิงอยู่
  goalStartValue: (g: Goal) => number | null
}) {
  return (
    <PremiumCard className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-sm tracked uppercase text-muted">เป้าหมายของคุณ</h2>
        <a href="/calendar" className="text-[12px] text-amber underline">
          แก้ไขเป้าหมาย
        </a>
      </div>
      {goals.length === 0 ? (
        <p className="text-[12px] text-muted">ยังไม่ได้ตั้งเป้าหมาย ไปตั้งเป้าหมายน้ำหนักหรือ Body Fat ได้ที่หน้าปฏิทิน</p>
      ) : (
        <div className="space-y-5">
          {goals.map((g) => {
            const current = goalCurrentValue(g)
            const pct = goalProgressPct(g)
            const start = goalStartValue(g)
            const label = g.goal_type === 'weight' ? `น้ำหนัก (${unit})` : 'Body Fat (%)'
            const fmt = (n: number) => (g.goal_type === 'weight' ? n.toFixed(1) : `${n.toFixed(1)}%`)
            const remaining =
              current !== null && g.target_value !== null ? Math.abs(current - g.target_value) : null
            // v: mockup "Current -> Goal ระยะทาง" ขอภาพเส้นสไลเดอร์ (start...goal, ลูกศรปัจจุบันตาม %)
            // แทนแถบเติมสีธรรมดาเดิม — ต้องมีทั้ง start/target/pct ครบถึงวาดเส้นได้ (ไม่งั้น fallback เป็น
            // แถบธรรมดาแบบเดิม เช่น ยังไม่เคยบันทึกค่าเลยสักครั้ง)
            const canShowSlider = start !== null && g.target_value !== null && pct !== null
            return (
              <div key={g.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-ink">{label}</span>
                  <span className="font-mono text-muted">
                    {current !== null ? current.toFixed(1) : '—'} / {g.target_value?.toFixed(1) ?? '—'}
                    {/* pct มาจาก sharedGoalProgressPct ซึ่ง clamp 0-100 เสมอ — ถ้าถึง/เกินเป้าหมายแล้ว pct
                        จะเป็น 100 พอดี แต่ remaining (Math.abs ตรงๆ) ยังเป็นค่าไม่เป็นศูนย์ได้ถ้าเกินเป้าไปแล้ว
                        (เช่น เป้าลดน้ำหนักเหลือ 70kg แต่ตอนนี้ 68kg) ทำให้ขึ้น "เหลือ 2.0kg" ทั้งที่แถบข้างล่าง
                        โชว์ 100% ไปแล้ว ขัดกันเอง — ถึงเป้าแล้วโชว์ป้ายสำเร็จแทนตัวเลขที่เหลือ */}
                    {pct !== null && pct >= 100 ? (
                      <span className="text-moss"> · ถึงเป้าหมายแล้ว</span>
                    ) : (
                      remaining !== null && <span className="text-amber"> · เหลือ {fmt(remaining)}</span>
                    )}
                  </span>
                </div>
                {canShowSlider ? (
                  <div className="relative pt-5 pb-4">
                    {/* ลูกศร + ค่าปัจจุบัน ลอยอยู่เหนือเส้นตรงตำแหน่ง % ความคืบหน้าจริง */}
                    <div
                      className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                      style={{ left: `${Math.min(100, Math.max(0, pct))}%` }}
                    >
                      <span className="text-[12px] font-mono text-ink whitespace-nowrap">{fmt(current!)}</span>
                      <span className="text-amber leading-none" aria-hidden="true">▲</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface2 overflow-hidden">
                      <div className="h-full bg-amber rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[12px] text-muted">{fmt(start!)}</span>
                      <span className="text-[12px] text-muted">{fmt(g.target_value!)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="h-2 rounded-full bg-surface2 overflow-hidden">
                    <div className="h-full bg-amber rounded-full" style={{ width: `${pct ?? 0}%` }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <a
        href="/calendar"
        className="mt-3 block text-center text-[12px] font-display tracked uppercase text-bg bg-amber rounded-lg py-2 transition active:scale-[0.99] hover:opacity-90"
      >
        ดูเป้าหมายทั้งหมด
      </a>
    </PremiumCard>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
    </svg>
  )
}

// การ์ดคำแนะนำ — ทิปหลักไฮไลต์ 1 อัน (อิงจาก insight เตือนล่าสุด ถ้ามี) + ทิปทั่วไปที่คำนวณจากค่าล่าสุด (น้ำ) และคำแนะนำมาตรฐาน (นอน)
function RecommendationsCard({ insights, latestWeightKg }: { insights: Insight[]; latestWeightKg: number | null }) {
  const topWarning = insights.find((i) => i.kind === 'warning')
  const isMuscleWarning = topWarning?.id === 'trend-muscle-down' || topWarning?.id === 'trend-musclemass-down'
  const highlight = topWarning
    ? {
        // v76: ฟีดแบ็ก "'เพิ่มการเผาผลาญไขมัน' เป็น title ที่ฟันธงผลลัพธ์เกินไป — ใช้ 'เพิ่มการใช้พลังงาน' แทน
        // (อธิบายกลไก ตรงกับ detail ด้านล่างที่แก้ไปแล้ว)"
        // v80: ฟีดแบ็ก "'เพิ่มการใช้พลังงาน' ฟังดูเป็นคำแนะนำทั่วไป ไม่ผูกกับเป้าหมายของหน้านี้ (ลด Body Fat +
        // รักษา Muscle) ตรงๆ" — เปลี่ยนเป็น "เพิ่มกิจกรรมเพื่อสนับสนุนการลดไขมัน" ให้ผูกกับเป้าหมายชัดเจนขึ้น
        title: isMuscleWarning ? 'เพิ่มการฝึกแรงต้าน' : 'เพิ่มกิจกรรมเพื่อสนับสนุนการลดไขมัน',
        // v73: ฟีดแบ็ก "HIIT ...15-20% ควรเอาตัวเลขออกถ้าไม่มี calculation/reference ที่ชัดเจน" — ตัวเลขนี้
        // hardcode ไว้เฉยๆ ไม่มีการคำนวณจากข้อมูลผู้ใช้หรืออ้างอิงงานวิจัยใดๆ ในระบบรองรับ ตัดตัวเลขที่ไม่มี
        // ที่มาจริงออก เหลือคำแนะนำเชิงพฤติกรรมล้วนๆ
        // v75: ฟีดแบ็ก "'ช่วยเผาผลาญไขมันได้มากขึ้น' ฟังดูเหมือนผลโดยตรงและ absolute เกินไป" — เปลี่ยนเป็น
        // "ช่วยเพิ่มการใช้พลังงานและสนับสนุนการลดไขมัน" อธิบายกลไก (เผาผลาญพลังงานมากขึ้น) แทนการฟันธงผลลัพธ์ตรงๆ
        // v76: ฟีดแบ็ก "ไม่ควรบังคับว่า HIIT ต้องเป็น default สำหรับทุกคน — ผู้ใช้ไม่ได้มี fitness level เท่ากัน"
        // — เปลี่ยนจาก "คาร์ดิโอ HIIT" (ระบุความหนักตายตัว) เป็น "คาร์ดิโอระดับปานกลางหรือ HIIT" (ให้เลือกตามระดับ)
        detail: isMuscleWarning ? 'ฝึกเวทหรือเวทเทรนนิ่งอย่างน้อย 2-3 ครั้ง/สัปดาห์ เน้นกล้ามเนื้อมัดใหญ่' : 'คาร์ดิโอระดับปานกลางหรือ HIIT 2-3 ครั้ง/สัปดาห์ ช่วยเพิ่มการใช้พลังงานและสนับสนุนการลดไขมัน',
        imageSrc: isMuscleWarning ? '/icons/increase-muscle-training.png' : '/icons/increase-training.png',
      }
    : null

  // สูตรทั่วไปที่แอปสุขภาพใช้ประมาณปริมาณน้ำที่ควรดื่ม ~35 มล./น้ำหนักตัว 1 กก.
  const waterLiters = latestWeightKg != null ? Math.round((latestWeightKg * 0.035) * 10) / 10 : null

  // v71: id ให้ InsightCard ในแท็บภาพรวม scroll มาหาได้ (ปุ่ม "ดูคำแนะนำ →") — การ์ดนี้ render แค่จุดเดียว
  // ต่อครั้ง (คนละแท็บ ไม่ได้ mount พร้อมกัน) จึงไม่ชน id ซ้ำ
  return (
    <PremiumCard id="recommendations" className="p-4">
      <h2 className="font-display text-sm tracked uppercase text-muted mb-3">คำแนะนำสำหรับคุณ</h2>
      <div className="space-y-2">
        {highlight && (
          <div className="rounded-lg border border-amber/40 bg-amber/10 px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <span className="w-8 h-8 shrink-0 inline-block">
                <Image src={highlight.imageSrc} alt="" width={32} height={32} className="w-full h-full object-contain" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-display tracked uppercase text-ink">{highlight.title}</p>
                <p className="text-[12px] text-muted mt-0.5">{highlight.detail}</p>
                <a
                  href="/program"
                  className="inline-block mt-2 text-[12px] font-display tracked uppercase text-bg bg-amber rounded-full px-3 py-1.5 transition active:scale-[0.99] hover:opacity-90"
                >
                  ดูโปรแกรมแนะนำ
                </a>
              </div>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2.5 px-1 py-1.5">
          <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-steel/15 text-steel">
            <DropletsIcon />
          </span>
          <div className="min-w-0 text-xs">
            <p className="text-ink">ดื่มน้ำให้เพียงพอ</p>
            <p className="text-[12px] text-muted mt-0.5">
              {waterLiters !== null ? `อย่างน้อยวันละ ${waterLiters.toFixed(1)} ลิตร` : 'อย่างน้อยวันละ 2-2.5 ลิตร'}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2.5 px-1 py-1.5">
          <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-violet/15 text-violet">
            <MoonIcon />
          </span>
          <div className="min-w-0 text-xs">
            <p className="text-ink">นอนหลับให้เพียงพอ</p>
            <p className="text-[12px] text-muted mt-0.5">7-8 ชั่วโมงต่อคืน</p>
          </div>
        </div>
      </div>
    </PremiumCard>
  )
}

const MUSCLE_FAT_META: Record<
  string,
  { Icon: () => JSX.Element; bg: string; fg: string; color: string; imageKey?: string; iconKey: string; direction: Direction }
> = {
  Weight: { Icon: ScaleIcon, bg: 'bg-moss/15', fg: 'text-moss', color: '#7A9B57', imageKey: 'weight', iconKey: 'weight', direction: 'neutral' },
  'Skeletal Muscle': {
    Icon: MuscleIcon,
    bg: 'bg-violet/15',
    fg: 'text-violet',
    color: '#9C7CC4',
    imageKey: 'skeletalMuscle',
    iconKey: 'muscle',
    direction: 'higherBetter',
  },
  'Fat Mass': { Icon: DropletsIcon, bg: 'bg-amber/15', fg: 'text-amber', color: '#E8A33D', imageKey: 'fatMass', iconKey: 'fat', direction: 'lowerBetter' },
}

function ObesityAnalysisChart({
  bmi,
  bodyFatPct,
  sex,
  bmiDelta,
  bodyFatDelta,
  periodLabel,
}: {
  bmi: number | null
  bodyFatPct: number | null
  sex: 'male' | 'female' | null
  bmiDelta?: number | null
  bodyFatDelta?: number | null
  periodLabel?: string | null
}) {
  const bf = bodyFatPctRange(sex)
  return (
    <section>
      {/* v28: ฟีดแบ็ก "OBESITY ANALYSIS/MUSCLE & FAT ANALYSIS ดู professional แต่รู้สึกเหมือน Dashboard
          ภาษาอังกฤษที่เอาข้อมูลไทยมาใส่ — FITLOG ควรมี identity ของตัวเองมากกว่านี้ ใช้ไทยเป็นหลัก อังกฤษเป็น
          secondary label เล็กๆ" — สลับลำดับ: ไทยเด่น (ขนาด/สีเดิมของหัวข้อ section) + อังกฤษเดิมเป็นคำเล็กจาง
          ต่อท้าย ไม่ใช่ตัวเดียวกับ subLabel การ์ด (นั่นคือ Thai label + English caption แนวตั้ง) อันนี้เป็น
          หัวข้อ section เดี่ยว เลยทำเป็นแนวนอนคำเดียวกันแทน */}
      {/* v73: ฟีดแบ็ก "'Obesity Analysis' ฟังดูเป็นคำวินิจฉัยทางคลินิกเกินไปสำหรับแอป fitness ทั่วไป" — เปลี่ยน
          เป็น 'Health Range Analysis' (ยังเป็นอังกฤษรอง ไม่ได้ย้อนการตัดสินใจ v28 ที่ยืนยันให้ไทยนำ)
          v74: ฟีดแบ็ก "'น้ำหนักเทียบเกณฑ์' ไม่ตรงกับเนื้อหาจริง (มี BMI + Body Fat ไม่ใช่แค่น้ำหนัก)" — เปลี่ยน
          เป็น "องค์ประกอบร่างกายเทียบเกณฑ์" ให้ครอบคลุมทั้ง 2 metric ที่อยู่ในการ์ดนี้จริง */}
      <h2 className="flex items-center gap-2 font-display text-sm tracked text-ink mb-1">
        <ScaleIcon />
        <span>
          องค์ประกอบร่างกายเทียบเกณฑ์
          <span className="text-[12px] uppercase tracked text-muted/70 ml-1.5">Health Range Analysis</span>
        </span>
        <span className="text-muted">
          <InfoIcon />
        </span>
      </h2>
      {/* v50: ฟีดแบ็ก "BMI/ไขมัน% ซ้ำกับ Key Metrics ด้านบน — คงไว้ทั้งสองที่ได้ แต่ทำให้ดูเป็นคนละเลเวลชัดขึ้น"
          — Key Metrics = สรุปด่วน (ตัวเลข+เดลต้าเฉยๆ) ส่วนนี้คือรายละเอียด (ตำแหน่งเทียบช่วงมาตรฐานเป็นแถบ) —
          บอกไว้ตรงๆ ว่าต่างกันตรงไหน กันความรู้สึกว่าเห็นตัวเลขเดิมซ้ำโดยไม่มีเหตุผล พร้อมเปลี่ยนกรอบการ์ด
          ด้านล่างเป็น steel accent (สีเดียวกับที่ BMI card ใช้อยู่แล้ว) ให้แยกจาก Key Metrics ด้วยสายตา */}
      {/* ฟีดแบ็ก "สำนวนข้อความยังไม่เป็นทางการระดับแอปสุขภาพ" — คงประโยคแรก (ตัวเลขเดียวกับ Key Metrics
          ด้านบน) ไว้ตามเดิม เพราะเป็นบริบทที่มีประโยชน์จริง (กันความรู้สึกว่าเห็นตัวเลขซ้ำโดยไม่มีเหตุผล
          ตาม v50 ด้านบน) แค่เปลี่ยนครึ่งหลังให้อ่านเป็นทางการขึ้นตามที่แนะนำ */}
      <p className="text-[12px] text-muted mb-3">
        ตัวเลขเดียวกับ Key Metrics ด้านบน — แสดงเป็นการประเมินตำแหน่งดัชนีร่างกายเทียบเกณฑ์มาตรฐานสุขภาพ
      </p>
      {/* v55: "detail tier" (steel accent ด้านบน) = การ์ดรอง ลด texture ลงครึ่งหนึ่งเหมือน tier 2/3 อื่นๆ */}
      <PremiumCard className="p-4 space-y-5 border-l-2" style={{ borderLeftColor: '#6C8CA8' }} reducedTexture>
        {bmi !== null && (
          <ZoneBarRow
            label="BMI (kg/m²)"
            value={bmi}
            min={10}
            low={18.5}
            high={25}
            max={40}
            decimals={1}
            imageKey="bmiObesity"
            iconKey="bmi"
            direction="neutral"
            primary={false}
            delta={bmiDelta}
            periodLabel={periodLabel}
          />
        )}
        {bmi !== null && bodyFatPct !== null && <div className="border-t border-white/5" />}
        {bodyFatPct !== null && (
          <ZoneBarRow
            label="Body fat rate (%)"
            value={bodyFatPct}
            min={bf.min}
            low={bf.low}
            high={bf.high}
            max={bf.max}
            decimals={1}
            unit="%"
            imageKey="bodyFatObesity"
            iconKey="fat"
            direction="lowerBetter"
            delta={bodyFatDelta}
            deltaUnit="จุดเปอร์เซ็นต์"
            periodLabel={periodLabel}
          />
        )}
      </PremiumCard>
    </section>
  )
}

function ZoneBarRow({
  label,
  value,
  min,
  low,
  high,
  max,
  decimals = 1,
  unit = '',
  imageKey,
  iconKey,
  direction = 'neutral',
  primary = true,
  delta,
  deltaUnit = '',
  periodLabel,
}: {
  label: string
  value: number
  min: number
  low: number
  high: number
  max: number
  decimals?: number
  unit?: string
  imageKey?: string
  iconKey?: string
  direction?: Direction
  // v29: ฟีดแบ็ก "Card ด้านบน 5 ใบยัง 'เท่ากันเกินไป'...ไม่จำเป็นต้องให้ทุก metric มี visual weight เท่ากัน"
  // — เดิม Obesity Analysis (BMI/Body Fat) ทั้ง 2 แถวเท่ากันหมด ตอนนี้ผู้เรียกกำหนดว่าแถวไหนเป็น
  // primary (Body Fat) vs secondary (BMI) ได้ — ดีฟอลต์ true (ไม่กระทบจุดเรียกใช้เดิมถ้าไม่ระบุ)
  primary?: boolean
  // v29: ฟีดแบ็ก "ผู้ใช้ไม่ควรต้องตีความเองว่าเลขนั้นดีหรือไม่ดี...อยากให้แต่ละ metric มีหนึ่งประโยค
  // interpretation" — ส่ง delta จริง (fieldDelta เดียวกับที่ Key Metrics/Health Score ใช้) เข้ามา ให้
  // component คำนวณประโยคเองจาก zone ที่มันคำนวณอยู่แล้ว ไม่ต้องคำนวณ zone ซ้ำสองที่ — ไม่มี delta พอ
  // (< 0.1 หรือไม่มีข้อมูล) fallback เป็นคำอธิบายโซนเฉยๆ ไม่เดาตัวเลขที่ไม่มี
  delta?: number | null
  deltaUnit?: string
  periodLabel?: string | null
}) {
  const pct = (v: number) => ((Math.min(Math.max(v, min), max) - min) / (max - min)) * 100
  const lowPct = pct(low)
  const highPct = pct(high)
  const valuePct = pct(value)
  const zone = value < low ? 'Low' : value > high ? 'High' : 'Standard'
  const interpretation =
    delta !== null && delta !== undefined && Math.abs(delta) >= 0.1
      ? `${delta < 0 ? 'ลดลง' : 'เพิ่มขึ้น'} ${Math.abs(delta).toFixed(decimals)}${deltaUnit ? ` ${deltaUnit}` : ''}${periodLabel ? ` ${periodLabel}` : ''}`
      : zone === 'Standard'
        ? 'อยู่ในช่วงมาตรฐาน'
        : zone === 'Low'
          ? 'ต่ำกว่าช่วงมาตรฐาน'
          : 'สูงกว่าช่วงมาตรฐาน'

  return (
    <div className={primary ? '' : 'opacity-90'}>
      <div className="flex items-center justify-between mb-2">
        <span className={`flex items-center gap-2 text-ink font-medium ${primary ? 'text-sm' : 'text-xs'}`}>
          {imageKey && <MetricIconChip iconKey={iconKey ?? 'ruler'} imageKey={imageKey} color="#6C8CA8" size={primary ? 28 : 20} />}
          <span className="flex items-center gap-1.5">
            {label}
            <span className="text-muted">
              <InfoIcon />
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className={`font-mono tabular text-ink ${primary ? 'text-lg' : 'text-base'}`}>
            {value.toFixed(decimals)}
            {unit && <span className="text-xs text-muted ml-0.5">{unit}</span>}
          </span>
          <ZoneBadge zone={zone} direction={direction} />
          <span className="text-muted">
            <ChevronRightIcon />
          </span>
        </span>
      </div>
      {interpretation && <p className="text-[12px] text-muted mb-2 -mt-1">{interpretation}</p>}
      <div className="flex text-[12px] mb-1.5">
        <span style={{ width: `${lowPct}%` }} className="truncate text-steel">
          Low
        </span>
        <span style={{ width: `${highPct - lowPct}%` }} className="text-center truncate text-moss">
          Standard
        </span>
        <span style={{ width: `${100 - highPct}%` }} className="text-right truncate text-rusttext">
          High
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-surface2 overflow-hidden">
        <div className="absolute inset-y-0 bg-steel/70" style={{ left: 0, width: `${lowPct}%` }} />
        <div className="absolute inset-y-0 bg-moss/70" style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }} />
        <div className="absolute inset-y-0 bg-rust/70" style={{ left: `${highPct}%`, right: 0 }} />
        <div
          className="absolute top-1/2 w-3 h-3 rounded-full bg-bg border-[3px] border-ink"
          style={{ left: `${valuePct}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
      <div className="flex justify-between text-[12px] text-muted mt-1.5">
        <span>{min.toFixed(decimals)}</span>
        <span>{low.toFixed(decimals)}</span>
        <span>{high.toFixed(decimals)}</span>
        <span>{max.toFixed(decimals)}</span>
      </div>
    </div>
  )
}

function MuscleFatAnalysisChart({
  items,
  unit,
  periodLabel,
}: {
  items: { label: string; value: number; low: number; high: number; delta: number | null; primary: boolean }[]
  unit: string
  periodLabel?: string | null
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 font-display text-sm tracked text-ink mb-1">
        <MuscleIcon />
        <span>
          กล้ามเนื้อและไขมัน
          <span className="text-[12px] uppercase tracked text-muted/70 ml-1.5">Muscle &amp; Fat Analysis</span>
        </span>
        <span className="text-muted">
          <InfoIcon />
        </span>
      </h2>
      {/* v50: ฟีดแบ็ก "น้ำหนัก/กล้ามเนื้อโครงร่าง/มวลไขมัน ซ้ำกับ Key Metrics/Additional Metrics ด้านบน — คง
          ไว้ทั้งสองที่ได้ แต่ทำให้ดูเป็นคนละเลเวลชัดขึ้น" — ดูคอมเมนต์เดียวกันที่ ObesityAnalysisChart */}
      {/* ฟีดแบ็ก "สำนวนข้อความยังไม่เป็นทางการระดับแอปสุขภาพ" — ดูคอมเมนต์เดียวกันที่ ObesityAnalysisChart */}
      <p className="text-[12px] text-muted mb-3">
        ตัวเลขเดียวกับด้านบน — แสดงเป็นการกระจายตัวขององค์ประกอบร่างกายเทียบเกณฑ์มาตรฐานสุขภาพ
      </p>
      {/* v55: "detail tier" (steel accent ด้านบน) = การ์ดรอง ลด texture ลงครึ่งหนึ่งเหมือน tier 2/3 อื่นๆ */}
      <PremiumCard className="divide-y divide-white/5 border-l-2" style={{ borderLeftColor: '#6C8CA8' }} reducedTexture>
        {items.map((it) => (
          <div key={it.label} className="p-4">
            <MuscleFatBarRow {...it} unit={unit} periodLabel={periodLabel} />
          </div>
        ))}
      </PremiumCard>
    </section>
  )
}

function MuscleFatBarRow({
  label,
  value,
  low,
  high,
  unit,
  delta,
  primary = true,
  periodLabel,
}: {
  label: string
  value: number
  low: number
  high: number
  unit: string
  delta?: number | null
  primary?: boolean
  periodLabel?: string | null
}) {
  const span = Math.max(high - low, 0.1)
  const min = low - span * 1.4
  const max = high + span * 1.4
  const pct = (v: number) => (Math.min(Math.max(v, min), max) - min) / (max - min) * 100
  const lowPct = pct(low)
  const highPct = pct(high)
  const valuePct = pct(value)
  const zone = value < low ? 'Low' : value > high ? 'High' : 'Standard'
  const meta = MUSCLE_FAT_META[label] ?? { Icon: ScaleIcon, bg: 'bg-steel/15', fg: 'text-steel', color: '#6C8CA8', iconKey: 'ruler', direction: 'neutral' as Direction }
  // v79: ฟีดแบ็ก "28.1 kg · ดี ✓ ข้าง 22.9-28.0 kg — เห็น 28.1 > 28.0 แต่ status เป็น 'ดี' ขัดกันทางสายตา" —
  // ค่า low/high มาจาก skeletal_muscle_range_low/high ที่ผู้ใช้กรอกตรงจากเครื่องชั่ง (ค่าเดียวกับที่เครื่องพิมพ์
  // เป็น "Standard range" บนใบผล) — 28.0 จึงเป็นขอบบนของช่วง Standard จริง ไม่ใช่แค่ reference point ลอยๆ — เดิม
  // interpretation แสดงแค่ "เพิ่มขึ้น X kg" (เดลต้า) เมื่อมีข้อมูลเดลต้า ซึ่งบังจุดสำคัญไป: ไม่บอกเลยว่าค่าอยู่นอก
  // ช่วงอ้างอิง ผู้ใช้เลยเห็นแค่ badge "ดี ✓" ลอยๆ ข้างตัวเลขที่เกิน 28.0 — เปลี่ยนให้แสดงทั้งเดลต้า "และ" ตำแหน่ง
  // เทียบค่าอ้างอิง (ต่อกันด้วย " · ") เมื่อไม่ใช่ Standard เสมอ ไม่ใช่แค่ตอนไม่มีเดลต้า — ฝั่ง favorable ใช้คำว่า
  // "เล็กน้อย" (แทน "สูงกว่าช่วงมาตรฐาน" เดิมที่มีคำว่า "ช่วง" ด้วย — เอาออกให้ตรงกับ "ค่าอ้างอิง" ด้านล่างบรรทัดถัดไป)
  const zoneIsFavorable = zone === 'High' ? meta.direction === 'higherBetter' : zone === 'Low' ? meta.direction === 'lowerBetter' : false
  const zoneText =
    zone === 'Standard'
      ? null
      : zoneIsFavorable
        ? `${zone === 'High' ? 'สูงกว่า' : 'ต่ำกว่า'}ค่าอ้างอิงเล็กน้อย`
        : `${zone === 'High' ? 'สูงกว่า' : 'ต่ำกว่า'}ค่าอ้างอิง`
  const deltaText =
    delta !== null && delta !== undefined && Math.abs(delta) >= 0.1
      ? `${delta < 0 ? 'ลดลง' : 'เพิ่มขึ้น'} ${Math.abs(delta).toFixed(1)} ${unit}${periodLabel ? ` ${periodLabel}` : ''}`
      : null
  const interpretation = [deltaText, zoneText].filter((s): s is string => s !== null).join(' · ') || 'อยู่ในเกณฑ์มาตรฐาน'

  return (
    <div className={primary ? '' : 'opacity-90'}>
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-3">
          <MetricIconChip iconKey={meta.iconKey} imageKey={meta.imageKey} color={meta.color} size={primary ? 36 : 26} />
          <span className={`flex items-center gap-1.5 text-ink font-medium ${primary ? 'text-sm' : 'text-xs'}`}>
            {label}
            <span className="text-muted">
              <InfoIcon />
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className={`font-mono tabular text-ink ${primary ? 'text-lg' : 'text-base'}`}>
            {value.toFixed(1)}
            <span className="text-xs text-muted ml-0.5">{unit}</span>
          </span>
          <ZoneBadge zone={zone} direction={meta.direction} />
          <span className="text-muted">
            <ChevronRightIcon />
          </span>
        </span>
      </div>
      {/* v64: ฟีดแบ็ก "28.1 kg บอกว่า 'อยู่ในเกณฑ์ดี ✓' (ถูกแล้ว, higherBetter) แต่แถบยังลงสีแดง (rust) ที่
          โซนเกิน 28.0 เหมือนโซนอันตรายตายตัว ทำให้ขอบบนดูเหมือน hard limit ที่ขัดกับ badge สีเขียว" — เดิมแถบ
          3 ช่วง (steel/moss/rust) ใช้สีตายตัวไม่สนทิศทาง เปลี่ยนให้ช่วง Low/High ใช้สีเขียว (moss) แทนถ้าฝั่ง
          นั้น favorable จริง (ตรงกับ meta.direction เดียวกับที่ ZoneBadge ใช้ตัดสิน) แถบกับ badge จะพูดเรื่อง
          เดียวกันเสมอ ไม่ขัดกันอีก */}
      <p className="text-[12px] text-muted mb-1.5 ml-12">{interpretation}</p>
      <div className="relative h-2.5 rounded-full bg-surface2 overflow-hidden">
        <div
          className="absolute inset-y-0"
          style={{ left: 0, width: `${lowPct}%`, backgroundColor: `${meta.direction === 'lowerBetter' ? '#7A9B57' : '#6C8CA8'}B3` }}
        />
        <div className="absolute inset-y-0" style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%`, backgroundColor: '#7A9B57B3' }} />
        <div
          className="absolute inset-y-0"
          style={{ left: `${highPct}%`, right: 0, backgroundColor: `${meta.direction === 'higherBetter' ? '#7A9B57' : '#C1503A'}B3` }}
        />
        <div
          className="absolute top-1/2 w-3 h-3 rounded-full bg-bg border-[3px] border-ink"
          style={{ left: `${valuePct}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
      {/* v74: ฟีดแบ็ก "Skeletal Muscle 28.1 vs 28.0 — 'ช่วงที่เหมาะสม' ทำให้ 28.1 ดูเหมือนเกิน range ทั้งที่
          badge บอกว่า 'ดี ✓' ห้ามปล่อยก่อน production" — ไม่แก้ด้วยการขยายตัวเลข range เอง (ไม่มีข้อมูลรองรับ
          ว่าควรขยายไปเท่าไหร่ เสี่ยง fabricate ค่าใหม่) เปลี่ยนคำแทน: "ช่วงที่เหมาะสม" (ฟังดูเหมือนขอบเขตต้องอยู่
          ใน) → "ค่าอ้างอิง" (reference — สื่อว่าเป็นแนวเทียบ ไม่ใช่กฎตายตัวที่ต้องอยู่ในเป๊ะๆ) ใช้ร่วมกันทั้ง 3
          แถว (Weight/Skeletal Muscle/Fat Mass) เพื่อความสม่ำเสมอ ไม่ใช่แก้แค่แถวเดียว */}
      {/* v78: ฟีดแบ็ก "อยากให้รวมเป็นบรรทัดเดียว 'ค่าอ้างอิง 22.9–28.0 kg' แทนเลข 2 ฝั่ง + label กลาง แยกกัน 3
          จุด" — เปลี่ยนจาก 3-column spread (low ซ้าย / (ค่าอ้างอิง) กลาง / high ขวา) เป็นบรรทัดเดียวรวมกัน
          กึ่งกลาง อ่านเป็นประโยคเดียวชัดเจนกว่า (เนื้อหาเดียวกันเป๊ะ ไม่ได้เปลี่ยนตัวเลข low/high) */}
      <p className="text-center text-[12px] text-muted mt-1.5">
        ค่าอ้างอิง {low.toFixed(1)}–{high.toFixed(1)} {unit}
      </p>
    </div>
  )
}

// การ์ดสรุปตัวเลขล่าสุดแบบใหม่ (ไอคอนวงกลม + ป้ายไทย/อังกฤษ + ค่า + ลูกศรเปลี่ยนแปลงจากครั้งก่อนหน้า)
function IconStatCard({
  label,
  subLabel,
  icon,
  imageKey,
  color,
  value,
  unit,
  decimals = 1,
  delta,
  deltaUnit = '',
  direction = 'neutral',
  note,
  noteGood = true,
  zone,
  zoneScheme = 'symmetric',
  primary = false,
  series,
  insight,
  insightTone,
  tier = 1,
  trendLabel,
  trendTag,
  lastMeasuredLabel,
  periodCaption,
  trendColor,
  trendEndpointColor,
  infoText,
  forceZonePill = false,
}: {
  label: string
  subLabel: string
  icon: string
  imageKey?: string
  color: string
  value: number | null | undefined
  unit?: string
  decimals?: number
  delta: number | null
  deltaUnit?: string
  direction?: Direction
  note?: string
  noteGood?: boolean
  // zone: ผลจำแนกค่าปัจจุบันเทียบกับช่วงมาตรฐาน (ต่ำ/มาตรฐาน/สูง) — ไม่ระบุ = ไม่แสดงป้ายสถานะ
  zone?: 'Low' | 'Standard' | 'High' | null
  // zoneScheme กำหนดว่า "สูงกว่ามาตรฐาน" ควรตีความว่าดีหรือแย่:
  // symmetric  = ทั้งต่ำและสูงกว่ามาตรฐานถือว่าไม่ดี (เช่น BMI)
  // higherOk   = สูงกว่ามาตรฐานยังโอเค/ดีกว่า เฉพาะต่ำกว่าที่ไม่ดี (เช่น น้ำในร่างกาย, โปรตีน)
  // lowerOk    = ต่ำกว่ามาตรฐานยังโอเค/ดีกว่า เฉพาะสูงกว่าที่ไม่ดี
  zoneScheme?: 'symmetric' | 'higherOk' | 'lowerOk'
  // ฟีดแบ็ก "ทุก Card ใหญ่เท่ากันหมด สมองคนอ่านไม่รู้ว่าจะดูอะไร อยากให้มี Primary การ์ดเดียว" — น้ำหนัก
  // เป็นตัวชี้วัดที่ถูกตั้งเป็น primary ในหน้านี้ (ดูจุดเรียกใช้) การ์ดนี้จะกินพื้นที่ 2x2 ช่อง (md ขึ้นไป)
  // ตัวเลข/ไอคอนใหญ่กว่าการ์ดอื่น และใช้ .shadow-hero (โทเคนที่มีอยู่แล้ว คอมเมนต์ในตัวมันเองบอกไว้ตรงๆ ว่า
  // "การ์ดหนึ่งใบต่อหน้าจอที่ควรเด่นสุด") แทน .shadow-elevated ปกติ
  primary?: boolean
  // v3: ฟีดแบ็ก "อยากได้ Mini Trend ทุกใบ" — เส้นจิ๋วท้ายการ์ด ใช้ Sparkline เดียวกับ Dashboard
  // (components/dashboard/Sparkline.tsx) ไม่ต้องสร้างใหม่ — ไม่ระบุ/น้อยกว่า 2 จุด = ไม่แสดง (Sparkline
  // เองมี guard นี้อยู่แล้ว)
  series?: number[]
  // v3: ฟีดแบ็ก "การ์ดยังเป็น Information ไม่มี Insight" — ข้อความสั้นๆ ใต้เดลต้า (เช่น "อยู่ในช่วงผันผวนปกติ")
  // คำนวณจากข้อมูลจริงที่จุดเรียกใช้ ไม่ใช่ copy สำเร็จรูปที่ขึ้นเสมอ
  insight?: string | null
  // v23: ฟีดแบ็ก "↑ 0.9 kg ควรเป็นสีเทาอ่อน (semantic color: น้ำหนักเพิ่ม/ลด = Neutral เสมอ) แล้วข้อความ
  // insight ที่อธิบายที่มา (เช่น 'น้ำหนักเพิ่มจากมวลกล้ามเนื้อเป็นหลัก') ค่อยใช้เขียวบางส่วนแทน" — เดิม insight
  // ใช้สีเทาคงที่ (#A8ACB4) เสมอไม่ว่าเนื้อหาจะเป็นเรื่องดีหรือไม่ — เพิ่ม prop นี้ให้จุดเรียกใช้ (เฉพาะการ์ด
  // น้ำหนัก) ระบุได้ว่าประโยคนี้คือเรื่องดี (muscle-driven) ให้ทั้งบรรทัดเป็นโทนเขียวอ่อนแทน ไม่ระบุ = สีเทาเดิม
  insightTone?: 'good'
  // v3: ฟีดแบ็ก "Card ไม่มีระดับความสำคัญ อยากให้ไล่ตามความสำคัญ (⭐⭐⭐⭐⭐/⭐⭐⭐/⭐⭐)" — tier 3 (ต่ำสุด)
  // ลดความจัดจ้านลงเล็กน้อย (opacity) ให้สายตาไหลไปที่ tier 1/2 ก่อน ไม่ได้ซ่อนข้อมูล แค่ลดน้ำหนักภาพ
  tier?: 1 | 2 | 3
  // v4: ฟีดแบ็ก "Weight Card ใหญ่ แต่ไม่มีข้อมูลพอ พื้นที่ 2-3 เท่าของ Card ปกติ แต่มีข้อมูลจริงแค่เลขเดียว"
  // — เฉพาะ primary เท่านั้นที่ใช้สองพร็อพนี้ (การ์ดปกติพื้นที่พอดีอยู่แล้ว ไม่ต้อง) ป้ายกำกับกราฟเทรนด์
  // ("30 DAY TREND") + วันที่วัดล่าสุด ปักไว้ท้ายการ์ด ให้พื้นที่ว่างเดิมกลายเป็นเนื้อหาที่มีประโยชน์จริง
  trendLabel?: string | null
  // v9: ฟีดแบ็ก "30 DAY TREND · MUSCLE-DRIVEN รวมเป็นสตริงเดียวหมด CAPS ทั้งบรรทัด อยากให้แยกเป็น ป้ายเทรนด์
  // ปกติ + Muscle-driven ↑ เป็นแท็กเล็กแยกสไตล์ต่างหาก (ไม่ต้องทำกราฟ 2 เส้นซ้อนกัน ซับซ้อนเกินไป)" — เดิม
  // trendLabel เป็นตัวเดียวรวมทุกอย่าง ตอนนี้แยก trendTag ออกมาอีกพร็อพ วางคนละสไตล์ (สีเขียว ไม่ตัวพิมพ์ใหญ่)
  // อยู่ฝั่งขวาของแถวเดียวกับ trendLabel
  trendTag?: string | null
  lastMeasuredLabel?: string | null
  // v5: ฟีดแบ็ก "Weight Card ยังว่างอีก ถ้ากราฟ 30 วันมีข้อมูลไม่พอ (< 2 จุด — เช่น log ไม่ถี่) การ์ดจะโล่ง
  // เหมือนเดิม" — บรรทัด "จาก X ก่อน" (periodLabelOf จาก lib/bodyMetricsSummary — ใช้เอนทรีก่อนหน้าล่าสุด
  // ไม่ผูกกรอบ 30 วัน) ไว้ใต้เดลต้าเสมอไม่ว่ากราฟจะมีข้อมูลพอวาดหรือไม่ก็ตาม กันไม่ให้การ์ดว่างเมื่อข้อมูลบาง
  periodCaption?: string | null
  // v6: ฟีดแบ็ก "เส้นเทรนด์น้ำหนัก = Titanium (เทาสุขุม แทนสีอำพันเดิม), จุดล่าสุด = เขียว" — override สี
  // เฉพาะกราฟเทรนด์ของ primary card แยกจาก `color` (ยังใช้กับไอคอน/glow ตามเดิม) ไม่ระบุ = ใช้ `color` เดิม
  trendColor?: string
  trendEndpointColor?: string
  // v7: ฟีดแบ็ก "Body Age เป็น metric ที่ตีความผิดง่าย ควรมี ⓘ อธิบายว่าไม่ใช่อายุจริง" — ปุ่ม ⓘ เล็กๆ ข้าง
  // label กดแล้ว toggle ข้อความอธิบายสั้นๆ ใต้การ์ด (state ในตัวการ์ดเอง ไม่ต้องยกไปไว้ที่ parent) ไม่ระบุ =
  // ไม่มีปุ่ม ⓘ เลย (พฤติกรรมเดิมของการ์ดอื่นทั้งหมด)
  infoText?: string
  // v8: ฟีดแบ็ก "BMI/Body Water ธรรมดาไปนิด ไม่มี insight เหมือน Body Fat/Muscle — เพิ่ม status กลับมาให้"
  // — ข้ามกฎ "ซ่อนป้าย ปกติ ตอนมีเดลต้า" (ดู showZonePill ด้านล่าง) เฉพาะการ์ดที่ระบุ prop นี้ ดีฟอลต์ false
  // = พฤติกรรมเดิมทุกการ์ดอื่น
  forceZonePill?: boolean
}) {
  const [showInfo, setShowInfo] = useState(false)
  const deltaGood = delta !== null && direction !== 'neutral' && (direction === 'higherBetter' ? delta > 0 : delta < 0)
  const deltaBad = delta !== null && direction !== 'neutral' && (direction === 'higherBetter' ? delta < 0 : delta > 0)
  const deltaColor = deltaGood ? 'text-moss' : deltaBad ? 'text-rusttext' : 'text-muted'
  // ฟีดแบ็ก "Body Fat ↓/Fat Mass ↓ เป็นเรื่องดี แต่กราฟยังเป็นสีแดง (สีธีมหมวด 'ไขมัน' เดิม) ขัดกับความหมาย
  // ผู้ใช้จะตีความว่าสีแดง = แย่" — เส้นเทรนด์การ์ดที่ไม่ใช่ primary ควรตามสถานะดี/แย่ของเดลต้าจริง (เดียวกับ
  // สีตัวหนังสือเดลต้าด้านบน) ไม่ใช่สีธีมหมวดคงที่ต่อการ์ด — ใช้เฉพาะตอนมีเดลต้าที่ตัดสินได้จริง (ไม่ใช่ neutral)
  // เท่านั้น การ์ดที่ direction เป็น neutral (เช่น น้ำในร่างกาย) ยังคงใช้สีธีมหมวดของตัวเองเหมือนเดิม
  const sparklineColor = deltaGood ? '#8CB264' : deltaBad ? '#C1503A' : color

  // ฟีดแบ็ก "Protein สูงกว่าเกณฑ์แล้วเป็นสีเขียว ผู้ใช้จะเข้าใจว่าเป็นเรื่องดี ซึ่งอาจไม่ใช่เสมอไป — ควรเปลี่ยน
  // เป็นข้อความที่ชัดกว่า" — ZONE_LABEL_TH เดิมใช้คำเดียวกัน ("สูงกว่าเกณฑ์"/"ต่ำกว่าเกณฑ์") ไม่ว่าด้านนั้น
  // จะเป็นเรื่องดีหรือไม่ดีก็ตาม ทำให้ป้ายสีเขียว+ข้อความ "สูงกว่าเกณฑ์" (ฟังดูเหมือนเตือน) ขัดกันเอง —
  // ใช้ zoneScheme (ซึ่งรู้อยู่แล้วว่าด้านไหนของการ์ดนี้คือ "ดี") เลือกคำที่สื่อความหมายตรงกับสีจริง
  const zoneIsFavorable = zone === 'High' ? zoneScheme === 'higherOk' : zone === 'Low' ? zoneScheme === 'lowerOk' : false
  // ฟีดแบ็ก "↑ เพียงพอ — ลูกศรตรงนี้ไม่ได้บอกว่าดีขึ้นหรือแย่ลง แต่บอกตำแหน่งเทียบเกณฑ์ ซึ่งอาจสับสนกับลูกศร
  // เดลต้าที่มีอยู่แล้วในบรรทัดแยก" — โซนที่ "ดี" (favorable) ใช้เครื่องหมาย ✓ ต่อท้ายแทนลูกศรนำหน้า (เพียงพอ ✓)
  // ส่วนโซนที่ยังเป็นคำเตือนจริงๆ (ไม่ favorable) ยังคงลูกศรนำหน้าไว้เหมือนเดิม เพราะช่วยบอกทิศทางที่หลุดเกณฑ์จริง
  // v66: ฟีดแบ็ก "'เพียงพอ'/'อยู่ในเกณฑ์ดี' ยังไม่ค่อยสัมพันธ์กับแถบ Ideal Range ที่โชว์คู่กัน (28.1 สูงกว่า 28.0
  // จริง แค่ต่างกัน 0.1 kg ไม่จำเป็นต้องพูดเรื่องอยู่ใน/นอกช่วงเลย)" — เปลี่ยนเป็น "ดี ✓" กลางๆ ทั้ง High/Low
  // ให้ตรงกับ ZoneBadge ที่เพิ่งแก้ไปพร้อมกัน (จุดเรียกใช้อื่นของแอป)
  const zoneLabel = zone
    ? zone === 'Standard'
      ? ZONE_LABEL_TH.Standard
      : zoneIsFavorable
        ? 'ดี ✓'
        : `${ZONE_ARROW[zone]} ${ZONE_LABEL_TH[zone]}`
    : null
  // v28: ฟีดแบ็ก "สีเขียวถูกใช้เยอะเกินไป — ปกติ/เพิ่มขึ้นดี/ผ่านเกณฑ์/เป้าหมาย ใช้เขียวหมด จนเขียวกลาย
  // เป็นสีปกติของ UI ไป — Green ควรสงวนไว้เฉพาะ Positive/Healthy/Goal achieved จริงๆ" — โซน Standard
  // ("ปกติ" แค่อยู่ในช่วงคาดหวัง ไม่ใช่ผลลัพธ์ที่ดีเป็นพิเศษ) เปลี่ยนจากเขียวเป็น steel (โทนกลางที่มีอยู่แล้ว
  // ในธีม ใช้กับ BMI/แถบ Low ในกราฟ Trends) ส่วนโซนที่ favorable จริง (เพียงพอ ✓/อยู่ในเกณฑ์ดี ✓ ด้านบน)
  // ยังเขียวเหมือนเดิม เพราะเป็นสัญญาณดีจริง ไม่ใช่แค่ "อยู่ในเกณฑ์"
  const zonePillClass =
    zone === 'Standard'
      ? 'bg-steeldim text-steel'
      : zone === 'High'
        ? zoneScheme === 'higherOk'
          ? 'bg-emerald-500/15 text-emerald-500'
          : 'bg-rustdim text-rusttext'
        : zone === 'Low'
          ? zoneScheme === 'lowerOk'
            ? 'bg-emerald-500/15 text-emerald-500'
            : 'bg-rustdim text-rusttext'
          : ''

  // แถวที่สอง (ใต้ตัวเลขหลัก): เดลต้ามีความสำคัญกว่า note เสมอถ้ามีทั้งคู่ (note ไว้ใช้แทนตอนไม่มีเดลต้า
  // จริงๆ เท่านั้น) — ต่างจากเดิมที่ zone แย่ง slot เดียวกับเดลต้า ตอนนี้ zone ย้ายไปเป็น pill แยกบนแถวค่า
  // แล้ว เดลต้า/note จึงโชว์ได้พร้อมกันกับ zone เสมอ (ฟีดแบ็ก "Body Fat Card อยากเห็นทั้ง Badge และ Delta")
  const secondary =
    delta !== null
      ? { text: `${delta > 0 ? '↑' : delta < 0 ? '↓' : '·'} ${Math.abs(delta).toFixed(decimals)}${deltaUnit ? ` ${deltaUnit}` : ''}`, color: deltaColor }
      : note
        ? { text: note, color: noteGood ? 'text-moss' : 'text-rusttext' }
        : null

  // ฟีดแบ็ก "อย่าให้ทุก Metric มีคำว่า 'ปกติ' — ถ้าทุก Card มี status เหมือนกัน หน้าเริ่มดูเป็นเครื่องชั่ง
  // วิเคราะห์ร่างกาย ไม่ใช่ FITLOG — status ควรใช้เฉพาะตอนมี insight" — "ปกติ" (zone Standard) คือสถานะที่ไม่มี
  // นัยอะไรเป็นพิเศษ (แค่ "อยู่ในช่วงคาดหวัง") ถ้าการ์ดมีเดลต้าที่บอกการเปลี่ยนแปลงจริงอยู่แล้ว เดลต้านั้น
  // ให้ข้อมูลมากกว่าป้าย "ปกติ" ซ้ำๆ กันหลายใบ — ซ่อนป้ายเฉพาะกรณีนี้ ส่วนโซน Low/High (ค่าที่หลุดช่วง จริงๆ
  // เป็นสัญญาณที่มีความหมาย ไม่ว่าจะดีหรือไม่ดี) ยังโชว์เสมอเหมือนเดิม
  // v8: ฟีดแบ็ก "BMI กับ Body Water ยังธรรมดาไปนิด ไม่มี insight/graph เหมือน Body Fat/Muscle — เพิ่ม status
  // เล็กๆ กลับมาช่วยให้รู้ทันทีว่าตัวเลขนี้ดีหรือไม่ดี" — forceZonePill ให้จุดเรียกใช้เฉพาะ 2 การ์ดนี้ข้าม
  // กฎซ่อน "ปกติ" ข้างบนได้ (การ์ดอื่นที่ไม่ส่ง prop นี้มายังทำงานเหมือนเดิมทุกประการ)
  const showZonePill = zone !== null && (forceZonePill || !(zone === 'Standard' && secondary !== null))

  // v58: caption label ที่ย้ายมาอยู่ท้ายค่า/เดลต้าแล้ว (ดูคอมเมนต์ v58 ที่แถวไอคอนด้านบน) — แยกเป็นตัวแปร
  // เดียวใช้ร่วมกันทั้งสาขา primary/ไม่ primary กันโค้ดซ้ำ
  const labelCaption = (
    <p className={`text-ink font-medium leading-tight flex items-center gap-1 mt-1.5 ${primary ? 'text-sm' : 'text-xs'}`}>
      {label}
      {/* ฟีดแบ็ก (จากรอบตรวจ Dashboard/Recovery/Coach, "Typography") "ไม่ลดต่ำกว่า 12px สำหรับข้อความรอง" —
          เดิม primary/ไม่ primary ใช้ text-[10px]/text-[9px] แยกกัน (ส่วนหนึ่งของระบบ tier ที่ตั้งใจให้การ์ด
          รองดูเรียบกว่าการ์ดหลัก — ดู comment v26/v55 ด้านบน) ปรับทั้งคู่ขึ้นมาที่ 12px เท่ากัน ทำให้ ternary
          ไม่มีผลต่อ font-size อีกต่อไป (เหลือแค่ text-[12px] คงที่) — ลำดับชั้น primary/รองยังคงอยู่ผ่านมิติ
          อื่น (ขนาดเลขค่าหลัก 52px vs 24-30px, ไอคอน, padding การ์ด ฯลฯ) ไม่ได้หายไปไหน */}
      <span className="tracked uppercase text-muted/70 leading-snug text-[12px]">{subLabel}</span>
      {infoText && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setShowInfo((v) => !v)
          }}
          className="text-muted shrink-0 transition hover:text-ink"
          aria-label={`ข้อมูลเพิ่มเติมเกี่ยวกับ ${label}`}
        >
          <InfoIcon />
        </button>
      )}
    </p>
  )

  return (
    <PremiumCard
      // ฟีดแบ็ก "Weight Card สูง ~405px อยากได้ ~360-370px เพื่อดึง Analysis ขึ้นมาในจอเดียว" — ลด padding
      // การ์ดทั้งสองขนาด (primary py-4→py-3.5, ปกติ py-3.5→py-3) เพราะการ์ด primary สูงเท่ากับ 2 แถวของ
      // การ์ดเล็กที่มันคร่อมอยู่ (md:row-span-2) ไม่ได้ตั้ง height ตายตัว — ลด padding การ์ดเล็กจึงลดความสูง
      // ทั้งแถวและลาม primary ไปด้วยอัตโนมัติ ไม่ต้องคำนวณความสูง primary แยก
      // v55: ฟีดแบ็ก "Weight/Body Fat/Muscle Mass ควรมี Visual Weight สูงกว่า BMI/Body Water ชัดกว่านี้ —
      // ตอนนี้ดูสำคัญเท่ากันหมด" — เดิม tier 2/3 ลด opacity แค่ 95%/80% (จางเกินไปจนแทบไม่ต่างจาก tier 1
      // ที่ 100%) เพิ่มช่องว่างให้ห่างชัดขึ้น (90%/72%) โดยไม่ถึงขั้นแยก grid ใหม่ (เสี่ยงพังเลย์เอาต์ primary
      // card ที่ md:row-span-2 คร่อมอยู่ ซึ่งผ่านการจูนมาหลายรอบแล้ว)
      className={`h-full flex flex-col metric-card-hover ${
        primary ? 'md:col-span-2 md:row-span-2 px-5 py-3.5' : 'justify-between px-4 py-3'
      } ${tier === 3 ? 'opacity-[0.72]' : tier === 2 ? 'opacity-90' : ''}`}
      // primary ใช้ boxShadow override คงที่ (ไม่ใช่ผ่าน CSS class) เพราะ PremiumCard เซ็ต boxShadow ผ่าน
      // inline style ของตัวเองอยู่แล้ว — prop `style` ที่ส่งเข้ามาจะถูก spread ทับท้ายสุดใน PremiumCard.tsx
      // (`...style` วางหลัง boxShadow ดีฟอลต์) จึงชนะได้จริง ต่างจากการพยายามใช้ class ธรรมดามาชน inline
      style={
        primary
          ? { boxShadow: '0 2px 4px rgba(0,0,0,.3), 0 16px 40px -8px rgba(0,0,0,.55), 0 0 0 1px rgba(232,163,61,.14)' }
          : undefined
      }
      // v55: ฟีดแบ็ก "Texture เยอะไปทุก Section — Secondary Cards ควรลด texture 30-50%" — tier 1 (Weight/
      // Body Fat/Muscle Mass, การ์ด Primary ในสายตาผู้ใช้ตามคอมเมนต์ v26 ด้านล่าง) คงเต็ม ส่วน tier 2/3
      // (BMI/Body Water) ลด texture ลงครึ่งหนึ่ง
      reducedTexture={tier !== 1}
    >
      {/* v58: ฟีดแบ็ก "ตัวเลขควรเป็นพระเอก ไม่ใช่ label — สลับลำดับเป็นตัวเลข/เดลต้าก่อน แล้วค่อย label ไทย/
          English" — เดิม label+subLabel อยู่ในแถวเดียวกับไอคอน (บนสุด, อ่านก่อนตัวเลขเสมอ) ย้าย label+
          subLabel (พร้อมปุ่ม ⓘ infoText เดิม) ไปเป็น caption ท้ายค่า/เดลต้า/insight แทน (ดูจุดใช้ด้านล่าง
          ทั้งสองสาขา primary/ไม่ primary) เหลือแค่ไอคอน + zone pill ในแถวบนสุด (ทั้งสองยังเป็นสัญญาณที่มี
          ประโยชน์ให้เห็นทันที ไม่ใช่ label ข้อความที่แข่งกับตัวเลข) v26 เดิม (ลดขนาดไอคอน tier 2/3) ไม่กระทบ */}
      <div className={`flex items-start gap-2 ${primary ? 'mb-2.5' : 'mb-2'}`}>
        <MetricIconChip iconKey={icon} imageKey={imageKey} color={color} size={primary ? 44 : tier >= 2 ? 22 : 32} />
        {showZonePill && zoneLabel && (
          <span
            className={`ml-auto shrink-0 font-display tracked uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${zonePillClass} text-[12px]`}
          >
            {zoneLabel}
          </span>
        )}
      </div>
      {primary ? (
        <>
          {/* ฟีดแบ็ก "66.3 kg / ↑ 0.9 kg · 3 สัปดาห์ / น้ำหนักเพิ่มจากมวลกล้ามเนื้อ... สามบรรทัดนี้น้ำหนัก
              ตัวอักษรใกล้กันเกินไป ให้สายตาเจอ 66.3 ก่อนทันที — เพิ่ม contrast ตัวหนังสือ ไม่ใช่ลดขนาดตัวรอง"
              — ขยายเลขค่าหลักจาก text-4xl (36px) เป็น text-5xl (48px) ให้ชัดเจนว่าเป็นสิ่งสำคัญที่สุดบนการ์ด
              ก่อนเห็นเดลต้า/insight ซึ่งยังคงขนาดเดิม (มีความเข้มกว่า/จางกว่ากันอยู่แล้วจาก deltaColor/
              text-muted) */}
          {/* v21: ฟีดแบ็ก "ตัวเลขหลักของ Cards เล็กเกินไปเมื่อเทียบกับ Weight...แนะนำ Weight (Hero Metric)
              ใช้ประมาณ 50-56px" — ขยายต่อจาก text-5xl (48px) เป็น 52px ตรงๆ (ไม่มี Tailwind step ระหว่าง
              5xl/6xl ที่ตรงช่วงนี้พอดี) */}
          <p className="font-mono tabular text-ink shrink-0 whitespace-nowrap" style={{ fontSize: 52 }}>
            {value !== null && value !== undefined ? value.toFixed(decimals) : '—'}
            {unit && <span className="text-muted ml-1 text-sm">{unit}</span>}
          </p>
          {/* ฟีดแบ็ก "↑ 0.9 kg / จาก 3 สัปดาห์ก่อน / น้ำหนักเพิ่ม... สามบรรทัดเยอะไป อยากได้ ↑ 0.9 kg ·
              3 สัปดาห์ รวมบรรทัดเดียว แล้ว insight ค่อยอยู่บรรทัดถัดไป" — periodCaption (compact, ไม่มี
              "จาก...ก่อน" ห่อ) ต่อท้าย secondary ด้วย "·" แทนที่จะแยกบรรทัด
              v20: ฟีดแบ็ก "เพิ่มระยะห่างระหว่างแต่ละข้อมูล" — เดิมไม่มี margin-top จากค่าหลักเลย (แค่ block
              ต่อกัน) เพิ่ม mt-1 ให้หายใจง่ายขึ้นหลังขยายเลขค่าหลัก */}
          {/* v22: ฟีดแบ็ก "↑ 0.9 kg · 3 สัปดาห์ เด่นไปนิด อยากให้ 66.3 kg เห็นก่อน — ลด opacity บรรทัดที่ 2
              ลงเล็กน้อย จะดูแพงขึ้น" — opacity-85 บน wrapper เท่านั้น ไม่แตะสี deltaColor เดิม (เขียว/แดง/เทา
              ยังสื่อสถานะจริงเหมือนเดิม แค่จางลงอีกขั้นเมื่อเทียบกับเลขค่าหลัก 52px ด้านบน) */}
          {secondary && (
            <p className={`font-mono whitespace-nowrap text-sm mt-1 opacity-85 ${secondary.color}`}>
              {secondary.text}
              {periodCaption && <span className="text-muted"> · {periodCaption}</span>}
            </p>
          )}
          {/* v23: ฟีดแบ็ก "↑ 0.9 kg ควรเทาเสมอ (semantic color) แล้วประโยคอธิบายที่มาค่อยใช้เขียวบางส่วน" —
              insightTone === 'good' (เฉพาะกรณี muscle-driven ที่ weightInsight อธิบายว่าน้ำหนักขึ้นเพราะ
              กล้ามเนื้อ) ใช้โทนเขียวอ่อนแทน #A8ACB4 เดิม ไม่ระบุ = สีเทาเดิมทุกกรณีอื่น */}
          {insight && (
            <p className="truncate text-xs mt-1" style={{ color: insightTone === 'good' ? '#9DBB7E' : '#A8ACB4' }}>
              {insight}
            </p>
          )}
          {labelCaption}
          {/* ฟีดแบ็ก "Weight Card พื้นที่ 2-3 เท่าของปกติ แต่มีข้อมูลจริงแค่เลขเดียว" — flex-1 ดันเนื้อหาลงไปกิน
              พื้นที่ว่างด้านล่างแทนที่จะปล่อยโล่ง (การ์ดปกติไม่มีปัญหานี้ เพราะ justify-between เดิมพอแล้ว
              สำหรับความสูงปกติ ดูสาขา else ด้านล่าง) — v5: เดิมถ้า series มีข้อมูลไม่พอ (< 2 จุด, เช่น
              ผู้ใช้ log ไม่ถี่พอในกรอบ 30 วัน) div นี้จะเหลือแค่ lastMeasuredLabel บรรทัดเดียวปักท้ายการ์ด
              ตรงกลางยังโล่งอยู่ดี — เพิ่มทางเลือก "Minimal Luxury" (เส้นคั่น + ป้าย "TREND" เฉยๆ ไม่มีกราฟ)
              เป็นของตกแต่งชั้นสุดท้ายกันพื้นที่ว่างเมื่อกราฟวาดไม่ได้จริงๆ */}
          {(series || lastMeasuredLabel) && (
            <div className="flex-1 flex flex-col justify-end mt-2.5">
              {series && series.length >= 2 ? (
                <>
                  {/* v23: ฟีดแบ็ก "ให้ข้อมูลด้านบน (ค่า/เดลต้า/insight) เด่นกว่า Trend — ผู้ใช้ควรรู้ก่อนว่า
                      'น้ำหนักเพิ่ม แต่เป็นการเพิ่มที่ดี' แล้วค่อยดูกราฟ" — เดิมกราฟกับ label ต่อจากบรรทัด
                      insight ทันทีไม่มีเส้นแบ่ง เพิ่มเส้นคั่นบางๆ (เหมือนที่สาขา fallback ด้านล่างมีอยู่แล้ว)
                      ให้บล็อกบนกับ trend แยกจากกันเป็นสองช่วงชัดเจน ไม่ใช่อ่านรวดเดียวจากบนลงล่าง */}
                  <div className="h-px bg-line mb-2" />
                  {(trendLabel || trendTag) && (
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      {trendLabel && <p className="text-[12px] tracked uppercase text-muted">{trendLabel}</p>}
                      {/* ฟีดแบ็ก "30 DAY TREND ดีไซน์สวย แต่ Muscle-driven ↑ สีเขียวค่อนข้างเด่น แย่งสายตา
                          จากกราฟ — กราฟควรเป็นพระเอก ไม่ใช่ label" — ลด opacity จาก text-moss เต็มเป็น
                          text-moss/70 */}
                      {trendTag && <span className="text-[12px] text-moss/70 shrink-0">{trendTag}</span>}
                    </div>
                  )}
                  <Sparkline series={series} color={trendColor ?? color} endpointColor={trendEndpointColor} height={48} width={400} stretch />
                </>
              ) : trendLabel ? (
                <>
                  <div className="h-px bg-line mb-2" />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] tracked uppercase text-muted">{trendLabel}</p>
                    {trendTag && <span className="text-[12px] text-moss shrink-0">{trendTag}</span>}
                  </div>
                </>
              ) : null}
              {lastMeasuredLabel && <p className="text-[12px] text-muted mt-2">ล่าสุด {lastMeasuredLabel}</p>}
            </div>
          )}
          {showInfo && infoText && <p className="text-xs text-muted mt-2 pt-2 border-t border-line">{infoText}</p>}
        </>
      ) : (
        <div>
          {/* v21: ฟีดแบ็ก "ตัวเลขหลักของ Cards เล็กเกินไปเมื่อเทียบกับ Weight...แนะนำ Cards เล็กใช้ตัวเลข
              ประมาณ 30-34px อย่างสม่ำเสมอ...จะทำให้ผู้ใช้เข้าใจทันทีว่า Weight = ข้อมูลหลัก, Metrics อื่น =
              ข้อมูลสนับสนุน" — จาก text-xl (20px) เป็น text-3xl (30px)
              v26: ฟีดแบ็ก "ทำ Secondary Cards ให้เรียบกว่า Primary Cards" (Priority 4) — ลดอีกขั้นเฉพาะ
              tier 2/3 (text-3xl 30px → text-2xl 24px) ให้การ์ด tier 1 (Weight/Body Fat/Muscle Mass) ยังคง
              เป็นตัวเลขใหญ่สุดในกริดเหมือนเดิม สร้างลำดับชั้นด้วยขนาด ไม่ต้องพึ่ง layout 2x2 แบบ primary เดิม */}
          <p className={`font-mono tabular text-ink shrink-0 whitespace-nowrap ${tier >= 2 ? 'text-2xl' : 'text-3xl'}`}>
            {value !== null && value !== undefined ? value.toFixed(decimals) : '—'}
            {unit && <span className="text-muted ml-1 text-xs">{unit}</span>}
          </p>
          {/* ฟีดแบ็ก "Metric Cards ควรอ่านได้ใน 1 วินาที...ข้อความรองค่อนข้างจางและแน่น — เพิ่มระยะห่างระหว่าง
              แต่ละข้อมูล" — เดิม secondary ไม่มี margin-top เลย (ชิดค่าหลักทันที) เพิ่ม mt-0.5 คั่น แล้วเพิ่ม
              insight จาก mt-0.5 เป็น mt-1 ให้แยกจาก secondary ชัดขึ้นอีกขั้น */}
          {secondary && <p className={`font-mono whitespace-nowrap text-[12px] mt-0.5 ${secondary.color}`}>{secondary.text}</p>}
          {/* v21: ฟีดแบ็ก "คำอธิบายด้านล่าง...เพิ่มความสว่างของตัวอักษรประมาณ 10-15%" — เหมือนบรรทัด insight
              ของ primary card ด้านบน เปลี่ยนจาก text-muted เป็น #A8ACB4 (สว่างกว่า ~12%) */}
          {insight && <p className="truncate text-[12px] mt-1" style={{ color: '#A8ACB4' }}>{insight}</p>}
          {labelCaption}
          {series && series.length >= 2 && (
            <div className="mt-1.5">
              <Sparkline series={series} color={sparklineColor} height={18} width={200} stretch />
            </div>
          )}
          {showInfo && infoText && <p className="text-[12px] text-muted mt-1.5 pt-1.5 border-t border-line">{infoText}</p>}
        </div>
      )}
    </PremiumCard>
  )
}

function SexPrompt({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const supabase = createClient()
  const [saving, setSaving] = useState<'male' | 'female' | null>(null)
  const [dismissed, setDismissed] = useState(false)

  async function handlePick(sex: 'male' | 'female') {
    setSaving(sex)
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ user_id: profile.user_id, sex, updated_at: new Date().toISOString() })
      .select()
      .single()
    setSaving(null)
    if (!error && data) onSaved(data as Profile)
  }

  if (dismissed) return null

  return (
    <PremiumCard className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <p className="text-xs text-muted">
        ระบุเพศเพื่อประเมินเกณฑ์มาตรฐาน<span className="text-ink">น้ำในร่างกาย โปรตีน และไขมันในร่างกาย</span>ให้แม่นยำขึ้น
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => handlePick('male')}
          disabled={saving !== null}
          className="px-3 py-1.5 rounded-lg bg-steeldim text-steel text-xs font-display tracked uppercase transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
        >
          {saving === 'male' ? '...' : 'ชาย'}
        </button>
        <button
          type="button"
          onClick={() => handlePick('female')}
          disabled={saving !== null}
          className="px-3 py-1.5 rounded-lg bg-rustdim text-rusttext text-xs font-display tracked uppercase transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
        >
          {saving === 'female' ? '...' : 'หญิง'}
        </button>
        <button type="button" onClick={() => setDismissed(true)} className="text-[12px] text-muted underline transition hover:text-ink">
          ข้าม
        </button>
      </div>
    </PremiumCard>
  )
}

function MetricForm({
  profile,
  onSaved,
  onHeightExtracted,
  onAgeChanged,
}: {
  profile: Profile | null
  onSaved: (m: BodyMetric) => void
  onHeightExtracted?: (heightCm: number) => Promise<void>
  onAgeChanged?: (age: number) => Promise<void>
}) {
  const supabase = createClient()
  const { unit, toKg, toDisplay } = useWeightUnit()
  const [date, setDate] = useState(todayStr())
  const [heightCm, setHeightCm] = useState(profile?.height_cm ? String(profile.height_cm) : '')
  const [ageInput, setAgeInput] = useState(profile?.age ? String(profile.age) : '')
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [muscle, setMuscle] = useState('')
  const [waist, setWaist] = useState('')
  const [chest, setChest] = useState('')
  const [hip, setHip] = useState('')
  const [arm, setArm] = useState('')
  const [thigh, setThigh] = useState('')
  const [bodyFatKg, setBodyFatKg] = useState('')
  const [bodyWater, setBodyWater] = useState('')
  const [inorganicSalt, setInorganicSalt] = useState('')
  const [protein, setProtein] = useState('')
  const [boneMass, setBoneMass] = useState('')
  const [skeletalMuscle, setSkeletalMuscle] = useState('')
  const [visceralFat, setVisceralFat] = useState('')
  const [bmr, setBmr] = useState('')
  const [showRanges, setShowRanges] = useState(false)
  const [weightRangeLow, setWeightRangeLow] = useState('')
  const [weightRangeHigh, setWeightRangeHigh] = useState('')
  const [skeletalRangeLow, setSkeletalRangeLow] = useState('')
  const [skeletalRangeHigh, setSkeletalRangeHigh] = useState('')
  const [fatMassRangeLow, setFatMassRangeLow] = useState('')
  const [fatMassRangeHigh, setFatMassRangeHigh] = useState('')
  const [muscleRangeLow, setMuscleRangeLow] = useState('')
  const [muscleRangeHigh, setMuscleRangeHigh] = useState('')
  const [bodyAge, setBodyAge] = useState('')
  const [bodyAgeRangeLow, setBodyAgeRangeLow] = useState('')
  const [bodyAgeRangeHigh, setBodyAgeRangeHigh] = useState('')
  const [bodyWaterRangeLow, setBodyWaterRangeLow] = useState('')
  const [bodyWaterRangeHigh, setBodyWaterRangeHigh] = useState('')
  const [saltRangeLow, setSaltRangeLow] = useState('')
  const [saltRangeHigh, setSaltRangeHigh] = useState('')
  const [proteinRangeLow, setProteinRangeLow] = useState('')
  const [proteinRangeHigh, setProteinRangeHigh] = useState('')
  const [boneMassRangeLow, setBoneMassRangeLow] = useState('')
  const [boneMassRangeHigh, setBoneMassRangeHigh] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [heightNote, setHeightNote] = useState<string | null>(null)

  // profile โหลดแบบ async หลัง MetricForm mount ไปแล้ว — sync ค่าส่วนสูง/อายุเข้าช่องกรอกทุกครั้งที่โหลดเสร็จ/เปลี่ยน
  useEffect(() => {
    setHeightCm(profile?.height_cm ? String(profile.height_cm) : '')
  }, [profile?.height_cm])

  useEffect(() => {
    setAgeInput(profile?.age ? String(profile.age) : '')
  }, [profile?.age])

  async function handleHeightBlur() {
    const trimmed = heightCm.trim()
    if (!trimmed || !onHeightExtracted) return
    const num = Number(trimmed)
    if (!Number.isFinite(num) || num === profile?.height_cm) return
    try {
      await onHeightExtracted(num)
    } catch (err) {
      console.error('บันทึกส่วนสูงไม่สำเร็จ', err)
    }
  }

  async function handleAgeBlur() {
    const trimmed = ageInput.trim()
    if (!trimmed || !onAgeChanged) return
    const num = Math.round(Number(trimmed))
    if (!Number.isFinite(num) || num === profile?.age) return
    try {
      await onAgeChanged(num)
    } catch (err) {
      console.error('บันทึกอายุไม่สำเร็จ', err)
    }
  }

  function fmtKg(v: number | null): string {
    return v !== null ? String(Math.round(toDisplay(v) * 10) / 10) : ''
  }

  async function handleExtracted(data: ExtractedBodyReport) {
    // เปิด DevTools console ดูค่านี้ได้ ถ้าอยากเช็คว่าอ่านรูปได้ค่าอะไรบ้าง
    console.log('extracted body report', data)
    if (data.measured_at) setDate(data.measured_at)
    if (data.height_cm !== null) {
      setHeightNote(null)
      try {
        await onHeightExtracted?.(data.height_cm)
        setHeightNote(`บันทึกส่วนสูง ${data.height_cm} ซม. ให้อัตโนมัติแล้ว`)
      } catch (err) {
        console.error('บันทึกส่วนสูงอัตโนมัติไม่สำเร็จ', err)
        setHeightNote('อ่านส่วนสูงได้ แต่บันทึกลงโปรไฟล์ไม่สำเร็จ ลองกรอกเองด้านบน หรือดู console')
      }
    } else {
      setHeightNote('รูปนี้อ่านส่วนสูงไม่ได้ — กรอกเองที่ช่อง "ส่วนสูง" ด้านบนสุดของหน้าแทน')
    }
    if (data.weight_kg !== null) setWeight(fmtKg(data.weight_kg))
    if (data.body_fat_pct !== null) setBodyFat(String(data.body_fat_pct))
    if (data.muscle_kg !== null) setMuscle(fmtKg(data.muscle_kg))
    if (data.body_fat_kg !== null) setBodyFatKg(fmtKg(data.body_fat_kg))
    if (data.body_water_kg !== null) setBodyWater(fmtKg(data.body_water_kg))
    if (data.inorganic_salt_kg !== null) setInorganicSalt(fmtKg(data.inorganic_salt_kg))
    if (data.protein_kg !== null) setProtein(fmtKg(data.protein_kg))
    if (data.bone_mass_kg !== null) setBoneMass(fmtKg(data.bone_mass_kg))
    if (data.skeletal_muscle_kg !== null) setSkeletalMuscle(fmtKg(data.skeletal_muscle_kg))
    if (data.visceral_fat_grade !== null) setVisceralFat(String(data.visceral_fat_grade))
    if (data.bmr_kcal !== null) setBmr(String(data.bmr_kcal))
    if (data.body_age_years !== null) setBodyAge(String(data.body_age_years))
    const hasRanges =
      data.weight_range_low !== null ||
      data.weight_range_high !== null ||
      data.skeletal_muscle_range_low !== null ||
      data.skeletal_muscle_range_high !== null ||
      data.fat_mass_range_low !== null ||
      data.fat_mass_range_high !== null ||
      data.muscle_range_low !== null ||
      data.muscle_range_high !== null ||
      data.body_age_range_low !== null ||
      data.body_age_range_high !== null ||
      data.body_water_range_low !== null ||
      data.body_water_range_high !== null ||
      data.inorganic_salt_range_low !== null ||
      data.inorganic_salt_range_high !== null ||
      data.protein_range_low !== null ||
      data.protein_range_high !== null ||
      data.bone_mass_range_low !== null ||
      data.bone_mass_range_high !== null
    if (hasRanges) {
      setShowRanges(true)
      if (data.weight_range_low !== null) setWeightRangeLow(fmtKg(data.weight_range_low))
      if (data.weight_range_high !== null) setWeightRangeHigh(fmtKg(data.weight_range_high))
      if (data.skeletal_muscle_range_low !== null) setSkeletalRangeLow(fmtKg(data.skeletal_muscle_range_low))
      if (data.skeletal_muscle_range_high !== null) setSkeletalRangeHigh(fmtKg(data.skeletal_muscle_range_high))
      if (data.fat_mass_range_low !== null) setFatMassRangeLow(fmtKg(data.fat_mass_range_low))
      if (data.fat_mass_range_high !== null) setFatMassRangeHigh(fmtKg(data.fat_mass_range_high))
      if (data.muscle_range_low !== null) setMuscleRangeLow(fmtKg(data.muscle_range_low))
      if (data.muscle_range_high !== null) setMuscleRangeHigh(fmtKg(data.muscle_range_high))
      if (data.body_age_range_low !== null) setBodyAgeRangeLow(String(data.body_age_range_low))
      if (data.body_age_range_high !== null) setBodyAgeRangeHigh(String(data.body_age_range_high))
      if (data.body_water_range_low !== null) setBodyWaterRangeLow(fmtKg(data.body_water_range_low))
      if (data.body_water_range_high !== null) setBodyWaterRangeHigh(fmtKg(data.body_water_range_high))
      if (data.inorganic_salt_range_low !== null) setSaltRangeLow(fmtKg(data.inorganic_salt_range_low))
      if (data.inorganic_salt_range_high !== null) setSaltRangeHigh(fmtKg(data.inorganic_salt_range_high))
      if (data.protein_range_low !== null) setProteinRangeLow(fmtKg(data.protein_range_low))
      if (data.protein_range_high !== null) setProteinRangeHigh(fmtKg(data.protein_range_high))
      if (data.bone_mass_range_low !== null) setBoneMassRangeLow(fmtKg(data.bone_mass_range_low))
      if (data.bone_mass_range_high !== null) setBoneMassRangeHigh(fmtKg(data.bone_mass_range_high))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('กรุณาเข้าสู่ระบบใหม่')
      return
    }
    setSaving(true)
    const payload = {
      user_id: user.id,
      measured_at: date,
      weight_kg: weight ? toKg(Number(weight)) : null,
      body_fat_pct: bodyFat ? Number(bodyFat) : null,
      muscle_kg: muscle ? toKg(Number(muscle)) : null,
      waist_cm: waist ? Number(waist) : null,
      chest_cm: chest ? Number(chest) : null,
      hip_cm: hip ? Number(hip) : null,
      arm_cm: arm ? Number(arm) : null,
      thigh_cm: thigh ? Number(thigh) : null,
      body_fat_kg: bodyFatKg ? toKg(Number(bodyFatKg)) : null,
      body_water_kg: bodyWater ? toKg(Number(bodyWater)) : null,
      inorganic_salt_kg: inorganicSalt ? toKg(Number(inorganicSalt)) : null,
      protein_kg: protein ? toKg(Number(protein)) : null,
      bone_mass_kg: boneMass ? toKg(Number(boneMass)) : null,
      skeletal_muscle_kg: skeletalMuscle ? toKg(Number(skeletalMuscle)) : null,
      visceral_fat_grade: visceralFat ? Number(visceralFat) : null,
      bmr_kcal: bmr ? Number(bmr) : null,
      weight_range_low: weightRangeLow ? toKg(Number(weightRangeLow)) : null,
      weight_range_high: weightRangeHigh ? toKg(Number(weightRangeHigh)) : null,
      skeletal_muscle_range_low: skeletalRangeLow ? toKg(Number(skeletalRangeLow)) : null,
      skeletal_muscle_range_high: skeletalRangeHigh ? toKg(Number(skeletalRangeHigh)) : null,
      fat_mass_range_low: fatMassRangeLow ? toKg(Number(fatMassRangeLow)) : null,
      fat_mass_range_high: fatMassRangeHigh ? toKg(Number(fatMassRangeHigh)) : null,
      muscle_range_low: muscleRangeLow ? toKg(Number(muscleRangeLow)) : null,
      muscle_range_high: muscleRangeHigh ? toKg(Number(muscleRangeHigh)) : null,
      body_age_years: bodyAge ? Number(bodyAge) : null,
      body_age_range_low: bodyAgeRangeLow ? Number(bodyAgeRangeLow) : null,
      body_age_range_high: bodyAgeRangeHigh ? Number(bodyAgeRangeHigh) : null,
      body_water_range_low: bodyWaterRangeLow ? toKg(Number(bodyWaterRangeLow)) : null,
      body_water_range_high: bodyWaterRangeHigh ? toKg(Number(bodyWaterRangeHigh)) : null,
      inorganic_salt_range_low: saltRangeLow ? toKg(Number(saltRangeLow)) : null,
      inorganic_salt_range_high: saltRangeHigh ? toKg(Number(saltRangeHigh)) : null,
      protein_range_low: proteinRangeLow ? toKg(Number(proteinRangeLow)) : null,
      protein_range_high: proteinRangeHigh ? toKg(Number(proteinRangeHigh)) : null,
      bone_mass_range_low: boneMassRangeLow ? toKg(Number(boneMassRangeLow)) : null,
      bone_mass_range_high: boneMassRangeHigh ? toKg(Number(boneMassRangeHigh)) : null,
    }
    const { data, error } = await supabase.from('body_metrics').insert(payload).select().single()
    setSaving(false)
    if (error || !data) {
      setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
      return
    }
    onSaved(data as BodyMetric)
    setWeight('')
    setBodyFat('')
    setMuscle('')
    setWaist('')
    setChest('')
    setHip('')
    setArm('')
    setThigh('')
    setBodyFatKg('')
    setBodyWater('')
    setInorganicSalt('')
    setProtein('')
    setBoneMass('')
    setSkeletalMuscle('')
    setVisceralFat('')
    setBmr('')
    setWeightRangeLow('')
    setWeightRangeHigh('')
    setSkeletalRangeLow('')
    setSkeletalRangeHigh('')
    setFatMassRangeLow('')
    setFatMassRangeHigh('')
    setMuscleRangeLow('')
    setMuscleRangeHigh('')
    setBodyAge('')
    setBodyAgeRangeLow('')
    setBodyAgeRangeHigh('')
    setBodyWaterRangeLow('')
    setBodyWaterRangeHigh('')
    setSaltRangeLow('')
    setSaltRangeHigh('')
    setProteinRangeLow('')
    setProteinRangeHigh('')
    setBoneMassRangeLow('')
    setBoneMassRangeHigh('')
  }

  return (
    <PremiumCard as="form" id="metric-form" onSubmit={handleSubmit} className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm tracked uppercase text-muted">บันทึกวัดผลใหม่</h2>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-transparent text-muted text-xs font-mono outline-none border-b border-transparent focus:border-line"
        />
      </div>

      <ImportBodyReportPhoto onExtracted={handleExtracted} />
      {heightNote && <p className="text-[12px] text-muted -mt-1">{heightNote}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <LabeledInput label="ส่วนสูง (ซม.)" value={heightCm} onChange={setHeightCm} onBlur={handleHeightBlur} />
        <LabeledInput label="อายุ (ปี)" value={ageInput} onChange={setAgeInput} onBlur={handleAgeBlur} />
        <LabeledInput label={`น้ำหนัก (${unit})`} value={weight} onChange={setWeight} />
        <LabeledInput label="Body Fat (%)" value={bodyFat} onChange={setBodyFat} />
        <LabeledInput label={`Muscle (${unit})`} value={muscle} onChange={setMuscle} />
        <LabeledInput label="เอว (ซม.)" value={waist} onChange={setWaist} />
        <LabeledInput label="อก (ซม.)" value={chest} onChange={setChest} />
        <LabeledInput label="สะโพก (ซม.)" value={hip} onChange={setHip} />
        <LabeledInput label="ต้นแขน (ซม.)" value={arm} onChange={setArm} />
        <LabeledInput label="ต้นขา (ซม.)" value={thigh} onChange={setThigh} />
        <LabeledInput label={`มวลไขมัน (${unit})`} value={bodyFatKg} onChange={setBodyFatKg} />
        <LabeledInput label={`น้ำในร่างกาย (${unit})`} value={bodyWater} onChange={setBodyWater} />
        <LabeledInput label={`เกลือแร่ (${unit})`} value={inorganicSalt} onChange={setInorganicSalt} />
        <LabeledInput label={`โปรตีน (${unit})`} value={protein} onChange={setProtein} />
        <LabeledInput label={`มวลกระดูก (${unit})`} value={boneMass} onChange={setBoneMass} />
        <LabeledInput label={`กล้ามเนื้อโครงร่าง (${unit})`} value={skeletalMuscle} onChange={setSkeletalMuscle} />
        <LabeledInput label="ไขมันช่องท้อง (ระดับ)" value={visceralFat} onChange={setVisceralFat} />
        <LabeledInput label="BMR (kcal)" value={bmr} onChange={setBmr} />
        <LabeledInput label="อายุร่างกาย (ปี)" value={bodyAge} onChange={setBodyAge} />
      </div>

      <div className="border-t border-line pt-3">
        <button
          type="button"
          onClick={() => setShowRanges((v) => !v)}
          className="text-[12px] text-steel underline"
        >
          {showRanges ? 'ซ่อนช่วงมาตรฐาน' : '+ กรอกช่วงมาตรฐาน (สำหรับกราฟ Muscle Fat Analysis)'}
        </button>
        {showRanges && (
          <div className="mt-3 space-y-3">
            <p className="text-[12px] text-muted">
              คัดลอกจากตาราง &quot;Muscle fat analysis&quot; ในรายงานเครื่องชั่ง (Low–High) — กรอกครั้งแรกครั้งเดียวก็พอ ใช้ค่าล่าสุดที่เคยกรอกไว้ต่อได้เรื่อยๆ
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <LabeledInput label={`น้ำหนัก ต่ำสุด (${unit})`} value={weightRangeLow} onChange={setWeightRangeLow} />
              <LabeledInput label={`น้ำหนัก สูงสุด (${unit})`} value={weightRangeHigh} onChange={setWeightRangeHigh} />
              <LabeledInput label={`กล้ามเนื้อโครงร่าง ต่ำสุด (${unit})`} value={skeletalRangeLow} onChange={setSkeletalRangeLow} />
              <LabeledInput label={`กล้ามเนื้อโครงร่าง สูงสุด (${unit})`} value={skeletalRangeHigh} onChange={setSkeletalRangeHigh} />
              <LabeledInput label={`มวลไขมัน ต่ำสุด (${unit})`} value={fatMassRangeLow} onChange={setFatMassRangeLow} />
              <LabeledInput label={`มวลไขมัน สูงสุด (${unit})`} value={fatMassRangeHigh} onChange={setFatMassRangeHigh} />
              <LabeledInput label={`มวลกล้ามเนื้อ ต่ำสุด (${unit})`} value={muscleRangeLow} onChange={setMuscleRangeLow} />
              <LabeledInput label={`มวลกล้ามเนื้อ สูงสุด (${unit})`} value={muscleRangeHigh} onChange={setMuscleRangeHigh} />
              <LabeledInput label="อายุร่างกาย ต่ำสุด (ปี)" value={bodyAgeRangeLow} onChange={setBodyAgeRangeLow} />
              <LabeledInput label="อายุร่างกาย สูงสุด (ปี)" value={bodyAgeRangeHigh} onChange={setBodyAgeRangeHigh} />
              <LabeledInput label={`น้ำในร่างกาย ต่ำสุด (${unit})`} value={bodyWaterRangeLow} onChange={setBodyWaterRangeLow} />
              <LabeledInput label={`น้ำในร่างกาย สูงสุด (${unit})`} value={bodyWaterRangeHigh} onChange={setBodyWaterRangeHigh} />
              <LabeledInput label={`เกลือแร่ ต่ำสุด (${unit})`} value={saltRangeLow} onChange={setSaltRangeLow} />
              <LabeledInput label={`เกลือแร่ สูงสุด (${unit})`} value={saltRangeHigh} onChange={setSaltRangeHigh} />
              <LabeledInput label={`โปรตีน ต่ำสุด (${unit})`} value={proteinRangeLow} onChange={setProteinRangeLow} />
              <LabeledInput label={`โปรตีน สูงสุด (${unit})`} value={proteinRangeHigh} onChange={setProteinRangeHigh} />
              <LabeledInput label={`มวลกระดูก ต่ำสุด (${unit})`} value={boneMassRangeLow} onChange={setBoneMassRangeLow} />
              <LabeledInput label={`มวลกระดูก สูงสุด (${unit})`} value={boneMassRangeHigh} onChange={setBoneMassRangeHigh} />
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-rusttext">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-lg font-display tracked uppercase py-3 text-sm bg-amber text-bg transition active:scale-[0.99] hover:opacity-90 disabled:opacity-50 disabled:active:scale-100"
      >
        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </PremiumCard>
  )
}

function BmrEstimateCard({ profile, weightKg }: { profile: Profile | null; weightKg: number | null }) {
  const [activity, setActivity] = useState<ActivityLevel>('moderate')

  if (!profile?.age || !profile?.height_cm || !profile?.sex || !weightKg) {
    return (
      <PremiumCard className="px-4 py-3.5">
        <h2 className="font-display text-sm tracked uppercase text-muted mb-1">BMR/TDEE โดยประมาณ</h2>
        <p className="text-[12px] text-muted">
          กรอกอายุ, ส่วนสูง, เพศ และน้ำหนักล่าสุดให้ครบ (แท็บ &quot;บันทึกข้อมูล&quot;) เพื่อประมาณอัตราการเผาผลาญพื้นฐาน
        </p>
      </PremiumCard>
    )
  }

  const bmr = computeBmr(weightKg, profile.height_cm, profile.age, profile.sex)
  const tdee = computeTdee(bmr, activity)

  return (
    <PremiumCard className="px-4 py-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm tracked uppercase text-muted">BMR/TDEE โดยประมาณ</h2>
        <span className="text-[12px] text-muted">สูตร Mifflin-St Jeor</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[12px] tracked uppercase text-muted">BMR</p>
          <p className="font-mono text-xl text-ink">
            {bmr}
            <span className="text-xs text-muted ml-1">kcal</span>
          </p>
        </div>
        <div>
          <p className="text-[12px] tracked uppercase text-muted">TDEE</p>
          <p className="font-mono text-xl text-amber">
            {tdee}
            <span className="text-xs text-muted ml-1">kcal</span>
          </p>
        </div>
      </div>
      <label className="block">
        <span className="block text-[12px] tracked uppercase text-muted mb-1">ระดับกิจกรรม</span>
        <select
          value={activity}
          onChange={(e) => setActivity(e.target.value as ActivityLevel)}
          className="w-full bg-surface2 text-ink text-xs rounded px-2 py-2 border border-line outline-none focus:border-amber"
        >
          {(Object.keys(ACTIVITY_MULTIPLIERS) as ActivityLevel[]).map((level) => (
            <option key={level} value={level}>
              {ACTIVITY_LEVEL_LABELS[level]}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[12px] text-muted/70">
        * เป็นค่าประมาณจากสูตรทั่วไป ไม่ใช่ค่าที่วัดจริง ถ้ามีค่า BMR จากรายงานเครื่องชั่งจะใช้ค่านั้นแทนอัตโนมัติ (แม่นกว่า)
      </p>
    </PremiumCard>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
}) {
  return (
    <div>
      <label className="block text-[12px] tracked uppercase text-muted mb-1">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="input font-mono text-center text-sm py-2"
      />
    </div>
  )
}

function PhotosTab({
  photos,
  onChanged,
}: {
  photos: (ProgressPhoto & { url?: string })[]
  onChanged: () => void
}) {
  const supabase = createClient()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [beforeId, setBeforeId] = useState('')
  const [afterId, setAfterId] = useState('')

  // ฟีดแบ็ก "แนะนำ Before/After Slider — ให้เลือกรูปแรก vs รูปล่าสุดเป็นค่าเริ่มต้น ไม่กรองตามมุมถ่าย"
  // — photos เรียง taken_at desc มาแล้ว (ใหม่สุดก่อน) จาก query ด้านบน: [0] = ล่าสุด, ตัวท้าย = แรกสุด
  // ตั้งค่าเริ่มต้นให้อัตโนมัติทันทีที่มีรูป >= 2 (ยังเลือกเองผ่าน dropdown ทับได้ตามเดิม) และรีเซ็ตถ้ารูป
  // ที่เคยเลือกไว้ถูกลบไปแล้ว (id ไม่อยู่ใน photos อีกต่อไป)
  useEffect(() => {
    if (photos.length < 2) return
    const oldest = photos[photos.length - 1]
    const newest = photos[0]
    if (!beforeId || !photos.some((p) => p.id === beforeId)) setBeforeId(oldest.id)
    if (!afterId || !photos.some((p) => p.id === afterId)) setAfterId(newest.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('กรุณาเข้าสู่ระบบใหม่')
      setUploading(false)
      return
    }
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('progress-photos').upload(path, file)
    if (uploadError) {
      setError('อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง')
      setUploading(false)
      return
    }
    const { error: insertError } = await supabase.from('progress_photos').insert({
      user_id: user.id,
      taken_at: todayStr(),
      storage_path: path,
      label: label || null,
    })
    setUploading(false)
    if (insertError) {
      setError('บันทึกข้อมูลรูปไม่สำเร็จ')
      return
    }
    setLabel('')
    e.target.value = ''
    onChanged()
  }

  async function handleDelete(photo: ProgressPhoto) {
    // บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจครอบใหม่): เดิมไม่เช็ค error ของทั้งสองคำสั่งเลย ต่างจาก handleUpload
    // ด้านบนในฟังก์ชันเดียวกันที่เช็ค insertError แล้วโชว์ error ให้เห็น — ถ้าลบพัง (RLS/เน็ตหลุด)
    // onChanged() ยังถูกเรียกเหมือนสำเร็จ (แค่ refetch state เดิมกลับมา ไม่ error ให้ผู้ใช้เห็นเลยว่าทำไม
    // รูปยังไม่หายไป) — เช็ค error ทั้งสองจุด ใช้ setError ตัวเดียวกับ handleUpload
    const { error: storageErr } = await supabase.storage.from('progress-photos').remove([photo.storage_path])
    const { error: dbErr } = await supabase.from('progress_photos').delete().eq('id', photo.id)
    if (storageErr || dbErr) {
      setError('ลบรูปไม่สำเร็จ ลองใหม่อีกครั้ง')
      return
    }
    onChanged()
  }

  const beforePhoto = photos.find((p) => p.id === beforeId)
  const afterPhoto = photos.find((p) => p.id === afterId)

  return (
    <div className="space-y-6">
      <PremiumCard className="p-4 space-y-3">
        <h2 className="font-display text-sm tracked uppercase text-muted">เพิ่มรูป</h2>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="ป้ายกำกับ เช่น หน้าตรง, ด้านข้าง"
          className="input"
        />
        <label className="block">
          <span className="w-full block text-center rounded-lg font-display tracked uppercase py-3 text-sm bg-rust text-ink cursor-pointer transition active:scale-[0.99] hover:opacity-90">
            {uploading ? 'กำลังอัปโหลด...' : 'เลือกรูปถ่าย'}
          </span>
          <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} className="hidden" />
        </label>
        {error && <p className="text-sm text-rusttext">{error}</p>}
      </PremiumCard>

      {photos.length >= 2 && (
        <section>
          <h2 className="font-display text-sm tracked uppercase text-muted mb-3">เปรียบเทียบ Before / After</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <select value={beforeId} onChange={(e) => setBeforeId(e.target.value)} className="input text-xs">
              <option value="">Before</option>
              {photos.map((p) => (
                <option key={p.id} value={p.id}>
                  {shortLabel(p.taken_at)} {p.label ? `· ${p.label}` : ''}
                </option>
              ))}
            </select>
            <select value={afterId} onChange={(e) => setAfterId(e.target.value)} className="input text-xs">
              <option value="">After</option>
              {photos.map((p) => (
                <option key={p.id} value={p.id}>
                  {shortLabel(p.taken_at)} {p.label ? `· ${p.label}` : ''}
                </option>
              ))}
            </select>
          </div>
          {/* ฟีดแบ็ก "Interactive Slider Bar เลื่อนซ้าย-ขวาเทียบรูป" — เดิมโชว์สองรูปข้างกันเฉยๆ
              เปลี่ยนเป็นซ้อนทับเฟรมเดียวกัน ลากเส้นแบ่งเพื่อเทียบ (ดู components/BeforeAfterSlider.tsx) */}
          {beforePhoto?.url && afterPhoto?.url && (
            <BeforeAfterSlider
              beforeUrl={beforePhoto.url}
              afterUrl={afterPhoto.url}
              beforeLabel={shortLabel(beforePhoto.taken_at)}
              afterLabel={shortLabel(afterPhoto.taken_at)}
            />
          )}
        </section>
      )}

      <section>
        <h2 className="font-display text-sm tracked uppercase text-muted mb-3">รูปทั้งหมด</h2>
        {photos.length === 0 ? (
          <PremiumCard className="text-sm text-muted px-4 py-6 text-center">
            ยังไม่มีรูป
          </PremiumCard>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative group">
                {p.url && (
                  <div className="relative w-full aspect-square rounded-lg border border-line overflow-hidden">
                    <Image src={p.url} alt={p.label ?? ''} fill sizes="150px" className="object-cover" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-bg/80 text-rusttext text-xs flex items-center justify-center transition hover:bg-bg active:scale-90"
                  aria-label="ลบรูป"
                >
                  ×
                </button>
                <p className="text-[12px] text-muted mt-1 truncate">{shortLabel(p.taken_at)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
