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

// Header ของหน้า Dashboard (มือถือ) — v17: กระดิ่งแจ้งเตือนแยกออกมาเป็น absolute top-right แทนที่จะ
// เรียงซ้อนเหนือวง Fitness Score ในคอลัมน์ขวา (เดิม notif 44px + gap 8px เพิ่มความสูงให้คอลัมน์ขวา
// โดยไม่จำเป็น) — ตัดการซ้อนออกทำให้คอลัมน์ขวาเหลือแค่วง+ข้อความใต้วงเท่านั้น เป็นตัวแปรหลักที่ทำให้
// header ทั้งก้อนสูงเกิน budget (220px รอบก่อน, ผู้ใช้ฟีดแบ็กว่ายังกิน 40-45% ของจอ ทั้งที่ควรอยู่ที่
// ~30%) — เพิ่มระยะห่างแนวตั้งฝั่งซ้าย (greeting→BANK, BANK→subtitle, subtitle→motivation) เล็กน้อย
// ตามฟีดแบ็ก "negative space" ที่ต้นแบบมีแต่ของเราแน่นไป แม้ว่า header โดยรวมจะเตี้ยลง
export default function Header({ greetingText, latestPR, topMuscleThisWeek, displayName, fitnessScore }: HeaderProps) {
  return (
    <div className="relative flex items-start justify-between gap-3 animate-rise">
      <div className="min-w-0" style={{ paddingRight: 44 }}>
        <Greeting text={greetingText} />
        <p
          className="uppercase"
          style={{
            marginTop: 6,
            fontFamily: 'var(--font-oswald), var(--font-kanit)',
            // BANK ตายตัว 60px (เทียบเท่า text-6xl ตาม Tailwind scale ที่ขอ, ห้ามใช้ 7xl ขึ้นไป) —
            // ออกแบบเจาะจงสำหรับ iPhone 15/16 Pro (393px) เท่านั้น ไม่ต้อง responsive-scale ตามจอ
            // ใหญ่ (ตามสเปคที่ระบุ "never optimize for desktop first") เผื่อ clamp ขั้นต่ำไว้นิดเดียว
            // กันจอแคบผิดปกติ (< 360px) เท่านั้น
            fontSize: 'clamp(52px, 16vw, 60px)',
            fontWeight: 900,
            letterSpacing: '2px',
            lineHeight: 1,
            backgroundImage: 'linear-gradient(180deg, #FFFFFF, #C7CBD1)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          {displayName}
        </p>

        {/* ระยะห่างชื่อ→subtitle 10px (เดิม 8px) — เพิ่มเล็กน้อยตามฟีดแบ็ก negative space */}
        <p className="tracked text-muted whitespace-nowrap" style={{ marginTop: 10, fontSize: 11 }}>
          Personalized Fitness
        </p>
        <SubtitleAccent />

        <p className="text-ink" style={{ marginTop: 10, fontSize: 13 }}>
          วันนี้พร้อมสำหรับการออกกำลังกาย 💪
        </p>
      </div>

      {/* กระดิ่งแจ้งเตือน — ลอยมุมขวาบนอิสระ ไม่กินพื้นที่ในโฟลว์แนวตั้งของคอลัมน์ขวาอีกต่อไป */}
      <div className="absolute top-0 right-0">
        <NotificationButton latestPR={latestPR} topMuscleThisWeek={topMuscleThisWeek} />
      </div>

      <div className="flex flex-col items-end shrink-0" style={{ marginTop: 8 }}>
        {/* วง Fitness Score — ขนาดมาจาก dashboardSpec.header.scoreRingSize (121px) แหล่งความจริงเดียว
            แทนตัวเลขลอยในไฟล์นี้ — FitnessRing/FitnessScore สเกล stroke/font ภายในตาม size prop เอง */}
        <FitnessScore score={fitnessScore} size={dashboardSpec.header.scoreRingSize} />
      </div>
    </div>
  )
}
