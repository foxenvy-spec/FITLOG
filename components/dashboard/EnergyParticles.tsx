'use client'

import { useMemo } from 'react'

interface EnergyParticlesProps {
  count?: number
  className?: string
}

// อนุภาคแสงลอยเบาๆ กระจายทั่วพื้นหลัง header (ตกแต่งล้วนๆ) — สุ่มตำแหน่ง/ขนาด/จังหวะครั้งเดียวตอน mount
// ด้วย useMemo ปลอดภัยจาก hydration mismatch เพราะ MobileDashboardView ที่เป็นต้นทางถูกโหลดด้วย
// ssr:false อยู่แล้วทั้งหน้า (component นี้ไม่มีทาง render ฝั่ง server)
export default function EnergyParticles({ count = 50, className = '' }: EnergyParticlesProps) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 1 + Math.random() * 2.2,
        delay: Math.random() * 4,
        duration: 3 + Math.random() * 3,
        opacity: 0.25 + Math.random() * 0.45,
      })),
    [count]
  )

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`} aria-hidden="true">
      {particles.map((p, i) => (
        <span
          key={i}
          className="animate-header-particle absolute rounded-full"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            background: i % 3 === 0 ? '#FFF4CC' : '#FFAA00',
            opacity: p.opacity,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            mixBlendMode: 'screen',
          }}
        />
      ))}
    </div>
  )
}
