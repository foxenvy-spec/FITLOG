'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange, getPreviousWeekRange, recoveryTier } from '@/lib/dashboardStats'
import GoalRing from './GoalRing'
import Skeleton from './Skeleton'
import { COLORS } from '@/lib/theme'

type VolumeRow = { performed_at: string; sets: number | null; reps: number | null; weight_kg: number | null; total_volume_kg: number | null }

// สูตรเดียวกับ computeTodayTotals (lib/dashboardStats.ts) — ใช้ total_volume_kg ถ้ามี
// ไม่งั้นคำนวณจาก sets*reps*weight_kg แทน
function rowVolume(w: VolumeRow): number {
  if (w.total_volume_kg != null) return w.total_volume_kg
  if (w.sets && w.reps && w.weight_kg) return w.sets * w.reps * w.weight_kg
  return 0
}

async function fetchWeekVolume(supabase: ReturnType<typeof createClient>, start: string, end: string): Promise<VolumeRow[]> {
  const { data } = await supabase
    .from('workouts')
    .select('performed_at, sets, reps, weight_kg, total_volume_kg')
    .eq('type', 'strength')
    .gte('performed_at', start)
    .lte('performed_at', end)
  return (data as VolumeRow[]) ?? []
}

// v49: เดิม hardcode เกณฑ์ของตัวเอง (80/60/40 — คนละรอยต่อกับ recoveryStatusColor ที่ใช้ 76/41 ตอนนั้น)
// ดึงจาก recoveryTier() (lib/dashboardStats.ts) แทน ให้เกณฑ์+ป้ายตรงกับทุกจุดที่ใช้ recovery tier จริง
function recoveryScoreLabel(pct: number): string {
  return recoveryTier(pct).labelTh
}

interface WeeklyVolumeRecoveryCardProps {
  // ใช้ overallRecoveryPct ที่คำนวณไว้แล้วใน MobileDashboardView (เฉลี่ย recovery % ทุกกลุ่มกล้ามเนื้อ)
  // แทนที่จะคำนวณซ้ำ/ยิง query recovery ใหม่ในนี้อีกชุด
  recoveryPct: number
}

// การ์ดคู่ Weekly Volume + Recovery Score ตามมอคอัพ — วอลุ่มรวม kg สัปดาห์นี้ +
// % เทียบสัปดาห์ที่แล้ว + กราฟแท่งจิ๋วรายวัน คู่กับ Recovery Score เป็นวงแหวน
export default function WeeklyVolumeRecoveryCard({ recoveryPct }: WeeklyVolumeRecoveryCardProps) {
  const supabase = createClient()
  const { start, end } = getWeekRange()
  const { start: prevStart, end: prevEnd } = getPreviousWeekRange()

  const { data: thisWeekRows, isLoading: loadingThis } = useQuery({
    queryKey: ['weekly-total-volume', start, end],
    queryFn: () => fetchWeekVolume(supabase, start, end),
    staleTime: 60_000,
  })
  const { data: lastWeekRows, isLoading: loadingLast } = useQuery({
    queryKey: ['weekly-total-volume-prev', prevStart, prevEnd],
    queryFn: () => fetchWeekVolume(supabase, prevStart, prevEnd),
    staleTime: 60_000,
  })

  const loading = loadingThis || loadingLast || !thisWeekRows || !lastWeekRows

  if (loading) {
    return (
      <div className="rounded-[20px] bg-surface border border-line shadow-elevated overflow-hidden px-4 py-4">
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-6 w-32 mb-4" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  const totalThisWeek = thisWeekRows.reduce((sum, w) => sum + rowVolume(w), 0)
  const totalLastWeek = lastWeekRows.reduce((sum, w) => sum + rowVolume(w), 0)
  const pctChange = totalLastWeek > 0 ? Math.round(((totalThisWeek - totalLastWeek) / totalLastWeek) * 100) : null

  // แท่งจิ๋วรายวัน จ-อา ของสัปดาห์นี้
  const dailyTotals = Array.from({ length: 7 }, () => 0)
  thisWeekRows.forEach((w) => {
    const d = new Date(w.performed_at + (w.performed_at.length <= 10 ? 'T00:00:00' : ''))
    const dow = (d.getDay() + 6) % 7 // จ=0..อา=6
    dailyTotals[dow] += rowVolume(w)
  })
  const maxDaily = Math.max(1, ...dailyTotals)

  const recoveryLabel = recoveryScoreLabel(recoveryPct)
  const recoveryColor = recoveryPct >= 80 ? COLORS.moss : recoveryPct >= 60 ? COLORS.cyan : recoveryPct >= 40 ? COLORS.amber : COLORS.rust

  return (
    <div className="rounded-[20px] bg-surface border border-line shadow-elevated overflow-hidden animate-rise">
      <div className="grid grid-cols-2 divide-x divide-line">
        {/* Weekly Volume */}
        <div className="px-4 py-4">
          <p className="text-[10px] tracked uppercase text-muted">Weekly Volume</p>
          <p className="font-mono text-lg text-ink mt-1.5">
            {Math.round(totalThisWeek).toLocaleString()} <span className="text-xs text-muted">kg</span>
          </p>
          {pctChange != null && (
            <p className="text-[11px] mt-0.5" style={{ color: pctChange >= 0 ? COLORS.deltaGood : COLORS.rust }}>
              {pctChange >= 0 ? '↑' : '↓'}{Math.abs(pctChange)}% จากสัปดาห์ที่แล้ว
            </p>
          )}
          <div className="flex items-end gap-1 mt-3 h-8">
            {dailyTotals.map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm"
                style={{
                  height: `${Math.max(8, (v / maxDaily) * 100)}%`,
                  backgroundColor: COLORS.steel,
                  opacity: v > 0 ? 1 : 0.25,
                }}
              />
            ))}
          </div>
        </div>

        {/* Recovery Score */}
        <div className="px-4 py-4">
          <p className="text-[10px] tracked uppercase text-muted">Recovery Score</p>
          <div className="flex items-center gap-3 mt-1.5">
            <div style={{ filter: `drop-shadow(0 0 8px ${recoveryColor}88)` }}>
              <GoalRing pct={recoveryPct} size={56} strokeWidth={6} color={recoveryColor} valueLabel="" ariaLabel={`Recovery Score ${recoveryPct} จาก 100`} />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-lg text-ink leading-none">
                {recoveryPct}<span className="text-xs text-muted">/100</span>
              </p>
              <p className="text-[11px] mt-1" style={{ color: recoveryColor }}>{recoveryLabel}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
