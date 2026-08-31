'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ProgramDay, ProgramExercise, Workout, WorkoutTemplate, WorkoutTemplateExercise } from '@/lib/types'
import { todayStr, todayDayOfWeek, daysAgoStr } from '@/lib/weekdays'
import { computeCurrentStreak, relativeDayLabel } from '@/lib/dashboardStats'
import { computeDaySummary } from '@/lib/workoutDisplay'
import { startTemplateAsWorkoutLog } from '@/lib/startTemplate'
import { calculatePlates } from '@/lib/plateCalculator'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { getErrorMessage } from '@/lib/errors'
import { COLORS, withAlpha } from '@/lib/theme'
import PremiumCard from '@/components/ui/PremiumCard'
import LoadingState from '@/components/LoadingState'
import ErrorState from '@/components/ErrorState'

// หน้า "Train" — เดิมมีแค่ปุ่มลิงก์ลอยๆ ไม่ดึงข้อมูลอะไรเลย บนจอคอมเลยดูโล่งมาก (ฟีดแบ็ก "พื้นที่ว่าง
// เหลือมากกว่า 70%") เปลี่ยนเป็น "Workout Launchpad" ที่ดึงข้อมูลจริงมาแสดง (โปรแกรมวันนี้/เซสชันล่าสุด/
// เทมเพลตที่บันทึกไว้/streak) — จอใหญ่จัด 2 คอลัมน์ (~60:40) จอมือถือเรียงเป็นคอลัมน์เดียวโดยจงใจเรียง
// ลำดับให้ปุ่ม action หลัก (เริ่มเทรน/บันทึกอิสระ/เครื่องมือ) ขึ้นก่อนการ์ดเสริม (เซสชันล่าสุด/เทมเพลตด่วน)
// ด้วย order-* (มือถือ) คู่กับ lg:col-start/row-start (จอใหญ่) แบบเดียวกับที่ DashboardView.tsx ใช้อยู่แล้ว

const STREAK_LOOKBACK_DAYS = 400

const SECONDARY = [
  { href: '/program', icon: '📅', label: 'โปรแกรม' },
  { href: '/templates', icon: '📋', label: 'เทมเพลต' },
  { href: '/timer', icon: '⏱', label: 'ไทม์เมอร์' },
  { href: '/exercises', icon: '🏋', label: 'คลังท่าออกกำลัง' },
]

interface RecentSession {
  date: string
  workouts: Workout[]
}

interface TrainData {
  currentDay: ProgramDay | null
  todayExercises: ProgramExercise[]
  completedCount: number
  streak: number
  recentSessions: RecentSession[]
  templates: WorkoutTemplate[]
  exercisesByTemplate: Record<string, WorkoutTemplateExercise[]>
}

// เซตต่อกล้ามเนื้อของโปรแกรมวันนี้ เรียงมากไปน้อย เอาแค่ 3 อันดับแรก (เช่น "อก 16 เซ็ต · ไหล่ 7 เซ็ต")
function muscleSplitSummary(exercises: ProgramExercise[]): { group: string; sets: number }[] {
  const totals = new Map<string, number>()
  exercises.forEach((e) => {
    if (!e.muscle_group) return
    totals.set(e.muscle_group, (totals.get(e.muscle_group) ?? 0) + (e.sets ?? 0))
  })
  return Array.from(totals.entries())
    .map(([group, sets]) => ({ group, sets }))
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 3)
}

export default function TrainPage() {
  const supabase = createClient()
  const [data, setData] = useState<TrainData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [startingTemplateId, setStartingTemplateId] = useState<string | null>(null)
  const [templateMessage, setTemplateMessage] = useState<string | null>(null)
  const [repeatingDate, setRepeatingDate] = useState<string | null>(null)
  const [repeatResult, setRepeatResult] = useState<{ date: string; message: string } | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const today = todayStr()
      const dow = todayDayOfWeek()
      const streakCutoff = daysAgoStr(STREAK_LOOKBACK_DAYS)

      const [
        { data: dayRows, error: dayErr },
        { data: dateRows },
        { data: recentWorkouts },
        { data: templateRows },
      ] = await Promise.all([
        supabase.from('program_days').select('*').order('day_of_week'),
        supabase
          .from('workouts')
          .select('performed_at')
          .gte('performed_at', streakCutoff)
          .order('performed_at', { ascending: false }),
        supabase
          .from('workouts')
          .select('*')
          .order('performed_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(120),
        supabase.from('workout_templates').select('*').order('created_at', { ascending: false }).limit(6),
      ])

      if (dayErr) {
        setLoadError(dayErr.message)
        return
      }

      const typedDays = (dayRows as ProgramDay[]) ?? []
      const currentDay = typedDays.find((d) => d.day_of_week === dow) ?? null

      let todayExercises: ProgramExercise[] = []
      if (currentDay) {
        const { data: exRows } = await supabase
          .from('program_exercises')
          .select('*')
          .eq('program_day_id', currentDay.id)
          .order('position')
        todayExercises = (exRows as ProgramExercise[]) ?? []
      }

      let completedCount = 0
      if (todayExercises.length > 0) {
        const { data: completions } = await supabase
          .from('program_completions')
          .select('program_exercise_id')
          .eq('completed_at', today)
          .in(
            'program_exercise_id',
            todayExercises.map((e) => e.id)
          )
        completedCount = completions?.length ?? 0
      }

      const distinctDates = Array.from(
        new Set(((dateRows as { performed_at: string }[]) ?? []).map((r) => r.performed_at))
      )
      const workoutWeekdays = new Set(typedDays.map((d) => d.day_of_week))
      const streak = computeCurrentStreak(distinctDates, workoutWeekdays)

      // 2 เซสชันล่าสุด "ที่ไม่ใช่วันนี้" — กันไม่ให้ซ้ำกับการ์ดโปรแกรมวันนี้ด้านบนที่คุยเรื่องวันนี้อยู่แล้ว
      // recentWorkouts เรียง performed_at ใหม่สุดก่อนแล้ว แถวของวันเดียวกันจึงเรียงติดกันเป็นก้อนเสมอ
      const allRecent = (recentWorkouts as Workout[]) ?? []
      const pastWorkouts = allRecent.filter((w) => w.performed_at !== today)
      const recentDates: string[] = []
      pastWorkouts.forEach((w) => {
        if (recentDates.length < 2 && !recentDates.includes(w.performed_at)) recentDates.push(w.performed_at)
      })
      const recentSessions: RecentSession[] = recentDates.map((date) => ({
        date,
        workouts: pastWorkouts.filter((w) => w.performed_at === date),
      }))

      const templates = (templateRows as WorkoutTemplate[]) ?? []
      const exercisesByTemplate: Record<string, WorkoutTemplateExercise[]> = {}
      if (templates.length > 0) {
        const { data: exRows2 } = await supabase
          .from('workout_template_exercises')
          .select('*')
          .in(
            'template_id',
            templates.map((t) => t.id)
          )
          .order('position')
        ;((exRows2 as WorkoutTemplateExercise[]) ?? []).forEach((ex) => {
          exercisesByTemplate[ex.template_id] = exercisesByTemplate[ex.template_id] ?? []
          exercisesByTemplate[ex.template_id].push(ex)
        })
      }

      setData({
        currentDay,
        todayExercises,
        completedCount,
        streak,
        recentSessions,
        templates,
        exercisesByTemplate,
      })
    } catch (err) {
      setLoadError(getErrorMessage(err))
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load, reloadToken])

  async function handleStartTemplate(template: WorkoutTemplate) {
    if (!data) return
    const exercises = data.exercisesByTemplate[template.id] ?? []
    if (exercises.length === 0) return

    setStartingTemplateId(template.id)
    setTemplateMessage(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setTemplateMessage('กรุณาเข้าสู่ระบบใหม่')
        return
      }
      const { error, count } = await startTemplateAsWorkoutLog(supabase, user.id, exercises)
      if (error) {
        setTemplateMessage(`เริ่ม "${template.title}" ไม่สำเร็จ: ${error}`)
        return
      }
      setTemplateMessage(`บันทึก "${template.title}" (${count} ท่า) เข้า Log วันนี้แล้ว ✓`)
    } catch (err) {
      setTemplateMessage(getErrorMessage(err))
    } finally {
      setStartingTemplateId(null)
    }
  }

  async function handleRepeatSession(session: RecentSession) {
    setRepeatingDate(session.date)
    setRepeatResult(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setRepeatResult({ date: session.date, message: 'กรุณาเข้าสู่ระบบใหม่' })
        return
      }
      const payload = session.workouts.map((w) => ({
        user_id: user.id,
        type: w.type,
        performed_at: todayStr(),
        exercise_name: w.exercise_name,
        muscle_group: w.muscle_group,
        secondary_muscles: w.secondary_muscles,
        exercise_library_id: w.exercise_library_id,
        sets: w.sets,
        reps: w.reps,
        weight_kg: w.weight_kg,
        rpe: w.rpe,
        cardio_type: w.cardio_type,
        distance_km: w.distance_km,
        duration_min: w.duration_min,
        notes: w.notes,
      }))
      const { error } = await supabase.from('workouts').insert(payload)
      if (error) {
        setRepeatResult({ date: session.date, message: `ก๊อปปี้ไม่สำเร็จ: ${error.message}` })
        return
      }
      setRepeatResult({ date: session.date, message: `บันทึก ${payload.length} ท่าเข้า Log วันนี้แล้ว ✓` })
    } catch (err) {
      setRepeatResult({ date: session.date, message: getErrorMessage(err) })
    } finally {
      setRepeatingDate(null)
    }
  }

  return (
    <div className="pb-4">
      <div className="mb-5">
        <p className="text-[10px] tracked uppercase text-muted">Train</p>
        <h1 className="font-display text-xl tracked uppercase text-ink">เริ่มเล่นเลย</h1>
      </div>

      {loadError ? (
        <ErrorState message={loadError} onRetry={() => setReloadToken((n) => n + 1)} />
      ) : !data ? (
        <LoadingState />
      ) : (
        <TrainBody
          data={data}
          startingTemplateId={startingTemplateId}
          templateMessage={templateMessage}
          repeatingDate={repeatingDate}
          repeatResult={repeatResult}
          onStartTemplate={handleStartTemplate}
          onRepeatSession={handleRepeatSession}
        />
      )}
    </div>
  )
}

function TrainBody({
  data,
  startingTemplateId,
  templateMessage,
  repeatingDate,
  repeatResult,
  onStartTemplate,
  onRepeatSession,
}: {
  data: TrainData
  startingTemplateId: string | null
  templateMessage: string | null
  repeatingDate: string | null
  repeatResult: { date: string; message: string } | null
  onStartTemplate: (t: WorkoutTemplate) => void
  onRepeatSession: (s: RecentSession) => void
}) {
  const totalToday = data.todayExercises.length
  const doneAll = totalToday > 0 && data.completedCount >= totalToday
  const ctaLabel = totalToday === 0 ? 'เริ่มเทรนเลย' : doneAll ? 'ทบทวนเวิร์กเอาต์วันนี้' : data.completedCount > 0 ? 'ไปต่อเวิร์กเอาต์นี้' : 'เริ่มเวิร์กเอาต์นี้'
  const splits = muscleSplitSummary(data.todayExercises)
  const previewNames = data.todayExercises
    .slice(0, 3)
    .map((e) => e.exercise_name)
    .join(', ')
  const previewExtra = totalToday > 3 ? ` และอีก ${totalToday - 3} ท่า` : ''

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
      {/* ฝั่งซ้าย ~60% — โปรแกรมวันนี้ + บันทึกอิสระ + เซสชันล่าสุด */}
      <div className="order-1 lg:order-none lg:col-start-1 lg:col-span-7 lg:row-start-1">
        <PremiumCard className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] tracked uppercase text-amber">โปรแกรมวันนี้</p>
            <p className="shrink-0 text-[11px] text-muted whitespace-nowrap">🔥 {data.streak} วันติด</p>
          </div>

          {data.currentDay ? (
            <div>
              <h2 className="font-display text-lg tracked uppercase text-ink">{data.currentDay.title}</h2>
              {splits.length > 0 && (
                <p className="text-xs text-muted mt-1.5">{splits.map((s) => `${s.group} ${s.sets} เซ็ต`).join(' · ')}</p>
              )}
              {previewNames && (
                <p className="text-[11px] text-muted/80 mt-1.5">
                  พรีวิว: {previewNames}
                  {previewExtra}
                </p>
              )}
              {totalToday > 0 && (
                <p className="text-[11px] text-muted mt-2">
                  {data.completedCount}/{totalToday} ท่าเสร็จแล้ว
                </p>
              )}
            </div>
          ) : (
            <div>
              <h2 className="font-display text-lg tracked uppercase text-ink">วันนี้ยังไม่ได้ตั้งโปรแกรม</h2>
              <p className="text-xs text-muted mt-1.5">ตั้งตารางฝึกล่วงหน้าได้ที่หน้าโปรแกรม หรือกดเริ่ม/บันทึกอิสระด้านล่างได้เลย</p>
            </div>
          )}

          <a
            href="/session"
            className="flex items-center justify-center gap-2 rounded-xl bg-amber text-bg font-display text-sm tracked uppercase py-3 active:scale-[0.99] transition"
          >
            <span aria-hidden="true">▶</span> {ctaLabel}
          </a>
        </PremiumCard>
      </div>

      <div className="order-2 lg:order-none lg:col-start-1 lg:col-span-7 lg:row-start-2">
        <PremiumCard as="a" href="/log" className="flex items-center gap-3 px-4 py-3.5 active:scale-[0.99] transition">
          <span className="shrink-0 w-9 h-9 rounded-full bg-amber/15 text-amber flex items-center justify-center text-base">✚</span>
          <div className="min-w-0">
            <p className="font-display tracked uppercase text-ink text-xs">บันทึกเวิร์กเอาต์แบบอิสระ</p>
            <p className="text-[11px] text-muted mt-0.5 truncate">จดเซ็ต น้ำหนัก คาร์ดิโอ แบบอิสระ</p>
          </div>
        </PremiumCard>
      </div>

      {data.recentSessions.length > 0 && (
        <div className="order-4 lg:order-none lg:col-start-1 lg:col-span-7 lg:row-start-3 space-y-2.5">
          <p className="text-[10px] tracked uppercase text-muted">เซสชันล่าสุดที่เล่นไป</p>
          {data.recentSessions.map((session) => {
            const summary = computeDaySummary(session.workouts)
            return (
              <PremiumCard key={session.date} className="px-4 py-3.5 space-y-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {relativeDayLabel(session.date)}
                    {summary.muscleGroups.length > 0 ? ` — ${summary.muscleGroups.join(' · ')}` : ''}
                  </p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {summary.exerciseCount} ท่า · {summary.totalSets} เซ็ต
                    {summary.totalVolumeKg > 0 ? ` · ${Math.round(summary.totalVolumeKg).toLocaleString('th-TH')} kg` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a
                    href="/history"
                    className="flex-1 text-center text-xs text-muted border border-line rounded-lg py-2 hover:text-ink transition"
                  >
                    ดูรายละเอียด
                  </a>
                  <button
                    type="button"
                    onClick={() => onRepeatSession(session)}
                    disabled={repeatingDate !== null}
                    className="flex-1 text-center text-xs text-amber border border-amber/40 rounded-lg py-2 hover:bg-amber/10 transition disabled:opacity-50"
                  >
                    {repeatingDate === session.date ? 'กำลังบันทึก...' : 'เล่นเหมือนรอบนี้'}
                  </button>
                </div>
                {repeatResult && repeatResult.date === session.date && (
                  <p className="text-[11px] text-muted">{repeatResult.message}</p>
                )}
              </PremiumCard>
            )
          })}
        </div>
      )}

      {/* ฝั่งขวา ~40% — เทมเพลตด่วน + เครื่องมือ */}
      {data.templates.length > 0 && (
        <div className="order-5 lg:order-none lg:col-start-8 lg:col-span-5 lg:row-start-1">
          <p className="text-[10px] tracked uppercase text-muted mb-2">เทมเพลตด่วน</p>
          <PremiumCard className="divide-y divide-white/5">
            {data.templates.map((t) => {
              const exs = data.exercisesByTemplate[t.id] ?? []
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink truncate">{t.title}</p>
                    <p className="text-[11px] text-muted mt-0.5">{exs.length} ท่า</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onStartTemplate(t)}
                    disabled={startingTemplateId !== null || exs.length === 0}
                    className="shrink-0 text-xs font-display tracked uppercase text-amber border border-amber/40 rounded-full px-3 py-1.5 hover:bg-amber/10 transition disabled:opacity-50"
                  >
                    {startingTemplateId === t.id ? '...' : 'เริ่มทันที'}
                  </button>
                </div>
              )
            })}
          </PremiumCard>
          {templateMessage && <p className="text-[11px] text-muted mt-2">{templateMessage}</p>}
        </div>
      )}

      <div className="order-3 lg:order-none lg:col-start-8 lg:col-span-5 lg:row-start-2">
        <p className="text-[10px] tracked uppercase text-muted mb-2">เครื่องมือ</p>
        <div className="grid grid-cols-2 gap-2.5">
          {SECONDARY.map((item) => (
            <PremiumCard
              as="a"
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center gap-1.5 py-5 text-muted hover:text-amber transition"
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px] font-display tracked uppercase">{item.label}</span>
            </PremiumCard>
          ))}
        </div>
      </div>

      <div className="order-6 lg:order-none lg:col-start-8 lg:col-span-5 lg:row-start-3">
        <PlateCalculatorWidget />
      </div>
    </div>
  )
}

// เครื่องคิดเลขแผ่นเหล็กแบบด่วน — ใช้ calculatePlates เดิม (lib/plateCalculator.ts) ตัวเดียวกับที่โผล่ใน
// session ระหว่างเทรนอยู่แล้ว แค่ยังไม่เคยมีที่ให้กดใช้แบบเดี่ยวๆ นอกเซสชัน (เช่น เช็คก่อนเข้ายิมว่าต้องใส่
// แผ่นอะไรบ้างสำหรับท่าที่ตั้งใจจะเล่น)
function PlateCalculatorWidget() {
  const { unit } = useWeightUnit()
  const [input, setInput] = useState('')
  const targetWeight = Number(input)
  const breakdown =
    input.trim() !== '' && Number.isFinite(targetWeight) && targetWeight > 0 ? calculatePlates(targetWeight, unit) : null

  return (
    <div>
      <p className="text-[10px] tracked uppercase text-muted mb-2">คำนวณแผ่นเหล็ก</p>
      <PremiumCard className="px-4 py-3.5 space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`น้ำหนักรวมที่ต้องการ (${unit})`}
            className="flex-1 min-w-0 bg-surface2 text-ink text-sm font-mono rounded px-3 py-2 border border-line outline-none focus:border-amber"
          />
          <span className="text-xs text-muted shrink-0">{unit}</span>
        </div>
        {breakdown && (
          <div className="rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap" style={{ background: 'rgba(255,255,255,.04)' }}>
            <span className="text-[9px] tracked uppercase text-muted shrink-0">
              แผ่น/ข้าง (บาร์ {breakdown.barWeight}{unit})
            </span>
            {breakdown.perSide.length === 0 ? (
              <span className="text-[11px] font-mono" style={{ color: '#CFD4DE' }}>
                บาร์เปล่า
              </span>
            ) : (
              breakdown.perSide.map((p) => (
                <span
                  key={p.plate}
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-mono"
                  style={{ background: withAlpha(COLORS.steel, '26'), color: COLORS.steel }}
                >
                  {p.plate}×{p.count}
                </span>
              ))
            )}
            {breakdown.leftoverPerSide > 0 && (
              <span className="text-[9px] tracked text-muted">
                (แบ่งแผ่นไม่ลงตัว เหลือ {breakdown.leftoverPerSide}{unit}/ข้าง)
              </span>
            )}
          </div>
        )}
      </PremiumCard>
    </div>
  )
}
