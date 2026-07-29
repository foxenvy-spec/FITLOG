'use client'

import type { ReactNode } from 'react'
import type { FitnessScoreResult } from '@/lib/fitnessScore'
import type { LatestPR, TopMuscle } from '@/lib/dashboardStats'
import AmbientGlow from './AmbientGlow'
import FitnessScore from './FitnessScore'
import NotificationButton from './NotificationButton'
import Greeting from './Greeting'
import HeroEnergyWave from './HeroEnergyWave'
import SubtitleAccent from './SubtitleAccent'
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
// ความสูงของ wrapper เส้นคลื่น HeroEnergyWave — viewBox ภายในเป็น 0 0 400 200 (preserveAspectRatio
// ="none") จุดจบเส้นอยู่ที่กึ่งกลางแนวตั้งของ viewBox พอดี (200/2) ดังนั้นไม่ว่า WAVE_HEIGHT จะเป็น
// เท่าไหร่ จุดจบเส้นก็จะอยู่กึ่งกลางแนวตั้งของ wrapper นี้เสมอ — แค่จัดกึ่งกลาง wrapper ให้ตรงกับ
// กึ่งกลางวง Fitness Score (RING_TOP + RING_SIZE/2) ก็พอ ไม่ต้องคำนวณ offset ซับซ้อนเพิ่ม
// ค่านี้ใหญ่กว่า RING_SIZE เดิม (84) มาก เพราะ amplitude ของเส้นคลื่นใน reference (30 หน่วยจาก viewBox
// 200 หน่วย = 15%) ต้องการพื้นที่แนวตั้งมากกว่าความสูงวงล้วนๆ ถึงจะไม่ดูเตี้ยจนไม่มีพลัง — 150px ยังอยู่
// ในขอบเขตปลอดภัยไม่ล้น hero (แม้ที่ RING_TOP ค่าต่ำสุด 60px พื้นที่เหนือ/ใต้กึ่งกลางวงยังเหลือ >100px
// ทั้งสองด้าน พอสำหรับครึ่งหนึ่งของ 150 พอดี)
const WAVE_HEIGHT = 150
// เลื่อนลง 25px จากกึ่งกลางวงตรงๆ (ตามฟีดแบ็ก "wave ชนกับ Personalized Fitness") ให้เส้นคลื่นไปอยู่
// ในช่องว่างระหว่าง subtitle+SubtitleAccent (จบประมาณ y=97-117 ที่ RING_TOP ต่ำสุด) กับคำให้กำลังใจ
// (เริ่มประมาณ y=125) แทนที่จะพาดทับ subtitle โดยตรงเหมือนตอนจัดกึ่งกลางวงเป๊ะๆ — ยังคำนวณจาก RING_TOP/
// RING_SIZE อยู่ (ไม่ hardcode เลขลอยๆ) แค่บวก offset คงที่เพิ่มเข้าไปอีกชั้นเดียว
const WAVE_VERTICAL_OFFSET = 25
const WAVE_TOP = `calc(${RING_TOP} + ${RING_SIZE}px / 2 - ${WAVE_HEIGHT}px / 2 + ${WAVE_VERTICAL_OFFSET}px)`
// ปลายเส้น (x=400 ใน viewBox) ตอนนี้ยืดเข้าไปถึง "กึ่งกลาง" ของวง (เดิมจอดแค่ขอบซ้ายวง) ให้เส้นทาบเข้าไป
// ใต้ตัววงจริงๆ ไม่ใช่แค่ชนขอบ — ส่วนที่ทาบเข้าไปใต้วงจะถูกจางหายไปเองด้วย WAVE_MASK ด้านล่าง (ไม่ใช่ตัว
// วงมาบังทับ เพราะตัว FitnessRing ไม่มีพื้นทึบ) ให้ความรู้สึกว่าคลื่น "ไหลเข้า" วงจริงๆ แทนที่จะรู้สึกว่า
// วางชนกันเฉยๆ
const WAVE_RIGHT = `calc(${RING_RIGHT} + ${RING_SIZE}px / 2)`
// จางเส้นคลื่นให้หายไปก่อนถึงขอบขวาสุดของ wrapper เอง (แทนที่จะให้เห็นเส้นวิ่งเข้าไปเต็มๆ ใต้วงซึ่งจะโผล่
// พ้นขอบอีกฝั่งของวงออกมา) — ทึบเต็มถึง 70% ของความกว้างแล้วค่อยๆ จางจนโปร่งใสสนิทที่ 95%
const WAVE_MASK = 'linear-gradient(90deg, black 0%, black 70%, transparent 95%)'

// Header ของหน้า Dashboard (มือถือ) — v13: ปรับจาก v12 (พอร์ตตรงจาก reference mockup) ตามฟีดแบ็ก
// รอบล่าสุด — wave ใหญ่ขึ้น/เลื่อนลงเลี่ยงตัวหนังสือ/ทาบเข้าไปใต้วงจริง (ดูคอมเมนต์ WAVE_* ด้านบน)
// + เพิ่มจุดสว่างหลังวง (radial-gradient ชั้นแรกใน background) ให้ hero มีมิติขึ้น
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
        className="relative overflow-hidden rounded-[22px]"
        style={{
          height: `calc(${RING_TOP} + ${RING_SIZE}px + ${RING_LABEL_HEIGHT}px + ${HERO_BOTTOM_BREATHING_ROOM}px)`,
          // พื้นหลังของตัวการ์ด hero เอง — เลเยอร์แรก (78%/42%) เพิ่มตามฟีดแบ็ก "hero ยังมืดไป" เจาะจงอยู่
          // หลังวง Fitness Score พอดี (RING_TOP กลาง ๆ ค่อนไปทางขวา) ให้มิติแสงชัดขึ้นกว่าเดิม ก่อนจะไล่
          // เข้า vignette มืดสองชั้นถัดมา (พอร์ตจาก reference mockup .hero-card เดิม) — จำกัดขอบเขตไว้แค่
          // ไฟล์นี้ (mobile header) ไม่แตะสีพื้นหลังหลักของทั้งแอป (bg-bg ใน tailwind.config)
          background:
            'radial-gradient(circle at 78% 42%, rgba(255,150,0,0.22), transparent 60%), radial-gradient(ellipse 260px 200px at 82% 55%, rgba(255,120,20,0.20), transparent 60%), radial-gradient(ellipse 400px 300px at 50% 50%, #140b04, #060402 70%)',
        }}
      >
        {/* Background: glow + energy wave — เรียงจากหลังสุดไปหน้าสุด */}
        <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
          <AmbientGlow color={fitnessScore.color} />
        </div>
        <div
          className="absolute z-[8] pointer-events-none left-0"
          style={{
            top: WAVE_TOP,
            right: WAVE_RIGHT,
            height: WAVE_HEIGHT,
            WebkitMaskImage: WAVE_MASK,
            maskImage: WAVE_MASK,
          }}
          aria-hidden="true"
        >
          <HeroEnergyWave />
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

          <p className="tracked text-muted whitespace-nowrap" style={{ marginTop: 2, fontSize: 11 }}>
            Personalized Fitness
          </p>
          <SubtitleAccent />

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
