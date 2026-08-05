'use client'

import Link from 'next/link'
import Image from 'next/image'
import {
  COLORS,
  NEUTRAL,
  withAlpha,
  CARD_GRADIENT_CSS,
  TITANIUM_MESH_CSS,
  CARD_BORDER_CSS,
  CARD_INSET_SHADOW,
  AMBER_GRADIENT_CSS,
  AMBER_GLOW_SHADOW,
} from '@/lib/theme'
import { recoveryStatusColor } from '@/lib/dashboardStats'
import { MUSCLE_GROUP_BODY_REGION, DEFAULT_SECONDARY_BY_PRIMARY, type MuscleGroup } from '@/lib/muscle-groups'
import PremiumCard from './ui/PremiumCard'
import AnimatedBarFill from './AnimatedBarFill'

interface AICoachCompactCardProps {
  message: string
  /** กลุ่มกล้ามเนื้อที่แนะนำวันนี้ + % ฟื้นตัว (ชุดเดียวกับที่ TodaysFocusCard/RecommendedProgramCard
   * ใช้อยู่แล้ว จาก data.muscleRecommendation) — มีแล้วโชว์ headline + recovery bar + stat chip ตามมอคอัพ
   * ไม่มี (ยังไม่เคยฝึกกลุ่มไหนเลย) fallback กลับไปโชว์ message เฉยๆ แบบเดิม */
  muscleRecommendation: { muscleGroup: string; pct: number } | null
  href?: string
  /** รูป AI Coach จริง (public/icons/ai-coach-avatar.png ที่ผู้ใช้ให้มา — 1024x1024 โปร่งใสอยู่แล้ว
   * ไม่ต้อง crop/แก้พื้นหลังเพิ่ม) ดีฟอลต์เป็นไฟล์นี้เสมอ — ส่ง avatarSrc={undefined} เพื่อกลับไปใช้
   * ไอคอนเรขาคณิต fallback ใน AiRingAvatar แทนได้ถ้าต้องการจุดอื่นที่ยังไม่มีรูป */
  avatarSrc?: string
}

// v34: ทำตามมอคอัพ "AI Coach Card" ที่ส่งมา (avatar วงแหวน + headline ใหญ่ + recovery bar + stat chip +
// CTA pill พร้อมปุ่มลูกศรวงกลม) — 2 ใน 3 chip (พลังงาน/การนอน) เป็นข้อมูลที่แอปยังไม่มีจริง (ยังไม่เชื่อมต่อ
// Health App — ดู TodayHealthStatsRow ที่ตั้งใจโชว์การ์ด "เชื่อมต่อ" แทนตัวเลขปลอมด้วยเหตุผลเดียวกัน) —
// ยืนยันกับผู้ใช้แล้วว่าให้โชว์ 2 ช่องนี้เป็น Locked/Coming Soon (ไอคอนกุญแจ จางลง) แทนตัวเลขที่ไม่มีจริง
// เหลือแค่ "ความพร้อม" ที่คำนวณจาก muscleRecommendation.pct จริง
// v35: ตัด "ความเครียด" ออก (chip ที่ 4 เดิม) ตามคำขอ — เหลือ 3 chip (grid-cols-4 -> grid-cols-3) และขยาย
// avatar ใหญ่ขึ้น (64px -> 88px) ตามคำขอ "อยากให้รูปใหญ่กว่านี้"
// v36: ผู้ใช้ส่งรูป AI Coach จริงมาแล้ว (public/icons/ai-coach-avatar.png) — มี alpha โปร่งใสอยู่แล้ว —
// ตั้งเป็นดีฟอลต์ของ avatarSrc แทนที่ไอคอนเรขาคณิต fallback เดิม แล้ว scale(1.16) ปิดช่องว่างก่อนวงแหวน
// v37: ฟีดแบ็ก 6 ข้อรวด — (1) Robot ยังเล็ก ซูมเพิ่มอีก (ไม่แตะขนาดวงแหวน) (2) Headline สั้นไป เพิ่ม
// หมวดร่างกาย (Upper/Lower/Core Body จาก MUSCLE_GROUP_BODY_REGION) + กลุ่มที่ฝึกด้วยกัน (จาก
// DEFAULT_SECONDARY_BY_PRIMARY ตารางเดียวกับที่ guessSecondaryMuscles ใช้อยู่แล้ว ไม่ใช่ข้อมูลใหม่)
// (3) Recovery Bar เพิ่มคำบรรยายคุณภาพ (Excellent/Good/Needs Rest จาก pct จริง) ไม่ใช่แค่ตัวเลข
// (4) Chip แรก (ความพร้อม) เด่นกว่า 2 chip ที่เหลือ — สีพื้น/ขอบเข้มขึ้น + mini bar ใต้ค่า, locked chip
// จางลงอีก (5) ปุ่ม CTA เปลี่ยนจาก border-pill บางๆ เป็น gradient fill (AMBER_GRADIENT_CSS + glow —
// โทเคนเดียวกับปุ่ม Start Workout) (6) มุมขวาบนว่าง — ผู้ใช้เสนอ "AI Confidence 98%" ด้วย แต่ไม่มีข้อมูลจริง
// รองรับ (ไม่มีระบบให้คะแนนความมั่นใจ AI ในแอป) จึงใช้ "อัปเดตล่าสุด" แทน (จริง — คำนวณสดทุกครั้งที่เปิดหน้า)
export default function AICoachCompactCard({
  message,
  muscleRecommendation,
  href = '/coach',
  avatarSrc = '/icons/ai-coach-avatar.png',
}: AICoachCompactCardProps) {
  const barColor = muscleRecommendation ? recoveryStatusColor(muscleRecommendation.pct) : COLORS.amber
  const mg = muscleRecommendation?.muscleGroup as MuscleGroup | undefined
  const region = mg ? MUSCLE_GROUP_BODY_REGION[mg] : null
  const relatedGroups = mg ? [mg, ...(DEFAULT_SECONDARY_BY_PRIMARY[mg] ?? [])] : []

  return (
    <PremiumCard as={Link} href={href} className="flex flex-col gap-3 px-4 py-4 active:scale-[0.99] transition">
      <span className="absolute top-3 right-3 flex items-center gap-1 text-[8px] tracked uppercase text-muted" aria-hidden="true">
        <span className="w-1 h-1 rounded-full shrink-0" style={{ background: COLORS.moss }} />
        อัปเดตล่าสุด
      </span>

      <div className="flex items-center gap-3">
        <AiRingAvatar src={avatarSrc} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[10px] tracked uppercase text-amber flex items-center gap-1">
            <span aria-hidden="true">✨</span> AI Coach
          </p>
          {muscleRecommendation ? (
            <>
              <p className="text-[10px] tracked uppercase text-muted mt-1">วันนี้เหมาะกับ</p>
              <p className="font-display tracked uppercase text-amber truncate" style={{ fontSize: 17, lineHeight: 1.15 }}>
                {region}
              </p>
              <p className="text-[10px] text-muted truncate mt-0.5">{relatedGroups.join(' • ')}</p>

              <div className="flex items-center gap-2 mt-2.5">
                <p className="text-[9px] tracked uppercase text-muted shrink-0">Recovery</p>
                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }}>
                  <AnimatedBarFill pct={muscleRecommendation.pct} color={barColor} />
                </div>
                <p className="text-[10px] font-mono shrink-0" style={{ color: barColor }}>
                  {muscleRecommendation.pct}%
                </p>
              </div>
              <p className="text-[10px] font-display tracked uppercase mt-0.5" style={{ color: barColor }}>
                {readinessLabelEn(muscleRecommendation.pct)}
              </p>
            </>
          ) : (
            <p className="text-xs text-ink mt-1 truncate">{message}</p>
          )}
        </div>
      </div>

      {muscleRecommendation && (
        <div className="grid grid-cols-3 gap-1.5">
          <StatChip icon="💪" label="ความพร้อม" value={readinessLabel(muscleRecommendation.pct)} pct={muscleRecommendation.pct} color={barColor} />
          <LockedChip icon="⚡" label="พลังงาน" />
          <LockedChip icon="🌙" label="การนอน" />
        </div>
      )}

      <span
        className="relative flex items-center justify-between text-[10px] font-display tracked uppercase rounded-full pl-4 pr-1.5 py-1.5"
        style={{ background: AMBER_GRADIENT_CSS, boxShadow: AMBER_GLOW_SHADOW, color: NEUTRAL.onAmberText }}
      >
        ดูคำแนะนำ
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'rgba(0,0,0,.16)' }}
          aria-hidden="true"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M9 6l6 6-6 6" stroke={NEUTRAL.onAmberText} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
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

// เวอร์ชันอังกฤษตัวพิมพ์ใหญ่ — ใช้กับบรรทัด Recovery โดยตรง (แยกจาก readinessLabel ภาษาไทยที่ใช้ใน
// chip "ความพร้อม" อยู่แล้ว) ให้เข้าชุดกับ label ภาษาอังกฤษตัวพิมพ์ใหญ่อื่นในการ์ดนี้ (AI COACH, RECOVERY)
function readinessLabelEn(pct: number): string {
  if (pct >= 76) return 'Excellent'
  if (pct >= 41) return 'Good'
  return 'Needs Rest'
}

// v37: chip "ความพร้อม" ต้องเด่นกว่า 2 chip ที่เหลือ (ฟีดแบ็ก "ทั้งสามช่องเท่ากันหมดเลยดูแบน") — พื้น/ขอบ
// ใช้สีของค่าจริง (barColor) แทนสีเทากลางเดิม + เพิ่ม mini bar ใต้ค่า (pct จริงตัวเดียวกับ Recovery bar
// ด้านบน ไม่ใช่แถบตกแต่งลอยๆ)
function StatChip({ icon, label, value, pct, color }: { icon: string; label: string; value: string; pct: number; color: string }) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 rounded-xl py-2 px-1"
      style={{ background: withAlpha(color, '14'), border: `1px solid ${withAlpha(color, '40')}` }}
    >
      <span className="text-xs" aria-hidden="true">
        {icon}
      </span>
      <span className="text-[7.5px] tracked uppercase text-muted text-center leading-tight">{label}</span>
      <span className="text-[9.5px] font-display tracked" style={{ color }}>
        {value}
      </span>
      <div className="w-full h-[3px] rounded-full overflow-hidden mt-0.5" style={{ background: 'rgba(255,255,255,.1)' }}>
        <AnimatedBarFill pct={pct} color={color} />
      </div>
    </div>
  )
}

// chip "เร็วๆ นี้" — พลังงาน/การนอน ต้องเชื่อมต่อ Health App ก่อนถึงจะมีข้อมูลจริง (เหตุผล
// เดียวกับ TodayHealthStatsRow) โชว์ไอคอนกุญแจแทนตัวเลข ไม่ใช้ค่า hardcode ที่ไม่มีอะไรรองรับจริง
// v37: จางลงอีก ~10% (icon .4->.3, พื้น/ขอบลดลง) ให้ตัดกับ chip "ความพร้อม" ที่เด่นขึ้นชัดเจนกว่าเดิม
function LockedChip({ icon, label }: { icon: string; label: string }) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 rounded-xl py-2 px-1"
      style={{ background: 'rgba(255,255,255,.008)', border: '1px solid rgba(255,255,255,.03)' }}
    >
      <span className="text-xs opacity-30" aria-hidden="true">
        {icon}
      </span>
      <span className="text-[7.5px] tracked uppercase text-muted text-center leading-tight opacity-40">{label}</span>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true" opacity={0.7}>
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
  const size = 88
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
          // v37: ฟีดแบ็ก "Robot ยังเล็กไป ~18-20% ของการ์ด อยากได้ 25-28% โดยไม่ขยายวงแหวน" — ซูมเพิ่มจาก
          // 1.16 (แค่พอปิดช่องว่างก่อนวงแหวนทองในรูป) เป็น 1.55 — ครอปลึกเข้าไปถึงลาย "target ring" ตกแต่ง
          // รอบตัวหุ่นยนต์ในไฟล์ (ซึ่งวงแหวนอำพัน CSS ของเราทำหน้าที่นั้นแทนอยู่แล้ว) เหลือแค่ตัวหุ่นยนต์เต็มๆ
          <Image src={src} alt="" width={size} height={size} className="w-full h-full object-cover" style={{ transform: 'scale(1.55)' }} />
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
