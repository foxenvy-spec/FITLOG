'use client'

import type { FitnessScoreResult } from '@/lib/fitnessScore'
import type { LatestPR, TopMuscle } from '@/lib/dashboardStats'
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

// Header ของหน้า Dashboard (มือถือ) — v16: ตัดกลไก absolute-position + คำนวณความสูงตายตัว
// (RING_TOP/RING_SIZE/WAVE_* เดิม) และเส้นคลื่น HeroEnergyWave/AmbientGlow ออกทั้งหมด ตามสเปคใหม่ที่
// ขอให้ header เป็น flex row ธรรมดา (ฝั่งซ้าย: ทักทาย/ชื่อ/subtitle, ฝั่งขวา: แจ้งเตือน+วง Fitness
// Score) ไม่มี wrapper สูงตายตัวอีกต่อไป — Today's Focus ไม่ได้อยู่ใน children ของ Header แล้ว
// (ย้ายไปเป็น sibling ธรรมดาใน MobileDashboardView แทนการซ้อนทับด้วย margin-top ติดลบแบบเดิม)
export default function Header({ greetingText, latestPR, topMuscleThisWeek, displayName, fitnessScore }: HeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3 animate-rise">
      <div className="min-w-0">
        <Greeting text={greetingText} />
        <p
          className="uppercase"
          style={{
            marginTop: 4,
            fontFamily: 'var(--font-oswald), var(--font-kanit)',
            fontSize: 'clamp(38px, 13vw, 52px)',
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

        <p className="tracked text-muted whitespace-nowrap" style={{ marginTop: 2, fontSize: 11 }}>
          Personalized Fitness
        </p>
        <SubtitleAccent />

        <p className="text-ink" style={{ marginTop: 8, fontSize: 13 }}>
          วันนี้พร้อมสำหรับการออกกำลังกาย 💪
        </p>
      </div>

      <div className="flex flex-col items-end gap-2 shrink-0">
        <NotificationButton latestPR={latestPR} topMuscleThisWeek={topMuscleThisWeek} />
        <FitnessScore score={fitnessScore} size={84} />
      </div>
    </div>
  )
}
