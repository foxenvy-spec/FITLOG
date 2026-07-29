'use client'

import { useId } from 'react'
import SvgFilters from './SvgFilters'

interface HeroEnergyWaveProps {
  className?: string
}

const CENTER_Y = 45

/** จุดยึด (anchor points) ของแต่ละเส้น — ไม่ใช่ amplitude คงที่ซ้ำๆ กันแบบ demo แต่มี "จังหวะ"
 *  (rhythm) เปลี่ยนไปเรื่อยๆ ตามที่ขอเป๊ะๆ: เล็ก → ใหญ่ → กลาง → ใหญ่ → เล็ก ก่อนจะแผ่วลงตอนใกล้วง
 *  Fitness Score ทางขวา (จุดสุดท้ายกลับมาที่ CENTER_Y เสมอ ให้ปลายเส้นเรียบเสมอกันทุกเส้น) */
const STRAND_A_POINTS: Array<[number, number]> = [
  [0, CENTER_Y],
  [50, 32], // เล็ก (ห่างจากกึ่งกลาง 13)
  [100, CENTER_Y],
  [150, 6], // ใหญ่ (ห่าง 39)
  [200, CENTER_Y],
  [255, 70], // กลาง (ห่าง 25)
  [300, CENTER_Y],
  [340, 12], // ใหญ่ (ห่าง 33)
  [372, 38], // เล็ก แผ่วลงก่อนเข้าวง
  [400, CENTER_Y],
]

const STRAND_B_POINTS: Array<[number, number]> = [
  [0, CENTER_Y],
  [40, 60], // กลาง คนละเฟสกับ A
  [85, 30], // ใหญ่
  [135, 66], // ใหญ่
  [185, 40],
  [235, 14], // ใหญ่สุด
  [285, 52],
  [325, 62], // กลาง
  [365, 40], // เล็ก แผ่วลง
  [400, CENTER_Y],
]

/** ปรับ amplitude ของเส้นอ้างอิง (คูณระยะห่างจาก CENTER_Y) พร้อมเลื่อนเฟส (xShift) เล็กน้อย —
 *  ใช้สร้างเส้นบางเพิ่มจาก A/B โดยไม่ต้องเขียนพิกัดมือใหม่ทั้งหมด แต่ยังได้เส้นที่ "ไม่ใช่เส้นเดียวกัน"
 *  จริงๆ (คนละ amplitude คนละเฟส) ต่างจาก v10 ที่ทุกเลเยอร์ใช้ path เดียวกันเป๊ะ */
function scalePoints(points: Array<[number, number]>, factor: number, xShift: number): Array<[number, number]> {
  return points.map(([x, y]) => [Math.max(0, Math.min(400, x + xShift)), CENTER_Y + (y - CENTER_Y) * factor])
}

const STRAND_C_POINTS = scalePoints(STRAND_A_POINTS, 0.55, 14)
const STRAND_D_POINTS = scalePoints(STRAND_B_POINTS, 0.62, -10)
const STRAND_E_POINTS = scalePoints(STRAND_A_POINTS, 0.38, 24)

/** ต่อจุดยึดเป็นเส้นโค้งเรียบด้วยเทคนิคเดียวกับ sparkline ใน MetricCard — จุดควบคุมอยู่ที่กึ่งกลาง
 *  แนวนอนของแต่ละช่วง (y เท่ากับจุดต้น/ปลายของช่วงนั้น) ทำให้เกิดเส้นโค้ง S-curve เรียบๆ ไหลผ่านทุก
 *  anchor point พอดี โดยไม่ต้องกะพิกัดจุดควบคุมเองทีละคู่ */
function buildSmoothPath(points: Array<[number, number]>): string {
  const [first, ...rest] = points
  let d = `M${first[0]},${first[1]}`
  let prev = first
  for (const point of rest) {
    const midX = (prev[0] + point[0]) / 2
    d += ` C${midX},${prev[1]} ${midX},${point[1]} ${point[0]},${point[1]}`
    prev = point
  }
  return d
}

const STRAND_A = buildSmoothPath(STRAND_A_POINTS)
const STRAND_B = buildSmoothPath(STRAND_B_POINTS)
const STRAND_C = buildSmoothPath(STRAND_C_POINTS)
const STRAND_D = buildSmoothPath(STRAND_D_POINTS)
const STRAND_E = buildSmoothPath(STRAND_E_POINTS)

// เส้นคลื่นพลังงานหลักของ header — v11 แก้ตามฟีดแบ็ก 8 ข้อ:
//   1) amplitude เดิมเตี้ยไป (~20px) ตอนนี้แกว่งเต็ม viewBox เกือบสุด (~35-39 หน่วยจาก center)
//   2) path เดิมมีแค่ ~3 ช่วง C ตอนนี้ 9 ช่วง (สมจริงกว่า มีรายละเอียดมากกว่า)
//   3) amplitude ไม่คงที่ซ้ำๆ แล้ว — มีจังหวะ เล็ก/ใหญ่/กลาง/ใหญ่/เล็ก ตามที่ขอ
//   4) Light Beam เปลี่ยนจากแท่งหนาเป็นเส้นบาง (~2-3px ใน viewBox) blur เยอะ
//   5) glow ของ Glow Wave ใช้ filter "glow-tight" (stdDeviation เล็ก) แนบรูปทรงเส้นจริง แทนที่จะ
//      บวมเป็นก้อนทึบเหมือนเดิม (stroke กว้าง 20 + blur กว้าง)
//   6) (Ring เปลี่ยนเป็น SVG-based ใน FitnessRing.tsx แยกต่างหาก ไม่ใช่ของไฟล์นี้)
//   7) ปลายเส้น (x=400) ตอนนี้ Header.tsx วางให้ตรงกับ "ขอบซ้าย" ของวง (ไม่ใช่กึ่งกลางวงเหมือนเดิม)
//      lens flare เลยไปบรรจบ/เบลอเข้ากับ glow ของวงจริงๆ แทนที่จะลอยอยู่ข้างๆ
//   8) เพิ่มเส้นบางจาก 1 เป็น 4 เส้น (B/C/D/E) คนละ amplitude/เฟส ซ้อนกับเส้นหลัก (A) รวมเป็น 5 เส้น
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

      {/* Light Beam — เส้นบางฟุ้งพาดกลาง header (ไม่ใช่แท่งหนาเหมือนเดิม) ให้ความรู้สึกมีแหล่งกำเนิด
          แสงแนวนอนอยู่หลังเส้นคลื่นแบบเบาๆ */}
      <rect
        x="-20"
        y="43.5"
        width="440"
        height="3"
        fill={`url(#${idPrefix}-flow-gradient)`}
        opacity="0.16"
        filter={`url(#${idPrefix}-glow-wide)`}
        style={{ mixBlendMode: 'screen' }}
      />

      {/* Origin Flare — จุดกำเนิดแสงด้านซ้าย ให้ความรู้สึกว่าเส้นคลื่นทั้งหมด "แผ่ออกมา" จากจุดนี้ */}
      <circle cx="4" cy={CENTER_Y} r="9" fill="#FFD166" filter={`url(#${idPrefix}-glow-wide)`} style={{ mixBlendMode: 'screen' }} />
      <circle cx="4" cy={CENTER_Y} r="3" fill="#FFFFFF" filter={`url(#${idPrefix}-glow-soft)`} style={{ mixBlendMode: 'screen' }} />

      {/* Glow Wave — เรืองแสงแนบรูปทรงเส้นหลัก (A) เอง ใช้ glow-tight (stdDeviation เล็ก) ไม่ใช่ stroke
          กว้าง+blur กว้างเหมือนเดิม ที่ทำให้กลายเป็นก้อนทึบไม่เห็นรูปทรงคลื่น */}
      <path d={STRAND_A} fill="none" stroke="#FF8A00" strokeWidth="6" strokeOpacity="0.55" filter={`url(#${idPrefix}-glow-tight)`} style={{ mixBlendMode: 'screen' }} />

      {/* 4 เส้นบาง (B/C/D/E) — คนละ amplitude/เฟสจากเส้นหลักจริงๆ ไม่ใช่ dash ของเส้นเดียวกันซ้ำ
          ให้เกิดมิติ "พันกัน" หลายเส้นตามภาพอ้างอิง แต่ละเส้น dash ไหลคนละจังหวะกัน */}
      <path d={STRAND_B} fill="none" stroke="#FFAA00" strokeWidth="1.4" strokeOpacity="0.7" strokeLinecap="round" strokeDasharray="9 7" className="animate-wave-flow-slow" filter={`url(#${idPrefix}-glow-soft)`} style={{ mixBlendMode: 'screen' }} />
      <path d={STRAND_C} fill="none" stroke="#FFD166" strokeWidth="1.1" strokeOpacity="0.6" strokeDasharray="6 8" className="animate-wave-flow" style={{ mixBlendMode: 'screen' }} />
      <path d={STRAND_D} fill="none" stroke="#FFF4CC" strokeWidth="1" strokeOpacity="0.55" strokeDasharray="5 10" className="animate-wave-flow-slow" style={{ mixBlendMode: 'screen' }} />
      <path d={STRAND_E} fill="none" stroke="#FFB347" strokeWidth="0.9" strokeOpacity="0.45" strokeDasharray="4 9" className="animate-wave-flow" style={{ mixBlendMode: 'screen' }} />

      {/* Strand A — เส้นแกนไฟหลัก (เส้นใหญ่สุด/สว่างสุด) ใช้ gradient ที่ไหลเองผ่าน animateTransform
          ใน SvgFilters + bloom filter ให้สว่างฟุ้งขึ้นอีกชั้นจาก glow-soft ธรรมดา */}
      <path d={STRAND_A} fill="none" stroke={`url(#${idPrefix}-flow-gradient)`} strokeWidth="3.5" strokeLinecap="round" filter={`url(#${idPrefix}-bloom)`} style={{ mixBlendMode: 'screen' }} />
      {/* แกนในสุด เกือบขาว บางมาก ทับกลางเส้น A ให้ดูสว่างจ้าตรงแกนจริงๆ ไม่ใช่แค่สีส้ม */}
      <path d={STRAND_A} fill="none" stroke="#FFF9E8" strokeWidth="1.1" strokeOpacity="0.9" strokeLinecap="round" style={{ mixBlendMode: 'screen' }} />

      {/* Lens Flare — จุดบรรจบกับวง Fitness Score ด้านขวา (Header.tsx วาง wrapper ให้ x=400 ตรงกับ
          ขอบซ้ายของวงพอดี ไม่ใช่กึ่งกลางวงเหมือนเดิม แสงตรงนี้เลยไปเบลอรวมกับ glow ของวงจริงๆ) */}
      <circle cx="398" cy={CENTER_Y} r="18" fill={`url(#${idPrefix}-radial-glow)`} className="animate-header-glow" style={{ mixBlendMode: 'screen' }} />
      <circle cx="398" cy={CENTER_Y} r="5" fill="#FFFFFF" filter={`url(#${idPrefix}-glow-soft)`} style={{ mixBlendMode: 'screen' }} />
    </svg>
  )
}
