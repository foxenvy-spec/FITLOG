'use client'

import WeeklyCardioVolume from '@/components/WeeklyCardioVolume'

// Priority 12 (Cardio Dashboard) — ทุกอย่างที่ต้องใช้ (weekly minutes/sessions vs target, calories,
// avg heart rate, VO2Max, HR zone breakdown) คำนวณไว้ครบแล้วใน lib/weeklyCardioVolume.ts +
// components/WeeklyCardioVolume.tsx อยู่แล้ว — จุดที่ขาดจริงคือ "หน้าของตัวเอง" ที่เข้าถึงได้ (เดิมการ์ดนี้
// อยู่แค่บน Dashboard เดสก์ท็อป มือถือไม่มีเลย ทั้งที่ comment ใน MobileDashboardView.tsx อ้างว่า "ยังเข้าถึง
// ได้ที่แท็บสถิติ" ซึ่งไม่จริง — /stats ไม่มีข้อมูลนี้) หน้านี้ให้ "หน้า Cardio" มีที่อยู่จริงที่ลิงก์ไปถึงได้
export default function CardioPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl tracked uppercase">Cardio</h1>
        <p className="text-xs text-muted mt-0.5">สรุปคาร์ดิโอสัปดาห์นี้ — เวลา, เซสชัน, แคลอรี่, ชีพจร และโซนการฝึก</p>
      </div>
      <WeeklyCardioVolume />
    </div>
  )
}
