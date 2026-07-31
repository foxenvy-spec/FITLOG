'use client'

import type { FitnessScoreResult } from '@/lib/fitnessScore'
import type { LatestPR, TopMuscle } from '@/lib/dashboardStats'
import { dashboardSpec } from '@/lib/dashboardSpec'
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

// Header ของหน้า Dashboard (มือถือ) — v19: แก้บั๊กกระดิ่งทับวง Fitness Score — รอบก่อน (v18) แยก
// กระดิ่งออกมาเป็น absolute top-0 right-0 (44px) แต่คอลัมน์วงแหวนยังใช้ marginTop:8 เดิม (ตอนกระดิ่ง
// ยังอยู่ในโฟลว์) ทำให้วง (เริ่มที่ y=8) ทับซ้อนกับกระดิ่ง (y=0-44) จริง — แก้เป็น marginTop 52
// (=ความสูงกระดิ่ง 44px + ช่องไฟ 8px) ให้วงเริ่มหลังกระดิ่งจริงๆ ไม่ทับกันอีก — font ชื่อ/ระยะห่าง
// บรรทัดฝั่งซ้ายคงค่าจาก v18 ไว้ทั้งหมด (ผู้ใช้ระบุว่ารอบนี้ไม่ลด font เพิ่ม เน้นความสูง/padding/gap)
export default function Header({ greetingText, latestPR, topMuscleThisWeek, displayName, fitnessScore }: HeaderProps) {
  return (
    <div className="relative flex items-start justify-between gap-3 animate-rise">
      {/* Ambient light เฉพาะโซน Header — เดิมพื้นหลังทั้งหน้าตัดแสงส้มออกหมดแล้ว (เทาเย็นล้วน) แต่
          ผลคือ Header ไม่มีแสงสะท้อนเลย ดูแบนไปด้วย — แสงขาวเย็นจางมากๆ เฉพาะจุดนี้ ไม่ใช่สีส้ม จำลอง
          แสงตกกระทบผิวโลหะบริเวณหัวเรื่อง — ลดจาก 4% เหลือ 3% ตาม "Cool White 2-3%" ที่ขอ (แรงเกินไป
          จะเริ่มอ่านเป็น glow แทนที่จะเป็นแค่แสงสะท้อนเบาๆ) */}
      <div
        className="absolute -inset-x-4 -top-6 h-36 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(ellipse at 25% 0%, rgba(255,255,255,.03), transparent 65%)' }}
        aria-hidden="true"
      />
      <div className="min-w-0" style={{ paddingRight: 44 }}>
        <Greeting text={greetingText} />
        <p
          className="uppercase"
          style={{
            marginTop: 4,
            fontFamily: 'var(--font-oswald), var(--font-kanit)',
            // ชื่อ 54px (เทียบเท่า text-6xl ลด 10%, เดิม 60px) — ออกแบบเจาะจงสำหรับ iPhone 15/16 Pro
            // (393px) เท่านั้น ไม่ต้อง responsive-scale ตามจอใหญ่ เผื่อ clamp ขั้นต่ำไว้นิดเดียวกันจอแคบ
            // ผิดปกติ (< 360px) เท่านั้น
            fontSize: 'clamp(46px, 15vw, 54px)',
            fontWeight: 900,
            letterSpacing: '2px',
            lineHeight: 1,
            // v4: สต็อปเดิมยังอ่านเป็น "ตัวหนังสือสีขาว" มากกว่าโลหะ (โซนบนสุด/ล่างสุดสว่างเกินไป ไม่มี
            // จุดมืดจริงจังพอ) — เปลี่ยนตามค่าที่ขอเป๊ะ: บนสุด #DADADA (ไม่ใช่ขาวจ้า) → มืดสุด #6F6F72
            // ที่ 20% (เข้มกว่าเดิมชัดเจน) → กลับขึ้น #A9A9A9 ที่ 45% → #E6E6E6 ที่ 75% → ขาวจ้าที่สุด
            // (100%) อยู่ล่างสุดแทนบนสุด ให้จุดสว่างที่สุดของตัวอักษรอยู่คนละตำแหน่งกับจุดมืดสุด อ่านเป็น
            // ผิวโลหะสะท้อนแสงจริง ไม่ใช่ไล่จากขาวลงเทาทางเดียว
            backgroundImage:
              'linear-gradient(180deg, #DADADA 0%, #6F6F72 20%, #A9A9A9 45%, #E6E6E6 75%, #FFFFFF 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            // เงาเข้มขึ้นเล็กน้อย (.5 -> .6) ให้ตัวอักษรดูจมสลักลงในผิวโลหะ (inner-shadow จำลอง) ชัดขึ้น
            filter: 'drop-shadow(0 2px 1px rgba(0,0,0,.6)) drop-shadow(0 1px 0 rgba(255,255,255,.14))',
            // text-shadow เพิ่มเติม (แยกจาก filter:drop-shadow ด้านบน) — ไฮไลต์เส้นบางสว่างขอบบนตัวอักษร
            // (rgba ขาว 15%) + เงาฟุ้งนุ่มด้านล่าง (ไม่ใช่เงาคมชัด) ให้ตัวอักษรดูมีความหนา/ลอยเหนือพื้นหลัง
            // เล็กน้อย ใช้ได้พร้อมกับ background-clip:text เพราะ text-shadow วาดตามรูปทรงตัวอักษรจริง
            // ไม่สนใจสี fill (ซึ่งตอนนี้ตั้งเป็น transparent)
            textShadow: '0 1px 0 rgba(255,255,255,.15), 0 10px 20px rgba(0,0,0,.35)',
          }}
        >
          {displayName}
        </p>

        <p className="tracked text-muted whitespace-nowrap" style={{ marginTop: 7, fontSize: 11 }}>
          Personalized Fitness
        </p>
        <SubtitleAccent />

        <p className="text-ink" style={{ marginTop: 7, fontSize: 13 }}>
          วันนี้พร้อมสำหรับการออกกำลังกาย 💪
        </p>
      </div>

      {/* กระดิ่งแจ้งเตือน — ลอยมุมขวาบนอิสระ ไม่กินพื้นที่ในโฟลว์แนวตั้งของคอลัมน์ขวาอีกต่อไป */}
      <div className="absolute top-0 right-0">
        <NotificationButton latestPR={latestPR} topMuscleThisWeek={topMuscleThisWeek} />
      </div>

      <div className="flex flex-col items-end shrink-0" style={{ marginTop: 52 }}>
        {/* วง Fitness Score — ขนาดมาจาก dashboardSpec.header.scoreRingSize (90px) แหล่งความจริงเดียว
            แทนตัวเลขลอยในไฟล์นี้ — FitnessRing/FitnessScore สเกล stroke/font ภายในตาม size prop เอง */}
        <FitnessScore score={fitnessScore} size={dashboardSpec.header.scoreRingSize} />
      </div>
    </div>
  )
}
