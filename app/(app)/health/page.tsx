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

function bmiOf(weightKg: number | null, heightCm: number | null) {
  if (!weightKg || !heightCm) return null
  const h = heightCm / 100
  return weightKg / (h * h)
}

// สัดส่วนโปรตีนต่อน้ำหนักตัว (%) — เกณฑ์ทั่วไปที่แอปสุขภาพ/เครื่องชั่งอัจฉริยะใช้กัน:
// ต่ำกว่ามาตรฐาน < 16%, มาตรฐาน 16-20%, สูง/ดีมาก > 20% — ไม่ต้องพึ่งค่าที่ผู้ใช้กรอกเอง
function proteinPctZone(proteinKg: number, weightKg: number): Zone | null {
  if (!weightKg) return null
  const pct = (proteinKg / weightKg) * 100
  if (pct < 16) return 'Low'
  if (pct > 20) return 'High'
  return 'Standard'
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

  const latest = metrics[0] ?? null
  const bmi = bmiOf(latest?.weight_kg ?? null, profile?.height_cm ?? null)

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
  const bodyWaterRangeLow = latestNonNull('body_water_range_low')
  const bodyWaterRangeHigh = latestNonNull('body_water_range_high')
  const saltRangeLow = latestNonNull('inorganic_salt_range_low')
  const saltRangeHigh = latestNonNull('inorganic_salt_range_high')
  const proteinRangeLow = latestNonNull('protein_range_low')
  const proteinRangeHigh = latestNonNull('protein_range_high')
  const boneMassRangeLow = latestNonNull('bone_mass_range_low')
  const boneMassRangeHigh = latestNonNull('bone_mass_range_high')

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
        range:
          bodyWaterRangeLow !== null && bodyWaterRangeHigh !== null
            ? { low: toDisplay(bodyWaterRangeLow), high: toDisplay(bodyWaterRangeHigh), min: toDisplay(bodyWaterRangeLow) * 0.85, max: toDisplay(bodyWaterRangeHigh) * 1.15 }
            : undefined,
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
        range:
          proteinRangeLow !== null && proteinRangeHigh !== null
            ? { low: toDisplay(proteinRangeLow), high: toDisplay(proteinRangeHigh), min: toDisplay(proteinRangeLow) * 0.85, max: toDisplay(proteinRangeHigh) * 1.15 }
            : undefined,
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
      bodyWaterRangeLow,
      bodyWaterRangeHigh,
      saltRangeLow,
      saltRangeHigh,
      proteinRangeLow,
      proteinRangeHigh,
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
      items.push({ label: 'ไขมันในร่างกาย', status: classifyMetric(zoneOf(row.body_fat_pct, 18, 28), 'lowerBetter') })
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
    if (row?.protein_kg != null && row?.weight_kg != null) {
      const zone = proteinPctZone(row.protein_kg, row.weight_kg)
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracked uppercase">สุขภาพร่างกาย</h1>
          <p className="text-xs text-muted mt-0.5">ติดตามและวิเคราะห์แนวโน้มสุขภาพของคุณ</p>
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
        <div className="space-y-6">
          {profile && !profile.sex && (
            <SexPrompt profile={profile} onSaved={(p) => setProfile(p)} />
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 items-stretch">
            <IconStatCard
              label="น้ำหนัก"
              subLabel="WEIGHT"
              icon="weight"
              imageKey="weight"
              color="#E8A33D"
              value={latest?.weight_kg != null ? toDisplay(latest.weight_kg) : null}
              unit={unit}
              delta={fieldDelta('weight_kg', toDisplay)}
              deltaUnit={unit}
              direction={weightDirection}
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
              direction={weightDirection}
              zone={bmi !== null ? zoneOf(bmi, 18.5, 25) : null}
              zoneScheme="symmetric"
            />
            <IconStatCard
              label="ไขมันในร่างกาย"
              subLabel="BODY FAT"
              icon="fat"
              imageKey="bodyFat"
              color="#C1503A"
              value={latest?.body_fat_pct ?? null}
              unit="%"
              delta={fieldDelta('body_fat_pct')}
              deltaUnit="%"
              direction="lowerBetter"
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
            />
            <IconStatCard
              label="โปรตีน"
              subLabel="PROTEIN"
              icon="protein"
              imageKey="protein"
              color="#5FA8A0"
              value={latest?.protein_kg != null ? toDisplay(latest.protein_kg) : null}
              unit={unit}
              delta={fieldDelta('protein_kg', toDisplay)}
              deltaUnit={unit}
              direction="neutral"
              zone={
                latest?.protein_kg != null && latest?.weight_kg != null
                  ? proteinPctZone(latest.protein_kg, latest.weight_kg)
                  : null
              }
              zoneScheme="higherOk"
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
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-4 items-start">
            {(bmi !== null || latest?.body_fat_pct != null) && (
              <ObesityAnalysisChart bmi={bmi} bodyFatPct={latest?.body_fat_pct ?? null} />
            )}

            {muscleFatItems.length > 0 ? (
              <MuscleFatAnalysisChart items={muscleFatItems} unit={unit} />
            ) : (
              <p className="text-[11px] text-muted bg-surface border border-line shadow-elevated rounded-lg px-4 py-3">
                อยากดูกราฟ Muscle Fat Analysis (น้ำหนัก/กล้ามเนื้อโครงร่าง/มวลไขมัน เทียบช่วงมาตรฐาน) — กรอกช่วงมาตรฐานจากรายงานเครื่องชั่งในฟอร์มด้านล่าง (ช่อง &quot;ช่วงมาตรฐาน&quot;) สักครั้ง แล้วกราฟจะขึ้นให้อัตโนมัติ
              </p>
            )}
          </div>

          {healthInsights.length > 0 && (
            <div className="bg-surface border border-line shadow-elevated rounded-lg p-4">
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
                  className="mt-3 w-full text-center text-[11px] font-display tracked uppercase text-bg bg-amber rounded-lg py-2"
                >
                  ดูคำแนะนำเพิ่มเติม
                </button>
              )}
            </div>
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
                low={18}
                high={28}
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
                  <p className="text-[11px] text-muted bg-surface border border-line shadow-elevated rounded-lg px-4 py-3">
                    ยังไม่มีข้อมูลพอสำหรับดูแนวโน้มในหมวดนี้ — บันทึกข้อมูลอย่างน้อย 2 ครั้งก่อน แล้วกราฟจะขึ้นให้อัตโนมัติ
                  </p>
                )
              ) : selectedTrend && selectedTrend.data.length > 1 ? (
                <MetricRowCard trend={selectedTrend} periodLabel={`${trendPeriodDays} วัน`} />
              ) : (
                <p className="text-[11px] text-muted bg-surface border border-line shadow-elevated rounded-lg px-4 py-3">
                  ยังไม่มีข้อมูลพอสำหรับดูแนวโน้มในหมวดนี้ — บันทึกข้อมูลอย่างน้อย 2 ครั้งก่อน แล้วกราฟจะขึ้นให้อัตโนมัติ
                </p>
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
                  <p className="text-[11px] text-muted bg-surface border border-line shadow-elevated rounded-lg px-4 py-3">
                    ยังไม่มีการเปลี่ยนแปลงที่ชัดเจนพอในช่วง {trendPeriodDays} วันนี้
                  </p>
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
            onSaved={(m) => setMetrics((prev) => [m, ...prev.filter((x) => x.id !== m.id)])}
            onHeightExtracted={saveHeight}
          />

          <section>
            <h2 className="font-display text-sm tracked uppercase text-muted mb-3">ประวัติการวัดผล</h2>
            {metrics.length === 0 ? (
              <div className="bg-surface border border-line shadow-elevated rounded-lg px-4 py-8 text-center space-y-3">
                <div className="text-3xl">📏</div>
                <p className="text-sm text-muted">ยังไม่มีข้อมูล เริ่มบันทึกครั้งแรกได้เลย</p>
                <a
                  href="#metric-form"
                  className="inline-block text-[11px] font-display tracked uppercase text-bg bg-amber rounded-lg px-4 py-2 active:scale-[0.99] transition"
                >
                  + บันทึกครั้งแรก
                </a>
              </div>
            ) : (
              <ul className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
                {metrics.map((m) => (
                  <li key={m.id} className="tally-row px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-muted">{shortLabel(m.measured_at)}</span>
                      <button
                        onClick={async () => {
                          await supabase.from('body_metrics').delete().eq('id', m.id)
                          setMetrics((prev) => prev.filter((x) => x.id !== m.id))
                        }}
                        className="text-muted hover:text-rust text-xs"
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
                  </li>
                ))}
              </ul>
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

const ZONE_LABEL_TH: Record<'Low' | 'Standard' | 'High', string> = { Low: 'ต่ำ', Standard: 'มาตรฐาน', High: 'สูง' }

function ZoneBadge({ zone }: { zone: 'Low' | 'Standard' | 'High' }) {
  const cls =
    zone === 'Low' ? 'bg-steeldim text-steel' : zone === 'High' ? 'bg-rustdim text-rusttext' : 'bg-mossdim text-moss'
  return (
    <span className={`text-[10px] font-display tracked uppercase px-2 py-1 rounded-full whitespace-nowrap ${cls}`}>
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
function MetricIconChip({ iconKey, imageKey, color, size = 28 }: { iconKey: string; imageKey?: string; color: string; size?: number }) {
  const src = imageKey ? STAT_ICON_IMAGES[imageKey] : undefined
  if (src) {
    return (
      <span className="shrink-0 inline-block" style={{ width: size, height: size }}>
        <Image src={src} alt="" width={size} height={size} className="w-full h-full object-contain" />
      </span>
    )
  }
  const Icon = TREND_ICONS[iconKey] ?? ScaleIcon
  return (
    <span
      className="shrink-0 rounded-full flex items-center justify-center"
      style={{ width: size, height: size, background: `${color}26`, color }}
    >
      <Icon />
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
    <div className="bg-surface border border-line shadow-elevated rounded-lg px-4 py-3.5">
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
          <ZoneBadge zone={zone} />
        </div>
      ) : null}
    </div>
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
    <section className="bg-surface border border-line shadow-elevated rounded-lg p-4">
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
                <ZoneBadge zone={zone} />
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
    </section>
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
    <div className="bg-surface border border-line shadow-elevated rounded-lg p-4">
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
    </div>
  )
}

// วงแหวนสรุป + สัดส่วน ดีมาก/มาตรฐาน/ควรปรับปรุง จากตัวชี้วัดล่าสุดที่มีช่วงอ้างอิงให้เทียบ
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
  const label = pct >= 85 ? 'ดีมาก' : pct >= 65 ? 'ดี' : pct >= 40 ? 'มาตรฐาน' : 'ควรปรับปรุง'
  const ringColor = pct >= 85 ? '#7A9B57' : pct >= 65 ? '#7A9B57' : pct >= 40 ? '#E8A33D' : '#C1503A'
  return (
    <div className="bg-surface border border-line shadow-elevated rounded-lg p-4">
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
    </div>
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
    <div className="bg-surface border border-line shadow-elevated rounded-lg p-4">
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
        className="mt-3 block text-center text-[11px] font-display tracked uppercase text-bg bg-amber rounded-lg py-2"
      >
        ดูเป้าหมายทั้งหมด
      </a>
    </div>
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
    <div className="bg-surface border border-line shadow-elevated rounded-lg p-4">
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
                  className="inline-block mt-2 text-[10px] font-display tracked uppercase text-bg bg-amber rounded-full px-3 py-1.5"
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
    </div>
  )
}

const MUSCLE_FAT_META: Record<string, { Icon: () => JSX.Element; bg: string; fg: string; color: string; imageKey?: string; iconKey: string }> = {
  Weight: { Icon: ScaleIcon, bg: 'bg-moss/15', fg: 'text-moss', color: '#7A9B57', imageKey: 'weight', iconKey: 'weight' },
  'Skeletal Muscle': { Icon: MuscleIcon, bg: 'bg-violet/15', fg: 'text-violet', color: '#9C7CC4', imageKey: 'skeletalMuscle', iconKey: 'muscle' },
  'Fat Mass': { Icon: DropletsIcon, bg: 'bg-amber/15', fg: 'text-amber', color: '#E8A33D', imageKey: 'fatMass', iconKey: 'fat' },
}

function ObesityAnalysisChart({ bmi, bodyFatPct }: { bmi: number | null; bodyFatPct: number | null }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 font-display text-sm tracked uppercase text-ink mb-3">
        <ScaleIcon />
        Obesity Analysis
        <span className="text-muted">
          <InfoIcon />
        </span>
      </h2>
      <div className="bg-surface border border-line shadow-elevated rounded-lg p-4 space-y-5">
        {bmi !== null && (
          <ZoneBarRow label="BMI (kg/m²)" value={bmi} min={10} low={18.5} high={25} max={40} decimals={1} imageKey="bmiObesity" iconKey="bmi" />
        )}
        {bmi !== null && bodyFatPct !== null && <div className="border-t border-line" />}
        {bodyFatPct !== null && (
          <ZoneBarRow
            label="Body fat rate (%)"
            value={bodyFatPct}
            min={8}
            low={18}
            high={28}
            max={48}
            decimals={1}
            unit="%"
            imageKey="bodyFatObesity"
            iconKey="fat"
          />
        )}
      </div>
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
          <ZoneBadge zone={zone} />
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
      <div className="bg-surface border border-line shadow-elevated rounded-lg divide-y divide-line">
        {items.map((it) => (
          <div key={it.label} className="p-4">
            <MuscleFatBarRow {...it} unit={unit} />
          </div>
        ))}
      </div>
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
  const meta = MUSCLE_FAT_META[label] ?? { Icon: ScaleIcon, bg: 'bg-steel/15', fg: 'text-steel', color: '#6C8CA8', iconKey: 'ruler' }

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
          <ZoneBadge zone={zone} />
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
}) {
  const deltaGood = delta !== null && direction !== 'neutral' && (direction === 'higherBetter' ? delta > 0 : delta < 0)
  const deltaBad = delta !== null && direction !== 'neutral' && (direction === 'higherBetter' ? delta < 0 : delta > 0)
  const deltaColor = deltaGood ? 'text-moss' : deltaBad ? 'text-rusttext' : 'text-muted'

  const zoneLabel = zone ? ZONE_LABEL_TH[zone] : null
  const zoneColor =
    zone === 'Standard'
      ? 'text-moss'
      : zone === 'High'
        ? zoneScheme === 'higherOk'
          ? 'text-emerald-500'
          : 'text-rusttext'
        : zone === 'Low'
          ? zoneScheme === 'lowerOk'
            ? 'text-emerald-500'
            : 'text-rusttext'
          : ''

  return (
    <div className="h-full bg-surface border border-line shadow-elevated rounded-lg px-4 py-3.5 flex flex-col justify-between">
      <div className="flex items-start gap-2 mb-2">
        <MetricIconChip iconKey={icon} imageKey={imageKey} color={color} size={32} />
        <div className="min-w-0">
          <p className="text-xs text-ink font-medium leading-snug">{label}</p>
          <p className="text-[9px] tracked uppercase text-muted leading-snug">{subLabel}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="font-mono text-xl tabular text-ink shrink-0 whitespace-nowrap">
          {value !== null && value !== undefined ? value.toFixed(decimals) : '—'}
          {unit && <span className="text-xs text-muted ml-1">{unit}</span>}
        </p>
        {zoneLabel ? (
          <span className={`text-[11px] font-medium whitespace-nowrap shrink-0 ml-auto ${zoneColor}`}>{zoneLabel}</span>
        ) : note ? (
          <span className={`text-[11px] whitespace-nowrap shrink-0 ml-auto ${noteGood ? 'text-moss' : 'text-rusttext'}`}>{note}</span>
        ) : delta !== null ? (
          <span className={`text-[11px] font-mono whitespace-nowrap shrink-0 ml-auto ${deltaColor}`}>
            {delta > 0 ? '↑' : delta < 0 ? '↓' : '·'} {Math.abs(delta).toFixed(decimals)}
            {deltaUnit ? ` ${deltaUnit}` : ''}
          </span>
        ) : null}
      </div>
    </div>
  
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
    <div className="bg-surface border border-line shadow-elevated rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <p className="text-xs text-muted">
        ระบุเพศเพื่อประเมินเกณฑ์มาตรฐาน<span className="text-ink">น้ำในร่างกาย</span>ให้แม่นยำขึ้น
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => handlePick('male')}
          disabled={saving !== null}
          className="px-3 py-1.5 rounded-lg bg-steeldim text-steel text-xs font-display tracked uppercase disabled:opacity-50"
        >
          {saving === 'male' ? '...' : 'ชาย'}
        </button>
        <button
          type="button"
          onClick={() => handlePick('female')}
          disabled={saving !== null}
          className="px-3 py-1.5 rounded-lg bg-rustdim text-rusttext text-xs font-display tracked uppercase disabled:opacity-50"
        >
          {saving === 'female' ? '...' : 'หญิง'}
        </button>
        <button type="button" onClick={() => setDismissed(true)} className="text-[10px] text-muted underline">
          ข้าม
        </button>
      </div>
    </div>
  )
}

function HeightSetting({ profile, onSaved }: { profile: Profile | null; onSaved: (p: Profile) => void }) {
  const supabase = createClient()
  const [height, setHeight] = useState(profile?.height_cm ? String(profile.height_cm) : '')
  const [editing, setEditing] = useState(!profile?.height_cm)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || !height) return
    setSaving(true)
    const { data } = await supabase
      .from('profiles')
      .upsert({ user_id: user.id, height_cm: Number(height), updated_at: new Date().toISOString() })
      .select()
      .single()
    setSaving(false)
    if (data) {
      onSaved(data as Profile)
      setEditing(false)
    }
  }

  if (!editing) {
    return (
      <div className="bg-surface border border-line shadow-elevated rounded-lg px-4 py-3.5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] tracked uppercase text-muted">ส่วนสูง</p>
          <button type="button" onClick={() => setEditing(true)} className="text-[10px] text-amber underline">
            แก้ไข
          </button>
        </div>
        <p className="font-mono text-2xl tabular text-amber">
          {profile?.height_cm}
          <span className="text-xs text-muted ml-1">ซม.</span>
        </p>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-line shadow-elevated rounded-lg px-4 py-3.5">
      <p className="text-[11px] tracked uppercase text-muted mb-1.5">ส่วนสูง (ซม.)</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          placeholder="สำหรับคำนวณ BMI"
          className="input font-mono text-sm py-2"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !height}
          className="shrink-0 px-3 py-2 rounded-lg bg-steel text-bg text-xs font-display tracked uppercase disabled:opacity-50"
        >
          บันทึก
        </button>
      </div>
    </div>
  )
}

function MetricForm({
  onSaved,
  onHeightExtracted,
}: {
  onSaved: (m: BodyMetric) => void
  onHeightExtracted?: (heightCm: number) => Promise<void>
}) {
  const supabase = createClient()
  const { unit, toKg, toDisplay } = useWeightUnit()
  const [date, setDate] = useState(todayStr())
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
    <form id="metric-form" onSubmit={handleSubmit} className="space-y-3 bg-surface border border-line shadow-elevated rounded-lg p-4">
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
        className="w-full rounded-lg font-display tracked uppercase py-3 text-sm bg-amber text-bg disabled:opacity-50"
      >
        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </form>
  )
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] tracked uppercase text-muted mb-1">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
      <div className="bg-surface border border-line shadow-elevated rounded-lg p-4 space-y-3">
        <h2 className="font-display text-sm tracked uppercase text-muted">เพิ่มรูป</h2>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="ป้ายกำกับ เช่น หน้าตรง, ด้านข้าง"
          className="input"
        />
        <label className="block">
          <span className="w-full block text-center rounded-lg font-display tracked uppercase py-3 text-sm bg-rust text-ink cursor-pointer">
            {uploading ? 'กำลังอัปโหลด...' : 'เลือกรูปถ่าย'}
          </span>
          <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} className="hidden" />
        </label>
        {error && <p className="text-sm text-rusttext">{error}</p>}
      </div>

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
          <p className="text-sm text-muted bg-surface border border-line shadow-elevated rounded-lg px-4 py-6 text-center">
            ยังไม่มีรูป
          </p>
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
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-bg/80 text-rusttext text-xs flex items-center justify-center"
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
