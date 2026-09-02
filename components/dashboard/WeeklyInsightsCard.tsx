'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange, volumeStatus, volumeBucket } from '@/lib/dashboardStats'
import { fetchWeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
import { todayDayOfWeek } from '@/lib/weekdays'
import { VOLUME_MUSCLES } from '@/lib/muscle-groups'
import { COLORS } from '@/lib/theme'
import Skeleton from '@/components/Skeleton'
import PremiumCard from '@/components/ui/PremiumCard'

// ฟีดแบ็ก (Information Hierarchy review) — "Highlights ซ้ำกับ Training This Week (2/3 ครั้ง/56%
// Volume/89% Consistency อยู่บนแล้ว ด้านล่างมี 8 วัน Streak/89% Consistency ซ้ำอีกรอบ) — เปลี่ยนเป็น
// 'Weekly Insights' ที่ระบบวิเคราะห์ให้จริง (Streak + กลุ่มไหนเกิน/ขาดเป้า) แทนตัวเลขซ้ำ" — แทนที่
// HighlightsRow เดิม (Streak/Volume Increase/Consistency — Consistency ซ้ำกับ Training This Week ตรงๆ)
// ด้วยการ์ดนี้ทั้งใบ: Streak (prop จาก data.streak ที่ DashboardView.tsx คำนวณไว้แล้ว ไม่ query ซ้ำ) +
// กลุ่มกล้ามเนื้อที่เกิน/ขาดเป้าหมายสัปดาห์นี้ (self-fetch เช่นเดียวกับ WeeklyVolume.tsx — คนละ query
// จาก fetchDashboardData) — ใช้ volumeBucket()/emoji มาตรฐานเดียวกับ WeeklyVolume.tsx เป๊ะ (lib/
// dashboardStats.ts) กันสี/emoji ไม่ตรงกันข้ามการ์ดแบบที่เคยเจอบั๊กมาก่อนในเซสชันนี้
interface WeeklyInsightsCardProps {
  streak: number
}

function InsightRow({ icon, headline, detail, color }: { icon: string; headline: string; detail: string; color: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-sm leading-none shrink-0 mt-0.5" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold" style={{ color }}>
          {headline}
        </p>
        <p className="text-[12px] text-muted mt-0.5">{detail}</p>
      </div>
    </div>
  )
}

export default function WeeklyInsightsCard({ streak }: WeeklyInsightsCardProps) {
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
  const dayOfWeek1to7 = ((todayDayOfWeek() + 6) % 7) + 1

  const rows = targets
    ? VOLUME_MUSCLES.map((mg) => {
        const sets = setsByMuscle[mg] ?? 0
        const target = targets[mg]
        return { mg, sets, target, diff: sets - target, status: volumeStatus(sets, target, dayOfWeek1to7) }
      })
    : []

  const overTarget = rows.filter((r) => volumeBucket(r.status) === 'over').sort((a, b) => b.diff - a.diff)
  const underTarget = rows.filter((r) => volumeBucket(r.status) === 'under').sort((a, b) => a.diff - b.diff)

  return (
    <PremiumCard className="px-4 py-3.5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] tracked uppercase text-muted">Weekly Insights</p>
        <Link href="/stats" className="text-[12px] font-medium shrink-0" style={{ color: '#E8A33D' }}>
          ดูการวิเคราะห์ทั้งหมด →
        </Link>
      </div>

      <div className="space-y-2.5">
        <InsightRow
          icon="🔥"
          headline={`Streak ${streak} วัน`}
          detail={streak > 0 ? 'ทำต่อเนื่องดีมาก' : 'เริ่มต้นสัปดาห์นี้เลย'}
          color={COLORS.amber}
        />

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : (
          <>
            {overTarget.slice(0, 2).map((r) => (
              <InsightRow
                key={r.mg}
                icon="🟡"
                headline={`${r.mg} +${r.diff} sets`}
                detail={`สูงกว่าเป้าหมาย ควรลด Volume สัปดาห์หน้า`}
                color={COLORS.yellow}
              />
            ))}
            {underTarget.slice(0, 2).map((r) => (
              <InsightRow
                key={r.mg}
                icon="🔴"
                headline={`${r.mg} ${r.diff} sets`}
                detail={`ต่ำกว่าเป้าหมาย ควรเพิ่ม ${r.mg} Volume`}
                color={COLORS.rust}
              />
            ))}
            {overTarget.length === 0 && underTarget.length === 0 && rows.length > 0 && (
              <InsightRow icon="🟢" headline="ทุกกลุ่มกล้ามเนื้ออยู่ในเป้าหมายแล้ว" detail="รักษาจังหวะนี้ไว้ต่อสัปดาห์หน้า" color={COLORS.moss} />
            )}
          </>
        )}
      </div>
    </PremiumCard>
  )
}
