'use client'

import Link from 'next/link'
import Image from 'next/image'
import { COLORS, NEUTRAL, withAlpha, CARD_GRADIENT_CSS, TITANIUM_MESH_CSS, CARD_BORDER_CSS, CARD_INSET_SHADOW } from '@/lib/theme'
import { recoveryStatusColor } from '@/lib/dashboardStats'
import PremiumCard from './ui/PremiumCard'
import AnimatedBarFill from './AnimatedBarFill'

interface AICoachCompactCardProps {
  message: string
  /** กลุ่มกล้ามเนื้อที่แนะนำวันนี้ + % ฟื้นตัว (ชุดเดียวกับที่ TodaysFocusCard/RecommendedProgramCard
   * ใช้อยู่แล้ว จาก data.muscleRecommendation) — มีแล้วโชว์ headline + recovery bar + stat chip ตามมอคอัพ
   * ไม่มี (ยังไม่เคยฝึกกลุ่มไหนเลย) fallback กลับไปโชว์ message เฉยๆ แบบเดิม */
  muscleRecommendation: { muscleGroup: string; pct: number } | null
  href?: string
  /** เผื่อมีรูป AI Coach จริงในอนาคต (สี่เหลี่ยมจัตุรัส พื้นหลังโปร่งใส ตามสเปคที่คุยกันไว้) —
   * ยังไม่มีไฟล์ตอนนี้ (optional) ไม่ส่งมาจะใช้ไอคอนเรขาคณิต (AiVisorFace) แทนแบบเดิม */
  avatarSrc?: string
}

// v34: ทำตามมอคอัพ "AI Coach Card" ที่ส่งมา (avatar วงแหวน + headline ใหญ่ + recovery bar + stat chip 4
// ช่อง + CTA pill พร้อมปุ่มลูกศรวงกลม) — แต่ 3 ใน 4 chip ในมอคอัพ (พลังงาน/การนอน/ความเครียด) เป็นข้อมูลที่
// แอปยังไม่มีจริง (ยังไม่เชื่อมต่อ Health App — ดู TodayHealthStatsRow ที่ตั้งใจโชว์การ์ด "เชื่อมต่อ"
// แทนตัวเลขปลอมด้วยเหตุผลเดียวกัน) — ยืนยันกับผู้ใช้แล้วว่าให้โชว์ 3 ช่องนี้เป็น Locked/Coming Soon (ไอคอน
// กุญแจ จางลง) แทนตัวเลขที่ไม่มีจริง เหลือแค่ "ความพร้อม" ที่คำนวณจาก muscleRecommendation.pct จริง
export default function AICoachCompactCard({ message, muscleRecommendation, href = '/coach', avatarSrc }: AICoachCompactCardProps) {
  const barColor = muscleRecommendation ? recoveryStatusColor(muscleRecommendation.pct) : COLORS.amber

  return (
    <PremiumCard as={Link} href={href} className="flex flex-col gap-3 px-4 py-4 active:scale-[0.99] transition">
      <div className="flex items-center gap-3">
        <AiRingAvatar src={avatarSrc} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[10px] tracked uppercase text-amber flex items-center gap-1">
            <span aria-hidden="true">✨</span> AI Coach
          </p>
          {muscleRecommendation ? (
            <>
              <p className="font-display tracked uppercase text-ink mt-1 truncate" style={{ fontSize: 15, lineHeight: 1.3 }}>
                วันนี้เหมาะกับ <span className="text-amber">{muscleRecommendation.muscleGroup}</span>
              </p>
              <div className="flex items-center gap-2 mt-2">
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
        </div>
      </div>

      {muscleRecommendation && (
        <div className="grid grid-cols-4 gap-1.5">
          <StatChip icon="💪" label="ความพร้อม" value={readinessLabel(muscleRecommendation.pct)} color={barColor} />
          <LockedChip icon="⚡" label="พลังงาน" />
          <LockedChip icon="🌙" label="การนอน" />
          <LockedChip icon="💗" label="ความเครียด" />
        </div>
      )}

      <span className="relative flex items-center justify-between text-[10px] font-display tracked uppercase text-amber border border-amber/40 rounded-full pl-4 pr-1.5 py-1.5">
        ดูคำแนะนำ
        <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ border: `1px solid ${withAlpha(COLORS.amber, '55')}` }} aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M9 6l6 6-6 6" stroke={COLORS.amber} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
    </PremiumCard>
  )
}

// เกณฑ์เดียวกับ recoveryStatusColor (lib/dashboardStats.ts) — 0-40% แดง/41-75% เหลือง/76-100% เขียว —
// แปลงเป็นข้อความแทนสีเฉยๆ ให้ chip "ความพร้อม" อ่านออกว่าคืออะไร ไม่ใช่แค่แถบสี
function readinessLabel(pct: number): string {
  if (pct >= 76) return 'ดีมาก'
  if (pct >= 41) return 'ปานกลาง'
  return 'ยังไม่พร้อม'
}

function StatChip({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 rounded-xl py-2 px-1"
      style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}
    >
      <span className="text-xs" aria-hidden="true">
        {icon}
      </span>
      <span className="text-[7.5px] tracked uppercase text-muted text-center leading-tight">{label}</span>
      <span className="text-[9.5px] font-display tracked" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

// chip "เร็วๆ นี้" — พลังงาน/การนอน/ความเครียด ต้องเชื่อมต่อ Health App ก่อนถึงจะมีข้อมูลจริง (เหตุผล
// เดียวกับ TodayHealthStatsRow) โชว์ไอคอนกุญแจแทนตัวเลข ไม่ใช้ค่า hardcode ที่ไม่มีอะไรรองรับจริง
function LockedChip({ icon, label }: { icon: string; label: string }) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 rounded-xl py-2 px-1"
      style={{ background: 'rgba(255,255,255,.015)', border: '1px solid rgba(255,255,255,.04)' }}
    >
      <span className="text-xs opacity-40" aria-hidden="true">
        {icon}
      </span>
      <span className="text-[7.5px] tracked uppercase text-muted text-center leading-tight opacity-50">{label}</span>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="11" width="14" height="9" rx="2" stroke={NEUTRAL.mutedIcon} strokeWidth="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={NEUTRAL.mutedIcon} strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  )
}

// Avatar วงแหวน — ใช้ภาษา "donut ring" เดียวกับ FitnessRing/GoalRing ที่ใช้ทั่วแอป (ไม่ใช่กรอบสี่เหลี่ยม
// แยกวัสดุ) ให้ AI Coach avatar อยู่ในตระกูลเดียวกับวง progress อื่นๆ — ตรงกลางยังเป็นไอคอนเรขาคณิต
// (ไม่มีรูปหุ่นยนต์จริงให้ใช้) นิ่งสนิท ไม่มี pulse/rotate ตามกฎ "Hero มีแค่ใบเดียว" — รับ src ไว้เผื่อมี
// ไฟล์รูปจริงในอนาคต (สลับมาโชว์รูปแทนไอคอนได้ทันทีโดยไม่ต้องแก้โครงสร้างการ์ด)
function AiRingAvatar({ src }: { src?: string }) {
  const size = 64
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <div
        className="absolute inset-0 rounded-full"
        style={{ border: `1.5px solid ${withAlpha(COLORS.amber, '45')}`, boxShadow: `0 0 10px ${withAlpha(COLORS.amber, '25')}` }}
      />
      <div
        className="absolute rounded-full overflow-hidden flex items-center justify-center"
        style={{
          inset: 5,
          backgroundImage: [TITANIUM_MESH_CSS, CARD_GRADIENT_CSS].join(', '),
          border: `1px solid ${CARD_BORDER_CSS}`,
          boxShadow: CARD_INSET_SHADOW,
        }}
      >
        {src ? (
          <Image src={src} alt="" width={size} height={size} className="w-full h-full object-cover" />
        ) : (
          <span className="relative block" style={{ width: '58%' }}>
            <span
              className="absolute rounded-full"
              style={{
                left: 0,
                right: 0,
                top: '46%',
                height: 3,
                background: COLORS.amber,
                boxShadow: `0 0 6px ${COLORS.amber}, 0 0 14px ${withAlpha(COLORS.amber, '88')}`,
              }}
            />
          </span>
        )}
      </div>
    </div>
  )
}
