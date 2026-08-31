'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { MUSCLE_GROUP_COLORS } from '@/lib/muscle-groups'
import { todayStr } from '@/lib/weekdays'
import { computeTodayTotals, estimateCaloriesToday } from '@/lib/dashboardStats'
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

const RANGE_DAYS = 180
const WEEKS_SHOWN = 8

function lastNDays(n: number) {
  const days: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
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

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const since = lastNDays(RANGE_DAYS)[0]
    const { data, error: err } = await supabase
      .from('workouts')
      .select('*')
      .gte('performed_at', since)
      .order('performed_at', { ascending: true })
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
      const repsMap = new Map<string, number>()
      ;(setsData as { workout_id: string; reps: number | null }[] | null)?.forEach((s) => {
        repsMap.set(s.workout_id, (repsMap.get(s.workout_id) ?? 0) + (s.reps ?? 0))
      })
      setActualRepsByWorkout(repsMap)
    } else {
      setActualRepsByWorkout(new Map())
    }

    setLoading(false)
  }, [supabase])

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
    const thisWeekVolume = weeklyVolume.length > 0 ? weeklyVolume[weeklyVolume.length - 1].value : 0

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
      thisWeekVolume,
      totalCalories,
      avgDurationMin,
    }
  }, [workouts, weeklyVolume, actualRepsByWorkout, bodyWeightKg])

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

    return [
      { axis: 'Push', pct: push.pct },
      { axis: 'Pull', pct: pull.pct },
      { axis: 'Legs', pct: legs.pct },
      { axis: 'Core', pct: core },
      { axis: 'Endurance', pct: endurance },
    ]
  }, [workouts, bodyWeightKg, profile, totals.totalVolume])

  // มีข้อมูลจริงพอให้กราฟมีความหมายไหม — ต้องมีอย่างน้อย 1 แกนที่ไม่ใช่ 0 (ไม่งั้นกราฟจะเป็นจุดเดียวตรง
  // กลางที่ไม่สื่อความหมายอะไร ดูเหมือนบั๊กมากกว่าข้อมูลจริง)
  const hasStrengthBalanceData = strengthBalance.some((a) => a.pct > 0)

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

  const [selectedExercise, setSelectedExercise] = useState('')

  useEffect(() => {
    if (!selectedExercise && exerciseNames.length > 0) setSelectedExercise(exerciseNames[0])
  }, [exerciseNames, selectedExercise])

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

  if (workouts.length === 0) {
    return (
      <div className="space-y-8">
        <h1 className="font-display text-2xl tracked uppercase">สถิติ · {RANGE_DAYS} วันล่าสุด</h1>
        <EmptyState
          icon="📈"
          title="ยังไม่มีข้อมูลสถิติ"
          message="เริ่มบันทึกการออกกำลังกายครั้งแรก แล้วสถิติของคุณจะเริ่มขึ้นที่นี่"
          ctaHref="/log"
          ctaLabel="+ เริ่มบันทึก"
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ฟีดแบ็ก "One-Click Export PDF Report ส่งให้เทรนเนอร์" — ปุ่มเรียก window.print() ตรงๆ (ไม่เพิ่ม
          dependency ใหม่, เหมือนแนวทาง canvas ที่ ShareWeeklySummaryButton.tsx เลือกไว้ก่อนหน้านี้) —
          หน้านี้มีข้อมูลสรุปครบอยู่แล้ว (Total Volume/Reps, Weekly Volume, Muscle Distribution, Cardio,
          1RM Trend, Strength Balance, PRs) เหมาะเป็นรายงานความคืบหน้าอยู่แล้วโดยไม่ต้องสร้างหน้าใหม่
          แยกต่างหาก — ปุ่มเองก็ print:hidden (ไม่ต้องปรากฏในรายงานที่พิมพ์ออกมา) */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl tracked uppercase">สถิติ · {RANGE_DAYS} วันล่าสุด</h1>
        <button
          type="button"
          onClick={() => window.print()}
          className="print:hidden shrink-0 flex items-center gap-1.5 rounded-full border border-amber/40 text-amber text-[11px] font-display tracked uppercase px-3 py-2 active:scale-[0.98] transition"
        >
          📄 Export PDF
        </button>
      </div>
      {/* หัวรายงานที่เห็นเฉพาะตอนพิมพ์ — บนจอปกติซ่อนไว้ (hidden print:block) ให้บริบท "รายงานของใคร/
          วันที่ไหน" ชัดเจนตอนเปิดไฟล์ PDF ย้อนหลัง (บนจอมี h1 ด้านบนอยู่แล้วไม่ต้องซ้ำ) */}
      <p className="hidden print:block text-sm text-muted">
        FITLOG — Progress Report ·{' '}
        {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard label="Total Volume" value={Math.round(toDisplay(totals.totalVolume))} unit={unit} accent="steel" />
        <StatCard label="Total Reps" value={totals.totalReps} unit="ครั้ง" accent="amber" />
        <StatCard label="Volume สัปดาห์นี้" value={Math.round(toDisplay(totals.thisWeekVolume))} unit={unit} accent="rust" />
        <StatCard label="วันที่ออกกำลังกาย" value={totals.activeDays} unit="วัน" accent="moss" />
        <StatCard label="เซสชันเวท" value={totals.strengthCount} unit="ครั้ง" accent="moss" />
        <StatCard label="ระยะทางคาร์ดิโอรวม" value={totals.totalDistance} unit="กม." accent="rust" decimals={1} />
        <StatCard label="แคลอรี่ที่เผาผลาญรวม" value={totals.totalCalories} unit="kcal" accent="amber" />
        <StatCard label="เวลาเฉลี่ย/วัน" value={totals.avgDurationMin} unit="นาที" accent="steel" />
      </div>

      <section>
        <h2 className="font-display text-sm tracked uppercase text-muted mb-3">
          Weekly Volume ({WEEKS_SHOWN} สัปดาห์ล่าสุด, {unit})
        </h2>
        <PremiumCard className="h-48 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyVolume.map((b) => ({ ...b, value: Math.round(toDisplay(b.value)) }))} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={NEUTRAL.chipInactive} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: NEUTRAL.mutedIcon, fontSize: 10 }}
                axisLine={{ stroke: NEUTRAL.chipInactive }}
                tickLine={false}
              />
              <YAxis tick={{ fill: NEUTRAL.mutedIcon, fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
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
        </PremiumCard>
      </section>

      {muscleDistribution.length > 0 && (
        <section>
          <h2 className="font-display text-sm tracked uppercase text-muted mb-3">Muscle Distribution (วอลุ่มรวม)</h2>
          <PremiumCard className="p-4 space-y-3">
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
          <a href="/cardio" className="text-[11px] text-amber hover:underline shrink-0">
            ดู Cardio Dashboard →
          </a>
        </div>
        <PremiumCard className="h-48 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distanceByDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
                <Radar dataKey="pct" stroke={COLORS.violet} fill={COLORS.violet} fillOpacity={0.35} />
                <Tooltip
                  contentStyle={{ background: '#1C1F24', border: `1px solid ${NEUTRAL.chipInactive}`, borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: NEUTRAL.mutedIcon }}
                  itemStyle={{ color: '#F3F0E8' }}
                  formatter={(v: number) => [`${v}%`, 'ระดับ']}
                />
              </RadarChart>
            </ResponsiveContainer>
          </PremiumCard>
          <p className="text-[11px] text-muted mt-2">
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
            <select
              value={selectedExercise}
              onChange={(e) => setSelectedExercise(e.target.value)}
              className="print:hidden bg-surface2 border border-line rounded-full text-xs px-3 py-1 text-ink outline-none"
            >
              {exerciseNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <span className="hidden print:inline text-xs text-ink">{selectedExercise}</span>
          </div>
          {oneRmTrend.length > 1 ? (
            <PremiumCard className="h-44 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={oneRmTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={NEUTRAL.chipInactive} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: NEUTRAL.mutedIcon, fontSize: 10 }} axisLine={{ stroke: NEUTRAL.chipInactive }} tickLine={false} />
                  <YAxis tick={{ fill: NEUTRAL.mutedIcon, fontSize: 10 }} axisLine={false} tickLine={false} width={36} domain={['auto', 'auto']} />
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
          <p className="text-[11px] text-muted mt-2">คำนวณด้วยสูตร Epley: น้ำหนัก × (1 + reps/30) — เป็นค่าประมาณ ไม่ใช่ค่าวัดจริง</p>
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
                <p className="text-[10px] tracked uppercase text-muted">Current</p>
                <p className="font-mono text-base text-muted">
                  {format(overloadSuggestion.currentWeight)} × {overloadSuggestion.currentReps}
                </p>
              </div>
              <div>
                <p className="text-[10px] tracked uppercase text-muted">Target</p>
                <p className="font-mono text-base text-violet">
                  {format(overloadSuggestion.targetWeight)} × {overloadSuggestion.targetReps}
                </p>
              </div>
            </div>
            {/* เหตุผลของคำแนะนำ (อิง RPE เฉลี่ย 3 เซสชันล่าสุด) — engine เดียวกับหน้า /coach
                (computeProgressiveOverload ใน lib/aiCoach.ts) ตรงกับ roadmap Priority 7
                ("ครั้งหน้าควรเล่นเท่าไหร่?") */}
            <p className="text-[11px] text-muted mt-2">{overloadSuggestion.rationale}</p>
          </a>
        </section>
      )}

      {prs.length > 0 && (
        <section>
          <h2 className="font-display text-sm tracked uppercase text-muted mb-3">🏆 Personal Records (น้ำหนักสูงสุด)</h2>
          {/* border-violet/20 เดิม เน้นการ์ดนี้ว่าเป็น Personal Records แยกจากลิสต์ทั่วไป — PremiumCard
              ตัด border สีกลางทึบออกแล้ว (v48: ใช้ contact shadow บอกขอบแทน) ยังคงสีม่วงไว้ผ่าน style
              override (ชนะ default เพราะ ...style วางท้ายสุดเสมอ) แทนที่จะเสียจุดเด่นสีนี้ไปเฉยๆ */}
          <PremiumCard className="divide-y divide-white/5" style={{ border: `1px solid ${withAlpha(COLORS.violet, '33')}` }}>
            {prs.map((p) => {
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
                      <span className="animate-pop-in text-[9px] font-display tracked uppercase text-bg bg-violet rounded-full px-1.5 py-0.5">
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
      <p className="text-[11px] tracked uppercase text-muted mb-1">{label}</p>
      <p className={`font-mono text-2xl tabular ${STAT_ACCENT_TEXT[accent]}`}>
        {animatedValue.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
        <span className="text-xs text-muted ml-1">{unit}</span>
      </p>
    </div>
  )
}
