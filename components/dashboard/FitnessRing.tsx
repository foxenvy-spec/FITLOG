'use client'

import { useId } from 'react'
import type { ReactNode } from 'react'
import { FIRE_GRADIENT_STOPS, NEUTRAL } from '@/lib/theme'
import SvgFilters from './SvgFilters'

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

// FitnessRing — v2: กลับไปเป็น SVG stroke-dasharray (จาก conic-gradient+mask ของ v1) ตามฟีดแบ็ก —
// วงเดิมดูเป็น progress ring ธรรมดา ไม่มีชั้นแสงสมจริงเหมือนภาพอ้างอิงที่มี glow 2 ชั้น/reflection/
// inner shadow/bloom ครบ ซึ่งทำผ่าน conic-gradient+CSS mask ไม่ได้ (ไม่มี SVG filter ให้ใช้) ต้องกลับมา
// เป็น SVG ถึงจะไล่ชั้นแสงแบบนี้ได้จริง — ใช้ SvgFilters (defs เดียวกับ HeroEnergyWave) กันโค้ดซ้ำ
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

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <SvgFilters idPrefix={idPrefix} />
        <defs>
          <linearGradient id={`${idPrefix}-ring-gradient`} x1="0%" y1="0%" x2="100%" y2="100%">
            {FIRE_GRADIENT_STOPS.map((s) => (
              <stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>

        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={sw} />

        {/* Glow ชั้นนอก — เบลอกว้าง ฟุ้งไกล ให้แสงแผ่ออกรอบวงเป็นบรรยากาศ (ambient) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#FF8A00"
          strokeWidth={sw * 1.4}
          strokeOpacity={0.4}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          filter={`url(#${idPrefix}-glow-wide)`}
          style={{ mixBlendMode: 'screen' }}
        />
        {/* Glow ชั้นใน — เบลอแคบ แนบเส้นจริง ให้ขอบเส้นสว่างจ้าเฉพาะรอบตัวมันเอง (ไม่ใช่ก้อนเบลอกว้าง) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#FFD166"
          strokeWidth={sw * 0.7}
          strokeOpacity={0.6}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          filter={`url(#${idPrefix}-glow-tight)`}
          style={{ mixBlendMode: 'screen' }}
        />

        {/* เส้นวงหลัก — gradient ไฟ + bloom filter (เบลอ+ดันสว่างก่อน merge กลับ source) */}
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
          filter={`url(#${idPrefix}-bloom)`}
          className="animate-ring-pulse animate-ring-gradient-shift"
          style={{ mixBlendMode: 'screen', transition: 'stroke-dashoffset 0.9s cubic-bezier(.22,.9,.32,1)' }}
        />

        {/* Reflection / glossy highlight — เส้นบางสว่างจ้าแนบผิวด้านในของวงหลัก ให้ความรู้สึกผิวมันวาว */}
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

      {/* sweep glow — จุดสว่างหมุนวนรอบขอบวงต่อเนื่อง */}
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

      {/* Inner shadow บางๆ ด้านในวง ให้เนื้อหากึ่งกลางดูจมลงไปนิดหนึ่งแทนที่จะลอยแบน */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ inset: sw, boxShadow: 'inset 0 3px 8px rgba(0,0,0,.5)' }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}
