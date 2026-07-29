'use client'

import { useId } from 'react'
import SvgFilters from './SvgFilters'

interface HeroEnergyWaveProps {
  className?: string
}

// สามเส้นที่ "ไม่ใช่เส้นเดียวกัน" จริงๆ (คนละ amplitude/ความถี่/phase) แต่เริ่มต้น/จบที่จุดเดียวกัน
// (0,45) และ (400,45) — ทำให้มองแล้วเหมือนแสงหลายเส้นพันกัน (braided) ตามรูปอ้างอิง แทนที่จะเป็น
// เส้นเดียวที่แค่ซ้อน glow/dash คนละชั้น (v9 เดิม ซึ่งดูแบนเพราะจริงๆ มีแค่เส้นเดียว)
// STRAND_A = เส้นหลัก amplitude ใหญ่สุด, STRAND_B = amplitude กลาง คนละ phase, STRAND_C = เส้นเล็ก
// ความถี่ถี่กว่า ใกล้ขาว ให้ความรู้สึก "ประกาย" แทรกอยู่ระหว่างสองเส้นหลัก
const STRAND_A = 'M0,45 C40,8 80,82 130,45 C180,8 220,82 270,45 C310,15 350,32 400,45'
const STRAND_B = 'M0,45 C50,72 90,18 140,50 C190,76 230,22 280,48 C320,62 360,38 400,45'
const STRAND_C =
  'M0,45 C25,28 55,62 85,38 C115,22 145,58 175,36 C205,60 235,28 265,50 C295,30 330,54 360,40 C378,47 390,44 400,45'

// เส้นคลื่นพลังงานหลักของ header — ประกอบจากหลายเลเยอร์ตามสเปคที่ขอ:
//   Light Beam (แถบแสงแนวนอนฟุ้งๆ พื้นหลังกว้าง) → จุดกำเนิดแสงซ้าย (origin flare) → Glow Wave
//   (เบลอกว้าง สีจาง ของเส้นหลัก) → 3 เส้นคลื่นจริง (Strand A/B/C คนละรูปทรง ไม่ใช่เส้นเดียวกันซ้อนกัน)
//   แต่ละเส้นมี bloom/gradient ไหลเองของตัวเอง → Lens Flare ที่ปลายเส้นด้านขวา
// viewBox กว้าง 400 สูง 90 คงที่ ทุกเส้นเริ่ม/จบที่ (0,45)/(400,45) เสมอ — y=45 คือกึ่งกลางแนวตั้งของ
// viewBox พอดี (90/2) ดังนั้นไม่ว่า wrapper ด้านนอกจะสูงเท่าไหร่ (preserveAspectRatio="none") จุดจบ
// เส้นจะอยู่กึ่งกลางแนวตั้งของ wrapper เสมอ — Header.tsx แค่จัดให้กึ่งกลาง wrapper ตรงกับกึ่งกลางวง
// Fitness Score ก็พอ ไม่ต้องคำนวณ offset ซับซ้อนเพิ่ม
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
        y="25"
        width="440"
        height="40"
        fill={`url(#${idPrefix}-flow-gradient)`}
        opacity="0.08"
        filter={`url(#${idPrefix}-glow-wide)`}
        style={{ mixBlendMode: 'screen' }}
      />

      {/* Origin Flare — จุดกำเนิดแสงด้านซ้าย ให้ความรู้สึกว่าเส้นคลื่นทั้งหมด "แผ่ออกมา" จากจุดนี้ */}
      <circle cx="4" cy="45" r="9" fill="#FFD166" filter={`url(#${idPrefix}-glow-wide)`} style={{ mixBlendMode: 'screen' }} />
      <circle cx="4" cy="45" r="3" fill="#FFFFFF" filter={`url(#${idPrefix}-glow-soft)`} style={{ mixBlendMode: 'screen' }} />

      {/* Glow Wave — เบลอกว้าง สีจาง ของเส้นหลัก (Strand A) อยู่ล่างสุดของสแตก */}
      <path
        d={STRAND_A}
        fill="none"
        stroke="#FF8A00"
        strokeWidth="20"
        strokeOpacity="0.3"
        filter={`url(#${idPrefix}-glow-wide)`}
        style={{ mixBlendMode: 'screen' }}
      />

      {/* Strand B — เส้นคลื่นรอง amplitude กลาง คนละ phase จาก A ให้เกิดมิติ "พันกัน" จริง (ไม่ใช่แค่
          dash ของเส้นเดียวกัน) dash ไหลต่อเนื่องช้าๆ */}
      <path
        d={STRAND_B}
        fill="none"
        stroke="#FFAA00"
        strokeWidth="1.6"
        strokeOpacity="0.75"
        strokeLinecap="round"
        strokeDasharray="10 8"
        className="animate-wave-flow-slow"
        filter={`url(#${idPrefix}-glow-soft)`}
        style={{ mixBlendMode: 'screen' }}
      />

      {/* Strand C — เส้นเล็กความถี่ถี่ที่สุด ใกล้ขาว แทรกระหว่าง A/B ให้ความรู้สึก "ประกาย/ไฟฟ้า" */}
      <path
        d={STRAND_C}
        fill="none"
        stroke="#FFF4CC"
        strokeWidth="1"
        strokeOpacity="0.7"
        strokeDasharray="5 9"
        className="animate-wave-flow"
        style={{ mixBlendMode: 'screen' }}
      />

      {/* Strand A — เส้นแกนไฟหลัก (เส้นใหญ่สุด/สว่างสุด) ใช้ gradient ที่ไหลเองผ่าน animateTransform
          ใน SvgFilters + bloom filter ให้สว่างฟุ้งขึ้นอีกชั้นจาก glow-soft ธรรมดา */}
      <path
        d={STRAND_A}
        fill="none"
        stroke={`url(#${idPrefix}-flow-gradient)`}
        strokeWidth="3.5"
        strokeLinecap="round"
        filter={`url(#${idPrefix}-bloom)`}
        style={{ mixBlendMode: 'screen' }}
      />
      {/* แกนในสุด เกือบขาว บางมาก ทับกลางเส้น A ให้ดูสว่างจ้าตรงแกนจริงๆ ไม่ใช่แค่สีส้ม */}
      <path d={STRAND_A} fill="none" stroke="#FFF9E8" strokeWidth="1.1" strokeOpacity="0.9" strokeLinecap="round" style={{ mixBlendMode: 'screen' }} />

      {/* Lens Flare — จุดบรรจบกับวง Fitness Score ด้านขวา */}
      <circle
        cx="398"
        cy="45"
        r="16"
        fill="#FFF4CC"
        filter={`url(#${idPrefix}-glow-wide)`}
        className="animate-header-glow"
        style={{ mixBlendMode: 'screen' }}
      />
      <circle cx="398" cy="45" r="5" fill="#FFFFFF" filter={`url(#${idPrefix}-glow-soft)`} style={{ mixBlendMode: 'screen' }} />
    </svg>
  )
}
