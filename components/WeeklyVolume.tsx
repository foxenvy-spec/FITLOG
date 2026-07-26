'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange, volumeStatus, type VolumeStatus } from '@/lib/dashboardStats'
import { fetchWeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
import { todayDayOfWeek } from '@/lib/weekdays'
import { VOLUME_MUSCLES } from '@/lib/muscle-groups'
import AnimatedBarFill from './AnimatedBarFill'
import Skeleton from './Skeleton'
import VolumeTargetsSettings from './VolumeTargetsSettings'

const STATUS_COLOR: Record<VolumeStatus, string> = {
  behind: '#C1503A', // rust — ตามหลัง
  onTrack: '#E8A33D', // amber — กำลังไปได้ดี
  met: '#7A9B57', // moss — ถึงเป้าหมายแล้ว (รวมถึงทำเกินเป้าด้วย)
}

export default function WeeklyVolume() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { start, end } = getWeekRange()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const { data: setsByMuscle = {}, isLoading: loadingSets } = useQuery({
    queryKey: ['weekly-volume', start, end],
    queryFn: async () => {
      const { data } = await supabase
        .from('workouts')
        .select('muscle_group, sets')
        .eq('type', 'strength')
        .gte('performed_at', start)
        .lte('performed_at', end)

      const totals: Record<string, number> = {}
      ;((data as { muscle_group: string | null; sets: number | null }[]) ?? []).forEach((r) => {
        if (!r.muscle_group) return
        totals[r.muscle_group] = (totals[r.muscle_group] ?? 0) + (r.sets ?? 0)
      })
      return totals
    },
    staleTime: 60_000,
  })

  // เป้าหมายของผู้ใช้เอง (ตั้งได้ต่อคนใน weekly_volume_targets) — ถ้ายังไม่เคยตั้ง จะได้ค่า
  // default กลับมาแทน (ดู lib/weeklyVolumeTargets.ts)
  const { data: targets = null, isLoading: loadingTargets } = useQuery({
    queryKey: ['weekly-volume-targets'],
    queryFn: () => fetchWeeklyVolumeTargets(supabase),
    staleTime: 60_000,
  })

  const loading = loadingSets || loadingTargets || !targets

  const dayOfWeek1to7 = ((todayDayOfWeek() + 6) % 7) + 1
  const maxSets = targets
    ? Math.max(1, ...VOLUME_MUSCLES.map((mg) => setsByMuscle[mg] ?? 0), ...Object.values(targets))
    : 1

  const rows = targets
    ? VOLUME_MUSCLES.map((mg) => {
        const sets = setsByMuscle[mg] ?? 0
        const target = targets[mg]
        const status = volumeStatus(sets, target, dayOfWeek1to7)
        return { mg, sets, target, status }
      })
    : []

  return (
    <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] tracked uppercase text-muted">Weekly Volume</p>
          <p className="font-display text-base tracked uppercase text-ink mt-0.5">เซ็ตต่อกลุ่มกล้ามเนื้อ (สัปดาห์นี้)</p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="text-[11px] text-muted hover:text-ink border border-line rounded px-2 py-1 mt-0.5 shrink-0"
        >
          ตั้งเป้าหมาย
        </button>
      </div>

      <div className="px-4 pb-2 space-y-1.5">
        {loading ? (
          VOLUME_MUSCLES.map((mg) => (
            <div key={mg} className="rounded-md bg-surface2 px-2.5 py-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-14" />
              </div>
            </div>
          ))
        ) : (
          rows.map(({ mg, sets, target, status }) => {
            const barPct = Math.min(100, (sets / maxSets) * 100)
            const targetPct = Math.min(100, (target / maxSets) * 100)
            const pct = target > 0 ? Math.round((sets / target) * 100) : 0
            const diff = sets - target
            const color = STATUS_COLOR[status]
            // แถวย่อ ๆ บรรทัดเดียว: จุดสี + ชื่อ + จำนวนเซ็ต/เป้าหมาย + เส้นคั่นบาง ๆ + ป้ายสถานะ
            // (met -> +diff, onTrack -> เปอร์เซ็นต์, behind -> -diff) — แถบ progress และคำอธิบาย
            // จะโผล่มาเฉพาะตอนกด "ดูรายละเอียดทั้งหมด" เท่านั้น
            // ไฮไลต์พื้นหลังเขียวจาง ๆ เฉพาะแถวที่ทำถึง/เกินเป้าหมายแล้ว (status === 'met') ให้เด่น
            // ส่วนแถวอื่นไม่มีพื้นหลัง (ตามการ์ดต้นแบบ) เพื่อไม่ให้แน่นเกินไป
            return (
              <div
                key={mg}
                className={status === 'met' ? 'rounded-md' : 'rounded-md bg-surface2'}
                style={status === 'met' ? { backgroundColor: `${color}1A` } : undefined}
              >
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-xs text-ink flex-1 min-w-0">{mg}</span>
                  <span className="text-[11px] font-mono text-muted shrink-0">
                    {sets}
                    <span className="text-muted/60"> / {target} เซ็ต</span>
                  </span>
                  <span className="w-px h-4 bg-line shrink-0" />
                  <span className="text-[11px] font-mono font-bold shrink-0 w-14 text-right" style={{ color }}>
                    {status === 'behind' ? `${diff} เซ็ต` : status === 'met' && diff > 0 ? `+${diff} เซ็ต` : `${pct}%`}
                  </span>
                </div>
                {detailsOpen && (
                  <div className="px-2.5 pb-2 space-y-1">
                    <span className="relative block h-1.5 rounded-full bg-bg/60 overflow-hidden">
                      <AnimatedBarFill pct={barPct} color={color} />
                      <div
                        className="absolute top-0 h-full w-px bg-ink/40"
                        style={{ left: `${targetPct}%` }}
                        title={`เป้าหมาย ${target} เซ็ต/สัปดาห์`}
                      />
                    </span>
                    <p className="text-[11px]" style={{ color }}>
                      {status === 'met'
                        ? diff > 0
                          ? 'ยอดเยี่ยม'
                          : 'ถึงเป้าหมายพอดี'
                        : `อีก ${target - sets} เซ็ตถึงเป้าหมาย`}
                    </p>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {!loading && (
        <div className="px-4 pb-3.5 flex justify-end">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="text-[11px] font-medium"
            style={{ color: '#E8A33D' }}
          >
            {detailsOpen ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียดทั้งหมด'} {detailsOpen ? '↑' : '→'}
          </button>
        </div>
      )}

      {targets && (
        <VolumeTargetsSettings
          open={settingsOpen}
          targets={targets}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['weekly-volume-targets'] })
            // 'dashboard' query's weeklyGoalPct also depends on these targets — invalidate by
            // key prefix rather than the exact ['dashboard', today] key, since this component
            // doesn't know today's date string.
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            setSettingsOpen(false)
          }}
        />
      )}
    </div>
  )
}
