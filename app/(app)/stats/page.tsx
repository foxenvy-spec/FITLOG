'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import type { Workout, Profile } from '@/lib/types'
import { MUSCLE_GROUP_COLORS, VOLUME_MUSCLES } from '@/lib/muscle-groups'
import { todayStr, daysAgoStr } from '@/lib/weekdays'
import {
  computeTodayTotals,
  estimateCaloriesToday,
  computeTrainingBalance,
  BALANCE_STATUS_LABEL,
  type BalanceStatusTier,
} from '@/lib/dashboardStats'
import { computeProgressiveOverload, type OverloadPlan } from '@/lib/aiCoach'
import { computeStrengthAxis, vo2MaxToPct, coreVolumeToPct } from '@/lib/strengthStandards'
import { computeVO2Max } from '@/lib/vo2max'
import { useExerciseLibrary } from '@/lib/useExerciseLibrary'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import PremiumCard from '@/components/ui/PremiumCard'
import { COLORS, NEUTRAL, withAlpha } from '@/lib/theme'
import { useCountUp } from '@/lib/useCountUp'

const WEEKS_SHOWN = 8

// ฟีดแบ็ก "อยากเลือกดูช่วงเวลาของหน้า /stats เอง [30 วัน | 90 วัน | 180 วัน | 1 ปี | ทั้งหมด] แทนที่จะ
// fix ไว้ที่ 180 วันตายตัว" — คนละตัวกับ timeframe selector ใน BodyMetricsRow.tsx (อันนั้นคุมแค่การ์ด
// น้ำหนัก/ไขมัน/กล้ามเนื้อ) ตัวนี้คุม query หลักของทั้งหน้า (workouts state เดียวที่ทุก useMemo ด้านล่าง
// derive ต่อ) ค่าเริ่มต้น 180 วัน = พฤติกรรมเดิมทุกประการก่อนมีตัวเลือกนี้
type StatsTimeframe = 30 | 90 | 180 | 365 | 'all'
const TIMEFRAME_OPTIONS: { value: StatsTimeframe; label: string }[] = [
  { value: 30, label: '30 วัน' },
  { value: 90, label: '90 วัน' },
  { value: 180, label: '180 วัน' },
  { value: 365, label: '1 ปี' },
  { value: 'all', label: 'ทั้งหมด' },
]

// บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจค): เดิมสร้างวันที่ด้วย `new Date().toISOString()` (UTC) แทนที่จะใช้
// todayStr()/daysAgoStr() (Asia/Bangkok เสมอ) ที่ทั้งแอปใช้ — performed_at ทุกแถวในระบบเขียนด้วย
// todayStr() (Bangkok) เสมอ ทำให้ช่วง 00:00-06:59 น. เวลาไทย (ยังเป็นเมื่อวานตาม UTC) วันที่ "วันนี้"
// ของฟังก์ชันนี้เพี้ยนไปหนึ่งวัน กราฟ/cutoff ของหน้านี้จะไม่ตรงกับข้อมูลที่เพิ่งบันทึกไป — บั๊กคลาสเดียวกับ
// ที่เคยเจอและแก้ใน getWeekRange() มาก่อนแล้ว (lib/dashboardStats.ts) เปลี่ยนมาใช้ daysAgoStr() ตัวเดียวกัน
function lastNDays(n: number) {
  const days: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    days.push(daysAgoStr(i))
  }
  return days
}

function shortLabel(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

// ใช้ total_volume_kg ที่บันทึกไว้แม่นยำจากผลรวมทีละเซ็ตจริงก่อนเสมอ (ดูคอมเมนต์ที่ Workout.total_volume_kg
// ใน lib/types.ts) — สูตร sets*reps*weight_kg เป็นแค่ fallback สำหรับแถวเก่าที่ยังไม่มีค่านี้ ถ้าใช้สูตรนี้เป็น
// หลักจะผิดทันทีเมื่อแต่ละเซ็ตในเซสชันเดียวกันมีน้ำหนัก/reps ไม่เท่ากัน (เช่น drop set หรือเซ็ตที่ทำไม่ครบ)
// เพราะ sets/reps/weight_kg ที่เก็บในแถว workouts คือค่าของ "เซ็ตที่หนักที่สุด" เซ็ตเดียวเท่านั้น ไม่ใช่ค่าเฉลี่ย
function volumeOf(w: Workout) {
  if (w.total_volume_kg !== null && w.total_volume_kg !== undefined) return w.total_volume_kg
  return (w.sets ?? 0) * (w.reps ?? 0) * (w.weight_kg ?? 0)
}

// actualReps: จำนวน reps จริงรวมทุกเซ็ตของ workout นี้ (รวมจากตาราง workout_sets) — แม่นยำกว่า
// sets*reps (ซึ่งคูณเหมาว่าทุกเซ็ตมี reps เท่ากับเซ็ตที่หนักที่สุด) ถ้าไม่มีข้อมูล workout_sets
// (แถวเก่า) ให้ fallback ไปใช้สูตรเดิม
function repsOf(w: Workout, actualReps?: Map<string, number>) {
  const fromSets = actualReps?.get(w.id)
  if (fromSets !== undefined) return fromSets
  return (w.sets ?? 0) * (w.reps ?? 0)
}

export default function StatsPage() {
  const supabase = createClient()
  const { unit, toDisplay, format } = useWeightUnit()
  const { data: exercises = [] } = useExerciseLibrary()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [actualRepsByWorkout, setActualRepsByWorkout] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prs, setPrs] = useState<{ name: string; weight: number; reps: number | null; date: string }[]>([])
  // ฟีดแบ็ก "อยากได้ Search Box ในส่วน Personal Records — พิมพ์ 'Bench'/'Squat' แล้วกรองได้เลย" —
  // filter ฝั่ง client ล้วนๆ (prs ทั้งหมดโหลดมาอยู่ในมือแล้ว ไม่ต้อง query ใหม่) จับคู่แบบ substring
  // ไม่สนตัวพิมพ์เล็ก-ใหญ่ ครอบคลุมทั้งชื่อท่าไทย/อังกฤษที่ผู้ใช้อาจพิมพ์มา
  const [prSearch, setPrSearch] = useState('')
  // น้ำหนักตัวล่าสุด — ใช้ประมาณแคลอรี่ (ดู estimateCaloriesToday) ถ้ายังไม่เคยบันทึกน้ำหนักตัว
  // เลย ให้ fallback เป็น DEFAULT_BODYWEIGHT_KG เหมือนที่ dashboardStats.ts ใช้ที่อื่น
  const [bodyWeightKg, setBodyWeightKg] = useState<number | null>(null)
  // เพศ + ชีพจร ใช้คำนวณกราฟเรดาร์ Strength Balance ด้านล่าง (sex เลือกเกณฑ์มาตรฐาน push/pull/legs,
  // max/resting heart rate ใช้คำนวณ VO2max ตัวเดียวกับ lib/vo2max.ts ที่หน้า Health ใช้อยู่แล้ว)
  const [profile, setProfile] = useState<Pick<Profile, 'sex' | 'max_heart_rate' | 'resting_heart_rate'> | null>(null)
  // คำแนะนำเป้าหมายครั้งถัดไปของท่าที่ฝึกล่าสุด — ใช้ computeProgressiveOverload ตัวเดียวกับหน้า /coach
  // (อิง RPE เฉลี่ยของ 3 เซสชันล่าสุดจริง) เดิมหน้านี้เคยมี engine ของตัวเองแยกต่างหาก (ไม่ดูค่า RPE เลย)
  // ซึ่งซ้ำซ้อนและให้คำแนะนำคนละแบบกับ /coach โดยไม่ตั้งใจ — รวมเป็นตัวเดียวกันแทน
  const [overloadSuggestion, setOverloadSuggestion] = useState<OverloadPlan | null>(null)
  const [timeframe, setTimeframe] = useState<StatsTimeframe>(180)

  // บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจครอบใหม่): load() เดิมไม่มี guard กันผลลัพธ์เก่ามาทับของใหม่ — สลับ
  // timeframe เร็วๆ (เช่น 30 วัน -> 180 วัน -> 30 วัน) อาจทำให้ response ของ 180 วัน (ช้ากว่าเพราะข้อมูล
  // เยอะกว่า) มาถึงทีหลัง response ของ 30 วันที่เลือกล่าสุด แล้วทับ state ผิด ให้หน้าโชว์ข้อมูลไม่ตรงกับตัว
  // เลือกที่แสดงอยู่ — ใช้ token ref แบบเดียวกับที่แก้ใน exercises/[name]/page.tsx (load ยังต้องเรียกซ้ำได้
  // จากปุ่ม "ลองใหม่" ของ ErrorState ด้วย เก็บเป็น useCallback เดิม)
  const loadTokenRef = useRef(0)

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current
    setLoading(true)
    setError(null)
    let query = supabase.from('workouts').select('*').order('performed_at', { ascending: true })
    if (timeframe !== 'all') {
      const since = lastNDays(timeframe)[0]
      query = query.gte('performed_at', since)
    }
    const { data, error: err } = await query
    if (loadTokenRef.current !== token) return
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    const loaded = (data as Workout[]) ?? []
    setWorkouts(loaded)

    // ดึง reps จริงรายเซ็ตของ workout เวทเทรนนิ่งทั้งหมดในช่วงนี้มารวมกันทีเดียว (แทนการเดาจาก
    // เซ็ตที่หนักที่สุด) — ไม่ error ทั้งหน้าถ้าคิวรีนี้พลาด แค่ตกกลับไปใช้ค่าประมาณแทน
    const strengthIds = loaded.filter((w) => w.type === 'strength').map((w) => w.id)
    if (strengthIds.length > 0) {
      const { data: setsData } = await supabase.from('workout_sets').select('workout_id, reps').in('workout_id', strengthIds)
      if (loadTokenRef.current !== token) return
      const repsMap = new Map<string, number>()
      ;(setsData as { workout_id: string; reps: number | null }[] | null)?.forEach((s) => {
        repsMap.set(s.workout_id, (repsMap.get(s.workout_id) ?? 0) + (s.reps ?? 0))
      })
      setActualRepsByWorkout(repsMap)
    } else {
      setActualRepsByWorkout(new Map())
    }

    setLoading(false)
  }, [supabase, timeframe])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    async function loadPRs() {
      const { data } = await supabase
        .from('workouts')
        .select('exercise_name, weight_kg, reps, performed_at')
        .eq('type', 'strength')
        .not('exercise_name', 'is', null)
        .not('weight_kg', 'is', null)
        .order('weight_kg', { ascending: false })
        .limit(500)
      const seen = new Set<string>()
      const top: { name: string; weight: number; reps: number | null; date: string }[] = []
      ;(data ?? []).forEach((row: { exercise_name: string | null; weight_kg: number | null; reps: number | null; performed_at: string }) => {
        const name = row.exercise_name
        if (!name || row.weight_kg === null || seen.has(name)) return
        seen.add(name)
        top.push({ name, weight: row.weight_kg, reps: row.reps, date: row.performed_at })
      })
      setPrs(top.slice(0, 6))
    }
    loadPRs()
  }, [supabase])

  useEffect(() => {
    async function loadBodyWeight() {
      const { data } = await supabase
        .from('body_metrics')
        .select('weight_kg')
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setBodyWeightKg((data as { weight_kg: number | null } | null)?.weight_kg ?? null)
    }
    loadBodyWeight()
  }, [supabase])

  useEffect(() => {
    async function loadProfile() {
      const { data } = await supabase.from('profiles').select('sex, max_heart_rate, resting_heart_rate').maybeSingle()
      setProfile((data as Pick<Profile, 'sex' | 'max_heart_rate' | 'resting_heart_rate'> | null) ?? null)
    }
    loadProfile()
  }, [supabase])

  useEffect(() => {
    async function loadNextPR() {
      // ท่าล่าสุดที่ฝึก (เรียงจาก performed_at ล่าสุด) — ใช้แนะนำเป้าหมายครั้งถัดไปของท่านั้น
      const { data } = await supabase
        .from('workouts')
        .select('exercise_name, performed_at')
        .eq('type', 'strength')
        .not('exercise_name', 'is', null)
        .order('performed_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
      const lastExerciseName = (data?.[0] as { exercise_name: string | null } | undefined)?.exercise_name ?? null
      if (!lastExerciseName) {
        setOverloadSuggestion(null)
        return
      }
      const { data: history } = await supabase
        .from('workouts')
        .select('*')
        .eq('type', 'strength')
        .eq('exercise_name', lastExerciseName)
      setOverloadSuggestion(computeProgressiveOverload(lastExerciseName, (history as Workout[]) ?? [], exercises))
    }
    loadNextPR()
  }, [supabase, exercises])

  const days28 = useMemo(() => lastNDays(28), [])

  const distanceByDay = useMemo(() => {
    const map = new Map<string, number>(days28.map((d) => [d, 0]))
    workouts
      .filter((w) => w.type === 'cardio')
      .forEach((w) => {
        map.set(w.performed_at, (map.get(w.performed_at) ?? 0) + (w.distance_km ?? 0))
      })
    return days28.map((d) => ({ date: d, label: shortLabel(d), value: Number((map.get(d) ?? 0).toFixed(1)) }))
  }, [workouts, days28])

  // ---- weekly volume: last WEEKS_SHOWN weeks, each bucket = 7 days ending today ----
  const weeklyVolume = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const buckets: { start: Date; end: Date; label: string; value: number }[] = []
    for (let i = WEEKS_SHOWN - 1; i >= 0; i--) {
      const end = new Date(now)
      end.setDate(now.getDate() - i * 7)
      const start = new Date(end)
      start.setDate(end.getDate() - 6)
      buckets.push({
        start,
        end,
        label: start.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
        value: 0,
      })
    }
    workouts
      .filter((w) => w.type === 'strength')
      .forEach((w) => {
        const d = new Date(w.performed_at + 'T00:00:00')
        const bucket = buckets.find((b) => d >= b.start && d <= b.end)
        if (bucket) bucket.value += volumeOf(w)
      })
    return buckets.map((b) => ({ label: b.label, value: Math.round(b.value) }))
  }, [workouts])

  const totals = useMemo(() => {
    const strengthWorkouts = workouts.filter((w) => w.type === 'strength')
    const totalVolume = strengthWorkouts.reduce((s, w) => s + volumeOf(w), 0)
    const totalReps = strengthWorkouts.reduce((s, w) => s + repsOf(w, actualRepsByWorkout), 0)
    const strengthCount = strengthWorkouts.length
    const cardioCount = workouts.filter((w) => w.type === 'cardio').length
    const totalDistance = workouts.reduce((s, w) => s + (w.distance_km ?? 0), 0)
    const activeDays = new Set(workouts.map((w) => w.performed_at)).size

    // Duration/Calories คำนวณเป็นรายวัน (เหมือนที่ dashboard เคยทำกับ "วันนี้") แล้วรวมข้าม
    // ทุกวันในช่วง — ใช้ computeTodayTotals/estimateCaloriesToday ตัวเดียวกัน ไม่ต้องคิดสูตรซ้ำ
    const byDay = new Map<string, Workout[]>()
    workouts.forEach((w) => {
      const bucket = byDay.get(w.performed_at) ?? []
      bucket.push(w)
      byDay.set(w.performed_at, bucket)
    })
    let totalDurationMin = 0
    let totalCalories = 0
    byDay.forEach((dayWorkouts) => {
      const dayTotals = computeTodayTotals(dayWorkouts)
      totalDurationMin += dayTotals.durationMin ?? 0
      totalCalories += estimateCaloriesToday(dayWorkouts, dayTotals.durationMin, bodyWeightKg)
    })
    const avgDurationMin = activeDays > 0 ? Math.round(totalDurationMin / activeDays) : 0

    return {
      totalVolume,
      totalReps,
      strengthCount,
      cardioCount,
      totalDistance,
      activeDays,
      totalCalories,
      avgDurationMin,
    }
  }, [workouts, actualRepsByWorkout, bodyWeightKg])

  const muscleDistribution = useMemo(() => {
    const map = new Map<string, number>()
    workouts
      .filter((w) => w.type === 'strength')
      .forEach((w) => {
        const key = w.muscle_group || 'อื่นๆ'
        map.set(key, (map.get(key) ?? 0) + volumeOf(w))
      })
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1])
    const max = entries.length > 0 ? entries[0][1] : 0
    return entries.map(([name, value]) => ({ name, value: Math.round(value), pct: max === 0 ? 0 : value / max }))
  }, [workouts])

  // ฟีดแบ็ก (design review) "Muscle Distribution อ่านเป็นตัวเลข kg มากเกินไป — บอกว่า 'ขาเยอะ' แต่ไม่บอก
  // ทันทีว่าสมดุลหรือไม่ ผมชอบแนวทาง Dashboard มากกว่า: Balance 41% · ต้องปรับสมดุล แล้วค่อย breakdown ต่อ"
  // — computeTrainingBalance() (lib/dashboardStats.ts, ใช้กับ Dashboard's WeeklyMuscleHeatmap อยู่แล้ว)
  // ไม่ได้ผูกกับ "เซ็ต/สัปดาห์นี้" จริงๆ (แค่พารามิเตอร์ชื่อ setsByMuscle) — เป็นแค่สัดส่วน (share) ของแต่ละ
  // กลุ่มเทียบผลรวม เทียบกับสัดส่วนอุดมคติ (100/จำนวนกลุ่ม%) ล้วนๆ ไม่สนใจหน่วย/ช่วงเวลา จึงใช้กับ kg-volume
  // ของช่วงเวลาที่เลือกได้ตรงๆ (30D/90D/...) โดยไม่ต้องคิดสูตรใหม่ — สูตร/เกณฑ์เดียวกับ Dashboard เป๊ะ ไม่มี
  // ทางขัดกันเอง (ใช้ map เดียวกับ muscleDistribution ด้านบนแทนการวนซ้ำ workouts รอบที่สอง)
  const muscleBalance = useMemo(() => {
    if (muscleDistribution.length === 0) return null
    const map: Record<string, number> = {}
    muscleDistribution.forEach((m) => {
      map[m.name] = m.value
    })
    return computeTrainingBalance(map, VOLUME_MUSCLES)
  }, [muscleDistribution])

  // Strength Balance radar — 5 แกน: Push/Pull/Legs เทียบเกณฑ์มาตรฐาน 1RM ต่อน้ำหนักตัว (ดู
  // lib/strengthStandards.ts), Core จากสัดส่วนวอลุ่มจริงของกล้ามเนื้อแกนกลางเทียบวอลุ่มรวม (ไม่มีเกณฑ์
  // มาตรฐานสากลแบบ 3 แกนแรก — ยืนยันแนวทางนี้แล้วว่าดีกว่าสมมติเกณฑ์ขึ้นเอง), Endurance จาก VO2max
  // ประมาณจากชีพจร (สูตร Uth เดียวกับหน้า Health) — ทุกแกนอยู่บนสเกล 0-100 เดียวกันแม้จะมาจากคนละที่มา
  const strengthBalance = useMemo(() => {
    const push = computeStrengthAxis('push', workouts, bodyWeightKg, profile?.sex ?? null)
    const pull = computeStrengthAxis('pull', workouts, bodyWeightKg, profile?.sex ?? null)
    const legs = computeStrengthAxis('legs', workouts, bodyWeightKg, profile?.sex ?? null)

    const coreVolumeKg = workouts
      .filter((w) => w.type === 'strength' && w.muscle_group === 'แกนกลางลำตัว')
      .reduce((sum, w) => sum + volumeOf(w), 0)
    const core = coreVolumeToPct(coreVolumeKg, totals.totalVolume)

    const vo2max = computeVO2Max(profile?.max_heart_rate ?? null, profile?.resting_heart_rate ?? null)
    const endurance = vo2MaxToPct(vo2max)

    // pct: null = ไม่มีข้อมูลให้คำนวณแกนนี้เลย (ต้องแยกจาก 0 ซึ่งคือ "มีข้อมูลจริงแต่คะแนนต่ำ") — value คือค่า
    // ตัวเลขจริงที่ส่งให้ RadarChart วาดกราฟ (Recharts วาดรูปหลายเหลี่ยมปิด ไม่มีแนวคิด "ข้ามแกนนี้" แบบ
    // connectNulls ของ LineChart ถ้าใส่ null ตรงๆ จุดยอดจะกลายเป็น NaN ทำให้รูปทรงพัง) จึงใช้ 0 แทนตำแหน่ง
    // แต่แยกแสดงผลด้วย pct (null) ผ่าน custom dot + tooltip แทน
    return [
      { axis: 'Push', pct: push.pct, value: push.pct ?? 0 },
      { axis: 'Pull', pct: pull.pct, value: pull.pct ?? 0 },
      { axis: 'Legs', pct: legs.pct, value: legs.pct ?? 0 },
      { axis: 'Core', pct: core, value: core },
      { axis: 'Endurance', pct: endurance, value: endurance },
    ]
  }, [workouts, bodyWeightKg, profile, totals.totalVolume])

  // มีข้อมูลจริงพอให้กราฟมีความหมายไหม — ต้องมีอย่างน้อย 1 แกนที่ไม่ใช่ null/0 (ไม่งั้นกราฟจะเป็นจุดเดียวตรง
  // กลางที่ไม่สื่อความหมายอะไร ดูเหมือนบั๊กมากกว่าข้อมูลจริง)
  const hasStrengthBalanceData = strengthBalance.some((a) => (a.pct ?? 0) > 0)
  const noDataAxes = strengthBalance.filter((a) => a.pct === null).map((a) => a.axis)

  const topExercises = useMemo(() => {
    const map = new Map<string, number>()
    workouts
      .filter((w) => w.type === 'strength' && w.exercise_name)
      .forEach((w) => {
        map.set(w.exercise_name!, (map.get(w.exercise_name!) ?? 0) + 1)
      })
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [workouts])

  const exerciseNames = useMemo(() => {
    const set = new Set<string>()
    workouts.filter((w) => w.type === 'strength' && w.exercise_name).forEach((w) => set.add(w.exercise_name!))
    return [...set].sort()
  }, [workouts])

  // ท่าที่ log ไว้แต่ไม่มี weight/reps (เช่นท่า bodyweight) ยังโผล่ใน selector ให้เลือกเองได้ตามปกติ แค่ไม่
  // ถูกพิจารณาเป็นตัวเลือก default อัตโนมัติ — default ควรเป็นท่าที่ "คำนวณ 1RM ได้จริง" และฝึกล่าสุด ไม่ใช่
  // เรียงตามตัวอักษร (ก่อนหน้านี้เป็น A-Z ล้วนๆ ซึ่งสุ่มเกินไป ไม่สื่อว่าผู้ใช้กำลังสนใจท่าไหนอยู่)
  const latestExerciseWithData = useMemo(() => {
    const latestByName = new Map<string, string>()
    workouts
      .filter((w) => w.type === 'strength' && w.exercise_name && w.weight_kg && w.reps)
      .forEach((w) => {
        const prev = latestByName.get(w.exercise_name!)
        if (!prev || w.performed_at > prev) latestByName.set(w.exercise_name!, w.performed_at)
      })
    let best: string | null = null
    let bestDate = ''
    latestByName.forEach((date, name) => {
      if (date > bestDate) {
        bestDate = date
        best = name
      }
    })
    return best
  }, [workouts])

  const [selectedExercise, setSelectedExercise] = useState('')

  useEffect(() => {
    if (!selectedExercise && exerciseNames.length > 0) {
      setSelectedExercise(latestExerciseWithData ?? exerciseNames[0])
    }
  }, [exerciseNames, latestExerciseWithData, selectedExercise])

  // combobox ค้นหาท่าสำหรับ Estimated 1RM Trend — แทน native <select> เดิมที่ไม่รองรับการพิมพ์กรองรายชื่อ
  // (มีปัญหาชัดเมื่อคลังท่าโตขึ้น) แยก state ค้นหาออกจาก selectedExercise เอง ไม่กรอง exerciseNames ที่ใช้
  // แสดงในลิสต์ตาม query — แค่กรองตอน render รายการตัวเลือก
  const [exerciseQuery, setExerciseQuery] = useState('')
  const [exercisePickerOpen, setExercisePickerOpen] = useState(false)
  const exerciseBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  // ฟีดแบ็ก (design review — "KPI ด้านบนเยอะเกินไป (8 ตัว) บนมือถือกลายเป็น dashboard ของตัวเลข") — เหลือ
  // 4 ตัวหลักที่มองแวบเดียวแล้วเข้าใจภาพรวมทันที (Total Volume/เซสชันเวท/วันที่ออกกำลังกาย/ระยะทางคาร์ดิโอ)
  // ย้าย Total Reps/แคลอรี่/เวลาเฉลี่ย ไปซ่อนหลัง toggle นี้แทน (pattern เดียวกับ "ดูรายละเอียดทั้งหมด" ใน
  // WeeklyVolume.tsx ฝั่ง Dashboard) ไม่ตัดข้อมูลออกเลย แค่ลด default density
  const [moreStatsOpen, setMoreStatsOpen] = useState(false)

  const filteredExerciseNames = useMemo(() => {
    const q = exerciseQuery.trim().toLowerCase()
    if (!q) return exerciseNames
    return exerciseNames.filter((name) => name.toLowerCase().includes(q))
  }, [exerciseNames, exerciseQuery])

  function openExercisePicker() {
    if (exerciseBlurTimeout.current) clearTimeout(exerciseBlurTimeout.current)
    setExerciseQuery('')
    setExercisePickerOpen(true)
  }

  function scheduleCloseExercisePicker() {
    // ดีเลย์ปิดเล็กน้อยให้ click ที่ตัวเลือกในลิสต์ทำงานก่อน blur จะสั่งปิด (แพทเทิร์นเดียวกับ ExercisePicker)
    exerciseBlurTimeout.current = setTimeout(() => setExercisePickerOpen(false), 150)
  }

  function pickExercise(name: string) {
    setSelectedExercise(name)
    setExercisePickerOpen(false)
    setExerciseQuery('')
  }

  const oneRmTrend = useMemo(() => {
    if (!selectedExercise) return []
    return workouts
      .filter((w) => w.type === 'strength' && w.exercise_name === selectedExercise && w.weight_kg && w.reps)
      .map((w) => ({
        label: shortLabel(w.performed_at),
        value: toDisplay(Math.round(w.weight_kg! * (1 + (w.reps ?? 0) / 30) * 10) / 10),
      }))
  }, [workouts, selectedExercise, toDisplay])

  if (loading) {
    return <LoadingState />
  }

  if (error) {
    return <ErrorState title="โหลดข้อมูลสถิติไม่สำเร็จ" message={error} onRetry={load} />
  }

  const timeframeLabel = TIMEFRAME_OPTIONS.find((o) => o.value === timeframe)?.label ?? ''
  // ฟีดแบ็ก "อยากเลือกดูช่วงเวลาของหน้า /stats เอง" — pill selector สไตล์เดียวกับที่ BodyMetricsRow.tsx
  // ใช้อยู่แล้ว (rounded-full border border-line bg-surface2 p-0.5, active = amber tint) ให้ทั้งแอปอ่าน
  // สอดคล้องกัน — print:hidden เพราะเป็นตัวเลือกแบบโต้ตอบ ไม่มีความหมายบนกระดาษที่พิมพ์ออกมา
  const timeframeSelector = (
    <div className="print:hidden shrink-0 flex items-center gap-0.5 rounded-full border border-line bg-surface2 p-0.5 overflow-x-auto">
      {TIMEFRAME_OPTIONS.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => setTimeframe(opt.value)}
          className="px-2.5 py-1 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors"
          style={timeframe === opt.value ? { backgroundColor: '#E8A33D22', color: '#E8A33D' } : { color: '#9498A0' }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )

  if (workouts.length === 0) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="font-display text-2xl tracked uppercase">สถิติ · {timeframeLabel}</h1>
          {timeframeSelector}
        </div>
        <EmptyState
          icon="📈"
          title="ยังไม่มีข้อมูลสถิติ"
          message={`ไม่มีข้อมูลในช่วง ${timeframeLabel} — ลองเลือกช่วงเวลาที่กว้างขึ้น หรือเริ่มบันทึกการออกกำลังกายครั้งแรก`}
          ctaHref="/log"
          ctaLabel="+ เริ่มบันทึก"
        />
      </div>
    )
  }

  const filteredPrs = prSearch.trim()
    ? prs.filter((p) => p.name.toLowerCase().includes(prSearch.trim().toLowerCase()))
    : prs

  return (
    <div className="space-y-8">
      {/* ฟีดแบ็ก "One-Click Export PDF Report ส่งให้เทรนเนอร์" — ปุ่มเรียก window.print() ตรงๆ (ไม่เพิ่ม
          dependency ใหม่, เหมือนแนวทาง canvas ที่ ShareWeeklySummaryButton.tsx เลือกไว้ก่อนหน้านี้) —
          หน้านี้มีข้อมูลสรุปครบอยู่แล้ว (Total Volume/Reps, Weekly Volume, Muscle Distribution, Cardio,
          1RM Trend, Strength Balance, PRs) เหมาะเป็นรายงานความคืบหน้าอยู่แล้วโดยไม่ต้องสร้างหน้าใหม่
          แยกต่างหาก — ปุ่มเองก็ print:hidden (ไม่ต้องปรากฏในรายงานที่พิมพ์ออกมา) */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="font-display text-2xl tracked uppercase">สถิติ · {timeframeLabel}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {timeframeSelector}
          <button
            type="button"
            onClick={() => window.print()}
            className="print:hidden shrink-0 flex items-center gap-1.5 rounded-full border border-amber/40 text-amber text-[12px] font-display tracked uppercase px-3 py-2 active:scale-[0.98] transition"
          >
            📄 Export PDF
          </button>
        </div>
      </div>
      {/* หัวรายงานที่เห็นเฉพาะตอนพิมพ์ — บนจอปกติซ่อนไว้ (hidden print:block) ให้บริบท "รายงานของใคร/
          วันที่ไหน" ชัดเจนตอนเปิดไฟล์ PDF ย้อนหลัง (บนจอมี h1 ด้านบนอยู่แล้วไม่ต้องซ้ำ) */}
      <p className="hidden print:block text-sm text-muted">
        FITLOG — Progress Report ·{' '}
        {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Volume" value={Math.round(toDisplay(totals.totalVolume))} unit={unit} accent="steel" />
        <StatCard label="เซสชันเวท" value={totals.strengthCount} unit="ครั้ง" accent="moss" />
        <StatCard label="วันที่ออกกำลังกาย" value={totals.activeDays} unit="วัน" accent="moss" />
        <StatCard label="ระยะทางคาร์ดิโอรวม" value={totals.totalDistance} unit="กม." accent="rust" decimals={1} />
      </div>

      <button
        type="button"
        onClick={() => setMoreStatsOpen((v) => !v)}
        className="text-[12px] font-display tracked uppercase text-amber -mt-4 self-start"
      >
        {moreStatsOpen ? 'ซ่อนสถิติเพิ่มเติม ↑' : 'ดูสถิติเพิ่มเติม →'}
      </button>

      {moreStatsOpen && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 -mt-4">
          <StatCard label="Total Reps" value={totals.totalReps} unit="ครั้ง" accent="amber" />
          <StatCard label="แคลอรี่ที่เผาผลาญรวม" value={totals.totalCalories} unit="kcal" accent="amber" />
          {/* ฟีดแบ็ก (design review, P0) "'เวลาเฉลี่ย/วัน' ต้องนิยามชัดว่าหารด้วยวันฝึกหรือวันปฏิทิน" — ตรวจ
              สูตรแล้วยืนยันว่า avgDurationMin หารด้วย activeDays (ตัวเดียวกับ "วันที่ออกกำลังกาย" ด้านบน —
              นับเฉพาะวันที่มี workout จริง) อยู่แล้ว ไม่ใช่จำนวนวันทั้งหมดในช่วงเวลา — ตรงกับที่แนะนำว่า
              semantic ที่ useful กว่าคือ "ต่อวันฝึก" ไม่ต้องแก้สูตร แก้แค่ label ให้สื่อความหมายที่คำนวณจริง */}
          <StatCard label="เวลาเฉลี่ย/วันฝึก" value={totals.avgDurationMin} unit="นาที" accent="steel" />
        </div>
      )}

      {/* ฟีดแบ็ก (design review) "Weekly Volume ควรเป็นพระเอกของหน้า — คือข้อมูลที่ผู้ใช้เปิด Stats มาดูบ่อย
          ที่สุด ไม่ใช่แค่ section เฉยๆ เท่าๆ กับอันอื่น" — เดิมมีแค่ h2 เล็กๆ (เท่ากับหัวข้อ section อื่นทุก
          จุด) นำหน้ากราฟ ไม่มีตัวเลขสรุป/เทียบสัปดาห์ก่อนให้เห็นทันที — เพิ่มตัวเลข "วอลุ่มสัปดาห์นี้" ตัวใหญ่
          + ป้ายเทียบกับสัปดาห์ก่อน (เครื่องหมาย/สีเป็นกลาง ไม่ตัดสินว่าวอลุ่มขึ้น=ดีเสมอไป เพราะเทรนหนักขึ้น
          กับ overtraining ก็ทำให้วอลุ่มขึ้นเหมือนกัน) นำหน้ากราฟเดิม (ไม่แตะกราฟ/ข้อมูล 8 สัปดาห์เลย) */}
      <section>
        {(() => {
          const thisWeek = weeklyVolume.length > 0 ? weeklyVolume[weeklyVolume.length - 1].value : 0
          const prevWeek = weeklyVolume.length > 1 ? weeklyVolume[weeklyVolume.length - 2].value : null
          const pctChange = prevWeek !== null && prevWeek > 0 ? Math.round(((thisWeek - prevWeek) / prevWeek) * 100) : null
          const trendColor = pctChange === null || pctChange === 0 ? NEUTRAL.mutedIcon : pctChange > 0 ? COLORS.moss : COLORS.rust
          return (
            <PremiumCard className="p-4">
              <h2 className="font-display text-sm tracked uppercase text-muted">Training Volume</h2>
              <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                <p className="font-mono font-bold text-2xl text-ink">
                  {Math.round(toDisplay(thisWeek)).toLocaleString()} <span className="text-sm text-muted font-sans">{unit} สัปดาห์นี้</span>
                </p>
                {pctChange !== null && (
                  <span className="font-mono font-semibold text-[12px]" style={{ color: trendColor }}>
                    {pctChange > 0 ? '↑' : pctChange < 0 ? '↓' : ''} {Math.abs(pctChange)}% จากสัปดาห์ก่อน
                  </span>
                )}
              </div>
              <p className="text-[12px] text-muted mt-2">{WEEKS_SHOWN} สัปดาห์ล่าสุด ({unit})</p>
              <div className="h-40 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyVolume.map((b) => ({ ...b, value: Math.round(toDisplay(b.value)) }))} margin={{ top: 4, right: 4, left: -4, bottom: 0 }}>
                    <CartesianGrid stroke={NEUTRAL.chipInactive} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: NEUTRAL.mutedIcon, fontSize: 10 }}
                      axisLine={{ stroke: NEUTRAL.chipInactive }}
                      tickLine={false}
                    />
                    {/* บั๊ก (ฟีดแบ็กพร้อมสกรีนช็อต) — ตัวเลขแกน Y โดนตัดขอบซ้ายเหลือแค่ "00" เมื่อวอลุ่มสะสม
                        ขึ้นไปถึงหลักหมื่น (เช่น "40,000") margin.left ติดลบเดิม (-20) บีบพื้นที่แกนจนตัวเลข
                        5-6 หลักไม่พอที่ใส่ — ลด margin ติดลบลง (-20 -> -4) + เพิ่ม tickFormatter ย่อเป็น "40k"
                        แทน "40,000" กันปัญหาเดิมซ้ำอีกแม้วอลุ่มจะโตขึ้นไปอีกในอนาคต */}
                    <YAxis
                      tick={{ fill: NEUTRAL.mutedIcon, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={44}
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
            </PremiumCard>
          )
        })()}
      </section>

      {muscleDistribution.length > 0 && (
        <section>
          <h2 className="font-display text-sm tracked uppercase text-muted mb-3">Muscle Distribution (วอลุ่มรวม)</h2>
          <PremiumCard className="p-4 space-y-3">
            {/* ฟีดแบ็ก (design review) "ควรเน้น trend/comparison มากกว่า raw volume — Balance 41% ·
                ต้องปรับสมดุล แล้วค่อย breakdown ต่อ" — hero metric เดียวกับ Dashboard's WeeklyMuscleHeatmap
                (สูตร/สี/ป้ายเดียวกันเป๊ะ ผ่าน computeTrainingBalance/BALANCE_STATUS_LABEL) นำหน้า breakdown
                รายกลุ่มเดิมที่ยังอยู่ครบด้านล่าง ไม่ได้ตัดตัวเลข kg ออกเลย แค่ให้ insight มาก่อนตัวเลขดิบ */}
            {muscleBalance && (
              <div className="pb-3 border-b border-white/5">
                <p className="font-mono font-bold text-2xl leading-none" style={{ color: BALANCE_TIER_COLOR[muscleBalance.tier] }}>
                  {muscleBalance.score}%
                  <span className="font-sans font-bold text-sm ml-1.5 align-middle">
                    · {BALANCE_STATUS_LABEL[muscleBalance.tier]}
                  </span>
                </p>
                {muscleBalance.regionWarning ? (
                  <p className="text-[12px] text-muted mt-1">{muscleBalance.regionWarning}</p>
                ) : muscleBalance.recommendedMuscles.length > 0 ? (
                  <p className="text-[12px] text-muted mt-1">แนะนำเพิ่ม {muscleBalance.recommendedMuscles.join(' + ')}</p>
                ) : null}
              </div>
            )}
            {muscleDistribution.map((m) => (
              <div key={m.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-ink">{m.name}</span>
                  <span className="text-muted font-mono">{Math.round(toDisplay(m.value)).toLocaleString()} {unit}</span>
                </div>
                <div className="h-2 rounded-full bg-surface2 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(4, m.pct * 100)}%`,
                      background: MUSCLE_GROUP_COLORS[m.name as keyof typeof MUSCLE_GROUP_COLORS] || NEUTRAL.mutedIcon,
                    }}
                  />
                </div>
              </div>
            ))}
          </PremiumCard>
        </section>
      )}

      <section>
        {/* v: mockup Priority 12 (Cardio Dashboard) ขอสรุปคาร์ดิโอที่ครบกว่าแค่กราฟระยะทาง (เวลา/เซสชัน/
            แคลอรี่/ชีพจร/HR Zone) — ข้อมูลนั้นคำนวณไว้ครบแล้วที่ /cardio (ใช้ engine เดียวกับการ์ด
            WeeklyCardioVolume บน Dashboard เดสก์ท็อป) ลิงก์ตรงนี้แทนการย้ำข้อมูลซ้ำในหน้านี้อีกที */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-sm tracked uppercase text-muted">ระยะทางคาร์ดิโอ (กม. ต่อวัน, 28 วันล่าสุด)</h2>
          <a href="/cardio" className="text-[12px] text-amber hover:underline shrink-0">
            ดู Cardio Dashboard →
          </a>
        </div>
        <PremiumCard className="h-48 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distanceByDay} margin={{ top: 4, right: 4, left: -4, bottom: 0 }}>
              <CartesianGrid stroke={NEUTRAL.chipInactive} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: NEUTRAL.mutedIcon, fontSize: 10 }}
                interval={6}
                axisLine={{ stroke: NEUTRAL.chipInactive }}
                tickLine={false}
              />
              <YAxis tick={{ fill: NEUTRAL.mutedIcon, fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                cursor={{ fill: 'rgba(193,80,58,0.08)' }}
                contentStyle={{ background: '#1C1F24', border: `1px solid ${NEUTRAL.chipInactive}`, borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: NEUTRAL.mutedIcon }}
                itemStyle={{ color: '#F3F0E8' }}
                formatter={(v: number) => [`${v} กม.`, 'ระยะทาง']}
              />
              <Bar dataKey="value" fill={COLORS.rust} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </PremiumCard>
      </section>

      {hasStrengthBalanceData && (
        <section>
          <h2 className="font-display text-sm tracked uppercase text-muted mb-3">Strength Balance</h2>
          <PremiumCard className="h-64 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={strengthBalance} outerRadius="70%">
                <PolarGrid stroke={NEUTRAL.chipInactive} />
                <PolarAngleAxis dataKey="axis" tick={{ fill: NEUTRAL.mutedIcon, fontSize: 11 }} />
                <Radar
                  dataKey="value"
                  stroke={COLORS.violet}
                  fill={COLORS.violet}
                  fillOpacity={0.35}
                  dot={(dotProps: any) => {
                    const { cx, cy, payload, key } = dotProps
                    // บั๊ก (เจอตอนไล่เช็คโค้ดวันนี้): Radar ของ Recharts ส่ง dotProps.payload เป็น "Point"
                    // ภายในของมันเอง (มี x/y/cx/cy/name/value/angle/radius) ไม่ใช่ raw data row ที่ส่งเข้า
                    // <RadarChart data={strengthBalance}> ตรงๆ — raw row จริงอยู่ที่ payload.payload อีกชั้น
                    // (ตรวจจาก node_modules/recharts/lib/polar/Radar.js: renderDots() ทำ payload: entry โดย
                    // entry = points[i] ซึ่งตัวมันเองมี .payload = raw row อยู่ข้างใน) เดิมอ่าน payload?.pct
                    // ตรงๆ เลยได้ undefined เสมอ (ไม่มี key "pct" ที่ชั้นนี้) ทำให้ noData เป็น false ตลอด จุด
                    // "ไม่มีข้อมูล" ที่ควรเป็นวงกลมจางๆ เลยกลายเป็นสีม่วงทึบเหมือนมีข้อมูลจริงทุกจุด — ต้อง
                    // อ่านผ่าน payload.payload.pct (Tooltip formatter ด้านล่างไม่ติดปัญหานี้ เพราะ Tooltip
                    // ของ Recharts ดึง payload จาก raw data row โดยตรงอยู่แล้ว คนละ code path กับ dot)
                    const noData = payload?.payload?.pct === null
                    return (
                      <circle
                        key={key}
                        cx={cx}
                        cy={cy}
                        r={3}
                        fill={noData ? NEUTRAL.chipInactive : COLORS.violet}
                        stroke={noData ? NEUTRAL.mutedIcon : COLORS.violet}
                        strokeWidth={noData ? 1 : 0}
                      />
                    )
                  }}
                />
                <Tooltip
                  contentStyle={{ background: '#1C1F24', border: `1px solid ${NEUTRAL.chipInactive}`, borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: NEUTRAL.mutedIcon }}
                  itemStyle={{ color: '#F3F0E8' }}
                  formatter={(v: number, _name: string, entry: any) =>
                    entry?.payload?.pct === null ? ['ไม่มีข้อมูล', 'ระดับ'] : [`${v}%`, 'ระดับ']
                  }
                />
              </RadarChart>
            </ResponsiveContainer>
          </PremiumCard>
          {noDataAxes.length > 0 && (
            <p className="text-[12px] text-muted mt-1.5">
              ยังไม่มีข้อมูล: {noDataAxes.join(', ')}
            </p>
          )}
          {/* ฟีดแบ็ก "คำอธิบายยาวเป็นพรืดและตัวเล็ก อ่านเหมือน text หลุดกรอบ" — ใส่กรอบ info box จางๆ
              ให้แยกจากเนื้อหาอื่นชัดเจนขึ้น ไม่แตะเนื้อหา/ความยาวข้อความเลย แค่เปลี่ยน container */}
          <p
            className="text-[12px] text-muted mt-2 px-3 py-2 rounded-lg border"
            style={{ backgroundColor: 'rgba(255,255,255,.03)', borderColor: NEUTRAL.chipInactive }}
          >
            Push/Pull/Legs เทียบเกณฑ์มาตรฐาน 1RM ต่อน้ำหนักตัว (Novice–Elite){profile?.sex ? '' : ' — ตั้งค่าเพศในโปรไฟล์เพื่อความแม่นยำขึ้น'}
            {' · '}Core จากสัดส่วนวอลุ่มฝึกจริงของกล้ามเนื้อแกนกลาง · Endurance จาก VO2max ประมาณ (ต้องตั้งค่าชีพจรในโปรไฟล์)
          </p>
        </section>
      )}

      {exerciseNames.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-sm tracked uppercase text-muted">Estimated 1RM Trend</h2>
            {/* dropdown เลือกท่าไม่มีความหมายในรายงานที่พิมพ์แล้ว (แก้ไม่ได้อยู่ดี) — ซ่อนแล้วโชว์ชื่อท่า
                ที่เลือกไว้ ณ ตอนพิมพ์เป็นข้อความแทน ให้ยังรู้ว่ากราฟข้างล่างเป็นของท่าไหน */}
            <div className="relative print:hidden">
              <button
                type="button"
                onClick={() => (exercisePickerOpen ? setExercisePickerOpen(false) : openExercisePicker())}
                className="flex items-center gap-1.5 max-w-[170px] bg-surface2 border border-line rounded-full text-xs px-3 py-1 text-ink outline-none"
              >
                <span className="truncate">{selectedExercise || 'เลือกท่า'}</span>
                <span className="shrink-0 text-muted text-[10px]">▾</span>
              </button>
              {exercisePickerOpen && (
                <div className="absolute z-30 right-0 mt-1.5 w-56 rounded-lg bg-surface2 border border-line shadow-lg overflow-hidden">
                  <input
                    autoFocus
                    value={exerciseQuery}
                    onChange={(e) => setExerciseQuery(e.target.value)}
                    onBlur={scheduleCloseExercisePicker}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setExercisePickerOpen(false)
                    }}
                    placeholder="ค้นหาท่า..."
                    autoComplete="off"
                    className="w-full bg-transparent border-b border-line px-3 py-2 text-xs text-ink outline-none placeholder:text-muted"
                  />
                  <ul className="max-h-52 overflow-y-auto">
                    {filteredExerciseNames.length === 0 ? (
                      <li className="px-3 py-3 text-xs text-muted text-center">ไม่พบท่านี้</li>
                    ) : (
                      filteredExerciseNames.map((name) => (
                        <li key={name}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickExercise(name)}
                            className={`w-full text-left px-3 py-2 text-xs transition hover:bg-surface truncate ${
                              name === selectedExercise ? 'text-amber' : 'text-ink'
                            }`}
                          >
                            {name}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
            <span className="hidden print:inline text-xs text-ink">{selectedExercise}</span>
          </div>
          {oneRmTrend.length > 1 ? (
            <PremiumCard className="h-44 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={oneRmTrend} margin={{ top: 4, right: 4, left: -4, bottom: 0 }}>
                  <CartesianGrid stroke={NEUTRAL.chipInactive} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: NEUTRAL.mutedIcon, fontSize: 10 }} axisLine={{ stroke: NEUTRAL.chipInactive }} tickLine={false} />
                  {/* บั๊ก (ฟีดแบ็กพร้อมสกรีนช็อต) — ตัวเลขแกน Y โดนตัดขอบซ้าย เห็นเป็น "'5"/"'0"/"i5"
                      แทนที่จะเป็น "25"/"20"/"15" — margin.left ติดลบเดิม (-20) บีบพื้นที่แกนจนตัวเลข
                      2 หลักไม่พอที่ใส่แล้ว (สาเหตุเดียวกับกราฟ Weekly Volume ด้านบน) */}
                  <YAxis tick={{ fill: NEUTRAL.mutedIcon, fontSize: 10 }} axisLine={false} tickLine={false} width={40} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ background: '#1C1F24', border: `1px solid ${NEUTRAL.chipInactive}`, borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: NEUTRAL.mutedIcon }}
                    itemStyle={{ color: '#F3F0E8' }}
                    formatter={(v: number) => [`${v} ${unit}`, 'Estimated 1RM']}
                  />
                  <Line type="monotone" dataKey="value" stroke={COLORS.rust} strokeWidth={2} dot={{ r: 2, fill: COLORS.rust }} />
                </LineChart>
              </ResponsiveContainer>
            </PremiumCard>
          ) : (
            <PremiumCard className="text-sm text-muted px-4 py-6 text-center">บันทึกท่านี้อีกอย่างน้อย 2 ครั้งเพื่อดูแนวโน้ม</PremiumCard>
          )}
          <p className="text-[12px] text-muted mt-2">คำนวณด้วยสูตร Epley: น้ำหนัก × (1 + reps/30) — เป็นค่าประมาณ ไม่ใช่ค่าวัดจริง</p>
        </section>
      )}

      {overloadSuggestion && (
        <section>
          <h2 className="font-display text-sm tracked uppercase text-muted mb-3">🎯 Progressive Overload แนะนำ</h2>
          <a
            href={`/exercises/${encodeURIComponent(overloadSuggestion.exerciseName)}`}
            // v52: ฟีดแบ็ก "หน้าอื่นควรอิงภาษาเดียวกับ Dashboard" — rounded-lg (8px) -> rounded-card (24px,
            // token เดียวกับ PremiumCard) + เพิ่ม hover:bg-surface2 คู่กับ active:bg-surface2 เดิม (เดิมมีแค่
            // active ซึ่งรองรับแตะบนมือถือ แต่ไม่มี feedback ตอน hover ด้วยเมาส์บนเดสก์ท็อป)
            className="block rounded-card border border-violet/25 shadow-glow px-5 py-5 hover:bg-surface2 active:bg-surface2 transition"
            style={
              {
                backgroundColor: '#1C1F24',
                '--glow-color': withAlpha(COLORS.violet, '26'),
                '--glow-color-soft': withAlpha(COLORS.violet, '1A'),
              } as React.CSSProperties & { '--glow-color'?: string; '--glow-color-soft'?: string }
            }
          >
            <div className="flex items-center justify-between mb-2">
              <p className="font-display text-base tracked uppercase text-ink">{overloadSuggestion.exerciseName}</p>
              <span className="text-muted text-xs">โปรไฟล์ท่า →</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[12px] tracked uppercase text-muted">Current</p>
                <p className="font-mono text-base text-muted">
                  {format(overloadSuggestion.currentWeight)} × {overloadSuggestion.currentReps}
                </p>
              </div>
              <div>
                <p className="text-[12px] tracked uppercase text-muted">Target</p>
                <p className="font-mono text-base text-violet">
                  {format(overloadSuggestion.targetWeight)} × {overloadSuggestion.targetReps}
                </p>
              </div>
            </div>
            {/* เหตุผลของคำแนะนำ (อิง RPE เฉลี่ย 3 เซสชันล่าสุด) — engine เดียวกับหน้า /coach
                (computeProgressiveOverload ใน lib/aiCoach.ts) ตรงกับ roadmap Priority 7
                ("ครั้งหน้าควรเล่นเท่าไหร่?") */}
            <p className="text-[12px] text-muted mt-2">{overloadSuggestion.rationale}</p>
          </a>
        </section>
      )}

      {prs.length > 0 && (
        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-display text-sm tracked uppercase text-muted">🏆 Personal Records (น้ำหนักสูงสุด)</h2>
            {/* ฟีดแบ็ก "อยากได้ Search Box ในส่วน Personal Records — พิมพ์ 'Bench'/'Squat' แล้วกรองได้เลย"
                — โชว์เฉพาะตอนมี PR เยอะพอจะรำคาญเลื่อนหา (>6 รายการ) ไม่ให้กล่องค้นหาโผล่มาเปล่าๆ ตอนมี
                PR แค่ 2-3 ท่า ซึ่งเห็นครบในตาเดียวอยู่แล้ว */}
            {prs.length > 6 && (
              <input
                type="text"
                inputMode="search"
                value={prSearch}
                onChange={(e) => setPrSearch(e.target.value)}
                placeholder="ค้นหาท่า..."
                className="w-32 sm:w-44 shrink-0 bg-surface2 text-ink text-xs rounded-full px-3 py-1.5 border border-line outline-none focus:border-violet placeholder:text-muted"
              />
            )}
          </div>
          {/* border-violet/20 เดิม เน้นการ์ดนี้ว่าเป็น Personal Records แยกจากลิสต์ทั่วไป — PremiumCard
              ตัด border สีกลางทึบออกแล้ว (v48: ใช้ contact shadow บอกขอบแทน) ยังคงสีม่วงไว้ผ่าน style
              override (ชนะ default เพราะ ...style วางท้ายสุดเสมอ) แทนที่จะเสียจุดเด่นสีนี้ไปเฉยๆ */}
          {filteredPrs.length === 0 ? (
            <p className="text-xs text-muted text-center py-6">ไม่พบท่าที่ตรงกับ &quot;{prSearch.trim()}&quot;</p>
          ) : (
            <PremiumCard className="divide-y divide-white/5" style={{ border: `1px solid ${withAlpha(COLORS.violet, '33')}` }}>
              {filteredPrs.map((p) => {
                const isNewPR = p.date === todayStr()
                return (
                  <a
                    key={p.name}
                    href={`/exercises/${encodeURIComponent(p.name)}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-surface2 active:bg-surface2 transition"
                  >
                    <span className="text-sm text-ink flex items-center gap-1.5">
                      {p.name}
                      {isNewPR && (
                        <span className="animate-pop-in text-[12px] font-display tracked uppercase text-bg bg-violet rounded-full px-1.5 py-0.5">
                          NEW
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-sm text-violet">
                      {format(p.weight)}{p.reps ? ` × ${p.reps}` : ''}
                    </span>
                  </a>
                )
              })}
            </PremiumCard>
          )}
        </section>
      )}

      {topExercises.length > 0 && (
        <section>
          <h2 className="font-display text-sm tracked uppercase text-muted mb-3">ท่ายอดฮิต</h2>
          <PremiumCard className="divide-y divide-white/5">
            {topExercises.map(([name, count]) => (
              <a
                key={name}
                href={`/exercises/${encodeURIComponent(name)}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface2 active:bg-surface2 transition"
              >
                <span className="text-sm text-ink">{name}</span>
                <span className="font-mono text-sm text-amber">{count}×</span>
              </a>
            ))}
          </PremiumCard>
        </section>
      )}

      <a
        href="/history"
        className="print:hidden block text-center text-xs tracked uppercase text-muted hover:text-amber transition py-2"
      >
        ดูประวัติทั้งหมด →
      </a>
      <a
        href="/achievements"
        className="print:hidden block text-center text-xs tracked uppercase text-muted hover:text-amber transition py-2"
      >
        🏆 ดูความสำเร็จ →
      </a>
    </div>
  )
}

const STAT_ACCENT_TEXT = {
  amber: 'text-amber',
  steel: 'text-steel',
  rust: 'text-rusttext',
  moss: 'text-moss',
  violet: 'text-violet',
} as const

// v52: ฟีดแบ็ก "หน้าอื่นควรอิงภาษาเดียวกับ Dashboard" — เดิมไฟล์นี้มี STAT_ACCENT_HEX ประกาศ hex ซ้ำกับ
// COLORS ใน lib/theme.ts เป๊ะทั้ง 5 ค่า (ตัวเดียวกับที่เคยแก้ QUICK_ACTION_ACCENTS ใน DashboardView.tsx
// รอบ Phase 1) — ดึงจาก COLORS ตรงๆ แทน (หมายเหตุ: STAT_ACCENT_TEXT ยังคงแยกไว้ เพราะ text-rusttext ≠
// COLORS.rust จริงๆ — rusttext เป็นเฉดที่ปรับให้ผ่าน WCAG AA สำหรับตัวหนังสือ ต่างจาก rust ที่ใช้กับ
// border/glow/background เท่านั้น ไม่ใช่ duplicate ที่ควรรวม)
const STAT_ACCENT_HEX = {
  amber: COLORS.amber,
  steel: COLORS.steel,
  rust: COLORS.rust,
  moss: COLORS.moss,
  violet: COLORS.violet,
} as const

// สีเดียวกับ BALANCE_COLOR ใน components/WeeklyMuscleHeatmap.tsx เป๊ะ (good=moss/ok=amber/poor=rust) —
// ไม่ export จากที่นั่นเลยประกาศแยกที่นี่ แต่ค่าตรงกันเพราะดึงจาก COLORS ตัวเดียวกัน ไม่ใช่ hex คงที่แยกอิสระ
const BALANCE_TIER_COLOR: Record<BalanceStatusTier, string> = {
  good: COLORS.moss,
  ok: COLORS.amber,
  poor: COLORS.rust,
}

function StatCard({
  label,
  value,
  unit,
  decimals = 0,
  accent,
}: {
  label: string
  value: number
  unit: string
  decimals?: number
  accent: 'amber' | 'steel' | 'rust' | 'moss' | 'violet'
}) {
  const hex = STAT_ACCENT_HEX[accent]
  const glowStyle: React.CSSProperties & { '--glow-color'?: string; '--glow-color-soft'?: string } = {
    borderColor: `${hex}33`,
    backgroundColor: '#1C1F24',
    '--glow-color': `${hex}26`,
    '--glow-color-soft': `${hex}1A`,
  }
  // v52: ฟีดแบ็ก "ทำ Micro-interactions (count-up, ...)" — เดิมตัวเลขโผล่มานิ่งๆ ทันทีตอนโหลดหน้า
  // ใช้ useCountUp เดียวกับที่ GoalRing ใช้อยู่แล้วทั่ว Dashboard ให้ตัวเลขไต่ขึ้นตอนโหลดแทน
  const animatedValue = useCountUp(value)
  return (
    <div className="border shadow-glow rounded-card px-4 py-3.5" style={glowStyle}>
      <p className="text-[12px] tracked uppercase text-muted mb-1">{label}</p>
      <p className={`font-mono text-2xl tabular ${STAT_ACCENT_TEXT[accent]}`}>
        {animatedValue.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
        <span className="text-xs text-muted ml-1">{unit}</span>
      </p>
    </div>
  )
}
