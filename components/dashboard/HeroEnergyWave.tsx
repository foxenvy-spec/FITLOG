'use client'

import { useEffect, useId, useRef } from 'react'

interface HeroEnergyWaveProps {
  className?: string
}

const VIEW_WIDTH = 400
const VIEW_HEIGHT = 200
const Y_BASE = VIEW_HEIGHT / 2 // กึ่งกลางแนวตั้งของ viewBox พอดี — ดูคอมเมนต์ WAVE_TOP ใน Header.tsx
const AMPLITUDE = 30
const FREQUENCY = 4
const TAPER_POWER = 0.8
const STEPS = 40

/** สร้าง path เส้นคลื่นจาก sine wave ที่ค่อยๆ เบาแรง (taper) ที่ปลายทั้งสองข้าง แล้วต่อจุดที่คำนวณได้
 *  ด้วย quadratic bezier แบบ "midpoint smoothing" (จุดควบคุม = จุดจริง, จุดปลายของแต่ละช่วง = จุดกึ่ง
 *  กลางไปจุดถัดไป) — สูตรเดียวกับ Canvas wave animation ทั่วไป พอร์ตตรงจาก reference mockup ที่ให้มา
 *  (เดิม v10/v11 ของไฟล์นี้ใช้ path นิ่งๆ ที่วาดครั้งเดียวแล้วประดับด้วย CSS dash-animation ซึ่งไม่ใช่
 *  คลื่นที่ "ไหล" จริงๆ — วิธีนี้คำนวณ path ใหม่ทุกเฟรมด้วย phase ที่ขยับไปเรื่อยๆ ถึงจะได้ผลแบบเดียวกัน) */
function buildWavePath(phase: number): string {
  const points: Array<[number, number]> = []
  for (let i = 0; i <= STEPS; i++) {
    const p = i / STEPS
    const x = VIEW_WIDTH * p
    const taper = Math.pow(Math.sin(p * Math.PI), TAPER_POWER)
    const y = Y_BASE + Math.sin(p * Math.PI * FREQUENCY + phase) * AMPLITUDE * taper
    points.push([x, y])
  }
  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const midX = (x0 + x1) / 2
    const midY = (y0 + y1) / 2
    d += ` Q ${x0} ${y0} ${midX} ${midY}`
  }
  return d
}

// เส้นคลื่นพลังงานหลักของ header — v12: พอร์ตตรงจาก reference mockup (ไฟล์ HTML+JS ที่ผู้ใช้ส่งมา)
// แทนที่จะเป็น path นิ่งๆ ประดับ CSS อย่าง v10/v11 — ตัด particle/5-strand/light-beam ของรอบก่อนออก
// ทั้งหมดเพราะ reference ไม่มี ให้ตรงกับที่ขอเป๊ะๆ: มีแค่ halo path + main path (เส้นเดียวกัน 2 ชั้น
// ความหนา/ความเบลอต่างกัน) + จุด flare ปลายเส้นที่ pulse รัศมี ไหลด้วย requestAnimationFrame จริง
export default function HeroEnergyWave({ className = '' }: HeroEnergyWaveProps) {
  const rawId = useId()
  const idPrefix = `hew-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  const haloRef = useRef<SVGPathElement>(null)
  const mainRef = useRef<SVGPathElement>(null)
  const flareRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const draw = (t: number) => {
      const d = buildWavePath(-t)
      haloRef.current?.setAttribute('d', d)
      mainRef.current?.setAttribute('d', d)
      flareRef.current?.setAttribute('r', String(6 + Math.sin(t * 3) * 2))
    }

    if (reduceMotion) {
      draw(0)
      return
    }

    let raf = 0
    let t = 0
    const tick = () => {
      t += 0.018
      draw(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      className={`w-full h-full overflow-visible ${className}`}
      aria-hidden="true"
    >
      <defs>
        <filter id={`${idPrefix}-glow-soft`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <filter id={`${idPrefix}-glow-tight`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        <linearGradient id={`${idPrefix}-wave-fade`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff6a00" stopOpacity="0" />
          <stop offset="25%" stopColor="#ff7c00" stopOpacity="0.9" />
          <stop offset="65%" stopColor="#ff9a1a" stopOpacity="1" />
          <stop offset="100%" stopColor="#ffd27a" stopOpacity="1" />
        </linearGradient>
        <radialGradient id={`${idPrefix}-flare`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff6e0" stopOpacity="1" />
          <stop offset="30%" stopColor="#ffb347" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ff8c1a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <path
        ref={haloRef}
        fill="none"
        stroke={`url(#${idPrefix}-wave-fade)`}
        strokeWidth="1.6"
        strokeLinecap="round"
        filter={`url(#${idPrefix}-glow-soft)`}
        opacity="0.8"
        style={{ mixBlendMode: 'screen' }}
      />
      <path
        ref={mainRef}
        fill="none"
        stroke={`url(#${idPrefix}-wave-fade)`}
        strokeWidth="0.8"
        strokeLinecap="round"
        filter={`url(#${idPrefix}-glow-tight)`}
        style={{ mixBlendMode: 'screen' }}
      />
      {/* จุด flare ปลายเส้น — วางไว้ที่ขอบขวาสุดของ viewBox (Header.tsx จัดให้ตรงกับขอบซ้ายของวง
          Fitness Score พอดี) รัศมี pulse ตามเวลาเดียวกับที่ path กำลังไหล ให้ดูเหมือนพลังงานพุ่งเข้าวง */}
      <circle ref={flareRef} cx={VIEW_WIDTH - 2} cy={Y_BASE} r="0" fill={`url(#${idPrefix}-flare)`} style={{ mixBlendMode: 'screen' }} />
    </svg>
  )
}
