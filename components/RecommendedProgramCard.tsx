'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { todayStr } from '@/lib/weekdays'
import { parseRangeToNumber, rirToRpe } from '@/lib/importWorkoutExcel'
import { MUSCLE_GROUP_COLORS, VOLUME_MUSCLES, type MuscleGroup } from '@/lib/muscle-groups'
import type { WorkoutTemplate, WorkoutTemplateExercise } from '@/lib/types'
import Skeleton from './Skeleton'

interface RecommendedProgramCardProps {
  // กล้ามเนื้อที่แนะนำให้ฝึกวันนี้ (data.muscleRecommendation?.muscleGroup) — ใช้เลือกว่าเทมเพลต
  // ไหนของผู้ใช้เองที่ตรงกับคำแนะนำวันนี้ที่สุด ถ้าไม่มีคำแนะนำหรือไม่ตรงเลย จะ fallback ไปอันล่าสุด
  recommendedMuscle: string | null
}

async function fetchTemplatesWithExercises(supabase: ReturnType<typeof createClient>) {
  const { data: templates } = await supabase
    .from('workout_templates')
    .select('*')
    .order('created_at', { ascending: false })
  const typedTemplates = (templates as WorkoutTemplate[]) ?? []
  if (typedTemplates.length === 0) return { templates: [], exercisesByTemplate: {} as Record<string, WorkoutTemplateExercise[]> }

  const { data: exRows } = await supabase
    .from('workout_template_exercises')
    .select('*')
    .in(
      'template_id',
      typedTemplates.map((t) => t.id)
    )
    .order('position')

  const grouped: Record<string, WorkoutTemplateExercise[]> = {}
  ;((exRows as WorkoutTemplateExercise[]) ?? []).forEach((ex) => {
    grouped[ex.template_id] = grouped[ex.template_id] ?? []
    grouped[ex.template_id].push(ex)
  })
  return { templates: typedTemplates, exercisesByTemplate: grouped }
}

// การ์ด "แนะนำสำหรับคุณ" — ไม่มีรูปภาพประกอบ/แคลอรี่ประมาณการเหมือนมอคอัพต้นแบบ เพราะ FITLOG
// ไม่มีคลังรูปท่าออกกำลังกายหรือสูตรประเมินแคลอรี่สำหรับเทรนนิ่งเวทจริงๆ (มีแต่ calories_kcal
// ที่กรอกเองตอนบันทึกคาร์ดิโอ) การเดาตัวเลขแคลอรี่ขึ้นมาเองจะไม่ถูกต้อง จึงโชว์เฉพาะข้อมูลที่คำนวณ
// ได้จริงแทน: จำนวนท่า/เซ็ต/เวลาโดยประมาณ (สูตรเดียวกับการ์ด Today's Workout) และกลุ่มกล้ามเนื้อ
export default function RecommendedProgramCard({ recommendedMuscle }: RecommendedProgramCardProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [starting, setStarting] = useState(false)
  const [startedMessage, setStartedMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['recommended-template'],
    queryFn: () => fetchTemplatesWithExercises(supabase),
    staleTime: 60_000,
  })

  if (isLoading || !data) {
    return (
      <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden px-4 py-4">
        <Skeleton className="h-3 w-28 mb-3" />
        <Skeleton className="h-5 w-40 mb-2" />
        <Skeleton className="h-9 w-full" />
      </div>
    )
  }

  const { templates, exercisesByTemplate } = data

  if (templates.length === 0) {
    return (
      <Link
        href="/templates"
        className="flex items-center justify-between gap-3 rounded-lg bg-surface border border-line px-4 py-4 hover:border-amber/40 transition"
      >
        <div>
          <p className="font-display text-xs tracked uppercase text-amber">แนะนำสำหรับคุณ</p>
          <p className="text-xs text-muted mt-1">ยังไม่มีเทมเพลต — สร้างโปรแกรมแรกของคุณที่หน้าเทมเพลต</p>
        </div>
        <span className="text-xs text-amber shrink-0">สร้างเลย →</span>
      </Link>
    )
  }

  // เลือกเทมเพลตที่มีท่าตรงกับกล้ามเนื้อที่แนะนำวันนี้ (ถ้ามี) ไม่งั้นใช้เทมเพลตล่าสุด
  const matched = recommendedMuscle
    ? templates.find((t) => (exercisesByTemplate[t.id] ?? []).some((ex) => ex.muscle_group === recommendedMuscle))
    : undefined
  const chosen = matched ?? templates[0]
  const exercises = exercisesByTemplate[chosen.id] ?? []

  const muscleGroups = Array.from(
    new Set(
      exercises
        .map((ex) => ex.muscle_group)
        .filter((mg): mg is MuscleGroup => !!mg && (VOLUME_MUSCLES as readonly string[]).includes(mg))
    )
  )
  const totalSets = exercises.reduce((sum, ex) => sum + (ex.sets ?? 0), 0)
  const estimatedMinutes = Math.max(10, Math.round((totalSets * 1.5) / 5) * 5)

  async function handleStart() {
    if (exercises.length === 0) return
    setStarting(true)
    setErrorMessage(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setErrorMessage('กรุณาเข้าสู่ระบบใหม่')
        return
      }
      // logic เดียวกับปุ่ม Start ที่หน้า /templates เป๊ะๆ — บันทึกทุกท่าในเทมเพลตเป็น workouts
      // ของวันนี้ทันที แล้ว invalidate query ของ dashboard ให้การ์ด Today's Workout รีเฟรชตาม
      const payload = exercises.map((ex) => ({
        user_id: user.id,
        type: 'strength' as const,
        performed_at: todayStr(),
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group,
        secondary_muscles: ex.secondary_muscles,
        exercise_library_id: ex.exercise_library_id,
        sets: ex.sets,
        reps: parseRangeToNumber(ex.target_reps),
        weight_kg: ex.default_weight_kg,
        rpe: rirToRpe(parseRangeToNumber(ex.target_rir)),
        notes: ex.notes,
      }))
      const { error } = await supabase.from('workouts').insert(payload)
      if (error) {
        setErrorMessage(`เริ่ม "${chosen.title}" ไม่สำเร็จ: ${error.message}`)
        return
      }
      setStartedMessage(`บันทึก "${chosen.title}" (${payload.length} ท่า) เข้า Log วันนี้แล้ว`)
      // ยิงคำสั่งบันทึกครั้งนี้กระทบแทบทุกการ์ดในหน้า dashboard (Today's Workout, Weekly Volume,
      // Recovery, Weekly Goal, heatmap, consistency strip ฯลฯ) ซึ่งแต่ละอันมี query key ของตัวเอง
      // แยกกัน — invalidate เฉพาะ ['dashboard'] เหมือนตอนแรกจะเหลือการ์ดอื่นๆ ค้างข้อมูลเก่าอยู่
      // (กว่าจะรีเฟรชเองต้อง staleTime 60s หมดอายุก่อน) จึง invalidate ทั้งหมดแทนเพื่อความถูกต้อง
      queryClient.invalidateQueries()
    } catch (err) {
      setErrorMessage(`เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden animate-rise">
      <div className="px-4 pt-4 flex items-center justify-between">
        <p className="font-display text-xs tracked uppercase text-amber">แนะนำสำหรับคุณ</p>
        <Link href="/templates" className="text-muted" aria-label="เทมเพลตทั้งหมด">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </Link>
      </div>

      <div className="px-4 pb-4 pt-1.5">
        <p className="font-display text-lg tracked uppercase text-ink leading-tight">{chosen.title}</p>
        {matched && (
          <p className="text-[11px] text-amber mt-1">ตรงกับกล้ามเนื้อที่แนะนำวันนี้ ({recommendedMuscle})</p>
        )}

        <div className="flex items-center gap-4 mt-3">
          <div>
            <p className="font-mono text-base text-ink leading-none">{exercises.length}</p>
            <p className="text-[10px] text-muted mt-0.5">ท่า</p>
          </div>
          <div>
            <p className="font-mono text-base text-ink leading-none">{totalSets}</p>
            <p className="text-[10px] text-muted mt-0.5">เซ็ต</p>
          </div>
          <div>
            <p className="font-mono text-base text-ink leading-none">~{estimatedMinutes}</p>
            <p className="text-[10px] text-muted mt-0.5">นาที</p>
          </div>
        </div>

        {muscleGroups.length > 0 && (
          <div className="flex items-center gap-3 mt-3">
            {muscleGroups.slice(0, 5).map((mg) => (
              <div key={mg} className="flex flex-col items-center gap-1">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${MUSCLE_GROUP_COLORS[mg]}22`, border: `1px solid ${MUSCLE_GROUP_COLORS[mg]}55` }}
                  aria-hidden="true"
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MUSCLE_GROUP_COLORS[mg] }} />
                </span>
                <span className="text-[9px] text-muted">{mg}</span>
              </div>
            ))}
          </div>
        )}

        {errorMessage && <p className="text-[11px] text-rusttext mt-3">{errorMessage}</p>}

        {startedMessage ? (
          <p className="text-xs text-moss mt-4 flex items-center gap-1.5">✓ {startedMessage}</p>
        ) : (
          <button
            type="button"
            onClick={handleStart}
            disabled={starting || exercises.length === 0}
            className="inline-flex items-center gap-1.5 mt-4 text-sm font-display tracked uppercase text-bg bg-amber rounded-full px-5 py-2.5 active:scale-[0.99] transition disabled:opacity-50 w-full justify-center"
          >
            {starting ? '...' : 'เริ่มโปรแกรม'} <span aria-hidden="true">▶</span>
          </button>
        )}
      </div>
    </div>
  )
}
