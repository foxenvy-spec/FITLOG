'use client'

import { useId } from 'react'
import { FIRE_GRADIENT_STOPS } from '@/lib/theme'

interface GradientStop {
  offset: string
  color: string
}

interface AnimatedWaveProps {
  gradientStops?: readonly GradientStop[]
  /** จุดประกายไฟเกาะตามแนวเส้น */
  particles?: boolean
  /** glow เข้มพิเศษตรงปลายเส้นด้านขวา (ใช้ตอนวางให้ไปจบพอดีที่ขอบ element อื่น เช่น ProgressRing) */
  endGlow?: boolean
  className?: string
}

// เดิมเป็น 3 ช่วง (โค้งขึ้น-โค้งลง-โค้งขึ้น) ทำให้เห็นเป็นสัน 2 ยอด/หุบ 1 หุบ (รูปตัว W) แทนที่จะเป็น
// คลื่นเดียวลื่นๆ แบบมอคอัพ (หุบเดียวแล้วไล่ขึ้นยาวไปจนถึงวง) ลดเหลือ 2 ช่วง: จมลงครั้งเดียวก่อน
// แล้วไล่ขึ้นต่อเนื่องยาวๆ จนจบ — จุดจบยังคงอยู่ที่ (400,22) เดิมเป๊ะ ไม่กระทบการคำนวณ WAVE_TOP
// ใน Header.tsx ที่อิงตำแหน่งจุดจบนี้อยู่ (ดูคอมเมนต์ WAVE_TOP ที่นั่น)
const PATH = 'M0,40 C70,62 130,62 190,45 C260,22 330,10 400,22'

const PARTICLE_POINTS = [
  { x: 40, y: 50 },
  { x: 90, y: 58 },
  { x: 150, y: 47 },
  { x: 210, y: 30 },
  { x: 270, y: 18 },
  { x: 330, y: 12 },
  { x: 375, y: 17 },
]

// AnimatedWave — เส้นคลื่นไฟตกแต่งทั่วไป (decorative only) ไม่ผูกกับ dashboard header โดยเฉพาะ
// รับ gradientStops เองได้ ดีฟอลต์ใช้ FIRE_GRADIENT_STOPS ชุดเดียวกับ ProgressRing ให้สองอย่างนี้
// "เป็น gradient เดียวกันจริง" เวลาวางคู่กัน (เช่น ใน dashboard Header ที่ wave วิ่งเข้าหาวงคะแนน)
//
// screen blend mode ทุกชั้น glow ให้แสงที่ซ้อนกันสะสมความสว่างจริงๆ แทนที่จะแค่ทึบขึ้นแบบ opacity
// ปกติ — จุดนี้คือสิ่งที่ทำให้ดูเป็น "เส้นไฟ" มากกว่าเส้นสีเบลอๆ ธรรมดา
export default function AnimatedWave({
  gradientStops = FIRE_GRADIENT_STOPS,
  particles = true,
  endGlow = true,
  className = '',
}: AnimatedWaveProps) {
  const gradId = useId()
  const glowWideId = useId()
  const glowCoreId = useId()
  const endGlowId = useId()
  const core = '#FFF4CC'

  return (
    <svg
      viewBox="0 0 400 70"
      className={`w-full h-[70px] overflow-visible ${className}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          {gradientStops.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
        <filter id={glowWideId} x="-80%" y="-400%" width="260%" height="900%">
          <feGaussianBlur stdDeviation="20" />
        </filter>
        <filter id={glowCoreId} x="-70%" y="-300%" width="240%" height="700%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        {endGlow && (
          <filter id={endGlowId} x="-300%" y="-300%" width="700%" height="700%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        )}
      </defs>

      {/* outer glow — ส้มจาง กว้างสุด — เข้ม/กว้างขึ้นจากเดิม ให้ "ฟุ้ง" ชัดเจนขึ้นแทนที่จะจางจนแทบมองไม่เห็น */}
      <path d={PATH} fill="none" stroke="#FF8A00" strokeWidth="24" strokeOpacity="0.32" filter={`url(#${glowWideId})`} style={{ mixBlendMode: 'screen' }} />
      {/* middle glow — ทอง เข้มขึ้น แคบกว่า */}
      <path d={PATH} fill="none" stroke="#FFAA00" strokeWidth="11" strokeOpacity="0.5" filter={`url(#${glowCoreId})`} style={{ mixBlendMode: 'screen' }} />
      {/* เส้นแกนไฟหลัก — หนาขึ้นเล็กน้อยให้ตัวเส้นเองดูมีน้ำหนักขึ้น ไม่ใช่พึ่งแค่ glow รอบๆ */}
      <path d={PATH} fill="none" stroke={`url(#${gradId})`} strokeWidth="4" strokeLinecap="round" style={{ mixBlendMode: 'screen' }} />
      {/* inner glow — เกือบขาว บางที่สุด ทับตรงกลางเส้นให้สว่างจ้า */}
      <path d={PATH} fill="none" stroke="#FFF5DC" strokeWidth="1.8" strokeOpacity="0.95" strokeLinecap="round" style={{ mixBlendMode: 'screen' }} />

      {particles &&
        PARTICLE_POINTS.map((p, i) => (
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

      {endGlow && (
        <>
          <circle cx={398} cy={21} r={16} fill={core} filter={`url(#${endGlowId})`} className="animate-header-glow" style={{ mixBlendMode: 'screen' }} />
          <circle cx={398} cy={21} r={6} fill="#FFFFFF" filter={`url(#${glowCoreId})`} style={{ mixBlendMode: 'screen' }} />
        </>
      )}
    </svg>
  )
}
