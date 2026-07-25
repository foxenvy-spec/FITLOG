'use client'

import { MUSCLE_GROUP_DIAGRAM_SLUG, type MuscleGroup } from '@/lib/muscle-groups'

// ไดอะแกรมร่างกายแบบภาพจริง — โครงสร้างเป็น layer ซ้อนกัน:
// 1) รูปพื้นหลัง grayscale (front-base.jpg / back-base.jpg) แสดงกล้ามเนื้อคงที่เสมอ ไม่ขึ้นกับข้อมูล
// 2) ต่อกลุ่มกล้ามเนื้อ 1 สี่เหลี่ยมสีทึบ ถูก "ตัด" ให้เหลือเฉพาะบริเวณของกลุ่มนั้น ด้วย SVG <mask>
//    (ภาพขาว-ดำ: ขาว=แสดง ดำ=ซ่อน) แล้วปรับ opacity ของ layer นั้นตาม % สัดส่วนที่ฝึกจริง
//    (ฟังก์ชัน intensityOpacity ของผู้เรียกใช้)
//
// หมายเหตุ (แก้บัก): เดิมใช้ CSS `mask-image` บน <div> ธรรมดา ซึ่งพบว่าไม่ทำงานในบาง
// browser/webview (เห็นเป็นกล่องสีทึบไม่มีรูป ไม่มีการตัดขอบเลย) — ย้ายมาใช้ SVG native
// <mask> element แทน ซึ่งรองรับกว้างกว่ามาก (เป็นฟีเจอร์ SVG พื้นฐาน ไม่ใช่ CSS ทดลอง) และ
// ใช้ <image href="..."> ธรรมดาแทน next/image เพื่อตัดปัญหา image optimizer (/_next/image)
// ล้มเหลวใน environment ที่ไม่มี sharp ไปด้วยในตัว

export type DiagramView = 'front' | 'back'

interface MuscleBodyDiagramProps {
  view: DiagramView
  regions: MuscleGroup[]
  getOpacity: (group: MuscleGroup) => number
  getColor: (group: MuscleGroup) => string
  onClickGroup?: (group: MuscleGroup) => void
  width?: number
}

const IMG_W = 500
const IMG_H = 667

export default function MuscleBodyDiagram({
  view,
  regions,
  getOpacity,
  getColor,
  onClickGroup,
  width = 168,
}: MuscleBodyDiagramProps) {
  const height = Math.round((width * IMG_H) / IMG_W)

  return (
    <div
      className="relative rounded-lg overflow-hidden select-none"
      style={{ width, height }}
      role="img"
      aria-label={`ไดอะแกรมกล้ามเนื้อ ${view === 'front' ? 'ด้านหน้า' : 'ด้านหลัง'}`}
    >
      <svg
        viewBox={`0 0 ${IMG_W} ${IMG_H}`}
        width={width}
        height={height}
        className="block"
      >
        <defs>
          {regions.map((group) => {
            const slug = MUSCLE_GROUP_DIAGRAM_SLUG[group]
            if (!slug) return null
            const maskId = `mbd-${view}-${slug}`
            return (
              <mask
                key={maskId}
                id={maskId}
                maskUnits="userSpaceOnUse"
                x={0}
                y={0}
                width={IMG_W}
                height={IMG_H}
              >
                <image
                  href={`/images/muscle-diagram/${view}-mask-${slug}.png`}
                  xlinkHref={`/images/muscle-diagram/${view}-mask-${slug}.png`}
                  x={0}
                  y={0}
                  width={IMG_W}
                  height={IMG_H}
                  preserveAspectRatio="none"
                />
              </mask>
            )
          })}
        </defs>

        <image
          href={`/images/muscle-diagram/${view}-base.jpg`}
          xlinkHref={`/images/muscle-diagram/${view}-base.jpg`}
          x={0}
          y={0}
          width={IMG_W}
          height={IMG_H}
          preserveAspectRatio="xMidYMid slice"
          style={{ mixBlendMode: 'lighten' }}
        />

        {regions.map((group) => {
          const slug = MUSCLE_GROUP_DIAGRAM_SLUG[group]
          if (!slug) return null
          const maskId = `mbd-${view}-${slug}`
          return (
            <rect
              key={group}
              x={0}
              y={0}
              width={IMG_W}
              height={IMG_H}
              fill={getColor(group)}
              opacity={getOpacity(group)}
              mask={`url(#${maskId})`}
              onClick={() => onClickGroup?.(group)}
              style={{ cursor: onClickGroup ? 'pointer' : undefined, transition: 'opacity 300ms' }}
            />
          )
        })}
      </svg>
    </div>
  )
}
