import Image from 'next/image'
import type { Insight } from '@/lib/dashboardStats'

const KIND_STYLE: Record<Insight['kind'], { border: string; accent: string; chipBg: string }> = {
  positive: { border: 'border-l-amber', accent: 'text-amber', chipBg: '#7A9B5722' },
  warning: { border: 'border-l-rust', accent: 'text-rusttext', chipBg: '#C1503A22' },
}

export default function InsightCard({
  insight,
  showChevron = false,
  imageSrc,
}: {
  insight: Insight
  showChevron?: boolean
  // รูปไอคอนจริง (ถ้ามีสำหรับ insight นี้) — ไม่ระบุ = ใช้ emoji เดิมของ insight แทน
  imageSrc?: string
}) {
  const style = KIND_STYLE[insight.kind]
  return (
    <div className={`rounded-lg bg-surface border border-line shadow-elevated border-l-[3px] ${style.border} px-4 py-3 flex items-start gap-3`}>
      {imageSrc ? (
        <span className="w-8 h-8 shrink-0 inline-block" aria-hidden="true">
          <Image src={imageSrc} alt="" width={32} height={32} className="w-full h-full object-contain" />
        </span>
      ) : (
        <span
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-base leading-none"
          style={{ backgroundColor: style.chipBg }}
          aria-hidden="true"
        >
          {insight.icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] tracked uppercase text-muted">Insight</p>
        <p className={`font-display text-sm tracked uppercase mt-0.5 ${style.accent}`}>{insight.title}</p>
        <p className="text-xs text-muted mt-0.5">{insight.detail}</p>
      </div>
      {showChevron && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted shrink-0 mt-1"
          aria-hidden="true"
        >
          <polyline points="9 6 15 12 9 18" />
        </svg>
      )}
    </div>
  )
}
