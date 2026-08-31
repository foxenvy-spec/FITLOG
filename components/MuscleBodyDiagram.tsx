'use client'

import { useEffect, useRef } from 'react'
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
//
// บั๊ก (ฟีดแบ็ก "ชี้ตรงไหนก็เจอแต่น่อง") — แต่ละ <rect> ของแต่ละกลุ่มครอบเต็มผืนภาพเสมอ (x=0,y=0,
// width=IMG_W,height=IMG_H) ใช้ `mask` ตัดแค่ "ภาพที่วาดออกมา" เท่านั้น ไม่ได้ตัด "พื้นที่ที่รับคลิก/hover"
// ไปด้วย (mask ไม่มีผลกับ pointer-events ในเบราว์เซอร์หลักเลย ต่างจาก clip-path ที่มีผล) ผลคือ rect ที่
// วาดทับบนสุด (ตัวสุดท้ายใน regions array คือ "น่อง" ทั้งสองมุมมอง) ครอบคลุมพื้นที่รับ event ทั้งผืนภาพ
// เพียงตัวเดียว กลุ่มอื่นด้านล่างไม่มีทางรับ event ได้เลยไม่ว่าจะชี้ตรงไหน — แก้โดยเลิกผูก onClick/
// onMouseEnter ไว้ที่ตัว <rect> รายกลุ่ม (ยังใช้วาดสีทึบเหมือนเดิม แต่ไม่รับ event แล้ว) ย้ายมาตรวจจับที่
// SVG ระดับบนสุดแทน: โหลดภาพ mask ของทุกกลุ่มเข้า canvas ที่มองไม่เห็น (ครั้งเดียว, cache ข้าม instance)
// แล้วอ่านค่าความสว่างที่พิกัดจริงตรงจุดที่ชี้/คลิก (แปลงพิกัดหน้าจอ -> พิกัดภาพ 500x667 ผ่าน viewBox/crop)
// เทียบกับ mask ของแต่ละกลุ่มตรงๆ — ได้ผลลัพธ์ตรงกับรูปที่วาดจริงเป๊ะ (mask เดียวกันทั้งสองทาง)

export type DiagramView = 'front' | 'back'

interface MuscleBodyDiagramProps {
  view: DiagramView
  regions: MuscleGroup[]
  getOpacity: (group: MuscleGroup) => number
  getColor: (group: MuscleGroup) => string
  onClickGroup?: (group: MuscleGroup) => void
  /** ฟีดแบ็ก "Desktop Only — เอาเมาส์ไปชี้ (Hover) ที่มัดกล้ามเนื้อ ให้มี Mini-Tooltip ลอยขึ้นมาบอกทันที"
   * — เรียกตอน pointer เข้า/ออกบริเวณกล้ามเนื้อกลุ่มนั้น (null = ไม่ได้ชี้ที่กลุ่มไหนแล้ว) ผู้เรียกใช้
   * (WeeklyMuscleHeatmap.tsx) เป็นคนตัดสินใจว่าจะ gate เฉพาะเดสก์ท็อปจริง (matchMedia hover:hover) ก่อน
   * ส่ง prop นี้เข้ามาหรือไม่ — ไม่ส่งมา (undefined) = ปิดพฤติกรรมนี้ทั้งหมด ไม่ผูก event listener เลย */
  onHoverGroup?: (group: MuscleGroup | null) => void
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

// cache ข้าม instance/mount (mask เป็น static asset ไม่เปลี่ยน โหลดครั้งเดียวพอ) — key คือ URL ของภาพ
// mask, value คือ ImageData หลังวาดลง canvas แล้ว (null = โหลด/อ่านไม่สำเร็จ เช่นภาพหาย)
const maskDataCache = new Map<string, Promise<ImageData | null>>()

function loadMaskImageData(url: string): Promise<ImageData | null> {
  const cached = maskDataCache.get(url)
  if (cached) return cached
  const promise = new Promise<ImageData | null>((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null)
      return
    }
    const img = new window.Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.drawImage(img, 0, 0)
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
  maskDataCache.set(url, promise)
  return promise
}

export default function MuscleBodyDiagram({
  view,
  regions,
  getOpacity,
  getColor,
  onClickGroup,
  onHoverGroup,
  width = 168,
}: MuscleBodyDiagramProps) {
  const crop = VIEW_CROP[view]
  const svgRef = useRef<SVGSVGElement>(null)
  // เก็บ ImageData ของ mask แต่ละกลุ่มไว้ใช้ตรวจจับตำแหน่ง — เป็น ref (ไม่ใช่ state) เพราะใช้แค่ตอน
  // ประมวลผล event ไม่ต้อง re-render ตอนโหลดเสร็จ
  const maskDataRef = useRef<Partial<Record<MuscleGroup, ImageData>>>({})

  useEffect(() => {
    let cancelled = false
    regions.forEach((group) => {
      const slug = MUSCLE_GROUP_DIAGRAM_SLUG[group]
      if (!slug) return
      loadMaskImageData(`/images/muscle-diagram/${view}-mask-${slug}.png`).then((data) => {
        if (!cancelled && data) maskDataRef.current[group] = data
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, regions.join(',')])

  // แปลงพิกัดหน้าจอ (clientX/Y) -> พิกัดภาพจริง (0-500, 0-667) ผ่าน viewBox ปัจจุบัน แล้วหากลุ่มกล้ามเนื้อ
  // ที่ mask ของมัน "สว่าง" (เปิด) อยู่ที่จุดนั้นจริง — คืน null ถ้าไม่ตรงกลุ่มไหนเลย (พื้นที่นอกตัวคน)
  function findGroupAtPoint(clientX: number, clientY: number): MuscleGroup | null {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const px = Math.round(crop.x + ((clientX - rect.left) / rect.width) * crop.width)
    const py = Math.round(((clientY - rect.top) / rect.height) * IMG_H)
    for (const group of regions) {
      const data = maskDataRef.current[group]
      if (!data || px < 0 || px >= data.width || py < 0 || py >= data.height) continue
      const idx = (py * data.width + px) * 4
      // mask เป็นภาพขาว-ดำ (luminance mask ของ SVG <mask> ดีฟอลต์) — ขาว = แสดง/อยู่ในกลุ่มนี้จริง
      if (data.data[idx] > 128) return group
    }
    return null
  }

  const interactive = !!(onClickGroup || onHoverGroup)

  return (
    <div
      className="relative rounded-lg overflow-hidden select-none w-full"
      style={{ maxWidth: width, aspectRatio: `${crop.width} / ${IMG_H}` }}
      role="img"
      aria-label={`ไดอะแกรมกล้ามเนื้อ ${view === 'front' ? 'ด้านหน้า' : 'ด้านหลัง'}`}
    >
      <svg
        ref={svgRef}
        viewBox={`${crop.x} 0 ${crop.width} ${IMG_H}`}
        className="block w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ cursor: onClickGroup ? 'pointer' : undefined }}
        onClick={
          interactive
            ? (e) => {
                const group = findGroupAtPoint(e.clientX, e.clientY)
                if (group) onClickGroup?.(group)
              }
            : undefined
        }
        onMouseMove={
          onHoverGroup
            ? (e) => {
                onHoverGroup(findGroupAtPoint(e.clientX, e.clientY))
              }
            : undefined
        }
        onMouseLeave={onHoverGroup ? () => onHoverGroup(null) : undefined}
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
              // pointer-events อยู่ที่ <svg> ระดับบนสุดแล้ว (ดู onClick/onMouseMove ด้านบน + comment
              // "บั๊ก" หัวไฟล์) — rect พวกนี้ทำหน้าที่วาดสีอย่างเดียว ไม่รับ event ตรงๆ อีกต่อไป
              style={{ transition: 'opacity 300ms' }}
            />
          )
        })}
      </svg>
    </div>
  )
}
