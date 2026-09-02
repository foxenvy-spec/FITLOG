'use client'

import { useEffect, useRef, useState } from 'react'

// ฟีดแบ็ก (P2, "Metric explanation") "Balance 46% ต้องอธิบายได้ — ไม่จำเป็นต้องเพิ่มคำอธิบายบน card หลัก
// แค่ ⓘ ข้าง label ก็พอ" — ปุ่ม "ⓘ" เล็กมาก วางข้าง label ของ metric ที่สูตร/เกณฑ์ไม่ชัดเจนในตัวเอง (เช่น
// Balance %, Body Goal Progress %) กดแล้วโผล่กล่องคำอธิบายสั้นๆ ลอยอยู่ข้างๆ ปิดเองเมื่อคลิกที่อื่น/กด
// Escape — ใช้ click-to-toggle (ไม่ใช่ hover) ให้ทำงานเหมือนกันทั้งเมาส์บนเดสก์ท็อปและทัชสกรีนบนมือถือ
// (hover เฉยๆ ใช้ไม่ได้บนทัช) — เป็น UI primitive ตัวเล็กมาก ไม่ใช่ Dashboard card ใหม่ (ผู้ใช้ยืนยันแล้วว่า
// "ไม่แนะนำให้เพิ่ม Dashboard card ใหม่แล้ว" — ตัวนี้คนละระดับกับ card เลย)
export default function InfoTooltip({ text, label = 'คำอธิบาย metric นี้' }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          // preventDefault/stopPropagation — บาง label ที่ใช้ตัวนี้อยู่ภายใน <Link> การ์ดเต็มใบ (คลิกได้
          // ทั้งการ์ด) กันไม่ให้กด ⓘ แล้วโดนตีความเป็นคลิกการ์ด/ลิงก์แม่ไปด้วย
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-label={label}
        aria-expanded={open}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[12px] leading-none text-muted hover:text-ink transition"
      >
        ⓘ
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-30 top-full left-0 mt-1.5 w-56 rounded-lg border border-line bg-surface2 px-2.5 py-2 text-[12px] leading-snug text-ink shadow-elevated normal-case font-normal tracking-normal"
        >
          {text}
        </span>
      )}
    </span>
  )
}
