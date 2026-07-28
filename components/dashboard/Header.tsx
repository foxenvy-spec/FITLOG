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

// Header ของหน้า Dashboard (มือถือ) — v6:
//   - ตัด Subtitle "Personalized Fitness" และ Tagline "วันนี้พร้อม..." ออกตามที่ขอ (v4 เคยใส่กลับ
//     เข้ามาชั่วคราว) — ทำให้กล่อง hero เตี้ยลง (290 -> 190px) เพราะไม่มีข้อความสองบรรทัดนั้น
//     มากินพื้นที่ด้านล่างอีกต่อไป
//   - Ring กับ Wave เปลี่ยนไปใช้สี FIRE_ACCENT คงที่แล้ว (ดู FitnessScore.tsx / AnimatedWave.tsx)
//     จึงไม่ต้องส่ง fitnessScore.color เข้าไปให้ AnimatedWave อีกต่อไป
//
// โครงสร้างยังเป็น "hero กล่องสูงคงที่ + absolute ล้วนข้างใน" เหมือน v4/v5 เพื่อกัน Wave/Ring/Bell
// ชนกับ children (Today's Focus) ที่อยู่นอกกล่องนี้ในลำดับ normal flow ตามหลัง
//
// พิกัด: Bell top:18/right:20, Greeting top:20/left:24, ชื่อผู้ใช้ top:56/left:24 (60px/900),
// Fitness Score top:70/right:20 size:110, Wave top:85
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
      <div className="relative h-[190px] overflow-hidden">
        {/* Background: glow + wave */}
        <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
          <AmbientGlow color={fitnessScore.color} />
        </div>
        <div
          className="absolute left-0 z-0 pointer-events-none animate-header-wave"
          style={{ top: 85, right: 130 }} // 130 = Ring's right:20 + size:110 → wave จบที่ขอบซ้ายของวงพอดี
          aria-hidden="true"
        >
          <AnimatedWave />
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
      </div>

      {/* นอกกล่อง hero — normal flow ตามหลัง ชนกับอะไรใน hero ไม่ได้อีกแล้ว */}
      <div className="px-1 mt-3">{children}</div>
    </div>
  )
}
