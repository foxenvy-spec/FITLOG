'use client'

import GoalRing from '@/components/GoalRing'
import { COLORS, TEXT, withAlpha } from '@/lib/theme'
import type { FitnessScoreResult } from '@/lib/fitnessScore'

// ทดลองแนวคิด "Twin Cyber Gauge" ตามมอคอัพที่ผู้ใช้ส่งมา — คอมโพเนนต์ทดลอง ไม่ได้ผูกเข้ากับ
// DashboardView.tsx จริง ดูหน้า preview ที่ app/(app)/dashboard-concept/page.tsx
//
// รอบแก้ที่ 2 — ฟีดแบ็ก 4 จุดจากภาพเทียบ "ตัวอย่างที่อยากได้ vs ภาพที่เรนเดอร์จริง":
// 1. หน้าปัดด้านในโปร่งใส คลื่นวิ่งตัดตัวเลข -> เพิ่ม innerDiscColor ใหม่ใน GoalRing.tsx (opt-in prop,
//    ไม่กระทบ 20+ จุดที่เรียก GoalRing อยู่แล้ว) ให้มีแผ่นทึบกันพื้นหลังทะลุ
// 2. "FITNESS SCORE" ลอยอยู่นอกวง ไม่มีบรรทัด diff -> ย้ายทุกบรรทัด (eyebrow/value/tier/diff) เข้าไป
//    ซ้อนกลางวงเป็นชุดเดียว (GoalRing เองส่ง valueLabel="" ไปเว้นว่างไว้ แล้ววาง overlay ของเราทับเอง
//    เพราะโครงสร้างข้อความ 4 บรรทัดซ้อนแบบนี้ไม่ตรงกับ "value แล้วค่อย label" ที่ GoalRing รองรับอยู่)
// 3. เส้นคลื่นเป็นเส้นเดียวเบลอมีหัวกลมเหมือนดาวตก -> เขียนใหม่เป็นหลายเส้นไหมซ้อนกัน (silk strand) ต่อ
//    ฝั่งสี ไม่มีหัว comet ใดๆ แทนด้วยจุดฝุ่นดาวกระจาย (particle dust)
// 4. ขอบวงแบนไม่มีออร่า -> คืนชุด Fog/Bloom/Core (เฉดรัศมี 3 ชั้น) ที่ FitnessScore.tsx ใช้อยู่แล้วกับวง
//    Fitness Score บนมือถือ (ของเดิมที่ tune มาแล้ว ไม่ได้คิดค่าใหม่) + เพิ่มขอบบาง 2 ชั้น (glass bezel)
interface HeroGaugeConceptProps {
  fitnessScore: FitnessScoreResult
  recoveryPct: number
  recoveryLabel: string
  fitnessScoreDiff?: string
  recoveryDiff?: string
}

const INNER_DISC = '#101114'

// จุดฝุ่นดาวกระจายรอบพื้นที่ hero — ตำแหน่ง/ขนาด/สีคงที่ (ไม่สุ่มทุก render กันภาพกระพริบ) ผสมทั้งโทน
// ทอง (ฝั่ง Fitness Score) และไซแอน (ฝั่ง Recovery) ให้เข้ากับสีของแต่ละฝั่งที่จุดนั้นอยู่ใกล้
const PARTICLES = [
  { left: '12%', top: '20%', size: 2, color: COLORS.amber, opacity: 0.55 },
  { left: '22%', top: '72%', size: 1.5, color: COLORS.amber, opacity: 0.4 },
  { left: '38%', top: '14%', size: 1.5, color: COLORS.amber, opacity: 0.45 },
  { left: '62%', top: '16%', size: 1.5, color: COLORS.cyan, opacity: 0.45 },
  { left: '78%', top: '70%', size: 2, color: COLORS.cyan, opacity: 0.5 },
  { left: '88%', top: '24%', size: 1.5, color: COLORS.cyan, opacity: 0.4 },
  { left: '50%', top: '85%', size: 1, color: COLORS.amber, opacity: 0.3 },
]

// เส้นคลื่นใยไหมหลายเส้นซ้อนกัน — ฝั่งซ้าย (ทอง) 3 เส้น เฟส/แอมพลิจูดต่างกันเล็กน้อย ให้ดูเป็นเส้นไหม
// หลายเส้นจริงๆ ไม่ใช่เส้นเดียวเบลอซ้อนตัวเอง ฝั่งขวา (ไซแอน) เหมือนกัน ไม่มีจุด "หัว comet" ที่ปลายเส้น
// (จุดฝุ่นดาว PARTICLES ด้านบนทำหน้าที่นั้นแทนแล้ว)
function SilkWaves() {
  return (
    <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1200 220" aria-hidden="true">
      <defs>
        <linearGradient id="hgc-gold" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={COLORS.amber} stopOpacity="0" />
          <stop offset="55%" stopColor={COLORS.amber} stopOpacity="0.85" />
          <stop offset="100%" stopColor={COLORS.amber} stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="hgc-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={COLORS.cyan} stopOpacity="0.15" />
          <stop offset="45%" stopColor={COLORS.cyan} stopOpacity="0.85" />
          <stop offset="100%" stopColor={COLORS.cyan} stopOpacity="0" />
        </linearGradient>
        <filter id="hgc-glow" x="-30%" y="-100%" width="160%" height="300%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <g stroke="url(#hgc-gold)" fill="none" filter="url(#hgc-glow)" style={{ mixBlendMode: 'screen' }}>
        <path d="M -20 110 Q 220 60, 440 115 T 700 100" strokeWidth="1.6" opacity="0.8" />
        <path d="M -20 125 Q 250 165, 460 95 T 700 120" strokeWidth="1" opacity="0.55" />
        <path d="M -20 95 Q 200 130, 430 130 T 700 90" strokeWidth="1" opacity="0.45" />
      </g>
      <g stroke="url(#hgc-cyan)" fill="none" filter="url(#hgc-glow)" style={{ mixBlendMode: 'screen' }}>
        <path d="M 500 100 Q 760 145, 990 90 T 1220 110" strokeWidth="1.6" opacity="0.8" />
        <path d="M 500 120 Q 740 75, 980 130 T 1220 95" strokeWidth="1" opacity="0.55" />
        <path d="M 500 90 Q 780 60, 1000 115 T 1220 125" strokeWidth="1" opacity="0.45" />
      </g>
    </svg>
  )
}

function GlowLayers({ size, color }: { size: number; color: string }) {
  return (
    <>
      {/* Fog/Bloom/Core — ชุดเดียวกับที่ FitnessScore.tsx (มือถือ) ใช้กับวง Fitness Score อยู่แล้ว
          (tuned alpha ไว้แล้วหลายรอบ ไม่ได้คิดค่าใหม่) เอามาใช้ซ้ำกับทั้งสองวงในนี้ */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ width: size * 2.6, height: size * 2.6, background: `radial-gradient(circle, ${color}11, transparent 60%)` }}
        aria-hidden="true"
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ width: size * 1.7, height: size * 1.7, background: `radial-gradient(circle, ${color}20, transparent 65%)` }}
        aria-hidden="true"
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ width: size * 1.05, height: size * 1.05, background: `radial-gradient(circle, ${color}36, transparent 55%)` }}
        aria-hidden="true"
      />
      {/* ขอบกระจก 2 ชั้น (glass bezel) — วงบางรอบนอกสุด 2 เส้น จำลองขอบกระจกโค้งซ้อนกัน */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ inset: -10, border: `1px solid ${withAlpha('#FFFFFF', '12')}` }}
        aria-hidden="true"
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ inset: -3, border: `1px solid ${withAlpha('#FFFFFF', '22')}` }}
        aria-hidden="true"
      />
    </>
  )
}

function DialText({
  eyebrow,
  value,
  tierLabel,
  color,
  diff,
  diffColor,
}: {
  eyebrow: string
  value: string
  tierLabel: string
  color: string
  diff?: string
  diffColor: string
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
      <span className="text-[9px] tracked uppercase" style={{ color: TEXT.secondary, letterSpacing: '0.12em' }}>
        {eyebrow}
      </span>
      <span className="font-mono font-extrabold leading-none mt-1" style={{ fontSize: 34, color: TEXT.title }}>
        {value}
      </span>
      <span className="text-xs font-display font-bold tracked uppercase mt-1" style={{ color }}>
        {tierLabel}
      </span>
      {diff && (
        <span className="text-[9px] font-medium mt-1" style={{ color: diffColor }}>
          {diff}
        </span>
      )}
    </div>
  )
}

export default function HeroGaugeConcept({
  fitnessScore,
  recoveryPct,
  recoveryLabel,
  fitnessScoreDiff,
  recoveryDiff,
}: HeroGaugeConceptProps) {
  return (
    <div className="relative rounded-card border border-line bg-bg overflow-hidden px-6 py-14">
      {/* คลื่นใยไหม — เต็มความกว้าง อยู่หลังทุกอย่าง */}
      <div className="absolute inset-0 flex items-center justify-center opacity-90 pointer-events-none">
        <div className="w-full max-w-4xl h-56">
          <SilkWaves />
        </div>
      </div>
      {/* ฝุ่นดาวกระจาย */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            background: p.color,
            opacity: p.opacity,
            boxShadow: `0 0 6px 1px ${withAlpha(p.color, '80')}`,
          }}
          aria-hidden="true"
        />
      ))}

      <div className="relative z-10 flex items-center justify-center gap-10 sm:gap-16">
        {/* Fitness Score */}
        <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
          <GlowLayers size={140} color={fitnessScore.color} />
          <GoalRing
            pct={fitnessScore.score}
            size={140}
            strokeWidth={7}
            color={fitnessScore.color}
            valueLabel=" "
            innerDiscColor={INNER_DISC}
            glow
            ariaLabel={`Fitness Score ${fitnessScore.score} — ${fitnessScore.tierLabel}`}
          />
          <DialText
            eyebrow="Fitness Score"
            value={String(fitnessScore.score)}
            tierLabel={fitnessScore.tierLabel}
            color={fitnessScore.color}
            diff={fitnessScoreDiff}
            diffColor={COLORS.rust}
          />
        </div>

        {/* Recovery */}
        <div className="relative flex items-center justify-center" style={{ width: 124, height: 124 }}>
          <GlowLayers size={124} color={COLORS.cyan} />
          <GoalRing
            pct={recoveryPct}
            size={124}
            strokeWidth={6}
            color={COLORS.cyan}
            valueLabel=" "
            innerDiscColor={INNER_DISC}
            glow
            ariaLabel={`Recovery ${recoveryPct}% — ${recoveryLabel}`}
          />
          <DialText
            eyebrow="Recovery"
            value={`${recoveryPct}%`}
            tierLabel={recoveryLabel}
            color={COLORS.cyan}
            diff={recoveryDiff}
            diffColor={COLORS.moss}
          />
        </div>
      </div>
    </div>
  )
}
