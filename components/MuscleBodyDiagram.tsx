'use client'

import Image from 'next/image'
import { MUSCLE_GROUP_DIAGRAM_SLUG, type MuscleGroup } from '@/lib/muscle-groups'

// ไดอะแกรมร่างกายแบบภาพจริง (แทน primitive SVG เดิม) — โครงสร้างเป็น layer ซ้อนกัน:
// 1) รูปพื้นหลัง grayscale (front-base.jpg / back-base.jpg) แสดงกล้ามเนื้อคงที่เสมอ ไม่ขึ้นกับข้อมูล
// 2) ต่อกลุ่มกล้ามเนื้อ 1 layer สีทึบ (backgroundColor) ที่ถูก "ตัด" ด้วย CSS mask-image ให้เหลือ
//    เฉพาะบริเวณของกลุ่มนั้น (mask PNG ขาว-ดำ: ขาว=แสดง ดำ=ซ่อน จากการแยก hue ของภาพต้นฉบับ)
//    แล้วปรับ opacity ของ layer นั้นตาม % สัดส่วนที่ฝึกจริง (ฟังก์ชัน intensityOpacity ของผู้เรียกใช้)
// วิธีนี้ทำให้ได้ภาพกล้ามเนื้อสมจริง แต่ยังไล่เข้ม-จางตามข้อมูลได้เหมือน SVG เดิมทุกประการ
// อัตราส่วนภาพ 3:4 (500x667) — ต่างจาก SVG เดิม (200x420) จึงกำหนด width/height ใหม่ที่นี่

export type DiagramView = 'front' | 'back'

interface MuscleBodyDiagramProps {
  view: DiagramView
  regions: MuscleGroup[]
  getOpacity: (group: MuscleGroup) => number
  getColor: (group: MuscleGroup) => string
  onClickGroup?: (group: MuscleGroup) => void
  width?: number
}

export default function MuscleBodyDiagram({
  view,
  regions,
  getOpacity,
  getColor,
  onClickGroup,
  width = 168,
}: MuscleBodyDiagramProps) {
  const height = Math.round((width * 667) / 500)

  return (
    <div
      className="relative rounded-lg overflow-hidden bg-bg select-none"
      style={{ width, height }}
      role="img"
      aria-label={`ไดอะแกรมกล้ามเนื้อ ${view === 'front' ? 'ด้านหน้า' : 'ด้านหลัง'}`}
    >
      {/* unoptimized: รูปเหล่านี้เป็น static asset ในเครื่องอยู่แล้ว (ไม่ต้องผ่าน image optimizer)
          — บาง environment การ deploy ไม่มี sharp ทำให้ /_next/image endpoint ล้มเหลวเงียบๆ
          แล้วเห็นเป็นกล่องว่างเปล่า (บั๊กที่เจอ) การข้าม optimizer ไปเลยทำให้โหลดไฟล์ดิบตรงๆ เสมอ */}
      <Image
        src={`/images/muscle-diagram/${view}-base.jpg`}
        alt=""
        fill
        sizes={`${width}px`}
        className="object-cover"
        priority={false}
        unoptimized
      />
      {regions.map((group) => {
        const slug = MUSCLE_GROUP_DIAGRAM_SLUG[group]
        if (!slug) return null
        const maskUrl = `/images/muscle-diagram/${view}-mask-${slug}.png`
        return (
          <div
            key={group}
            onClick={() => onClickGroup?.(group)}
            className="absolute inset-0 transition-opacity duration-300"
            style={{
              backgroundColor: getColor(group),
              opacity: getOpacity(group),
              cursor: onClickGroup ? 'pointer' : undefined,
              WebkitMaskImage: `url(${maskUrl})`,
              maskImage: `url(${maskUrl})`,
              WebkitMaskSize: '100% 100%',
              maskSize: '100% 100%',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
            }}
          />
        )
      })}
    </div>
  )
}
