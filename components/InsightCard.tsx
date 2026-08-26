import Image from 'next/image'
import type { Insight } from '@/lib/dashboardStats'
import MetricIcon, { type MetricIconName } from './MetricIcon'

const KIND_STYLE: Record<Insight['kind'], { border: string; accent: string; chipBg: string; chipColor: string }> = {
  positive: { border: 'border-l-amber', accent: 'text-amber', chipBg: '#7A9B5722', chipColor: '#7A9B57' },
  warning: { border: 'border-l-rust', accent: 'text-rusttext', chipBg: '#C1503A22', chipColor: '#C1503A' },
}

// v29: ฟีดแบ็ก "Insight ควรเรียงจาก ต้องแก้ → ควรรู้ → ทำได้ดี ให้เป็น Coach ไม่ใช่แค่ Report" — insight.tier
// (มีเฉพาะจุดที่มาจาก computeHealthTrendInsights ตอนนี้ — insight producer อื่น เช่น
// computeVolumeTrendInsights ไม่ได้ใส่ tier มา = undefined = ใช้ KIND_STYLE เดิมเป๊ะ ไม่กระทบ) แทนที่
// border/accent/chip เดิมด้วยชุดสี 3 ระดับ พร้อม label แทนคำว่า "Insight" เฉยๆ ให้เห็นความสำคัญทันที
const TIER_STYLE: Record<'attention' | 'watch' | 'good', { border: string; accent: string; chipBg: string; chipColor: string; label: string }> = {
  attention: { border: 'border-l-rust', accent: 'text-rusttext', chipBg: '#C1503A22', chipColor: '#C1503A', label: '🔴 ควรแก้' },
  watch: { border: 'border-l-amber', accent: 'text-amber', chipBg: '#E8A33D22', chipColor: '#E8A33D', label: '🟡 ควรติดตาม' },
  good: { border: 'border-l-moss', accent: 'text-moss', chipBg: '#7A9B5722', chipColor: '#7A9B57', label: '🟢 ทำได้ดี' },
}

export default function InsightCard({
  insight,
  showChevron = false,
  imageSrc,
  metricIcon,
}: {
  insight: Insight
  showChevron?: boolean
  // รูปไอคอนจริง (ถ้ามีสำหรับ insight นี้) — ไม่ระบุ = ใช้ emoji เดิมของ insight แทน
  imageSrc?: string
  // ไอคอนเส้นชุดเดียวกับ BodyMetricsRow (น้ำหนัก/ไขมัน/กล้ามเนื้อ/มวลไขมัน/BMI) — ใช้กับ insight
  // ที่เป็นเทรนด์สัดส่วนร่างกาย แทน emoji เดิม ให้ภาพลักษณ์ตรงกับการ์ดสรุปด้านบนสุดของหน้า
  // ลำดับความสำคัญ: imageSrc > metricIcon > emoji ของ insight เดิม
  metricIcon?: MetricIconName
}) {
  const tierStyle = insight.tier ? TIER_STYLE[insight.tier] : null
  const style = tierStyle ?? KIND_STYLE[insight.kind]
  return (
    <div className={`rounded-lg bg-surface border border-line shadow-elevated border-l-[3px] ${style.border} px-4 py-3 flex items-start gap-3`}>
      {imageSrc ? (
        <span className="w-8 h-8 shrink-0 inline-block" aria-hidden="true">
          <Image src={imageSrc} alt="" width={32} height={32} className="w-full h-full object-contain" />
        </span>
      ) : metricIcon ? (
        <span
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: style.chipBg }}
          aria-hidden="true"
        >
          <MetricIcon name={metricIcon} color={style.chipColor} />
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
        <p className="text-[10px] tracked uppercase text-muted">{tierStyle ? tierStyle.label : 'Insight'}</p>
        <p className={`font-display text-sm tracked uppercase mt-0.5 ${style.accent}`}>{insight.title}</p>
        {/* v54: ฟีดแบ็ก "อ่านเหมือนรายงาน ไม่ใช่ Dashboard — อยากได้ ↑3.7% · 90 วัน แบบ chip สั้นๆ แยกจาก
            คำแนะนำ แทน paragraph ยาว" — deltaLabel/actionLabel เป็น optional field ใหม่ใน Insight (มีเฉพาะ
            computeHealthTrendInsights) มีค่าก็ใช้ compact 2 บรรทัดนี้แทน ไม่มีค่า (insight จากที่อื่น เช่น
            Dashboard/Coach) fallback ไป detail แบบเดิมเป๊ะ ไม่กระทบจุดใช้ร่วม */}
        {insight.deltaLabel ? (
          <>
            <p className="text-xs font-mono font-semibold mt-1" style={{ color: style.chipColor }}>
              {insight.deltaLabel}
            </p>
            {insight.actionLabel && <p className="text-[11px] text-muted mt-0.5">{insight.actionLabel}</p>}
          </>
        ) : (
          <p className="text-xs text-muted mt-0.5">{insight.detail}</p>
        )}
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
