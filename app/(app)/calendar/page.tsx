'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BodyMetric, Goal, GoalStatus, GoalType, ProgramDay, ProgramExercise, Workout, WorkoutSet } from '@/lib/types'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import type { WeightUnit } from '@/lib/weightUnit'
import { computeDaySummary, computeExerciseProgress, countDayPRsBreakdown, workoutVolumeKg, PR_HISTORY_LIMIT } from '@/lib/workoutDisplay'
import { computeCurrentStreak, STREAK_WALK_MAX_DAYS } from '@/lib/dashboardStats'
import { goalProgressPct as sharedGoalProgressPct, isValidGoalTarget } from '@/lib/goalProgress'
import { bangkokMonthGrid, bangkokYearMonth, daysAgoStr, shiftMonth, todayStr } from '@/lib/weekdays'
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

export default function CalendarPage() {
  const supabase = createClient()
  const { unit, toDisplay, format } = useWeightUnit()
  // 6G-P1 #1 — cursor เก็บเป็น {year, month0} ตรงๆ แทน Date object ของ browser-local "now" เดิม ป้องกัน
  // ปัญหา new Date(year, month, day) ตีความตาม timezone ของเครื่องที่รัน (ดู bangkokYearMonth/
  // bangkokMonthGrid/shiftMonth ใน lib/weekdays.ts — ทั้ง grid, query boundary และ isToday ของหน้านี้
  // เดินจาก canonical YYYY-MM-DD string เดียวกันทั้งหมดแล้ว)
  const [cursor, setCursor] = useState(() => bangkokYearMonth())
  const [monthWorkouts, setMonthWorkouts] = useState<Workout[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [daySets, setDaySets] = useState<Record<string, WorkoutSet[]>>({})
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [goals, setGoals] = useState<Goal[]>([])
  const [goalsError, setGoalsError] = useState<string | null>(null)
  const [allWorkouts, setAllWorkouts] = useState<Workout[]>([])
  // 6D P2-2 — pool แยกสำหรับตรวจ PR โดยเฉพาะ (canonical, เดียวกับ History/Log/Session) แยกจาก allWorkouts
  // ด้านบน ซึ่งขอบเขต 400 วันถูกยืมมาจาก STREAK_WALK_MAX_DAYS เพื่อ streak/goal volume เท่านั้น ไม่ได้ตั้งใจ
  // ให้เป็น PR pool (ดู comment เต็มที่จุด query ด้านล่าง) — allWorkouts ยังใช้กับ streak/goal volume เหมือนเดิม
  const [prHistoryPool, setPrHistoryPool] = useState<Workout[]>([])
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

  // ฟีดแบ็ก "จากการ์ด 'ฝึกไปแล้ววันนี้ (แผนชดเชย)' บน Dashboard อยากมีลิงก์ 'ดูรายละเอียด →' พาเข้ามาเห็น
  // ว่าวันนี้ฝึกอะไรไปบ้างทันที ไม่ต้องมาเลือกวันเองอีกที" — อ่าน ?date=YYYY-MM-DD จาก URL ครั้งเดียวตอน
  // mount แล้ว select วันนั้นให้อัตโนมัติ (cursor ไม่ต้องแตะเลยถ้าเป็นวันนี้ เพราะ default เป็นเดือนปัจจุบัน
  // อยู่แล้ว) อ่านจาก window.location ตรงๆ แทน useSearchParams (หน้านี้เป็น client component ล้วนอยู่แล้ว
  // เลี่ยง Suspense boundary requirement ที่ไม่จำเป็นตรงนี้) ไม่มี param = พฤติกรรมเดิมทุกประการ
  useEffect(() => {
    if (typeof window === 'undefined') return
    const dateParam = new URLSearchParams(window.location.search).get('date')
    if (dateParam) setSelectedDate(dateParam)
  }, [])

  // 6G-P1 #1 — แหล่งความจริงเดียวของเดือนที่กำลังแสดง: grid cells และ query boundary ทั้งคู่อ่านจาก
  // monthGrid.days ตัวเดียวกัน (ไม่ใช่แปลง Date ไปมาคนละจุด) — ดู bangkokMonthGrid ใน lib/weekdays.ts
  const monthGrid = useMemo(() => bangkokMonthGrid(cursor.year, cursor.month0), [cursor])

  const loadMonth = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .gte('performed_at', monthGrid.days[0])
      .lte('performed_at', monthGrid.days[monthGrid.days.length - 1])
    if (error) {
      setLoadError(error.message)
      setLoading(false)
      return
    }
    setMonthWorkouts((data as Workout[]) ?? [])
    setLoading(false)
  }, [supabase, monthGrid])

  const loadGoalsData = useCallback(async () => {
    // บั๊ก (ไล่ตรวจทั้งโปรเจครอบใหม่) "hardcode 365 วันแยกจาก STREAK_WALK_MAX_DAYS (400) ที่ computeCurrentStreak
    // เดินสายโซ่ได้ไกลสุด — คนที่มี streak ยาวเกิน 365 วันจะเห็นเลขต่ำกว่า Dashboard (query 400 วัน) ทั้งที่
    // ใช้สูตร computeCurrentStreak ตัวเดียวกันแล้ว (ดู comment ที่ streak useMemo ด้านล่าง)" — ใช้ constant
    // เดียวกับ Dashboard ตรงๆ แทน hardcode เลขแยก
    // 6G-P1 #1 — เปลี่ยนจาก toIsoDate(since) (คำนวณผ่าน getTimezoneOffset ของเครื่อง) มาใช้ daysAgoStr()
    // ตัว canonical จาก lib/weekdays.ts ตรงๆ (Bangkok-anchored เหมือนกับทุกจุดอื่นในหน้านี้แล้ว)
    const [goalsRes, workoutsRes, metricRes, metricHistoryRes, prHistoryRes] = await Promise.all([
      supabase.from('goals').select('*').order('created_at', { ascending: false }),
      supabase.from('workouts').select('*').gte('performed_at', daysAgoStr(STREAK_WALK_MAX_DAYS)),
      supabase.from('body_metrics').select('*').order('measured_at', { ascending: false }).limit(1),
      // ประวัติทั้งหมด (ไม่จำกัดช่วง) เรียงเก่า -> ใหม่ ใช้หา earliestTrackedValue ต่อเป้าหมาย (ดูคอมเมนต์
      // ที่ metricsHistory state ด้านบน) ตัวเดียวกับที่ health/page.tsx ใช้ (metrics เต็มประวัติเช่นกัน)
      supabase.from('body_metrics').select('*').order('measured_at', { ascending: true }),
      // 6D P2-2 — pool ตรวจ PR โดยเฉพาะ (canonical, เดียวกับ History/Log/Session เป๊ะ: type='strength',
      // เรียงใหม่->เก่า, จำกัดด้วย PR_HISTORY_LIMIT) เดิมหน้านี้ใช้ allWorkouts ตัวเดียวกับ streak/goal volume
      // (ขอบเขต 400 วันแบบ date-range) ทำให้ PR verdict ของ Calendar ไม่ตรงกับ History (ขอบเขต 500 แถวแบบ
      // row-count — คนละกลไกกันเลย ไม่ใช่แค่ตัวเลขต่างกัน) — แยก query นี้ออกมาต่างหาก ไม่แตะ allWorkouts
      supabase
        .from('workouts')
        .select('*')
        .eq('type', 'strength')
        .order('performed_at', { ascending: false })
        .limit(PR_HISTORY_LIMIT),
    ])
    setGoalsError(goalsRes.error ? goalsRes.error.message : null)
    setGoals(goalsRes.error ? [] : (goalsRes.data as Goal[]) ?? [])
    setAllWorkouts((workoutsRes.data as Workout[]) ?? [])
    setPrHistoryPool((prHistoryRes.data as Workout[]) ?? [])
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
        const progress = computeExerciseProgress(w, prHistoryPool)
        if (progress.kind === 'pr' || progress.kind === 'bestVolume') cur.pr = true
      } else {
        cur.cardio = true
      }
      map.set(w.performed_at, cur)
    })
    return map
  }, [monthWorkouts, prHistoryPool])

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

  // 6G-P1 #1 — cell แต่ละอันเป็น YYYY-MM-DD string ตรงๆ (canonical, ตัวเดียวกับที่ query ใช้) ไม่ใช่ Date
  // object ที่ต้องแปลงกลับไปมาอีกที — index ของ cell ในกริด 7 คอลัมน์ (grid-cols-7) ตรงกับ day-of-week
  // เสมอ (i % 7) เพราะ null นำหน้าตาม firstWeekday ถูกใส่ไว้ก่อนแล้ว ไม่ต้องคำนวณ day-of-week จาก Date อีก
  const gridDays = useMemo(() => {
    const cells: (string | null)[] = []
    for (let i = 0; i < monthGrid.firstWeekday; i++) cells.push(null)
    monthGrid.days.forEach((d) => cells.push(d))
    return cells
  }, [monthGrid])

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
      // 6D P2-1 — เดิมคำนวณ sets*reps*weight_kg ตรงๆ (สมมติทุกเซ็ตของท่าเดียวกันใช้ reps/น้ำหนักเท่ากันหมด)
      // เมินเฉย total_volume_kg (ผลรวมจริงทีละเซ็ต ตัวเดียวกับที่ History/Stats/PR ใช้) ทำให้ท่า pyramid/
      // drop set ถูกคำนวณ volume ต่ำกว่าจริง — ใช้ workoutVolumeKg() (lib/workoutDisplay.ts) ตัวเดียวกับ
      // ที่ History/Calendar's DaySummaryHeader/Stats ใช้อยู่แล้วแทน ไม่คำนวณสูตรแยกอีกชุด
      current = allWorkouts.filter((w) => w.type === 'strength').reduce((s, w) => s + workoutVolumeKg(w), 0)
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
  // v2: บั๊ก (ไล่ตรวจทั้งโปรเจครอบใหม่) "goalActionError เดิมเป็น string เดียวใช้ร่วมกันทุกเป้าหมาย — ลบ
  // เป้าหมาย A พังโชว์ error ค้างอยู่ แล้วกด 'สำเร็จ' ของเป้าหมาย B ที่ไม่เกี่ยวกันสำเร็จ จะ setGoalActionError
  // (null) ทับ error ของ A ทิ้งเงียบๆ ทั้งที่ A ยังไม่ถูกลบจริง" — ผูก error กับ goalId ที่แท้จริง เคลียร์ได้
  // เฉพาะตอนที่ action ล่าสุดที่สำเร็จเป็นของเป้าหมายเดียวกับที่ error ค้างอยู่เท่านั้น
  const [goalActionError, setGoalActionError] = useState<{ goalId: string; message: string } | null>(null)

  // ฟีดแบ็ก (design review, P2) "ลบ ควรมี confirmation ก่อนลบ" — ลบเป้าหมายเป็น destructive action ที่ย้อน
  // กลับไม่ได้ (ไม่มี undo) กด confirm() ของเบราว์เซอร์ธรรมดาก่อนลบจริง (ไม่มี dialog แบบกำหนดเองในแอปนี้ที่
  // ไหนเลยตอนนี้ ตรงกับที่ขอ "ไม่ต้องเพิ่ม dialog ที่ซับซ้อนเกินจำเป็น") ยกเลิกแล้วไม่ทำอะไรต่อ
  async function handleDeleteGoal(goal: Goal) {
    if (!window.confirm(`ลบเป้าหมาย "${goal.title}" ใช่หรือไม่?`)) return
    const { error } = await supabase.from('goals').delete().eq('id', goal.id)
    if (error) {
      setGoalActionError({ goalId: goal.id, message: `ลบเป้าหมาย "${goal.title}" ไม่สำเร็จ ลองใหม่อีกครั้ง` })
      return
    }
    setGoalActionError((prev) => (prev?.goalId === goal.id ? null : prev))
    setGoals((prev) => prev.filter((g) => g.id !== goal.id))
  }

  async function handleToggleDone(goal: Goal) {
    const nextStatus: GoalStatus = goal.status === 'done' ? 'active' : 'done'
    const { error } = await supabase.from('goals').update({ status: nextStatus }).eq('id', goal.id)
    if (error) {
      setGoalActionError({ goalId: goal.id, message: `อัปเดตเป้าหมาย "${goal.title}" ไม่สำเร็จ ลองใหม่อีกครั้ง` })
      return
    }
    setGoalActionError((prev) => (prev?.goalId === goal.id ? null : prev))
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
                // Product Audit /calendar — ฟีดแบ็ก "เปลี่ยนเดือนแล้ว selectedDate ค้างเป็นวันที่ของเดือนเก่า
                // ทั้งที่ monthWorkouts ถูกแทนที่ด้วยข้อมูลเดือนใหม่แล้ว — แผงรายละเอียดยังโชว์หัวข้อวันที่เก่า
                // แต่ selectedWorkouts กรองจากข้อมูลเดือนใหม่ไม่เจอ กลายเป็น 'ไม่มีรายการวันนี้' ผิดๆ ทั้งที่
                // วันนั้นมี log จริง" — reset selectedDate ทันทีที่กดเปลี่ยนเดือน กันข้อความไม่ตรงกับข้อมูลจริง
                onClick={() => {
                  setSelectedDate(null)
                  setCursor((prev) => shiftMonth(prev.year, prev.month0, -1))
                }}
                className="w-9 h-9 rounded-full bg-surface2 border border-line text-ink"
              >
                ‹
              </button>
              <p className="font-display tracked uppercase text-sm">
                {/* 6G-P1 #1 — แสดงเดือน/ปีจาก cursor.year/month0 ตรงๆ ผ่าน Date.UTC ล้วนๆ (ไม่ใช่ new
                    Date(year, month, day) ที่ตีความตาม timezone เครื่อง) ระบุ timeZone: 'UTC' ให้
                    toLocaleDateString อ่านค่าเดือน/ปีตรงกับที่ตั้งไว้เป๊ะ ไม่ถูกเลื่อนอีกชั้นตอน render */}
                {new Date(Date.UTC(cursor.year, cursor.month0, 1)).toLocaleDateString('th-TH', {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedDate(null)
                  setCursor((prev) => shiftMonth(prev.year, prev.month0, 1))
                }}
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
              {gridDays.map((iso, i) => {
                if (!iso) return <div key={`empty-${i}`} />
                const marks = dayMap.get(iso)
                const isToday = iso === todayStr()
                const isSelected = iso === selectedDate
                // 6G-P1 #1 — คอลัมน์ index i ในกริด 7 คอลัมน์ตรงกับ day-of-week เสมอ (ดู comment ที่
                // gridDays useMemo ด้านบน) ไม่ต้องเรียก .getDay() จาก Date object อีกต่อไป
                const hasProgram = (programByDow[i % 7]?.exercises.length ?? 0) > 0
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
                    <span className="font-mono">{Number(iso.slice(8, 10))}</span>
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
          {scheduledProgram && (() => {
            // ฟีดแบ็ก (semantic review, Makeup Session detail page) "'โปรแกรมที่ตั้งไว้ · Day 2 — Pull'
            // ขัดกับรายการท่าที่ฝึกจริงด้านล่าง (อก/ไหล่/แขน) — ผู้ใช้จะสงสัยว่าระบบบันทึกผิดหรือเปล่า
            // ทั้งที่จริงคือทำเซสชันชดเชยของอีกวันหนึ่ง" — ตรวจว่า workout ของวันนี้มี program_day_id ที่
            // ไม่ตรงกับ scheduledProgram ของวันนี้ (ตามวันในสัปดาห์) ไหม
            //
            // 6C-2 (6A/6C audit — "persisted makeup heuristic asserts an intent it can't prove") —
            // program_day_id mismatch เป็นแค่ fact ว่าวันนี้ฝึก program day อื่น ไม่ใช่หลักฐานว่า "นี่คือ
            // เซสชันชดเชย" จริง — ตั้งแต่ P0-1 มีเหตุผลที่ 2 ที่ทำให้ mismatch เกิดได้โดยไม่ใช่การชดเชยเลย
            // (recommendation แนะนำสลับกล้ามเนื้อเพราะ Volume/Recovery ปกติ) แต่ไม่มีข้อมูล persisted ไหน
            // แยกสองกรณีนี้ออกจากกันได้ (source=recommendation เป็นแค่ URL marker ตอนเซสชัน ไม่เคยเขียนลง
            // DB — ดู lib/dashboardStats.ts's computeTodaysAction) — เปลี่ยนป้ายจากการ "อ้าง intent" (แผนที่
            // ชดเชย) เป็น "บอก fact เท่าที่รู้จริง" (ฝึกกลุ่มอื่นแทน) แทน ไม่แตะ exercise list/PR/
            // DaySummaryHeader ด้านล่างเลย (ถูกต้องอยู่แล้วตามที่ยืนยัน) — เก็บชื่อตัวแปร isMakeupDay ไว้
            // (ยังตอบคำถามเดิม "program_day_id ต่างจากตารางไหม" ถูกต้อง แค่ copy ที่ derive จากมันเปลี่ยน)
            const isMakeupDay = selectedWorkouts.some(
              (w) => w.program_day_id && w.program_day_id !== scheduledProgram.day.id
            )
            return (
            <div className="bg-surface2 border border-line rounded-lg px-4 py-3 mb-3">
              <p className="text-[12px] text-muted tracked uppercase mb-1.5">
                {isMakeupDay ? '📋 ฝึกกลุ่มอื่นแทน' : '📋 โปรแกรมที่ตั้งไว้'} · {scheduledProgram.day.title}
              </p>
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
            )
          })()}
          {selectedWorkouts.length === 0 ? (
            <PremiumCard className="text-sm text-muted px-4 py-6 text-center">ไม่มีรายการวันนี้</PremiumCard>
          ) : (
            <>
              {(() => {
                // CAL-1 — latestMetric ถูก fetch มาแล้วในหน้านี้อยู่แล้ว (loadGoalsData, ใช้ sync progress %
                // กับ Health/Dashboard) เอา weight_kg มาป้อน calorie estimator ตัวเดียวกับ Dashboard/Stats
                // โดยไม่ต้อง query ใหม่
                const summary = computeDaySummary(selectedWorkouts, latestMetric?.weight_kg ?? null)
                const prBreakdown = countDayPRsBreakdown(
                  selectedWorkouts.filter((w) => w.type === 'strength'),
                  prHistoryPool
                )
                return <DaySummaryHeader summary={summary} prBreakdown={prBreakdown} unit={unit} toDisplay={toDisplay} />
              })()}

              {selectedWorkouts.filter((w) => w.type === 'strength').length > 1 && (
                <div className="flex justify-end gap-3 mb-2">
                  <button type="button" onClick={expandAllDay} className="text-[12px] tracked uppercase text-muted hover:text-accent-primary transition">
                    Expand All
                  </button>
                  <span className="text-line">|</span>
                  <button type="button" onClick={collapseAllDay} className="text-[12px] tracked uppercase text-muted hover:text-accent-primary transition">
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
                    progress={computeExerciseProgress(w, prHistoryPool)}
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
        <a href="/history" className="block text-center text-xs tracked uppercase text-muted hover:text-accent-primary transition py-1">
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
            className="text-xs font-display tracked uppercase text-accent-primary"
          >
            {showGoalForm ? 'ปิด' : '+ เพิ่มเป้าหมาย'}
          </button>
        </div>

        {goalActionError && <p className="text-[12px] text-rusttext">{goalActionError.message}</p>}

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
                          className="text-xs text-muted hover:text-accent-primary focus:text-accent-primary transition"
                        >
                          สำเร็จ
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteGoal(g)}
                        className="text-xs text-muted hover:text-rust focus:text-rust transition"
                      >
                        ลบ
                      </button>
                    </div>
                  </div>
                  {progress !== null && (
                    <div className="mt-2.5 h-1.5 rounded-full bg-surface2 overflow-hidden">
                      <div
                        className="h-full bg-accent-primary transition-[width]"
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
      // 6D P2-1 — สูตรเดียวกับ goalProgress() ด้านบน (workoutVolumeKg, ไม่ใช่ sets*reps*weight_kg แยกสูตร) —
      // สำคัญเพราะค่านี้กลายเป็น starting_value ของเป้าหมาย ถ้าคนละ semantics กับ current จะทำให้ % คืบหน้า
      // เพี้ยนทั้งช่วง (denominator/baseline ผิดตั้งแต่วันสร้างเป้าหมาย)
      return allWorkouts.filter((w) => w.type === 'strength').reduce((s, w) => s + workoutVolumeKg(w), 0)
    }
    if (goalType === 'cardio_distance') {
      return allWorkouts.filter((w) => w.type === 'cardio').reduce((s, w) => s + (w.distance_km ?? 0), 0)
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // P2-05 — target_value เดิมไม่มี validation เลยสักจุด (min ของ input เฉยๆ ไม่พอ เพราะ onSubmit เรียก
    // preventDefault() ตรงๆ อยู่แล้ว ไม่ผ่าน native constraint validation) ค่า 0/ติดลบ/ว่าง/ไม่ใช่ตัวเลข
    // ไม่มีความหมายทางกายภาพสำหรับ goal ทั้ง 4 ประเภท — เช็คก่อนแตะ Supabase เลย เหมือน write-boundary
    // pattern ของ saveAge/saveHeight (lib/profile.ts)
    if (!isValidGoalTarget(targetValue)) {
      setError('กรุณากรอกค่าเป้าหมายที่มากกว่า 0')
      return
    }
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
      // P2-05 — targetValue ผ่าน isValidGoalTarget() ด้านบนแล้ว การันตีว่าไม่ว่าง/เป็นตัวเลข/>0 เสมอ
      // ณ จุดนี้ ไม่ต้อง fallback เป็น null อีกต่อไป
      target_value: isWeightGoalType(goalType) ? toKg(Number(targetValue)) : Number(targetValue),
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
          min="0.1"
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
