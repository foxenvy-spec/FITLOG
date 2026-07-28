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

// ค่าตำแหน่งของ Ring — ประกาศเป็นตัวแปรเดียวแล้วใช้ทั้งที่ตัว Ring เองและคำนวณขอบเขตของ Wave
// (แทนที่จะ hardcode เลข 130 แยกไว้คนละจุดแบบ v4/v5/v6) กัน bug กรณีขยับ Ring แล้วลืมขยับ Wave ตาม
const RING_RIGHT = 'clamp(16px, 5vw, 24px)'
const RING_TOP = 'clamp(60px, 18vw, 80px)'
const RING_SIZE = 110

// Header ของหน้า Dashboard (มือถือ) — v7:
//   - ตำแหน่งทุกจุด (Bell/Greeting/ชื่อ/Ring/Wave) เปลี่ยนจาก fixed px เป็น clamp(min, vw, max) —
//     คำนวณจากความกว้างจอ (vw) แต่มีเพดานบน-ล่างกันไม่ให้เล็ก/ใหญ่เกินไปบนจอที่ต่างกันมาก แทนที่
//     fixed px ตายตัวแบบ v4-v6 ที่พอจอเปลี่ยนขนาดมากๆ สัดส่วนจะเพี้ยน
//   - Wave ยังคง "จบที่ขอบ Ring พอดี" เหมือน v6 แต่คำนวณ right offset จาก RING_RIGHT + RING_SIZE
//     แทนเลข 130 คงที่ ให้ Wave ขยับตาม Ring อัตโนมัติถ้าปรับตำแหน่ง Ring ในอนาคต
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
      <div className="relative overflow-hidden" style={{ height: 'clamp(170px, 48vw, 210px)' }}>
        {/* Background: glow + wave */}
        <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
          <AmbientGlow color={fitnessScore.color} />
        </div>
        <div
          className="absolute left-0 z-0 pointer-events-none animate-header-wave"
          style={{ top: 'clamp(70px, 20vw, 95px)', right: `calc(${RING_SIZE}px + ${RING_RIGHT})` }}
          aria-hidden="true"
        >
          <AnimatedWave />
        </div>

        {/* Foreground */}
        <div className="absolute z-20" style={{ top: 'clamp(16px, 5vw, 22px)', left: 'clamp(18px, 6vw, 26px)' }}>
          <Greeting text={greetingText} />
        </div>

        <div className="absolute z-30" style={{ top: 'clamp(14px, 4.5vw, 20px)', right: RING_RIGHT }}>
          <NotificationButton latestPR={latestPR} topMuscleThisWeek={topMuscleThisWeek} />
        </div>

        <p
          className="absolute z-20 uppercase"
          style={{
            top: 'clamp(48px, 14vw, 64px)',
            left: 'clamp(18px, 6vw, 26px)',
            maxWidth: 'calc(100% - 150px)', // กันชื่อยาวๆ ไม่ให้ไปทับ Ring ทางขวา
            fontFamily: 'var(--font-oswald), var(--font-kanit)',
            fontSize: 'clamp(42px, 15vw, 60px)',
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

        <div className="absolute z-20" style={{ top: RING_TOP, right: RING_RIGHT }}>
          <FitnessScore score={fitnessScore} size={RING_SIZE} />
        </div>
      </div>

      {/* นอกกล่อง hero — normal flow ตามหลัง ชนกับอะไรใน hero ไม่ได้อีกแล้ว */}
      <div className="px-1 mt-3">{children}</div>
    </div>
  )
}
