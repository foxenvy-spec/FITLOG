'use client'

import { useId } from 'react'
import type { ReactNode } from 'react'
import { FIRE_GRADIENT_STOPS, NEUTRAL } from '@/lib/theme'

interface GradientStop {
  offset: string
  color: string
}

interface ProgressRingProps {
  /** 0-100 */
  value: number
  size?: number
  strokeWidth?: number
  gradientStops?: readonly GradientStop[]
  trackColor?: string
  /** glow ฟุ้งรอบเส้น (SVG filter) — ปิดได้ถ้าอยากได้วงเรียบๆ ไม่มีไฟ */
  glow?: boolean
  /** เนื้อหากึ่งกลางวง (เช่น ตัวเลข + label) */
  children?: ReactNode
  className?: string
}

// ProgressRing — วงแหวน progress ทั่วไป มี gradient stroke + glow + glossy highlight ในตัว ใช้ได้
// ทุกจุดในแอปที่ต้องการวงคะแนน/ความคืบหน้าแบบมีมิติ (ไม่ผูกกับ Fitness Score โดยเฉพาะ — ดู
// components/dashboard/FitnessScore.tsx สำหรับการประกอบร่างเฉพาะหน้า dashboard ที่ใช้ตัวนี้)
//
// ค่า `value` เปลี่ยนแล้วเส้นจะไล่ (CSS transition บน strokeDashoffset) เข้าตำแหน่งใหม่นุ่มๆ เอง
// อัตโนมัติ ไม่กระโดดทันที — ถ้าอยากได้ตัวเลขนับขึ้นพร้อมกันด้วย ให้หมุน value ผ่าน useCountUp()
// (lib/useCountUp.ts) ก่อนส่งเข้ามา แล้วโชว์ตัวเลขที่หมุนแล้วอันเดียวกันเป็น children
export default function ProgressRing({
  value,
  size = 110,
  strokeWidth,
  gradientStops = FIRE_GRADIENT_STOPS,
  trackColor = NEUTRAL.ringTrackWarm,
  glow = true,
  children,
  className = '',
}: ProgressRingProps) {
  const sw = strokeWidth ?? Math.round(size * 0.08)
  const radius = (size - sw) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, value))
  const dashOffset = circumference * (1 - clamped / 100)
  const gradId = useId()
  const glowId = useId()

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            {gradientStops.map((s) => (
              <stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
          {glow && (
            // x/y/width/height ขยายจาก -70%/240% เป็น -90%/280% ให้พื้นที่ filter กว้างพอรองรับ
            // stdDeviation ที่เพิ่มขึ้น ไม่งั้นแสง glow จะถูกตัดขอบ (clip) ที่ขอบกรอบ filter เอง
            <filter id={glowId} x="-90%" y="-90%" width="280%" height="280%">
              <feGaussianBlur stdDeviation={Math.max(11, sw * 1.3)} result="blur" />
              {/* วาง blur ซ้ำสองชั้นก่อน SourceGraphic ให้แสง glow เข้มขึ้นอีกนิด โดยไม่ต้องเพิ่ม
                  stdDeviation จนฟุ้งเกินไป */}
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
        </defs>

        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={sw} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          filter={glow ? `url(#${glowId})` : undefined}
          style={{ mixBlendMode: 'screen', transition: 'stroke-dashoffset 0.9s cubic-bezier(.22,.9,.32,1)' }}
        />
        {/* glossy rim — เส้นบางสว่างจ้าแนบผิวด้านในของวงหลัก ให้ความรู้สึกผิวมันวาว/3 มิติ (reflection) —
            หนา/สว่างขึ้นจากเดิมอีกนิดให้เห็นชัดขึ้นว่าเป็นผิวมันจริงๆ ไม่ใช่แค่เส้นบางจางๆ */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius - sw * 0.32}
          fill="none"
          stroke="#FFF4CC"
          strokeWidth={Math.max(1.2, sw * 0.16)}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeOpacity={0.7}
          style={{ mixBlendMode: 'screen', transition: 'stroke-dashoffset 0.9s cubic-bezier(.22,.9,.32,1)' }}
        />
      </svg>

      {/* inner shadow บางๆ ด้านในวง ให้เนื้อหากึ่งกลางดูจมลงไปนิดหนึ่งแทนที่จะลอยแบน */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ inset: sw, boxShadow: 'inset 0 3px 8px rgba(0,0,0,.5)' }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}
