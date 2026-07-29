'use client'

interface GlowProps {
  color: string
  width?: number | string
  height?: number | string
  top?: number | string
  left?: number | string
  right?: number | string
  bottom?: number | string
  /** ความเบลอ (px) — ยิ่งมากยิ่งฟุ้งนุ่ม */
  blur?: number
  opacity?: number
  /** เพิ่ม animation หายใจเบาๆ (ดู @keyframes header-glow-pulse ใน globals.css) */
  pulse?: boolean
  className?: string
}

// Glow — บล็อบแสงเบลอนุ่มๆ ใช้เป็น "แหล่งกำเนิดแสง" พื้นหลังได้ทุกจุดในแอป ไม่ผูกกับ Fitness Score
// หรือ dashboard header โดยเฉพาะ (ก่อนหน้านี้ logic นี้ซ้อนอยู่ใน AmbientGlow.tsx ตรงๆ — ย้ายมาเป็น
// primitive ใช้ซ้ำได้ที่นี่แทน)
//
// ต้องอยู่ใน parent ที่เป็น position:relative (หรือ absolute) เอง — component นี้แค่วาง absolute
// ของตัวมันเองตาม top/left/right/bottom ที่ส่งมา ไม่ครอบ inset-0 ให้อัตโนมัติ เพื่อให้วางได้หลายจุด
// พร้อมกันในคอนเทนเนอร์เดียว (เช่น กระจาย glow หลายจุดในพื้นหลังเดียวกัน)
export default function Glow({
  color,
  width = 200,
  height = 120,
  top,
  left,
  right,
  bottom,
  blur = 36,
  opacity = 0.16,
  pulse = false,
  className = '',
}: GlowProps) {
  return (
    <div
      className={`absolute rounded-full pointer-events-none ${pulse ? 'animate-header-glow' : ''} ${className}`}
      style={{
        width,
        height,
        top,
        left,
        right,
        bottom,
        background: color,
        filter: `blur(${blur}px)`,
        opacity,
      }}
      aria-hidden="true"
    />
  )
}
