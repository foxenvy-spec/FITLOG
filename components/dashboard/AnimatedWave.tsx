'use client'

import { useId } from 'react'

interface AnimatedWaveProps {
  color: string
}

// เส้นคลื่นเรืองแสงตกแต่งของ header — decorative only (ไม่มีความหมายเชิงข้อมูล) สีเปลี่ยนตาม
// เฉดสีของ Fitness Score tier ปัจจุบัน ให้ความรู้สึกเชื่อมโยงกับคะแนนบนวงแหวน
//
// v3 (ตามสเปก mockup): สูงขึ้นชัดเจน (20px -> 90px) มีจุดยอด/หุบชัดเจนแบบ "/\___/  \_____/\"
// แทนที่จะเป็นเส้นลูกคลื่นราบเรียบเดิม, เพิ่มเป็น 3 ชั้น (glow กว้างสุดด้านหลัง, glow กลาง,
// เส้นแกนสว่างชัดด้านหน้า) ให้ความรู้สึก "หลายชั้น" ตามที่ขอ — วางเป็น background layer
// (ดู Header.tsx) ให้ลอดผ่านด้านหลังข้อความชื่อผู้ใช้ได้ ไม่ใช่เส้นแบนอยู่ใต้บรรทัดสุดท้าย
export default function AnimatedWave({ color }: AnimatedWaveProps) {
  const gradId = useId()
  const glowWideId = useId()
  const glowCoreId = useId()

  // จุดยอด-หุบชัดเจนขึ้นกว่าเดิมมาก (amplitude ~45 จาก 100 เทียบสัดส่วน h-[90px]) ให้เห็นเป็น
  // คลื่นจริงๆ ไม่ใช่เส้นหยักบางๆ เหมือนเวอร์ชันก่อน
  const path = 'M0,55 C40,15 70,85 110,45 C150,5 180,80 230,35 C270,0 300,70 340,30 C365,10 385,25 400,20'

  return (
    <svg viewBox="0 0 400 100" className="w-full h-[90px]" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="35%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.35" />
        </linearGradient>
        <filter id={glowWideId} x="-60%" y="-150%" width="220%" height="400%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={glowCoreId} x="-60%" y="-150%" width="220%" height="400%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>

      {/* ชั้น 1: glow กว้างสุด ฟุ้งมาก ให้ความรู้สึก "แสงลอดพื้นหลัง" */}
      <path d={path} fill="none" stroke={color} strokeWidth="14" strokeOpacity="0.18" filter={`url(#${glowWideId})`} />
      {/* ชั้น 2: glow ระดับกลาง แคบกว่าและเข้มกว่าชั้นแรก */}
      <path d={path} fill="none" stroke={color} strokeWidth="6" strokeOpacity="0.35" filter={`url(#${glowCoreId})`} />
      {/* ชั้น 3: เส้นแกนสว่างชัด อยู่หน้าสุด */}
      <path d={path} fill="none" stroke={`url(#${gradId})`} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
