'use client'

import { useId } from 'react'
import { lighten } from '@/lib/theme'

interface AnimatedWaveProps {
  color: string
}

// เส้นคลื่นตกแต่งของ header — decorative only (ไม่มีความหมายเชิงข้อมูล) สีอิงตาม tier ของ
// Fitness Score ปัจจุบันเสมอ (เขียว=Elite, เหลือง=Good, ส้ม/แดง=Fair/Recovery ฯลฯ)
//
// v5 (ตามฟีดแบ็ก "อยากให้ดูไฟลุก 3 มิติ"): เปลี่ยนจากคลื่นหลายลอน (v3/v4) เป็นเส้นโค้งเดียว
// ลื่นไหลต่อเนื่อง + ไล่เฉดสว่าง/เข้มของสีเดียวกัน (ใช้ lighten() ผสมขาว แทนที่จะ hardcode สีส้ม
// ตรงๆ) ให้ตรงกลางเส้นสว่างจ้าคล้ายแกนไฟ ส่วนปลายทั้งสองข้างเข้มลง — เอฟเฟกต์นี้ทำงานถูกต้อง
// ไม่ว่า tier สีจะเป็นอะไร ไม่ผูกติดกับโทนส้มเพียงอย่างเดียว
export default function AnimatedWave({ color }: AnimatedWaveProps) {
  const gradId = useId()
  const coreGradId = useId()
  const glowWideId = useId()
  const glowCoreId = useId()

  const hot = lighten(color, 0.55) // เฉดสว่างของสีเดียวกัน ใช้เป็น "แกนไฟ" ตรงกลางเส้น
  const core = lighten(color, 0.85) // สว่างจ้าเกือบขาว ใช้เป็น hot-core บางๆ ตรงกลางสุด

  // เส้นโค้งเดียวลื่นไหล (ไม่ใช่คลื่นหลายลอนแบบเดิม) — ขึ้นเนินครั้งเดียวแล้วลงมาบรรจบฝั่งขวา
  const path = 'M0,45 C60,10 110,15 160,32 C210,50 240,55 290,38 C340,20 380,15 400,22'

  return (
    <svg viewBox="0 0 400 70" className="w-full h-[70px]" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {/* ไล่เฉด "ไฟ": เข้มที่ปลาย -> สว่าง (hot) ตรงกลางเส้น -> เข้มอีกฝั่ง — ใช้สีเดียวกันทั้งหมด
            แค่ผสมขาวมากขึ้นตรงกลาง ให้ได้ความรู้สึกแกนไฟโดยไม่ต้อง hardcode เป็นสีส้ม */}
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="18%" stopColor={color} stopOpacity="0.9" />
          <stop offset="48%" stopColor={hot} stopOpacity="1" />
          <stop offset="70%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.4" />
        </linearGradient>
        {/* แกนกลางสว่างจ้า (hot core) บางกว่าและสว่างกว่าเส้นหลัก */}
        <linearGradient id={coreGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={core} stopOpacity="0" />
          <stop offset="30%" stopColor={core} stopOpacity="0.9" />
          <stop offset="55%" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="80%" stopColor={core} stopOpacity="0.9" />
          <stop offset="100%" stopColor={core} stopOpacity="0" />
        </linearGradient>
        <filter id={glowWideId} x="-60%" y="-200%" width="220%" height="500%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={glowCoreId} x="-60%" y="-200%" width="220%" height="500%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>

      {/* ชั้น 1: glow กว้างสุด ฟุ้งมาก ให้ความรู้สึก "แสงไฟลอดพื้นหลัง" */}
      <path d={path} fill="none" stroke={color} strokeWidth="16" strokeOpacity="0.22" filter={`url(#${glowWideId})`} />
      {/* ชั้น 2: glow ระดับกลาง สีไล่เฉดไฟ */}
      <path d={path} fill="none" stroke={`url(#${gradId})`} strokeWidth="7" strokeOpacity="0.55" filter={`url(#${glowCoreId})`} />
      {/* ชั้น 3: เส้นแกนไฟหลัก (สีไล่เฉดเต็มที่) */}
      <path d={path} fill="none" stroke={`url(#${gradId})`} strokeWidth="3" strokeLinecap="round" />
      {/* ชั้น 4: hot core สว่างจ้าตรงกลางเส้น ให้ความรู้สึก 3 มิติ/มีแกนไฟจริง */}
      <path d={path} fill="none" stroke={`url(#${coreGradId})`} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
