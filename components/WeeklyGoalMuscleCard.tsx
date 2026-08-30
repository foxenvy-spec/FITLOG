'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange } from '@/lib/dashboardStats'
import { fetchWeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
import { VOLUME_MUSCLES, MUSCLE_GROUP_COLORS } from '@/lib/muscle-groups'
import GoalRing from './GoalRing'
import Skeleton from './Skeleton'
import { COLORS, withAlpha } from '@/lib/theme'

// แถบสรุป "เป้าหมายรายสัปดาห์" แบบมือถือ ตามมอคอัพ: วงแหวนซ้าย (นับกลุ่มกล้ามเนื้อที่ทำเซ็ต
// ครบเป้าแล้วกี่ใน 7 กลุ่ม) + ลิสต์ขวา (จุดสีต่อกลุ่ม + เซ็ตที่ทำแล้ว/เป้าหมาย)
//
// ใช้ query key เดียวกับ WeeklyVolume ('weekly-volume' และ 'weekly-volume-targets') โดยตั้งใจ —
// react-query dedupe คำขอให้อัตโนมัติ ไม่ต้องยิง network ซ้ำสองรอบสำหรับข้อมูลชุดเดียวกัน
export default function WeeklyGoalMuscleCard() {
  const supabase = createClient()
  const { start, end } = getWeekRange()

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

  const { data: targets = null, isLoading: loadingTargets } = useQuery({
    queryKey: ['weekly-volume-targets'],
    queryFn: () => fetchWeeklyVolumeTargets(supabase),
    staleTime: 60_000,
  })

  const loading = loadingSets || loadingTargets || !targets

  if (loading) {
    return (
      <div className="rounded-[20px] bg-surface border border-line shadow-elevated overflow-hidden px-4 py-4">
        <Skeleton className="h-3 w-28 mb-4" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-20 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const rows = VOLUME_MUSCLES.map((mg) => {
    const sets = setsByMuscle[mg] ?? 0
    const target = targets[mg]
    return { mg, sets, target, met: target > 0 && sets >= target }
  })
  const metCount = rows.filter((r) => r.met).length
  const pct = rows.length > 0 ? Math.round((metCount / rows.length) * 100) : 0

  return (
    <div className="rounded-[20px] bg-surface border border-line shadow-elevated overflow-hidden animate-rise">
      <div className="px-4 pt-4 flex items-center justify-between">
        <p className="font-display text-sm tracked uppercase text-ink">เป้าหมายรายสัปดาห์</p>
        {/* ฟีดแบ็ก "'ดูทั้งหมด' ควรเป็น 'ดูรายละเอียดทั้งหมด' — universal กว่า" (สอดคล้องกับ WeeklyVolume.tsx) */}
        <Link href="/stats" className="text-[11px] text-amber hover:underline shrink-0">
          ดูรายละเอียดทั้งหมด →
        </Link>
      </div>
      <div className="px-4 pb-4 pt-3 flex items-center gap-4">
        <div style={{ filter: `drop-shadow(0 0 8px ${withAlpha(COLORS.pink, '88')})` }}>
          <GoalRing
            pct={pct}
            size={92}
            strokeWidth={9}
            color={COLORS.pink}
            valueLabel={`${metCount}/${rows.length}`}
            label="บรรลุเป้าหมาย"
            ariaLabel={`บรรลุเป้าหมายแล้ว ${metCount} จาก ${rows.length} กลุ่มกล้ามเนื้อ`}
          />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          {rows.map(({ mg, sets, target }) => (
            <div key={mg} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs text-ink truncate">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: MUSCLE_GROUP_COLORS[mg] }} />
                {mg}
              </span>
              <span className="font-mono text-xs text-muted shrink-0">
                {sets}/{target}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
