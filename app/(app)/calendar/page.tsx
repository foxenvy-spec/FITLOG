'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BodyMetric, Goal, GoalStatus, GoalType, ProgramDay, ProgramExercise, Workout, WorkoutSet } from '@/lib/types'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import type { WeightUnit } from '@/lib/weightUnit'
import { computeDaySummary, computeExerciseProgress, countDayPRsBreakdown } from '@/lib/workoutDisplay'
import { computeCurrentStreak } from '@/lib/dashboardStats'
import { goalProgressPct as sharedGoalProgressPct } from '@/lib/goalProgress'
import ExerciseCard, { buildDisplaySets } from '@/components/ExerciseCard'
import DaySummaryHeader from '@/components/DaySummaryHeader'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'
import PremiumCard from '@/components/ui/PremiumCard'
import Button from '@/components/ui/Button'

// 'weight' และ 'strength_volume' เก็บ target_value/starting_value เป็น kg เสมอ (เหมือน weight_kg
// ทุกที่ในแอป) — ต้องแปลงเป็นหน่วยที่เลือกแสดงตอนเรนเดอร์ และแปลงกลับเป็น kg ตอนบันทึกฟอร์ม
function isWeightGoalType(t: GoalType) {
  return t === 'weight' || t === 'strength_volume'
}

function goalTypeLabel(unit: WeightUnit): Record<GoalType, string> {
  return {
    weight: `น้ำหนักตัว (${unit})`,
    body_fat: 'Body Fat (%)',
    strength_volume: `วอลุ่มเวทรวม (${unit})`,
    cardio_distance: 'ระยะทางคาร์ดิโอรวม (กม.)',
    custom: 'กำหนดเอง',
  }
}

function toIsoDate(d: Date) {
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 10)
}

export default function CalendarPage() {
  const supabase = createClient()
  const { unit, toDisplay, format } = useWeightUnit()
  const [cursor, setCursor] = useState(() => new Date())
  const [monthWorkouts, setMonthWorkouts] = useState<Workout[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [daySets, setDaySets] = useState<Record<string, WorkoutSet[]>>({})
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [goals, setGoals] = useState<Goal[]>([])
  const [goalsError, setGoalsError] = useState<string | null>(null)
  const [allWorkouts, setAllWorkouts] = useState<Workout[]>([])
  const [latestMetric, setLatestMetric] = useState<BodyMetric | null>(null)
  // บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจค): goalProgress() ด้านล่างเคยคำนวณด้วยสูตรของตัวเอง ใช้แค่
  // goal.starting_value (แช่แข็งตอนสร้างเป้าหมาย) เป็นจุดเริ่มต้นเสมอ — คนละสูตรกับ health/page.tsx และ
  // BodyMetricsRow.tsx (มือถือ) ที่ย้ายไปใช้ earliestTrackedValue (ค่าเก่าที่สุดที่มีบันทึกจริง ไม่ใช่แค่
  // ตอนตั้งเป้า) ไปแล้วตั้งแต่ v62 (ดู lib/goalProgress.ts) — ผลคือเป้าหมายเดียวกัน หน้า Calendar กับหน้า
  // Health/Dashboard โชว์ % คืบหน้าไม่ตรงกัน — ดึงประวัติ body_metrics ทั้งหมด (ไม่ใช่แค่ค่าล่าสุด) มาเก็บ
  // ไว้ด้วย ให้หา earliestTrackedValue ได้แบบเดียวกับ health/page.tsx แล้วเรียก sharedGoalProgressPct
  // ตัวกลางเดียวกันแทนสูตรแยกเดิม
  const [metricsHistory, setMetricsHistory] = useState<BodyMetric[]>([])
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [programByDow, setProgramByDow] = useState<Record<number, { day: ProgramDay; exercises: ProgramExercise[] }>>({})

  const monthStart = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor])
  const monthEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), [cursor])

  const loadMonth = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .gte('performed_at', toIsoDate(monthStart))
      .lte('performed_at', toIsoDate(monthEnd))
    if (error) {
      setLoadError(error.message)
      setLoading(false)
      return
    }
    setMonthWorkouts((data as Workout[]) ?? [])
    setLoading(false)
  }, [supabase, monthStart, monthEnd])

  const loadGoalsData = useCallback(async () => {
    const since = new Date()
    since.setDate(since.getDate() - 365)
    const [goalsRes, workoutsRes, metricRes, metricHistoryRes] = await Promise.all([
      supabase.from('goals').select('*').order('created_at', { ascending: false }),
      supabase.from('workouts').select('*').gte('performed_at', toIsoDate(since)),
      supabase.from('body_metrics').select('*').order('measured_at', { ascending: false }).limit(1),
      // ประวัติทั้งหมด (ไม่จำกัดช่วง) เรียงเก่า -> ใหม่ ใช้หา earliestTrackedValue ต่อเป้าหมาย (ดูคอมเมนต์
      // ที่ metricsHistory state ด้านบน) ตัวเดียวกับที่ health/page.tsx ใช้ (metrics เต็มประวัติเช่นกัน)
      supabase.from('body_metrics').select('*').order('measured_at', { ascending: true }),
    ])
    setGoalsError(goalsRes.error ? goalsRes.error.message : null)
    setGoals(goalsRes.error ? [] : (goalsRes.data as Goal[]) ?? [])
    setAllWorkouts((workoutsRes.data as Workout[]) ?? [])
    setLatestMetric(((metricRes.data as BodyMetric[]) ?? [])[0] ?? null)
    setMetricsHistory((metricHistoryRes.data as BodyMetric[]) ?? [])
  }, [supabase])

  const loadProgram = useCallback(async () => {
    const { data: dayRows, error: dayErr } = await supabase.from('program_days').select('*')
    if (dayErr || !dayRows || dayRows.length === 0) {
      setProgramByDow({})
      return
    }
    const days = dayRows as ProgramDay[]
    const { data: exRows } = await supabase
      .from('program_exercises')
      .select('*')
      .in(
        'program_day_id',
        days.map((d) => d.id)
      )
      .order('position')
    const exercises = (exRows as ProgramExercise[]) ?? []
    const map: Record<number, { day: ProgramDay; exercises: ProgramExercise[] }> = {}
    days.forEach((d) => {
      map[d.day_of_week] = { day: d, exercises: exercises.filter((e) => e.program_day_id === d.id) }
    })
    setProgramByDow(map)
  }, [supabase])

  useEffect(() => {
    loadMonth()
  }, [loadMonth])

  useEffect(() => {
    loadGoalsData()
  }, [loadGoalsData])

  useEffect(() => {
    loadProgram()
  }, [loadProgram])

  const dayMap = useMemo(() => {
    const map = new Map<string, { strength: boolean; cardio: boolean; pr: boolean }>()
    monthWorkouts.forEach((w) => {
      const cur = map.get(w.performed_at) ?? { strength: false, cardio: false, pr: false }
      if (w.type === 'strength') {
        cur.strength = true
        const progress = computeExerciseProgress(w, allWorkouts)
        if (progress.kind === 'pr' || progress.kind === 'bestVolume') cur.pr = true
      } else {
        cur.cardio = true
      }
      map.set(w.performed_at, cur)
    })
    return map
  }, [monthWorkouts, allWorkouts])

  // บั๊ก (เจอตอนไล่เช็คทั้งโปรเจค): เดิมนับ "ทุกวันปฏิทินต้องมี workout ติดกัน" ล้วนๆ ไม่รู้จักวันพักตาม
  // โปรแกรม ทำให้ผู้ใช้ที่มีโปรแกรม (เช่น จ/พ/ศ) เห็นเลข streak หน้านี้ต่ำกว่า Dashboard มาก (ขาดทุกวันที่
  // ไม่ตรงตาราง ทั้งที่เป็นวันพักตามแผน ไม่ใช่วันที่ "พลาด") — เปลี่ยนมาใช้ computeCurrentStreak
  // (lib/dashboardStats.ts) ตัวเดียวกับ DashboardView.tsx ส่ง workoutWeekdays จาก programByDow ที่มีอยู่
  // แล้วในหน้านี้ (ไม่ query ซ้ำ)
  const streak = useMemo(() => {
    const days = allWorkouts.map((w) => w.performed_at)
    const workoutWeekdays = new Set(Object.keys(programByDow).map(Number))
    return computeCurrentStreak(days, workoutWeekdays)
  }, [allWorkouts, programByDow])

  const gridDays = useMemo(() => {
    const firstWeekday = monthStart.getDay() // 0 = Sun
    const daysInMonth = monthEnd.getDate()
    const cells: (Date | null)[] = []
    for (let i = 0; i < firstWeekday; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d))
    return cells
  }, [monthStart, monthEnd, cursor])

  const selectedWorkouts = selectedDate ? monthWorkouts.filter((w) => w.performed_at === selectedDate) : []
  const scheduledProgram = selectedDate ? programByDow[new Date(selectedDate + 'T00:00:00').getDay()] ?? null : null

  useEffect(() => {
    setExpandedIds(new Set())
    if (!selectedDate) return
    const strengthIds = monthWorkouts
      .filter((w) => w.performed_at === selectedDate && w.type === 'strength')
      .map((w) => w.id)
    if (strengthIds.length === 0) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('workout_sets').select('*').in('workout_id', strengthIds).order('set_number')
      if (cancelled) return
      const byId: Record<string, WorkoutSet[]> = {}
      ;((data as WorkoutSet[]) ?? []).forEach((s) => {
        ;(byId[s.workout_id] ??= []).push(s)
      })
      setDaySets(byId)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandAllDay() {
    setExpandedIds(new Set(selectedWorkouts.filter((w) => w.type === 'strength').map((w) => w.id)))
  }

  function collapseAllDay() {
    setExpandedIds(new Set())
  }

  // earliestTrackedValue เฉพาะ weight/body_fat (มีประวัติ metrics ให้ย้อนดูจริง) — strength_volume/
  // cardio_distance เป็นผลรวม (ไม่ใช่ค่าที่ "ติดตาม" มีประวัติย้อนหลังแบบเดียวกัน) ยังใช้ starting_value
  // เป็นจุดเริ่มต้นเหมือนเดิม ตรงกับที่ health/page.tsx เองก็ไม่ทำ earliestTrackedValue ให้ 2 ประเภทนี้
  function goalEarliestTrackedValue(goal: Goal): number | null {
    if (goal.goal_type === 'weight') {
      for (let i = 0; i < metricsHistory.length; i++) {
        if (metricsHistory[i].weight_kg != null) return metricsHistory[i].weight_kg
      }
    } else if (goal.goal_type === 'body_fat') {
      for (let i = 0; i < metricsHistory.length; i++) {
        if (metricsHistory[i].body_fat_pct != null) return metricsHistory[i].body_fat_pct
      }
    }
    return null
  }

  function goalProgress(goal: Goal): number | null {
    if (goal.target_value === null) return null
    let current: number | null = null
    if (goal.goal_type === 'weight') current = latestMetric?.weight_kg ?? null
    else if (goal.goal_type === 'body_fat') current = latestMetric?.body_fat_pct ?? null
    else if (goal.goal_type === 'strength_volume') {
      current = allWorkouts
        .filter((w) => w.type === 'strength')
        .reduce((s, w) => s + (w.sets ?? 0) * (w.reps ?? 0) * (w.weight_kg ?? 0), 0)
    } else if (goal.goal_type === 'cardio_distance') {
      current = allWorkouts.filter((w) => w.type === 'cardio').reduce((s, w) => s + (w.distance_km ?? 0), 0)
    }
    if (current === null) return null
    // sharedGoalProgressPct คืน 0-100 (clamp แล้ว) — หน้านี้ใช้สเกล 0-1 มาตลอด (progress * 100 ตอน render
    // progress bar) หารด้วย 100 ให้ตรงสเกลเดิม ไม่กระทบจุดเรียกใช้อื่น
    const pct = sharedGoalProgressPct(goal, current, goalEarliestTrackedValue(goal))
    return pct === null ? null : pct / 100
  }

  // บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจครอบใหม่): handleDeleteGoal/handleToggleDone เดิมไม่เช็ค error ของ Supabase
  // เลย — ถ้าลบ/อัปเดตพัง (RLS/เน็ตหลุด) UI จะยัง optimistic-update state ว่าสำเร็จ (เป้าหมายหายไปจากลิสต์/
  // สถานะเปลี่ยน) ทั้งที่แถวจริงในฐานข้อมูลไม่เปลี่ยน แล้ว "ย้อนกลับ" เงียบๆ ตอนโหลดหน้าใหม่ครั้งถัดไปโดยไม่มี
  // error ให้เห็นเลย — เช็ค error ก่อน apply optimistic update เสมอ ไม่สำเร็จก็ไม่แตะ state และโชว์ข้อความ
  const [goalActionError, setGoalActionError] = useState<string | null>(null)

  async function handleDeleteGoal(id: string) {
    const { error } = await supabase.from('goals').delete().eq('id', id)
    if (error) {
      setGoalActionError('ลบเป้าหมายไม่สำเร็จ ลองใหม่อีกครั้ง')
      return
    }
    setGoalActionError(null)
    setGoals((prev) => prev.filter((g) => g.id !== id))
  }

  async function handleToggleDone(goal: Goal) {
    const nextStatus: GoalStatus = goal.status === 'done' ? 'active' : 'done'
    const { error } = await supabase.from('goals').update({ status: nextStatus }).eq('id', goal.id)
    if (error) {
      setGoalActionError('อัปเดตเป้าหมายไม่สำเร็จ ลองใหม่อีกครั้ง')
      return
    }
    setGoalActionError(null)
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, status: nextStatus } : g)))
  }

  const weekdayLabels = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

  return (
    <div className="space-y-8 lg:max-w-2xl lg:mx-auto">
      <h1 className="font-display text-2xl tracked uppercase">ปฏิทิน</h1>

      {streak > 0 && (
        <PremiumCard className="px-4 py-3.5 flex items-center justify-between">
          {/* ฟีดแบ็ก (รอบก่อนหน้า, Dashboard) "'Streak ต่อเนื่อง' คำซ้ำความหมาย (Streak มีนัย 'ต่อเนื่อง' อยู่
              แล้ว) ย่อเหลือ 'Streak' เฉยๆ" — ยืนยันแล้วบน Dashboard ก่อนหน้านี้ หน้านี้ยังไม่เคยแก้ตาม ปรับให้
              ตรงกัน */}
          <span className="text-sm text-ink">🔥 Streak</span>
          <span className="font-mono text-2xl tabular text-amber">
            {streak}
            <span className="text-xs text-muted ml-1">วัน</span>
          </span>
        </PremiumCard>
      )}

      {loadError ? (
        <ErrorState title="โหลดปฏิทินไม่สำเร็จ" message={loadError} onRetry={loadMonth} />
      ) : (
        <>
          <div>
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                className="w-9 h-9 rounded-full bg-surface2 border border-line text-ink"
              >
                ‹
              </button>
              <p className="font-display tracked uppercase text-sm">
                {cursor.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
              </p>
              <button
                type="button"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                className="w-9 h-9 rounded-full bg-surface2 border border-line text-ink"
              >
                ›
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {weekdayLabels.map((w) => (
                <span key={w} className="text-[12px] text-muted uppercase tracked">
                  {w}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {gridDays.map((d, i) => {
                if (!d) return <div key={`empty-${i}`} />
                const iso = toIsoDate(d)
                const marks = dayMap.get(iso)
                const isToday = iso === toIsoDate(new Date())
                const isSelected = iso === selectedDate
                const hasProgram = (programByDow[d.getDay()]?.exercises.length ?? 0) > 0
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => setSelectedDate(isSelected ? null : iso)}
                    className={`relative aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs transition border ${
                      isSelected
                        ? 'bg-amber text-bg border-amber'
                        : isToday
                          ? 'border-amber/60 text-ink'
                          : 'border-transparent text-ink hover:bg-surface2'
                    }`}
                  >
                    {marks?.pr && (
                      <span className="absolute -top-1 -right-1 text-[12px] leading-none" aria-label="ทำสถิติใหม่วันนี้">
                        ⭐
                      </span>
                    )}
                    {hasProgram && (
                      <span className="absolute -top-1 -left-1 text-[12px] leading-none" aria-label="มีโปรแกรมตั้งไว้วันนี้">
                        📋
                      </span>
                    )}
                    <span className="font-mono">{d.getDate()}</span>
                    <span className="flex gap-0.5">
                      {marks?.strength && <span className="w-1 h-1 rounded-full bg-steel" />}
                      {marks?.cardio && <span className="w-1 h-1 rounded-full bg-rust" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {loading ? (
            <LoadingState />
          ) : selectedDate ? (
        <div>
          <p className="text-xs font-mono tracked text-muted mb-2 uppercase">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('th-TH', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
          {scheduledProgram && (
            <div className="bg-surface2 border border-line rounded-lg px-4 py-3 mb-3">
              <p className="text-[12px] text-muted tracked uppercase mb-1.5">📋 โปรแกรมที่ตั้งไว้ · {scheduledProgram.day.title}</p>
              <ul className="space-y-1">
                {scheduledProgram.exercises.map((ex) => (
                  <li key={ex.id} className="text-xs text-ink">
                    {ex.exercise_name}
                    <span className="text-muted">
                      {' — '}
                      {ex.sets ?? '–'} เซ็ต × {ex.target_reps ?? '–'} reps
                      {ex.target_rir && ` · RIR ${ex.target_rir}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {selectedWorkouts.length === 0 ? (
            <PremiumCard className="text-sm text-muted px-4 py-6 text-center">ไม่มีรายการวันนี้</PremiumCard>
          ) : (
            <>
              {(() => {
                const summary = computeDaySummary(selectedWorkouts)
                const prBreakdown = countDayPRsBreakdown(
                  selectedWorkouts.filter((w) => w.type === 'strength'),
                  allWorkouts
                )
                return <DaySummaryHeader summary={summary} prBreakdown={prBreakdown} unit={unit} toDisplay={toDisplay} />
              })()}

              {selectedWorkouts.filter((w) => w.type === 'strength').length > 1 && (
                <div className="flex justify-end gap-3 mb-2">
                  <button type="button" onClick={expandAllDay} className="text-[12px] tracked uppercase text-muted hover:text-amber transition">
                    Expand All
                  </button>
                  <span className="text-line">|</span>
                  <button type="button" onClick={collapseAllDay} className="text-[12px] tracked uppercase text-muted hover:text-amber transition">
                    Collapse All
                  </button>
                </div>
              )}

              <ul className="space-y-2">
                {selectedWorkouts.map((w) => (
                  <ExerciseCard
                    key={w.id}
                    workout={w}
                    displaySets={buildDisplaySets(w, daySets[w.id] ?? [])}
                    progress={computeExerciseProgress(w, allWorkouts)}
                    format={format}
                    expanded={expandedIds.has(w.id)}
                    onToggleExpand={() => toggleExpand(w.id)}
                    nameHref={w.exercise_name ? `/exercises/${encodeURIComponent(w.exercise_name)}` : undefined}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <a href="/history" className="block text-center text-xs tracked uppercase text-muted hover:text-amber transition py-1">
          ดูประวัติทั้งหมด →
        </a>
      )}
        </>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm tracked uppercase text-muted">เป้าหมาย</h2>
          <button
            type="button"
            onClick={() => setShowGoalForm((v) => !v)}
            className="text-xs font-display tracked uppercase text-amber"
          >
            {showGoalForm ? 'ปิด' : '+ เพิ่มเป้าหมาย'}
          </button>
        </div>

        {goalActionError && <p className="text-[12px] text-rusttext">{goalActionError}</p>}

        {showGoalForm && (
          <GoalForm
            latestWeight={latestMetric?.weight_kg ?? null}
            latestBodyFat={latestMetric?.body_fat_pct ?? null}
            allWorkouts={allWorkouts}
            onCreated={(g) => {
              setGoals((prev) => [g, ...prev])
              setShowGoalForm(false)
            }}
          />
        )}

        {goalsError ? (
          <ErrorState title="โหลดเป้าหมายไม่สำเร็จ" message={goalsError} onRetry={loadGoalsData} />
        ) : goals.length === 0 ? (
          <PremiumCard className="text-sm text-muted px-4 py-6 text-center">ยังไม่มีเป้าหมาย ลองตั้งเป้าหมายแรกดู</PremiumCard>
        ) : (
          <ul className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-3 md:items-start">
            {goals.map((g) => {
              const progress = goalProgress(g)
              return (
                <PremiumCard as="li" key={g.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-sm ${g.status === 'done' ? 'text-muted line-through' : 'text-ink'}`}>
                        {g.title}
                      </p>
                      <p className="text-[12px] text-muted mt-0.5">
                        {goalTypeLabel(unit)[g.goal_type]}
                        {g.target_value !== null &&
                          ` · เป้าหมาย ${isWeightGoalType(g.goal_type) ? toDisplay(g.target_value) : g.target_value}`}
                        {g.target_date && ` · ${new Date(g.target_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`}
                      </p>
                    </div>
                    {/* ฟีดแบ็ก (design review, P2) "'สำเร็จ'/'ลบ' น้ำหนักภาพเท่ากันเกินไป — ลบควรเป็น
                        destructive action ที่ understated ไม่ใช่ปุ่มเท่ากับ 'สำเร็จ'" — ทั้งคู่เดิมเป็น
                        text-xs/text-muted/hover สี amber-rust อยู่แล้ว (ตรงกับสเปกที่ขอ) เพิ่ม focus state
                        คู่กับ hover (เดิมไม่มีเลยทั้งไฟล์) + เว้นระยะห่างขึ้นอีกนิด (gap-2 -> gap-3) — เป้าหมาย
                        ที่ "สำเร็จ" แล้ว เปลี่ยนจากปุ่ม toggle น้ำหนักเท่า "ลบ" เป็นสถานะ "✓ สำเร็จแล้ว" สีเขียว
                        (moss) ที่เบาลง แทนคำว่า "เปิดใหม่" เดิม — ยังกดเปิดใหม่ได้เหมือนเดิม (onClick เดิม
                        ไม่เปลี่ยน) แค่ไม่ใช่ action ระดับเดียวกับ "ลบ" อีกต่อไปตามที่ขอ */}
                    <div className="flex items-center gap-3 shrink-0">
                      {g.status === 'done' ? (
                        <button
                          type="button"
                          onClick={() => handleToggleDone(g)}
                          className="text-[12px] text-moss hover:text-ink focus:text-ink transition"
                        >
                          ✓ สำเร็จแล้ว
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleDone(g)}
                          className="text-xs text-muted hover:text-amber focus:text-amber transition"
                        >
                          สำเร็จ
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteGoal(g.id)}
                        className="text-xs text-muted hover:text-rust focus:text-rust transition"
                      >
                        ลบ
                      </button>
                    </div>
                  </div>
                  {progress !== null && (
                    <div className="mt-2.5 h-1.5 rounded-full bg-surface2 overflow-hidden">
                      <div
                        className="h-full bg-amber transition-[width]"
                        style={{ width: `${Math.max(3, progress * 100)}%` }}
                      />
                    </div>
                  )}
                </PremiumCard>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function GoalForm({
  latestWeight,
  latestBodyFat,
  allWorkouts,
  onCreated,
}: {
  latestWeight: number | null
  latestBodyFat: number | null
  allWorkouts: Workout[]
  onCreated: (g: Goal) => void
}) {
  const supabase = createClient()
  const { unit, toKg } = useWeightUnit()
  const [title, setTitle] = useState('')
  const [goalType, setGoalType] = useState<GoalType>('weight')
  const [targetValue, setTargetValue] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function currentBaseline(): number | null {
    if (goalType === 'weight') return latestWeight
    if (goalType === 'body_fat') return latestBodyFat
    if (goalType === 'strength_volume') {
      return allWorkouts
        .filter((w) => w.type === 'strength')
        .reduce((s, w) => s + (w.sets ?? 0) * (w.reps ?? 0) * (w.weight_kg ?? 0), 0)
    }
    if (goalType === 'cardio_distance') {
      return allWorkouts.filter((w) => w.type === 'cardio').reduce((s, w) => s + (w.distance_km ?? 0), 0)
    }
    return null
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
      title: title || goalTypeLabel(unit)[goalType],
      goal_type: goalType,
      target_value: targetValue ? (isWeightGoalType(goalType) ? toKg(Number(targetValue)) : Number(targetValue)) : null,
      starting_value: currentBaseline(),
      target_date: targetDate || null,
      status: 'active' as const,
    }
    const { data, error } = await supabase.from('goals').insert(payload).select().single()
    setSaving(false)
    if (error || !data) {
      setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
      return
    }
    onCreated(data as Goal)
    setTitle('')
    setTargetValue('')
    setTargetDate('')
  }

  return (
    <PremiumCard as="form" onSubmit={handleSubmit} className="p-4 space-y-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="ชื่อเป้าหมาย เช่น ลดน้ำหนักก่อนหน้าร้อน"
        className="input"
      />
      <select
        value={goalType}
        onChange={(e) => setGoalType(e.target.value as GoalType)}
        className="input"
      >
        {(Object.keys(goalTypeLabel(unit)) as GoalType[]).map((t) => (
          <option key={t} value={t}>
            {goalTypeLabel(unit)[t]}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-3">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={targetValue}
          onChange={(e) => setTargetValue(e.target.value)}
          placeholder="ค่าเป้าหมาย"
          className="input font-mono"
        />
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="input font-mono text-sm"
        />
      </div>
      {error && <p className="text-sm text-rusttext">{error}</p>}
      <Button type="submit" disabled={saving} size="md" className="w-full">
        {saving ? 'กำลังบันทึก...' : 'บันทึกเป้าหมาย'}
      </Button>
    </PremiumCard>
  )
}
