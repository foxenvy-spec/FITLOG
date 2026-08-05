'use client'

import Link from 'next/link'
import { COLORS, withAlpha, cncCornerClipPath, CARD_GRADIENT_CSS, TITANIUM_MESH_CSS, CARD_BORDER_CSS, CARD_INSET_SHADOW } from '@/lib/theme'
import { recoveryStatusColor } from '@/lib/dashboardStats'
import PremiumCard from './ui/PremiumCard'
import AnimatedBarFill from './AnimatedBarFill'

interface AICoachCompactCardProps {
  message: string
  /** กลุ่มกล้ามเนื้อที่แนะนำวันนี้ + % ฟื้นตัว (ชุดเดียวกับที่ TodaysFocusCard/RecommendedProgramCard
   * ใช้อยู่แล้ว จาก data.muscleRecommendation) — มีแล้วโชว์ headline + recovery bar ตามมอคอัพใหม่
   * ไม่มี (ยังไม่เคยฝึกกลุ่มไหนเลย) fallback กลับไปโชว์ message เฉยๆ แบบเดิม */
  muscleRecommendation: { muscleGroup: string; pct: number } | null
  href?: string
}

// v33: "AI Coach ยังเป็นรายการธรรมดา ควรเป็น Hero Card" — เดิมเป็นแถวเดียวบรรทัดเดียว (avatar + ข้อความ
// AI-generated สั้นๆ + ปุ่มเล็ก) น้ำหนักภาพเท่าการ์ดข้อมูลทั่วไป (Streak/Weekly Goal) ทั้งที่เป็นฟีเจอร์
// เด่นของแอป — ยกระดับเป็นโครงสร้างใหญ่ขึ้น (headline ใหญ่ + recovery bar + ไอคอน AI เด่นขึ้น) แต่ "นิ่ง"
// ตามที่ยืนยัน (ไม่มี glow หมุน/เรืองแสงเพิ่ม) เพราะ Today's Workout ยังเป็น Hero Card ใบเดียวที่มี
// Motion ตามกฎที่ตั้งไว้ก่อนหน้า ("Hero มีแค่ใบเดียว ไม่งั้นแข่งกันเอง") — การ์ดนี้เด่นด้วยโครงสร้าง/
// ขนาด ไม่ใช่ด้วยแอนิเมชัน
export default function AICoachCompactCard({ message, muscleRecommendation, href = '/coach' }: AICoachCompactCardProps) {
  const barColor = muscleRecommendation ? recoveryStatusColor(muscleRecommendation.pct) : COLORS.amber

  return (
    <PremiumCard as={Link} href={href} className="flex items-center gap-3 px-4 py-4 active:scale-[0.99] transition">
      <div className="min-w-0 flex-1">
        <p className="font-display text-[10px] tracked uppercase text-amber flex items-center gap-1">
          <span aria-hidden="true">✨</span> AI Coach
        </p>
        {muscleRecommendation ? (
          <>
            <p className="font-display tracked uppercase text-ink mt-1 truncate" style={{ fontSize: 15, lineHeight: 1.3 }}>
              วันนี้เหมาะกับ <span className="text-amber">{muscleRecommendation.muscleGroup}</span>
            </p>
            <div className="flex items-center gap-2 mt-2.5">
              <p className="text-[9px] tracked uppercase text-muted shrink-0">Recovery</p>
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }}>
                <AnimatedBarFill pct={muscleRecommendation.pct} color={barColor} />
              </div>
              <p className="text-[10px] font-mono shrink-0" style={{ color: barColor }}>
                {muscleRecommendation.pct}%
              </p>
            </div>
          </>
        ) : (
          <p className="text-xs text-ink mt-1 truncate">{message}</p>
        )}
        <span className="inline-flex mt-3 text-[10px] font-display tracked uppercase text-amber border border-amber/40 rounded-full px-3 py-1.5">
          ดูคำแนะนำ ›
        </span>
      </div>
      <AiVisorIcon />
    </PremiumCard>
  )
}

// ไอคอน AI แบบเรขาคณิต (ไม่ใช่รูปหุ่นยนต์จริง — ไม่มีภาพ asset ให้ใช้) — ใช้ภาษาดีไซน์เดียวกับทั้งแอป
// (มุมตัด CNC/ไล่สีไทเทเนียม/mesh) แทนการวาดหน้าหุ่นยนต์แบบ freehand ให้เข้าธีมโดยอัตโนมัติ — เส้น "Visor"
// เรืองแสงสีอำพันแนวนอนแทนดวงตา นิ่งสนิท (ไม่มี pulse) ตามกฎ "Hero มีแค่ใบเดียว" ข้างบน
function AiVisorIcon() {
  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{
        width: 52,
        height: 52,
        borderRadius: 16,
        clipPath: cncCornerClipPath('tr', 14, 3),
        backgroundImage: [TITANIUM_MESH_CSS, CARD_GRADIENT_CSS].join(', '),
        border: `1px solid ${CARD_BORDER_CSS}`,
        boxShadow: CARD_INSET_SHADOW,
      }}
      aria-hidden="true"
    >
      <span
        className="absolute rounded-full"
        style={{
          left: 8,
          right: 8,
          top: '44%',
          height: 3,
          background: COLORS.amber,
          boxShadow: `0 0 6px ${COLORS.amber}, 0 0 14px ${withAlpha(COLORS.amber, '88')}`,
        }}
      />
      <span className="absolute rounded-full" style={{ left: 11, bottom: 11, width: 3, height: 3, background: withAlpha(COLORS.amber, '55') }} />
      <span className="absolute rounded-full" style={{ right: 11, bottom: 11, width: 3, height: 3, background: withAlpha(COLORS.amber, '30') }} />
    </div>
  )
}
