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
// ลดจาก 110 → 84 ตามที่ขอ (คืนพื้นที่แนวตั้งของ header ลงมา ~15%) — WAVE_TOP/HERO ด้านล่างคำนวณจาก
// ค่านี้โดยตรงทั้งคู่ ไม่ hardcode ตัวเลขแยก กันพลาดแบบที่เคยเกิดตอนแก้ครั้งก่อน (ปรับ RING_SIZE
// จุดเดียว ทุกอย่างขยับตามอัตโนมัติ)
const RING_SIZE = 84
// วง Fitness Score มีข้อความ "Fitness Score" + tier label ต่อท้ายใต้วงอีก ~40px (ดู FitnessScore.tsx)
// ต้องบวกเข้าไปในความสูงกล่อง hero ด้วย ไม่งั้น overflow-hidden ของกล่องจะตัดข้อความสองบรรทัดนั้นทิ้ง
// ไปเงียบๆ (เกิดขึ้นแทบทุกขนาดจอ เพราะเดิม RING_TOP + RING_SIZE + label สูงเกินความสูงกล่องที่ตั้งไว้ตายตัว)
const RING_LABEL_HEIGHT = 42
// พื้นที่หายใจเพิ่มใต้ label — เดิม hero สูงพอดีเป๊ะกับเนื้อหาจนรู้สึกอึดอัด/แบน เพิ่มส่วนนี้ให้ดูโปร่งขึ้น
const HERO_BOTTOM_BREATHING_ROOM = 40
// Wave ต้องจบที่ "ความสูงเดียวกับกึ่งกลางวง" (= ขอบซ้ายสุดของวงกลม) ไม่งั้นจะรู้สึกเหมือนเป็นคนละชิ้นกัน
// แม้จะจบที่ตำแหน่ง x เดียวกันก็ตาม (ดู AnimatedWave.tsx: จุดจบของเส้นอยู่ที่ y=22 จาก viewBox สูง 70)
// คำนวณจาก RING_TOP + RING_SIZE/2 (จุดกึ่งกลางวงตามแนวตั้ง) ลบ 22 ตรงๆ แทนเลข 33 คงที่เดิม (ซึ่งผูก
// อยู่กับ RING_SIZE เดิม=110 โดยเฉพาะ) กัน bug กรณีเปลี่ยน RING_SIZE แล้วลืมคำนวณจุดนี้ใหม่ตาม
const WAVE_TOP = `calc(${RING_TOP} + ${RING_SIZE / 2 - 22}px)`

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

        {/* subtitle ใต้ชื่อ — เดิมไม่มีเลย (มอคอัพมี "Personalized Fitness" ใต้ชื่อแบรนด์) ใช้ tagline
            เดิมของ FITLOG เอง ("TRACK · TRAIN · TRANSFORM" จากหน้า login) แทนที่จะเอาข้อความมอคอัพ
            มาแปะตรงๆ เพราะช่องนี้โชว์ชื่อผู้ใช้จริง ไม่ใช่ชื่อแอป ใส่ข้อความบรรยายแอปคนละความหมาย */}
        <p
          className="absolute z-20 tracked uppercase text-muted"
          style={{
            top: `calc(clamp(48px, 14vw, 64px) + clamp(42px, 15vw, 60px))`,
            left: 'clamp(18px, 6vw, 26px)',
            maxWidth: 'calc(100% - 150px)',
            fontSize: 11,
          }}
        >
          Track · Train · Transform
        </p>

        {/* คำให้กำลังใจใต้ wave — ข้อความเดียวกับที่มอคอัพระบุไว้เป๊ะๆ วางไว้ในโซน
            HERO_BOTTOM_BREATHING_ROOM (40px ว่างท้ายกล่อง hero ฝั่งซ้ายไม่มีอะไรอยู่แล้ว) แทนการเพิ่ม
            ความสูง hero ใหม่ — bottom:26 (ไม่ใช่ 14) เว้นที่ให้พ้นโซนที่การ์ด Today's Focus ซ้อนขึ้นมา
            (margin-top:-18 ด้านล่าง แปลว่าการ์ดกิน 18px บนสุดของ hero) ไม่งั้นข้อความจะโดนการ์ดทับ */}
        <p
          className="absolute z-20 text-ink"
          style={{ bottom: 26, left: 'clamp(18px, 6vw, 26px)', maxWidth: 'calc(100% - 150px)', fontSize: 13 }}
        >
          วันนี้พร้อมสำหรับการออกกำลังกาย 💪
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

      {/* "ซ้อนสายตา" (visual overlap) กับ hero ตามที่ขอ — ดึงการ์ด Today's Focus ขึ้นไปคาบเกี่ยวกับ
          HERO_BOTTOM_BREATHING_ROOM (40px พื้นที่ว่างล้วนๆ ท้ายกล่อง hero ไม่มีตัวเลข/ป้ายชื่อของวง
          ซ้อนอยู่ตรงนั้น) ด้วย margin-top ติดลบ แทนที่จะปล่อยให้อยู่เป็นบล็อกแยกข้างล่างเหมือนเดิม —
          ไม่ต้องแตะ overflow-hidden ของกล่อง hero เลย เพราะการ์ดนี้เป็น sibling อยู่นอกกล่องนั้นอยู่แล้ว
          (แค่ paint ทับขึ้นไปด้านบนตามลำดับ DOM ปกติ) จึงไม่มีความเสี่ยงโดนตัดขอบ
          ดึงขึ้น 18px จาก 40px ที่มี เหลือ ~22px ของพื้นที่ว่างเดิมอยู่เหนือการ์ดใน hero ไม่ให้ชนตัวเลข/
          tier label ของวง Fitness Score ด้านบน */}
      <div className="relative z-10 px-1" style={{ marginTop: -18 }}>{children}</div>
    </div>
  )
}
