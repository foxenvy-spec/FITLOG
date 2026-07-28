'use client'

import { useId } from 'react'
import { FIRE_ACCENT, lighten } from '@/lib/theme'

// เส้นคลื่นตกแต่งของ header — decorative only (ไม่มีความหมายเชิงข้อมูล)
//
// v6 (แก้ความ "ทื่อ" ตามฟีดแบ็ก 4 ข้อ):
//   1) mix-blend-mode: screen บนทุกชั้น glow — ให้แสงที่ซ้อนกัน "สะสมความสว่าง" แทนที่จะแค่
//      ทึบขึ้นแบบ opacity ปกติ (source-over) เหมือนเดิม นี่คือจุดที่ทำให้ดูเป็นแสงเรืองจริงๆ
//   2) เพิ่ม blur (stdDeviation 7/3.5 -> 14/6) + ขยายกรอบ filter ให้ฟุ้งกว้างขึ้นชัดเจน ไม่โดน crop
//   3) เพิ่มจุดประกายไฟ (particle) เกาะตามแนวเส้นคลื่นโดยตรง (คนละจุดกับ particle ใน AmbientGlow
//      ที่กระจายทั่วพื้นหลัง) แต่ละจุด blur เบาๆ + pulse จังหวะต่างกันเล็กน้อย
//   4) hot core หนาขึ้น (1.2px -> 2.6px) และให้สว่างจ้าเต็มที่ ไม่จมกับ glow รอบข้าง
//
// สี: ใช้ FIRE_ACCENT คงที่ (ไม่ dynamic ตาม tier อีกต่อไป) ตามที่ขอให้ตรงกับสีในรูปตัวอย่าง
export default function AnimatedWave() {
  const gradId = useId()
  const coreGradId = useId()
  const glowWideId = useId()
  const glowCoreId = useId()

  const color = FIRE_ACCENT
  const hot = lighten(color, 0.55)
  const core = lighten(color, 0.9)

  const path = 'M0,45 C60,10 110,15 160,32 C210,50 240,55 290,38 C340,20 380,15 400,22'

  // จุดโดยประมาณบนเส้น path ด้านบน (อ่านค่าคร่าวๆ จากเส้นโค้ง) ใช้วางประกายไฟเกาะแนวเส้น
  const particles = [
    { x: 40, y: 22 },
    { x: 100, y: 18 },
    { x: 160, y: 32 },
    { x: 205, y: 47 },
    { x: 260, y: 47 },
    { x: 310, y: 30 },
    { x: 360, y: 17 },
  ]

  return (
    <svg viewBox="0 0 400 70" className="w-full h-[70px] overflow-visible" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="18%" stopColor={color} stopOpacity="0.9" />
          <stop offset="48%" stopColor={hot} stopOpacity="1" />
          <stop offset="70%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.4" />
        </linearGradient>
        <linearGradient id={coreGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={core} stopOpacity="0" />
          <stop offset="30%" stopColor={core} stopOpacity="0.95" />
          <stop offset="55%" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="80%" stopColor={core} stopOpacity="0.95" />
          <stop offset="100%" stopColor={core} stopOpacity="0" />
        </linearGradient>
        {/* blur กว้างขึ้นชัดเจนจากเดิม (7 -> 14) + ขยายกรอบ filter ให้พอสำหรับ blur ใหญ่ขึ้น
            ไม่งั้น SVG จะ crop ขอบแสงทิ้งจนดูเหมือน blur ไม่ขึ้น */}
        <filter id={glowWideId} x="-80%" y="-400%" width="260%" height="900%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id={glowCoreId} x="-70%" y="-300%" width="240%" height="700%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* ชั้น 1-2: glow (screen blend ให้สะสมความสว่างแทนที่จะทึบขึ้นเฉยๆ) */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="18"
        strokeOpacity="0.35"
        filter={`url(#${glowWideId})`}
        style={{ mixBlendMode: 'screen' }}
      />
      <path
        d={path}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="8"
        strokeOpacity="0.7"
        filter={`url(#${glowCoreId})`}
        style={{ mixBlendMode: 'screen' }}
      />
      {/* ชั้น 3: เส้นแกนไฟหลัก */}
      <path d={path} fill="none" stroke={`url(#${gradId})`} strokeWidth="3" strokeLinecap="round" style={{ mixBlendMode: 'screen' }} />
      {/* ชั้น 4: hot core หนาขึ้น สว่างจ้าเต็มที่ */}
      <path d={path} fill="none" stroke={`url(#${coreGradId})`} strokeWidth="2.6" strokeLinecap="round" style={{ mixBlendMode: 'screen' }} />

      {/* ประกายไฟเกาะแนวเส้น */}
      {particles.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i % 2 === 0 ? 2.2 : 1.4}
          fill={i % 3 === 0 ? '#FFFFFF' : core}
          className="animate-header-particle"
          style={{ mixBlendMode: 'screen', animationDelay: `${i * 0.4}s` }}
        />
      ))}
    </svg>
  )
}
