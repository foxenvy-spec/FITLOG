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
  /** ความกว้าง (px) — ใช้เป็นค่าเริ่มต้น/ค่า fallback เท่านั้น ตัว SVG จริงๆ สเกลเต็มความกว้าง
   * ของ parent เสมอ (width: 100%) เพื่อให้ผู้เรียกใช้คุมขนาดผ่าน className ของ wrapper แทนได้
   * (เช่น กำหนด breakpoint ให้ใหญ่ขึ้นบนจอกว้าง) โดยที่สัดส่วน 500:667 ยังคงเดิมเสมอผ่าน viewBox */
  width?: number
}

const IMG_W = 500
const IMG_H = 667

// รูปต้นฉบับ (front-base.jpg / back-base.jpg) มีพื้นที่ว่างสีดำข้างตัวเยอะและไม่สมมาตร — ครอบตัด
// "หน้าต่างที่มองเห็น" (viewBox) ให้แคบลงเฉพาะแนวนอน โดยไม่ยุ่งกับ x/y/width/height ของ <image>/<mask>
// ที่ยังคง 0,0,500,667 เท่าเดิมทั้งหมด (แค่ "กล้อง" ซูม/เลื่อนเข้ามาเท่านั้น)
//
// หมายเหตุสำคัญ: ตัวคนไม่ใช่สี่เหลี่ยม — มือ/แขนที่ห้อยลงมาเป็นจุดที่กางออกกว้างสุด (front ถึง x≈455,
// back ถึง x≈77) แต่ไหล่/ลำตัวช่วงบนแคบกว่านั้นมาก (แถว y≈250 front แค่ถึง x≈443, back แค่ x≈89)
// ตอนแรกครอปโดยอิงจุดกว้างสุด (มือ) ทำให้มือชิดกันก็จริง แต่ช่วงไหล่/ลำตัว (ซึ่งเป็นพื้นที่ที่เห็นเด่นสุด
// ในการ์ด) ยังมีช่องว่างเหลือเยอะ — รอบนี้เปลี่ยนมาอิงความกว้างช่วงไหล่/ลำตัวแทน ทำให้ช่องว่างที่เห็นชัด
// ที่สุดแคบลงมาก แลกกับปลายนิ้ว/มือที่ห้อยกว้างสุดโดนตัดขอบไปเล็กน้อย (ไม่กี่ px) ซึ่งสังเกตได้ยากกว่ามาก
const VIEW_CROP: Record<DiagramView, { x: number; width: number }> = {
  front: { x: 51, width: 420 }, // ขอบใน (ขวา) ห่างช่วงไหล่/ลำตัว ~28px
  back: { x: 61, width: 420 }, // ขอบใน (ซ้าย) ห่างช่วงไหล่/ลำตัว ~28px
}

export default function MuscleBodyDiagram({
  view,
  regions,
  getOpacity,
  getColor,
  onClickGroup,
  width = 168,
}: MuscleBodyDiagramProps) {
  const crop = VIEW_CROP[view]
  return (
    <div
      className="relative rounded-lg overflow-hidden select-none w-full"
      style={{ maxWidth: width, aspectRatio: `${crop.width} / ${IMG_H}` }}
      role="img"
      aria-label={`ไดอะแกรมกล้ามเนื้อ ${view === 'front' ? 'ด้านหน้า' : 'ด้านหลัง'}`}
    >
      <svg
        viewBox={`${crop.x} 0 ${crop.width} ${IMG_H}`}
        className="block w-full h-full"
        preserveAspectRatio="xMidYMid meet"
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
