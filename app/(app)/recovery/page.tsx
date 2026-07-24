'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { MUSCLE_GROUPS, MUSCLE_GROUP_COLORS, type MuscleGroup } from '@/lib/muscle-groups'
import {
  computeRecoveryPct,
  recoveryStatusColor,
  computeRecoveryReadyInHours,
  RECOVERY_WINDOW_DAYS,
  relativeDayLabel,
  suggestMuscleToTrain,
  recoveryRecommendationLabel,
  getScheduledMuscleForDay,
  getNextScheduledMuscle,
} from '@/lib/dashboardStats'
import { computeRecoveryHistory } from '@/lib/trends'
import { todayStr } from '@/lib/weekdays'
import Skeleton from '@/components/Skeleton'
import AnimatedBarFill from '@/components/AnimatedBarFill'
import ErrorState from '@/components/ErrorState'

interface MuscleRow {
  mg: MuscleGroup
  lastTrained: string | null
  pct: number
}


// เกณฑ์เดียวกับ recoveryStatusColor: 0-40% แดง (กำลังพักฟื้น), 41-75% เหลือง (ใกล้พร้อมแล้ว), 76-100% เขียว (พร้อมฝึกแล้ว)
function statusLabel(pct: number) {
  if (pct >= 76) return { text: 'พร้อมฝึกแล้ว', color: 'text-moss' }
  if (pct >= 41) return { text: 'ใกล้พร้อมแล้ว', color: 'text-amber' }
  return { text: 'กำลังพักฟื้น', color: 'text-rusttext' }
}

export default function RecoveryPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<MuscleRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [progressPct, setProgressPct] = useState<number | null>(null)
  // กล้ามเนื้อที่ตารางโปรแกรมประจำสัปดาห์ระบุไว้ (ถ้ามี) — ใช้ยึดคำแนะนำให้ตรงตารางแทน recovery % ล้วนๆ
  const [scheduledMuscle, setScheduledMuscle] = useState<string | null>(null)
  // เก็บ log เวทเทรนนิ่งดิบ (muscle_group + performed_at) ไว้ใช้สร้างกราฟ Recovery Score ย้อนหลัง
  const [strengthLogs, setStrengthLogs] = useState<{ muscle_group: string | null; performed_at: string }[]>([])
  const [historyRangeDays, setHistoryRangeDays] = useState<30 | 90>(30)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await supabase
        .from('workouts')
        .select('muscle_group, performed_at')
        .eq('type', 'strength')
        .order('performed_at', { ascending: false })
        .limit(2000)

      const strengthRows = (data as { muscle_group: string | null; performed_at: string }[]) ?? []
      setStrengthLogs(strengthRows)
      const today = todayStr()
      const trainedAnyToday = strengthRows.some((r) => r.performed_at?.slice(0, 10) === today)

      // % ความคืบหน้าของแผนวันนี้ — เช็คแผนของวันนี้ (program_day ตาม day_of_week) แล้วเทียบจำนวนท่าที่ complete จริง
      const dow = new Date(today + 'T00:00:00').getDay()
      const { data: allProgramDayRows } = await supabase.from('program_days').select('id, day_of_week, title')
      const allProgramDays = (allProgramDayRows as { id: string; day_of_week: number; title: string }[]) ?? []
      const todayDayId = allProgramDays.find((d) => d.day_of_week === dow)?.id ?? null

      let currentProgressPct: number | null = null

      if (todayDayId) {
        const { data: todayExRows } = await supabase
          .from('program_exercises')
          .select('id')
          .eq('program_day_id', todayDayId)
        const todayExerciseIds = (todayExRows as { id: string }[] | null)?.map((r) => r.id) ?? []

        if (todayExerciseIds.length > 0) {
          const { data: completions } = await supabase
            .from('program_completions')
            .select('program_exercise_id')
            .eq('completed_at', today)
            .in('program_exercise_id', todayExerciseIds)
          const completedCount = completions?.length ?? 0
          currentProgressPct = Math.round((completedCount / todayExerciseIds.length) * 100)
        } else {
          // วันนี้มีแผนแต่ไม่มีท่ากำหนดไว้ (แผนว่าง) — ยึดตามมี set log ไว้อย่างน้อย 1 รายการ
          currentProgressPct = trainedAnyToday ? 100 : null
        }
      } else {
        // วันนี้ไม่มีแผนกำหนดไว้ (บันทึกอิสระ) — ยึดตามมี set log ไว้อย่างน้อย 1 รายการ
        currentProgressPct = trainedAnyToday ? 100 : null
      }
      setProgressPct(currentProgressPct)

      // กล้ามเนื้อที่ควรแนะนำ: ยึดตามตารางโปรแกรมประจำสัปดาห์ก่อน (ถ้ามี) — ถ้าวันนี้ทำครบแล้วหรือเป็น
      // วันพัก/ไม่ได้ผูกกล้ามเนื้อไว้ ให้มองไปที่วันถัดไปในตารางแทน ไม่มีตารางเลยจึงตกกลับไปใช้ recovery % ล้วนๆ
      const todayScheduledMuscle = getScheduledMuscleForDay(allProgramDays, dow, MUSCLE_GROUPS)
      setScheduledMuscle(
        todayScheduledMuscle && (currentProgressPct === null || currentProgressPct < 100)
          ? todayScheduledMuscle
          : getNextScheduledMuscle(allProgramDays, dow, MUSCLE_GROUPS)
      )

      const lastTrainedByMuscle: Record<string, string> = {}
      strengthRows.forEach((r) => {
        if (!r.muscle_group) return
        if (!lastTrainedByMuscle[r.muscle_group]) lastTrainedByMuscle[r.muscle_group] = r.performed_at
      })

      const built: MuscleRow[] = MUSCLE_GROUPS.map((mg) => {
        const lastTrained = lastTrainedByMuscle[mg] ?? null
        return { mg, lastTrained, pct: computeRecoveryPct(lastTrained, mg) }
      }).sort((a, b) => a.pct - b.pct)

      setRows(built)
    } catch (err) {
      console.error('Recovery load failed', err)
      Sentry.captureException(err, { tags: { source: 'recovery-page' } })
      setError('ไม่สามารถโหลดข้อมูล Recovery ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const recoveryHistory = useMemo(
    () => computeRecoveryHistory(strengthLogs, historyRangeDays).map((p) => ({ label: relativeDayLabel(p.date), value: p.overallPct })),
    [strengthLogs, historyRangeDays]
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl tracked uppercase">Recovery</h1>
        <p className="text-xs text-muted mt-0.5">
          ประมาณการจากวันที่ฝึกล่าสุดของแต่ละกลุ่มกล้ามเนื้อ ไม่ใช่ค่าทางสรีรวิทยาที่แม่นยำรายบุคคล
        </p>
      </div>

      {!loading && !error && rows.length > 0 && (() => {
        const recoveryPctMap: Record<string, number> = {}
        rows.forEach((r) => {
          recoveryPctMap[r.mg] = r.pct
        })
        const recommendation = suggestMuscleToTrain(recoveryPctMap, scheduledMuscle)
        if (!recommendation) return null
        const recColor = recoveryStatusColor(recommendation.pct)
        return (
          <div
            className="flex items-center gap-2.5 rounded-lg px-4 py-3"
            style={{ backgroundColor: recColor + '1A' }}
          >
            <span className="text-lg">💪</span>
            <p className="text-sm text-ink whitespace-pre-line">
              {recoveryRecommendationLabel(progressPct)}{' '}
              <span className="font-display tracked uppercase" style={{ color: recColor }}>
                {recommendation.muscleGroup}
              </span>{' '}
              <span className="text-muted">— ฟื้นตัวแล้ว {recommendation.pct}%</span>
            </p>
          </div>
        )
      })()}

      {error ? (
        <ErrorState title="โหลดข้อมูล Recovery ไม่สำเร็จ" message={error} onRetry={load} />
      ) : loading ? (
        <div className="space-y-3">
          {MUSCLE_GROUPS.map((mg) => (
            <div key={mg} className="rounded-lg bg-surface border border-line shadow-elevated px-4 py-3.5 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-2.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ mg, lastTrained, pct }) => {
            const status = statusLabel(pct)
            const color = recoveryStatusColor(pct)
            const hoursLeft = computeRecoveryReadyInHours(lastTrained, mg)
            return (
              <div key={mg} className="rounded-lg bg-surface border border-line shadow-elevated px-4 py-3.5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: MUSCLE_GROUP_COLORS[mg] }}
                    />
                    <p className="font-display text-base tracked uppercase text-ink truncate">{mg}</p>
                  </div>
                  <span className="text-[11px] font-mono shrink-0" style={{ color }}>
                    {pct}%
                  </span>
                </div>

                <div className="h-2.5 rounded-full bg-surface2 overflow-hidden">
                  <AnimatedBarFill pct={pct} color={color} />
                </div>

                <div className="flex items-center justify-between mt-2">
                  <p className="text-[11px] text-muted">
                    {lastTrained ? (
                      <>ฝึกล่าสุด {relativeDayLabel(lastTrained)}</>
                    ) : (
                      'ยังไม่มีประวัติ'
                    )}
                  </p>
                  <p className={`text-[11px] ${status.color}`}>{status.text}</p>
                </div>

                <p className="text-[10px] text-muted mt-1">
                  รอบพักฟื้นโดยประมาณ {RECOVERY_WINDOW_DAYS[mg] ?? 2} วัน
                </p>
                <p className="text-[10px] text-muted">
                  {hoursLeft !== null ? `พร้อมฝึกในอีก ~${hoursLeft} ชม.` : 'พร้อมฝึกได้เลย'}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {!loading && !error && strengthLogs.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-sm tracked uppercase text-muted">Recovery Score ย้อนหลัง</h2>
            <div className="flex rounded-full bg-surface2 p-0.5 text-[11px]">
              {(
                [
                  [30, '30 วัน'],
                  [90, '90 วัน'],
                ] as const
              ).map(([days, label]) => (
                <button
                  key={days}
                  onClick={() => setHistoryRangeDays(days)}
                  className={`px-2.5 py-1 rounded-full tracked uppercase transition ${
                    historyRangeDays === days ? 'bg-steel text-bg' : 'text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-44 bg-surface border border-line shadow-elevated rounded-lg p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={recoveryHistory} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#2E333A" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#9498A0', fontSize: 10 }}
                  interval={historyRangeDays === 90 ? 12 : 4}
                  axisLine={{ stroke: '#2E333A' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#9498A0', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{ background: '#1C1F24', border: '1px solid #2E333A', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#9498A0' }}
                  itemStyle={{ color: '#F3F0E8' }}
                  formatter={(v: number) => [`${v}%`, 'Recovery เฉลี่ยรวม']}
                />
                <Line type="monotone" dataKey="value" stroke="#7A9B57" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-muted mt-2">
            ค่าเฉลี่ยรวมทุกกลุ่มกล้ามเนื้อ คำนวณย้อนหลังจากวันที่ฝึกจริง — เป็นค่าประมาณเช่นเดียวกับตัวเลขด้านบน
          </p>
        </section>
      )}

      <a href="/log" className="block text-center text-xs tracked uppercase text-muted hover:text-amber transition py-2">
        ✚ บันทึกการฝึกวันนี้ →
      </a>
    </div>
  )
}
