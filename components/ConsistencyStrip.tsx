'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange, computePlannedConsistency, computeCurrentStreakDates, computeLongestStreak } from '@/lib/dashboardStats'
import { daysAgoStr } from '@/lib/weekdays'
import { workoutVolumeKg } from '@/lib/workoutDisplay'
import { buildDisplaySets } from '@/components/ExerciseCard'
import type { Workout, WorkoutSet } from '@/lib/types'

const WEEKDAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']
const WINDOW_DAYS = 21 // 3 สัปดาห์เต็ม (จ-อา) ย้อนหลัง — พอเห็นแพทเทิร์นโดยไม่ยาวเทอะทะ

function toIso(d: Date) {
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 10)
}

function shortThaiDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

type Level = 'none' | 'low' | 'mid' | 'high'

const LEVEL_COLOR: Record<Level, string> = {
  none: '#2E333A',
  low: '#C1503A',
  mid: '#E8A33D',
  high: '#7A9B57',
}

const LEVEL_LABEL: Record<Level, string> = {
  high: 'ดีมาก',
  mid: 'ปานกลาง',
  low: 'น้อย',
  none: 'ไม่มีข้อมูล',
}

// รายละเอียดพอสำหรับ tooltip/แผงสรุปวัน — ไม่ต้อง fetch ซ้ำตอนคลิก
const WINDOW_ROW_SELECT =
  'performed_at, sets, reps, weight_kg, total_volume_kg, type, exercise_name, muscle_group, cardio_type, duration_min, calories_kcal'

// ฟีดแบ็ก "Consistency ยังมีพื้นที่ให้พัฒนาเยอะ — เพิ่ม Trend (ดีขึ้น/แย่ลงจากช่วงก่อน) + Milestone
// (อีกกี่วันถึงจะทำสถิติใหม่)" — ทั้งสองอย่างต้องการข้อมูลนอกช่วงหน้าต่าง 21 วันที่มีอยู่เดิม:
// prevWindowRows (ช่วง 21 วันก่อนหน้าช่วงปัจจุบัน สำหรับ trend) และ streakRows (ประวัติย้อนหลัง 400 วัน
// สำหรับ current/best streak ตัวเดียวกับที่ DashboardView.tsx ใช้คำนวณ streak หลักของแอปอยู่แล้ว — เรียก
// computeCurrentStreakDates/computeLongestStreak ตัวเดียวกันเป๊ะ ไม่คำนวณสูตรแยกใหม่)
async function fetchConsistencyData(supabase: ReturnType<typeof createClient>) {
  const today = new Date()
  const windowStart = new Date(today)
  windowStart.setDate(windowStart.getDate() - (WINDOW_DAYS - 1))
  const prevWindowEnd = new Date(windowStart)
  prevWindowEnd.setDate(prevWindowEnd.getDate() - 1)
  const prevWindowStart = new Date(prevWindowEnd)
  prevWindowStart.setDate(prevWindowStart.getDate() - (WINDOW_DAYS - 1))
  const { start: weekStart, end: weekEnd } = getWeekRange()
  const streakCutoff = daysAgoStr(400)

  const [{ data: windowRows }, { data: prevWindowRows }, { data: weekRows }, { data: programDayRows }, { data: streakRows }] =
    await Promise.all([
      supabase.from('workouts').select(WINDOW_ROW_SELECT).gte('performed_at', toIso(windowStart)).lte('performed_at', toIso(today)),
      supabase.from('workouts').select('performed_at').gte('performed_at', toIso(prevWindowStart)).lte('performed_at', toIso(prevWindowEnd)),
      supabase.from('workouts').select('exercise_name, type, sets, reps, weight_kg, total_volume_kg').gte('performed_at', weekStart).lte('performed_at', weekEnd),
      // ฟีดแบ็ก "Consistency ควรวัดกับ Plan ไม่ใช่ปฏิทินดิบ — โปรแกรมตั้งไว้ 3 วัน/สัปดาห์ ทำครบ 3 วันทุก
      // สัปดาห์ควรนับ 100% ไม่ใช่ 7/21 = 33%" — ดึงวันที่ตั้งโปรแกรมไว้ (day_of_week) มาเป็นตัวส่วนแทนที่จะ
      // นับ "วันออกกำลังกาย" เทียบกับจำนวนวันในช่วงเฉยๆ เหมือนเดิม
      supabase.from('program_days').select('day_of_week'),
      supabase.from('workouts').select('performed_at').gte('performed_at', streakCutoff).order('performed_at', { ascending: false }),
    ])

  const windowWorkouts = (windowRows as Workout[]) ?? []

  const setsByDay: Record<string, number> = {}
  const workoutsByDay: Record<string, Workout[]> = {}
  windowWorkouts.forEach((r) => {
    if (r.type === 'strength') setsByDay[r.performed_at] = (setsByDay[r.performed_at] ?? 0) + (r.sets ?? 0)
    ;(workoutsByDay[r.performed_at] ??= []).push(r)
  })

  const weekWorkouts = (weekRows as Workout[]) ?? []
  const weekVolumeKg = weekWorkouts.filter((w) => w.type === 'strength').reduce((s, w) => s + workoutVolumeKg(w), 0)
  const weekExerciseCount = new Set(weekWorkouts.map((w) => w.exercise_name).filter(Boolean)).size

  const plannedWeekdays = new Set(((programDayRows as { day_of_week: number }[]) ?? []).map((d) => d.day_of_week))

  // ช่วงก่อนหน้า (21 วันก่อน windowStart) เทียบเปอร์เซ็นต์ตาม Plan แบบเดียวกับช่วงปัจจุบัน (ใช้ plannedWeekdays
  // เดียวกัน — โปรแกรมที่ตั้งไว้ตอนนี้ถือว่าใช้ตลอดทั้งสองช่วงเพื่อความง่าย ไม่มีประวัติ versioning ของ program_days)
  const prevWorkoutDates = new Set(((prevWindowRows as { performed_at: string }[]) ?? []).map((r) => r.performed_at))
  const prevDays: { dayOfWeek: number; hasWorkout: boolean }[] = []
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(prevWindowStart)
    d.setDate(d.getDate() + i)
    prevDays.push({ dayOfWeek: d.getDay(), hasWorkout: prevWorkoutDates.has(toIso(d)) })
  }
  const previousConsistencyPct = computePlannedConsistency(prevDays, plannedWeekdays).pct

  // Current/Best streak (นับวัน ไม่ใช่สัปดาห์ — ตัวเดียวกับ Dashboard "Workout Streak") ใช้หา milestone
  const distinctStreakDates = Array.from(new Set(((streakRows as { performed_at: string }[]) ?? []).map((r) => r.performed_at)))
  const currentStreak = computeCurrentStreakDates(distinctStreakDates, plannedWeekdays).size
  const bestStreakEver = computeLongestStreak(distinctStreakDates, plannedWeekdays)

  return {
    setsByDay,
    workoutsByDay,
    windowStartIso: toIso(windowStart),
    todayIso: toIso(today),
    weekVolumeKg,
    weekExerciseCount,
    plannedWeekdays,
    previousConsistencyPct,
    currentStreak,
    bestStreakEver,
  }
}

// สรุปแถวเดียวเป็นข้อความสั้นๆ ใช้ทั้งใน title (hover) และแผงรายละเอียด
function describeWorkout(w: Workout): string {
  if (w.type === 'strength') {
    const parts = [w.exercise_name ?? 'ท่าออกกำลังกาย']
    if (w.sets && w.reps) parts.push(`${w.sets}x${w.reps}`)
    if (w.weight_kg) parts.push(`${w.weight_kg}กก.`)
    return parts.join(' ')
  }
  const parts = [w.cardio_type ?? 'คาร์ดิโอ']
  if (w.duration_min) parts.push(`${w.duration_min} นาที`)
  return parts.join(' ')
}

export default function ConsistencyStrip() {
  const supabase = createClient()
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null)
  const [showMoreStats, setShowMoreStats] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['consistency-strip'],
    queryFn: () => fetchConsistencyData(supabase),
    staleTime: 60_000,
  })

  const selectedDayWorkouts = selectedDayIso ? data?.workoutsByDay[selectedDayIso] ?? [] : null

  const grid = useMemo(() => {
    if (!data) return null
    const { setsByDay, workoutsByDay, windowStartIso, plannedWeekdays } = data
    const maxSets = Math.max(1, ...Object.values(setsByDay))

    const days: { iso: string; level: Level; workouts: Workout[] }[] = []
    const start = new Date(windowStartIso + 'T00:00:00')
    for (let i = 0; i < WINDOW_DAYS; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      const iso = toIso(d)
      const sets = setsByDay[iso] ?? 0
      let level: Level = 'none'
      if (sets > 0) {
        const ratio = sets / maxSets
        level = ratio > 2 / 3 ? 'high' : ratio > 1 / 3 ? 'mid' : 'low'
      }
      days.push({ iso, level, workouts: workoutsByDay[iso] ?? [] })
    }

    // เรียงเป็นแถวตามสัปดาห์ (จ-อา) — วันแรกของช่วงอาจไม่ใช่วันจันทร์ จึงเติมช่องว่างข้างหน้าแถวแรก
    const firstDow = (new Date(days[0].iso + 'T00:00:00').getDay() + 6) % 7 // 0=จันทร์
    const padded: (typeof days[number] | null)[] = Array(firstDow).fill(null)
    padded.push(...days)
    while (padded.length % 7 !== 0) padded.push(null)

    const workoutDays = days.filter((d) => d.level !== 'none').length

    // "สัปดาห์ติด" ในช่วงที่แสดง — นับสัปดาห์ล่าสุดถอยหลัง ที่มีอย่างน้อย 1 วันออกกำลังกาย
    // ต่อเนื่องกัน (ไม่ใช่สถิติสูงสุดตลอดกาล แค่ภายในหน้าต่าง 3 สัปดาห์นี้)
    const weeks: Level[][] = []
    for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7).map((d) => d?.level ?? 'none'))
    let consecutiveWeeks = 0
    for (let i = weeks.length - 1; i >= 0; i--) {
      if (weeks[i].some((l) => l !== 'none')) consecutiveWeeks++
      else break
    }

    // ฟีดแบ็ก "Training Consistency ควรวัดกับ Plan ไม่ใช่ปฏิทินดิบ" — เดิม workoutDays (นับวันที่มี log
    // เทียบกับ WINDOW_DAYS ทั้งหมด) ทำให้โปรแกรมที่ตั้งไว้ 3 วัน/สัปดาห์แล้วทำครบทุกวันที่กำหนดจริง ยังโชว์
    // "7/21 วัน" (33%) ทั้งที่ Consistency จริงคือ 100% — computePlannedConsistency (lib/dashboardStats.ts)
    // นับเฉพาะวันที่ "ตั้งโปรแกรมไว้จริง" (day_of_week ตรงกับ program_days) เป็นตัวส่วนแทน
    const { plannedCount, completedCount: completedPlannedCount, pct: consistencyPct } = computePlannedConsistency(
      days.map((day) => ({ dayOfWeek: new Date(day.iso + 'T00:00:00').getDay(), hasWorkout: day.workouts.length > 0 })),
      plannedWeekdays
    )

    return { padded, workoutDays, consecutiveWeeks, consistencyPct, plannedCount, completedPlannedCount }
  }, [data])

  return (
    <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden lg:grid lg:grid-cols-3">
      {/* left: calendar grid + legend — spans 2/3 on lg+ so the 4 stat tiles can sit
          beside it as a 2x2 block instead of stacking in a row underneath */}
      <div className="lg:col-span-2 lg:border-r lg:border-line">
        <div className="px-4 pt-3.5 pb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] tracked uppercase text-muted">Consistency</p>
            {data && (
              <p className="text-[11px] text-muted mt-0.5">
                ย้อนหลัง {WINDOW_DAYS} วัน • {shortThaiDate(data.windowStartIso)} - {shortThaiDate(data.todayIso)}
              </p>
            )}
          </div>
          <a href="/calendar" className="text-[11px] text-amber shrink-0">
            ดูปฏิทินทั้งหมด →
          </a>
        </div>

        <div className="px-4 pb-4 flex gap-4 flex-wrap">
          <div className="max-w-[220px] shrink-0">
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {WEEKDAY_LABELS.map((d) => (
                <p key={d} className="text-[10px] text-muted text-center">
                  {d}
                </p>
              ))}
            </div>
            {isLoading || !grid ? (
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 21 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-md bg-surface2 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1.5">
                {grid.padded.map((day, i) => {
                  if (!day) return <div key={`pad-${i}`} className="aspect-square" />
                  const hasData = day.workouts.length > 0
                  const tooltip = hasData
                    ? `${shortThaiDate(day.iso)} — ${day.workouts.map(describeWorkout).join(', ')}`
                    : `${shortThaiDate(day.iso)} — ${LEVEL_LABEL[day.level]}`
                  const isSelected = selectedDayIso === day.iso
                  return (
                    <button
                      key={day.iso}
                      type="button"
                      title={tooltip}
                      disabled={!hasData}
                      onClick={() => setSelectedDayIso((cur) => (cur === day.iso ? null : day.iso))}
                      className="aspect-square rounded-md disabled:cursor-default enabled:cursor-pointer transition-shadow"
                      style={{
                        backgroundColor: LEVEL_COLOR[day.level],
                        boxShadow: isSelected ? '0 0 0 2px #E8A33D' : 'none',
                      }}
                    />
                  )
                })}
              </div>
            )}

            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {(['high', 'mid', 'low', 'none'] as Level[]).map((level) => (
                <span key={level} className="flex items-center gap-1.5 text-[10px] text-muted">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: LEVEL_COLOR[level] }} />
                  {LEVEL_LABEL[level]}
                </span>
              ))}
            </div>
          </div>

          {/* detail of a clicked day — sits in the space beside the calendar, only rendered once a day is selected */}
          {selectedDayIso && selectedDayWorkouts && (
            <DayDetail
              key={selectedDayIso}
              iso={selectedDayIso}
              workouts={selectedDayWorkouts}
              onClose={() => setSelectedDayIso(null)}
            />
          )}
        </div>
      </div>

      {/* ฟีดแบ็ก "Consistency กินพื้นที่มาก — Hero ควรเหลือแค่ % + streak ส่วน กก./ท่าออกกำลังกาย ควรซ่อนไว้
          ก่อน" — เดิมโชว์ 4 tile พร้อมกันเสมอ ลดเหลือ 2 tile หลัก (Consistency%, สัปดาห์ติด) ที่เห็นทันที
          ส่วนน้ำหนักรวม/ท่าออกกำลังกายซ่อนหลังปุ่ม toggle แทน (ข้อมูลเดิมทุกตัวเลข ไม่มีอะไรหายไป แค่ไม่ต้อง
          โชว์พร้อมกันทั้งหมดตั้งแต่แรกเห็น) */}
      <div className="border-t border-line lg:border-t-0 lg:col-span-1">
        <div className="grid grid-cols-2 divide-x divide-line">
          {grid?.consistencyPct !== null && grid?.consistencyPct !== undefined ? (
            <StatTile
              value={`${grid.consistencyPct}%`}
              label="Training Consistency"
              caption={`${grid.completedPlannedCount}/${grid.plannedCount} ครั้งตามแผน`}
              trend={data?.previousConsistencyPct != null ? grid.consistencyPct - data.previousConsistencyPct : null}
            />
          ) : (
            <StatTile value={grid?.workoutDays ?? 0} label="วันออกกำลังกาย" caption={`จาก ${WINDOW_DAYS} วัน`} />
          )}
          <StatTile value={grid?.consecutiveWeeks ?? 0} label="สัปดาห์ติด" caption="สถิติดีที่สุด" />
        </div>
        <button
          type="button"
          onClick={() => setShowMoreStats((v) => !v)}
          className="w-full text-center text-[11px] font-medium py-2 border-t border-line"
          style={{ color: '#E8A33D' }}
        >
          {showMoreStats ? 'ซ่อนรายละเอียดเพิ่มเติม ↑' : 'ดูรายละเอียดเพิ่มเติม →'}
        </button>
        {showMoreStats && (
          <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
            <StatTile value={data ? Math.round(data.weekVolumeKg).toLocaleString('th-TH') : 0} label="กก. น้ำหนักรวม" caption="สัปดาห์นี้" />
            <StatTile value={data?.weekExerciseCount ?? 0} label="ท่าออกกำลังกาย" caption="สัปดาห์นี้" />
          </div>
        )}
      </div>

      {/* ฟีดแบ็ก "เพิ่ม milestone: อีก 2 วัน → ทำสถิติใหม่ — Gamification จะทำให้ Dashboard มีแรงจูงใจมากขึ้น"
          — เทียบ current streak (นับวัน) กับสถิติสูงสุดที่เคยทำได้ ตัวเดียวกับ Dashboard "Workout Streak"
          (ดู comment เต็มที่ fetchConsistencyData) ไม่โชว์ตอนไม่มีข้อมูลพอ (ยังไม่เคยมี streak เลย) */}
      {data && data.bestStreakEver > 0 && (
        <div className="lg:col-span-3 border-t border-line px-4 py-2.5">
          {data.currentStreak >= data.bestStreakEver ? (
            <p className="text-[11px] text-center" style={{ color: '#E8A33D' }}>
              🔥 กำลังทำสถิติต่อเนื่องที่ดีที่สุดของคุณอยู่ ({data.currentStreak} วันติด)
            </p>
          ) : (
            <p className="text-[11px] text-center text-muted">
              🔥 อีก <span className="text-amber font-medium">{data.bestStreakEver - data.currentStreak}</span> วัน → ทำสถิติต่อเนื่องใหม่
              (สถิติเดิม {data.bestStreakEver} วัน)
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function DayDetail({ iso, workouts, onClose }: { iso: string; workouts: Workout[]; onClose: () => void }) {
  const supabase = createClient()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const strengthIds = useMemo(() => workouts.filter((w) => w.type === 'strength').map((w) => w.id), [workouts])

  const { data: setsByWorkoutId } = useQuery({
    queryKey: ['consistency-strip-day-sets', iso, strengthIds.join(',')],
    queryFn: async () => {
      const { data } = await supabase.from('workout_sets').select('*').in('workout_id', strengthIds).order('set_number')
      const byId: Record<string, WorkoutSet[]> = {}
      ;((data as WorkoutSet[]) ?? []).forEach((s) => {
        ;(byId[s.workout_id] ??= []).push(s)
      })
      return byId
    },
    enabled: strengthIds.length > 0,
    staleTime: 60_000,
  })

  const totalSets = workouts.filter((w) => w.type === 'strength').reduce((s, w) => s + (w.sets ?? 0), 0)
  const totalVolumeKg = workouts.filter((w) => w.type === 'strength').reduce((s, w) => s + workoutVolumeKg(w), 0)

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex-1 min-w-[180px] border-l border-line pl-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] text-ink font-medium">{shortThaiDate(iso)}</p>
          <p className="text-[9px] text-muted mt-0.5">
            {workouts.length} รายการ • {totalSets} เซ็ต • {Math.round(totalVolumeKg).toLocaleString('th-TH')} กก.
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-[11px] text-muted hover:text-ink shrink-0 leading-none px-1" aria-label="ปิด">
          ✕
        </button>
      </div>
      <div className="mt-2 overflow-y-auto max-h-[220px]">
        {workouts.length === 0 ? (
          <p className="text-[11px] text-muted py-2">ไม่มีข้อมูลวันนี้</p>
        ) : (
          <ul className="space-y-1">
            {workouts.map((w, i) => {
              const displaySets = w.type === 'strength' ? buildDisplaySets(w, setsByWorkoutId?.[w.id] ?? []) : []
              const canExpand = w.type === 'strength' && displaySets.length > 0
              const isOpen = expandedIds.has(w.id)
              return (
                <li key={w.id ?? i}>
                  <button
                    type="button"
                    disabled={!canExpand}
                    onClick={() => toggle(w.id)}
                    className="w-full text-left text-[11px] text-ink py-0.5 flex items-center justify-between gap-2 disabled:cursor-default enabled:cursor-pointer group"
                  >
                    <span>{describeWorkout(w)}</span>
                    {canExpand && (
                      <span
                        className="text-muted text-[9px] shrink-0 transition-transform group-hover:text-amber"
                        style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
                        aria-hidden="true"
                      >
                        ▼
                      </span>
                    )}
                  </button>
                  {isOpen && canExpand && (
                    <div className="grid grid-cols-3 gap-1 mb-1.5 mt-1">
                      {displaySets.map((s) => (
                        <div key={s.id} className="rounded-md bg-surface2 px-1.5 py-1 text-center">
                          <p className="text-[8px] tracked uppercase text-muted">เซ็ต {s.set_number}</p>
                          <p className="font-mono text-[10px] font-semibold text-ink tabular">
                            {s.weight_kg ?? '—'}กก. × {s.reps ?? '—'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatTile({
  value,
  label,
  caption,
  trend,
}: {
  value: number | string
  label: string
  caption: string
  // ฟีดแบ็ก "Consistency ควรเห็นเทรนด์ ดีขึ้น/แย่ลง ไม่ใช่แค่เลขลอยๆ" — เทียบกับช่วง 21 วันก่อนหน้า
  // (ตัวเลขเดียวกับ computePlannedConsistency ที่ใช้คำนวณค่าปัจจุบัน) undefined = ไม่มีข้อมูลพอเทียบ
  trend?: number | null
}) {
  return (
    <div className="px-3 py-3.5 text-center flex flex-col items-center justify-center">
      <p className="font-mono text-lg text-amber">{value}</p>
      <p className="text-[10px] text-ink mt-0.5">{label}</p>
      <p className="text-[9px] text-muted">{caption}</p>
      {trend != null && trend !== 0 && (
        <p className="text-[9px] mt-0.5" style={{ color: trend > 0 ? '#7A9B57' : '#C1503A' }}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% จากช่วงก่อน
        </p>
      )}
    </div>
  )
}
