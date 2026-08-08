'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import PremiumCard from '@/components/ui/PremiumCard'
import { COLORS, TEXT, NEUTRAL, withAlpha } from '@/lib/theme'
import { METRIC_ICON_IMAGES, type MetricIconImageKey, type MetricCardTheme } from '@/components/MetricCard'

interface GoalDetail {
  targetText: string
  progressPct: number | null
}

interface MetricDetailSheetProps {
  open: boolean
  onClose: () => void
  icon: MetricIconImageKey
  label: string
  valueText: string
  deltaText: string | null
  deltaColor: string
  deltaDir: 'up' | 'down' | null
  theme: MetricCardTheme
  goal: GoalDetail | null
}

// ฟีดแบ็ก "ไม่ควรเอา Goal Progress bar ไปใส่ทุก Card ตั้งแต่หน้า Dashboard — ให้แสดงใน Metric Detail
// จะสะอาดกว่า" (Section B ข้อ 6-7) — แผ่น bottom sheet เปิดจากการแตะการ์ด Body Metrics บนมือถือ
// (BodyMetricsRow.tsx compact เท่านั้น) โชว์ค่า+เดลต้าเหมือนบนการ์ด แล้วเสริม Goal (ถ้ามีเป้าหมาย active
// อยู่ในตาราง goals — ใช้ข้อมูลชุดเดียวกับที่หน้า /health ใช้อยู่แล้ว ไม่ใช่ schema ใหม่) — ไม่มีเป้าหมาย
// ก็โชว์ CTA ไปตั้งที่หน้าสุขภาพแทนที่จะซ่อนเงียบๆ
export default function MetricDetailSheet({
  open,
  onClose,
  icon,
  label,
  valueText,
  deltaText,
  deltaColor,
  deltaDir,
  theme,
  goal,
}: MetricDetailSheetProps) {
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="metric-sheet-backdrop absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="metric-sheet-panel relative w-full max-w-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <PremiumCard className="rounded-b-none px-5 pt-4" style={{ clipPath: 'none' }}>
          <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ backgroundColor: NEUTRAL.chipInactiveAlt }} aria-hidden="true" />

          <div className="flex items-center gap-2.5">
            <span
              className="relative shrink-0 inline-flex items-center justify-center rounded-[10px] overflow-hidden w-8 h-8"
              style={{
                backgroundImage: `radial-gradient(circle at 30% 25%, ${theme.main}55, transparent 65%)`,
                border: `1px solid ${theme.main}55`,
              }}
              aria-hidden="true"
            >
              <span
                className="block"
                style={{
                  width: 17,
                  height: 17,
                  backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${theme.main} 65%, white), color-mix(in srgb, ${theme.main} 85%, black))`,
                  WebkitMaskImage: `url(${METRIC_ICON_IMAGES[icon]})`,
                  maskImage: `url(${METRIC_ICON_IMAGES[icon]})`,
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                }}
              />
            </span>
            <p className="text-[13px] uppercase tracked" style={{ color: TEXT.body, fontWeight: 500 }}>
              {label}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="ml-auto flex items-center justify-center w-8 h-8 rounded-full text-lg leading-none"
              style={{ color: TEXT.secondary }}
            >
              ×
            </button>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <p className="font-mono leading-none" style={{ color: TEXT.title, fontSize: 34, fontWeight: 700 }}>
              {valueText}
            </p>
            {deltaText && (
              <p className="font-semibold leading-none flex items-center gap-1" style={{ color: deltaColor, fontSize: 14 }}>
                {deltaDir && <span aria-hidden="true">{deltaDir === 'up' ? '↑' : '↓'}</span>}
                {deltaText}
              </p>
            )}
          </div>

          <div className="my-4 h-px" style={{ backgroundColor: withAlpha('#FFFFFF', '0f') }} />

          {goal ? (
            <div className="pb-5">
              <div className="flex items-baseline justify-between">
                <p className="text-[11px] uppercase tracked" style={{ color: TEXT.secondary }}>
                  Goal
                </p>
                <p className="font-mono text-[13px]" style={{ color: TEXT.body }}>
                  {goal.targetText}
                </p>
              </div>
              {goal.progressPct != null && (
                <>
                  <div
                    className="mt-2 h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: NEUTRAL.chipInactive }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${goal.progressPct}%`, backgroundColor: COLORS.amber }}
                    />
                  </div>
                  <p className="mt-1 text-right font-mono text-[11px]" style={{ color: COLORS.amber }}>
                    {Math.round(goal.progressPct)}%
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="pb-5">
              <p className="text-[12px]" style={{ color: TEXT.secondary }}>
                ยังไม่ได้ตั้งเป้าหมายสำหรับ {label}
              </p>
              <Link href="/health" className="mt-1.5 inline-block text-[12px] hover:underline" style={{ color: COLORS.amber }}>
                ตั้งเป้าหมายที่หน้าสุขภาพ →
              </Link>
            </div>
          )}
        </PremiumCard>
      </div>

      <style jsx>{`
        .metric-sheet-backdrop {
          animation: metric-sheet-backdrop-in 180ms ease forwards;
        }
        .metric-sheet-panel {
          animation: metric-sheet-panel-in 220ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes metric-sheet-backdrop-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
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
