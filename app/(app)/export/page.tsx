'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import type { Workout, BodyMetric, Goal, WorkoutSet } from '@/lib/types'
import PremiumCard from '@/components/ui/PremiumCard'
import { getErrorMessage } from '@/lib/errors'

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

function timestamp() {
  return new Date().toISOString().slice(0, 10)
}

export default function ExportPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restoreSummary, setRestoreSummary] = useState<string | null>(null)

  // บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจค): เดิม fetchAll ไม่ดึงตาราง workout_sets เลย (ข้อมูลจริงราย "เซ็ต" เช่น
  // drop set ที่แต่ละเซ็ตน้ำหนัก/reps ไม่เท่ากัน — workouts.sets/reps/weight_kg เก็บแค่ค่า "เซ็ตที่หนักที่สุด"
  // เซ็ตเดียวเป็น fallback สำหรับแถวเก่า ดูคอมเมนต์ที่ Workout.total_volume_kg ใน lib/types.ts) ทำให้
  // Export/Backup ไม่มีข้อมูลนี้ติดไปด้วยเลย พอ Restore กลับมา หน้าที่เรนเดอร์เวิร์กเอาต์ (ExerciseCard.tsx)
  // จะ synthesize เซ็ตปลอมจากค่าเฉลี่ยแทนของจริง — ข้อมูลเสียหายเงียบๆ ตอน backup/restore — เพิ่มดึงมาด้วย
  async function fetchAll() {
    const [wRes, bRes, gRes, sRes] = await Promise.all([
      supabase.from('workouts').select('*').order('performed_at', { ascending: false }),
      supabase.from('body_metrics').select('*').order('measured_at', { ascending: false }),
      supabase.from('goals').select('*').order('created_at', { ascending: false }),
      supabase.from('workout_sets').select('*').order('set_number', { ascending: true }),
    ])
    // ต้องเช็ค error ของทั้ง 4 ตารางก่อน ไม่งั้นถ้าตารางไหน query พังจะได้ data เป็น null เงียบๆ
    // แล้วไฟล์ export/backup ออกมาเป็น "ชีตว่าง" ทั้งที่จริงข้อมูลมีอยู่ — ผู้ใช้เข้าใจผิดว่าไม่มีข้อมูล
    // หรือแย่กว่านั้นคือ backup ไฟล์ที่ดูเหมือนสมบูรณ์แต่ขาดข้อมูลไปเงียบๆ
    if (wRes.error) throw new Error(`workouts: ${wRes.error.message}`)
    if (bRes.error) throw new Error(`body_metrics: ${bRes.error.message}`)
    if (gRes.error) throw new Error(`goals: ${gRes.error.message}`)
    if (sRes.error) throw new Error(`workout_sets: ${sRes.error.message}`)
    return {
      workouts: (wRes.data as Workout[]) ?? [],
      bodyMetrics: (bRes.data as BodyMetric[]) ?? [],
      goals: (gRes.data as Goal[]) ?? [],
      workoutSets: (sRes.data as WorkoutSet[]) ?? [],
    }
  }

  async function handleExportExcel() {
    setBusy('excel')
    setError(null)
    setMessage(null)
    try {
      const { workouts, bodyMetrics, goals, workoutSets } = await fetchAll()
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(workouts), 'Workouts')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(workoutSets), 'WorkoutSets')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bodyMetrics), 'BodyMetrics')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(goals), 'Goals')
      XLSX.writeFile(wb, `fitlog-export-${timestamp()}.xlsx`)
      setMessage('ดาวน์โหลดไฟล์ Excel แล้ว')
    } catch (err) {
      setError(`Export ไม่สำเร็จ: ${getErrorMessage(err)}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleExportCsv() {
    setBusy('csv')
    setError(null)
    setMessage(null)
    try {
      const { workouts } = await fetchAll()
      const ws = XLSX.utils.json_to_sheet(workouts)
      const csv = XLSX.utils.sheet_to_csv(ws)
      downloadBlob('\uFEFF' + csv, `fitlog-workouts-${timestamp()}.csv`, 'text/csv;charset=utf-8')
      setMessage('ดาวน์โหลดไฟล์ CSV แล้ว (เฉพาะรายการออกกำลังกาย)')
    } catch (err) {
      setError(`Export ไม่สำเร็จ: ${getErrorMessage(err)}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleBackup() {
    setBusy('backup')
    setError(null)
    setMessage(null)
    try {
      const data = await fetchAll()
      // version 2: เพิ่ม workoutSets เข้ามาในไฟล์ backup (ดูคอมเมนต์ที่ fetchAll ด้านบน) — handleRestoreFile
      // เช็คแบบ optional (parsed.workoutSets?.length) อยู่แล้ว ไฟล์ backup version 1 เก่า (ไม่มีฟิลด์นี้)
      // ยัง Restore ได้ปกติ แค่ไม่มีข้อมูลราย-เซ็ตให้กู้คืน (เพราะไฟล์เก่าไม่เคยมีข้อมูลนี้ตั้งแต่แรก)
      const payload = { version: 2, exportedAt: new Date().toISOString(), ...data }
      downloadBlob(JSON.stringify(payload, null, 2), `fitlog-backup-${timestamp()}.json`, 'application/json')
      setMessage('ดาวน์โหลดไฟล์ Backup แล้ว เก็บไว้ในที่ปลอดภัย')
    } catch (err) {
      setError(`Backup ไม่สำเร็จ: ${getErrorMessage(err)}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy('restore')
    setError(null)
    setMessage(null)
    setRestoreSummary(null)

    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as {
        workouts?: Partial<Workout>[]
        bodyMetrics?: Partial<BodyMetric>[]
        goals?: Partial<Goal>[]
        workoutSets?: Partial<WorkoutSet>[]
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('กรุณาเข้าสู่ระบบใหม่')
        return
      }

      let restoredWorkouts = 0
      let restoredMetrics = 0
      let restoredGoals = 0
      let restoredSets = 0

      if (parsed.workouts && parsed.workouts.length > 0) {
        const rows = parsed.workouts.map(({ id, created_at, ...rest }) => ({ ...rest, user_id: user.id }))
        const { error: wErr, data } = await supabase.from('workouts').insert(rows).select('id')
        if (wErr) throw new Error(`workouts: ${wErr.message}`)
        restoredWorkouts = data?.length ?? rows.length

        // บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจค): เดิม Restore ไม่กู้คืน workout_sets เลย (ข้อมูลจริงราย-เซ็ต เช่น
        // drop set ที่แต่ละเซ็ตน้ำหนัก/reps ไม่เท่ากัน) แถว workouts ใหม่ได้ id ใหม่จาก DB (ไม่ใช่ id เดิมใน
        // ไฟล์ backup) จึงต้อง map "id เดิมในไฟล์ -> id ใหม่ที่เพิ่ง insert" ก่อน ถึงจะรู้ว่า workout_sets
        // แต่ละแถวควรผูกกับ workout แถวไหนใน DB จริง — Postgres คืนแถวจาก INSERT...RETURNING เรียงตามลำดับ
        // ที่ส่งเข้าไปเสมอ (VALUES หลายแถวในคำสั่งเดียว ไม่มี trigger สลับลำดับ) จึง zip ตาม index ได้ตรงกัน
        if (parsed.workoutSets && parsed.workoutSets.length > 0 && data) {
          const oldIdToNewId = new Map<string, string>()
          parsed.workouts.forEach((w, i) => {
            if (w.id && data[i]) oldIdToNewId.set(w.id, data[i].id)
          })
          const setRows = parsed.workoutSets
            .filter((s) => s.workout_id && oldIdToNewId.has(s.workout_id))
            .map(({ id, created_at, workout_id, ...rest }) => ({
              ...rest,
              workout_id: oldIdToNewId.get(workout_id as string)!,
              user_id: user.id,
            }))
          if (setRows.length > 0) {
            const { error: setErr, data: setData } = await supabase.from('workout_sets').insert(setRows).select('id')
            if (setErr) throw new Error(`workout_sets: ${setErr.message}`)
            restoredSets = setData?.length ?? setRows.length
          }
        }
      }

      if (parsed.bodyMetrics && parsed.bodyMetrics.length > 0) {
        const rows = parsed.bodyMetrics.map(({ id, created_at, ...rest }) => ({ ...rest, user_id: user.id }))
        const { error: bErr, data } = await supabase.from('body_metrics').insert(rows).select('id')
        if (bErr) throw new Error(`body_metrics: ${bErr.message}`)
        restoredMetrics = data?.length ?? rows.length
      }

      if (parsed.goals && parsed.goals.length > 0) {
        const rows = parsed.goals.map(({ id, created_at, ...rest }) => ({ ...rest, user_id: user.id }))
        const { error: gErr, data } = await supabase.from('goals').insert(rows).select('id')
        if (gErr) throw new Error(`goals: ${gErr.message}`)
        restoredGoals = data?.length ?? rows.length
      }

      setRestoreSummary(
        `กู้คืนสำเร็จ: ออกกำลังกาย ${restoredWorkouts} รายการ (${restoredSets} เซ็ต) · ข้อมูลร่างกาย ${restoredMetrics} รายการ · เป้าหมาย ${restoredGoals} รายการ`
      )
    } catch (err) {
      setError(`Restore ไม่สำเร็จ: ${getErrorMessage(err)} — ตรวจสอบว่าไฟล์เป็น Backup JSON ของ FitLog`)
    } finally {
      setBusy(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6 lg:max-w-2xl lg:mx-auto">
      <div>
        <h1 className="font-display text-2xl tracked uppercase">Export & Backup</h1>
        <p className="text-sm text-muted mt-1">ดาวน์โหลดข้อมูลของคุณ หรือสำรอง/กู้คืนข้อมูลทั้งหมด</p>
      </div>

      {error && <p className="text-sm text-rusttext">{error}</p>}
      {message && <p className="text-sm text-steel">{message}</p>}
      {restoreSummary && <p className="text-sm text-steel">{restoreSummary}</p>}

      <PremiumCard as="section" className="divide-y divide-white/5">
        <SectionRow
          title="Export เป็น Excel"
          desc="ทุกตาราง (ออกกำลังกาย / ข้อมูลร่างกาย / เป้าหมาย) ในไฟล์เดียว หลายชีต"
          buttonLabel="ดาวน์โหลด .xlsx"
          busy={busy === 'excel'}
          onClick={handleExportExcel}
        />
        <SectionRow
          title="Export เป็น CSV"
          desc="เฉพาะรายการออกกำลังกาย เปิดใน Google Sheets ได้เลย"
          buttonLabel="ดาวน์โหลด .csv"
          busy={busy === 'csv'}
          onClick={handleExportCsv}
        />
      </PremiumCard>

      <PremiumCard as="section" className="divide-y divide-white/5">
        <SectionRow
          title="Backup ข้อมูลทั้งหมด"
          desc="ไฟล์ .json สำรองข้อมูลไว้ กู้คืนกลับมาได้ภายหลัง"
          buttonLabel="Backup"
          busy={busy === 'backup'}
          onClick={handleBackup}
        />
        <div className="px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-ink">Restore จากไฟล์ Backup</p>
            <p className="text-[12px] text-muted mt-0.5">
              เพิ่มข้อมูลจากไฟล์เข้ามาต่อท้ายของเดิม (ไม่ลบของเดิม) รองรับเฉพาะ ออกกำลังกาย/ข้อมูลร่างกาย/เป้าหมาย —
              ยังไม่รวมโปรแกรมประจำสัปดาห์
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleRestoreFile}
            className="hidden"
            id="restore-upload"
          />
          <label
            htmlFor="restore-upload"
            className="shrink-0 cursor-pointer text-xs font-display tracked uppercase text-bg bg-amber rounded-lg px-4 py-2 transition active:scale-[0.98] hover:opacity-90"
          >
            {busy === 'restore' ? '...' : 'Restore'}
          </label>
        </div>
      </PremiumCard>
    </div>
  )
}

function SectionRow({
  title,
  desc,
  buttonLabel,
  busy,
  onClick,
}: {
  title: string
  desc: string
  buttonLabel: string
  busy: boolean
  onClick: () => void
}) {
  return (
    <div className="px-4 py-3.5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-ink">{title}</p>
        <p className="text-[12px] text-muted mt-0.5">{desc}</p>
      </div>
      <button
        onClick={onClick}
        disabled={busy}
        className="shrink-0 text-xs font-display tracked uppercase text-bg bg-steel rounded-lg px-4 py-2 transition active:scale-[0.98] hover:opacity-90 disabled:opacity-50 disabled:active:scale-100"
      >
        {busy ? '...' : buttonLabel}
      </button>
    </div>
  )
}
