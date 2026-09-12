import Skeleton from './Skeleton'
import { dashboardSpec } from '@/lib/dashboardSpec'

// Skeleton เฉพาะ mobile dashboard — mirror ความสูง/gap จาก dashboardSpec ตัวเดียวกับที่ component จริง
// ใช้ ให้สลับจาก skeleton -> เนื้อหาจริงแล้ว "นิ่ง" ไม่มีจังหวะกระตุก (layout shift)
//
// v3: "New_mobile_app.zip" — โครงหน้าเปลี่ยนทั้งหมดตามการ rebuild Home ใหม่ (ไม่มี hero/ring ใน Header
// อีกต่อไป, Body Overview/Today/Weekly Progress/Goal Cards/AI Coach — ดู comment เต็มที่
// MobileDashboardView.tsx) ปรับ skeleton ให้ตรงโครงใหม่ทั้งหมด กันจังหวะกระตุกตอนสลับเป็นเนื้อหาจริง
export default function MobileDashboardSkeleton() {
  return (
    <div className="relative" style={{ display: 'flex', flexDirection: 'column', gap: dashboardSpec.screen.sectionGap }}>
      {/* Header — แถวโลโก้+กระดิ่ง แล้วตามด้วยบล็อกทักทาย 3 บรรทัด */}
      <div>
        <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="rounded-full" style={{ width: 34, height: 34 }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-32" style={{ marginTop: 6 }} />
          <Skeleton className="h-3 w-36" style={{ marginTop: 6 }} />
        </div>
      </div>

      {/* Body Overview */}
      <Skeleton className="w-full" style={{ height: 132, borderRadius: dashboardSpec.bodyOverviewCard.borderRadius }} />

      {/* Today */}
      <Skeleton className="w-full" style={{ height: 172, borderRadius: dashboardSpec.todayCard.borderRadius }} />

      {/* Weekly Progress */}
      <Skeleton className="w-full" style={{ height: 106, borderRadius: dashboardSpec.weeklyProgressCard.borderRadius }} />

      {/* Goal Cards */}
      <div className="grid grid-cols-2" style={{ gap: dashboardSpec.goalCard.gridGap }}>
        <Skeleton style={{ height: 100, borderRadius: dashboardSpec.goalCard.borderRadius }} />
        <Skeleton style={{ height: 100, borderRadius: dashboardSpec.goalCard.borderRadius }} />
      </div>

      {/* AI Coach */}
      <Skeleton className="w-full h-16 rounded-2xl" />
    </div>
  )
}
