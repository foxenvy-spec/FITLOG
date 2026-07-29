'use client'

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

// FitnessRing — วง progress แบบ conic-gradient + CSS mask (แทน SVG stroke-dasharray แบบ ProgressRing
// เดิม) ตามสเปคที่ขอ ใช้เฉพาะกับ Fitness Score บน header มือถือ — ProgressRing เดิมยังอยู่ครบ ใช้ที่
// อื่นในแอปต่อได้ตามปกติ ไม่ได้ถูกแทนที่ทั้งระบบ
//
// สี conic-gradient คงที่เป็นชุด fire theme เดิมเสมอ (ไม่ผูกกับ tier/recovery ตามหลักการที่ตกลงไว้ใน
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
  const clamped = Math.max(0, Math.min(100, value))
  const angle = (clamped / 100) * 360

  // แปลง stop เดิมของ FIRE_GRADIENT_STOPS (คิดเป็น % ของเส้นยาวเต็มวง) ให้กลายเป็นองศาของ conic-gradient
  // สเกลตามสัดส่วน progress ปัจจุบัน (angle) แทนที่จะเป็น 360deg คงที่ — ให้เฉด "จุดสว่างกึ่งกลาง"
  // ของ gradient อยู่ตรงกึ่งกลางส่วนที่ยังไหม้ (filled) จริงๆ เสมอ ไม่ว่า progress จะมากหรือน้อย
  const stops = FIRE_GRADIENT_STOPS.map((s) => `${s.color} ${((parseFloat(s.offset) / 100) * angle).toFixed(2)}deg`).join(', ')
  const filledGradient = `conic-gradient(from -90deg, ${stops}, ${trackColor} ${angle.toFixed(2)}deg, ${trackColor} 360deg)`
  const maskGradient = `radial-gradient(closest-side, transparent calc(100% - ${sw}px), #000 calc(100% - ${sw}px))`

  // ปลายวง (end-cap) — จุดสว่างเล็กๆ ตรงมุมที่ progress ไปถึง ให้ดูเหมือนปลายเส้นมน (rounded cap)
  // เพราะ conic-gradient เองปลายตัดตรง (flat) ไม่มี linecap ให้ใช้เหมือน SVG stroke
  const endRad = (angle - 90) * (Math.PI / 180)
  const radius = size / 2 - sw / 2
  const endX = size / 2 + radius * Math.cos(endRad)
  const endY = size / 2 + radius * Math.sin(endRad)

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full animate-ring-pulse animate-ring-gradient-shift"
        style={{
          background: filledGradient,
          WebkitMaskImage: maskGradient,
          maskImage: maskGradient,
        }}
      />

      {clamped > 1 && (
        <span
          className="absolute rounded-full"
          style={{
            width: Math.max(3, sw * 0.55),
            height: Math.max(3, sw * 0.55),
            left: endX,
            top: endY,
            transform: 'translate(-50%, -50%)',
            background: '#FFF4CC',
            boxShadow: '0 0 6px #FFF4CC, 0 0 12px #FF8A00',
          }}
        />
      )}

      {/* sweep glow — จุดสว่างหมุนวนรอบขอบวงต่อเนื่อง (reuse keyframe เดิมจาก ProgressRing กันซ้ำโค้ด) */}
      <div className="absolute inset-0 pointer-events-none animate-ring-sweep" aria-hidden="true">
        <div
          className="absolute rounded-full"
          style={{
            width: Math.max(4, sw * 0.5),
            height: Math.max(4, sw * 0.5),
            left: '50%',
            top: sw / 2,
            transform: 'translate(-50%, -50%)',
            background: '#FFF4CC',
            boxShadow: '0 0 8px #FFF4CC, 0 0 16px #FF8A00',
          }}
        />
      </div>

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
