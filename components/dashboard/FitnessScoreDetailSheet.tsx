'use client'

import { useEffect, useState } from 'react'
import PremiumCard from '@/components/ui/PremiumCard'
import { COLORS, TEXT, NEUTRAL, withAlpha } from '@/lib/theme'
import type { FitnessScoreResult } from '@/lib/fitnessScore'
import AnimatedBarFill from '@/components/AnimatedBarFill'

interface FitnessScoreDetailSheetProps {
  open: boolean
  onClose: () => void
  score: FitnessScoreResult | null
}

// ฟีดแบ็ก "Fitness Score ควรมีเหตุผลที่เชื่อมกับ Score — กด Score แล้วเจอ breakdown ทำไมถึงได้คะแนนนี้"
// (Section 7) — bottom sheet เปิดจากการแตะวง Fitness Score บนมือถือ (แทน Link ไป /stats เดิมที่คอมเมนต์
// ในไฟล์นั้นเองก็บอกว่าเป็นแค่ทางออกชั่วคราวเพราะยังไม่มีหน้ารายละเอียดคะแนนนี้โดยเฉพาะ) — ใช้
// score.breakdown ตรงๆ (input ชุดเดียวกับที่ใช้คำนวณคะแนนจริงใน computeFitnessScore ไม่ recompute ซ้ำ)
// โชว์ปัจจัยจริงตามชื่อ/น้ำหนักจริง ไม่ยัดชื่อหมวดใหม่ที่ไม่ตรงกับสิ่งที่ระบบวัดจริง (เช่น "Training/
// Consistency/Progress" ที่ผู้ใช้เสนอ) — Sleep ที่ value เป็น null เสมอ (ไม่มี Apple Health/Google Fit)
// โชว์เป็น "ยังไม่เชื่อมต่อ" อย่างตรงไปตรงมาแทนการซ่อนหรือเดาตัวเลข ตาม pattern "ไม่ใช้ข้อมูลสมมติ" ที่
// ยึดมาตลอดทั้งแอป (ดู comment เดียวกันใน AICoachCompactCard.tsx เรื่อง Confidence %)
//
// mount lifecycle เดียวกับ MetricDetailSheet.tsx (จำ displayScore ล่าสุดไว้ + เล่น exit animation ก่อน
// unmount จริง) — บั๊กเดิมที่เจอในนั้น (เปิดนุ่ม ปิดวับ) ใช้แก้แบบเดียวกันตั้งแต่ต้นแทนที่จะเจอซ้ำ
export default function FitnessScoreDetailSheet({ open, onClose, score }: FitnessScoreDetailSheetProps) {
  const [mounted, setMounted] = useState(open)
  const [displayScore, setDisplayScore] = useState(score)

  useEffect(() => {
    if (open && score) {
      setDisplayScore(score)
      setMounted(true)
      return
    }
    if (!open && mounted) {
      const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const timer = setTimeout(() => setMounted(false), reduceMotion ? 0 : 200)
      return () => clearTimeout(timer)
    }
  }, [open, score, mounted])

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

  if (!mounted || !displayScore) return null
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
        aria-label="Training Readiness"
        className={`metric-sheet-panel ${closing ? 'is-closing' : ''} relative w-full max-w-md`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <PremiumCard className="rounded-b-none px-5 pt-4" style={{ clipPath: 'none' }}>
          <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ backgroundColor: NEUTRAL.chipInactiveAlt }} aria-hidden="true" />

          <div className="flex items-center justify-between">
            {/* v2: "Fitness Score" -> "Training Readiness" — ฟีดแบ็ก "ตีความว่าคะแนนสุขภาพโดยรวม แต่
                จริงๆ วัดความพร้อมฝึกวันนี้" (เหตุผลเดียวกับ FitnessScore.tsx) */}
            <p className="text-[11px] tracked uppercase" style={{ color: TEXT.body, fontWeight: 500 }}>
              Training Readiness
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

          <div className="mt-1 flex items-baseline gap-2">
            <p className="font-mono leading-none" style={{ color: TEXT.title, fontSize: 34, fontWeight: 700 }}>
              {displayScore.score}
              <span style={{ fontSize: 16, color: TEXT.secondary, fontWeight: 500 }}> /100</span>
            </p>
            <p className="font-display font-bold tracked uppercase leading-none" style={{ fontSize: 13, color: displayScore.color }}>
              {displayScore.tierLabel}
            </p>
          </div>

          <div className="my-4 h-px" style={{ backgroundColor: withAlpha('#FFFFFF', '0f') }} />

          <div className="pb-5 flex flex-col gap-3">
            {displayScore.breakdown.map((factor) => (
              <div key={factor.key}>
                <div className="flex items-baseline justify-between">
                  <p className="text-[11px] uppercase tracked" style={{ color: TEXT.body }}>
                    {factor.label}
                  </p>
                  <p className="font-mono text-[12px]" style={{ color: factor.value != null ? TEXT.body : TEXT.secondary }}>
                    {factor.value != null ? `${factor.value}%` : 'ยังไม่เชื่อมต่อ'}
                  </p>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: NEUTRAL.chipInactive }}>
                  {factor.value != null && <AnimatedBarFill pct={factor.value} color={COLORS.amber} />}
                </div>
              </div>
            ))}
          </div>

          {/* v58: ฟีดแบ็ก "Training Readiness 48 vs AI Coach Recovery 100% ดูขัดกัน" — เพิ่มประโยคสั้นๆ
              แยก "Recovery (Avg)" ตรงนี้ (เฉลี่ยทุกกลุ่มกล้ามเนื้อที่เคยฝึก เป็นแค่ 1 ใน 5 ปัจจัยถ่วงน้ำหนัก)
              ออกจาก "Muscle Recovery" ที่การ์ด AI Coach ใช้ (กลุ่มกล้ามเนื้อที่แนะนำวันนี้กลุ่มเดียว) —
              ตัวเลขต่างกันได้ปกติ เพราะวัดคนละขอบเขต ไม่ใช่ปัจจัยเดียวกัน */}
          <p className="pb-2 -mt-1 text-[11px] leading-relaxed" style={{ color: TEXT.secondary }}>
            คำนวณจากน้ำหนักตั้งต้น: Workout 30% · Streak 20% · Sleep 20% · Recovery (Avg) 15% · Weekly Goal 10% ·
            Activity 5% — ปัจจัยที่ยังไม่มีข้อมูล (เช่น Sleep) จะถูกตัดออกแล้วกระจายน้ำหนักให้ปัจจัยอื่นแทน
          </p>
          <p className="pb-5 text-[11px] leading-relaxed" style={{ color: TEXT.secondary }}>
            &quot;Recovery (Avg)&quot; ตรงนี้เฉลี่ยจากทุกกลุ่มกล้ามเนื้อที่เคยฝึก — คนละตัวกับ &quot;Muscle
            Recovery&quot; บนการ์ด AI Coach ที่วัดเฉพาะกลุ่มกล้ามเนื้อที่แนะนำวันนี้กลุ่มเดียว ตัวเลขสองจุดนี้
            ต่างกันได้ตามปกติ
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
