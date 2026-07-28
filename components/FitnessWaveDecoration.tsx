'use client'

import { useId } from 'react'

interface FitnessWaveDecorationProps {
  color: string
}

// เส้นคลื่นเรืองแสงตกแต่งใต้ชื่อผู้ใช้ — ไม่มีความหมายเชิงข้อมูลใดๆ (decorative only) สีเปลี่ยนตาม
// เฉดสีของ Fitness Score tier ปัจจุบัน ให้ความรู้สึกเชื่อมโยงกับคะแนนด้านบน
export default function FitnessWaveDecoration({ color }: FitnessWaveDecorationProps) {
  const gradId = useId()
  const glowId = useId()

  return (
    <svg viewBox="0 0 400 48" className="w-full h-6" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="45%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor={color} stopOpacity="0.3" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-150%" width="200%" height="400%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      <path
        d="M0,32 C50,8 90,42 140,20 C190,-2 230,38 280,16 C310,4 340,10 400,6"
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeOpacity="0.22"
        filter={`url(#${glowId})`}
      />
      <path
        d="M0,32 C50,8 90,42 140,20 C190,-2 230,38 280,16 C310,4 340,10 400,6"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
