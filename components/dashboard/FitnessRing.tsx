'use client'

import { useId } from 'react'
import type { ReactNode } from 'react'
import { FIRE_GRADIENT_STOPS, NEUTRAL } from '@/lib/theme'

interface FitnessRingProps {
  /** 0-100 */
  value: number
  size?: number
  strokeWidth?: number
  trackColor?: string
  /** เนื้อหากึ่งกลางวง (เช่น ตัวเลข + label) */
  children?: ReactNode
  className?: string
}

// FitnessRing — v3: พอร์ตตรงจาก reference mockup แทนโครงสร้าง glow 2 ชั้น + bloom + reflection ของ v2
// ซึ่งซับซ้อนเกินและไม่ตรงกับที่ขอ — โครงสร้างจริงของ reference เรียบง่ายกว่า: วงพื้นหลัง (track) →
// วง glow ชั้นเดียว (เส้นหนากว่า เบลอนุ่ม opacity ต่ำกว่า) → วงคะแนนหลัก (เส้นปกติ เบลอแคบแนบเส้น) →
// จุดปลาย (tip) ที่หายใจเบาๆ ตรงตำแหน่ง progress ปัจจุบัน (ตัดวงหมุนรอบต่อเนื่อง (sweep) ของ v1/v2 ออก
// เพราะ reference ไม่มี — ใช้จุด tip นิ่งที่แค่ pulse ขนาดแทน)
//
// สี gradient คงที่เป็นชุด fire theme เดิมเสมอ (ไม่ผูกกับ tier/recovery ตามหลักการที่ตกลงไว้ใน
// lib/theme.ts) — ส่วนแสง glow รอบวงที่สะท้อนสถานะ recovery ยังคงมาจาก <Glow> ที่ Header.tsx ห่ออยู่
// รอบนอก component นี้เหมือนเดิม ไม่ได้ทำซ้ำใน component นี้อีกชั้น
export default function FitnessRing({
  value,
  size = 84,
  strokeWidth,
  trackColor = NEUTRAL.ringTrackWarm,
  children,
  className = '',
}: FitnessRingProps) {
  const sw = strokeWidth ?? Math.round(size * 0.08)
  const radius = (size - sw) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, value))
  const dashOffset = circumference * (1 - clamped / 100)
  const rawId = useId()
  const idPrefix = `fr-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`

  // ตำแหน่งจุด tip — พารามิเตอร์มุมเดียวกับที่ strokeDasharray/strokeDashoffset วาดเส้นจริง (เริ่มที่ 3
  // นาฬิกาแล้วหมุน -90deg ให้ไปเริ่มที่ 12 นาฬิกาแทน) ลบ 90deg ออกจากมุม raw ให้ตรงกับตำแหน่งที่ตาเห็นจริง
  const rawAngleRad = (clamped / 100) * 2 * Math.PI
  const tipAngle = rawAngleRad - Math.PI / 2
  const tipX = size / 2 + radius * Math.cos(tipAngle)
  const tipY = size / 2 + radius * Math.sin(tipAngle)

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <filter id={`${idPrefix}-glow-soft`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation={Math.max(2, sw * 0.5)} />
          </filter>
          <filter id={`${idPrefix}-glow-tight`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={Math.max(0.8, sw * 0.12)} />
          </filter>
          <linearGradient id={`${idPrefix}-ring-gradient`} x1="0%" y1="0%" x2="100%" y2="100%">
            {FIRE_GRADIENT_STOPS.map((s) => (
              <stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>

        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={sw} />

        {/* ring-glow — เส้นหนากว่าเส้นหลัก เบลอนุ่ม (glow-soft) opacity ต่ำ ให้แสงแผ่ออกรอบวงเป็น
            บรรยากาศ (ambient) อยู่ข้างหลังเส้นคะแนนหลัก */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${idPrefix}-ring-gradient)`}
          strokeWidth={sw * 1.3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          filter={`url(#${idPrefix}-glow-soft)`}
          opacity={0.7}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(.22,.9,.32,1)' }}
        />

        {/* ring-progress — เส้นคะแนนหลัก เบลอแคบ (glow-tight) แนบผิวเส้นจริง ให้ขอบสว่างจ้าเฉพาะรอบตัว
            มันเอง ไม่ใช่ก้อนเบลอกว้างเหมือน ring-glow ด้านบน */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${idPrefix}-ring-gradient)`}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          filter={`url(#${idPrefix}-glow-tight)`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(.22,.9,.32,1)' }}
        />
      </svg>

      {/* ring-tip — จุดสว่างนิ่งตรงตำแหน่ง progress ปัจจุบัน หายใจ (scale) เบาๆ แทนวงหมุนรอบต่อเนื่อง */}
      {clamped > 1 && (
        <span
          className="absolute rounded-full animate-ring-tip-pulse"
          style={{
            width: Math.max(3, sw * 0.7),
            height: Math.max(3, sw * 0.7),
            left: tipX,
            top: tipY,
            // fallback ตำแหน่งกึ่งกลางเวลา prefers-reduced-motion ปิด animation (keyframe
            // ring-tip-pulse เองก็ตั้งค่านี้ซ้ำอยู่แล้วตอน animation ทำงานปกติ — จำเป็นต้องมีทั้งคู่
            // เพราะพอ animation ถูกปิดด้วย `animation: none`, transform จาก keyframe หายไปด้วย)
            transform: 'translate(-50%, -50%)',
            background: '#FFF4CC',
            boxShadow: '0 0 6px #FFF4CC, 0 0 12px #FF8A00',
          }}
        />
      )}

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
