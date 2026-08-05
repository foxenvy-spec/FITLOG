'use client'

import { useId } from 'react'

interface SubtitleAccentProps {
  className?: string
}

// เส้นแสงเล็กใต้ subtitle "Personalized Fitness" — พอร์ตตรงจาก reference mockup (.title-accent):
// เส้นแนวนอนบาง 2 ชั้น (glow นุ่ม + glow แนบเส้น) ไล่โทนโปร่งใส → สว่างจ้ากลางเส้น → โปร่งใส และจุดสว่าง
// ตรงกลางที่หายใจเบาๆ (เดิม Header.tsx เคยมี "light streak" คล้ายกันนี้แล้วเอาออกตอนเปลี่ยนไปใช้
// HeroEnergyWave เต็มความกว้าง header — reference ยืนยันว่าจริงๆ ต้องมีทั้งสองอย่างพร้อมกัน)
export default function SubtitleAccent({ className = '' }: SubtitleAccentProps) {
  const rawId = useId()
  const idPrefix = `sa-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <svg
      viewBox="0 0 150 20"
      className={`overflow-visible ${className}`}
      style={{ width: 150, height: 20, marginLeft: -14 }}
      aria-hidden="true"
    >
      <defs>
        <filter id={`${idPrefix}-glow-soft`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <filter id={`${idPrefix}-glow-tight`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        <linearGradient id={`${idPrefix}-flare-line`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff7a00" stopOpacity="0" />
          <stop offset="30%" stopColor="#ff9a1a" stopOpacity="0.5" />
          <stop offset="47%" stopColor="#ffb84d" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#fff6e0" stopOpacity="1" />
          <stop offset="53%" stopColor="#ffb84d" stopOpacity="0.9" />
          <stop offset="70%" stopColor="#ff9a1a" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ff7a00" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${idPrefix}-burst`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff6e0" stopOpacity="1" />
          <stop offset="30%" stopColor="#ffb347" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ff8c1a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <line x1="-60" y1="10" x2="150" y2="10" stroke={`url(#${idPrefix}-flare-line)`} strokeWidth="2" filter={`url(#${idPrefix}-glow-soft)`} opacity="0.75" style={{ mixBlendMode: 'screen' }} />
      <line x1="-60" y1="10" x2="150" y2="10" stroke={`url(#${idPrefix}-flare-line)`} strokeWidth="0.8" filter={`url(#${idPrefix}-glow-tight)`} style={{ mixBlendMode: 'screen' }} />
      {/* v30: ฟีดแบ็ก "ระดับ C ควรลบ — ไม่ได้เพิ่ม UX แต่เพิ่ม CPU" — ตัด animate-subtitle-accent-pulse
          (หายใจ scale ต่อเนื่อง) ออก จุดกลางเส้นนี้นิ่งแทน (keyframe ถูกลบออกจาก globals.css แล้วด้วย) */}
      <circle cx="36" cy="10" r="5" fill={`url(#${idPrefix}-burst)`} style={{ mixBlendMode: 'screen' }} />
      <circle cx="36" cy="10" r="1" fill="#fff8ea" filter={`url(#${idPrefix}-glow-tight)`} style={{ mixBlendMode: 'screen' }} />
    </svg>
  )
}
