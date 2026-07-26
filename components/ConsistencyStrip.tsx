'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange } from '@/lib/dashboardStats'
import { workoutVolumeKg } from '@/lib/workoutDisplay'
import type { Workout } from '@/lib/types'

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

async function fetchConsistencyData(supabase: ReturnType<typeof createClient>) {
  const today = new Date()
  const windowStart = new Date(today)
  windowStart.setDate(windowStart.getDate() - (WINDOW_DAYS - 1))
  const { start: weekStart, end: weekEnd } = getWeekRange()

  const [{ data: windowRows }, { data: weekRows }] = await Promise.all([
    supabase.from('workouts').select(WINDOW_ROW_SELECT).gte('performed_at', toIso(windowStart)).lte('performed_at', toIso(today)),
    supabase.from('workouts').select('exercise_name, type, sets, reps, weight_kg, total_volume_kg').gte('performed_at', weekStart).lte('performed_at', weekEnd),
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

  return {
    setsByDay,
    workoutsByDay,
    windowStartIso: toIso(windowStart),
    todayIso: toIso(today),
    weekVolumeKg,
    weekExerciseCount,
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

  const { data, isLoading } = useQuery({
    queryKey: ['consistency-strip'],
    queryFn: () => fetchConsistencyData(supabase),
    staleTime: 60_000,
  })

  const selectedDayWorkouts = selectedDayIso ? data?.workoutsByDay[selectedDayIso] ?? [] : null

  const grid = useMemo(() => {
    if (!data) return null
    const { setsByDay, workoutsByDay, windowStartIso } = data
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

    return { padded, workoutDays, consecutiveWeeks }
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
            <DayDetail iso={selectedDayIso} workouts={selectedDayWorkouts} onClose={() => setSelectedDayIso(null)} />
          )}
        </div>
      </div>

      {/* right: 4 stat tiles as a 2x2 block on lg+ (falls back to a 4-across row below the
          calendar on smaller screens, same as before) */}
      <div className="border-t border-line lg:border-t-0 grid grid-cols-2 divide-x divide-y divide-line lg:col-span-1">
        <StatTile value={grid?.workoutDays ?? 0} label="วันออกกำลังกาย" caption={`จาก ${WINDOW_DAYS} วัน`} />
        <StatTile value={grid?.consecutiveWeeks ?? 0} label="สัปดาห์ติด" caption="สถิติดีที่สุด" />
        <StatTile value={data ? Math.round(data.weekVolumeKg).toLocaleString('th-TH') : 0} label="กก. น้ำหนักรวม" caption="สัปดาห์นี้" />
        <StatTile value={data?.weekExerciseCount ?? 0} label="ท่าออกกำลังกาย" caption="สัปดาห์นี้" />
      </div>
    </div>
  )
}

function DayDetail({ iso, workouts, onClose }: { iso: string; workouts: Workout[]; onClose: () => void }) {
  const totalSets = workouts.filter((w) => w.type === 'strength').reduce((s, w) => s + (w.sets ?? 0), 0)
  const totalVolumeKg = workouts.filter((w) => w.type === 'strength').reduce((s, w) => s + workoutVolumeKg(w), 0)

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
      <div className="mt-2 overflow-y-auto max-h-[150px]">
        {workouts.length === 0 ? (
          <p className="text-[11px] text-muted py-2">ไม่มีข้อมูลวันนี้</p>
        ) : (
          <ul className="space-y-1.5">
            {workouts.map((w, i) => (
              <li key={i} className="text-[11px] text-ink">
                {describeWorkout(w)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatTile({ value, label, caption }: { value: number | string; label: string; caption: string }) {
  return (
    <div className="px-3 py-3.5 text-center flex flex-col items-center justify-center">
      <p className="font-mono text-lg text-amber">{value}</p>
      <p className="text-[10px] text-ink mt-0.5">{label}</p>
      <p className="text-[9px] text-muted">{caption}</p>
    </div>
  )
}
