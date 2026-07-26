'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange, volumeStatus, type VolumeStatus, computeMuscleBalance, balanceStatusTier, BALANCE_STATUS_LABEL } from '@/lib/dashboardStats'
import { fetchWeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
import { todayDayOfWeek } from '@/lib/weekdays'
import { VOLUME_MUSCLES } from '@/lib/muscle-groups'
import AnimatedBarFill from './AnimatedBarFill'
import Skeleton from './Skeleton'
import VolumeTargetsSettings from './VolumeTargetsSettings'

// ลำดับแสดงผล — จัดให้ตรงกับ Graphic Muscle Heatmap (อก, หลัง, ไหล่, แขน, แกนกลางลำตัว, ขา, น่อง)
// แยกจาก VOLUME_MUSCLES ตัวหลัก (ซึ่งใช้ลำดับอื่นและถูกอ้างจากหลายที่ในแอป) เพื่อไม่กระทบจุดอื่น
const DISPLAY_ORDER = ['อก', 'หลัง', 'ไหล่', 'แขน', 'แกนกลางลำตัว', 'ขา', 'น่อง'] as const

const STATUS_COLOR: Record<VolumeStatus, string> = {
  behind: '#C1503A', // rust — ตามหลัง
  onTrack: '#E8A33D', // amber — กำลังไปได้ดี
  met: '#7A9B57', // moss — ถึงเป้าหมายแล้ว (รวมถึงทำเกินเป้าด้วย)
}

// สีของแถบสรุป Balance Score ด้านล่างการ์ด (มาแทนที่การ์ด MuscleShareCard เดิมที่ถูกลบไปเพราะ
// ซ้ำซ้อนกัน — ใช้โทนสีเดียวกับ STATUS_COLOR ด้านบนเพื่อความสม่ำเสมอ)
const BALANCE_TIER_COLOR = {
  good: '#7A9B57', // moss
  ok: '#E8A33D', // amber
  poor: '#C1503A', // rust
} as const

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
    ? DISPLAY_ORDER.map((mg) => {
        const sets = setsByMuscle[mg] ?? 0
        const target = targets[mg]
        const status = volumeStatus(sets, target, dayOfWeek1to7)
        return { mg, sets, target, status }
      })
    : []

  // สรุปท้ายการ์ด (แทนที่การ์ด MuscleShareCard เดิม ซึ่งซ้ำซ้อนกับการ์ดนี้ — ทั้งคู่คำนวณจาก
  // เซ็ตต่อกลุ่มกล้ามเนื้อสัปดาห์นี้ชุดเดียวกัน) — รวมเซ็ตทั้งหมด + Balance Score
  const totalSets = rows.reduce((sum, r) => sum + r.sets, 0)
  const balanceScore = totalSets > 0 ? computeMuscleBalance(rows.map((r) => (r.sets / totalSets) * 100)) : 0
  const balanceTier = balanceStatusTier(balanceScore)
  const balanceColor = BALANCE_TIER_COLOR[balanceTier]

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
          DISPLAY_ORDER.map((mg) => (
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
        <div className="px-4 pb-3.5">
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-line/60">
            <div className="text-center">
              <p className="font-mono text-sm text-ink">
                {totalSets} <span className="text-[10px] text-muted font-sans">เซ็ต</span>
              </p>
              <p className="text-[10px] text-muted mt-0.5">รวมสัปดาห์นี้</p>
            </div>
            <div className="text-center">
              <p className="font-mono text-sm text-ink">
                {balanceScore} <span className="text-[10px] text-muted font-sans">/100</span>
              </p>
              <p className="text-[10px] text-muted mt-0.5">Balance Score</p>
            </div>
            <div className="text-center">
              <p className="font-display text-xs tracked uppercase" style={{ color: balanceColor }}>
                {BALANCE_STATUS_LABEL[balanceTier]}
              </p>
              <p className="text-[10px] text-muted mt-0.5">สถานะ</p>
            </div>
          </div>

          <div className="flex justify-end mt-2.5">
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              className="text-[11px] font-medium"
              style={{ color: '#E8A33D' }}
            >
              {detailsOpen ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียดทั้งหมด'} {detailsOpen ? '↑' : '→'}
            </button>
          </div>
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
