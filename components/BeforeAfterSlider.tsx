'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'

// ฟีดแบ็ก "แนะนำให้ทำหน้า Before/After Comparison แบบมี Interactive Slider Bar ที่ผู้ใช้เลื่อนแถบกึ่งกลาง
// ซ้าย-ขวาเพื่อดูความเปลี่ยนแปลง" — ต่างจาก UI เดิม (โชว์สองรูปข้างกัน) เป็นแบบซ้อนทับเฟรมเดียวกัน ลาก
// เส้นแบ่งเพื่อเปิดเผยรูป "ก่อน" มากขึ้น/น้อยลง — ใช้ Pointer Events (รองรับทั้งเมาส์และนิ้วสัมผัสในตัว
// เดียวกัน ไม่ต้องแยก touch handler)
export default function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeLabel,
  afterLabel,
}: {
  beforeUrl: string
  afterUrl: string
  beforeLabel: string
  afterLabel: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // % ตำแหน่งเส้นแบ่งจากซ้าย — เริ่มกึ่งกลางเสมอ (50) ให้เห็นทั้งสองรูปเท่าๆ กันตั้งแต่แรกโดยไม่ต้องลาก
  const [pct, setPct] = useState(50)

  function updateFromClientX(clientX: number) {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return
    setPct(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)))
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    updateFromClientX(e.clientX)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.buttons !== 1) return
    updateFromClientX(e.clientX)
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-[3/4] rounded-lg border border-line overflow-hidden select-none touch-none cursor-ew-resize"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      role="slider"
      aria-label="เลื่อนเทียบรูปก่อน-หลัง"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      {/* "หลัง" คือรูปฐานเต็มเฟรมเสมอ */}
      <Image src={afterUrl} alt={afterLabel} fill sizes="400px" className="object-cover pointer-events-none" draggable={false} />
      {/* "ก่อน" ซ้อนทับด้านบน ถูกตัดให้เหลือแค่ฝั่งซ้ายของเส้นแบ่งตามตำแหน่งที่ลาก */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}>
        <Image src={beforeUrl} alt={beforeLabel} fill sizes="400px" className="object-cover" draggable={false} />
      </div>
      {/* เส้นแบ่ง + handle ตรงกลาง */}
      <div
        className="absolute inset-y-0 pointer-events-none"
        style={{ left: `${pct}%`, width: 2, background: 'rgba(255,255,255,.9)', transform: 'translateX(-1px)', boxShadow: '0 0 6px rgba(0,0,0,.5)' }}
      />
      <div
        className="absolute rounded-full flex items-center justify-center pointer-events-none"
        style={{
          left: `${pct}%`,
          top: '50%',
          width: 32,
          height: 32,
          transform: 'translate(-50%, -50%)',
          background: 'rgba(255,255,255,.95)',
          boxShadow: '0 2px 10px rgba(0,0,0,.45)',
        }}
      >
        <span style={{ fontSize: 13 }} aria-hidden="true">
          ↔
        </span>
      </div>
      {/* ป้ายมุมบอกว่าฝั่งไหนคือก่อน/หลัง */}
      <span className="absolute top-2 left-2 text-[10px] font-display tracked uppercase px-2 py-0.5 rounded-full pointer-events-none" style={{ background: 'rgba(0,0,0,.6)', color: '#fff' }}>
        {beforeLabel}
      </span>
      <span className="absolute top-2 right-2 text-[10px] font-display tracked uppercase px-2 py-0.5 rounded-full pointer-events-none" style={{ background: 'rgba(0,0,0,.6)', color: '#fff' }}>
        {afterLabel}
      </span>
    </div>
  )
}
