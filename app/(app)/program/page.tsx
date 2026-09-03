'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ProgramDay, ProgramExercise, WorkoutTemplate, WorkoutTemplateExercise } from '@/lib/types'
import { MUSCLE_GROUPS, type MuscleGroup } from '@/lib/muscle-groups'
import ExercisePicker from '@/components/ExercisePicker'
import type { ExerciseDef } from '@/lib/exercises'
import { WEEKDAYS, WEEKDAYS_SHORT, todayDayOfWeek, todayStr } from '@/lib/weekdays'
import { parseRangeToNumber, rirToRpe } from '@/lib/importWorkoutExcel'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { getErrorMessage } from '@/lib/errors'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'
import PremiumCard from '@/components/ui/PremiumCard'
import Button from '@/components/ui/Button'
import { CARD_BORDER_CSS } from '@/lib/theme'

export default function ProgramPage() {
  const supabase = createClient()

  const [selectedDow, setSelectedDow] = useState<number>(todayDayOfWeek())
  const [days, setDays] = useState<ProgramDay[]>([])
  const [exercisesByDay, setExercisesByDay] = useState<Record<string, ProgramExercise[]>>({})
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logging, setLogging] = useState(false)
  const [logMessage, setLogMessage] = useState<string | null>(null)
  // ฟีดแบ็ก (design review) "'บันทึกเข้า Log วันนี้ทั้งหมด' กดซ้ำ/กดตอนวันนี้ล็อกไปแล้วบางส่วน ต้องไม่กลาย
  // เป็น log ซ้ำ (6+6=12 ท่า) แบบเงียบๆ" — ตรวจโค้ดแล้วยืนยันว่าเป็นช่องโหว่จริง (handleLogAllToday เดิม
  // insert() ตรงๆ ไม่เช็คว่าวันนี้มี log อยู่แล้วหรือยัง) — เพิ่มการเช็คก่อน insert จริง ถ้าพบว่าวันนี้มี
  // 'workouts' ประเภท strength อยู่แล้ว (ไม่ว่าจะ log ผ่านช่องทางไหน) ให้หยุดแล้วโชว์แถบยืนยันก่อน (รูปแบบ
  // เดียวกับแถบยืนยันลบทั้งหมด/ลบวันนี้/ลบที่เลือกที่มีอยู่แล้วในไฟล์นี้ ไม่ใช่ window.confirm แบบหน้า
  // Calendar เพื่อความสม่ำเสมอภายในไฟล์เดียวกัน) กดยืนยันแล้วค่อย insert จริง — ไม่มี log วันนี้เลยไม่ต้อง
  // ถามอะไร ทำต่อทันทีเหมือนเดิม
  const [confirmLogDuplicate, setConfirmLogDuplicate] = useState(false)
  const [checkingLogDuplicate, setCheckingLogDuplicate] = useState(false)
  const [addingExercise, setAddingExercise] = useState(false)
  // เลือกจากเทมเพลต — โหลดแบบ lazy (แค่ตอนกดเปิด picker ครั้งแรก) กันไม่ต้อง query ตารางเทมเพลตทุกครั้ง
  // ที่เข้าหน้านี้ทั้งที่ผู้ใช้ส่วนใหญ่อาจไม่ได้ใช้ปุ่มนี้เลย
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [templates, setTemplates] = useState<WorkoutTemplate[] | null>(null)
  const [templateExercises, setTemplateExercises] = useState<Record<string, WorkoutTemplateExercise[]>>({})
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  // บั๊ก (พบจากฟีดแบ็กผู้ใช้จริง — Dashboard โชว์ "1/5 ครั้ง" ทั้งที่ตั้งตารางไว้แค่ 3 วัน): เดิมหน้านี้มี
  // "ลบทั้งหมด" ที่ลบแค่ program_exercises ของวันนั้น (handleDeleteAll ด้านล่าง) แต่ไม่มีทางลบตัวแถว
  // program_days เองเลยทั้งไฟล์ (ตรวจแล้ว ไม่มี .delete() บน program_days ที่ไหนในโปรเจกต์เลย) — วันที่เคย
  // ตั้งไว้แล้วลบท่าออกจนหมด ยัง "นับเป็นวันฝึกตามตาราง" ต่อไปตลอดกาล (workoutWeekdays ใน DashboardView.tsx/
  // ConsistencyStrip.tsx ฯลฯ อ่านจาก "มีแถว program_days" ล้วนๆ ไม่ได้เช็คว่ามีท่าอยู่จริงไหม) ทำให้
  // weeklyWorkoutGoal/Consistency/Streak นับวันที่ผู้ใช้เลิกฝึกไปแล้วรวมด้วย — เพิ่มปุ่มลบวันทั้งวันจริงๆ
  // (ลบแถว program_days เอง — program_exercises ใต้วันนั้น cascade ลบตามอัตโนมัติผ่าน FK on delete cascade
  // อยู่แล้ว ไม่ต้องลบมือ, RLS policy "Users can delete their own program days" มีอยู่แล้วในสคีมา แค่ไม่มี
  // โค้ดฝั่งแอปเรียกใช้เท่านั้น)
  const [confirmRemoveDay, setConfirmRemoveDay] = useState(false)
  const [removingDay, setRemovingDay] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data: dayRows, error: dayErr } = await supabase
      .from('program_days')
      .select('*')
      .order('day_of_week')

    if (dayErr) {
      setLoadError(dayErr.message)
      setLoading(false)
      return
    }

    const typedDays = (dayRows as ProgramDay[]) ?? []
    setDays(typedDays)

    if (typedDays.length > 0) {
      const { data: exRows, error: exErr } = await supabase
        .from('program_exercises')
        .select('*')
        .in(
          'program_day_id',
          typedDays.map((d) => d.id)
        )
        .order('position')

      if (exErr) {
        setLoadError(exErr.message)
        setLoading(false)
        return
      }

      const grouped: Record<string, ProgramExercise[]> = {}
      ;(exRows as ProgramExercise[]).forEach((ex) => {
        grouped[ex.program_day_id] = grouped[ex.program_day_id] ?? []
        grouped[ex.program_day_id].push(ex)
      })
      setExercisesByDay(grouped)
    } else {
      setExercisesByDay({})
    }

    const { data: completions } = await supabase
      .from('program_completions')
      .select('program_exercise_id')
      .eq('completed_at', todayStr())

    setCompletedIds(new Set((completions ?? []).map((c: { program_exercise_id: string }) => c.program_exercise_id)))

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const currentDay = days.find((d) => d.day_of_week === selectedDow) ?? null
  const currentExercises = currentDay ? exercisesByDay[currentDay.id] ?? [] : []

  // สลับวันแล้วเคลียร์โหมดเลือก/ยืนยันลบทิ้ง กันเลือกท่าของวันเดิมค้างอยู่ตอนสลับไปดูวันอื่น
  useEffect(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
    setConfirmBulkDelete(false)
    setConfirmDeleteAll(false)
    setConfirmRemoveDay(false)
  }, [selectedDow])

  async function toggleComplete(exerciseId: string, done: boolean) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    if (done) {
      setCompletedIds((prev) => new Set(prev).add(exerciseId))
      const { error: err } = await supabase
        .from('program_completions')
        .upsert(
          { user_id: user.id, program_exercise_id: exerciseId, completed_at: todayStr() },
          { onConflict: 'user_id,program_exercise_id,completed_at' }
        )
      if (err) setError(err.message)
    } else {
      setCompletedIds((prev) => {
        const next = new Set(prev)
        next.delete(exerciseId)
        return next
      })
      const { error: err } = await supabase
        .from('program_completions')
        .delete()
        .eq('program_exercise_id', exerciseId)
        .eq('completed_at', todayStr())
      if (err) setError(err.message)
    }
  }

  // เช็คก่อนว่าวันนี้มี log (ประเภท strength) อยู่แล้วหรือยัง (ไม่ว่าจะ log ผ่านช่องทางไหนมาก่อนก็ตาม —
  // /log, /session, หรือกดปุ่มนี้มาก่อนแล้ว) ถ้ามี ให้หยุดแล้วโชว์แถบยืนยันก่อน กันกดซ้ำแล้ว log ซ้อนทับ
  // เงียบๆ (ดู comment ที่ confirmLogDuplicate state ด้านบน)
  async function handleLogAllTodayClick() {
    if (!currentDay || currentExercises.length === 0) return
    setCheckingLogDuplicate(true)
    setError(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('กรุณาเข้าสู่ระบบใหม่')
        return
      }
      const { data: existing, error: checkErr } = await supabase
        .from('workouts')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', 'strength')
        .eq('performed_at', todayStr())
        .limit(1)
      if (checkErr) {
        setError(`ตรวจสอบ Log วันนี้ไม่สำเร็จ: ${checkErr.message}`)
        return
      }
      if (existing && existing.length > 0) {
        setConfirmLogDuplicate(true)
        return
      }
      await handleLogAllToday()
    } catch (err) {
      setError(`เกิดข้อผิดพลาด: ${getErrorMessage(err)}`)
    } finally {
      setCheckingLogDuplicate(false)
    }
  }

  async function handleLogAllToday() {
    if (!currentDay || currentExercises.length === 0) return
    setConfirmLogDuplicate(false)
    setLogging(true)
    setLogMessage(null)
    setError(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('กรุณาเข้าสู่ระบบใหม่')
        return
      }

      const payload = currentExercises.map((ex) => ({
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
        notes: ex.rationale,
      }))

      const { error: wErr } = await supabase.from('workouts').insert(payload)
      if (wErr) {
        setError(`บันทึกเข้า Log ไม่สำเร็จ: ${wErr.message}`)
        return
      }

      const completionPayload = currentExercises.map((ex) => ({
        user_id: user.id,
        program_exercise_id: ex.id,
        completed_at: todayStr(),
      }))
      // บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจครอบใหม่): error ของ upsert นี้เดิมไม่ถูกเช็คเลย ต่างจาก insert ของ
      // workouts ด้านบนที่เช็ค error แล้ว return ทันที — ถ้า upsert นี้พัง (constraint/RLS/เน็ตหลุด) UI จะ
      // ยัง mark ว่าทำครบ 100% (setCompletedIds) และโชว์ข้อความสำเร็จ ทั้งที่ completions จริงไม่ถูกบันทึก
      // (จะ revert เงียบๆ ตอนโหลดหน้าใหม่ครั้งถัดไป โดยไม่มี error ให้เห็นเลย)
      const { error: cErr } = await supabase
        .from('program_completions')
        .upsert(completionPayload, { onConflict: 'user_id,program_exercise_id,completed_at' })
      if (cErr) {
        setError(`บันทึกความคืบหน้าไม่สำเร็จ: ${cErr.message}`)
        return
      }

      setCompletedIds(new Set(currentExercises.map((ex) => ex.id)))
      setLogMessage(`บันทึก ${payload.length} ท่าเข้า Log ของวันนี้แล้ว`)
    } catch (err) {
      setError(`เกิดข้อผิดพลาด: ${getErrorMessage(err)}`)
    } finally {
      setLogging(false)
    }
  }

  async function ensureDayExists(dow: number, title?: string): Promise<ProgramDay | null> {
    const existing = days.find((d) => d.day_of_week === dow)
    if (existing) return existing

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error: err } = await supabase
      .from('program_days')
      .upsert({ user_id: user.id, day_of_week: dow, title: title || `วัน${WEEKDAYS[dow]}` }, { onConflict: 'user_id,day_of_week' })
      .select('*')
      .single()

    if (err || !data) {
      setError(err?.message ?? 'สร้างวันไม่สำเร็จ')
      return null
    }

    setDays((prev) => [...prev, data as ProgramDay].sort((a, b) => a.day_of_week - b.day_of_week))
    return data as ProgramDay
  }

  // ฟีดแบ็ก "หน้านี้ควรเลือกโปรแกรมจากเทมเพลตมาได้ไหม" — เดิมมีแค่ลิงก์ "📋 เทมเพลต" ที่หัวหน้า (พาไปหน้า
  // /templates แยกต่างหาก ต้องเข้าไปดูเอง) กับปุ่ม "นำเข้าจาก Excel"/"+ เพิ่มท่าเอง" ใน empty state — เพิ่ม
  // ทางลัดที่ 3 ให้เลือกเทมเพลตที่มีอยู่แล้วมาใส่ในวันที่กำลังดูได้ทันทีจากหน้านี้เลย ไม่ต้องสลับหน้า
  async function loadTemplatesIfNeeded() {
    if (templates !== null) return // โหลดไปแล้วรอบก่อน ใช้ cache ใน state ต่อ
    setTemplatesLoading(true)
    setTemplatesError(null)

    const { data: tRows, error: tErr } = await supabase
      .from('workout_templates')
      .select('*')
      .order('created_at', { ascending: false })

    if (tErr) {
      setTemplatesError(tErr.message)
      setTemplatesLoading(false)
      return
    }

    const typedTemplates = (tRows as WorkoutTemplate[]) ?? []

    if (typedTemplates.length > 0) {
      const { data: exRows, error: exErr } = await supabase
        .from('workout_template_exercises')
        .select('*')
        .in(
          'template_id',
          typedTemplates.map((t) => t.id)
        )
        .order('position')

      if (exErr) {
        setTemplatesError(exErr.message)
        setTemplatesLoading(false)
        return
      }

      const grouped: Record<string, WorkoutTemplateExercise[]> = {}
      ;(exRows as WorkoutTemplateExercise[]).forEach((ex) => {
        grouped[ex.template_id] = grouped[ex.template_id] ?? []
        grouped[ex.template_id].push(ex)
      })
      setTemplateExercises(grouped)
    }

    setTemplates(typedTemplates)
    setTemplatesLoading(false)
  }

  function openTemplatePicker() {
    setShowTemplatePicker(true)
    loadTemplatesIfNeeded()
  }

  // ก็อปท่าจาก workout_template_exercises ไปเป็น program_exercises ของวันที่กำลังดูอยู่ — สคีมาสองตาราง
  // นี้ตรงกันเกือบทุกฟิลด์อยู่แล้ว (ตั้งใจออกแบบให้ตรงกัน ดู lib/types.ts) ต่างแค่ ProgramExercise มี
  // `rationale` เพิ่มมา (เทมเพลตไม่มีแนวคิดนี้ ปล่อย null) — ตั้งชื่อวันตามชื่อเทมเพลตให้เลย (วันนี้ยังไม่มี
  // โปรแกรมอยู่แล้ว ปุ่มนี้โชว์เฉพาะตอน empty state จึงไม่มีชื่อเดิมของผู้ใช้ที่จะเขียนทับ)
  async function handleApplyTemplate(template: WorkoutTemplate) {
    setApplyingTemplateId(template.id)
    setError(null)

    const day = await ensureDayExists(selectedDow, template.title)
    if (!day) {
      setApplyingTemplateId(null)
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setApplyingTemplateId(null)
      return
    }

    const sourceExercises = templateExercises[template.id] ?? []
    const payload = sourceExercises.map((ex) => ({
      program_day_id: day.id,
      user_id: user.id,
      position: ex.position,
      exercise_name: ex.exercise_name,
      muscle_group: ex.muscle_group,
      secondary_muscles: ex.secondary_muscles,
      exercise_library_id: ex.exercise_library_id,
      sets: ex.sets,
      target_reps: ex.target_reps,
      target_rir: ex.target_rir,
      rest: ex.rest,
      default_weight_kg: ex.default_weight_kg,
      notes: ex.notes,
    }))

    if (payload.length > 0) {
      const { data, error: err } = await supabase.from('program_exercises').insert(payload).select('*')
      if (err) {
        setError(`นำเข้าจากเทมเพลตไม่สำเร็จ: ${err.message}`)
        setApplyingTemplateId(null)
        return
      }
      setExercisesByDay((prev) => ({
        ...prev,
        [day.id]: [...(prev[day.id] ?? []), ...((data as ProgramExercise[]) ?? [])],
      }))
    }

    setApplyingTemplateId(null)
    setShowTemplatePicker(false)
  }

  async function handleAddExercise(fields: {
    name: string
    sets: string
    reps: string
    rir: string
    rest: string
    muscleGroup: MuscleGroup
    secondaryMuscles: string[]
    exerciseLibraryId: string | null
  }) {
    const day = await ensureDayExists(selectedDow)
    if (!day) return

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const position = (exercisesByDay[day.id] ?? []).length

    const { data, error: err } = await supabase
      .from('program_exercises')
      .insert({
        program_day_id: day.id,
        user_id: user.id,
        position,
        exercise_name: fields.name,
        muscle_group: fields.muscleGroup,
        secondary_muscles: fields.secondaryMuscles,
        exercise_library_id: fields.exerciseLibraryId,
        sets: fields.sets ? Number(fields.sets) : null,
        target_reps: fields.reps || null,
        target_rir: fields.rir || null,
        rest: fields.rest || null,
      })
      .select('*')
      .single()

    if (err) {
      setError(err.message)
      return
    }

    setExercisesByDay((prev) => ({
      ...prev,
      [day.id]: [...(prev[day.id] ?? []), data as ProgramExercise],
    }))
    setAddingExercise(false)
  }

  async function handleUpdateExercise(ex: ProgramExercise, patch: Partial<ProgramExercise>) {
    setExercisesByDay((prev) => ({
      ...prev,
      [ex.program_day_id]: (prev[ex.program_day_id] ?? []).map((e) => (e.id === ex.id ? { ...e, ...patch } : e)),
    }))
    const { error: err } = await supabase.from('program_exercises').update(patch).eq('id', ex.id)
    if (err) setError(err.message)
  }

  async function handleDeleteExercise(ex: ProgramExercise) {
    setExercisesByDay((prev) => ({
      ...prev,
      [ex.program_day_id]: (prev[ex.program_day_id] ?? []).filter((e) => e.id !== ex.id),
    }))
    const { error: err } = await supabase.from('program_exercises').delete().eq('id', ex.id)
    if (err) setError(err.message)
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
    setConfirmBulkDelete(false)
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkDelete() {
    if (!currentDay || selectedIds.size === 0) return
    setBulkDeleting(true)
    setError(null)
    const ids = Array.from(selectedIds)
    const { error: err } = await supabase.from('program_exercises').delete().in('id', ids)
    setBulkDeleting(false)
    if (err) {
      setError(`ลบท่าที่เลือกไม่สำเร็จ: ${err.message}`)
      return
    }
    setExercisesByDay((prev) => ({
      ...prev,
      [currentDay.id]: (prev[currentDay.id] ?? []).filter((e) => !selectedIds.has(e.id)),
    }))
    exitSelectMode()
  }

  async function handleDeleteAll() {
    if (!currentDay || currentExercises.length === 0) return
    setBulkDeleting(true)
    setError(null)
    const { error: err } = await supabase.from('program_exercises').delete().eq('program_day_id', currentDay.id)
    setBulkDeleting(false)
    if (err) {
      setError(`ลบท่าทั้งหมดไม่สำเร็จ: ${err.message}`)
      return
    }
    setExercisesByDay((prev) => ({ ...prev, [currentDay.id]: [] }))
    setConfirmDeleteAll(false)
    exitSelectMode()
  }

  async function handleRenameDay(day: ProgramDay, title: string) {
    setDays((prev) => prev.map((d) => (d.id === day.id ? { ...d, title } : d)))
    const { error: err } = await supabase.from('program_days').update({ title }).eq('id', day.id)
    if (err) setError(err.message)
  }

  // ลบวันนี้ออกจากตารางฝึกทั้งวัน (ต่างจาก handleDeleteAll ด้านบนที่ลบแค่ท่าในวัน แต่ตัวแถว program_days
  // ยังอยู่ ทำให้วันนี้ยังนับเป็น "วันฝึกตามตาราง" ต่อไปในหน้า Dashboard/Consistency/Streak) — ดู comment
  // ที่ confirmRemoveDay ด้านบนไฟล์
  async function handleRemoveDay() {
    if (!currentDay) return
    setRemovingDay(true)
    setError(null)
    const { error: err } = await supabase.from('program_days').delete().eq('id', currentDay.id)
    setRemovingDay(false)
    if (err) {
      setError(`ลบวัน${WEEKDAYS[currentDay.day_of_week]}ไม่สำเร็จ: ${err.message}`)
      return
    }
    const removedId = currentDay.id
    setDays((prev) => prev.filter((d) => d.id !== removedId))
    setExercisesByDay((prev) => {
      const next = { ...prev }
      delete next[removedId]
      return next
    })
    setConfirmRemoveDay(false)
  }

  const isToday = selectedDow === todayDayOfWeek()

  if (loading) return <LoadingState />
  if (loadError) return <ErrorState title="โหลดโปรแกรมไม่สำเร็จ" message={loadError} onRetry={load} />

  return (
    <div className="space-y-5 lg:max-w-3xl lg:mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl tracked uppercase">โปรแกรม</h1>
          <p className="text-sm text-muted mt-1">แผนออกกำลังกายประจำสัปดาห์ของคุณ</p>
        </div>
        <div className="flex gap-3 shrink-0">
          <a href="/templates" className="text-xs font-display tracked uppercase text-muted hover:text-amber transition">
            📋 เทมเพลต
          </a>
          <a href="/import" className="text-xs font-display tracked uppercase text-muted hover:text-amber transition">
            📥 นำเข้า
          </a>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS_SHORT.map((label, dow) => {
          const hasProgram = days.some((d) => d.day_of_week === dow)
          const selected = selectedDow === dow
          const real = dow === todayDayOfWeek()
          return (
            <button
              key={dow}
              onClick={() => setSelectedDow(dow)}
              className={`relative rounded-lg py-2.5 text-xs font-display tracked uppercase transition ${
                selected ? 'bg-amber text-bg' : 'bg-surface text-muted border border-line'
              }`}
            >
              {label}
              {real && <span className={`absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full ${selected ? 'bg-bg' : 'bg-amber'}`} />}
              {hasProgram && !selected && <span className="block w-1 h-1 rounded-full bg-steel mx-auto mt-1" />}
            </button>
          )
        })}
      </div>

      {!isToday && (
        <p className="text-[12px] text-muted bg-surface2 rounded-lg px-3 py-2">
          กำลังดูแผนของวัน{WEEKDAYS[selectedDow]} — ถ้ากด &quot;บันทึกเข้า Log&quot; จะถูกบันทึกลงวันที่จริงคือวันนี้เสมอ
        </p>
      )}

      {/* v52: ฟีดแบ็ก "หน้าอื่นควรอิงภาษาเดียวกับ Dashboard" — เดิม bg-amber เรียบๆ ไม่มี glow เปลี่ยนมาใช้
          Button component กลาง (components/ui/Button.tsx, Phase 2) ให้ตรงกับปุ่ม CTA หลักทั่วแอปแล้ว */}
      {isToday && currentDay && currentExercises.length > 0 && (
        <Button as="a" href="/session" size="md" className="w-full">
          ▶ เริ่มเซสชันแบบเรียลไทม์
        </Button>
      )}

      {error && <p className="text-sm text-rusttext">{error}</p>}
      {logMessage && <p className="text-sm text-steel">{logMessage}</p>}

      {!currentDay && (
        // เดิม border-dashed สื่อความหมาย "ว่างเปล่า/ยังไม่ตั้งค่า" — PremiumCard ตัด border ทึบออกแล้ว
        // (v48: ใช้ contact shadow บอกขอบแทน) แต่สถานะว่างเปล่านี้ยังต้องการเส้นประจริงๆ สื่อความหมาย
        // ต่างจากการ์ดมีข้อมูลปกติ จึงส่ง border ทับผ่าน style (ชนะ default ของ PremiumCard เพราะ ...style
        // วางท้ายสุดเสมอ) แทนที่จะพึ่ง className ซึ่งชนะ inline style ของ PremiumCard ไม่ได้
        <PremiumCard
          className="px-4 py-8 text-center space-y-3"
          style={{ border: `1px dashed ${CARD_BORDER_CSS}` }}
        >
          <p className="text-sm text-muted">ยังไม่ได้ตั้งค่าโปรแกรมสำหรับวัน{WEEKDAYS[selectedDow]}</p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button
              onClick={openTemplatePicker}
              className="text-xs font-display tracked uppercase text-bg bg-amber rounded-lg px-4 py-2"
            >
              📋 เลือกจากเทมเพลต
            </button>
            <a
              href="/import"
              className="text-xs font-display tracked uppercase text-bg bg-steel rounded-lg px-4 py-2 inline-block"
            >
              นำเข้าจาก Excel
            </a>
            <button
              onClick={() => setAddingExercise(true)}
              className="text-xs font-display tracked uppercase text-ink border border-line rounded-lg px-4 py-2"
            >
              + เพิ่มท่าเอง
            </button>
          </div>
        </PremiumCard>
      )}

      {showTemplatePicker && (
        <TemplatePickerPanel
          templates={templates}
          templateExercises={templateExercises}
          loading={templatesLoading}
          error={templatesError}
          applyingTemplateId={applyingTemplateId}
          onSelect={handleApplyTemplate}
          onCancel={() => setShowTemplatePicker(false)}
        />
      )}

      {currentDay && (
        <PremiumCard className="overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
            <input
              value={currentDay.title}
              onChange={(e) => handleRenameDay(currentDay, e.target.value)}
              className="bg-transparent text-ink font-display tracked uppercase text-sm outline-none flex-1 min-w-0"
            />
            {currentExercises.length > 0 && !selectMode && (
              <>
                <button
                  onClick={() => setSelectMode(true)}
                  className="text-[12px] text-muted hover:text-amber shrink-0"
                >
                  เลือก
                </button>
                <button
                  onClick={() => setConfirmDeleteAll(true)}
                  className="text-[12px] text-muted hover:text-rust shrink-0"
                >
                  ลบทั้งหมด
                </button>
              </>
            )}
            {/* ลบวันนี้ออกจากตารางทั้งวัน (ต่างจาก "ลบทั้งหมด" ด้านบนที่ลบแค่ท่า) — โชว์เสมอไม่ว่าจะมีท่า
                อยู่หรือไม่ (บั๊กที่พบ: วันที่ลบท่าจนว่างเปล่าแล้วยังนับเป็นวันฝึกตามตารางต่อไป ต้องลบตัววัน
                ทิ้งจริงๆ ถึงจะหลุดจากการนับ) */}
            {!selectMode && (
              <button
                onClick={() => setConfirmRemoveDay(true)}
                className="text-[12px] text-muted hover:text-rust shrink-0"
              >
                ลบวันนี้ออกจากตาราง
              </button>
            )}
          </div>

          {confirmRemoveDay && (
            <div className="px-4 py-2.5 border-b border-white/5 bg-rustdim/40 flex items-center justify-between gap-2 flex-wrap">
              <p className="text-[12px] text-rusttext">
                ลบวัน{WEEKDAYS[currentDay.day_of_week]}ออกจากตารางฝึกทั้งหมด? (ท่าในวันนี้ {currentExercises.length} ท่าจะถูกลบไปด้วย
                และวันนี้จะไม่นับเป็นวันฝึกตามตารางอีกต่อไป)
              </p>
              <div className="flex gap-3 shrink-0">
                <button onClick={() => setConfirmRemoveDay(false)} className="text-[12px] text-muted hover:text-ink">
                  ยกเลิก
                </button>
                <button
                  onClick={handleRemoveDay}
                  disabled={removingDay}
                  className="text-[12px] text-bg bg-rust rounded px-2.5 py-1 font-display tracked uppercase disabled:opacity-50"
                >
                  {removingDay ? '...' : 'ยืนยันลบวันนี้'}
                </button>
              </div>
            </div>
          )}

          {selectMode && (
            <div className="px-4 py-2.5 border-b border-white/5 bg-surface2 flex items-center justify-between gap-2 flex-wrap">
              <p className="text-[12px] text-muted">เลือกแล้ว {selectedIds.size} ท่า</p>
              <div className="flex gap-3 shrink-0">
                <button onClick={exitSelectMode} className="text-[12px] text-muted hover:text-ink">
                  ยกเลิก
                </button>
                <button
                  onClick={() => setConfirmBulkDelete(true)}
                  disabled={selectedIds.size === 0}
                  className="text-[12px] text-rusttext hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  ลบที่เลือก
                </button>
              </div>
            </div>
          )}

          {confirmBulkDelete && (
            <div className="px-4 py-2.5 border-b border-white/5 bg-rustdim/40 flex items-center justify-between gap-2 flex-wrap">
              <p className="text-[12px] text-rusttext">ลบ {selectedIds.size} ท่าที่เลือก?</p>
              <div className="flex gap-3 shrink-0">
                <button onClick={() => setConfirmBulkDelete(false)} className="text-[12px] text-muted hover:text-ink">
                  ยกเลิก
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="text-[12px] text-bg bg-rust rounded px-2.5 py-1 font-display tracked uppercase disabled:opacity-50"
                >
                  {bulkDeleting ? '...' : 'ยืนยันลบ'}
                </button>
              </div>
            </div>
          )}

          {confirmDeleteAll && (
            <div className="px-4 py-2.5 border-b border-white/5 bg-rustdim/40 flex items-center justify-between gap-2 flex-wrap">
              <p className="text-[12px] text-rusttext">ลบท่าทั้งหมด {currentExercises.length} ท่าในวันนี้?</p>
              <div className="flex gap-3 shrink-0">
                <button onClick={() => setConfirmDeleteAll(false)} className="text-[12px] text-muted hover:text-ink">
                  ยกเลิก
                </button>
                <button
                  onClick={handleDeleteAll}
                  disabled={bulkDeleting}
                  className="text-[12px] text-bg bg-rust rounded px-2.5 py-1 font-display tracked uppercase disabled:opacity-50"
                >
                  {bulkDeleting ? '...' : 'ยืนยันลบทั้งหมด'}
                </button>
              </div>
            </div>
          )}

          <ul>
            {currentExercises.map((ex) => (
              <ExerciseRow
                key={ex.id}
                exercise={ex}
                done={completedIds.has(ex.id)}
                onToggle={(done) => toggleComplete(ex.id, done)}
                onUpdate={(patch) => handleUpdateExercise(ex, patch)}
                onDelete={() => handleDeleteExercise(ex)}
                selectMode={selectMode}
                selected={selectedIds.has(ex.id)}
                onToggleSelect={() => toggleSelected(ex.id)}
              />
            ))}
          </ul>

          {/* ฟีดแบ็ก "ทำไมไม่ได้ครับ" — ปุ่ม "เลือกจากเทมเพลต" เดิมโผล่แค่ตอน !currentDay (ยังไม่มีแถว
              program_days เลย) แต่กรณีนี้ (สร้างวันไว้แล้วแต่ไม่มีท่าเลย เช่น เคยกด "+ เพิ่มท่าเอง" ไว้
              ก่อนแล้วไม่ได้ใส่ท่าจริง) currentDay จะไม่ null แต่ currentExercises ว่างเปล่า ทำให้เข้า
              branch นี้แทน (ul ว่างๆ + "+ เพิ่มท่า" เฉยๆ ไม่มีทางเลือกเทมเพลตเลย) — เพิ่มปุ่มเดียวกันตรงนี้
              ด้วยเมื่อวันนี้ยังไม่มีท่าเลย ให้ครอบคลุมทั้ง 2 สถานะ "ว่างเปล่า" จริงๆ */}
          {!selectMode && (
            <div className="px-4 py-3 border-t border-white/5 flex items-center gap-3 flex-wrap">
              {currentExercises.length === 0 && (
                <button
                  onClick={openTemplatePicker}
                  className="text-xs font-display tracked uppercase text-amber hover:underline"
                >
                  📋 เลือกจากเทมเพลต
                </button>
              )}
              <button
                onClick={() => setAddingExercise(true)}
                className="text-xs font-display tracked uppercase text-muted hover:text-amber transition"
              >
                + เพิ่มท่า
              </button>
            </div>
          )}

          {confirmLogDuplicate && (
            <div className="px-4 py-2.5 border-b border-white/5 bg-amber/10 flex items-center justify-between gap-2 flex-wrap">
              <p className="text-[12px]" style={{ color: '#E8A33D' }}>
                วันนี้มี Log อยู่แล้ว — เพิ่ม {currentExercises.length} ท่านี้เข้าไปอีกหรือไม่? (อาจได้ท่าซ้ำถ้าเคย log ท่าเดียวกันไปแล้ว)
              </p>
              <div className="flex gap-3 shrink-0">
                <button onClick={() => setConfirmLogDuplicate(false)} className="text-[12px] text-muted hover:text-ink">
                  ยกเลิก
                </button>
                <button
                  onClick={handleLogAllToday}
                  disabled={logging}
                  className="text-[12px] text-bg bg-amber rounded px-2.5 py-1 font-display tracked uppercase disabled:opacity-50"
                >
                  {logging ? '...' : 'เพิ่มเข้า Log'}
                </button>
              </div>
            </div>
          )}

          {currentExercises.length > 0 && !selectMode && (
            <div className="px-4 pb-4">
              {/* ฟีดแบ็ก (design review, P1) "'เริ่มเซสชัน'/'บันทึกเข้า Log' น้ำหนักภาพเท่ากันเกินไป —
                  เริ่มเซสชันควรเป็น Primary CTA ของหน้า ส่วนบันทึกเข้า Log เป็น secondary (สร้าง log
                  จาก program โดยไม่เข้า live session)" — ทั้งคู่เดิมไม่ส่ง variant มา = ใช้ default
                  'primary' (glow CTA) เหมือนกันทั้งคู่จริง ปุ่มนี้เปลี่ยนเป็น variant="secondary" (มีอยู่
                  แล้วใน Button.tsx) ปุ่ม "เริ่มเซสชันแบบเรียลไทม์" ด้านบนไม่แตะ ยังเป็น primary เหมือนเดิม */}
              <Button
                type="button"
                variant="secondary"
                onClick={handleLogAllTodayClick}
                disabled={logging || checkingLogDuplicate}
                size="md"
                className="w-full"
              >
                {/* ฟีดแบ็ก (design review, P2) "'บันทึกเข้า Log วันนี้ทั้งหมด' กำกวมตอนดูวันอื่นที่ไม่ใช่
                    วันนี้ — user อาจคิดว่ากำลังวางแผนไว้ที่วันที่เลือกดูอยู่ ทั้งที่จริงคือเอาแผนของวันนั้น
                    มาสร้างเป็น Log ของวันนี้เสมอ" — เปลี่ยนคำจาก "บันทึกเข้า Log วันนี้ทั้งหมด" เป็น
                    "บันทึกแผนนี้เข้า Log วันนี้" ให้คำว่า "แผนนี้" (สิ่งที่กำลังดูอยู่) กับ "วันนี้" (ที่จะ
                    ถูกบันทึกจริง) แยกกันชัดในประโยคเดียว ไม่แตะ behavior ใดๆ เลย แค่คำ */}
                {logging
                  ? 'กำลังบันทึก...'
                  : checkingLogDuplicate
                    ? 'กำลังตรวจสอบ...'
                    : `บันทึกแผนนี้เข้า Log วันนี้ (${currentExercises.length} ท่า)`}
              </Button>
            </div>
          )}
        </PremiumCard>
      )}

      {addingExercise && (
        <AddExerciseForm onCancel={() => setAddingExercise(false)} onSubmit={handleAddExercise} />
      )}
    </div>
  )
}

function ExerciseRow({
  exercise,
  done,
  onToggle,
  onUpdate,
  onDelete,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  exercise: ProgramExercise
  done: boolean
  onToggle: (done: boolean) => void
  onUpdate: (patch: Partial<ProgramExercise>) => void
  onDelete: () => void
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}) {
  const { unit, toDisplay, toKg, format } = useWeightUnit()
  const [editing, setEditing] = useState(false)

  return (
    // v52: ฟีดแบ็ก "หน้าอื่นควรอิงภาษาเดียวกับ Dashboard" — เดิมแถวนี้ไม่มี hover feedback เลย (มีแค่
    // border คั่นจาก tally-row) เพิ่ม hover:bg-white/5 ให้ตรงกับลิสต์แบบ divide-y ที่อื่นในแอป (Profile,
    // Stats) — ไม่ใส่ตอน selected (มีพื้นหลังสีตัวเองอยู่แล้ว จะซ้อนกันดูสกปรก)
    <li
      className={`tally-row px-4 py-3 space-y-2 transition ${selectMode ? 'cursor-pointer' : ''} ${selected ? 'bg-rustdim/20' : 'hover:bg-white/5'}`}
      onClick={selectMode ? onToggleSelect : undefined}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selectMode ? selected : done}
          onChange={(e) => {
            if (selectMode) onToggleSelect?.()
            else onToggle(e.target.checked)
          }}
          onClick={(e) => selectMode && e.stopPropagation()}
          className={`mt-1 shrink-0 ${selectMode ? 'accent-rust' : 'accent-amber'}`}
        />
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${done ? 'text-muted line-through' : 'text-ink'}`}>{exercise.exercise_name}</p>
          {!editing && (
            <p className="text-[12px] text-muted mt-0.5">
              {exercise.sets ?? '–'} เซ็ต × {exercise.target_reps ?? '–'} reps
              {exercise.target_rir && ` · RIR ${exercise.target_rir}`}
              {exercise.rest && ` · พัก ${exercise.rest}`}
              {exercise.default_weight_kg != null && ` · ${format(exercise.default_weight_kg)}`}
            </p>
          )}
          {!editing && exercise.secondary_muscles && exercise.secondary_muscles.length > 0 && (
            <p className="text-[12px] text-muted/70 mt-0.5">กล้ามเนื้อรอง: {exercise.secondary_muscles.join(', ')}</p>
          )}
          {!editing && exercise.rationale && <p className="text-[12px] text-muted/70 mt-1 italic">{exercise.rationale}</p>}
        </div>
        {!selectMode && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setEditing((v) => !v)
            }}
            className="text-[12px] text-muted hover:text-amber shrink-0"
          >
            {editing ? 'เสร็จ' : 'แก้ไข'}
          </button>
        )}
      </div>

      {!selectMode && editing && (
        <div className="pl-6 space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <MiniField label="เซ็ต" value={exercise.sets != null ? String(exercise.sets) : ''} onBlur={(v) => onUpdate({ sets: v ? Number(v) : null })} />
            <MiniField label="Target Reps" value={exercise.target_reps ?? ''} onBlur={(v) => onUpdate({ target_reps: v || null })} />
            <MiniField label="Target RIR" value={exercise.target_rir ?? ''} onBlur={(v) => onUpdate({ target_rir: v || null })} />
            <MiniField label="พัก" value={exercise.rest ?? ''} onBlur={(v) => onUpdate({ rest: v || null })} />
            <MiniField
              label={`น้ำหนักเริ่มต้น (${unit})`}
              value={exercise.default_weight_kg != null ? String(toDisplay(exercise.default_weight_kg)) : ''}
              onBlur={(v) => onUpdate({ default_weight_kg: v ? toKg(Number(v)) : null })}
            />
            <label className="block">
              <span className="block text-[12px] tracked uppercase text-muted mb-0.5">กลุ่มกล้ามเนื้อ</span>
              <select
                value={(exercise.muscle_group as MuscleGroup) ?? 'อื่นๆ'}
                onChange={(e) => onUpdate({ muscle_group: e.target.value })}
                className="w-full bg-surface2 text-ink text-xs rounded px-1 py-1.5 border border-line outline-none focus:border-amber"
              >
                {MUSCLE_GROUPS.map((mg) => (
                  <option key={mg} value={mg}>
                    {mg}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button onClick={onDelete} className="text-[12px] text-rusttext hover:underline">
            ลบท่านี้
          </button>
        </div>
      )}
    </li>
  )
}

function MiniField({ label, value, onBlur }: { label: string; value: string; onBlur: (v: string) => void }) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <label className="block">
      <span className="block text-[12px] tracked uppercase text-muted mb-0.5">{label}</span>
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onBlur(local)}
        className="w-full bg-surface2 text-ink text-xs text-center rounded px-1 py-1.5 border border-line outline-none focus:border-amber"
      />
    </label>
  )
}

function TemplatePickerPanel({
  templates,
  templateExercises,
  loading,
  error,
  applyingTemplateId,
  onSelect,
  onCancel,
}: {
  templates: WorkoutTemplate[] | null
  templateExercises: Record<string, WorkoutTemplateExercise[]>
  loading: boolean
  error: string | null
  applyingTemplateId: string | null
  onSelect: (template: WorkoutTemplate) => void
  onCancel: () => void
}) {
  return (
    <PremiumCard className="px-4 py-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink font-display tracked uppercase">เลือกจากเทมเพลต</p>
        <button onClick={onCancel} className="text-[12px] text-muted hover:text-ink shrink-0">
          ยกเลิก
        </button>
      </div>

      {loading && <p className="text-xs text-muted">กำลังโหลดเทมเพลต...</p>}
      {error && <p className="text-xs text-rusttext">{error}</p>}

      {!loading && !error && templates && templates.length === 0 && (
        <p className="text-xs text-muted">
          ยังไม่มีเทมเพลตเลย —{' '}
          <a href="/templates" className="text-amber hover:underline">
            สร้างเทมเพลตแรกที่นี่
          </a>
        </p>
      )}

      {!loading && !error && templates && templates.length > 0 && (
        <ul className="space-y-1.5 max-h-72 overflow-y-auto">
          {templates.map((t) => {
            const exCount = (templateExercises[t.id] ?? []).length
            const applying = applyingTemplateId === t.id
            return (
              <li key={t.id}>
                <button
                  onClick={() => onSelect(t)}
                  disabled={applyingTemplateId !== null}
                  className="w-full flex items-center justify-between gap-2 rounded-lg border border-line bg-surface2 px-3 py-2.5 text-left transition hover:border-amber/40 disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-ink truncate">{t.title}</span>
                    <span className="block text-[12px] text-muted">{exCount} ท่า</span>
                  </span>
                  <span className="text-[12px] text-amber shrink-0">{applying ? 'กำลังใส่...' : 'ใช้เทมเพลตนี้ →'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </PremiumCard>
  )
}

function AddExerciseForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (fields: {
    name: string
    sets: string
    reps: string
    rir: string
    rest: string
    muscleGroup: MuscleGroup
    secondaryMuscles: string[]
    exerciseLibraryId: string | null
  }) => void
}) {
  const [name, setName] = useState('')
  const [sets, setSets] = useState('')
  const [reps, setReps] = useState('')
  const [rir, setRir] = useState('')
  const [rest, setRest] = useState('')
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('อื่นๆ')
  const [secondaryMuscles, setSecondaryMuscles] = useState<string[]>([])
  const [exerciseLibraryId, setExerciseLibraryId] = useState<string | null>(null)

  return (
    <PremiumCard className="px-4 py-4 space-y-3">
      <p className="text-sm text-ink font-display tracked uppercase">เพิ่มท่าใหม่</p>
      <ExercisePicker
        value={name}
        onChange={(v) => {
          setName(v)
          setExerciseLibraryId(null) // พิมพ์เอง ไม่ได้เลือกจาก dropdown — เคลียร์ FK เดิมทิ้ง
        }}
        onSelect={(ex: ExerciseDef) => {
          setMuscleGroup(ex.muscleGroup)
          setSecondaryMuscles(ex.secondaryMuscles)
          setExerciseLibraryId(ex.id)
        }}
        placeholder="ชื่อท่า"
      />
      <div className="grid grid-cols-2 gap-1.5">
        <MiniField label="เซ็ต" value={sets} onBlur={setSets} />
        <MiniField label="Target Reps" value={reps} onBlur={setReps} />
        <MiniField label="Target RIR" value={rir} onBlur={setRir} />
        <MiniField label="พัก" value={rest} onBlur={setRest} />
      </div>
      <select
        value={muscleGroup}
        onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}
        className="w-full bg-surface2 text-ink text-xs rounded px-2 py-2 border border-line outline-none focus:border-amber"
      >
        {MUSCLE_GROUPS.map((mg) => (
          <option key={mg} value={mg}>
            {mg}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-line text-muted font-display tracked uppercase py-2.5 text-xs"
        >
          ยกเลิก
        </button>
        <button
          onClick={() => name.trim() && onSubmit({ name: name.trim(), sets, reps, rir, rest, muscleGroup, secondaryMuscles, exerciseLibraryId })}
          className="flex-[2] rounded-lg bg-steel text-bg font-display tracked uppercase py-2.5 text-xs active:scale-[0.99]"
        >
          เพิ่มท่านี้
        </button>
      </div>
    </PremiumCard>
  )
}
