'use client'

import { useEffect } from 'react'
import type { WarmupMove } from '@/lib/warmupGuide'

// ฟีดแบ็ก "ก่อนเริ่มเซ็ตแรก เพิ่มปุ่มเล็กๆ [ ดูท่าวอร์มอัป 3 นาที ] แนะนำท่ายืดเหยียดเฉพาะกล้ามเนื้อมัด
// ที่จะเล่นวันนี้" — modal เบาๆ ไม่ผูก animation choreography ซับซ้อนแบบ MetricDetailSheet.tsx (เนื้อหา
// สั้น/ไม่มีกราฟ ไม่จำเป็นต้องมี exit-animation-then-unmount) mount/unmount ตรงตาม open prop ตรงๆ
export default function WarmupGuideSheet({
  open,
  onClose,
  muscleLabel,
  moves,
}: {
  open: boolean
  onClose: () => void
  muscleLabel: string | null
  moves: WarmupMove[]
}) {
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="ท่าวอร์มอัป">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full sm:max-w-sm rounded-t-card sm:rounded-card bg-surface border border-line px-5 py-5 animate-rise">
        <div className="flex items-center justify-between mb-1">
          <p className="font-display text-sm tracked uppercase text-ink flex items-center gap-1.5">
            <span aria-hidden="true">🔥</span> วอร์มอัป 3 นาที
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink text-lg leading-none px-1"
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>
        {muscleLabel && <p className="text-[11px] text-muted mb-3">เตรียมพร้อมก่อนเล่น {muscleLabel}</p>}
        <ul className="space-y-2.5">
          {moves.map((move) => (
            <li key={move.name} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink">{move.name}</span>
              <span className="text-[11px] font-mono text-muted shrink-0">{move.duration}</span>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-muted mt-4">
          ท่าวอร์มอัปทั่วไป ไม่ใช่คำแนะนำทางการแพทย์ — ปรับตามความเหมาะสมของร่างกายตัวเอง
        </p>
      </div>
    </div>
  )
}
