'use client'

import dynamic from 'next/dynamic'
import DashboardSkeleton from '@/components/DashboardSkeleton'

// Dashboard ทั้งหน้าเป็นข้อมูลเฉพาะผู้ใช้ที่ต้อง login (ไม่มีประโยชน์ด้าน SEO และ
// ข้อมูลก็ต่างกันทุกคนอยู่แล้ว) จึงไม่มีเหตุผลต้อง SSR เลย — การปิด SSR ที่นี่ (ssr: false)
// ตัดปัญหาทั้งหมวดเรื่อง "hydration mismatch" (server กับ client render ไม่ตรงกัน แล้ว
// React ต้อง discard/rebuild ทั้ง tree จนบางทีเห็น UI ซ้อนกันแวบหนึ่งก่อนจอขาว) ทิ้งไปเลย
// เพราะไม่มี HTML จาก server ให้ผิดพลาดตั้งแต่แรก หน้านี้จะ render เป็น skeleton ก่อน
// (เหมือนกันทั้ง server และ client) แล้วค่อย mount เนื้อหาจริงฝั่ง client เท่านั้น
const DashboardView = dynamic(() => import('./DashboardView'), {
  ssr: false,
  loading: () => <DashboardSkeleton />,
})

export default function DashboardPage() {
  return <DashboardView />
}
