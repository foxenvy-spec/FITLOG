'use client'

import { useId } from 'react'
import { FIRE_GRADIENT_STOPS } from '@/lib/theme'

// เส้นคลื่นตกแต่งของ header — decorative only (ไม่มีความหมายเชิงข้อมูล)
//
// v7: ใช้ FIRE_GRADIENT_STOPS ชุดเดียวกับ FitnessScore ring (ดู lib/theme.ts) แทนที่การไล่เฉด
// สว่าง/เข้มของสีเดียวแบบ v6 — ให้ Wave กับ Ring เป็น "gradient เดียวกันจริงๆ" ไม่ใช่คนละชุดสี
// ตามฟีดแบ็กที่ว่าจุดนี้คือสิ่งที่ทำให้รู้สึกว่า Wave กำลังส่งพลังงานเข้า Ring จริง (ไม่ใช่แค่คล้ายกัน)
// glow แบ่ง 3 ชั้นชัดเจนตามสเปก: outer (ส้มจาง), middle (ทองเข้มขึ้น), inner (เกือบขาว)
export default function AnimatedWave() {
  const gradId = useId()
  const glowWideId = useId()
  const glowCoreId = useId()
  const endGlowId = useId()

  const stops = FIRE_GRADIENT_STOPS
  const core = '#FFF4CC' // เฉดเดียวกับจุด highlight กลาง gradient — ใช้ทำ hot core/end-glow

  const path = 'M0,45 C60,10 110,15 160,32 C210,50 240,55 290,38 C340,20 380,15 400,22'

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
          {stops.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
        <filter id={glowWideId} x="-80%" y="-400%" width="260%" height="900%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id={glowCoreId} x="-70%" y="-300%" width="240%" height="700%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={endGlowId} x="-300%" y="-300%" width="700%" height="700%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      {/* outer glow — ส้มจาง กว้างสุด */}
      <path
        d={path}
        fill="none"
        stroke="#FF8A00"
        strokeWidth="18"
        strokeOpacity="0.18"
        filter={`url(#${glowWideId})`}
        style={{ mixBlendMode: 'screen' }}
      />
      {/* middle glow — ทอง เข้มขึ้น แคบกว่า */}
      <path
        d={path}
        fill="none"
        stroke="#FFAA00"
        strokeWidth="8"
        strokeOpacity="0.35"
        filter={`url(#${glowCoreId})`}
        style={{ mixBlendMode: 'screen' }}
      />
      {/* เส้นแกนไฟหลัก — gradient เดียวกับ Ring เป๊ะๆ */}
      <path d={path} fill="none" stroke={`url(#${gradId})`} strokeWidth="3" strokeLinecap="round" style={{ mixBlendMode: 'screen' }} />
      {/* inner glow — เกือบขาว บางที่สุด ทับตรงกลางเส้นให้สว่างจ้า */}
      <path
        d={path}
        fill="none"
        stroke="#FFF5DC"
        strokeWidth="1.4"
        strokeOpacity="0.95"
        strokeLinecap="round"
        style={{ mixBlendMode: 'screen' }}
      />

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

      {/* glow เข้มพิเศษตรงปลายเส้น (จบพอดีที่ขอบวง Ring) — จำลองพลังงานไหลเข้าไปสะสมในวง */}
      <circle cx={398} cy={21} r={16} fill={core} filter={`url(#${endGlowId})`} className="animate-header-glow" style={{ mixBlendMode: 'screen' }} />
      <circle cx={398} cy={21} r={6} fill="#FFFFFF" filter={`url(#${glowCoreId})`} style={{ mixBlendMode: 'screen' }} />
    </svg>
  )
}
