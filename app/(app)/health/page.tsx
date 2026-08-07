'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import type { BodyMetric, Goal, Profile, ProgressPhoto } from '@/lib/types'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import GoalRing from '@/components/GoalRing'
import InsightCard from '@/components/InsightCard'
import type { Insight } from '@/lib/dashboardStats'
import { zoneOf, classifyMetric, summarizeHealthScore, computeHealthTrendInsights, type Direction, type Zone } from '@/lib/healthInsights'
import { saveAge } from '@/lib/profile'
import { computeBmr, computeTdee, ACTIVITY_MULTIPLIERS, ACTIVITY_LEVEL_LABELS, type ActivityLevel } from '@/lib/bmr'
import PremiumCard from '@/components/ui/PremiumCard'
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
  const [tab, setTab] = useState<'overview' | 'trends' | 'log' | 'photos'>('overview')
  const [trendGroup, setTrendGroup] = useState<'comp' | 'measure'>('comp')
  const [trendMetric, setTrendMetric] = useState<number | 'all'>('all')
  const [trendPeriodDays, setTrendPeriodDays] = useState<7 | 30 | 90>(90)
  const [showAllMetrics, setShowAllMetrics] = useState(false)
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

  // ฟีดแบ็ก "Weight Card ใหญ่แต่ไม่มีข้อมูลพอ อยากได้ 30-day Mini Trend" — เฉพาะการ์ด Weight/Body Fat/
  // Muscle/Fat Mass (tier 1 ตัวชี้วัดหลัก 4 ตัว) เท่านั้นที่ยังโชว์เส้นเทรนด์ในแท็บภาพรวม ใช้หน้าต่าง 30 วัน
  // คงที่ (ไม่ผูกกับ trendPeriodDays ของแท็บ "แนวโน้ม" ซึ่งผู้ใช้ปรับเป็น 7/30/90 ได้ — อันนั้นคือคนละบริบท)
  // ให้ label "30 DAY TREND" ตรงกับข้อมูลจริงเสมอ ไม่ว่าผู้ใช้จะสลับช่วงเวลาในแท็บแนวโน้มไว้ที่เท่าไหร่
  const overview30dMetrics = useMemo(() => {
    const since = new Date()
    since.setDate(since.getDate() - 30)
    const offset = since.getTimezoneOffset()
    const sinceStr = new Date(since.getTime() - offset * 60000).toISOString().slice(0, 10)
    return metrics.filter((m) => m.measured_at >= sinceStr)
  }, [metrics])

  const weightTrend30 = useMemo(
    () => [...overview30dMetrics].filter((m) => m.weight_kg !== null).reverse().map((m) => toDisplay(m.weight_kg as number)),
    [overview30dMetrics, toDisplay]
  )
  const bodyFatTrend30 = useMemo(
    () => [...overview30dMetrics].filter((m) => m.body_fat_pct !== null).reverse().map((m) => m.body_fat_pct as number),
    [overview30dMetrics]
  )
  const muscleTrend30 = useMemo(
    () => [...overview30dMetrics].filter((m) => m.muscle_kg !== null).reverse().map((m) => toDisplay(m.muscle_kg as number)),
    [overview30dMetrics, toDisplay]
  )
  const bodyFatKgTrend30 = useMemo(
    () => [...overview30dMetrics].filter((m) => m.body_fat_kg !== null).reverse().map((m) => toDisplay(m.body_fat_kg as number)),
    [overview30dMetrics, toDisplay]
  )

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

  const muscleFatItems = useMemo(() => {
    const defs: { label: string; value: number | null; low: number | null; high: number | null }[] = [
      { label: 'Weight', value: latest?.weight_kg ?? null, low: latestNonNull('weight_range_low'), high: latestNonNull('weight_range_high') },
      {
        label: 'Skeletal Muscle',
        value: latest?.skeletal_muscle_kg ?? null,
        low: latestNonNull('skeletal_muscle_range_low'),
        high: latestNonNull('skeletal_muscle_range_high'),
      },
      { label: 'Fat Mass', value: latest?.body_fat_kg ?? null, low: latestNonNull('fat_mass_range_low'), high: latestNonNull('fat_mass_range_high') },
    ]
    return defs
      .filter((d) => d.value !== null && d.low !== null && d.high !== null && (d.high as number) > (d.low as number))
      .map((d) => ({
        label: d.label,
        value: toDisplay(d.value as number),
        low: toDisplay(d.low as number),
        high: toDisplay(d.high as number),
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

  // สรุปภาพรวม (วงแหวน + ดีมาก/มาตรฐาน/ควรปรับปรุง) — จำแนกตัวชี้วัดของแถวข้อมูลใดๆ เทียบกับช่วงมาตรฐาน
  // แยกเป็นฟังก์ชันเพื่อใช้ซ้ำได้ทั้งกับ "ค่าล่าสุดจริง" และ "ค่าเมื่อประมาณ 1 เดือนก่อน" (ดูคะแนนเปลี่ยนแปลงย้อนหลัง)
  function computeScoreItems(row: BodyMetric | null, rowBmi: number | null) {
    const items: { label: string; status: 'good' | 'standard' | 'needsWork' }[] = []
    if (row?.weight_kg != null && weightRangeLow !== null && weightRangeHigh !== null) {
      items.push({ label: 'น้ำหนัก', status: classifyMetric(zoneOf(row.weight_kg, weightRangeLow, weightRangeHigh), 'neutral') })
    }
    if (row?.body_fat_pct != null) {
      const bfRange = bodyFatPctRange(profile?.sex ?? null)
      items.push({ label: 'ไขมันในร่างกาย', status: classifyMetric(zoneOf(row.body_fat_pct, bfRange.low, bfRange.high), 'lowerBetter') })
    }
    if (row?.skeletal_muscle_kg != null && skeletalRangeLow !== null && skeletalRangeHigh !== null) {
      items.push({
        label: 'กล้ามเนื้อโครงร่าง',
        status: classifyMetric(zoneOf(row.skeletal_muscle_kg, skeletalRangeLow, skeletalRangeHigh), 'higherBetter'),
      })
    }
    if (row?.body_fat_kg != null && fatMassRangeLow !== null && fatMassRangeHigh !== null) {
      items.push({ label: 'มวลไขมัน', status: classifyMetric(zoneOf(row.body_fat_kg, fatMassRangeLow, fatMassRangeHigh), 'lowerBetter') })
    }
    if (rowBmi !== null) {
      items.push({ label: 'BMI', status: classifyMetric(zoneOf(rowBmi, 18.5, 25), 'neutral') })
    }
    if (row?.visceral_fat_grade != null) {
      items.push({ label: 'ไขมันช่องท้อง', status: classifyMetric(zoneOf(row.visceral_fat_grade, 1, 9), 'lowerBetter') })
    }
    if (row?.muscle_kg != null && muscleRangeLow !== null && muscleRangeHigh !== null) {
      items.push({ label: 'มวลกล้ามเนื้อ', status: classifyMetric(zoneOf(row.muscle_kg, muscleRangeLow, muscleRangeHigh), 'higherBetter') })
    }
    if (row?.body_age_years != null && bodyAgeRangeLow !== null && bodyAgeRangeHigh !== null) {
      items.push({ label: 'อายุร่างกาย', status: classifyMetric(zoneOf(row.body_age_years, bodyAgeRangeLow, bodyAgeRangeHigh), 'lowerBetter') })
    }
    if (row?.body_water_kg != null && row?.weight_kg != null) {
      const zone = bodyWaterPctZone(row.body_water_kg, row.weight_kg, profile?.sex ?? null)
      if (zone) items.push({ label: 'น้ำในร่างกาย', status: classifyMetric(zone, 'higherBetter') })
    }
    if (row?.inorganic_salt_kg != null && saltRangeLow !== null && saltRangeHigh !== null) {
      items.push({ label: 'เกลือแร่', status: classifyMetric(zoneOf(row.inorganic_salt_kg, saltRangeLow, saltRangeHigh), 'neutral') })
    }
    if (row?.protein_kg != null) {
      const lbm = lbmOf(row)
      const zone = lbm != null ? proteinPctZone(row.protein_kg, lbm, profile?.sex ?? null) : null
      if (zone) items.push({ label: 'โปรตีน', status: classifyMetric(zone, 'higherBetter') })
    }
    if (row?.bone_mass_kg != null && boneMassRangeLow !== null && boneMassRangeHigh !== null) {
      items.push({ label: 'มวลกระดูก', status: classifyMetric(zoneOf(row.bone_mass_kg, boneMassRangeLow, boneMassRangeHigh), 'neutral') })
    }
    return items
  }

  const healthScoreItems = useMemo(
    () => computeScoreItems(latest, bmi),
    [
      latest,
      bmi,
      profile?.sex,
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
      saltRangeLow,
      saltRangeHigh,
      boneMassRangeLow,
      boneMassRangeHigh,
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  )

  // แถวข้อมูลที่ใกล้เคียง "1 เดือนก่อน" มากที่สุด (ล่าสุดที่บันทึกไว้ ณ หรือก่อนวันนั้น) — ใช้เทียบคะแนนสุขภาพย้อนหลัง
  const oneMonthAgoMetric = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const offset = cutoff.getTimezoneOffset()
    const cutoffStr = new Date(cutoff.getTime() - offset * 60000).toISOString().slice(0, 10)
    return metrics.find((m) => m.measured_at <= cutoffStr && m.id !== latest?.id) ?? null
  }, [metrics, latest?.id])

  const previousBmiForScore = bmiOf(oneMonthAgoMetric?.weight_kg ?? null, profile?.height_cm ?? null)

  const healthScoreItemsPrevMonth = useMemo(
    () => (oneMonthAgoMetric ? computeScoreItems(oneMonthAgoMetric, previousBmiForScore) : []),
    [oneMonthAgoMetric, previousBmiForScore]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  )
  const healthScorePrevMonth = useMemo(() => summarizeHealthScore(healthScoreItemsPrevMonth), [healthScoreItemsPrevMonth])

  // ผลต่างคะแนนสุขภาพเทียบเดือนที่แล้ว เป็นเปอร์เซ็นต์แต้ม (กันกรณีจำนวนตัวชี้วัดที่มีข้อมูลในแต่ละช่วงไม่เท่ากัน)
  const healthScoreMonthDeltaPct =
    oneMonthAgoMetric && healthScorePrevMonth.total > 0 && healthScoreItems.length > 0
      ? Math.round((healthScoreItems.filter((i) => i.status !== 'needsWork').length / healthScoreItems.length) * 100) -
        Math.round((healthScorePrevMonth.score / healthScorePrevMonth.total) * 100)
      : null

  const healthScore = useMemo(() => summarizeHealthScore(healthScoreItems), [healthScoreItems])

  // เปอร์เซ็นต์ไทล์ของคะแนนวันนี้ เทียบกับ "ประวัติคะแนนของตัวเองย้อนหลัง" (ไม่ใช่เทียบกับผู้ใช้คนอื่น
  // เพราะแอปนี้ยังไม่มีข้อมูลรวมของผู้ใช้ทุกคนให้เทียบแบบนั้นได้จริง) ต้องมีประวัติอย่างน้อย 6 ครั้งถึงจะมีความหมาย
  const healthScorePercentile = useMemo(() => {
    const history = metrics
      .map((m) => {
        const items = computeScoreItems(m, bmiOf(m.weight_kg, profile?.height_cm ?? null))
        return items.length > 0 ? (items.filter((i) => i.status !== 'needsWork').length / items.length) * 100 : null
      })
      .filter((v): v is number => v !== null)
    if (history.length < 6 || healthScore.total === 0) return null
    const currentPct = (healthScore.score / healthScore.total) * 100
    const beatCount = history.filter((v) => v <= currentPct).length
    return Math.max(1, Math.min(100, Math.round((beatCount / history.length) * 100)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics, profile?.height_cm, healthScore])

  // Insight ที่คำนวณจากการเปลี่ยนแปลงจริงในช่วงเวลาที่เลือกดู (ไม่ใช่คำแนะนำทั่วไปที่ไม่มีข้อมูลรองรับ)
  const healthInsights: Insight[] = useMemo(() => {
    const firstLast = (data: { value: number }[]) => (data.length > 1 ? { first: data[0].value, last: data[data.length - 1].value } : undefined)
    return computeHealthTrendInsights({
      weight: firstLast(weightTrend),
      bodyFatPct: firstLast(bodyFatTrend),
      skeletalMuscle: firstLast(skeletalMuscleTrend),
      bodyFatKg: firstLast(bodyFatKgTrend),
      muscleMass: firstLast(muscleTrend),
      bodyAge: firstLast(bodyAgeTrend),
    })
  }, [weightTrend, bodyFatTrend, skeletalMuscleTrend, bodyFatKgTrend, muscleTrend, bodyAgeTrend])

  function goalCurrentValue(goal: Goal): number | null {
    if (goal.goal_type === 'weight') return latest?.weight_kg ?? null
    if (goal.goal_type === 'body_fat') return latest?.body_fat_pct ?? null
    return null
  }

  // ทิศทางที่ "ดีขึ้น" ของน้ำหนัก/BMI อ้างอิงจากเป้าหมายน้ำหนักที่ตั้งไว้ (ถ้ามี): ถ้าเป้าหมายต่ำกว่าจุดเริ่มต้นคือลดน้ำหนัก, สูงกว่าคือเพิ่มน้ำหนัก
  // ถ้ายังไม่ได้ตั้งเป้าหมาย ใช้ค่าเริ่มต้นเป็น "ลดน้ำหนักคือดีขึ้น" ซึ่งเป็นกรณีที่พบบ่อยที่สุด
  const weightGoal = goals.find((g) => g.goal_type === 'weight' && g.status === 'active')
  const weightDirection: Direction =
    weightGoal && weightGoal.target_value !== null && weightGoal.starting_value !== null
      ? weightGoal.target_value < weightGoal.starting_value
        ? 'lowerBetter'
        : weightGoal.target_value > weightGoal.starting_value
          ? 'higherBetter'
          : 'neutral'
      : 'lowerBetter'

  function goalProgressPct(goal: Goal): number | null {
    const current = goalCurrentValue(goal)
    if (current === null || goal.target_value === null) return null
    const start = goal.starting_value ?? current
    if (goal.target_value === start) return current >= goal.target_value ? 100 : 0
    return Math.min(100, Math.max(0, ((current - start) / (goal.target_value - start)) * 100))
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
  const weightCardDirection: Direction = weightGainLooksLikeMuscle ? 'neutral' : weightDirection
  // ฟีดแบ็ก "BMI ↑0.3 เป็นจุดเดียวที่ดูผิดทิศ — BMI 23.5 ยังอยู่ในช่วงปกติ ถ้าไขมันลด/กล้ามเพิ่มพร้อมกัน
  // การขึ้นของ BMI ไม่ควรตัดสินเป็นสีแดง" — BMI ขยับตามน้ำหนักโดยตรง จึงใช้เงื่อนไขเดียวกับการ์ดน้ำหนักได้เลย
  // ไม่ต้องคำนวณแยก
  const bmiCardDirection: Direction = weightGainLooksLikeMuscle ? 'neutral' : weightDirection

  // ฟีดแบ็ก "ข้อความอธิบายดีมากแล้ว แต่ปรับให้ Premium ขึ้นอีกนิด" — เปลี่ยนจากวลีสั้นห้วนๆ เป็นประโยคสมบูรณ์
  const weightInsight = weightGainLooksLikeMuscle
    ? 'น้ำหนักเพิ่มจากมวลกล้ามเนื้อเป็นหลัก'
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
  const bodyFatInsight =
    bodyFatDeltaForCard === null
      ? null
      : Math.abs(bodyFatDeltaForCard) < 0.3
        ? 'อยู่ในช่วงผันผวนปกติ'
        : bodyFatDeltaForCard < 0
          ? 'ไขมันลดลงต่อเนื่อง ทำได้ดี'
          : 'ไขมันเพิ่มขึ้น ลองเพิ่มคาร์ดิโอ'

  // ฟีดแบ็ก "Health Score 90% ต้องสัมพันธ์กับข้อมูลด้านล่าง — อยากให้กด Score แล้วเห็น Breakdown เป็นหมวด
  // (Body Composition/Metabolic Health/Muscle/Hydration/Trend) พร้อมคะแนนย่อย" — 4 หมวดแรกรวมจาก
  // healthScoreItems ที่มีอยู่แล้ว (จัดหมวดตาม label ใน OverviewHealthScoreHeader) ส่วน "Trend" คำนวณแยก
  // ที่นี่ เพราะเป็นคนละมิติ (ทิศทางการเปลี่ยนแปลงล่าสุด ไม่ใช่ตำแหน่งเทียบช่วงมาตรฐาน ณ ปัจจุบัน) — สัดส่วน
  // ตัวชี้วัดที่ "ขยับไปทางที่ดี" เทียบกับค่าก่อนหน้า จากตัวชี้วัดหลักที่มีทิศทางชัดเจน (ไม่รวม neutral)
  const trendScoreDefs: { field: keyof BodyMetric; direction: Direction; toDisplayFn?: (v: number) => number }[] = [
    { field: 'weight_kg', direction: weightDirection, toDisplayFn: toDisplay },
    { field: 'body_fat_pct', direction: 'lowerBetter' },
    { field: 'muscle_kg', direction: 'higherBetter', toDisplayFn: toDisplay },
    { field: 'body_fat_kg', direction: 'lowerBetter', toDisplayFn: toDisplay },
    { field: 'skeletal_muscle_kg', direction: 'higherBetter', toDisplayFn: toDisplay },
    { field: 'body_age_years', direction: 'lowerBetter' },
    { field: 'visceral_fat_grade', direction: 'lowerBetter' },
  ]
  const trackedTrends = trendScoreDefs
    .map((d) => ({ delta: fieldDelta(d.field, d.toDisplayFn), direction: d.direction }))
    .filter((d): d is { delta: number; direction: Direction } => d.delta !== null && d.direction !== 'neutral')
  const trendScorePct =
    trackedTrends.length === 0
      ? null
      : Math.round((trackedTrends.filter((d) => (d.direction === 'higherBetter' ? d.delta > 0 : d.delta < 0)).length / trackedTrends.length) * 100)

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

  // ฟีดแบ็ก "เป้าหมายควรเป็นข้อมูลที่ actionable — แทนที่จะเขียนแค่ 65.0 kg / น้ำหนักเป้าหมาย อยากได้
  // 65.0 kg / เป้าหมาย · เหลือ 1.3 kg ผู้ใช้เห็นแล้วรู้ทันทีว่าต้องไปทางไหน"
  // v17: ฟีดแบ็ก "แสดง 2 เป้าหมายพร้อมกัน (น้ำหนัก + Body Fat) ไม่ใช่แค่ตัวเดียวแบบ fallback — ข้อมูลใน
  // FITLOG มีทั้งน้ำหนัก/Body Fat/Muscle Mass เป้าหมายจึงควรสะท้อนองค์ประกอบร่างกาย ไม่ใช่แค่น้ำหนักอย่างเดียว
  // ผู้ใช้จะได้เข้าใจทันทีว่ากำลังลดไขมันโดยพยายามรักษากล้ามเนื้อ ไม่ใช่แค่ 'น้ำหนักต้องลง X kg'" — เดิม
  // weight เป็นตัวหลัก, body fat เป็นแค่ fallback ตอนไม่มีเป้าหมายน้ำหนัก — เปลี่ยนเป็น array แสดงทั้งคู่พร้อม
  // กันถ้ามีทั้งสองเป้าหมายที่ active อยู่ (ยังคงเรียงน้ำหนักก่อน เพราะเป็น primary metric ของหน้านี้)
  const bodyFatGoalForBanner = goals.find((g) => g.goal_type === 'body_fat' && g.status === 'active')
  const goalRows: { valueText: string; label: string; subText: string | null }[] = []
  if (weightGoal?.target_value != null) {
    goalRows.push({
      valueText: `${toDisplay(weightGoal.target_value).toFixed(1)} ${unit}`,
      label: 'น้ำหนักเป้าหมาย',
      subText:
        latest?.weight_kg != null
          ? `เหลือ ${Math.abs(toDisplay(latest.weight_kg) - toDisplay(weightGoal.target_value)).toFixed(1)} ${unit}`
          : null,
    })
  }
  if (bodyFatGoalForBanner?.target_value != null) {
    const bodyFatDiff = latest?.body_fat_pct != null ? latest.body_fat_pct - bodyFatGoalForBanner.target_value : null
    goalRows.push({
      valueText: `${bodyFatGoalForBanner.target_value.toFixed(1)}%`,
      label: 'Body Fat เป้าหมาย',
      subText:
        bodyFatDiff === null || bodyFatDiff === 0
          ? null
          : bodyFatDiff > 0
            ? `ลดอีก ${bodyFatDiff.toFixed(1)}%`
            : `เพิ่มอีก ${Math.abs(bodyFatDiff).toFixed(1)}%`,
    })
  }

  // ฟีดแบ็ก "ล่าสุด อยากได้วันที่ + เวลา (4 ส.ค. 2569 / 09:15 น.) ไม่ใช่แค่วันที่เฉยๆ" — created_at คือเวลา
  // จริงตอนบันทึกแถว (ต่างจาก measured_at ซึ่งเป็นแค่วันที่ผู้ใช้เลือกเอง ไม่มีเวลา อาจย้อนหลังได้)
  const latestDateTime = latest?.created_at ? formatDateTimeTH(latest.created_at) : null

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
            className="flex items-center gap-1.5 text-[11px] font-display tracked uppercase text-muted border border-line rounded-full px-3 py-2 active:scale-[0.99] transition"
          >
            <ShareIcon />
            แชร์รายงาน
          </button>
          {latest?.measured_at && (
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-muted border border-line rounded-full px-3 py-2 whitespace-nowrap">
              <CalendarIcon />
              {shortLabel(latest.measured_at)}
            </span>
          )}
        </div>
      </div>

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
            className={`flex-1 py-2.5 rounded-full text-[11px] sm:text-sm font-display tracked uppercase transition ${
              tab === t.key ? (t.key === 'photos' ? 'bg-rust text-ink' : 'bg-steel text-bg') : 'text-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        // ฟีดแบ็ก "OBESITY ANALYSIS / MUSCLE & FAT ANALYSIS ถูกดันลงจนแทบไม่เห็นในจอ 1892x1002 — อยากให้
        // Summary + จุดเริ่มของ Analysis อยู่ใน viewport เดียว" — ลด space-y-6 (24px) เหลือ space-y-5 (20px)
        // ทั้งแท็บ ร่วมกับลด padding/gap ของการ์ดใน grid ด้านล่าง (ดูคอมเมนต์ตรงนั้น) แทนการตัดเนื้อหาออก
        <div className="space-y-5">
          <OverviewHealthScoreHeader
            score={healthScore}
            items={healthScoreItems}
            monthDeltaPct={healthScoreMonthDeltaPct}
            bodyFatDeltaPct={fieldDelta('body_fat_pct')}
            muscleMassDelta={fieldDelta('muscle_kg', toDisplay)}
            goalRows={goalRows}
            updatedDateLabel={latestDateTime?.date ?? null}
            updatedTimeLabel={latestDateTime?.time ?? null}
            trendScorePct={trendScorePct}
            unit={unit}
            summary={bodyCompositionSummary}
          />
          {profile && !profile.sex && (
            <SexPrompt profile={profile} onSaved={(p) => setProfile(p)} />
          )}
          {/* v3: ฟีดแบ็ก "Card ไม่มีระดับความสำคัญ" — เรียงลำดับตามความสำคัญจริง
              v6: ฟีดแบ็ก "ผมจะให้ความสำคัญของข้อมูลแบบนี้ — ระดับ 1 (ต้องรู้ทันที): น้ำหนัก/ไขมันในร่างกาย/
              กล้ามเนื้อ, ระดับ 2 (ติดตาม): BMI/น้ำในร่างกาย/มวลไขมัน/กล้ามเนื้อโครงร่าง, ระดับ 3 (ประกอบ):
              โปรตีน/ไขมันช่องท้อง/อายุร่างกาย/BMR/มวลกระดูก" — ปรับ tier ให้ตรงตามนี้ (BMI ย้ายจาก tier 1
              ไป 2, โปรตีน/ไขมันช่องท้อง ย้ายจาก tier 2 ไป 3) แทนเดิมที่กลุ่ม 2 กับ 3 ไม่ตรงกับที่ขอรอบนี้ */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 md:grid-flow-row-dense gap-2.5 items-stretch">
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
              series={weightTrend30}
              trendLabel="30 DAY TREND"
              trendTag={weightGainLooksLikeMuscle ? 'Muscle-driven ↑' : null}
              trendColor="#9498A0"
              trendEndpointColor="#8CB264"
              lastMeasuredLabel={latest?.measured_at ? shortLabel(latest.measured_at) : null}
              periodCaption={weightPeriodCaption}
              insight={weightInsight}
              primary
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
              deltaUnit="%"
              direction="lowerBetter"
              zone={bodyFatZone}
              zoneScheme="lowerOk"
              series={bodyFatTrend30}
              insight={bodyFatInsight}
            />
            <IconStatCard
              label="มวลกล้ามเนื้อ"
              subLabel="MUSCLE MASS"
              icon="muscle"
              imageKey="muscleMass"
              color="#5FA88C"
              value={latest?.muscle_kg != null ? toDisplay(latest.muscle_kg) : null}
              unit={unit}
              delta={fieldDelta('muscle_kg', toDisplay)}
              deltaUnit={unit}
              direction="higherBetter"
              series={muscleTrend30}
            />
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
              tier={2}
              forceZonePill
            />
            <IconStatCard
              // ฟีดแบ็ก "Protein 10.3 kg อาจทำให้เข้าใจผิดว่าเป็นปริมาณโปรตีนที่กินวันนี้ — ควรระบุให้ชัดว่า
              // เป็นมวลโปรตีนในร่างกาย" — เปลี่ยนทั้ง label ไทย/subLabel อังกฤษให้ชัดเจนขึ้น ไม่กระทบ field
              // ข้อมูลเดิม (protein_kg) หรือ logic การคำนวณ zone ใดๆ
              label="โปรตีนในร่างกาย"
              subLabel="BODY PROTEIN"
              icon="protein"
              imageKey="protein"
              color="#5FA8A0"
              value={latest?.protein_kg != null ? toDisplay(latest.protein_kg) : null}
              unit={unit}
              delta={fieldDelta('protein_kg', toDisplay)}
              deltaUnit={unit}
              direction="neutral"
              zone={
                latest?.protein_kg != null && latestLbm != null
                  ? proteinPctZone(latest.protein_kg, latestLbm, profile?.sex ?? null)
                  : null
              }
              zoneScheme="higherOk"
              tier={3}
            />
            <IconStatCard
              label="ไขมันช่องท้อง"
              subLabel="VISCERAL FAT"
              icon="fat"
              imageKey="visceralFat"
              color="#CF9A3D"
              value={latest?.visceral_fat_grade ?? null}
              unit="ระดับ"
              decimals={0}
              delta={fieldDelta('visceral_fat_grade')}
              deltaUnit="ระดับ"
              direction="lowerBetter"
              zone={latest?.visceral_fat_grade != null ? (latest.visceral_fat_grade <= 9 ? 'Standard' : 'High') : null}
              zoneScheme="symmetric"
              tier={2}
            />
            <IconStatCard
              label="มวลไขมัน"
              subLabel="FAT MASS"
              icon="fat"
              imageKey="fatMass"
              color="#C1503A"
              value={latest?.body_fat_kg != null ? toDisplay(latest.body_fat_kg) : null}
              unit={unit}
              delta={fieldDelta('body_fat_kg', toDisplay)}
              deltaUnit={unit}
              direction="lowerBetter"
              series={bodyFatKgTrend30}
              tier={2}
            />
            <IconStatCard
              label="กล้ามเนื้อโครงร่าง"
              subLabel="SKELETAL MUSCLE"
              icon="muscle"
              imageKey="skeletalMuscle"
              color="#7FA85F"
              value={latest?.skeletal_muscle_kg != null ? toDisplay(latest.skeletal_muscle_kg) : null}
              unit={unit}
              delta={fieldDelta('skeletal_muscle_kg', toDisplay)}
              deltaUnit={unit}
              direction="higherBetter"
              tier={2}
            />
            <IconStatCard
              label="มวลกระดูก"
              subLabel="BONE MASS"
              icon="bone"
              imageKey="boneMass"
              color="#B08968"
              value={latest?.bone_mass_kg != null ? toDisplay(latest.bone_mass_kg) : null}
              unit={unit}
              delta={fieldDelta('bone_mass_kg', toDisplay)}
              deltaUnit={unit}
              direction="neutral"
              tier={3}
            />
            <IconStatCard
              label="อายุร่างกาย"
              subLabel="BODY AGE"
              icon="heart"
              imageKey="bodyAge"
              color="#CF715F"
              value={latest?.body_age_years ?? null}
              unit="ปี"
              decimals={0}
              delta={fieldDelta('body_age_years')}
              deltaUnit="ปี"
              direction="lowerBetter"
              tier={3}
              infoText="ค่าเปรียบเทียบองค์ประกอบร่างกายกับค่าเฉลี่ยตามอายุ ไม่ใช่อายุจริงของร่างกาย"
            />
            <IconStatCard
              label="อัตราการเผาผลาญ"
              subLabel="BMR"
              icon="fire"
              imageKey="bmr"
              color="#5FA85F"
              value={latest?.bmr_kcal ?? null}
              unit="kcal"
              decimals={0}
              delta={null}
              direction="neutral"
              tier={3}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-4 items-start">
            {(bmi !== null || latest?.body_fat_pct != null) && (
              <ObesityAnalysisChart bmi={bmi} bodyFatPct={latest?.body_fat_pct ?? null} sex={profile?.sex ?? null} />
            )}

            {muscleFatItems.length > 0 ? (
              <MuscleFatAnalysisChart items={muscleFatItems} unit={unit} />
            ) : (
              <PremiumCard className="text-[11px] text-muted px-4 py-3">
                อยากดูกราฟ Muscle Fat Analysis (น้ำหนัก/กล้ามเนื้อโครงร่าง/มวลไขมัน เทียบช่วงมาตรฐาน) — กรอกช่วงมาตรฐานจากรายงานเครื่องชั่งในฟอร์มด้านล่าง (ช่อง &quot;ช่วงมาตรฐาน&quot;) สักครั้ง แล้วกราฟจะขึ้นให้อัตโนมัติ
              </PremiumCard>
            )}
          </div>

          {/* BMR ที่วัดจากเครื่องชั่งจริง (latest.bmr_kcal, การ์ด IconStatCard ด้านบน) แม่นกว่าค่าประมาณ
              จากสูตรเสมอ — โชว์การ์ดนี้เฉพาะตอนยังไม่มีค่าจากเครื่องชั่ง กันข้อมูลสองชุดขัดกันจนงง */}
          {!latest?.bmr_kcal && <BmrEstimateCard profile={profile} weightKg={latest?.weight_kg ?? null} />}

          {healthInsights.length > 0 && (
            <PremiumCard className="p-4">
              <h2 className="flex items-center gap-2 font-display text-sm tracked uppercase text-ink mb-3">
                Insight &amp; Recommendation
                <span className="text-muted">
                  <InfoIcon />
                </span>
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {healthInsights.slice(0, 4).map((insight) => (
                  <InsightCard key={insight.id} insight={insight} imageSrc={INSIGHT_ICON_IMAGES[`${insight.id}|${insight.icon}`]} />
                ))}
              </div>
              {healthInsights.length > 4 && (
                <button
                  type="button"
                  onClick={() => setTab('trends')}
                  className="mt-3 w-full text-center text-[11px] font-display tracked uppercase text-bg bg-amber rounded-lg py-2 transition active:scale-[0.99] hover:opacity-90"
                >
                  ดูคำแนะนำเพิ่มเติม
                </button>
              )}
            </PremiumCard>
          )}
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
                className={`px-3 py-2 rounded-full text-[11px] font-display tracked uppercase transition ${
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
                className={`px-3 py-2 rounded-full text-[11px] font-display tracked uppercase transition ${
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
                  className={`px-3 py-1.5 rounded-full text-[11px] font-display tracked uppercase transition ${
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
                        className="w-full flex items-center justify-center gap-1.5 text-[11px] font-display tracked uppercase text-muted border border-line rounded-lg py-2.5 active:scale-[0.99] transition"
                      >
                        {showAllMetrics ? 'แสดงน้อยลง' : 'ดูตัวชี้วัดเพิ่มเติม'}
                        <span className={`transition-transform ${showAllMetrics ? '-rotate-90' : 'rotate-90'}`}>
                          <ChevronRightIcon />
                        </span>
                      </button>
                    )}
                  </div>
                ) : (
                  <PremiumCard className="text-[11px] text-muted px-4 py-3">
                    ยังไม่มีข้อมูลพอสำหรับดูแนวโน้มในหมวดนี้ — บันทึกข้อมูลอย่างน้อย 2 ครั้งก่อน แล้วกราฟจะขึ้นให้อัตโนมัติ
                  </PremiumCard>
                )
              ) : selectedTrend && selectedTrend.data.length > 1 ? (
                <MetricRowCard trend={selectedTrend} periodLabel={`${trendPeriodDays} วัน`} />
              ) : (
                <PremiumCard className="text-[11px] text-muted px-4 py-3">
                  ยังไม่มีข้อมูลพอสำหรับดูแนวโน้มในหมวดนี้ — บันทึกข้อมูลอย่างน้อย 2 ครั้งก่อน แล้วกราฟจะขึ้นให้อัตโนมัติ
                </PremiumCard>
              )}

              {trendGroup === 'comp' && <ForecastCard metrics={metrics} toDisplay={toDisplay} unit={unit} />}
            </div>

            <div className="space-y-4">
              <HealthScoreCard score={healthScore} monthDeltaPct={healthScoreMonthDeltaPct} selfPercentile={healthScorePercentile} />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm tracked uppercase text-muted flex items-center gap-1.5">
                    Insight &amp; วิเคราะห์
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
                  <PremiumCard className="text-[11px] text-muted px-4 py-3">
                    ยังไม่มีการเปลี่ยนแปลงที่ชัดเจนพอในช่วง {trendPeriodDays} วันนี้
                  </PremiumCard>
                )}
              </div>

              <RecommendationsCard insights={healthInsights} latestWeightKg={latest?.weight_kg ?? null} />

              <GoalsCard goals={goals} unit={unit} goalCurrentValue={goalCurrentValue} goalProgressPct={goalProgressPct} />
            </div>
          </div>
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
            {metrics.length === 0 ? (
              <PremiumCard className="px-4 py-8 text-center space-y-3">
                <div className="text-3xl">📏</div>
                <p className="text-sm text-muted">ยังไม่มีข้อมูล เริ่มบันทึกครั้งแรกได้เลย</p>
                <a
                  href="#metric-form"
                  className="inline-block text-[11px] font-display tracked uppercase text-bg bg-amber rounded-lg px-4 py-2 active:scale-[0.99] transition"
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
                          await supabase.from('body_metrics').delete().eq('id', m.id)
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
function ZoneBadge({ zone, direction = 'neutral' }: { zone: 'Low' | 'Standard' | 'High'; direction?: Direction }) {
  const status = classifyMetric(zone, direction)
  const cls = status === 'needsWork' ? 'bg-rustdim text-rusttext' : 'bg-mossdim text-moss'
  return (
    <span className={`text-[10px] font-display tracked uppercase px-2 py-1 rounded-full whitespace-nowrap ${cls}`}>
      {ZONE_ARROW[zone] && `${ZONE_ARROW[zone]} `}
      {ZONE_LABEL_TH[zone]}
    </span>
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
        <span className="text-[11px] tracked uppercase text-muted truncate">{label}</span>
      </div>
      <p className="font-mono text-xl tabular text-ink">
        {value != null ? value.toFixed(decimals) : '—'}
        <span className="text-xs text-muted ml-1">{unit}</span>
        {delta !== null && (
          <span className={`text-[11px] font-mono ml-1.5 ${deltaColor}`}>
            {delta > 0 ? '↑' : delta < 0 ? '↓' : '·'} {Math.abs(delta).toFixed(decimals)}
          </span>
        )}
      </p>
      {periodLabel && <p className="text-[10px] text-muted mt-0.5">จาก{periodLabel}ก่อน</p>}
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
              <span className={`block text-[11px] font-mono mt-0.5 ${deltaGood ? 'text-moss' : 'text-rusttext'}`}>
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
              <div className="flex justify-between text-[9px] text-muted mt-0.5">
                <span>{data[0].label}</span>
                <span>{data[data.length - 1].label}</span>
              </div>
            </>
          ) : (
            <p className="text-[11px] text-muted py-6 text-center">ยังไม่มีข้อมูลพอในช่วง{periodLabel} — บันทึกอย่างน้อย 2 ครั้ง</p>
          )}
        </div>

        {/* คอลัมน์ขวา: แถบ Low/Standard/High */}
        {trend.range ? (
          <div>
            <div className="flex text-[9px] mb-1 text-center">
              <span className="flex-1 text-steel">Low</span>
              <span className="flex-1 text-moss">Standard</span>
              <span className="flex-1 text-rusttext">High</span>
            </div>
            <div className="flex h-1.5 rounded-full overflow-hidden">
              <div className="flex-1 bg-steel/70" />
              <div className="flex-1 bg-moss/70" />
              <div className="flex-1 bg-rust/70" />
            </div>
            <div className="flex justify-between text-[9px] text-muted mt-1">
              <span>{trend.range.low.toFixed(dec)}</span>
              <span className="text-ink">
                {((trend.range.low + trend.range.high) / 2).toFixed(dec)}
              </span>
              <span>{trend.range.high.toFixed(dec)}</span>
            </div>
            <p className="text-[9px] text-muted mt-1">
              (Ideal {trend.range.low.toFixed(dec)} - {trend.range.high.toFixed(dec)})
            </p>
            {trend.range.note && <p className="text-[9px] text-muted mt-0.5 italic">{trend.range.note}</p>}
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
        <p className="text-[11px] text-muted mt-2">
          ยังมีข้อมูลไม่พอสำหรับคาดการณ์ — บันทึกข้อมูลอย่างน้อย 3 ครั้งในช่วง 90 วันที่ผ่านมา แล้วระบบจะคาดการณ์แนวโน้มให้อัตโนมัติ
        </p>
      ) : (
        <>
          <p className="text-[11px] text-muted mb-3">หากทำตามแนวโน้มปัจจุบันต่อเนื่อง คาดว่าภายใน 4 สัปดาห์...</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {forecast.map((it) => (
              <div key={it.label}>
                <p className="text-[10px] tracked uppercase text-muted truncate">{it.label}</p>
                <p className="font-mono text-base text-ink">
                  {it.value!.toFixed(1)}
                  <span className="text-[10px] text-muted ml-1">{it.unit}</span>
                </p>
                {it.delta !== null && (
                  <p className={`text-[11px] font-mono ${it.delta < 0 ? 'text-moss' : it.delta > 0 ? 'text-rusttext' : 'text-muted'}`}>
                    {it.delta > 0 ? '↑' : it.delta < 0 ? '↓' : '·'} {Math.abs(it.delta).toFixed(1)} {it.unit}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="text-[9px] text-muted mt-3 italic">
            * ประมาณจากแนวโน้มข้อมูล 90 วันที่ผ่านมา ไม่ใช่คำแนะนำทางการแพทย์
          </p>
        </>
      )}
    </PremiumCard>
  )
}

// วงแหวนสรุป + สัดส่วน ดีมาก/มาตรฐาน/ควรปรับปรุง จากตัวชี้วัดล่าสุดที่มีช่วงอ้างอิงให้เทียบ
// ระดับคะแนนสุขภาพรวม → label + สี ring — แยกเป็นฟังก์ชันกลางให้ HealthScoreCard (แท็บ "แนวโน้ม") และ
// OverviewHealthScoreHeader (แท็บ "ภาพรวม") ใช้สูตรเดียวกันเป๊ะ (ไล่ตามคะแนนจริง: แดง/ส้ม/เขียว) แทนสีคงที่
// ตายตัวสีเดียว — กันไม่ให้สองแท็บพูดภาษาสีคนละชุดกัน และกันชนกับความหมายสีที่จองไว้แล้วที่อื่นในแอป (เช่น
// cyan = Recovery ring บน Dashboard)
function healthScoreTier(pct: number): { label: string; color: string } {
  if (pct >= 85) return { label: 'ดีมาก', color: '#7A9B57' }
  if (pct >= 65) return { label: 'ดี', color: '#7A9B57' }
  if (pct >= 40) return { label: 'มาตรฐาน', color: '#E8A33D' }
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
// ฟีดแบ็ก "Health Score 90% ต้องสัมพันธ์กับข้อมูลด้านล่าง — อยากให้กด Score แล้วเห็น Breakdown เป็นหมวด
// (Body Composition/Metabolic Health/Muscle/Hydration) พร้อมคะแนนย่อย" — จัดกลุ่ม healthScoreItems (มีอยู่
// แล้ว จาก computeScoreItems) ตาม label เข้า 4 หมวดนี้ ไม่ต้องคำนวณคะแนนย่อยใหม่ทั้งหมด แค่รวมยอดต่อหมวด
const HEALTH_SCORE_CATEGORIES: { title: string; labels: string[] }[] = [
  { title: 'BODY COMPOSITION', labels: ['น้ำหนัก', 'BMI', 'ไขมันในร่างกาย', 'มวลไขมัน'] },
  { title: 'METABOLIC HEALTH', labels: ['ไขมันช่องท้อง', 'อายุร่างกาย'] },
  { title: 'MUSCLE', labels: ['กล้ามเนื้อโครงร่าง', 'มวลกล้ามเนื้อ', 'โปรตีน', 'มวลกระดูก'] },
  { title: 'HYDRATION', labels: ['น้ำในร่างกาย', 'เกลือแร่'] },
]

function OverviewHealthScoreHeader({
  score,
  items,
  monthDeltaPct,
  bodyFatDeltaPct,
  muscleMassDelta,
  goalRows,
  updatedDateLabel,
  updatedTimeLabel,
  trendScorePct,
  unit,
  summary,
}: {
  score: { good: number; standard: number; needsWork: number; total: number; score: number }
  items: { label: string; status: 'good' | 'standard' | 'needsWork' }[]
  monthDeltaPct?: number | null
  bodyFatDeltaPct: number | null
  muscleMassDelta: number | null
  // ฟีดแบ็ก "เป้าหมายควรเป็นข้อมูลที่ actionable — 65.0 kg / เป้าหมาย · เหลือ 1.3 kg แทนแค่ 65.0 kg เฉยๆ...
  // แสดง 2 เป้าหมาย (น้ำหนัก + Body Fat) พร้อมกัน ไม่ใช่แค่ตัวเดียว" — คำนวณ array ที่จุดเรียกใช้แล้ว (มี
  // weightGoal/bodyFatGoal/latest ครบอยู่แล้วตรงนั้น) แต่ละแถวคือเป้าหมายหนึ่งตัว (น้ำหนักมาก่อนถ้ามีทั้งคู่)
  goalRows: { valueText: string; label: string; subText: string | null }[]
  // ฟีดแบ็ก "ล่าสุด อยากได้วันที่ + เวลา" — แยกสองบรรทัด (วันที่เด่นกว่า, เวลาจางกว่า) แทน updatedLabel เดิม
  // ที่มีแค่วันที่บรรทัดเดียว
  updatedDateLabel: string | null
  updatedTimeLabel: string | null
  trendScorePct: number | null
  unit: string
  // v8: ฟีดแบ็ก "พื้นที่ด้านขวาของ Health Score ยังว่างค่อนข้างเยอะ — อยากได้สรุปประโยคเดียวแทน metric อีกตัว
  // จะทำให้ Health Score กลายเป็น Insight ไม่ใช่แค่คะแนน" — คำนวณที่จุดเรียกใช้ (มีข้อมูล delta/เป้าหมาย
  // ครบอยู่แล้ว) ส่งมาเป็นประโยคสำเร็จรูป ไม่ต้องคำนวณซ้ำในนี้
  summary: string | null
}) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  if (score.total === 0) return null
  const pct = (score.score / score.total) * 100
  const { label, color: ringColor } = healthScoreTier(pct)

  // ป้าย signal ต่อการ์ด — v3: ฟีดแบ็ก "อยากได้ Chip แบบ Apple (✔ Fat ↓)" เปลี่ยนจากวลีสำเร็จรูปที่ผูก
  // ทิศทางไว้ในข้อความ (เช่น "ไขมันลด") มาเป็น label สั้น + ลูกศรทิศทางแยกท้ายสุด ให้สแกนอ่านเร็วขึ้น
  // v6: ฟีดแบ็ก "✓ ดูเหมือน checklist ธรรมดาไปนิดสำหรับ UI Titanium — อยากได้ ↓ ไขมัน 2.3% แบบไม่มี ✓"
  // ตัดสัญลักษณ์ ✓/! ออก ให้ลูกศรทิศทางขึ้นนำหน้าแทน ใส่ตัวเลขเดลต้าจริง (valueText) ต่อท้าย label แทนที่จะ
  // มีแค่ label เฉยๆ — อ่านได้ข้อมูลมากขึ้นในพื้นที่เท่าเดิม เหมือน Fitness Analytics มากกว่า checklist
  const signals: { label: string; dir: 'up' | 'down'; good: boolean; valueText: string }[] = []
  if (monthDeltaPct !== null && monthDeltaPct !== undefined && monthDeltaPct !== 0) {
    signals.push({ label: 'คะแนนสุขภาพ', dir: monthDeltaPct > 0 ? 'up' : 'down', good: monthDeltaPct > 0, valueText: `${Math.abs(monthDeltaPct)} คะแนน` })
  }
  if (bodyFatDeltaPct !== null && bodyFatDeltaPct !== 0) {
    signals.push({ label: 'ไขมัน', dir: bodyFatDeltaPct < 0 ? 'down' : 'up', good: bodyFatDeltaPct < 0, valueText: `${Math.abs(bodyFatDeltaPct).toFixed(1)}%` })
  }
  if (muscleMassDelta !== null && muscleMassDelta !== 0) {
    signals.push({ label: 'กล้ามเนื้อ', dir: muscleMassDelta > 0 ? 'up' : 'down', good: muscleMassDelta > 0, valueText: `${Math.abs(muscleMassDelta).toFixed(1)} ${unit}` })
  }

  const categoryRows = HEALTH_SCORE_CATEGORIES.map((c) => {
    const catItems = items.filter((i) => c.labels.includes(i.label))
    if (catItems.length === 0) return null
    return { title: c.title, pct: Math.round((catItems.filter((i) => i.status !== 'needsWork').length / catItems.length) * 100) }
  }).filter((r): r is { title: string; pct: number } => r !== null)
  if (trendScorePct !== null && trendScorePct !== undefined) {
    categoryRows.push({ title: 'TREND', pct: trendScorePct })
  }

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
        <div className="flex items-center gap-2 shrink-0">
          <div style={{ filter: 'drop-shadow(0 0 12px rgba(232,163,61,.35))' }}>
            <GoalRing pct={pct} size={130} strokeWidth={11} color="#E8A33D" ariaLabel="คะแนนสุขภาพรวม" />
          </div>
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setShowBreakdown((v) => !v)}
              className="flex items-center gap-1 text-[10px] tracked uppercase text-muted transition hover:text-ink"
            >
              Health Score
              <InfoIcon />
            </button>
            <span className="font-display font-semibold block mt-1 tracked uppercase" style={{ color: ringColor, fontSize: 25 }}>
              {label}
            </span>
          </div>
        </div>

        {updatedDateLabel && (
          <div className="shrink-0 border-l border-line/40 pl-5">
            <p className="text-[10px] tracked uppercase text-muted">ล่าสุด</p>
            <p className="font-mono text-sm text-ink">{updatedDateLabel}</p>
            {updatedTimeLabel && <p className="text-[10px] text-muted">{updatedTimeLabel}</p>}
          </div>
        )}

        {signals.length > 0 && (
          <div className="shrink-0 border-l border-line/40 pl-5">
            <p className="text-[10px] tracked uppercase text-muted mb-1">การเปลี่ยนแปลง</p>
            <div className="flex flex-col gap-0.5">
              {signals.map((s) => (
                <p key={s.label} className="whitespace-nowrap">
                  <span className="font-mono font-semibold text-sm" style={{ color: s.good ? '#8CB264' : '#C1503A' }}>
                    {s.dir === 'up' ? '↑' : '↓'} {s.valueText}
                  </span>{' '}
                  <span className="text-[11px] text-muted">{s.label}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* ฟีดแบ็ก "แสดง 2 เป้าหมาย (น้ำหนัก + Body Fat) พร้อมกัน จะดูเป็น Body Composition Dashboard มากกว่า
            เว็บลดน้ำหนักทั่วไป" — เดิมแสดงแค่ตัวเดียว (weight เป็นหลัก, fallback ไป body fat) เปลี่ยนเป็น
            map ทั้งสองแถวถ้ามี ใช้ pattern เดียวกับคอลัมน์ "การเปลี่ยนแปลง" ข้างๆ (ตัวเลข+label สั้น) เพื่อให้
            หน้าตาสอดคล้องกัน */}
        <div className="shrink-0 border-l border-line/40 pl-5">
          <p className="text-[10px] tracked uppercase text-muted mb-1">เป้าหมาย</p>
          {goalRows.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {goalRows.map((g) => (
                <p key={g.label} className="whitespace-nowrap">
                  <span className="font-mono font-semibold text-sm text-ink">{g.valueText}</span>{' '}
                  <span className="text-[11px] text-muted">{g.label}</span>
                  {g.subText && <span className="block text-[10px] text-muted">{g.subText}</span>}
                </p>
              ))}
            </div>
          ) : (
            <>
              <p className="font-mono text-sm text-muted">ยังไม่ได้ตั้ง</p>
              <a href="/calendar" className="text-[11px] text-amber transition hover:text-ink">
                + ตั้งเป้าหมาย
              </a>
            </>
          )}
        </div>
      </div>

      {/* ฟีดแบ็ก "ลดไขมัน พร้อมรักษามวลกล้ามเนื้อ อยู่ชิดล่างซ้ายมากและค่อนข้างเล็ก — ทำเป็น Insight line ที่
          ชัดขึ้นอีกนิด สีเทาอ่อนกว่า background ประมาณหนึ่งระดับ ไม่ต้องเขียว เพราะเป็นคำอธิบาย ไม่ใช่สถานะ" —
          ขยายจาก text-[11px] เป็น text-xs (12px) และเปลี่ยนสีจาก text-muted (#9498A0) เป็น text-ink/65 (ขาว
          นวลลดทึบ) อ่อนกว่าตัวข้อมูลหลัก (text-ink เต็ม) แต่เด่นกว่า muted เดิม ไม่ใช้สีเขียวเพราะไม่ใช่สถานะ
          บวก/ลบเหมือนการเปลี่ยนแปลง */}
      {summary && <p className="text-xs text-ink/65 mt-2">{summary}</p>}

      {showBreakdown && categoryRows.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line space-y-1.5">
          {/* ฟีดแบ็ก "HEALTH SCORE ยังไม่บอกว่า 90% มาจากอะไร — เพิ่ม ⓘ แล้วกดดูรายละเอียดได้ พร้อมคำอธิบาย
              สั้นๆ ว่าคะแนนประเมินจากอะไรบ้าง" — ใส่ไว้บรรทัดแรกสุดของ breakdown ก่อนแจกแจงเป็นหมวด */}
          <p className="text-[11px] text-muted">คะแนนนี้ประเมินจากแนวโน้มไขมัน มวลกล้ามเนื้อ BMI และองค์ประกอบร่างกายโดยรวม</p>
          {categoryRows.map((row) => (
            <div key={row.title} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="tracked uppercase text-muted">{row.title}</span>
              <span className="font-mono font-medium" style={{ color: healthScoreTier(row.pct).color }}>
                {row.pct}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function HealthScoreCard({
  score,
  monthDeltaPct,
  selfPercentile,
}: {
  score: { good: number; standard: number; needsWork: number; total: number; score: number }
  monthDeltaPct?: number | null
  selfPercentile?: number | null
}) {
  const pct = score.total > 0 ? (score.score / score.total) * 100 : 0
  const { label, color: ringColor } = healthScoreTier(pct)
  return (
    <PremiumCard className="p-4">
      <h2 className="font-display text-sm tracked uppercase text-muted mb-3">คะแนนสุขภาพรวม</h2>
      {score.total === 0 ? (
        <p className="text-[11px] text-muted">กรอกช่วงมาตรฐานในฟอร์มบันทึกข้อมูล เพื่อดูคะแนนสุขภาพตรงนี้</p>
      ) : (
        <div className="flex items-center gap-4">
          <GoalRing pct={pct} size={88} strokeWidth={8} color={ringColor} ariaLabel="คะแนนสุขภาพรวม" />
          <div className="text-xs min-w-0 flex-1">
            <p className="font-display text-sm tracked uppercase" style={{ color: ringColor }}>
              {label}
            </p>
            {monthDeltaPct !== null && monthDeltaPct !== undefined && monthDeltaPct !== 0 && (
              <p className={`text-[11px] mt-1 ${monthDeltaPct > 0 ? 'text-moss' : 'text-rusttext'}`}>
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
              <div className="flex justify-between text-[9px] text-muted mt-1">
                <span>แย่</span>
                <span>ดีเยี่ยม</span>
              </div>
            </div>
            {selfPercentile !== null && selfPercentile !== undefined && (
              <p className="flex items-start gap-1.5 text-[11px] text-muted mt-2">
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
}: {
  goals: Goal[]
  unit: string
  goalCurrentValue: (g: Goal) => number | null
  goalProgressPct: (g: Goal) => number | null
}) {
  return (
    <PremiumCard className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-sm tracked uppercase text-muted">เป้าหมายของคุณ</h2>
        <a href="/calendar" className="text-[10px] text-amber underline">
          แก้ไขเป้าหมาย
        </a>
      </div>
      {goals.length === 0 ? (
        <p className="text-[11px] text-muted">ยังไม่ได้ตั้งเป้าหมาย ไปตั้งเป้าหมายน้ำหนักหรือ Body Fat ได้ที่หน้าปฏิทิน</p>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => {
            const current = goalCurrentValue(g)
            const pct = goalProgressPct(g)
            const label = g.goal_type === 'weight' ? `น้ำหนัก (${unit})` : 'Body Fat (%)'
            return (
              <div key={g.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-ink">{label}</span>
                  <span className="font-mono text-muted">
                    {current !== null ? current.toFixed(1) : '—'} / {g.target_value?.toFixed(1) ?? '—'}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface2 overflow-hidden">
                  <div className="h-full bg-amber rounded-full" style={{ width: `${pct ?? 0}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
      <a
        href="/calendar"
        className="mt-3 block text-center text-[11px] font-display tracked uppercase text-bg bg-amber rounded-lg py-2 transition active:scale-[0.99] hover:opacity-90"
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
        title: isMuscleWarning ? 'เพิ่มการฝึกแรงต้าน' : 'เพิ่มการเผาผลาญไขมัน',
        detail: isMuscleWarning ? 'ฝึกเวทหรือเวทเทรนนิ่งอย่างน้อย 2-3 ครั้ง/สัปดาห์ เน้นกล้ามเนื้อมัดใหญ่' : 'คาร์ดิโอ HIIT 2-3 ครั้ง/สัปดาห์ ช่วยเผาผลาญไขมันได้มากขึ้น 15-20%',
        imageSrc: isMuscleWarning ? '/icons/increase-muscle-training.png' : '/icons/increase-training.png',
      }
    : null

  // สูตรทั่วไปที่แอปสุขภาพใช้ประมาณปริมาณน้ำที่ควรดื่ม ~35 มล./น้ำหนักตัว 1 กก.
  const waterLiters = latestWeightKg != null ? Math.round((latestWeightKg * 0.035) * 10) / 10 : null

  return (
    <PremiumCard className="p-4">
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
                <p className="text-[11px] text-muted mt-0.5">{highlight.detail}</p>
                <a
                  href="/program"
                  className="inline-block mt-2 text-[10px] font-display tracked uppercase text-bg bg-amber rounded-full px-3 py-1.5 transition active:scale-[0.99] hover:opacity-90"
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
            <p className="text-[11px] text-muted mt-0.5">
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
            <p className="text-[11px] text-muted mt-0.5">7-8 ชั่วโมงต่อคืน</p>
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
}: {
  bmi: number | null
  bodyFatPct: number | null
  sex: 'male' | 'female' | null
}) {
  const bf = bodyFatPctRange(sex)
  return (
    <section>
      <h2 className="flex items-center gap-2 font-display text-sm tracked uppercase text-ink mb-3">
        <ScaleIcon />
        Obesity Analysis
        <span className="text-muted">
          <InfoIcon />
        </span>
      </h2>
      <PremiumCard className="p-4 space-y-5">
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
}) {
  const pct = (v: number) => ((Math.min(Math.max(v, min), max) - min) / (max - min)) * 100
  const lowPct = pct(low)
  const highPct = pct(high)
  const valuePct = pct(value)
  const zone = value < low ? 'Low' : value > high ? 'High' : 'Standard'

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-2 text-sm text-ink font-medium">
          {imageKey && <MetricIconChip iconKey={iconKey ?? 'ruler'} imageKey={imageKey} color="#6C8CA8" size={28} />}
          <span className="flex items-center gap-1.5">
            {label}
            <span className="text-muted">
              <InfoIcon />
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-lg tabular text-ink">
            {value.toFixed(decimals)}
            {unit && <span className="text-xs text-muted ml-0.5">{unit}</span>}
          </span>
          <ZoneBadge zone={zone} direction={direction} />
          <span className="text-muted">
            <ChevronRightIcon />
          </span>
        </span>
      </div>
      <div className="flex text-[10px] mb-1.5">
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
      <div className="flex justify-between text-[10px] text-muted mt-1.5">
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
}: {
  items: { label: string; value: number; low: number; high: number }[]
  unit: string
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 font-display text-sm tracked uppercase text-ink mb-3">
        <MuscleIcon />
        Muscle &amp; Fat Analysis
        <span className="text-muted">
          <InfoIcon />
        </span>
      </h2>
      <PremiumCard className="divide-y divide-white/5">
        {items.map((it) => (
          <div key={it.label} className="p-4">
            <MuscleFatBarRow {...it} unit={unit} />
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
}: {
  label: string
  value: number
  low: number
  high: number
  unit: string
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

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-3">
          <MetricIconChip iconKey={meta.iconKey} imageKey={meta.imageKey} color={meta.color} size={36} />
          <span className="flex items-center gap-1.5 text-sm text-ink font-medium">
            {label}
            <span className="text-muted">
              <InfoIcon />
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-lg tabular text-ink">
            {value.toFixed(1)}
            <span className="text-xs text-muted ml-0.5">{unit}</span>
          </span>
          <ZoneBadge zone={zone} direction={meta.direction} />
          <span className="text-muted">
            <ChevronRightIcon />
          </span>
        </span>
      </div>
      <p className="text-[11px] text-steel mb-1.5 ml-12">Low {low.toFixed(1)}</p>
      <div className="relative h-2.5 rounded-full bg-surface2 overflow-hidden">
        <div className="absolute inset-y-0 bg-steel/70" style={{ left: 0, width: `${lowPct}%` }} />
        <div className="absolute inset-y-0 bg-moss/70" style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }} />
        <div className="absolute inset-y-0 bg-rust/70" style={{ left: `${highPct}%`, right: 0 }} />
        <div
          className="absolute top-1/2 w-3 h-3 rounded-full bg-bg border-[3px] border-ink"
          style={{ left: `${valuePct}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted mt-1.5">
        <span>{low.toFixed(1)}</span>
        <span className="italic">(ideal range)</span>
        <span>{high.toFixed(1)}</span>
      </div>
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
  const zoneLabel = zone
    ? zone === 'Standard'
      ? ZONE_LABEL_TH.Standard
      : zoneIsFavorable
        ? `${zone === 'High' ? 'เพียงพอ' : 'อยู่ในเกณฑ์ดี'} ✓`
        : `${ZONE_ARROW[zone]} ${ZONE_LABEL_TH[zone]}`
    : null
  const zonePillClass =
    zone === 'Standard'
      ? 'bg-mossdim text-moss'
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

  return (
    <PremiumCard
      // ฟีดแบ็ก "Weight Card สูง ~405px อยากได้ ~360-370px เพื่อดึง Analysis ขึ้นมาในจอเดียว" — ลด padding
      // การ์ดทั้งสองขนาด (primary py-4→py-3.5, ปกติ py-3.5→py-3) เพราะการ์ด primary สูงเท่ากับ 2 แถวของ
      // การ์ดเล็กที่มันคร่อมอยู่ (md:row-span-2) ไม่ได้ตั้ง height ตายตัว — ลด padding การ์ดเล็กจึงลดความสูง
      // ทั้งแถวและลาม primary ไปด้วยอัตโนมัติ ไม่ต้องคำนวณความสูง primary แยก
      className={`h-full flex flex-col metric-card-hover ${
        primary ? 'md:col-span-2 md:row-span-2 px-5 py-3.5' : 'justify-between px-4 py-3'
      } ${tier === 3 ? 'opacity-80' : tier === 2 ? 'opacity-95' : ''}`}
      // primary ใช้ boxShadow override คงที่ (ไม่ใช่ผ่าน CSS class) เพราะ PremiumCard เซ็ต boxShadow ผ่าน
      // inline style ของตัวเองอยู่แล้ว — prop `style` ที่ส่งเข้ามาจะถูก spread ทับท้ายสุดใน PremiumCard.tsx
      // (`...style` วางหลัง boxShadow ดีฟอลต์) จึงชนะได้จริง ต่างจากการพยายามใช้ class ธรรมดามาชน inline
      style={
        primary
          ? { boxShadow: '0 2px 4px rgba(0,0,0,.3), 0 16px 40px -8px rgba(0,0,0,.55), 0 0 0 1px rgba(232,163,61,.14)' }
          : undefined
      }
    >
      <div className={`flex items-start gap-2 ${primary ? 'mb-2.5' : 'mb-2'}`}>
        <MetricIconChip iconKey={icon} imageKey={imageKey} color={color} size={primary ? 44 : 32} />
        <div className="min-w-0">
          {/* ฟีดแบ็ก "ชื่อไทยบาง Card ขึ้น 2-3 บรรทัด (โปรตีนในร่างกาย, ดัชนีมวลกาย) พื้นที่การ์ดแคบไป —
              ควรลด font size แทนปล่อยให้ตัดคำรก" — ลดจาก text-xs (12px) เหลือ 11px เฉพาะการ์ดไม่ใช่ primary
              (primary กว้างพอ ชื่อสั้น "น้ำหนัก" ไม่มีปัญหานี้อยู่แล้ว ไม่ต้องแตะ) */}
          <p className={`text-ink font-medium leading-tight flex items-center gap-1 ${primary ? 'text-sm' : 'text-[11px]'}`}>
            {label}
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
          <p className={`tracked uppercase text-muted leading-snug ${primary ? 'text-[10px]' : 'text-[9px]'}`}>{subLabel}</p>
        </div>
        {showZonePill && zoneLabel && (
          <span
            className={`ml-auto shrink-0 font-display tracked uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${zonePillClass} ${primary ? 'text-[11px]' : 'text-[9px]'}`}
          >
            {zoneLabel}
          </span>
        )}
      </div>
      {primary ? (
        <>
          <p className="font-mono tabular text-ink shrink-0 whitespace-nowrap text-4xl">
            {value !== null && value !== undefined ? value.toFixed(decimals) : '—'}
            {unit && <span className="text-muted ml-1 text-sm">{unit}</span>}
          </p>
          {/* ฟีดแบ็ก "↑ 0.9 kg / จาก 3 สัปดาห์ก่อน / น้ำหนักเพิ่ม... สามบรรทัดเยอะไป อยากได้ ↑ 0.9 kg ·
              3 สัปดาห์ รวมบรรทัดเดียว แล้ว insight ค่อยอยู่บรรทัดถัดไป" — periodCaption (compact, ไม่มี
              "จาก...ก่อน" ห่อ) ต่อท้าย secondary ด้วย "·" แทนที่จะแยกบรรทัด */}
          {secondary && (
            <p className={`font-mono whitespace-nowrap text-sm ${secondary.color}`}>
              {secondary.text}
              {periodCaption && <span className="text-muted"> · {periodCaption}</span>}
            </p>
          )}
          {insight && <p className="text-muted truncate text-xs mt-0.5">{insight}</p>}
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
                  {(trendLabel || trendTag) && (
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      {trendLabel && <p className="text-[10px] tracked uppercase text-muted">{trendLabel}</p>}
                      {trendTag && <span className="text-[11px] text-moss shrink-0">{trendTag}</span>}
                    </div>
                  )}
                  <Sparkline series={series} color={trendColor ?? color} endpointColor={trendEndpointColor} height={48} width={400} stretch />
                </>
              ) : trendLabel ? (
                <>
                  <div className="h-px bg-line mb-2" />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] tracked uppercase text-muted">{trendLabel}</p>
                    {trendTag && <span className="text-[11px] text-moss shrink-0">{trendTag}</span>}
                  </div>
                </>
              ) : null}
              {lastMeasuredLabel && <p className="text-[10px] text-muted mt-2">ล่าสุด {lastMeasuredLabel}</p>}
            </div>
          )}
          {showInfo && infoText && <p className="text-xs text-muted mt-2 pt-2 border-t border-line">{infoText}</p>}
        </>
      ) : (
        <div>
          <p className="font-mono tabular text-ink shrink-0 whitespace-nowrap text-xl">
            {value !== null && value !== undefined ? value.toFixed(decimals) : '—'}
            {unit && <span className="text-muted ml-1 text-xs">{unit}</span>}
          </p>
          {secondary && <p className={`font-mono whitespace-nowrap text-[11px] ${secondary.color}`}>{secondary.text}</p>}
          {insight && <p className="text-muted truncate text-[10px] mt-0.5">{insight}</p>}
          {series && series.length >= 2 && (
            <div className="mt-1.5">
              <Sparkline series={series} color={sparklineColor} height={18} width={200} stretch />
            </div>
          )}
          {showInfo && infoText && <p className="text-[10px] text-muted mt-1.5 pt-1.5 border-t border-line">{infoText}</p>}
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
        <button type="button" onClick={() => setDismissed(true)} className="text-[10px] text-muted underline transition hover:text-ink">
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
      {heightNote && <p className="text-[11px] text-muted -mt-1">{heightNote}</p>}

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
          className="text-[11px] text-steel underline"
        >
          {showRanges ? 'ซ่อนช่วงมาตรฐาน' : '+ กรอกช่วงมาตรฐาน (สำหรับกราฟ Muscle Fat Analysis)'}
        </button>
        {showRanges && (
          <div className="mt-3 space-y-3">
            <p className="text-[10px] text-muted">
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
        <p className="text-[11px] text-muted">
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
        <span className="text-[10px] text-muted">สูตร Mifflin-St Jeor</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] tracked uppercase text-muted">BMR</p>
          <p className="font-mono text-xl text-ink">
            {bmr}
            <span className="text-xs text-muted ml-1">kcal</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] tracked uppercase text-muted">TDEE</p>
          <p className="font-mono text-xl text-amber">
            {tdee}
            <span className="text-xs text-muted ml-1">kcal</span>
          </p>
        </div>
      </div>
      <label className="block">
        <span className="block text-[10px] tracked uppercase text-muted mb-1">ระดับกิจกรรม</span>
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
      <p className="text-[10px] text-muted/70">
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
      <label className="block text-[10px] tracked uppercase text-muted mb-1">{label}</label>
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
    await supabase.storage.from('progress-photos').remove([photo.storage_path])
    await supabase.from('progress_photos').delete().eq('id', photo.id)
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
          {beforePhoto?.url && afterPhoto?.url && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="relative w-full aspect-[3/4] rounded-lg border border-line overflow-hidden">
                  <Image src={beforePhoto.url} alt="Before" fill sizes="200px" className="object-cover" />
                </div>
                <p className="text-center text-[11px] text-muted mt-1">{shortLabel(beforePhoto.taken_at)}</p>
              </div>
              <div>
                <div className="relative w-full aspect-[3/4] rounded-lg border border-line overflow-hidden">
                  <Image src={afterPhoto.url} alt="After" fill sizes="200px" className="object-cover" />
                </div>
                <p className="text-center text-[11px] text-muted mt-1">{shortLabel(afterPhoto.taken_at)}</p>
              </div>
            </div>
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
                <p className="text-[10px] text-muted mt-1 truncate">{shortLabel(p.taken_at)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
