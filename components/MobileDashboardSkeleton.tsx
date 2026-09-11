import Skeleton from './Skeleton'
import { dashboardSpec } from '@/lib/dashboardSpec'

// Skeleton เฉพาะ mobile dashboard — mirror ความสูง/gap จาก dashboardSpec ตัวเดียวกับที่ component จริง
// ใช้ ให้สลับจาก skeleton -> เนื้อหาจริงแล้ว "นิ่ง" ไม่มีจังหวะกระตุก (layout shift)
//
// เขียนใหม่ตามโครงหน้า Version 5 rebuild (Header ใหญ่ขึ้น + TriStatRow 3 การ์ดแทนกริด 2x2 เดิม + ไม่มี
// Health Stats/Quick Actions/Body Goal card อีกต่อไป — ดู comment เต็มที่ MobileDashboardView.tsx)
export default function MobileDashboardSkeleton() {
  return (
    <div className="relative" style={{ display: 'flex', flexDirection: 'column', gap: dashboardSpec.screen.sectionGap }}>
      {/* Header — แถวบน (greeting/wordmark + กระดิ่ง) + แถวล่าง (headline + วง Fitness Score ใหญ่) */}
      <div style={{ height: dashboardSpec.header.height }}>
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="rounded-full shrink-0" style={{ width: 44, height: 44 }} />
        </div>
        <div className="flex items-center justify-between gap-4" style={{ marginTop: 20 }}>
          <Skeleton className="h-7 flex-1" />
          <Skeleton
            className="rounded-full shrink-0"
            style={{ width: dashboardSpec.header.scoreRingSize, height: dashboardSpec.header.scoreRingSize }}
          />
        </div>
      </div>

      {/* Recovery / Body Fat / Weight — 3 การ์ดเล็ก */}
      <div className="grid grid-cols-3" style={{ gap: dashboardSpec.miniStatCard.gridGap }}>
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            style={{ height: dashboardSpec.miniStatCard.height, borderRadius: dashboardSpec.miniStatCard.borderRadius }}
          />
        ))}
      </div>

      {/* Today's Focus */}
      <Skeleton className="w-full" style={{ height: dashboardSpec.focusCard.height, borderRadius: dashboardSpec.focusCard.borderRadius }} />

      {/* Today's Workout */}
      <Skeleton className="w-full" style={{ height: dashboardSpec.workoutCard.height, borderRadius: dashboardSpec.workoutCard.borderRadius }} />

      {/* Weekly Activity + AI Coach */}
      <Skeleton className="w-full h-20 rounded-2xl" />
      <Skeleton className="w-full h-16 rounded-2xl" />
    </div>
  )
}
