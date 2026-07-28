'use client'

import type { ReactNode } from 'react'
import type { FitnessScoreResult } from '@/lib/fitnessScore'
import type { LatestPR, TopMuscle } from '@/lib/dashboardStats'
import AmbientGlow from './AmbientGlow'
import AnimatedWave from './AnimatedWave'
import Greeting from './Greeting'
import FitnessScore from './FitnessScore'

interface HeaderProps {
  greetingText: string
  latestPR: LatestPR | null
  topMuscleThisWeek: TopMuscle | null
  displayName: string
  fitnessScore: FitnessScoreResult
  /** เนื้อหาที่วางอยู่ใต้ wave ภายใน header เดียวกัน (เช่น Today's Focus card) */
  children?: ReactNode
}

// Header ของหน้า Dashboard (มือถือ) — โครงสร้างแบบ Stack:
//   AmbientGlow (glow + particle, z-0, พื้นหลังสุด)
//   AnimatedWave (เส้นคลื่นเรืองแสง ขยับช้าๆ ด้วย CSS animation)
//   เนื้อหาจริง (z-20): Greeting -> ชื่อผู้ใช้ -> FitnessScore -> children
//
// หมายเหตุ: ตอนนี้ไม่มี Subtitle/tagline ใต้ชื่อผู้ใช้ตามที่ตกลงกันไว้ (ตัดออกเพื่อคงความสูง
// header เดิม) — ถ้าจะใส่กลับ ให้เพิ่ม <p> ต่อจากชื่อผู้ใช้ด้านล่างนี้ได้เลย
export default function Header({
  greetingText,
  latestPR,
  topMuscleThisWeek,
  displayName,
  fitnessScore,
  children,
}: HeaderProps) {
  return (
    <div className="relative">
      <AmbientGlow color={fitnessScore.color} />

      <div className="relative z-20 px-1 animate-rise">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Greeting text={greetingText} latestPR={latestPR} topMuscleThisWeek={topMuscleThisWeek} />
            <p
              className="uppercase mt-1.5"
              style={{
                fontFamily: 'var(--font-oswald), var(--font-kanit)',
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: '1.2px',
                lineHeight: 1,
                backgroundImage: 'linear-gradient(180deg, #FFFFFF, #C7CBD1)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              {displayName}
            </p>
          </div>
          <FitnessScore score={fitnessScore} />
        </div>

        <div className="mt-2 animate-header-wave">
          <AnimatedWave color={fitnessScore.color} />
        </div>

        <div className="mt-1.5">{children}</div>
      </div>
    </div>
  )
}
