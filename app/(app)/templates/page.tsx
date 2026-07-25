'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { WorkoutTemplate, WorkoutTemplateExercise } from '@/lib/types'
import { MUSCLE_GROUPS, type MuscleGroup } from '@/lib/muscle-groups'
import { todayStr } from '@/lib/weekdays'
import { parseRangeToNumber, rirToRpe } from '@/lib/importWorkoutExcel'
import ExercisePicker from '@/components/ExercisePicker'
import type { ExerciseDef } from '@/lib/exercises'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'

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

  if (loading) return <LoadingState />
  if (loadError) return <ErrorState title="โหลดเทมเพลตไม่สำเร็จ" message={loadError} onRetry={load} />

  return (
    <div className="space-y-6 lg:max-w-3xl lg:mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl tracked uppercase">เทมเพลต</h1>
          <p className="text-sm text-muted mt-1">กดเริ่มได้ทุกเมื่อ ไม่ผูกกับวันในสัปดาห์</p>
        </div>
        <div className="flex gap-3 shrink-0">
          <a href="/exercises" className="text-xs font-display tracked uppercase text-muted hover:text-amber transition">
            🔍 ฐานข้อมูลท่า
          </a>
          <a href="/history" className="text-xs font-display tracked uppercase text-muted hover:text-amber transition">
            ดูประวัติ →
          </a>
        </div>
      </div>

      {error && <p className="text-sm text-rusttext">{error}</p>}
      {startMessage && <p className="text-sm text-steel">{startMessage}</p>}

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

      {templates.map((t) => {
          const exercises = exercisesByTemplate[t.id] ?? []
          const expanded = expandedId === t.id
          return (
            <div key={t.id} className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-2">
                <button onClick={() => setExpandedId(expanded ? null : t.id)} className="min-w-0 text-left flex-1">
                  <p className="text-sm text-ink font-display tracked uppercase truncate">{t.title}</p>
                  <p className="text-[11px] text-muted">{exercises.length} ท่า</p>
                </button>
                <button
                  onClick={() => handleStart(t)}
                  disabled={startingId === t.id || exercises.length === 0}
                  className="shrink-0 text-xs font-display tracked uppercase text-bg bg-amber rounded-lg px-4 py-2 active:scale-[0.99] disabled:opacity-40"
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
                  <div className="px-4 py-3 border-t border-line flex items-center justify-between">
                    <button
                      onClick={() => setAddingToId(t.id)}
                      className="text-xs font-display tracked uppercase text-muted hover:text-amber transition"
                    >
                      + เพิ่มท่า
                    </button>
                    <button onClick={() => handleDeleteTemplate(t.id)} className="text-xs text-muted hover:text-rust transition">
                      ลบเทมเพลตนี้
                    </button>
                  </div>
                  {addingToId === t.id && (
                    <div className="px-4 pb-4">
                      <AddExerciseForm onCancel={() => setAddingToId(null)} onSubmit={(fields) => handleAddExercise(t.id, fields)} />
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}

      {templates.length > 0 && !creating && (
        <button
          onClick={() => setCreating(true)}
          className="w-full rounded-lg border border-line border-dashed text-muted font-display tracked uppercase py-3 text-sm hover:text-amber transition"
        >
          + เทมเพลตใหม่
        </button>
      )}

      {creating && <NewTemplateForm onCancel={() => setCreating(false)} onSubmit={handleCreateTemplate} />}
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
