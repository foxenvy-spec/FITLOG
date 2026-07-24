'use client'

import { useMemo } from 'react'
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

async function fetchConsistencyData(supabase: ReturnType<typeof createClient>) {
  const today = new Date()
  const windowStart = new Date(today)
  windowStart.setDate(windowStart.getDate() - (WINDOW_DAYS - 1))
  const { start: weekStart, end: weekEnd } = getWeekRange()

  const [{ data: windowRows }, { data: weekRows }] = await Promise.all([
    supabase
      .from('workouts')
      .select('performed_at, sets, type')
      .gte('performed_at', toIso(windowStart))
      .lte('performed_at', toIso(today)),
    supabase.from('workouts').select('exercise_name, type, sets, reps, weight_kg, total_volume_kg').gte('performed_at', weekStart).lte('performed_at', weekEnd),
  ])

  const setsByDay: Record<string, number> = {}
  ;((windowRows as { performed_at: string; sets: number | null; type: string }[]) ?? []).forEach((r) => {
    if (r.type !== 'strength') return
    setsByDay[r.performed_at] = (setsByDay[r.performed_at] ?? 0) + (r.sets ?? 0)
  })

  const weekWorkouts = (weekRows as Workout[]) ?? []
  const weekVolumeKg = weekWorkouts.filter((w) => w.type === 'strength').reduce((s, w) => s + workoutVolumeKg(w), 0)
  const weekExerciseCount = new Set(weekWorkouts.map((w) => w.exercise_name).filter(Boolean)).size

  return {
    setsByDay,
    windowStartIso: toIso(windowStart),
    todayIso: toIso(today),
    weekVolumeKg,
    weekExerciseCount,
  }
}

export default function ConsistencyStrip() {
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: ['consistency-strip'],
    queryFn: () => fetchConsistencyData(supabase),
    staleTime: 60_000,
  })

  const grid = useMemo(() => {
    if (!data) return null
    const { setsByDay, windowStartIso } = data
    const maxSets = Math.max(1, ...Object.values(setsByDay))

    const days: { iso: string; level: Level }[] = []
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
      days.push({ iso, level })
    }

    // เรียงเป็นแถวตามสัปดาห์ (จ-อา) — วันแรกของช่วงอาจไม่ใช่วันจันทร์ จึงเติมช่องว่างข้างหน้าแถวแรก
    const firstDow = (new Date(days[0].iso + 'T00:00:00').getDay() + 6) % 7 // 0=จันทร์
    const padded: ({ iso: string; level: Level } | null)[] = Array(firstDow).fill(null)
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
    <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
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

      <div className="px-4 pb-3">
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
            {grid.padded.map((day, i) =>
              day ? (
                <div
                  key={day.iso}
                  title={`${shortThaiDate(day.iso)} — ${LEVEL_LABEL[day.level]}`}
                  className="aspect-square rounded-md"
                  style={{ backgroundColor: LEVEL_COLOR[day.level] }}
                />
              ) : (
                <div key={`pad-${i}`} className="aspect-square" />
              )
            )}
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

      <div className="border-t border-line grid grid-cols-2 sm:grid-cols-4 divide-x divide-line">
        <StatTile value={grid?.workoutDays ?? 0} label="วันออกกำลังกาย" caption={`จาก ${WINDOW_DAYS} วัน`} />
        <StatTile value={grid?.consecutiveWeeks ?? 0} label="สัปดาห์ติด" caption="ในช่วงนี้" />
        <StatTile value={data ? Math.round(data.weekVolumeKg).toLocaleString('th-TH') : 0} label="กก. น้ำหนักรวม" caption="สัปดาห์นี้" />
        <StatTile value={data?.weekExerciseCount ?? 0} label="ท่าออกกำลังกาย" caption="สัปดาห์นี้" />
      </div>
    </div>
  )
}

function StatTile({ value, label, caption }: { value: number | string; label: string; caption: string }) {
  return (
    <div className="px-3 py-3.5 text-center">
      <p className="font-mono text-lg text-amber">{value}</p>
      <p className="text-[10px] text-ink mt-0.5">{label}</p>
      <p className="text-[9px] text-muted">{caption}</p>
    </div>
  )
}
