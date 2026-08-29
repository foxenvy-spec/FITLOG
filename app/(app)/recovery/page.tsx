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
import { MUSCLE_GROUPS, MUSCLE_GROUP_COLORS, dominantMuscleGroup, type MuscleGroup } from '@/lib/muscle-groups'
import {
  computeRecoveryPct,
  recoveryStatusColor,
  recoveryTier,
  computeRecoveryReadyInHours,
  RECOVERY_WINDOW_DAYS,
  relativeDayLabel,
  suggestMuscleToTrain,
  recoveryRecommendationLabel,
  getScheduledMuscleForDay,
  getNextScheduledMuscle,
  type ScheduledDay,
} from '@/lib/dashboardStats'
import { computeRecoveryHistory } from '@/lib/trends'
import { todayStr } from '@/lib/weekdays'
import Skeleton from '@/components/Skeleton'
import AnimatedBarFill from '@/components/AnimatedBarFill'
import ErrorState from '@/components/ErrorState'
import PremiumCard from '@/components/ui/PremiumCard'
import { withAlpha } from '@/lib/theme'

interface MuscleRow {
  mg: MuscleGroup
  lastTrained: string | null
  pct: number
}


// v49: เดิม hardcode เกณฑ์ของตัวเอง (0-40/41-75/76-100 — คนละรอยต่อกับ recoveryStatusColor ที่เปลี่ยน
// เป็น 4 ระดับแล้ว 0-34/35-64/65-89/90-100) ดึงจาก recoveryTier() แทน ให้ข้อความ+สีตรงกับแท่ง/จุดสีที่
// ใช้ recoveryStatusColor() อยู่แล้วในหน้าเดียวกันจริงๆ (คืนค่า hex ตรงๆ แทน Tailwind class เพราะ
// recoveryTier ใช้โทเคนสีที่ไม่มี Tailwind class คู่กันครบทุกตัว เช่น FIRE_ACCENT)
function statusLabel(pct: number) {
  const tier = recoveryTier(pct)
  return { text: tier.labelTh, color: tier.color }
}

export default function RecoveryPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<MuscleRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [progressPct, setProgressPct] = useState<number | null>(null)
  // กล้ามเนื้อที่ตารางโปรแกรมประจำสัปดาห์ระบุไว้ (ถ้ามี) — ใช้ยึดคำแนะนำให้ตรงตารางแทน recovery % ล้วนๆ
  const [scheduledMuscle, setScheduledMuscle] = useState<string | null>(null)
  // true เมื่อ scheduledMuscle ข้างบนคือของ "วันนี้" จริงๆ (ไม่ใช่ตกกลับไปดูวันถัดไปเพราะวันนี้ทำครบแล้ว/
  // เป็นวันพัก/ตั้งไว้แต่ไม่มีท่าเลย) — ใช้คู่กับการเช็ค recommendation.muscleGroup === scheduledMuscle
  // ตอน render เพื่อไม่ให้ป้าย "วันนี้ควรเล่น" ขึ้นทั้งที่คำแนะนำจริงๆ เป็นของครั้งถัดไป
  const [isTodayScheduled, setIsTodayScheduled] = useState(false)
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

      // ท่าของทุกวันในตาราง — ใช้หากล้ามเนื้อหลักจริงของแต่ละวัน (dominantMuscleGroup) แทนการเดาจาก title
      // ตรงๆ (เดิม getScheduledMuscleForDay ต้องตั้งชื่อวันเป็นชื่อกล้ามเนื้อไทยล้วนๆ เช่น "ขา" ถึงจะจับคู่
      // ได้ ทำให้ผู้ใช้ที่ตั้งชื่อวันแบบบรรยาย เช่น "Day 5 — Lower" ไม่เคยได้ประโยชน์จากตารางเลย — ดู comment
      // เต็มที่ ScheduledDay ใน lib/dashboardStats.ts)
      const { data: allProgramExRows } =
        allProgramDays.length > 0
          ? await supabase
              .from('program_exercises')
              .select('program_day_id, muscle_group')
              .in(
                'program_day_id',
                allProgramDays.map((d) => d.id)
              )
          : { data: [] as { program_day_id: string; muscle_group: string | null }[] }
      const exercisesByDayId: Record<string, { muscle_group: string | null }[]> = {}
      ;((allProgramExRows as { program_day_id: string; muscle_group: string | null }[]) ?? []).forEach((row) => {
        exercisesByDayId[row.program_day_id] = exercisesByDayId[row.program_day_id] ?? []
        exercisesByDayId[row.program_day_id].push(row)
      })
      const scheduledDaysWithMuscle: ScheduledDay[] = allProgramDays.map((d) => ({
        day_of_week: d.day_of_week,
        title: d.title,
        muscleGroup: dominantMuscleGroup(exercisesByDayId[d.id] ?? []),
      }))

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
      const todayScheduledMuscle = getScheduledMuscleForDay(scheduledDaysWithMuscle, dow, MUSCLE_GROUPS)
      const preferToday = !!todayScheduledMuscle && (currentProgressPct === null || currentProgressPct < 100)
      setScheduledMuscle(preferToday ? todayScheduledMuscle : getNextScheduledMuscle(scheduledDaysWithMuscle, dow, MUSCLE_GROUPS))
      setIsTodayScheduled(preferToday)

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
        // suggestMuscleToTrain ตกกลับไปเลือกกล้ามเนื้อ recovery สูงสุดเงียบๆ ถ้า scheduledMuscle ไม่มีข้อมูล
        // recovery — เช็คว่าผลลัพธ์จริงตรงกับ scheduledMuscle ที่มาจากตารางวันนี้เป๊ะๆ ก่อน (เหมือน
        // DashboardView.tsx isRecommendationForToday) กันป้าย "วันนี้ควรเล่น" ผิดพลาดในเคสขอบนี้
        const isRecommendationForToday = isTodayScheduled && recommendation.muscleGroup === scheduledMuscle
        const recColor = recoveryStatusColor(recommendation.pct)
        return (
          <div
            className="flex items-center gap-2.5 rounded-lg px-4 py-3"
            style={{ backgroundColor: withAlpha(recColor, '1A') }}
          >
            <span className="text-lg">💪</span>
            <p className="text-sm text-ink whitespace-pre-line">
              {recoveryRecommendationLabel(progressPct, isRecommendationForToday)}{' '}
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
            // v49 (Design System Phase 3): เดิม rounded-lg (8px) bg-surface border-line เขียนเอง — เปลี่ยน
            // เป็น PremiumCard (24px, token เดียวกับ Dashboard/Profile/AI Coach) ให้ radius สอดคล้องกันเต็มแอป
            <PremiumCard key={mg} className="px-4 py-3.5 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-2.5 w-full rounded-full" />
            </PremiumCard>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ mg, lastTrained, pct }) => {
            const status = statusLabel(pct)
            const color = recoveryStatusColor(pct)
            const hoursLeft = computeRecoveryReadyInHours(lastTrained, mg)
            return (
              <PremiumCard key={mg} className="px-4 py-3.5">
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
                  <p className="text-[11px]" style={{ color: status.color }}>{status.text}</p>
                </div>

                <p className="text-[10px] text-muted mt-1">
                  รอบพักฟื้นโดยประมาณ {RECOVERY_WINDOW_DAYS[mg] ?? 2} วัน
                </p>
                <p className="text-[10px] text-muted">
                  {hoursLeft !== null ? `พร้อมฝึกในอีก ~${hoursLeft} ชม.` : 'พร้อมฝึกได้เลย'}
                </p>
              </PremiumCard>
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
          <PremiumCard className="h-44 p-3">
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
          </PremiumCard>
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
