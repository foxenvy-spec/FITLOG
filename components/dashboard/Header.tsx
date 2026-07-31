'use client'

import type { FitnessScoreResult } from '@/lib/fitnessScore'
import type { LatestPR, TopMuscle } from '@/lib/dashboardStats'
import { dashboardSpec } from '@/lib/dashboardSpec'
import FitnessScore from './FitnessScore'
import NotificationButton from './NotificationButton'
import Greeting from './Greeting'
import SubtitleAccent from './SubtitleAccent'

interface HeaderProps {
  greetingText: string
  latestPR: LatestPR | null
  topMuscleThisWeek: TopMuscle | null
  displayName: string
  fitnessScore: FitnessScoreResult
}

// Header ของหน้า Dashboard (มือถือ) — v19: แก้บั๊กกระดิ่งทับวง Fitness Score — รอบก่อน (v18) แยก
// กระดิ่งออกมาเป็น absolute top-0 right-0 (44px) แต่คอลัมน์วงแหวนยังใช้ marginTop:8 เดิม (ตอนกระดิ่ง
// ยังอยู่ในโฟลว์) ทำให้วง (เริ่มที่ y=8) ทับซ้อนกับกระดิ่ง (y=0-44) จริง — แก้เป็น marginTop 52
// (=ความสูงกระดิ่ง 44px + ช่องไฟ 8px) ให้วงเริ่มหลังกระดิ่งจริงๆ ไม่ทับกันอีก — font ชื่อ/ระยะห่าง
// บรรทัดฝั่งซ้ายคงค่าจาก v18 ไว้ทั้งหมด (ผู้ใช้ระบุว่ารอบนี้ไม่ลด font เพิ่ม เน้นความสูง/padding/gap)
export default function Header({ greetingText, latestPR, topMuscleThisWeek, displayName, fitnessScore }: HeaderProps) {
  return (
    <div className="relative flex items-start justify-between gap-3 animate-rise">
      <div className="min-w-0" style={{ paddingRight: 44 }}>
        <Greeting text={greetingText} />
        <p
          className="uppercase"
          style={{
            marginTop: 4,
            fontFamily: 'var(--font-oswald), var(--font-kanit)',
            // ชื่อ 54px (เทียบเท่า text-6xl ลด 10%, เดิม 60px) — ออกแบบเจาะจงสำหรับ iPhone 15/16 Pro
            // (393px) เท่านั้น ไม่ต้อง responsive-scale ตามจอใหญ่ เผื่อ clamp ขั้นต่ำไว้นิดเดียวกันจอแคบ
            // ผิดปกติ (< 360px) เท่านั้น
            fontSize: 'clamp(46px, 15vw, 54px)',
            fontWeight: 900,
            letterSpacing: '2px',
            lineHeight: 1,
            // ไล่สี 4 stop จบสว่างกว่ากลาง (ขาว→เทาอ่อน→เทาเข้ม→เทาอ่อนอีกครั้ง) จำลอง "แนวชนแสง"
            // (shine sweep) กวาดผ่านผิวโลหะจริง แทน 2-stop เดิมที่ไล่มืดลงเรื่อยๆ ทางเดียว ให้ความรู้สึก
            // "ตัวหนังสือสีเทา" เฉยๆ ไม่มีมิติ — คู่กับ drop-shadow (เงาเข้มด้านล่าง + ไฮไลต์บางด้านบน)
            // จำลองผิวโลหะสลักนูน (embossed metal) แบบภาพอ้างอิงจริง
            backgroundImage: 'linear-gradient(180deg, #FFFFFF, #D6D6D6, #8A8A8A, #EFEFEF)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            filter: 'drop-shadow(0 2px 1px rgba(0,0,0,.5)) drop-shadow(0 1px 0 rgba(255,255,255,.12))',
          }}
        >
          {displayName}
        </p>

        <p className="tracked text-muted whitespace-nowrap" style={{ marginTop: 7, fontSize: 11 }}>
          Personalized Fitness
        </p>
        <SubtitleAccent />

        <p className="text-ink" style={{ marginTop: 7, fontSize: 13 }}>
          วันนี้พร้อมสำหรับการออกกำลังกาย 💪
        </p>
      </div>

      {/* กระดิ่งแจ้งเตือน — ลอยมุมขวาบนอิสระ ไม่กินพื้นที่ในโฟลว์แนวตั้งของคอลัมน์ขวาอีกต่อไป */}
      <div className="absolute top-0 right-0">
        <NotificationButton latestPR={latestPR} topMuscleThisWeek={topMuscleThisWeek} />
      </div>

      <div className="flex flex-col items-end shrink-0" style={{ marginTop: 52 }}>
        {/* วง Fitness Score — ขนาดมาจาก dashboardSpec.header.scoreRingSize (90px) แหล่งความจริงเดียว
            แทนตัวเลขลอยในไฟล์นี้ — FitnessRing/FitnessScore สเกล stroke/font ภายในตาม size prop เอง */}
        <FitnessScore score={fitnessScore} size={dashboardSpec.header.scoreRingSize} />
      </div>
    </div>
  )
}
