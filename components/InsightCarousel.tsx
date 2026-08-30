'use client'

import { useEffect, useRef, useState } from 'react'
import type { Insight } from '@/lib/dashboardStats'
import InsightCard from './InsightCard'

// v48: ฟีดแบ็ก "Insight ตอนนี้มี 2 ใบ วางซ้อนกันแนวตั้ง กินพื้นที่ ทำเป็น Carousel จะดีกว่า ไม่กินพื้นที่"
// — เดิม combinedInsights.map วาง InsightCard เรียงต่อกันแนวตั้ง (space-y-2) สูงเท่าจำนวนใบรวมกัน
// เปลี่ยนเป็นปัดแนวนอนทีละใบ (scroll-snap ธรรมดา ไม่พึ่ง library ภายนอก) สูงคงที่แค่ 1 ใบเสมอไม่ว่าจะมี
// กี่ insight — จุดไข่ปลาด้านล่างบอกตำแหน่ง/จำนวนทั้งหมด กดจุดเพื่อเลื่อนไปใบนั้นได้โดยตรงด้วย
const AUTO_ROTATE_MS = 6500 // อยู่ในช่วง 5-8 วิที่ขอ

export default function InsightCarousel({ insights, imageFor }: { insights: Insight[]; imageFor: (insight: Insight) => string | undefined }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  // ฟีดแบ็ก "Auto-rotate ทุก 5-8 วิ ให้อ่านครบทุกข้อโดยไม่ต้องรอกด" — หยุดถาวรทันทีที่ผู้ใช้ปัด/แตะ/
  // hover เอง (ไม่สู้กับ interaction ของผู้ใช้ ไม่ resume หลัง idle เพื่อไม่ให้กระตุกกลับตอนกำลังอ่าน) —
  // เคารพ prefers-reduced-motion เหมือน animation อื่นทั้งแอป (ไม่ตั้ง timer เลยถ้าผู้ใช้ปิด motion ไว้)
  const pausedRef = useRef(false)
  function pauseAutoRotate() {
    pausedRef.current = true
  }

  // อัปเดตจุดไข่ปลาให้ตรงตำแหน่งจริงระหว่างปัด — คำนวณจาก scrollLeft หารความกว้างการ์ด (แต่ละใบกว้าง
  // เท่ากับ track เป๊ะ เพราะการ์ดตั้ง shrink-0 w-full) แทนการนับ intersection observer ซึ่งหนักเกินความ
  // จำเป็นสำหรับกรณีนี้ (มีแค่ไม่กี่ใบ, เลื่อนแนวเดียว)
  function handleScroll() {
    const el = trackRef.current
    if (!el || el.clientWidth === 0) return
    const index = Math.round(el.scrollLeft / el.clientWidth)
    setActiveIndex(Math.max(0, Math.min(insights.length - 1, index)))
  }

  function scrollToIndex(index: number) {
    const el = trackRef.current
    if (!el) return
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
  }

  useEffect(() => {
    if (insights.length <= 1) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => {
      if (pausedRef.current) return
      const el = trackRef.current
      if (!el || el.clientWidth === 0) return
      const current = Math.round(el.scrollLeft / el.clientWidth)
      scrollToIndex((current + 1) % insights.length)
    }, AUTO_ROTATE_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insights.length])

  if (insights.length === 0) return null

  return (
    <div>
      <div
        ref={trackRef}
        onScroll={handleScroll}
        onPointerDown={pauseAutoRotate}
        onMouseEnter={pauseAutoRotate}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
        style={{ scrollBehavior: 'smooth' }}
      >
        {insights.map((insight) => (
          <div key={insight.id} className="shrink-0 w-full snap-center">
            <InsightCard insight={insight} imageSrc={imageFor(insight)} />
          </div>
        ))}
      </div>
      {insights.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2" role="tablist" aria-label="Insight">
          {insights.map((insight, i) => (
            <button
              key={insight.id}
              type="button"
              role="tab"
              aria-selected={i === activeIndex}
              aria-label={`Insight ${i + 1}/${insights.length}`}
              onClick={() => {
                pauseAutoRotate()
                scrollToIndex(i)
              }}
              className="rounded-full transition-all"
              style={{
                width: i === activeIndex ? 14 : 5,
                height: 5,
                backgroundColor: i === activeIndex ? '#E8A33D' : 'rgba(255,255,255,.18)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
