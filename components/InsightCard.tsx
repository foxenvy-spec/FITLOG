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
// v63: ฟีดแบ็ก "Body Fat 25.1% ถูกจัดว่า 'ปกติ' (ตามเกณฑ์สุขภาพทั่วไป) แต่ Insight บอก 'ควรแก้' — คำว่า
// 'แก้' แรงไปเมื่อเทียบกับสถานะปกติ ทำให้ดูขัดกัน ทั้งที่ 'ควรแก้' ในที่นี้หมายถึงเทียบกับเป้าหมายส่วนตัว ไม่ใช่
// ผิดปกติทางสุขภาพ" — เปลี่ยนจาก "ควรแก้" เป็น "ควรปรับปรุง" (นุ่มกว่า สื่อว่ายังห่างจากเป้าหมาย ไม่ใช่ผิดปกติ)
// v68: ฟีดแบ็ก "อยากได้ tier ที่ 4 แยกจาก 🟡 ควรติดตาม สำหรับ insight ที่เป็นแค่ข้อมูลติดตามเฉยๆ ไม่มีสัญญาณ
// เตือนจริง (เช่น น้ำหนักเพิ่มที่ไม่มีเป้าหมายกำกับทิศทาง)" — เพิ่ม tracking ใช้สี steel (neutral tier ตามระบบสี
// ที่ตกลงกันไว้) แยกจาก amber ของ watch ที่ยังสงวนไว้สำหรับสัญญาณเตือนจริงเท่านั้น
const TIER_STYLE: Record<'attention' | 'watch' | 'tracking' | 'good', { border: string; accent: string; chipBg: string; chipColor: string; label: string }> = {
  attention: { border: 'border-l-rust', accent: 'text-rusttext', chipBg: '#C1503A22', chipColor: '#C1503A', label: '🔴 ควรปรับปรุง' },
  watch: { border: 'border-l-amber', accent: 'text-amber', chipBg: '#E8A33D22', chipColor: '#E8A33D', label: '🟡 ควรติดตาม' },
  tracking: { border: 'border-l-steel', accent: 'text-steel', chipBg: '#6C8CA822', chipColor: '#6C8CA8', label: 'ℹ️ ติดตามข้อมูล' },
  good: { border: 'border-l-moss', accent: 'text-moss', chipBg: '#7A9B5722', chipColor: '#7A9B57', label: '🟢 ทำได้ดี' },
}

export default function InsightCard({
  insight,
  showChevron = false,
  imageSrc,
  metricIcon,
  recommendationsHref,
  minHeightClassName = '',
}: {
  insight: Insight
  showChevron?: boolean
  // รูปไอคอนจริง (ถ้ามีสำหรับ insight นี้) — ไม่ระบุ = ใช้ emoji เดิมของ insight แทน
  imageSrc?: string
  // ไอคอนเส้นชุดเดียวกับ BodyMetricsRow (น้ำหนัก/ไขมัน/กล้ามเนื้อ/มวลไขมัน/BMI) — ใช้กับ insight
  // ที่เป็นเทรนด์สัดส่วนร่างกาย แทน emoji เดิม ให้ภาพลักษณ์ตรงกับการ์ดสรุปด้านบนสุดของหน้า
  // ลำดับความสำคัญ: imageSrc > metricIcon > emoji ของ insight เดิม
  metricIcon?: MetricIconName
  // v71: ฟีดแบ็ก "Insight card ควรมีทาง 'ดูคำแนะนำ →' ต่อไปยังการ์ดคำแนะนำ ไม่ใช่แค่บอกปัญหาเฉยๆ" —
  // ไม่บังคับ (undefined = ไม่โชว์ลิงก์ เหมือนพฤติกรรมเดิมทุกจุดที่ใช้ InsightCard อยู่แล้ว เช่น Coach/
  // Dashboard/แท็บแนวโน้มที่มี Recommendations การ์ดอยู่ติดกันด้านล่างอยู่แล้วไม่ต้องมีลิงก์) จุดเรียกใช้
  // (health/page.tsx แท็บภาพรวม) ส่ง "#recommendations" เข้ามาเท่านั้น — โชว์เฉพาะตอนมี actionLabel จริง
  // (ตัว insight ที่มีคำแนะนำให้ตามไปดูจริง ไม่ใช่ insight เฉยๆ ที่ไม่มีอะไรให้แนะนำต่อ)
  recommendationsHref?: string
  // v72: ฟีดแบ็ก "4 การ์ด Body Insights สูงไม่เท่ากันบนมือถือ (stack แนวตั้ง คนละแถว grid เลยไม่ stretch
  // ให้อัตโนมัติ) เพราะเนื้อหายาว/สั้นไม่เท่ากันจริง (การ์ดที่มี recentNote ยาวกว่าที่ไม่มี)" — ไม่บังคับ
  // (undefined = ไม่มีผล เหมือนเดิมทุกจุดที่ใช้อยู่ เช่น Coach/Dashboard/InsightCarousel) จุดเรียกใช้ที่
  // อยากให้สูงเท่ากัน (health/page.tsx แท็บภาพรวม) ส่งค่ามาเอง แทนที่จะบังคับ min-height ตายตัวในนี้ที่
  // อาจไปกระทบจุดใช้อื่นที่ไม่ได้ขอ (เช่น carousel ที่มีขนาดการ์ดของตัวเองอยู่แล้ว)
  minHeightClassName?: string
}) {
  const tierStyle = insight.tier ? TIER_STYLE[insight.tier] : null
  const style = tierStyle ?? KIND_STYLE[insight.kind]
  // v55: ฟีดแบ็ก "การ์ด Body Insights ทุกใบมีน้ำหนักทางสายตาใกล้เคียงกัน ต้องอ่านทีละใบถึงจะรู้ว่าอะไรสำคัญ
  // ที่สุด — อยากให้ระดับความสำคัญบอกด้วยน้ำหนักภาพ ไม่ใช่แค่สี" — เดิมทั้ง 3 tier ใช้พื้นหลัง bg-surface
  // เรียบเหมือนกันหมด ต่างกันแค่เส้นซ้าย/ไอคอน/label — เพิ่มพื้นหลังโทนแดงจางๆ เฉพาะ tier 'attention'
  // (ต้องแก้) ให้ใบนั้นเด่นขึ้นจริงเมื่อวางเทียบกับใบอื่น ไม่แตะ watch/good (ยังคงพื้นเรียบเหมือนเดิม) —
  // ผลเฉพาะ insight ที่มี tier (ตอนนี้มีแค่ computeHealthTrendInsights) การ์ด Dashboard/Coach ไม่กระทบ
  const attentionBg = insight.tier === 'attention' ? 'bg-rustdim/25' : 'bg-surface'
  // v56: ฟีดแบ็ก "Health Score + Body Insights อยู่ติดกันแน่นไป ลดความหนาแน่นของ Body Insights ~10-15%
  // โดยเฉพาะข้อความรอง" — ลด padding การ์ด (px-4 py-3 → px-3.5 py-2.5), ไอคอน chip (8→7), และ margin
  // ระหว่างบรรทัดข้อความรอง (mt-1/mt-0.5 → mt-0.5/mt-px) เล็กน้อย ไม่กระทบ hierarchy/สีที่เพิ่งทำรอบก่อน
  return (
    <div
      className={`rounded-lg ${attentionBg} border border-line shadow-elevated border-l-[3px] ${style.border} px-3.5 py-2.5 flex items-start gap-2.5 ${minHeightClassName}`}
    >
      {imageSrc ? (
        <span className="w-7 h-7 shrink-0 inline-block" aria-hidden="true">
          <Image src={imageSrc} alt="" width={28} height={28} className="w-full h-full object-contain" />
        </span>
      ) : metricIcon ? (
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: style.chipBg }}
          aria-hidden="true"
        >
          <MetricIcon name={metricIcon} color={style.chipColor} />
        </span>
      ) : (
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm leading-none"
          style={{ backgroundColor: style.chipBg }}
          aria-hidden="true"
        >
          {insight.icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] tracked uppercase text-muted">{tierStyle ? tierStyle.label : 'Insight'}</p>
        <p className={`font-display text-sm tracked uppercase mt-0.5 ${style.accent}`}>{insight.title}</p>
        {/* v73: ฟีดแบ็ก "อายุร่างกาย +3.1% ไม่ชัดว่าคืออะไร" — noteText เป็นคำอธิบายสั้นๆ ของตัวชี้วัดเอง
            (คนละความหมายกับ recentNote ที่บอกแนวโน้มล่าสุดสวนทาง) ไม่บังคับ มีเฉพาะ trend-bodyage-* ตอนนี้ */}
        {insight.noteText && <p className="text-[10px] text-muted/70 italic mt-0.5">{insight.noteText}</p>}
        {/* v54: ฟีดแบ็ก "อ่านเหมือนรายงาน ไม่ใช่ Dashboard — อยากได้ ↑3.7% · 90 วัน แบบ chip สั้นๆ แยกจาก
            คำแนะนำ แทน paragraph ยาว" — deltaLabel/actionLabel เป็น optional field ใหม่ใน Insight (มีเฉพาะ
            computeHealthTrendInsights) มีค่าก็ใช้ compact 2 บรรทัดนี้แทน ไม่มีค่า (insight จากที่อื่น เช่น
            Dashboard/Coach) fallback ไป detail แบบเดิมเป๊ะ ไม่กระทบจุดใช้ร่วม */}
        {insight.deltaLabel ? (
          <>
            <p className="text-xs font-mono font-semibold mt-0.5" style={{ color: style.chipColor }}>
              {insight.deltaLabel}
            </p>
            {insight.actionLabel && <p className="text-[10.5px] text-muted mt-px">{insight.actionLabel}</p>}
            {/* v60: ฟีดแบ็ก "Top Summary กับ Body Insights ขัดกันในสายตา (คนละช่วงเวลา) — บอกแนวโน้มล่าสุด
                ด้วยจะกลายเป็น insight ที่ฉลาดขึ้น" — optional เหมือน deltaLabel มีเฉพาะตอนทิศทางล่าสุดสวนทาง
                ทิศทางระยะยาวของ insight นี้จริงๆ */}
            {insight.recentNote && <p className="text-[10.5px] text-steel mt-0.5">{insight.recentNote}</p>}
            {recommendationsHref && insight.actionLabel && (
              <a href={recommendationsHref} className="inline-block text-[10.5px] font-medium mt-1" style={{ color: style.chipColor }}>
                ดูคำแนะนำ →
              </a>
            )}
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
