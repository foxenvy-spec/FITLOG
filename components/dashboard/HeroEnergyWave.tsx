'use client'

import { useEffect, useId, useRef } from 'react'

interface HeroEnergyWaveProps {
  className?: string
}

const VIEW_WIDTH = 400
const VIEW_HEIGHT = 200
const Y_BASE = VIEW_HEIGHT / 2 // กึ่งกลางแนวตั้งของ viewBox พอดี — ดูคอมเมนต์ WAVE_TOP ใน Header.tsx
// เพิ่มจาก 30 → 60 (สูงขึ้น ~2 เท่า) และลด FREQUENCY จาก 4 → 2.5 ให้เหลือลูกคลื่นใหญ่ๆ 2-3 ลูกที่มองเห็น
// ชัด แทนที่จะเป็นคลื่นถี่ๆ เล็กๆ ที่ดูเหมือน "เส้นตกแต่ง" ตามฟีดแบ็ก
const AMPLITUDE = 60
const FREQUENCY = 2.5
const TAPER_POWER = 0.8
const STEPS = 40
// เส้นบาง (thin wave) ซ้อนอยู่ด้านหลังเส้นหลัก — amplitude/ความถี่ต่างจากเส้นหลักเล็กน้อย + phase
// ต่างกัน ให้เห็นเป็นคลื่นสองชั้นซ้อนกันจริงๆ (ไม่ใช่แค่เงาของเส้นเดียวกัน)
const THIN_AMPLITUDE = AMPLITUDE * 0.5
const THIN_FREQUENCY = FREQUENCY * 1.4
const THIN_PHASE_OFFSET = Math.PI * 0.5

/** สร้าง path เส้นคลื่นจาก sine wave ที่ค่อยๆ เบาแรง (taper) ที่ปลายทั้งสองข้าง แล้วต่อจุดที่คำนวณได้
 *  ด้วย quadratic bezier แบบ "midpoint smoothing" (จุดควบคุม = จุดจริง, จุดปลายของแต่ละช่วง = จุดกึ่ง
 *  กลางไปจุดถัดไป) — สูตรเดียวกับ Canvas wave animation ทั่วไป พอร์ตตรงจาก reference mockup ที่ให้มา
 *  รับ amp/freq แยกได้ (ดีฟอลต์ตามค่าคงที่ด้านบน) เพื่อใช้ซ้ำวาดทั้งเส้นหลักและเส้นบางด้านหลังที่รูปทรง
 *  ต่างกันจริง ไม่ใช่แค่ copy เส้นเดียวกัน */
function buildWavePath(phase: number, amp: number = AMPLITUDE, freq: number = FREQUENCY): string {
  const points: Array<[number, number]> = []
  for (let i = 0; i <= STEPS; i++) {
    const p = i / STEPS
    const x = VIEW_WIDTH * p
    const taper = Math.pow(Math.sin(p * Math.PI), TAPER_POWER)
    const y = Y_BASE + Math.sin(p * Math.PI * freq + phase) * amp * taper
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

// เส้นคลื่นพลังงานหลักของ header — v13: แก้ตามฟีดแบ็ก "wave เล็กไป/แยกจาก ring" —
//   - amplitude สูงขึ้น 2 เท่า, ความถี่ลดลงเหลือ 2-3 ลูกใหญ่ๆ (ดูค่าคงที่ด้านบน)
//   - เพิ่มเส้นบาง (thin wave) ซ้อนด้านหลังเส้นหลัก คนละ amp/freq/phase
//   - จุด flare ปลายเส้นใหญ่ขึ้น/สว่างขึ้น ให้เป็นจุดเชื่อมที่เห็นชัดว่าเส้นคลื่น "ไหลเข้า" วง ไม่ใช่แค่
//     จุดจางๆ ปลายเส้น (ตำแหน่ง/การจางหายเข้าขอบวงจริงๆ อยู่ที่ wrapper mask ใน Header.tsx)
export default function HeroEnergyWave({ className = '' }: HeroEnergyWaveProps) {
  const rawId = useId()
  const idPrefix = `hew-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  const thinRef = useRef<SVGPathElement>(null)
  const haloRef = useRef<SVGPathElement>(null)
  const mainRef = useRef<SVGPathElement>(null)
  const flareRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const draw = (t: number) => {
      const d = buildWavePath(-t)
      const dThin = buildWavePath(-t * 0.75 + THIN_PHASE_OFFSET, THIN_AMPLITUDE, THIN_FREQUENCY)
      thinRef.current?.setAttribute('d', dThin)
      haloRef.current?.setAttribute('d', d)
      mainRef.current?.setAttribute('d', d)
      flareRef.current?.setAttribute('r', String(14 + Math.sin(t * 3) * 3))
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
        <filter id={`${idPrefix}-glow-wide`} x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="16" />
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

      {/* เส้นบางซ้อนด้านหลังสุด — amp/freq/phase ต่างจากเส้นหลักจริง ไม่ใช่แค่เงาของเส้นเดียวกัน */}
      <path
        ref={thinRef}
        fill="none"
        stroke="#FFD27A"
        strokeWidth="1"
        strokeOpacity="0.35"
        strokeLinecap="round"
        filter={`url(#${idPrefix}-glow-soft)`}
        style={{ mixBlendMode: 'screen' }}
      />

      <path
        ref={haloRef}
        fill="none"
        stroke={`url(#${idPrefix}-wave-fade)`}
        strokeWidth="3"
        strokeLinecap="round"
        filter={`url(#${idPrefix}-glow-wide)`}
        opacity="0.85"
        style={{ mixBlendMode: 'screen' }}
      />
      <path
        ref={mainRef}
        fill="none"
        stroke={`url(#${idPrefix}-wave-fade)`}
        strokeWidth="1.4"
        strokeLinecap="round"
        filter={`url(#${idPrefix}-glow-tight)`}
        style={{ mixBlendMode: 'screen' }}
      />
      {/* จุด flare ปลายเส้น — ใหญ่ขึ้น/สว่างขึ้นจากเดิม ให้เป็นจุดเชื่อมที่ตาเห็นชัดว่าคลื่นพลังงานไหลเข้า
          วง Fitness Score จริงๆ (ตำแหน่งที่เห็นจริงบนจอ ถูกจางหายไปด้วย mask บน wrapper ใน Header.tsx
          ก่อนถึงตรงนี้แล้ว — จุดนี้แค่เติมความสว่างตรงจุดเชื่อมให้ดูต่อเนื่องเข้ากับ glow ของวง) */}
      <circle ref={flareRef} cx={VIEW_WIDTH - 2} cy={Y_BASE} r="0" fill={`url(#${idPrefix}-flare)`} style={{ mixBlendMode: 'screen' }} />
    </svg>
  )
}
