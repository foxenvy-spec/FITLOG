'use client'

import dynamic from 'next/dynamic'
import DashboardSkeleton from '@/components/DashboardSkeleton'
import { useIsMobile } from '@/lib/useIsMobile'

// Dashboard ทั้งหน้าเป็นข้อมูลเฉพาะผู้ใช้ที่ต้อง login (ไม่มีประโยชน์ด้าน SEO และ
// ข้อมูลก็ต่างกันทุกคนอยู่แล้ว) จึงไม่มีเหตุผลต้อง SSR เลย — การปิด SSR ที่นี่ (ssr: false)
// ตัดปัญหาทั้งหมวดเรื่อง "hydration mismatch" ทิ้งไปเลย เพราะไม่มี HTML จาก server ให้ผิดพลาด
// ตั้งแต่แรก หน้านี้จะ render เป็น skeleton ก่อน แล้วค่อย mount เนื้อหาจริงฝั่ง client เท่านั้น
//
// สองเวอร์ชันแยกกันจริง (คนละไฟล์ คนละดีไซน์) — ไม่ใช่แค่ CSS responsive อย่างเดียว:
// - DashboardView: เดสก์ท็อป/แท็บเล็ตแนวนอน (>= 1024px) — multi-column grid
// - MobileDashboardView: มือถือ (< 1024px) — การ์ดแนวตั้งเดี่ยว + แถบปัด (scroll-snap)
// ใช้ dynamic import กับทั้งคู่ กันไม่ให้ฝั่งที่ไม่ได้ใช้ถูกโหลดเข้ามาในบันเดิลโดยเปล่าประโยชน์
const DesktopDashboardView = dynamic(() => import('./DashboardView'), {
  ssr: false,
  loading: () => <DashboardSkeleton />,
})
const MobileDashboardView = dynamic(() => import('./MobileDashboardView'), {
  ssr: false,
  loading: () => <DashboardSkeleton />,
})

export default function DashboardPage() {
  const isMobile = useIsMobile()

  // isMobile เป็น null ก่อน mount (ยังวัดขนาดจอไม่ได้) — โชว์ skeleton รอไว้ก่อน กันไม่ให้
  // เห็นเวอร์ชันผิดกระพริบขึ้นมาแวบเดียวก่อนสลับไปเวอร์ชันที่ถูกต้อง
  if (isMobile === null) return <DashboardSkeleton />

  return isMobile ? <MobileDashboardView /> : <DesktopDashboardView />
}
