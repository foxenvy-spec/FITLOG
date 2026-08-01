import Skeleton from './Skeleton'
import { dashboardSpec } from '@/lib/dashboardSpec'

// Skeleton เฉพาะ mobile dashboard — เดิมหน้านี้ใช้ DashboardSkeleton ตัวกลาง (ใช้ร่วมกับเดสก์ท็อปด้วย)
// ซึ่งเป็นโครงหน้าเก่าก่อนรีดีไซน์ทั้งหมด (การ์ดรวมเดียว greeting+streak/today's workout/stats/PR/
// recovery/AI coach/last workout ในกล่องเดียว) ไม่ตรงกับโครงจริงปัจจุบันเลย (Header/TodaysFocusCard/
// BodyMetricsRow 2x2/TodaysWorkoutCompactCard/HealthStatsRow/StreakCard/AICoachCard/QuickActions) —
// ทำให้ตอนข้อมูลโหลดเสร็จ เนื้อหาจริง "กระโดด" แทนที่ skeleton (layout shift) เพราะสัดส่วนไม่ตรงกัน
// เลย — ไฟล์นี้ mirror ความสูง/gap จาก dashboardSpec ตัวเดียวกับที่ component จริงใช้ ให้สลับจาก
// skeleton -> เนื้อหาจริงแล้ว "นิ่ง" ไม่มีจังหวะกระตุก — ใช้เฉพาะ MobileDashboardView เท่านั้น
// (DashboardSkeleton เดิมยังอยู่ ไม่ได้ลบ ใช้กับเดสก์ท็อป/จุดที่ยังไม่รู้ mobile หรือ desktop ใน
// page.tsx เหมือนเดิมทุกประการ ไม่กระทบ)
export default function MobileDashboardSkeleton() {
  return (
    <div className="relative" style={{ display: 'flex', flexDirection: 'column', gap: dashboardSpec.screen.sectionGap }}>
      {/* Header — ชื่อ/subtitle ฝั่งซ้าย + วง Fitness Score ฝั่งขวา */}
      <div className="flex items-start justify-between gap-3" style={{ height: dashboardSpec.header.height }}>
        <div className="min-w-0 flex-1 space-y-2.5 pt-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-2.5 w-28" />
        </div>
        <Skeleton
          className="rounded-full shrink-0"
          style={{ width: dashboardSpec.header.scoreRingSize, height: dashboardSpec.header.scoreRingSize }}
        />
      </div>

      {/* Today's Focus */}
      <Skeleton className="w-full" style={{ height: dashboardSpec.focusCard.height, borderRadius: dashboardSpec.focusCard.borderRadius }} />

      {/* ภาพรวมร่างกาย — หัวข้อ + กริด 2x2 */}
      <div>
        <div className="flex items-center justify-between px-1" style={{ marginBottom: 20 }}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="grid grid-cols-2" style={{ gap: dashboardSpec.metricCard.gridGap }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              style={{ height: dashboardSpec.metricCard.height, borderRadius: dashboardSpec.metricCard.borderRadius }}
            />
          ))}
        </div>
      </div>

      {/* Today's Workout */}
      <Skeleton className="w-full" style={{ height: dashboardSpec.workoutCard.height, borderRadius: dashboardSpec.workoutCard.borderRadius }} />

      {/* Today's health stats */}
      <Skeleton className="w-full" style={{ height: dashboardSpec.healthBanner.height, borderRadius: 24 }} />

      {/* Streak + AI coach */}
      <Skeleton className="w-full h-20 rounded-2xl" />
      <Skeleton className="w-full h-16 rounded-2xl" />

      {/* Quick actions */}
      <div className="flex gap-2">
        <Skeleton className="h-11 w-32 rounded-lg shrink-0" />
        <Skeleton className="h-11 w-32 rounded-lg shrink-0" />
      </div>

      <Skeleton className="w-full h-10 rounded-lg" />
    </div>
  )
}
