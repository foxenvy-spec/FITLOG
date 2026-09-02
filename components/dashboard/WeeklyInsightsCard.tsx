'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange, volumeStatus } from '@/lib/dashboardStats'
import { fetchWeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
import { todayDayOfWeek } from '@/lib/weekdays'
import { VOLUME_MUSCLES } from '@/lib/muscle-groups'
import { COLORS } from '@/lib/theme'
import Skeleton from '@/components/Skeleton'
import PremiumCard from '@/components/ui/PremiumCard'

// ฟีดแบ็ก (Information Hierarchy review) — "Weekly Volume/Muscle Balance เป็นตัวเลขดิบ ผู้ใช้ต้องคิดเอง
// ว่าดีหรือไม่ดี ควรให้ระบบสรุปเป็น insight ที่ actionable เลย (Insight > Data)" — แทนที่การ์ด
// WeeklyVolume (ตารางเซ็ตต่อกลุ่มเต็ม 7 แถว) + หัวข้อ Balance ของ WeeklyMuscleHeatmap ที่เคยอยู่บน
// Dashboard คู่กัน ด้วยการ์ดสรุปสั้นๆ อ่านแล้วรู้ทันทีว่า "สัปดาห์นี้ควรทำอะไร" — รายละเอียดเต็ม
// (ตาราง/กราฟ/Balance % ครบทุกกลุ่ม) ยังอยู่ที่ /stats (WeeklyMuscleHeatmap/WeeklyVolume ย้ายไปที่นั่น
// ทั้งคู่ ดูคอมเมนต์ที่ stats/page.tsx) จุดนี้ทำหน้าที่แค่ "สรุปผลลัพธ์" ไม่ใช่ที่ที่ดูรายละเอียด
//
// ใช้ query key เดียวกับ WeeklyVolume.tsx เป๊ะ (['weekly-volume', start, end] / ['weekly-volume-targets'])
// และ volumeStatus() ตัวเดียวกัน กันตัวเลข/สถานะไม่ตรงกันระหว่างการ์ดนี้กับ /stats — ไม่ query/คำนวณสูตรใหม่
export default function WeeklyInsightsCard() {
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

  // เฉพาะ veryHigh/behind เท่านั้นที่ขึ้นเป็นบรรทัด insight เจาะจงกลุ่ม (คนละความหมายกับ underTargetCount
  // ใน WeeklyVolume.tsx ที่รวม onTrack เข้าไปด้วยสำหรับตัวเลขสรุปท้ายการ์ด — ตรงนี้ onTrack แปลว่า "กำลังไป
  // ได้ดีตามสัดส่วนวันในสัปดาห์แล้ว" ไม่ใช่เรื่องเร่งด่วนที่ต้องเตือนเป็นบรรทัดแยก จึงจัดเข้ากลุ่ม "ในเป้าหมาย"
  // แทน ให้การ์ดนี้เหลือแค่ 2-3 บรรทัดที่ actionable จริงๆ ไม่ใช่ list ยาวเท่าตารางเดิม)
  const overTarget = rows.filter((r) => r.status === 'veryHigh').sort((a, b) => b.diff - a.diff)
  const underTarget = rows.filter((r) => r.status === 'behind').sort((a, b) => a.diff - b.diff)
  const onTarget = rows.filter((r) => r.status === 'met' || r.status === 'high' || r.status === 'onTrack')

  return (
    <PremiumCard className="px-4 py-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[12px] tracked uppercase text-muted">Weekly Insights</p>
        <Link href="/stats" className="text-[12px] font-medium shrink-0" style={{ color: '#E8A33D' }}>
          ดูรายละเอียด →
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-muted">ยังไม่มีข้อมูลสัปดาห์นี้</p>
      ) : overTarget.length === 0 && underTarget.length === 0 ? (
        <p className="text-[12px]" style={{ color: COLORS.moss }}>
          🟢 ทุกกลุ่มกล้ามเนื้ออยู่ในเป้าหมายแล้ว
        </p>
      ) : (
        <div className="space-y-1.5">
          {overTarget.slice(0, 2).map((r) => (
            <p key={r.mg} className="text-[12px]" style={{ color: COLORS.rust }}>
              🔴 {r.mg} +{r.diff} เซ็ต เกินเป้า
            </p>
          ))}
          {underTarget.slice(0, 2).map((r) => (
            <p key={r.mg} className="text-[12px]" style={{ color: COLORS.steel }}>
              🔵 {r.mg} {r.diff} เซ็ต ต่ำกว่าเป้า
            </p>
          ))}
          {onTarget.length > 0 && (
            <p className="text-[12px]" style={{ color: COLORS.moss }}>
              🟢 {onTarget.map((r) => r.mg).join(' · ')} อยู่ในเป้าหมายแล้ว
            </p>
          )}
        </div>
      )}
    </PremiumCard>
  )
}
