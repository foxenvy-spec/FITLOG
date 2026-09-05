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
//
// รอบที่ 3 — ฟีดแบ็ก "ลองเอาไปแทรกของจริง" (ใช้แทน pill Fitness Score/Recovery เดิมในหัว /dashboard
// จริง): เพิ่ม fitnessRingSize/recoverySize (ดีฟอลต์คงขนาดเดิม 140/124 สำหรับหน้า preview) + wrapped
// (false = ไม่มีกรอบการ์ด/พื้นหลัง/padding ใหญ่ ใช้ตอนฝังในแถว header ที่มีพื้นหลัง/โครงสร้างของตัวเองอยู่
// แล้ว) + onFitnessScoreClick (ให้กดวง Fitness Score เปิด FitnessScoreDetailSheet ได้เหมือน pill เดิม
// ไม่เสียฟีเจอร์ "กดดูรายละเอียด" ที่เพิ่งทำไปก่อนหน้านี้)
interface HeroGaugeConceptProps {
  fitnessScore: FitnessScoreResult
  // v5 — บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจค): ก่อนหน้านี้เป็น required ทั้งคู่ ทำให้ DashboardView.tsx ต้อง gate
  // ทั้งบล็อกด้วย `fitnessScoreRecoveryPct != null` ไปด้วย — ผลคือผู้ใช้ที่ยังไม่เคยฝึกกลุ่มกล้ามเนื้อไหน
  // เลย (บัญชีใหม่/ฝึกแต่คาร์ดิโอ) recoveryDates ว่างหมด ทำให้ Fitness Score widget ทั้งก้อนหาย (รวมปุ่ม
  // "กดดูรายละเอียด" ที่เพิ่งทำไปก่อนหน้า Twin Gauge) ทั้งที่ fitnessScore เองคำนวณได้อยู่แล้วไม่ต้องพึ่ง
  // recovery (แค่ 1 ใน 6 ปัจจัย ถ่วงน้ำหนักใหม่ได้ถ้าไม่มีค่า) — เดิม (ก่อน Twin Gauge) pill Fitness Score
  // โชว์ได้อิสระจาก Recovery pill อยู่แล้ว — ทำให้ optional แทน ไม่ส่งมา = โชว์แค่วง Fitness Score เดี่ยวๆ
  // (ไม่ทำวง Recovery ปลอมขึ้นมาโชว์ 0%/"ไม่มีข้อมูล" ตาม pattern "ไม่ใช้ข้อมูลสมมติ" ที่ยึดมาตลอด)
  recoveryPct?: number
  recoveryLabel?: string
  fitnessScoreDiff?: string
  recoveryDiff?: string
  // ฟีดแบ็ก (design review) "เห็นตัวเลข/tier แล้วต้องตีความเองว่าวันนี้ควรทำอะไร" — บรรทัดคำแนะนำสั้นๆ
  // เพิ่มเติมจาก diff (diff เดิมออกแบบไว้สำหรับตัวเลข delta สี rust/moss ตายตัว ไม่เหมาะกับข้อความแนะนำ
  // เฉยๆ ที่ไม่ได้บอกทิศทางดี/แย่) แสดงด้วยสีกลาง (TEXT.secondary) แยกชั้นจาก diff ชัดเจน ไม่ระบุ = ไม่
  // แสดงบรรทัดนี้เลย (พฤติกรรมเดิมทุกประการ)
  fitnessAdvice?: string
  recoveryAdvice?: string
  fitnessRingSize?: number
  recoveryRingSize?: number
  wrapped?: boolean
  onFitnessScoreClick?: () => void
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
          (tuned alpha ไว้แล้วหลายรอบ ไม่ได้คิดค่าใหม่) เอามาใช้ซ้ำกับทั้งสองวงในนี้
          ฟีดแบ็ก (P1.1, Information Hierarchy review) "ลด glow ของ Fitness Score/Recovery ประมาณ
          30-40% — ไม่ต้องลบวง/ตัวเลข แค่ลดสิ่งที่แย่งสายตา" — ลด alpha ทั้ง 3 ชั้นลง ~35% (11->0B,
          20->15, 36->23) วงยังอยู่ครบ แค่เรืองแสงจางลง ไม่กระทบ GoalRing/DialText/ตัวเลขใดๆ */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ width: size * 2.6, height: size * 2.6, background: `radial-gradient(circle, ${color}0B, transparent 60%)` }}
        aria-hidden="true"
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ width: size * 1.7, height: size * 1.7, background: `radial-gradient(circle, ${color}15, transparent 65%)` }}
        aria-hidden="true"
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ width: size * 1.05, height: size * 1.05, background: `radial-gradient(circle, ${color}23, transparent 55%)` }}
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

// fontSize ทุกบรรทัดสเกลตามขนาดวงจริง (ratio เดียวกับที่ GoalRing เองใช้คำนวณ fontSize ตัวเลขกลางวง
// จาก size*0.24 ภายใน) แทนค่าตายตัว 34/9/12/9px เดิม — จำเป็นตอนเอาไปฝังใน header จริงที่วงเล็กกว่า
// หน้า preview มาก (ดู fitnessRingSize/recoveryRingSize ด้านล่าง) กันตัวหนังสือใหญ่เกินวงจนล้น
function DialText({
  eyebrow,
  value,
  tierLabel,
  color,
  diff,
  diffColor,
  advice,
  ringSize,
}: {
  eyebrow?: string
  value: string
  tierLabel: string
  color: string
  diff?: string
  diffColor: string
  advice?: string
  ringSize: number
}) {
  const valueFontSize = Math.max(14, Math.round(ringSize * 0.24))
  const eyebrowFontSize = Math.max(7, Math.round(ringSize * 0.065))
  const tierFontSize = Math.max(8, Math.round(ringSize * 0.08))
  const diffFontSize = Math.max(7, Math.round(ringSize * 0.065))
  // ฟีดแบ็ก (สกรีนช็อตจริง) "ควรพักหรือลดความหนัก ตกบรรทัดล้นออกนอกวง" — floor เดิม 7px ยังไม่พอกันตกบรรทัด
  // ที่วงขนาดจริง (76-88px) ลด floor ลงอีกขั้น + บังคับ whitespace-nowrap กันไม่ให้ตกบรรทัดจนดันความสูง
  // ทั้งก้อนเกินเส้นผ่านศูนย์กลางวง (ต้นเหตุจริงของการล้น ไม่ใช่แค่ความกว้าง) ประโยคนี้สั้นลงมากแล้วด้วย
  // (ดู recoveryOverallAdviceTh v2) แต่กันไว้สองชั้นเผื่อจอ/ฟอนต์ที่กว้างกว่าเฉลี่ย
  // v2: ฟีดแบ็ก (สกรีนช็อตจริง รอบถัดมา) "Light Training ชิดขอบล่างวงมาก แน่นเกินไป" — ลดขนาดลงอีก ~15%
  // (floor 6 -> 5, multiplier 0.06 -> 0.052) ทั้ง Fitness/Recovery ใช้ตัวแปรเดียวกันนี้ร่วมกัน
  const adviceFontSize = Math.max(5, Math.round(ringSize * 0.052))
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2 text-center">
      {eyebrow && (
        <span className="tracked uppercase" style={{ fontSize: eyebrowFontSize, color: TEXT.secondary, letterSpacing: '0.1em' }}>
          {eyebrow}
        </span>
      )}
      <span className={`font-mono font-extrabold leading-none ${eyebrow ? 'mt-1' : ''}`} style={{ fontSize: valueFontSize, color: TEXT.title }}>
        {value}
      </span>
      <span className="font-display font-bold tracked uppercase mt-1" style={{ fontSize: tierFontSize, color }}>
        {tierLabel}
      </span>
      {diff && (
        <span className="font-medium mt-1" style={{ fontSize: diffFontSize, color: diffColor }}>
          {diff}
        </span>
      )}
      {/* ฟีดแบ็ก (สกรีนช็อตจริง รอบถัดมา) "ขยับ advice ขึ้นประมาณ 2-4px ให้ไม่ชิดขอบล่างวง" — mt-0.5 (+2px)
          เดิมยิ่งดันข้อความลงไปใกล้ขอบมากขึ้น เปลี่ยนเป็น marginTop ติดลบแทน (ดึงขึ้นชิด tierLabel ด้านบน) */}
      {advice && (
        <span className="font-medium leading-none whitespace-nowrap" style={{ fontSize: adviceFontSize, color: TEXT.secondary, marginTop: -3 }}>
          {advice}
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
  fitnessAdvice,
  recoveryAdvice,
  fitnessRingSize = 140,
  recoveryRingSize = 124,
  wrapped = true,
  onFitnessScoreClick,
}: HeroGaugeConceptProps) {
  const fitnessStrokeWidth = Math.max(4, Math.round(fitnessRingSize * 0.05))
  const recoveryStrokeWidth = Math.max(4, Math.round(recoveryRingSize * 0.05))

  const content = (
    <>
      {/* คลื่นใยไหม — เต็มความกว้าง อยู่หลังทุกอย่าง */}
      <div className="absolute inset-0 flex items-center justify-center opacity-90 pointer-events-none">
        <div className="w-full max-w-4xl h-full">
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

      <div className="relative z-10 flex items-center justify-center gap-6 sm:gap-10">
        {/* Fitness Score — กดได้ถ้าส่ง onFitnessScoreClick มา (ใช้ตอนฝังใน header จริง เปิด
            FitnessScoreDetailSheet เดิม) ไม่ส่งมา = แค่แสดงผลเฉยๆ เหมือนหน้า preview */}
        <button
          type="button"
          onClick={onFitnessScoreClick}
          disabled={!onFitnessScoreClick}
          className={`relative flex items-center justify-center shrink-0 ${onFitnessScoreClick ? 'cursor-pointer hover:brightness-110 transition' : 'cursor-default'}`}
          style={{ width: fitnessRingSize, height: fitnessRingSize }}
          aria-haspopup={onFitnessScoreClick ? 'dialog' : undefined}
          aria-label={`Fitness Score ${fitnessScore.score} — ${fitnessScore.tierLabel}${onFitnessScoreClick ? ' — กดดูรายละเอียด' : ''}`}
        >
          <GlowLayers size={fitnessRingSize} color={fitnessScore.color} />
          {/* ฟีดแบ็ก "ตรงที่มีอะไรวิ่งอยู่ในวงกลม ไม่เอาตรงนี้ได้ไหม" — glow=true เดิมเปิดจุดสว่างที่วิ่ง
              วนรอบวง (.animate-ring-sweep-slow) + spark กะพริบ (.animate-ring-spark-flash) ใน
              GoalRing.tsx ตัดออก (ไม่ระบุ glow = false ดีฟอลต์) เหลือแค่เส้น progress คงที่ — ไม่กระทบ
              ออร่า/เรืองแสงรอบวง (GlowLayers ด้านบน คนละส่วนกัน ไม่ใช่ตัวที่ทำให้เกิดจุดวิ่ง) */}
          <GoalRing
            pct={fitnessScore.score}
            size={fitnessRingSize}
            strokeWidth={fitnessStrokeWidth}
            color={fitnessScore.color}
            valueLabel=" "
            innerDiscColor={INNER_DISC}
            ariaLabel={`Fitness Score ${fitnessScore.score}`}
          />
          <DialText
            eyebrow="Fitness Score"
            value={String(fitnessScore.score)}
            tierLabel={fitnessScore.tierLabel}
            color={fitnessScore.color}
            diff={fitnessScoreDiff}
            diffColor={COLORS.rust}
            advice={fitnessAdvice}
            ringSize={fitnessRingSize}
          />
        </button>

        {/* Recovery — เฉพาะตอนมีข้อมูลจริง (ดูคอมเมนต์ recoveryPct? ใน props ด้านบน)
            ฟีดแบ็ก (design review) "Recovery 29% (วงนี้) vs Muscle Recovery 33% (การ์ด AI Coach) อยู่ใกล้
            กันมาก ผู้ใช้อาจสงสัยว่าทำไมตัวเลขไม่ตรงกัน" — วงนี้คือค่าเฉลี่ยข้าม "ทุก" กลุ่มกล้ามเนื้อที่เคย
            ฝึก (fitnessScoreRecoveryPct) ส่วน AI Coach คือ % ของกลุ่มที่แนะนำวันนี้ "กลุ่มเดียว" — คนละ
            ขอบเขตกันโดยตั้งใจ ไม่ใช่บั๊ก (เหตุผลเดียวกับที่ MobileDashboardView.tsx/FitnessScoreDetailSheet.tsx
            เคยแยกไว้แล้ว ใช้คำว่า "Recovery (Avg)" คู่กับ "Muscle Recovery")
            ฟีดแบ็ก (design review รอบถัดมา) "'Overall' ข้างวงกำกวม ไม่รู้ว่า overall ของอะไร ทั้งที่ข้างล่าง
            การ์ดก็มีคำว่า Recovery อยู่แล้ว" — ปัญหาเดิมคือ "Recovery" คำเดียวเคยลองใส่ในวงนี้มาก่อนแล้ว
            (ดู git history) แต่ตกบรรทัดชนกับ tier/advice ด้านล่างเพราะพื้นที่ในวง (76px) แคบเกินกว่าคำ 8
            ตัวอักษร — แก้ต้นตอด้วยการย้าย label ออกไปไว้นอกวงแทนที่จะพยายามยัดคำเข้าไปในพื้นที่จำกัดเดิม:
            ตัด eyebrow="Overall" ออกจาก DialText ไปเลย (ให้ value/tier/advice ในวงมีพื้นที่มากขึ้นด้วย) แล้ว
            เพิ่มป้าย "Recovery" เป็น caption แยกอยู่ใต้วงนี้โดยเฉพาะ (ไม่ใช่ลอยกลางระหว่าง 2 วง กันเข้าใจผิด
            ว่าอธิบายทั้งคู่) — ไม่แตะวง Fitness Score ฝั่งซ้าย (eyebrow "Fitness Score" เดิมไม่เคยมีปัญหา
            overflow เลย ไม่ควรแก้สิ่งที่ยังไม่พัง) aria-label ด้านล่างยังพูด "Recovery X% — Label" เต็มๆ
            สำหรับ screen reader เหมือนเดิม (ตอนนี้ตรงกับ label ที่เห็นบนจอด้วยพอดี) */}
        {recoveryPct != null && recoveryLabel && (
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="relative flex items-center justify-center shrink-0" style={{ width: recoveryRingSize, height: recoveryRingSize }}>
              <GlowLayers size={recoveryRingSize} color={COLORS.cyan} />
              <GoalRing
                pct={recoveryPct}
                size={recoveryRingSize}
                strokeWidth={recoveryStrokeWidth}
                color={COLORS.cyan}
                valueLabel=" "
                innerDiscColor={INNER_DISC}
                ariaLabel={`Recovery ${recoveryPct}% — ${recoveryLabel}`}
              />
              <DialText
                value={`${recoveryPct}%`}
                tierLabel={recoveryLabel}
                color={COLORS.cyan}
                diff={recoveryDiff}
                diffColor={COLORS.moss}
                advice={recoveryAdvice}
                ringSize={recoveryRingSize}
              />
            </div>
            <span className="tracked uppercase leading-none" style={{ fontSize: 10, color: TEXT.secondary, letterSpacing: '0.1em' }}>
              Recovery
            </span>
          </div>
        )}
      </div>
    </>
  )

  if (!wrapped) {
    return <div className="relative">{content}</div>
  }

  return <div className="relative rounded-card border border-line bg-bg overflow-hidden px-6 py-14">{content}</div>
}
