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
  /** เนื้อหาที่วางอยู่ใต้ tagline ภายใน header เดียวกัน (เช่น Today's Focus card) */
  children?: ReactNode
}

// Header ของหน้า Dashboard (มือถือ) — โครงสร้าง 3 ชั้นตามสเปก mockup ล่าสุด:
//
//   1) Background Layer — AmbientGlow (glow เบลอ + particle) + AnimatedWave (คลื่นหลายชั้น)
//      เต็มพื้นที่ header, z-0, วาง wave คาบเกี่ยว "ระหว่าง" ชื่อผู้ใช้กับ subtitle (top:120px)
//      ไม่ใช่ชิดล่างสุดแบบเวอร์ชันก่อน — ทำให้ wave ดูเหมือนลอดผ่านหลังตัวอักษรชื่อผู้ใช้
//
//   2) Foreground Layer — Greeting (บนซ้าย, ธรรมดาตาม flow) + Bell (บนขวา, absolute
//      top:24/right:20) + ชื่อผู้ใช้ (60px/900) + Subtitle "Personalized Fitness" +
//      Fitness Score Ring (ขวา, absolute top:76/right:22, size 116) — Bell กับ Ring
//      อยู่คนละความสูงกันชัดเจน (ห่างกัน ~52px) จึงไม่ชนกัน
//
//   3) Bottom Layer — Tagline "วันนี้พร้อม...' + เนื้อหาที่ส่งมาทาง children (เช่น Today's
//      Focus card)
//
// หมายเหตุ: ความสูงรวมของ header เพิ่มขึ้นเป็น ~280px (จากเดิม ~230px) ตามสเปก เพื่อให้มีที่ว่าง
// พอสำหรับ subtitle + tagline + wave ที่สูงขึ้น — เป็นการเปลี่ยนแปลงที่ยืนยันแล้วว่ายอมรับ
export default function Header({
  greetingText,
  latestPR,
  topMuscleThisWeek,
  displayName,
  fitnessScore,
  children,
}: HeaderProps) {
  return (
    <div className="relative overflow-hidden" style={{ minHeight: 280 }}>
      {/* 1) Background layer */}
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
        <AmbientGlow color={fitnessScore.color} />
        <div className="absolute inset-x-0 animate-header-wave" style={{ top: 120 }}>
          <AnimatedWave color={fitnessScore.color} />
        </div>
      </div>

      {/* 2) Foreground layer */}
      <div className="relative z-20 px-1 animate-rise">
        <div style={{ paddingTop: 24 }}>
          <Greeting text={greetingText} />
        </div>

        <p
          className="uppercase mt-2"
          style={{
            fontFamily: 'var(--font-oswald), var(--font-kanit)',
            fontSize: 60,
            fontWeight: 900,
            letterSpacing: '2px',
            lineHeight: 1,
            paddingRight: 96, // กันไม่ให้ชื่อผู้ใช้ยาวๆ ไปทับ Ring ที่ลอยอยู่ทางขวา
            backgroundImage: 'linear-gradient(180deg, #FFFFFF, #C7CBD1)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          {displayName}
        </p>
        <p className="text-sm text-muted mt-1">Personalized Fitness</p>

        {/* Bell — absolute, สูงกว่า Ring ~52px ตามสเปก ไม่ชนกัน */}
        <div className="absolute z-30" style={{ top: 24, right: 20 }}>
          <NotificationButton latestPR={latestPR} topMuscleThisWeek={topMuscleThisWeek} />
        </div>

        {/* Fitness Score Ring — absolute */}
        <div className="absolute z-20" style={{ top: 76, right: 22 }}>
          <FitnessScore score={fitnessScore} size={116} />
        </div>
      </div>

      {/* 3) Bottom layer */}
      <div className="relative z-20 px-1 mt-3">
        <p className="text-sm text-muted">วันนี้พร้อมสำหรับการออกกำลังกาย 💪</p>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  )
}
