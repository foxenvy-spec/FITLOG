import Skeleton from './Skeleton'
import { dashboardSpec } from '@/lib/dashboardSpec'

// Skeleton เฉพาะ mobile dashboard — mirror ความสูง/gap จาก dashboardSpec ตัวเดียวกับที่ component จริง
// ใช้ ให้สลับจาก skeleton -> เนื้อหาจริงแล้ว "นิ่ง" ไม่มีจังหวะกระตุก (layout shift)
//
// เขียนใหม่ตามโครงหน้า Version 5 rebuild (Header ใหญ่ขึ้น + TriStatRow 3 การ์ดแทนกริด 2x2 เดิม + ไม่มี
// Health Stats/Quick Actions/Body Goal card อีกต่อไป — ดู comment เต็มที่ MobileDashboardView.tsx)
//
// v2: "Mobile_app_design_brief_1.zip" (6a) — โครง Header เปลี่ยนจาก "headline+วงเรียงแนวนอน" เป็น
// "คอลัมน์ซ้าย 4 บรรทัด (greeting/FITLOG/subtitle/tagline) + คอลัมน์ขวาเรียงแนวตั้ง (bell/ring/label)"
// ปรับ skeleton ให้ตรงโครงใหม่ กันจังหวะกระตุกตอนสลับเป็นเนื้อหาจริง — Weekly Activity สูงขึ้นจาก ~80px
// เป็น ~106px หลังแยกเป็น 2 แถว (ดู WorkoutStreakCard.tsx) ปรับความสูง skeleton ให้ตรงตามด้วย
export default function MobileDashboardSkeleton() {
  return (
    <div className="relative" style={{ display: 'flex', flexDirection: 'column', gap: dashboardSpec.screen.sectionGap }}>
      {/* Header — คอลัมน์ซ้าย (greeting/FITLOG/subtitle/tagline) + คอลัมน์ขวา (bell/ring/tier label) */}
      <div className="flex items-start justify-between gap-3" style={{ height: dashboardSpec.header.height, padding: '20px 22px 0' }}>
        <div className="space-y-2 flex-1 min-w-0">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-6 w-24" style={{ marginTop: 6 }} />
          <Skeleton className="h-2 w-28" style={{ marginTop: 3 }} />
          <Skeleton className="h-3.5 w-32" style={{ marginTop: 12 }} />
        </div>
        <div className="flex flex-col items-center gap-2.5 shrink-0">
          <Skeleton className="rounded-full" style={{ width: 20, height: 20 }} />
          <Skeleton
            className="rounded-full"
            style={{ width: dashboardSpec.header.scoreRingSize, height: dashboardSpec.header.scoreRingSize }}
          />
          <Skeleton className="h-2.5 w-10" />
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
      <Skeleton className="w-full rounded-2xl" style={{ height: 106 }} />
      <Skeleton className="w-full h-16 rounded-2xl" />
    </div>
  )
}
