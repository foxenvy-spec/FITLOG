'use client'

import type { ReactNode } from 'react'
import type { FitnessScoreResult } from '@/lib/fitnessScore'
import type { LatestPR, TopMuscle } from '@/lib/dashboardStats'
import AmbientGlow from './AmbientGlow'
import AnimatedWave from '@/components/ui/AnimatedWave'
import FitnessScore from './FitnessScore'
import NotificationButton from './NotificationButton'
import Greeting from './Greeting'
import Glow from '@/components/ui/Glow'

interface HeaderProps {
  greetingText: string
  latestPR: LatestPR | null
  topMuscleThisWeek: TopMuscle | null
  displayName: string
  fitnessScore: FitnessScoreResult
  /** สีตามสถานะ Recovery รวม (เขียว/เหลือง/แดง จาก recoveryStatusColor) — ใช้เรืองแสงรอบวง Fitness
   *  Score เพื่อให้เห็นสถานะการฟื้นตัวแค่แวบเดียวโดยไม่ต้องกดเข้าไปดูรายละเอียด */
  recoveryColor: string
  /** เนื้อหาที่วางอยู่ใต้ header ทั้งชุด (เช่น Today's Focus card) */
  children?: ReactNode
}

// ค่าตำแหน่งของ Ring — ประกาศเป็นตัวแปรเดียวแล้วใช้ทั้งที่ตัว Ring เองและคำนวณขอบเขตของ Wave
// (แทนที่จะ hardcode เลข 130 แยกไว้คนละจุดแบบ v4/v5/v6) กัน bug กรณีขยับ Ring แล้วลืมขยับ Wave ตาม
const RING_RIGHT = 'clamp(16px, 5vw, 24px)'
const RING_TOP = 'clamp(60px, 18vw, 80px)'
const RING_SIZE = 110
// วง Fitness Score มีข้อความ "Fitness Score" + tier label ต่อท้ายใต้วงอีก ~40px (ดู FitnessScore.tsx)
// ต้องบวกเข้าไปในความสูงกล่อง hero ด้วย ไม่งั้น overflow-hidden ของกล่องจะตัดข้อความสองบรรทัดนั้นทิ้ง
// ไปเงียบๆ (เกิดขึ้นแทบทุกขนาดจอ เพราะเดิม RING_TOP + RING_SIZE + label สูงเกินความสูงกล่องที่ตั้งไว้ตายตัว)
const RING_LABEL_HEIGHT = 42
// พื้นที่หายใจเพิ่มใต้ label — เดิม hero สูงพอดีเป๊ะกับเนื้อหาจนรู้สึกอึดอัด/แบน เพิ่มส่วนนี้ให้ดูโปร่งขึ้น
const HERO_BOTTOM_BREATHING_ROOM = 40
// Wave ต้องจบที่ "ความสูงเดียวกับกึ่งกลางวง" (= ขอบซ้ายสุดของวงกลม) ไม่งั้นจะรู้สึกเหมือนเป็นคนละชิ้นกัน
// แม้จะจบที่ตำแหน่ง x เดียวกันก็ตาม (ดู AnimatedWave.tsx: จุดจบของเส้นอยู่ที่ y=22 จาก viewBox สูง 70)
// คำนวณจาก RING_TOP ตรงๆ แทนการ clamp แยกต่างหาก กัน bug แบบเดียวกับที่เคยเกิดกับความสูง hero มาก่อน
const WAVE_TOP = `calc(${RING_TOP} + 33px)`

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
  recoveryColor,
  children,
}: HeaderProps) {
  return (
    <div className="animate-rise">
      <div
        className="relative overflow-hidden"
        style={{ height: `calc(${RING_TOP} + ${RING_SIZE}px + ${RING_LABEL_HEIGHT}px + ${HERO_BOTTOM_BREATHING_ROOM}px)` }}
      >
        {/* Background: glow + wave */}
        <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
          <AmbientGlow color={fitnessScore.color} />
        </div>
        <div
          className="absolute left-0 z-0 pointer-events-none animate-header-wave"
          style={{ top: WAVE_TOP, right: `calc(${RING_SIZE}px + ${RING_RIGHT})` }}
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
          <div className="relative">
            {/* เรืองแสงตามสถานะ Recovery รวม — อยู่หลังตัววง (z-0) ไม่บังตัวเลข/label ของวงเอง
                ซึ่งยังคงไล่สี fire gradient เดิมของมันไว้ (ไม่เปลี่ยนสีเส้นวง เปลี่ยนแค่แสงรอบๆ) */}
            <Glow
              color={recoveryColor}
              width={RING_SIZE + 50}
              height={RING_SIZE + 50}
              top={-25}
              left={-25}
              blur={26}
              opacity={0.45}
              pulse
              className="z-0"
            />
            <div className="relative z-10">
              <FitnessScore score={fitnessScore} size={RING_SIZE} />
            </div>
          </div>
        </div>
      </div>

      {/* นอกกล่อง hero — normal flow ตามหลัง ชนกับอะไรใน hero ไม่ได้อีกแล้ว */}
      <div className="px-1 mt-3">{children}</div>
    </div>
  )
}
