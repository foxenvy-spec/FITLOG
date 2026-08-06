'use client'

import { useEffect, useState } from 'react'

// แถบที่ค่อยๆ "เติม" จาก 0% ไปหาค่าจริงตอน mount (แทนที่จะโผล่มาที่ความกว้างสุดท้ายทันที)
// ใช้ double requestAnimationFrame เพื่อให้เบราว์เซอร์วาดเฟรมที่ width=0 ก่อน แล้วค่อยเปลี่ยน
// เป็นค่าจริงในเฟรมถัดไป — วิธีนี้การันตีว่า CSS transition จะเล่นจริง ต่างจาก setState เฉยๆ
// ที่ React อาจ batch จนข้ามเฟรม 0 ไปเลย
export default function AnimatedBarFill({
  pct,
  color,
  background,
  glow = false,
  // easing เดิม ease-out ธรรมดา — เปลี่ยนเป็น cubic-bezier แบบ spring (ค่าเดียวกับ animate-pop-in ใน
  // globals.css) ให้แถบ "เด้ง" เกินเป้าเล็กน้อยก่อนตกกลับที่ค่าจริง แทนที่จะไถลนิ่งๆ ทางเดียว — ใช้
  // ค่าเดียวกันทุกจุดที่เรียก AnimatedBarFill (Today's Workout, Weekly Volume/Cardio/Muscle Heatmap)
  // เพราะเป็นแค่ timing function ไม่กระทบสี/เลย์เอาต์/พฤติกรรมอื่นเลย
  className = 'h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
}: {
  pct: number
  color: string
  // เกรเดียนต์ (เช่น FIRE_GRADIENT_CSS) แทนสีเรียบ — ถ้าระบุจะวาดทับ color เดิม (color ยังเป็น fallback)
  background?: string
  // v48: ฟีดแบ็ก "Recovery bars ยังแบน อยากได้ Titanium Progress — inner glow" — เพิ่ม box-shadow
  // เรืองแสงรอบแท่ง (สีเดียวกับ color ที่ส่งมาอยู่แล้ว ไม่ต้องรับสีแยก) ดีฟอลต์ false เพื่อไม่กระทบจุดเรียก
  // เดิมทั้งหมด (Today's Workout, Weekly Volume/Cardio/Muscle Heatmap) ที่ไม่ได้ขอ glow นี้
  glow?: boolean
  className?: string
}) {
  const [width, setWidth] = useState(0)
  const clamped = Math.max(0, Math.min(100, pct))

  useEffect(() => {
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setWidth(clamped))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [clamped])

  return (
    <div
      className={className}
      style={{
        width: `${width}%`,
        backgroundColor: color,
        backgroundImage: background,
        boxShadow: glow ? `0 0 4px ${color}99, inset 0 1px 0 rgba(255,255,255,.3), inset 0 -1px 1px rgba(0,0,0,.35)` : undefined,
      }}
    />
  )
}
