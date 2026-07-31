'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { WorkoutTemplate, WorkoutTemplateExercise, ProgramDay } from '@/lib/types'
import { MUSCLE_GROUPS, type MuscleGroup } from '@/lib/muscle-groups'
import { WEEKDAYS, WEEKDAYS_SHORT, todayStr } from '@/lib/weekdays'
import { parseRangeToNumber, rirToRpe } from '@/lib/importWorkoutExcel'
import ExercisePicker from '@/components/ExercisePicker'
import type { ExerciseDef } from '@/lib/exercises'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'
import Image from 'next/image'
import { COLORS, withAlpha, lighten } from '@/lib/theme'

// Dark Titanium — พื้นการ์ดยังเป็นผิวโลหะเข้มเดียวกันหมด (ไม่ใช่ glow สีจัดๆ แบบก่อนหน้า) แต่เอาสัญญะสี
// ต่อวันกลับมาบางๆ (ขอบซ้าย + glow รอบไอคอนแบบเบาๆ) เพราะฟีดแบ็กบอกว่าไม่มีสีเลยรู้สึกจืดไป — ต่างจาก
// เวอร์ชันก่อนตรงที่สีนี้เป็น "จุดเสริม" ไม่ใช่ตัวเด่นของการ์ดอีกต่อไป สีส้ม (COLORS.amber) ยังเป็นสีแบรนด์
// หลักจุดเดียวที่ปุ่ม Start ตามธีมดำ-ส้มของ FitLog
const ACCENT_PALETTE = [COLORS.amber, COLORS.steel, COLORS.violet, COLORS.moss, COLORS.rust] as const

// รูปประกอบวงกลม — ไฟล์ทั้งหมดอยู่ที่ public/images/templates/ เป็น PNG โปร่งใส (ยกเว้น upper.png
// ที่พื้นหลังเข้มอยู่แล้ว) ขนาดจริง 1024x1024 — เรียงคู่กับ ACCENT_PALETTE ตำแหน่งต่อตำแหน่ง (index เดียวกัน)
const ICON_PALETTE = [
  '/images/templates/lower.png',
  '/images/templates/upper.png',
  '/images/templates/legs.png',
  '/images/templates/back.png',
  '/images/templates/chest.png',
] as const

// เท็กซ์เจอร์ noise บางๆ ปูทับพื้นหลังทั้งหน้า — สร้างจาก SVG feTurbulence แทนไฟล์รูป กันไม่ต้องมี asset
// เพิ่ม ใช้คู่กับ opacity ต่ำ + mixBlendMode: 'overlay' เท่านั้น (ดูจุดที่ใช้งานด้านล่าง)
const NOISE_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`

// แยกหัวข้อเป็น "คำนำ" (เช่น "DAY 5") กับ "ส่วนที่เหลือ" ถ้าชื่อเทมเพลตมีเครื่องหมาย — คั่นอยู่ (ให้น้ำหนัก
// ตัวอักษรต่างกัน คำนำเบากว่า+สีตามวัน ส่วนที่เหลือหนักกว่า+สีขาว ไล่ลำดับสายตาได้ดีกว่าตัวหนาเท่ากันหมด)
// ถ้าไม่มี — เลย (ชื่อเทมเพลตที่ผู้ใช้ตั้งเองส่วนใหญ่ไม่มีรูปแบบนี้) ก็ fallback ไปแสดงทั้งก้อนแบบเดิม
function splitTitle(title: string): [string, string] | null {
  const idx = title.indexOf('—')
  if (idx <= 0 || idx >= title.length - 1) return null
  return [title.slice(0, idx).trim(), title.slice(idx + 1).trim()]
}

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function slugify(title: string) {
  return title.trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '-').replace(/^-+|-+$/g, '') || 'template'
}

interface TemplateExport {
  version: 1
  type: 'fitlog-template'
  title: string
  exercises: Array<{
    exercise_name: string
    muscle_group: string | null
    secondary_muscles: string[]
    exercise_library_id: string | null
    sets: number | null
    target_reps: string | null
    target_rir: string | null
    rest: string | null
    default_weight_kg: number | null
    notes: string | null
  }>
}

export default function TemplatesPage() {
  const supabase = createClient()

  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [exercisesByTemplate, setExercisesByTemplate] = useState<Record<string, WorkoutTemplateExercise[]>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [startMessage, setStartMessage] = useState<string | null>(null)
  const [addingToId, setAddingToId] = useState<string | null>(null)
  const [applyPickerId, setApplyPickerId] = useState<string | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [applyMessage, setApplyMessage] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data: tRows, error: tErr } = await supabase
      .from('workout_templates')
      .select('*')
      .order('created_at', { ascending: false })

    if (tErr) {
      setLoadError(tErr.message)
      setLoading(false)
      return
    }

    const typedTemplates = (tRows as WorkoutTemplate[]) ?? []
    setTemplates(typedTemplates)

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
        setLoadError(exErr.message)
        setLoading(false)
        return
      }

      const grouped: Record<string, WorkoutTemplateExercise[]> = {}
      ;(exRows as WorkoutTemplateExercise[]).forEach((ex) => {
        grouped[ex.template_id] = grouped[ex.template_id] ?? []
        grouped[ex.template_id].push(ex)
      })
      setExercisesByTemplate(grouped)
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  async function handleCreateTemplate(title: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error: err } = await supabase.from('workout_templates').insert({ user_id: user.id, title }).select('*').single()
    if (err) {
      setError(err.message)
      return
    }
    const created = data as WorkoutTemplate
    setTemplates((prev) => [created, ...prev])
    setCreating(false)
    setExpandedId(created.id)
  }

  async function handleDeleteTemplate(id: string) {
    setError(null)
    const { error: err } = await supabase.from('workout_templates').delete().eq('id', id)
    if (err) {
      setError(`ลบเทมเพลตไม่สำเร็จ: ${err.message}`)
      return
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  function handleExportTemplate(t: WorkoutTemplate) {
    const exercises = exercisesByTemplate[t.id] ?? []
    const payload: TemplateExport = {
      version: 1,
      type: 'fitlog-template',
      title: t.title,
      exercises: exercises.map((ex) => ({
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
      })),
    }
    downloadBlob(JSON.stringify(payload, null, 2), `fitlog-template-${slugify(t.title)}.json`, 'application/json')
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setImporting(true)
    setError(null)
    setImportMessage(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as Partial<TemplateExport>
      if (parsed?.type !== 'fitlog-template' || typeof parsed.title !== 'string' || !Array.isArray(parsed.exercises)) {
        setError('ไฟล์นี้ไม่ใช่เทมเพลตที่รองรับ')
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('กรุณาเข้าสู่ระบบใหม่')
        return
      }

      const { data: newTemplate, error: tErr } = await supabase
        .from('workout_templates')
        .insert({ user_id: user.id, title: parsed.title })
        .select('*')
        .single()
      if (tErr || !newTemplate) {
        setError(`นำเข้าเทมเพลตไม่สำเร็จ: ${tErr?.message ?? 'unknown error'}`)
        return
      }
      const created = newTemplate as WorkoutTemplate

      if (parsed.exercises.length > 0) {
        const payload = parsed.exercises.map((ex, i) => ({
          template_id: created.id,
          user_id: user.id,
          position: i,
          exercise_name: ex.exercise_name,
          muscle_group: ex.muscle_group ?? null,
          secondary_muscles: ex.secondary_muscles ?? [],
          exercise_library_id: ex.exercise_library_id ?? null,
          sets: ex.sets ?? null,
          target_reps: ex.target_reps ?? null,
          target_rir: ex.target_rir ?? null,
          rest: ex.rest ?? null,
          default_weight_kg: ex.default_weight_kg ?? null,
          notes: ex.notes ?? null,
        }))
        const { data: exRows, error: exErr } = await supabase.from('workout_template_exercises').insert(payload).select('*')
        if (exErr) {
          setError(`นำเข้าท่าไม่สำเร็จ: ${exErr.message}`)
        } else {
          setExercisesByTemplate((prev) => ({ ...prev, [created.id]: exRows as WorkoutTemplateExercise[] }))
        }
      }

      setTemplates((prev) => [created, ...prev])
      setExpandedId(created.id)
      setImportMessage(`นำเข้า "${created.title}" (${parsed.exercises.length} ท่า) แล้ว`)
    } catch (err) {
      setError(`นำเข้าไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setImporting(false)
    }
  }

  async function handleAddExercise(
    templateId: string,
    fields: {
      name: string
      sets: string
      reps: string
      rir: string
      rest: string
      notes: string
      muscleGroup: MuscleGroup
      secondaryMuscles: string[]
      exerciseLibraryId: string | null
    }
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const position = (exercisesByTemplate[templateId] ?? []).length

    const { data, error: err } = await supabase
      .from('workout_template_exercises')
      .insert({
        template_id: templateId,
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
        notes: fields.notes || null,
      })
      .select('*')
      .single()

    if (err) {
      setError(err.message)
      return
    }

    setExercisesByTemplate((prev) => ({
      ...prev,
      [templateId]: [...(prev[templateId] ?? []), data as WorkoutTemplateExercise],
    }))
    setAddingToId(null)
  }

  async function handleDeleteExercise(ex: WorkoutTemplateExercise) {
    setError(null)
    const { error: err } = await supabase.from('workout_template_exercises').delete().eq('id', ex.id)
    if (err) {
      setError(`ลบท่าไม่สำเร็จ: ${err.message}`)
      return
    }
    setExercisesByTemplate((prev) => ({
      ...prev,
      [ex.template_id]: (prev[ex.template_id] ?? []).filter((e) => e.id !== ex.id),
    }))
  }

  async function handleUpdateExercise(ex: WorkoutTemplateExercise, patch: Partial<WorkoutTemplateExercise>) {
    setError(null)
    setExercisesByTemplate((prev) => ({
      ...prev,
      [ex.template_id]: (prev[ex.template_id] ?? []).map((e) => (e.id === ex.id ? { ...e, ...patch } : e)),
    }))
    const { error: err } = await supabase.from('workout_template_exercises').update(patch).eq('id', ex.id)
    if (err) {
      setError(`แก้ไขท่าไม่สำเร็จ: ${err.message}`)
    }
  }

  async function handleReorderExercises(templateId: string, reordered: WorkoutTemplateExercise[]) {
    setExercisesByTemplate((prev) => ({ ...prev, [templateId]: reordered }))
    const { error: err } = await Promise.all(
      reordered.map((ex, i) => supabase.from('workout_template_exercises').update({ position: i }).eq('id', ex.id))
    ).then(
      (results) => ({ error: results.find((r) => r.error)?.error ?? null }),
      (e) => ({ error: e })
    )
    if (err) {
      setError(`เรียงลำดับท่าไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleStart(template: WorkoutTemplate) {
    const exercises = exercisesByTemplate[template.id] ?? []
    if (exercises.length === 0) return

    setStartingId(template.id)
    setStartMessage(null)
    setError(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('กรุณาเข้าสู่ระบบใหม่')
        return
      }

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

      const { error: wErr } = await supabase.from('workouts').insert(payload)
      if (wErr) {
        setError(`เริ่ม "${template.title}" ไม่สำเร็จ: ${wErr.message}`)
        return
      }

      setStartMessage(`บันทึก "${template.title}" (${payload.length} ท่า) เข้า Log วันนี้แล้ว`)
    } catch (err) {
      setError(`เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setStartingId(null)
    }
  }

  async function ensureProgramDay(dow: number, userId: string): Promise<ProgramDay | null> {
    const { data: existing, error: findErr } = await supabase
      .from('program_days')
      .select('*')
      .eq('user_id', userId)
      .eq('day_of_week', dow)
      .maybeSingle()

    if (findErr) {
      setError(findErr.message)
      return null
    }
    if (existing) return existing as ProgramDay

    const { data, error: err } = await supabase
      .from('program_days')
      .upsert({ user_id: userId, day_of_week: dow, title: `วัน${WEEKDAYS[dow]}` }, { onConflict: 'user_id,day_of_week' })
      .select('*')
      .single()

    if (err || !data) {
      setError(err?.message ?? 'สร้างวันไม่สำเร็จ')
      return null
    }
    return data as ProgramDay
  }

  async function handleApplyToProgram(template: WorkoutTemplate, dow: number) {
    const exercises = exercisesByTemplate[template.id] ?? []
    if (exercises.length === 0) return

    setApplyingId(template.id)
    setApplyMessage(null)
    setError(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('กรุณาเข้าสู่ระบบใหม่')
        return
      }

      const day = await ensureProgramDay(dow, user.id)
      if (!day) return

      const { count, error: countErr } = await supabase
        .from('program_exercises')
        .select('*', { count: 'exact', head: true })
        .eq('program_day_id', day.id)

      if (countErr) {
        setError(countErr.message)
        return
      }
      const startPosition = count ?? 0

      const payload = exercises.map((ex, i) => ({
        program_day_id: day.id,
        user_id: user.id,
        position: startPosition + i,
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group,
        secondary_muscles: ex.secondary_muscles,
        exercise_library_id: ex.exercise_library_id,
        sets: ex.sets,
        target_reps: ex.target_reps,
        target_rir: ex.target_rir,
        rest: ex.rest,
        rationale: ex.notes,
      }))

      const { error: insErr } = await supabase.from('program_exercises').insert(payload)
      if (insErr) {
        setError(`ตั้งโปรแกรมไม่สำเร็จ: ${insErr.message}`)
        return
      }

      setApplyMessage(`เพิ่ม ${payload.length} ท่าจาก "${template.title}" เข้าโปรแกรมวัน${WEEKDAYS[dow]}แล้ว`)
      setApplyPickerId(null)
    } catch (err) {
      setError(`เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setApplyingId(null)
    }
  }

  if (loading) return <LoadingState />
  if (loadError) return <ErrorState title="โหลดเทมเพลตไม่สำเร็จ" message={loadError} onRetry={load} />

  return (
    <div className="relative">
      {/* พื้นหลังทั้งหน้า — แนว Dark Titanium: แสงไฮไลต์เป็นกลาง (ขาว ไม่ใช่สี) เหมือนแสงสตูดิโอส่องแผ่นโลหะ
          + gradient เข้ม + noise บางๆ (พื้นผิวแบบโลหะขัดหยาบ) ไม่ใช้ glow สีเหมือนก่อนหน้า เพราะแข่งกับรูปกล้ามเนื้อ */}
      <div className="absolute inset-0 -z-10 pointer-events-none" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at top, rgba(255,255,255,.05), transparent 40%)',
              'linear-gradient(180deg, #0d0d10, #0b0b0d)',
            ].join(', '),
          }}
        />
        <div className="absolute inset-0" style={{ backgroundImage: NOISE_BG, opacity: 0.04, mixBlendMode: 'overlay' }} />
      </div>

      <div className="space-y-3 lg:max-w-3xl lg:mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl tracked uppercase">เทมเพลต</h1>
          <p className="text-sm text-muted mt-1">กดเริ่มได้ทุกเมื่อ ไม่ผูกกับวันในสัปดาห์</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <a
            href="/exercises"
            className="inline-flex items-center gap-1.5 text-[11px] font-display tracked uppercase text-muted border border-line rounded-full px-3 py-1.5 hover:text-amber hover:border-amber/50 transition"
          >
            🔍 ฐานข้อมูลท่า
          </a>
          <a
            href="/history"
            className="inline-flex items-center gap-1.5 text-[11px] font-display tracked uppercase text-muted border border-line rounded-full px-3 py-1.5 hover:text-amber hover:border-amber/50 transition"
          >
            🕐 ดูประวัติ
          </a>
        </div>
      </div>

      {error && <p className="text-sm text-rusttext">{error}</p>}
      {startMessage && <p className="text-sm text-steel">{startMessage}</p>}
      {applyMessage && <p className="text-sm text-steel">{applyMessage}</p>}
      {importMessage && <p className="text-sm text-steel">{importMessage}</p>}

      {templates.length === 0 && !creating && (
        <div className="rounded-lg bg-surface border border-line shadow-elevated border-dashed px-4 py-8 text-center">
          <p className="text-sm text-muted mb-3">ยังไม่มีเทมเพลต</p>
          <button
            onClick={() => setCreating(true)}
            className="text-xs font-display tracked uppercase text-bg bg-steel rounded-lg px-4 py-2"
          >
            + สร้างเทมเพลตแรก
          </button>
        </div>
      )}

      {templates.map((t, i) => {
          const exercises = exercisesByTemplate[t.id] ?? []
          const expanded = expandedId === t.id
          const accent = ACCENT_PALETTE[i % ACCENT_PALETTE.length]
          const icon = ICON_PALETTE[i % ICON_PALETTE.length]
          return (
            <div
              key={t.id}
              className="relative animate-rise"
              style={{ animationDuration: '350ms', animationDelay: `${i * 60}ms` }}
            >
              {/* เงาของการ์ดต้องอยู่ที่ "ห่อนอก" ใบนี้ (ไม่มี overflow-hidden) — overflow-hidden จะไปตัด
                  box-shadow ของ "ตัวเอง" ทิ้งด้วย เลยแยกเป็น 2 ชั้น: ห่อนอกคุมขอบ/เงา, ห่อในคุม
                  overflow-hidden สำหรับพื้นหลัง/รูปที่ต้องโค้งตามการ์ด — ขอบรอบการ์ดตอนนี้เป็น "gradient
                  border" (สว่างด้านบน มืดด้านล่าง จำลองผิวโลหะจริง) แทนเส้นสีเทาแบนเดิม ใช้เทคนิค
                  background 2 เลเยอร์ + backgroundClip (border ธรรมดาไล่สีไม่ได้ตรงๆ) ส่วนสีต่อวันย้าย
                  ไปอยู่ที่เส้น "energy line" ในห่อในแทนที่จะเป็นขอบซ้ายทึบเหมือนก่อน */}
              <div
                className="rounded-3xl"
                style={{
                  border: '1px solid transparent',
                  backgroundImage: [
                    'linear-gradient(#1A1C21, #1A1C21)',
                    'linear-gradient(180deg, rgba(255,255,255,.08), rgba(0,0,0,.45))',
                  ].join(', '),
                  backgroundOrigin: 'border-box',
                  backgroundClip: 'padding-box, border-box',
                  boxShadow: [
                    '0 20px 45px rgba(0,0,0,.5)',
                    '0 1px 0 rgba(255,255,255,.05)',
                    `-6px 0 18px ${withAlpha(accent, '2E')}`,
                  ].join(', '),
                }}
              >
                <div
                  className="relative rounded-3xl overflow-hidden"
                  style={{
                    backgroundImage: [
                      // สีของรูป/ขอบซ้ายไหลเข้าไปในเนื้อการ์ดบางๆ ให้รูปกับการ์ดรู้สึกเป็นชิ้นเดียวกัน
                      // แทนที่จะเป็นจุดสี (ไอคอน) กับเส้นสี (ขอบ) ที่แยกจากกันคนละจุด
                      `radial-gradient(ellipse 220px 160px at 0% 45%, ${withAlpha(accent, '26')}, transparent 70%)`,
                      // แสงกลางการ์ดจางๆ กันไม่ให้เนื้อการ์ดมืดตันเป็นสีทึบเดียวตรงกลาง
                      'radial-gradient(circle at 30% 50%, rgba(255,255,255,.03), transparent 45%)',
                      'linear-gradient(180deg, #2B2D34, #1C1E23)',
                    ].join(', '),
                    boxShadow: ['inset 0 1px 0 rgba(255,255,255,.08)', 'inset 0 -1px 0 rgba(0,0,0,.5)'].join(', '),
                  }}
                >
                  {/* Energy line — เส้นสีต่อวันบางๆ ที่ขอบซ้าย ไล่จากสว่าง (บน) ไปจาง (ล่าง) แทนแถบสีทึบ
                      เรียบๆ เหมือนก่อน ให้ความรู้สึกเป็นเส้นพลังงานมากกว่าเส้นบอกหมวดหมู่ธรรมดา */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[2px] pointer-events-none"
                    style={{
                      background: `linear-gradient(180deg, ${lighten(accent, 0.25)} 0%, ${accent} 45%, ${withAlpha(accent, '33')} 100%)`,
                      boxShadow: `0 0 8px ${withAlpha(accent, '80')}`,
                    }}
                    aria-hidden="true"
                  />
                  {/* glass reflection — ไล่ขาวจางๆ จากขอบบน ให้พื้นผิวดูมีมิติแทนสีทึบราบเรียบ */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.05), transparent 22%)' }}
                    aria-hidden="true"
                  />
                  <div className="relative px-3.5 py-3.5 border-b border-line flex items-center gap-3">
                    <button
                      onClick={() => setExpandedId(expanded ? null : t.id)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      {/* ไอคอนวงกลม: glow ด้านหลังหายใจเบาๆ (layer แยก ไม่แตะตัวรูป) + วงเบเซลโลหะนิ่ง
                          + highlight บนพื้นหลังผสมสีต่อวัน (mix-blend-mode: screen) ให้ดูเหมือนมีไฟอยู่
                          ข้างใน + รูปซูมเข้า 15% ให้กล้ามเนื้อเต็มวงมากกว่าเดิม */}
                      <span className="relative shrink-0 w-20 h-20 flex items-center justify-center">
                        <span
                          className="absolute inset-0 rounded-full animate-icon-glow-breathe pointer-events-none"
                          style={{ background: `radial-gradient(circle, ${withAlpha(accent, '66')}, transparent 70%)`, filter: 'blur(14px)' }}
                          aria-hidden="true"
                        />
                        <span
                          className="relative w-full h-full rounded-full flex items-center justify-center"
                          style={{ boxShadow: '0 0 0 1px rgba(255,255,255,.15), 0 6px 14px rgba(0,0,0,.55)' }}
                          aria-hidden="true"
                        >
                          <span
                            className="relative w-full h-full rounded-full overflow-hidden flex items-center justify-center"
                            style={{ background: `radial-gradient(circle at 35% 30%, ${lighten(accent, 0.15)}, #2A2C31)` }}
                          >
                            <Image
                              src={icon}
                              alt=""
                              width={80}
                              height={80}
                              className="w-full h-full object-cover"
                              style={{ transform: 'scale(1.15)' }}
                            />
                            {/* rim light มุมบนซ้าย — เส้นแสงขาวบางๆ จำลองแสงตกกระทบ ให้รูปดูมีมิติ 3 มิติ
                                ขึ้น แยกจาก inner glow สีต่อวันด้านล่าง (คนละทิศ คนละสี ซ้อนกันได้พอดี) */}
                            <span
                              className="absolute inset-0 rounded-full pointer-events-none"
                              style={{
                                background: 'linear-gradient(135deg, rgba(255,255,255,.35) 0%, transparent 35%)',
                                mixBlendMode: 'screen',
                              }}
                            />
                            <span
                              className="absolute inset-0 rounded-full pointer-events-none"
                              style={{
                                background: `radial-gradient(circle at 50% 40%, ${withAlpha(accent, '4D')}, transparent 60%)`,
                                mixBlendMode: 'screen',
                              }}
                            />
                          </span>
                        </span>
                      </span>
                      <span className="min-w-0">
                        {(() => {
                          const split = splitTitle(t.title)
                          return split ? (
                            <p className="text-xs font-display tracked uppercase leading-snug">
                              <span style={{ fontWeight: 600, color: accent }}>{split[0]} —</span>{' '}
                              <span className="text-ink" style={{ fontWeight: 800 }}>
                                {split[1]}
                              </span>
                            </p>
                          ) : (
                            <p className="text-xs text-ink font-display tracked uppercase leading-snug" style={{ fontWeight: 800 }}>
                              {t.title}
                            </p>
                          )
                        })()}
                        <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>
                          🕐 {exercises.length} ท่า
                        </p>
                      </span>
                    </button>
                    <button
                      onClick={() => handleStart(t)}
                      disabled={startingId === t.id || exercises.length === 0}
                      className="shrink-0 w-[92px] rounded-[18px] text-[9px] leading-tight font-display tracked uppercase text-bg py-2 px-3 text-center active:scale-[0.99] disabled:opacity-40 transition"
                      style={{
                        backgroundImage: [
                          'linear-gradient(180deg, rgba(255,255,255,.35), transparent 55%)',
                          'linear-gradient(180deg, #FFDA8C 0%, #FFC94B 40%, #FF9700 100%)',
                        ].join(', '),
                        boxShadow: 'inset 0 2px 0 rgba(255,255,255,.4), inset 0 -2px 0 rgba(0,0,0,.25), 0 4px 9px rgba(255,150,0,.23)',
                      }}
                    >
                      {startingId === t.id ? '...' : `Start ${t.title}`}
                    </button>
                  </div>

              {expanded && (
                <>
                  <ExerciseList
                    exercises={exercises}
                    onUpdate={handleUpdateExercise}
                    onDelete={handleDeleteExercise}
                    onReorder={(reordered) => handleReorderExercises(t.id, reordered)}
                  />
                  <div className="px-4 py-3 border-t border-line flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <button
                      onClick={() => setAddingToId(t.id)}
                      className="text-xs font-display tracked uppercase text-muted hover:text-amber transition"
                    >
                      + เพิ่มท่า
                    </button>
                    <button
                      onClick={() => setApplyPickerId(applyPickerId === t.id ? null : t.id)}
                      disabled={exercises.length === 0}
                      className="text-xs font-display tracked uppercase text-muted hover:text-amber transition disabled:opacity-40"
                    >
                      📅 ตั้งโปรแกรม
                    </button>
                    <button
                      onClick={() => handleExportTemplate(t)}
                      disabled={exercises.length === 0}
                      className="text-xs font-display tracked uppercase text-muted hover:text-amber transition disabled:opacity-40"
                    >
                      ⬇ Export
                    </button>
                    <button onClick={() => handleDeleteTemplate(t.id)} className="text-xs text-muted hover:text-rust transition">
                      ลบเทมเพลตนี้
                    </button>
                  </div>
                  {applyPickerId === t.id && (
                    <div className="px-4 pb-4 space-y-2">
                      <p className="text-[11px] text-muted">เลือกวันในสัปดาห์ที่จะใส่ท่าจากเทมเพลตนี้เข้าไป (เพิ่มต่อท้ายถ้าวันนั้นมีท่าอยู่แล้ว)</p>
                      <div className="grid grid-cols-7 gap-1">
                        {WEEKDAYS_SHORT.map((label, dow) => (
                          <button
                            key={dow}
                            onClick={() => handleApplyToProgram(t, dow)}
                            disabled={applyingId === t.id}
                            className="rounded-lg py-2.5 text-xs font-display tracked uppercase bg-surface2 text-ink border border-line hover:border-amber transition disabled:opacity-40"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {applyingId === t.id && <p className="text-[11px] text-muted">กำลังตั้งโปรแกรม...</p>}
                    </div>
                  )}
                  {addingToId === t.id && (
                    <div className="px-4 pb-4">
                      <AddExerciseForm onCancel={() => setAddingToId(null)} onSubmit={(fields) => handleAddExercise(t.id, fields)} />
                    </div>
                  )}
                </>
              )}
                </div>
              </div>
            </div>
          )
        })}

      {!creating && (
        <div className="flex gap-3">
          {templates.length > 0 && (
            <button
              onClick={() => setCreating(true)}
              className="flex-1 rounded-3xl border border-dashed py-3.5 px-3 text-center transition active:scale-[0.99]"
              style={{ borderColor: withAlpha(COLORS.amber, '66'), color: COLORS.amber }}
            >
              <span className="block font-display text-sm tracked uppercase">+ เทมเพลตใหม่</span>
              <span className="block text-[10px] text-muted mt-1 normal-case">สร้างโปรแกรมของคุณเอง</span>
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex-1 rounded-3xl border border-dashed py-3.5 px-3 text-center transition active:scale-[0.99] disabled:opacity-40"
            style={{ borderColor: withAlpha(COLORS.steel, '66'), color: COLORS.steel }}
          >
            <span className="block font-display text-sm tracked uppercase">{importing ? '...' : '⬆ Import'}</span>
            <span className="block text-[10px] text-muted mt-1 normal-case">นำเข้าเทมเพลตจากไฟล์</span>
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
        </div>
      )}

      {creating && <NewTemplateForm onCancel={() => setCreating(false)} onSubmit={handleCreateTemplate} />}
      </div>
    </div>
  )
}

function ExerciseList({
  exercises,
  onUpdate,
  onDelete,
  onReorder,
}: {
  exercises: WorkoutTemplateExercise[]
  onUpdate: (ex: WorkoutTemplateExercise, patch: Partial<WorkoutTemplateExercise>) => void
  onDelete: (ex: WorkoutTemplateExercise) => void
  onReorder: (reordered: WorkoutTemplateExercise[]) => void
}) {
  const [items, setItems] = useState(exercises)
  const itemsRef = useRef(exercises)
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map())
  const dragIndexRef = useRef<number | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    setItems(exercises)
    itemsRef.current = exercises
  }, [exercises])

  const handleMove = useCallback((e: PointerEvent) => {
    const from = dragIndexRef.current
    if (from === null) return
    let to = from
    rowRefs.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect()
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        to = itemsRef.current.findIndex((it) => it.id === id)
      }
    })
    if (to !== from && to >= 0) {
      const next = [...itemsRef.current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      itemsRef.current = next
      dragIndexRef.current = to
      setItems(next)
    }
  }, [])

  const handleUp = useCallback(() => {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
    dragIndexRef.current = null
    setDraggingId(null)
    onReorder(itemsRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleMove])

  function handleDown(e: React.PointerEvent, index: number, id: string) {
    e.preventDefault()
    dragIndexRef.current = index
    setDraggingId(id)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  return (
    <ul>
      {items.map((ex, index) => (
        <ExerciseRow
          key={ex.id}
          exercise={ex}
          rowRef={(el) => {
            if (el) rowRefs.current.set(ex.id, el)
            else rowRefs.current.delete(ex.id)
          }}
          dragging={draggingId === ex.id}
          editing={editingId === ex.id}
          onDragHandleDown={(e) => handleDown(e, index, ex.id)}
          onToggleEdit={() => setEditingId((cur) => (cur === ex.id ? null : ex.id))}
          onUpdate={(patch) => onUpdate(ex, patch)}
          onDelete={() => onDelete(ex)}
        />
      ))}
    </ul>
  )
}

function DragHandleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      {[3, 7, 11].map((cy) => (
        <g key={cy}>
          <circle cx="4" cy={cy} r="1.3" fill="currentColor" />
          <circle cx="10" cy={cy} r="1.3" fill="currentColor" />
        </g>
      ))}
    </svg>
  )
}

function ExerciseRow({
  exercise,
  rowRef,
  dragging,
  editing,
  onDragHandleDown,
  onToggleEdit,
  onUpdate,
  onDelete,
}: {
  exercise: WorkoutTemplateExercise
  rowRef: (el: HTMLLIElement | null) => void
  dragging: boolean
  editing: boolean
  onDragHandleDown: (e: React.PointerEvent) => void
  onToggleEdit: () => void
  onUpdate: (patch: Partial<WorkoutTemplateExercise>) => void
  onDelete: () => void
}) {
  return (
    <li
      ref={rowRef}
      className={`tally-row px-4 py-2.5 flex items-start gap-2 ${dragging ? 'opacity-50' : ''}`}
    >
      <span
        onPointerDown={onDragHandleDown}
        className="mt-0.5 text-muted hover:text-amber shrink-0 cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      >
        <DragHandleIcon />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-ink truncate">{exercise.exercise_name}</p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onToggleEdit} className="text-[11px] text-muted hover:text-amber">
              {editing ? 'เสร็จ' : 'แก้ไข'}
            </button>
            <button onClick={onDelete} className="text-[11px] text-muted hover:text-rust">
              ลบ
            </button>
          </div>
        </div>

        {!editing && (
          <p className="text-[11px] text-muted mt-0.5">
            {exercise.sets ?? '–'} เซ็ต × {exercise.target_reps ?? '–'} reps
            {exercise.target_rir && ` · RIR ${exercise.target_rir}`}
            {exercise.rest && ` · พัก ${exercise.rest}`}
          </p>
        )}
        {!editing && exercise.notes && <p className="text-[11px] text-muted/70 mt-1 italic">{exercise.notes}</p>}

        {editing && (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              <BlurField
                label="เซ็ต"
                value={exercise.sets != null ? String(exercise.sets) : ''}
                onBlur={(v) => onUpdate({ sets: v ? Number(v) : null })}
              />
              <BlurField
                label="Target Reps"
                value={exercise.target_reps ?? ''}
                onBlur={(v) => onUpdate({ target_reps: v || null })}
              />
              <BlurField
                label="Target RIR"
                value={exercise.target_rir ?? ''}
                onBlur={(v) => onUpdate({ target_rir: v || null })}
              />
              <BlurField label="พัก" value={exercise.rest ?? ''} onBlur={(v) => onUpdate({ rest: v || null })} />
            </div>
            <label className="block">
              <span className="block text-[9px] tracked uppercase text-muted mb-0.5">กลุ่มกล้ามเนื้อ</span>
              <select
                value={(exercise.muscle_group as MuscleGroup) ?? 'อื่นๆ'}
                onChange={(e) => onUpdate({ muscle_group: e.target.value })}
                className="w-full bg-surface2 text-ink text-xs rounded px-2 py-1.5 border border-line outline-none focus:border-amber"
              >
                {MUSCLE_GROUPS.map((mg) => (
                  <option key={mg} value={mg}>
                    {mg}
                  </option>
                ))}
              </select>
            </label>
            <BlurTextArea label="Rationale (คำแนะนำในการเล่น)" value={exercise.notes ?? ''} onBlur={(v) => onUpdate({ notes: v || null })} />
          </div>
        )}
      </div>
    </li>
  )
}

function BlurField({ label, value, onBlur }: { label: string; value: string; onBlur: (v: string) => void }) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <label className="block">
      <span className="block text-[9px] tracked uppercase text-muted mb-0.5">{label}</span>
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onBlur(local)}
        className="w-full bg-surface2 text-ink text-xs text-center rounded px-1 py-1.5 border border-line outline-none focus:border-amber"
      />
    </label>
  )
}

function BlurTextArea({ label, value, onBlur }: { label: string; value: string; onBlur: (v: string) => void }) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <label className="block">
      <span className="block text-[9px] tracked uppercase text-muted mb-0.5">{label}</span>
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onBlur(local)}
        rows={2}
        placeholder="เช่น เกร็งแกนกลางลำตัว ควบคุมจังหวะขาลง ไม่ใช้แรงเหวี่ยง"
        className="w-full bg-surface2 text-ink text-xs rounded px-2 py-1.5 border border-line outline-none focus:border-amber resize-none"
      />
    </label>
  )
}

function NewTemplateForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (title: string) => void }) {
  const [title, setTitle] = useState('')
  return (
    <div className="rounded-lg bg-surface border border-line shadow-elevated px-4 py-4 space-y-3">
      <p className="text-sm text-ink font-display tracked uppercase">เทมเพลตใหม่</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="เช่น Push Day"
        className="w-full bg-surface2 text-ink text-sm rounded px-3 py-2 border border-line outline-none focus:border-amber"
      />
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-line text-muted font-display tracked uppercase py-2.5 text-xs">
          ยกเลิก
        </button>
        <button
          onClick={() => title.trim() && onSubmit(title.trim())}
          className="flex-[2] rounded-lg bg-steel text-bg font-display tracked uppercase py-2.5 text-xs active:scale-[0.99]"
        >
          สร้าง แล้วเพิ่มท่า
        </button>
      </div>
    </div>
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
    notes: string
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
  const [notes, setNotes] = useState('')
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('อื่นๆ')
  const [secondaryMuscles, setSecondaryMuscles] = useState<string[]>([])
  const [exerciseLibraryId, setExerciseLibraryId] = useState<string | null>(null)

  return (
    <div className="rounded-lg bg-surface2 border border-line px-3 py-3 space-y-2">
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
        <MiniField label="เซ็ต" value={sets} onChange={setSets} />
        <MiniField label="Target Reps" value={reps} onChange={setReps} />
        <MiniField label="Target RIR" value={rir} onChange={setRir} />
        <MiniField label="พัก" value={rest} onChange={setRest} />
      </div>
      <select
        value={muscleGroup}
        onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}
        className="w-full bg-surface text-ink text-xs rounded px-2 py-2 border border-line outline-none focus:border-amber"
      >
        {MUSCLE_GROUPS.map((mg) => (
          <option key={mg} value={mg}>
            {mg}
          </option>
        ))}
      </select>
      <label className="block">
        <span className="block text-[9px] tracked uppercase text-muted mb-0.5">Rationale (คำแนะนำในการเล่น)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="เช่น เกร็งแกนกลางลำตัว ควบคุมจังหวะขาลง ไม่ใช้แรงเหวี่ยง"
          className="w-full bg-surface text-ink text-xs rounded px-2 py-2 border border-line outline-none focus:border-amber resize-none"
        />
      </label>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-line text-muted font-display tracked uppercase py-2 text-[11px]">
          ยกเลิก
        </button>
        <button
          onClick={() =>
            name.trim() && onSubmit({ name: name.trim(), sets, reps, rir, rest, notes, muscleGroup, secondaryMuscles, exerciseLibraryId })
          }
          className="flex-[2] rounded-lg bg-steel text-bg font-display tracked uppercase py-2 text-[11px] active:scale-[0.99]"
        >
          เพิ่มท่านี้
        </button>
      </div>
    </div>
  )
}

function MiniField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[9px] tracked uppercase text-muted mb-0.5">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface text-ink text-xs text-center rounded px-1 py-1.5 border border-line outline-none focus:border-amber"
      />
    </label>
  )
}
