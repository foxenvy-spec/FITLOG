'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import type { Workout } from '@/lib/types'
import { computeExerciseStats, type ExerciseStats } from '@/lib/exerciseStats'
import { useExerciseLibrary } from '@/lib/useExerciseLibrary'
import { MUSCLE_GROUP_COLORS, muscleGroupLabel } from '@/lib/muscle-groups'
import { equipmentLabel, invalidateExerciseLibraryCache } from '@/lib/exerciseLibrary'
import { relativeDayLabel } from '@/lib/dashboardStats'
import { todayStr } from '@/lib/weekdays'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import Skeleton from '@/components/Skeleton'
import ErrorState from '@/components/ErrorState'
import MuscleDiagram from '@/components/MuscleDiagram'

export default function ExerciseDetailPage() {
  const params = useParams<{ name: string }>()
  const router = useRouter()
  const exerciseName = decodeURIComponent(params.name)
  const supabase = createClient()
  const { unit, toDisplay, format } = useWeightUnit()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<ExerciseStats | null>(null)
  const { data: exercises = [], refetch: refetchExercises } = useExerciseLibrary()

  const known = exercises.find((ex) => ex.name === exerciseName || ex.nameTh === exerciseName)

  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // อัปโหลดรูปสาธิตท่านี้ — เก็บไฟล์ใน storage bucket "exercise-images" (public) แล้วเขียน image_url
  // ผ่าน RPC update_exercise_image (ดู supabase/migrations/036_exercise_library_image_upload.sql)
  // เพราะ policy ปกติของ exercise_library อนุญาตแค่แก้ท่า custom ของตัวเอง ท่ามาตรฐานแก้ image_url
  // ตรงๆ ผ่าน client ไม่ได้ ต้องผ่าน RPC ที่จำกัดสิทธิ์ไว้เฉพาะคอลัมน์นี้เท่านั้น
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !known) return
    setUploadError(null)
    setUploadingImage(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setUploadError('กรุณาเข้าสู่ระบบใหม่')
        return
      }
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${known.id}-${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('exercise-images').upload(path, file, { upsert: true })
      if (uploadErr) {
        setUploadError('อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      const { data: pub } = supabase.storage.from('exercise-images').getPublicUrl(path)
      const { error: rpcErr } = await supabase.rpc('update_exercise_image', {
        p_exercise_id: known.id,
        p_image_url: pub.publicUrl,
      })
      if (rpcErr) {
        setUploadError('บันทึกรูปไม่สำเร็จ')
        return
      }
      invalidateExerciseLibraryCache()
      await refetchExercises()
    } finally {
      setUploadingImage(false)
      e.target.value = ''
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await supabase
        .from('workouts')
        .select('*')
        .eq('type', 'strength')
        .eq('exercise_name', exerciseName)
        .order('performed_at', { ascending: true })

      setStats(computeExerciseStats(exerciseName, (data as Workout[]) ?? []))
    } catch (err) {
      console.error('Exercise detail load failed', err)
      Sentry.captureException(err, { tags: { source: 'exercise-detail-page' } })
      setError('ไม่สามารถโหลดสถิติของท่านี้ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
    } finally {
      setLoading(false)
    }
  }, [supabase, exerciseName])

  useEffect(() => {
    load()
  }, [load])

  const color = known ? MUSCLE_GROUP_COLORS[known.muscleGroup] : '#E8A33D'

  return (
    <div className="space-y-5">
      <div>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-xs text-muted hover:text-amber transition mb-2"
        >
          ← กลับ
        </button>
        <div className="flex items-center gap-2.5">
          {known && (
            <span
              className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg"
              style={{ backgroundColor: color + '33' }}
            >
              {known.icon}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-xl tracked uppercase text-ink truncate">{exerciseName}</h1>
            {known && (
              <p className="text-[11px] text-muted">
                <span style={{ color }}>{muscleGroupLabel(known.muscleGroup, 'en')}</span> · {equipmentLabel(known.equipment)}
              </p>
            )}
          </div>
        </div>
      </div>

      {known && (
        <div className="grid grid-cols-2 gap-3">
          <div className="relative w-full aspect-square rounded-xl bg-surface2 overflow-hidden">
            {known.imageUrl ? (
              <Image
                src={known.imageUrl}
                alt={known.name}
                fill
                sizes="(max-width: 768px) 50vw, 300px"
                loading="lazy"
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl opacity-40">{known.icon}</div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              className="absolute bottom-1.5 right-1.5 text-[10px] font-display tracked uppercase bg-bg/80 text-ink border border-line rounded-full px-2.5 py-1 disabled:opacity-50"
            >
              {uploadingImage ? '...' : known.imageUrl ? 'เปลี่ยนรูป' : '+ เพิ่มรูป'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </div>
          {known.highlighterMuscles.length > 0 && (
            <div className="rounded-xl bg-surface2 flex items-center justify-center py-2">
              <MuscleDiagram exerciseName={known.name} highlighterMuscles={known.highlighterMuscles} />
            </div>
          )}
        </div>
      )}
      {uploadError && <p className="text-xs text-rusttext">{uploadError}</p>}

      {error ? (
        <ErrorState title="โหลดข้อมูลท่านี้ไม่สำเร็จ" message={error} onRetry={load} />
      ) : loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg bg-surface border border-line shadow-elevated px-4 py-3.5 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
          <Skeleton className="h-44 w-full rounded-lg" />
        </div>
      ) : stats && stats.totalSessions === 0 ? (
        <p className="text-sm text-muted bg-surface border border-line shadow-elevated rounded-lg px-4 py-8 text-center">
          ยังไม่มีประวัติการฝึกท่านี้ —{' '}
          <a href="/log" className="text-amber hover:underline">
            บันทึกเซ็ตแรก
          </a>
        </p>
      ) : (
        stats && (
          <>
            {/* PR highlight */}
            {(() => {
              const isNewPR = stats.bestWeightDate !== null && stats.bestWeightDate === todayStr()
              const prCardStyle: React.CSSProperties & { '--pr-glow'?: string } = {
                backgroundColor: color + '14',
                borderColor: color + '55',
                '--pr-glow': color + '59',
              }
              return (
                <div className={`rounded-lg border px-4 py-3.5 ${isNewPR ? 'animate-pr-glow' : ''}`} style={prCardStyle}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] tracked uppercase text-muted">🏆 Personal Record</p>
                    {isNewPR && (
                      <span
                        className="animate-pop-in text-[10px] font-display tracked uppercase text-bg rounded-full px-2 py-0.5"
                        style={{ backgroundColor: color }}
                      >
                        🎉 PR ใหม่วันนี้!
                      </span>
                    )}
                  </div>
                  <div className="flex items-end justify-between">
                    <p className="font-mono text-2xl tabular text-ink">
                      {stats.bestWeightKg !== null ? toDisplay(stats.bestWeightKg) : '–'}
                      <span className="text-xs text-muted ml-1">{unit}</span>
                    </p>
                    {stats.bestWeightDate && !isNewPR && (
                      <p className="text-[11px] text-muted">{relativeDayLabel(stats.bestWeightDate)}</p>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* stat grid */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Total Volume" value={Math.round(toDisplay(stats.totalVolumeKg)).toLocaleString('th-TH')} unit={unit} />
              <StatCard
                label="Average Weight"
                value={stats.averageWeightKg !== null ? toDisplay(stats.averageWeightKg).toLocaleString('th-TH') : '–'}
                unit={unit}
              />
              <StatCard label="Estimated 1RM" value={stats.best1RM !== null ? toDisplay(stats.best1RM).toLocaleString('th-TH') : '–'} unit={unit} accent />
              <StatCard label="เซสชันทั้งหมด" value={stats.totalSessions.toString()} unit="ครั้ง" />
            </div>

            {/* progress graph */}
            <section>
              <h2 className="font-display text-sm tracked uppercase text-muted mb-3">Progress Graph (Estimated 1RM)</h2>
              {stats.progressPoints.length > 1 ? (
                <div className="h-48 bg-surface border border-line shadow-elevated rounded-lg p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={stats.progressPoints.map((p) => ({ ...p, oneRM: toDisplay(p.oneRM) }))}
                      margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid stroke="#2E333A" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#9498A0', fontSize: 10 }} axisLine={{ stroke: '#2E333A' }} tickLine={false} />
                      <YAxis tick={{ fill: '#9498A0', fontSize: 10 }} axisLine={false} tickLine={false} width={36} domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{ background: '#1C1F24', border: '1px solid #2E333A', borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: '#9498A0' }}
                        itemStyle={{ color: '#F3F0E8' }}
                        formatter={(v: number) => [`${v} ${unit}`, 'Estimated 1RM']}
                      />
                      <Line type="monotone" dataKey="oneRM" stroke={color} strokeWidth={2} dot={{ r: 2, fill: color }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted bg-surface border border-line shadow-elevated rounded-lg px-4 py-6 text-center">
                  บันทึกท่านี้อีกอย่างน้อย 2 ครั้งเพื่อดูแนวโน้ม
                </p>
              )}
              <p className="text-[11px] text-muted mt-2">คำนวณด้วยสูตร Epley: น้ำหนัก × (1 + reps/30) — เป็นค่าประมาณ ไม่ใช่ค่าวัดจริง</p>
            </section>

            {/* last 10 sessions */}
            <section>
              <h2 className="font-display text-sm tracked uppercase text-muted mb-3">Last 10 Sessions</h2>
              <ul className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
                {stats.last10Sessions.map((s) => (
                  <li key={s.id} className="tally-row flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        {s.sets ?? '–'}×{s.reps ?? '–'} @ {format(s.weightKg)}
                      </p>
                      <p className="text-[11px] text-muted mt-0.5">{relativeDayLabel(s.date)}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-mono text-sm text-ink">{Math.round(toDisplay(s.volumeKg)).toLocaleString('th-TH')}{unit}</p>
                      {s.estimated1RM !== null && (
                        <p className="text-[10px] text-muted">1RM ≈ {format(s.estimated1RM)}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <a
              href={`/history?exercise=${encodeURIComponent(exerciseName)}`}
              className="block text-center text-xs tracked uppercase text-muted hover:text-amber transition py-2"
            >
              ดูประวัติทั้งหมดของท่านี้ →
            </a>
          </>
        )
      )}
    </div>
  )
}

function StatCard({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: boolean }) {
  return (
    <div className="bg-surface border border-line shadow-elevated rounded-lg px-4 py-3.5">
      <p className="text-[11px] tracked uppercase text-muted mb-1">{label}</p>
      <p className={`font-mono text-2xl tabular ${accent ? 'text-amber' : 'text-ink'}`}>
        {value}
        <span className="text-xs text-muted ml-1">{unit}</span>
      </p>
    </div>
  )
}
