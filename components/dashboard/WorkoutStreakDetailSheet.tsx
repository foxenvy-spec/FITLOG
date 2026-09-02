'use client'

import { useEffect, useState } from 'react'
import PremiumCard from '@/components/ui/PremiumCard'
import { COLORS, TEXT, withAlpha } from '@/lib/theme'

interface WorkoutStreakDetailSheetProps {
  open: boolean
  onClose: () => void
  streak: number
  bestStreak: number
}

// ฟีดแบ็ก "แนะนำเพิ่มอีกอย่าง: แยก Current กับ Best เช่น Detail — ไม่ต้องเอา Best มาไว้ Dashboard"
// (Section 3) — Current Streak บนการ์ดหลักยังโชว์แค่ตัวเลขเดียวเหมือนเดิม (ไม่แตะ) แผ่นนี้เปิดจากการแตะ
// การ์ด โชว์ Current เทียบกับ Best (สายโซ่ต่อเนื่องยาวที่สุดในประวัติ — computeLongestStreak ใน
// lib/dashboardStats.ts) mount lifecycle เดียวกับ MetricDetailSheet/FitnessScoreDetailSheet (exit
// animation ก่อน unmount จริง แทนที่จะหายวับ — บั๊กเดิมที่เคยเจอในรอบก่อน แก้ตั้งแต่ต้นแบบเดียวกัน)
export default function WorkoutStreakDetailSheet({ open, onClose, streak, bestStreak }: WorkoutStreakDetailSheetProps) {
  const [mounted, setMounted] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    if (mounted) {
      const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const timer = setTimeout(() => setMounted(false), reduceMotion ? 0 : 200)
      return () => clearTimeout(timer)
    }
  }, [open, mounted])

  useEffect(() => {
    if (!mounted) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [mounted, onClose])

  if (!mounted) return null
  const closing = !open

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div
        className={`metric-sheet-backdrop ${closing ? 'is-closing' : ''} absolute inset-0 bg-black/60`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Streak"
        className={`metric-sheet-panel ${closing ? 'is-closing' : ''} relative w-full max-w-md`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <PremiumCard className="rounded-b-none px-5 pt-4" style={{ clipPath: 'none' }}>
          <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ backgroundColor: withAlpha('#FFFFFF', '14') }} aria-hidden="true" />

          <div className="flex items-center justify-between">
            <p className="text-[12px] tracked uppercase" style={{ color: TEXT.body, fontWeight: 500 }}>
              Streak
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="flex items-center justify-center w-8 h-8 rounded-full text-lg leading-none -mr-2"
              style={{ color: TEXT.secondary }}
            >
              ×
            </button>
          </div>

          <div className="my-4 h-px" style={{ backgroundColor: withAlpha('#FFFFFF', '0f') }} />

          <div className="pb-5 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[12px] uppercase tracked" style={{ color: TEXT.secondary }}>
                Current Streak
              </p>
              <p className="font-mono leading-none mt-1.5" style={{ color: COLORS.amber, fontSize: 30, fontWeight: 700 }}>
                {streak}
                <span style={{ fontSize: 13, fontWeight: 500 }}> วัน</span>
              </p>
            </div>
            <div>
              <p className="text-[12px] uppercase tracked" style={{ color: TEXT.secondary }}>
                Best Streak
              </p>
              <p className="font-mono leading-none mt-1.5" style={{ color: TEXT.title, fontSize: 30, fontWeight: 700 }}>
                {bestStreak}
                <span style={{ fontSize: 13, fontWeight: 500, color: TEXT.secondary }}> วัน</span>
              </p>
            </div>
          </div>

          <p className="pb-5 -mt-2 text-[12px] leading-relaxed" style={{ color: TEXT.secondary }}>
            Best Streak คือสายโซ่ต่อเนื่องยาวที่สุดในประวัติของคุณ (ย้อนหลังสูงสุด 400 วัน)
          </p>
        </PremiumCard>
      </div>

      <style jsx>{`
        .metric-sheet-backdrop {
          animation: metric-sheet-backdrop-in 180ms ease forwards;
        }
        .metric-sheet-backdrop.is-closing {
          animation: metric-sheet-backdrop-out 200ms ease forwards;
        }
        .metric-sheet-panel {
          animation: metric-sheet-panel-in 220ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .metric-sheet-panel.is-closing {
          animation: metric-sheet-panel-out 200ms cubic-bezier(0.4, 0, 1, 1) forwards;
        }
        @keyframes metric-sheet-backdrop-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes metric-sheet-backdrop-out {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }
        @keyframes metric-sheet-panel-in {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        @keyframes metric-sheet-panel-out {
          from {
            transform: translateY(0);
          }
          to {
            transform: translateY(100%);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .metric-sheet-backdrop,
          .metric-sheet-panel {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}
