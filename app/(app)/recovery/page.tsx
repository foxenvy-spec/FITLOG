'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  getWeekRange,
  type ScheduledDay,
} from '@/lib/dashboardStats'
import { computeRecoveryHistory } from '@/lib/trends'
import { todayStr } from '@/lib/weekdays'
import { fetchWeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
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
  // เซ็ตที่ทำไปแล้วสัปดาห์นี้ + เป้าหมายเซ็ต/สัปดาห์ ต่อกลุ่มกล้ามเนื้อ — ฟีดแบ็ก "Legs ฟื้นตัวแล้ว ≠ Legs
  // ควรฝึก" เดิมหน้านี้แนะนำตามตารางเงียบๆ ไม่เคยเช็ค Weekly Volume เลย (เหมือนที่ Dashboard เคยเป็นก่อน
  // แก้ — ดู suggestMuscleToTrain ใน lib/dashboardStats.ts) ทำให้ Dashboard กับหน้านี้แนะนำขัดกันได้
  const [thisWeekSets, setThisWeekSets] = useState<Record<string, number>>({})
  const [weeklyVolumeTargets, setWeeklyVolumeTargets] = useState<Record<string, number>>({})

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
      // ใช้เช็คว่ากลุ่มกล้ามเนื้อของวันนี้ถูกล็อกเซ็ตจริงไปแล้วหรือยัง (ดู comment เต็มที่จุดใช้ preferToday
      // ด้านล่าง — บั๊กเดียวกับที่แก้ใน DashboardView.tsx/coach/page.tsx)
      const todayMuscleGroups = new Set(
        strengthRows.filter((r) => r.performed_at?.slice(0, 10) === today && r.muscle_group).map((r) => r.muscle_group as string)
      )

      // เซ็ตที่ทำไปแล้วสัปดาห์นี้ + เป้าหมายเซ็ต/สัปดาห์ ต่อกลุ่มกล้ามเนื้อ (ตรรกะเดียวกับ DashboardView.tsx)
      // — ให้ suggestMuscleToTrain ด้านล่างเช็ค Weekly Volume ก่อนแนะนำตามตาราง ไม่ใช่ยึดตารางเงียบๆ อีกต่อไป
      const { start: thisWeekStart, end: thisWeekEnd } = getWeekRange()
      const [{ data: thisWeekRows }, targets] = await Promise.all([
        supabase
          .from('workouts')
          .select('muscle_group, sets, performed_at')
          .eq('type', 'strength')
          .gte('performed_at', thisWeekStart)
          .lte('performed_at', thisWeekEnd),
        fetchWeeklyVolumeTargets(supabase),
      ])
      const weekSets: Record<string, number> = {}
      ;((thisWeekRows as { muscle_group: string | null; sets: number | null; performed_at: string }[]) ?? []).forEach((r) => {
        if (!r.muscle_group) return
        weekSets[r.muscle_group] = (weekSets[r.muscle_group] ?? 0) + (r.sets ?? 0)
      })
      setThisWeekSets(weekSets)
      setWeeklyVolumeTargets(targets)

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
      // บั๊ก (ฟีดแบ็ก "MINT Coach บอกเล่นอกครั้งหน้า ทั้งที่เพิ่งเล่นอกไปและฟื้นตัว 0% แล้ว") — currentProgressPct
      // ตั้งใจนับเฉพาะท่าที่ติ๊กครบตามแผน (program_completions) ไม่นับงานนอกแผน แต่ถ้ากล้ามเนื้อนี้ถูกล็อก
      // เซ็ตจริงวันนี้ไปแล้ว (recovery ร่วงแล้ว) ก็ไม่ควรแนะนำซ้ำว่า "วันนี้" อีก แม้ยังติ๊กไม่ครบทุกท่าตามแผน
      // (ดู comment เต็มที่ DashboardView.tsx จุดเดียวกัน)
      const preferToday =
        !!todayScheduledMuscle && !todayMuscleGroups.has(todayScheduledMuscle) && (currentProgressPct === null || currentProgressPct < 100)
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

  // ฟีดแบ็ก (design review) "หน้า Recovery ต้องเลื่อน 3 สกรีน ลองทำ 1 หน้าจอได้ไหม" — เหตุผล/วิธีเดียวกับที่
  // ทำใน Dashboard: carousel ปัด/ลากได้จริง (scroll-snap ธรรมดา, เทคนิคเดียวกับ InsightCarousel.tsx) แบ่ง
  // เป็นหน้า 1 = สิ่งที่ต้อง action วันนี้ (banner แนะนำ + การ์ดกล้ามเนื้อ 9 ใบ + ปุ่มบันทึกการฝึก) กับ
  // หน้า 2 = ข้อมูลวิเคราะห์/ย้อนหลัง (กราฟ Recovery Score History) — ต่างจาก Dashboard ตรงที่หน้านี้เป็น
  // single-column ธรรมดา (space-y-5 ล้วน ไม่มี 12-col grid/row-start ให้ต้องระวัง) จึงครอบทั้งหน้าเป็น
  // carousel ได้ตรงๆ โดยไม่มีความเสี่ยงแบบที่ Dashboard มี
  const trackRef = useRef<HTMLDivElement>(null)
  const [pageIndex, setPageIndex] = useState(0)
  function scrollToPage(index: number) {
    const el = trackRef.current
    if (!el) return
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
  }
  function handleTrackScroll() {
    const el = trackRef.current
    if (!el || el.clientWidth === 0) return
    const index = Math.round(el.scrollLeft / el.clientWidth)
    setPageIndex(Math.max(0, Math.min(1, index)))
  }

  return (
    <>
    <div className="flex justify-center pb-3">
      <div className="inline-flex items-center gap-1 rounded-full border border-line p-1">
        <button
          type="button"
          onClick={() => scrollToPage(0)}
          aria-pressed={pageIndex === 0}
          className={`text-[12px] font-display tracked uppercase rounded-full px-4 py-1.5 transition ${pageIndex === 0 ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'}`}
        >
          1 · ภาพรวม
        </button>
        <button
          type="button"
          onClick={() => scrollToPage(1)}
          aria-pressed={pageIndex === 1}
          className={`text-[12px] font-display tracked uppercase rounded-full px-4 py-1.5 transition ${pageIndex === 1 ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'}`}
        >
          2 · รายละเอียด
        </button>
      </div>
    </div>
    <div
      ref={trackRef}
      onScroll={handleTrackScroll}
      className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar items-start"
      style={{ scrollBehavior: 'smooth' }}
    >
    <div className="shrink-0 w-full snap-center">
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
        const recommendation = suggestMuscleToTrain(recoveryPctMap, scheduledMuscle, thisWeekSets, weeklyVolumeTargets)
        if (!recommendation) return null
        // suggestMuscleToTrain ตกกลับไปเลือกกล้ามเนื้อ recovery สูงสุดเงียบๆ ถ้า scheduledMuscle ไม่มีข้อมูล
        // recovery — เช็คว่าผลลัพธ์จริงตรงกับ scheduledMuscle ที่มาจากตารางวันนี้เป๊ะๆ ก่อน (เหมือน
        // DashboardView.tsx isRecommendationForToday) กันป้าย "วันนี้ควรเล่น" ผิดพลาดในเคสขอบนี้ —
        // scheduleOverriddenFrom ก็ยังนับว่า "เรื่องของวันนี้" เหมือนกัน (ดู comment เต็มที่ DashboardView.tsx)
        const isRecommendationForToday =
          isTodayScheduled && (recommendation.muscleGroup === scheduledMuscle || recommendation.scheduleOverriddenFrom === scheduledMuscle)
        const recColor = recoveryStatusColor(recommendation.pct)
        return (
          <div
            className="flex items-center gap-2.5 rounded-lg px-4 py-3"
            style={{ backgroundColor: withAlpha(recColor, '1A') }}
          >
            <span className="text-lg">💪</span>
            <div className="min-w-0">
              <p className="text-sm text-ink whitespace-pre-line">
                {recoveryRecommendationLabel(progressPct, isRecommendationForToday)}{' '}
                <span className="font-display tracked uppercase" style={{ color: recColor }}>
                  {recommendation.muscleGroup}
                </span>{' '}
                <span className="text-muted">— ฟื้นตัวแล้ว {recommendation.pct}%</span>
              </p>
              {/* ฟีดแบ็ก "Legs ฟื้นตัวแล้ว ≠ Legs ควรฝึก" — บอกเหตุผลตรงๆ เหมือนที่ Dashboard ทำ แทนที่จะ
                  แนะนำเงียบๆ โดยไม่อธิบายว่าทำไมไม่ตรงตาราง
                  ฟีดแบ็ก (จากรอบตรวจ Dashboard, "Terminology") "Volume ทั้งที่ metric จริงคือจำนวนเซ็ต ควรใช้
                  ภาษาที่ user ไม่ต้องรู้ศัพท์ระบบ" — ปรับข้อความให้ตรงหลักเดียวกับที่แก้ไปแล้วบน Dashboard
                  (thisWeekSets/weeklyVolumeTargets ด้านบนวัดเป็น "เซ็ต" ทั้งระบบ ไม่ใช่ kg-volume จริง) —
                  ตัดคำว่า "Volume" ออก (จุดเดียวกันนี้ยังมีซ้ำใน lib/aiCoach.ts + app/(app)/coach/page.tsx
                  ที่ยังไม่ได้แก้ เพราะยังไม่ถึงรอบตรวจหน้า Coach) */}
              {recommendation.scheduleOverriddenFrom && (
                <p className="text-[12px] text-muted mt-0.5">
                  ตามตารางคือ{recommendation.scheduleOverriddenFrom} แต่ฝึกเกินเป้าหมายสัปดาห์นี้แล้ว
                </p>
              )}
              {recommendation.lowRecoveryCaution && (
                <p className="text-[12px] mt-0.5" style={{ color: recColor }}>
                  ⚠️ ฟื้นตัวยังไม่เต็มที่ แนะนำลดความหนักหรือเลื่อนออกไปก่อน
                </p>
              )}
            </div>
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
                  <span className="text-[12px] font-mono shrink-0" style={{ color }}>
                    {pct}%
                  </span>
                </div>

                <div className="h-2.5 rounded-full bg-surface2 overflow-hidden">
                  <AnimatedBarFill pct={pct} color={color} />
                </div>

                {/* ฟีดแบ็ก (จากรอบตรวจ Dashboard, "Typography") "ไม่ลดต่ำกว่า 12px สำหรับข้อความรอง" — หน้านี้
                    เขียนก่อนกฎนี้ถูกยึดเป็นมาตรฐาน (11px/10px ทุกบรรทัดด้านล่าง) ปรับให้ตรงมาตรฐานเดียวกับ
                    Dashboard/การ์ดอื่นทั่วแอปตอนนี้ — ไม่กระทบ tick ของกราฟ Recovery Score ด้านล่าง (fontSize:
                    10 ใน recharts) เพราะ tick กราฟเป็นธรรมเนียมแยกต่างหากที่ใช้ 9-11px ตรงกันทั้งแอป (stats/
                    health/exercises ก็ใช้ค่านี้เหมือนกัน ไม่ใช่ข้อความรองที่กฎ 12px ตั้งใจครอบคลุม) */}
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[12px] text-muted">
                    {lastTrained ? (
                      <>ฝึกล่าสุด {relativeDayLabel(lastTrained)}</>
                    ) : (
                      'ยังไม่มีประวัติ'
                    )}
                  </p>
                  <p className="text-[12px]" style={{ color: status.color }}>{status.text}</p>
                </div>

                <p className="text-[12px] text-muted mt-1">
                  รอบพักฟื้นโดยประมาณ {RECOVERY_WINDOW_DAYS[mg] ?? 2} วัน
                </p>
                <p className="text-[12px] text-muted">
                  {hoursLeft !== null ? `พร้อมฝึกในอีก ~${hoursLeft} ชม.` : 'พร้อมฝึกได้เลย'}
                </p>
              </PremiumCard>
            )
          })}
        </div>
      )}

      <a href="/log" className="block text-center text-xs tracked uppercase text-muted hover:text-amber transition py-2">
        ✚ บันทึกการฝึกวันนี้ →
      </a>
    </div>
    </div>
    {/* end page 1 (สิ่งที่ต้อง action วันนี้) */}

    <div className="shrink-0 w-full snap-center">
    <div className="space-y-5">
      {!loading && !error && strengthLogs.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-sm tracked uppercase text-muted">Recovery Score ย้อนหลัง</h2>
            <div className="flex rounded-full bg-surface2 p-0.5 text-[12px]">
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
          <p className="text-[12px] text-muted mt-2">
            ค่าเฉลี่ยรวมทุกกลุ่มกล้ามเนื้อ คำนวณย้อนหลังจากวันที่ฝึกจริง — เป็นค่าประมาณเช่นเดียวกับตัวเลขด้านบน
          </p>
        </section>
      )}
    </div>
    </div>
    {/* end page 2 (ข้อมูลวิเคราะห์/ย้อนหลัง) */}
    </div>
    {/* end carousel track */}
    </>
  )
}
