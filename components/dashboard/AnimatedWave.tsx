'use client'

import { useId } from 'react'

interface AnimatedWaveProps {
  color: string
}

// เส้นคลื่นเรืองแสงตกแต่งของ header — decorative only (ไม่มีความหมายเชิงข้อมูล) สีเปลี่ยนตาม
// เฉดสีของ Fitness Score tier ปัจจุบัน
//
// v4: ลด amplitude ลงมาอยู่ที่ ~20px (จาก v3 ที่สูงไปหน่อย ~35px) ตามสเปกที่ขอ (18–24px) — ยังคง
// เห็นยอด/หุบชัดเจนกว่าเวอร์ชันแรกสุดที่แบนเกือบเป็นเส้นตรง แต่ไม่ล้นจนดูรกเหมือน v3
// viewBox กับความสูงจริง (h-[70px]) เท่ากันพอดี (70x70) เพื่อให้ตัวเลข amplitude ในโค้ดตรงกับ
// px จริงบนจอ ไม่ต้องคำนวณ scale เพิ่ม
export default function AnimatedWave({ color }: AnimatedWaveProps) {
  const gradId = useId()
  const glowWideId = useId()
  const glowCoreId = useId()

  // midline y=35, amplitude ~20px (peak y=15, trough y=55)
  const path = 'M0,40 C40,20 70,55 110,35 C150,15 180,50 230,30 C270,10 300,45 340,25 C365,15 385,22 400,20'

  return (
    <svg viewBox="0 0 400 70" className="w-full h-[70px]" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="35%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.35" />
        </linearGradient>
        <filter id={glowWideId} x="-60%" y="-150%" width="220%" height="400%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id={glowCoreId} x="-60%" y="-150%" width="220%" height="400%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* ชั้น 1: glow กว้างสุด ฟุ้งมาก ให้ความรู้สึก "แสงลอดพื้นหลัง" */}
      <path d={path} fill="none" stroke={color} strokeWidth="12" strokeOpacity="0.16" filter={`url(#${glowWideId})`} />
      {/* ชั้น 2: glow ระดับกลาง แคบกว่าและเข้มกว่าชั้นแรก */}
      <path d={path} fill="none" stroke={color} strokeWidth="5" strokeOpacity="0.32" filter={`url(#${glowCoreId})`} />
      {/* ชั้น 3: เส้นแกนสว่างชัด อยู่หน้าสุด */}
      <path d={path} fill="none" stroke={`url(#${gradId})`} strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  )
}
