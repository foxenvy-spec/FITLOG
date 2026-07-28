'use client'

import type { ReactNode } from 'react'
import type { FitnessScoreResult } from '@/lib/fitnessScore'
import type { LatestPR, TopMuscle } from '@/lib/dashboardStats'
import AmbientGlow from './AmbientGlow'
import AnimatedWave from './AnimatedWave'
import FitnessScore from './FitnessScore'
import NotificationButton from './NotificationButton'
import Greeting from './Greeting'

interface HeaderProps {
  greetingText: string
  latestPR: LatestPR | null
  topMuscleThisWeek: TopMuscle | null
  displayName: string
  fitnessScore: FitnessScoreResult
  /** เนื้อหาที่วางอยู่ใต้ header ทั้งชุด (เช่น Today's Focus card) */
  children?: ReactNode
}

// Header ของหน้า Dashboard (มือถือ) — v4 (แก้ตามฟีดแบ็กเรื่องตำแหน่งชนกัน):
//
// ปัญหาของ v3 คือปล่อยให้ชื่อผู้ใช้ (normal flow, เต็มความกว้าง) อยู่ในกล่องเดียวกับ Bell/Ring/Wave
// ที่เป็น absolute แล้วปล่อยให้ความสูงของกล่องยืดตาม tagline+children ที่ตามมา — ผลคือพอ tagline
// สั้น/ยาวไม่แน่นอน หรือ wave/ring ตำแหน่งขยับนิดเดียว ก็ไปชนกับ tagline/Today's Focus ได้ง่าย
//
// v4 แก้โดยแยกเป็น 2 กล่องชัดเจน:
//   1. "hero" กล่องในสุด — สูงคงที่ h-[290px], overflow-hidden, ทุกอย่างข้างในเป็น absolute
//      ล้วน (Greeting/Bell/ชื่อ/Subtitle/Ring/Wave/Tagline) กำหนดตำแหน่งตายตัวทั้งหมด ไม่มีอะไร
//      "ดันกัน" เพราะไม่มีธาตุไหนอยู่ใน normal flow เลย
//   2. children (Today's Focus) — อยู่นอกกล่อง hero ในลำดับ normal flow ตามหลัง จึงชนกับอะไร
//      ข้างในกล่อง hero ไม่ได้อีกต่อไป ไม่ว่าตำแหน่ง wave/ring จะขยับเท่าไหร่ก็ตาม
//
// พิกัดอ้างอิงจากสเปก mockup ล่าสุด:
//   Bell            top:18  right:20  (เดิม 24 — เตี้ยลงให้อยู่ระดับเดียวกับ Greeting)
//   Greeting        top:20  left:24
//   ชื่อผู้ใช้        top:56  left:24  (fontSize 60 / weight 900)
//   Fitness Score   top:70  right:20  size 110 (เดิม 76/22/116 — ขยับขึ้น/เล็กลงนิดหน่อย)
//   Wave            top:85  (เดิม 120 — ขึ้น ~35px ให้ลอดผ่านหลังชื่อ ไม่ใช่ผ่าน tagline)
//   Subtitle        top:176 left:24
//   Tagline         top:210 left:24
export default function Header({
  greetingText,
  latestPR,
  topMuscleThisWeek,
  displayName,
  fitnessScore,
  children,
}: HeaderProps) {
  return (
    <div className="animate-rise">
      {/* กล่อง hero — สูงคงที่ ทุกอย่างข้างในเป็น absolute ล้วน */}
      <div className="relative h-[290px] overflow-hidden">
        {/* Background: glow + wave */}
        <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
          <AmbientGlow color={fitnessScore.color} />
        </div>
        <div className="absolute inset-x-0 z-0 pointer-events-none animate-header-wave" style={{ top: 85 }} aria-hidden="true">
          <AnimatedWave color={fitnessScore.color} />
        </div>

        {/* Foreground */}
        <div className="absolute z-20" style={{ top: 20, left: 24 }}>
          <Greeting text={greetingText} />
        </div>

        <div className="absolute z-30" style={{ top: 18, right: 20 }}>
          <NotificationButton latestPR={latestPR} topMuscleThisWeek={topMuscleThisWeek} />
        </div>

        <p
          className="absolute z-20 uppercase"
          style={{
            top: 56,
            left: 24,
            maxWidth: 'calc(100% - 150px)', // กันชื่อยาวๆ ไม่ให้ไปทับ Ring ทางขวา
            fontFamily: 'var(--font-oswald), var(--font-kanit)',
            fontSize: 60,
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

        <div className="absolute z-20" style={{ top: 70, right: 20 }}>
          <FitnessScore score={fitnessScore} size={110} />
        </div>

        <p className="absolute z-20 text-sm text-muted" style={{ top: 176, left: 24 }}>
          Personalized Fitness
        </p>

        <p className="absolute z-20 text-sm text-muted" style={{ top: 210, left: 24, right: 24 }}>
          วันนี้พร้อมสำหรับการออกกำลังกาย 💪
        </p>
      </div>

      {/* นอกกล่อง hero — normal flow ตามหลัง ชนกับอะไรใน hero ไม่ได้อีกแล้ว */}
      <div className="px-1 mt-3">{children}</div>
    </div>
  )
}
