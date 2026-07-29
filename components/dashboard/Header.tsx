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

// Header ของหน้า Dashboard (มือถือ) — v8:
//   - ตำแหน่งฝั่งซ้าย (Greeting/ชื่อ/subtitle/Wave/คำให้กำลังใจ) ตอนนี้เป็น flex-col เดียวใน normal
//     flow ทั้งหมด — Wave ไม่ใช่ background ที่วิ่งไปชนวง Fitness Score อีกต่อไปแล้ว (v7) เปลี่ยนเป็น
//     เส้นตรงเล็กๆ อยู่ใต้ subtitle "Personalized Fitness" แทน
//   - ตำแหน่งฝั่งขวา (Bell/Ring) ยังคง clamp(min, vw, max) เดิม
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
        {/* Background: glow */}
        <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
          <AmbientGlow color={fitnessScore.color} />
        </div>

        {/* Foreground — ทักทาย/ชื่อ/subtitle/wave/คำให้กำลังใจ รวมเป็นคอลัมน์เดียว (flex-col, normal flow)
            แทนที่จะ absolute แยกทีละบรรทัดพร้อม top: คำนวณเอง — เดิมสมมติว่าทุกบรรทัด "บรรทัดเดียว"
            เสมอ พอข้อความจริง (subtitle/คำให้กำลังใจ) ตกบรรทัดเป็น 2 บรรทัดบนจอแคบ กลายเป็นโดนซ้อนกับ
            wave/tier label ของวง (บั๊กเดียวกับ label การ์ด Fitness Score ที่เคยเจอมาก่อน) ใช้ flow
            ปกติแทน รับประกันว่าไม่ว่าจะตกกี่บรรทัด บรรทัดถัดไปก็จะขยับลงเองอัตโนมัติ ไม่ทับกันแน่นอน */}
        <div
          className="absolute z-20 flex flex-col"
          style={{ top: 'clamp(16px, 5vw, 22px)', left: 'clamp(18px, 6vw, 26px)', maxWidth: 'calc(100% - 150px)' }}
        >
          <Greeting text={greetingText} />
          <p
            className="uppercase"
            style={{
              marginTop: 4,
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

          {/* subtitle ใต้ชื่อ — ใช้ข้อความจากมอคอัพตรงๆ ตามที่ขอ (รอบก่อนเคยเปลี่ยนเป็น tagline ของ
              FITLOG เองแทน แต่ตอนนี้ขอกลับไปใช้ข้อความมอคอัพเป๊ะๆ แล้ว) */}
          <p className="tracked text-muted" style={{ marginTop: 2, fontSize: 11 }}>
            Personalized Fitness
          </p>

          {/* Wave — ย้ายจากเดิมที่เป็น background ลอยแยกต่างหาก (จัดตำแหน่งด้วย top: คำนวณเทียบกับวง
              Fitness Score) มาอยู่ใน flow ปกติต่อจาก subtitle ตรงๆ แทน — รับประกันว่า "อยู่ใต้คำว่า
              Personalized Fitness พอดี" เสมอไม่ว่าจอกว้างแค่ไหนหรือ subtitle ตกกี่บรรทัด (ไม่ต้องเดา
              เลข top อีกต่อไป) เป็นเส้นตรงแทนเส้นโค้งเดิมตามที่ขอ — ดูรายละเอียดที่ AnimatedWave.tsx
              (endGlow ปิดไว้ เพราะเส้นไม่ได้วิ่งไปชนวงคะแนนอีกต่อไปแล้ว) */}
          <div className="w-full max-w-[220px]" style={{ marginTop: 4 }} aria-hidden="true">
            <AnimatedWave endGlow={false} />
          </div>

          {/* คำให้กำลังใจ — ข้อความเดียวกับที่มอคอัพระบุไว้เป๊ะๆ */}
          <p className="text-ink" style={{ marginTop: 8, fontSize: 13 }}>
            วันนี้พร้อมสำหรับการออกกำลังกาย 💪
          </p>
        </div>

        <div className="absolute z-30" style={{ top: 'clamp(14px, 4.5vw, 20px)', right: RING_RIGHT }}>
          <NotificationButton latestPR={latestPR} topMuscleThisWeek={topMuscleThisWeek} />
        </div>

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
