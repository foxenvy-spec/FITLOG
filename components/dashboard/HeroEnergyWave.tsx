'use client'

import { useId } from 'react'
import SvgFilters from './SvgFilters'

interface HeroEnergyWaveProps {
  className?: string
}

const MAIN_PATH = 'M0,58 C70,30 130,78 210,46 C270,22 320,42 400,45'

// เส้นคลื่นพลังงานหลักของ header — ประกอบจากหลายเลเยอร์ซ้อนกันตามสเปคที่ขอ:
//   Light Beam (แถบแสงแนวนอนฟุ้งๆ พื้นหลังกว้าง) → Glow Wave (เบลอกว้าง สีจาง) → Main Wave
//   (เส้นแกนไฟ gradient ไหลเองผ่าน SvgFilters + bloom) → เส้นบาง 2 ชั้นซ้อน (dash ไหลต่อเนื่อง
//   คนละจังหวะกัน ให้ผิวเส้นมีมิติ/ประกาย) → Lens Flare ที่ปลายเส้นด้านขวา
// viewBox กว้าง 400 สูง 90 คงที่ ปลายเส้นจบที่ (400,45) เสมอ — y=45 คือกึ่งกลางแนวตั้งของ viewBox
// พอดี (90/2) ดังนั้นไม่ว่า wrapper ด้านนอกจะสูงเท่าไหร่ (preserveAspectRatio="none") จุดจบเส้นจะอยู่
// กึ่งกลางแนวตั้งของ wrapper เสมอ — Header.tsx แค่จัดให้กึ่งกลาง wrapper ตรงกับกึ่งกลางวง Fitness
// Score ก็พอ ไม่ต้องคำนวณ offset ซับซ้อนเพิ่ม
export default function HeroEnergyWave({ className = '' }: HeroEnergyWaveProps) {
  const rawId = useId()
  const idPrefix = `hew-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <svg
      viewBox="0 0 400 90"
      preserveAspectRatio="none"
      className={`w-full h-full overflow-visible ${className}`}
      aria-hidden="true"
    >
      <SvgFilters idPrefix={idPrefix} />

      {/* Light Beam — แถบแสงแนวนอนฟุ้งๆ พาดกลาง header ให้ความรู้สึกมีแหล่งกำเนิดแสงกว้างอยู่หลังเส้นคลื่น
          ไม่ใช่แค่ตัวเส้นเรืองแสงเดี่ยวๆ ลอยอยู่เฉยๆ */}
      <rect
        x="-20"
        y="30"
        width="440"
        height="30"
        fill={`url(#${idPrefix}-flow-gradient)`}
        opacity="0.07"
        filter={`url(#${idPrefix}-glow-wide)`}
        style={{ mixBlendMode: 'screen' }}
      />

      {/* Glow Wave — เบลอกว้าง สีจาง อยู่ล่างสุดของสแตกเส้น */}
      <path
        d={MAIN_PATH}
        fill="none"
        stroke="#FF8A00"
        strokeWidth="18"
        strokeOpacity="0.25"
        filter={`url(#${idPrefix}-glow-wide)`}
        style={{ mixBlendMode: 'screen' }}
      />

      {/* Main Wave — เส้นแกนไฟหลัก ใช้ gradient ที่ไหลเองผ่าน animateTransform ใน SvgFilters +
          bloom filter ให้สว่างฟุ้งขึ้นอีกชั้นจาก glow-soft ธรรมดา */}
      <path
        d={MAIN_PATH}
        fill="none"
        stroke={`url(#${idPrefix}-flow-gradient)`}
        strokeWidth="3"
        strokeLinecap="round"
        filter={`url(#${idPrefix}-bloom)`}
        style={{ mixBlendMode: 'screen' }}
      />

      {/* เส้นบางซ้อน 2 ชั้น — dash ไหลต่อเนื่องคนละความเร็ว/ทิศทางกัน ให้ผิวเส้นดูมีประกายเคลื่อนไหว
          แทนที่จะเป็นเส้นแบนเรียบเส้นเดียว */}
      <path
        d={MAIN_PATH}
        fill="none"
        stroke="#FFF4CC"
        strokeWidth="1"
        strokeOpacity="0.8"
        strokeDasharray="6 10"
        className="animate-wave-flow"
        style={{ mixBlendMode: 'screen' }}
      />
      <path
        d={MAIN_PATH}
        fill="none"
        stroke="#FFD166"
        strokeWidth="1"
        strokeOpacity="0.5"
        strokeDasharray="4 14"
        className="animate-wave-flow-slow"
        style={{ mixBlendMode: 'screen' }}
      />

      {/* Lens Flare — จุดบรรจบกับวง Fitness Score ด้านขวา */}
      <circle
        cx="398"
        cy="45"
        r="14"
        fill="#FFF4CC"
        filter={`url(#${idPrefix}-glow-wide)`}
        className="animate-header-glow"
        style={{ mixBlendMode: 'screen' }}
      />
      <circle cx="398" cy="45" r="4.5" fill="#FFFFFF" filter={`url(#${idPrefix}-glow-soft)`} style={{ mixBlendMode: 'screen' }} />
    </svg>
  )
}
