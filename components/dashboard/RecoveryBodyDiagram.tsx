'use client'

import { ANTERIOR_BODY_DATA, POSTERIOR_BODY_DATA, BODY_MUSCLE_TO_GROUP } from '@/lib/bodyDiagramData'
import { recoveryStatusColor } from '@/lib/dashboardStats'
import type { MuscleGroup } from '@/lib/muscle-groups'

interface RecoveryBodyDiagramProps {
  recoveryPctMap: Partial<Record<MuscleGroup, number>>
  hoveredGroup: MuscleGroup | null
  onHoverGroup: (mg: MuscleGroup | null) => void
}

// v48: ฟีดแบ็ก "Heatmap ตอนนี้ List กับ Body คนละส่วน อยากให้ Hover ที่ตัวคน แล้ว Bar ฝั่งลิสต์เรืองแสง
// ตามกัน" — วาด SVG เองจากพิกัดที่ก็อปมาจาก react-body-highlighter (lib/bodyDiagramData.ts มีเหตุผล
// เต็มว่าทำไมไม่ใช้ <Model> ของแพ็กเกจตรงๆ — สรุปสั้นๆ: <Model> มีแค่ onClick ไม่มี onHover ในพับลิก
// API และสีต่อชิ้นเลือกได้แค่ bucket ตาม "ความถี่" ไม่ใช่เปอร์เซ็นต์ต่อเนื่องแบบที่ต้องการที่นี่)
//
// v48c: ฟีดแบ็ก "ปุ่มสลับหน้า/หลังดูซ้ำซ้อนและเกินจำเป็น" — เดิมมี tab กดเองมุมขวาบน ตัดออกทั้งหมด
// ให้ view เป็นค่าคำนวณอัตโนมัติแทน ("หลัง" เป็นกลุ่มเดียวใน RECOVERY_MUSCLES ที่ไม่มีชิ้นไหนอยู่ใน
// โมเดลด้านหน้าเลย ส่วนอีก 6 กลุ่มที่เหลือมีอยู่ในโมเดลด้านหน้าครบ) — ดีฟอลต์เป็นหน้าเสมอ สลับไปหลัง
// เองก็ต่อเมื่อ hover ตรงกับกลุ่ม "หลัง" พอดี (ไม่ว่าจะ hover จากตัวคนเองหรือจาก bar ฝั่งลิสต์) แล้วสลับ
// กลับหน้าเองทันทีที่เลิก hover — ผู้ใช้ไม่ต้องกดอะไรเพิ่ม ยังเห็นครบทั้ง 7 กลุ่มเหมือนเดิมทุกกลุ่ม
export default function RecoveryBodyDiagram({ recoveryPctMap, hoveredGroup, onHoverGroup }: RecoveryBodyDiagramProps) {
  const data = hoveredGroup === 'หลัง' ? POSTERIOR_BODY_DATA : ANTERIOR_BODY_DATA

  return (
    <div className="relative shrink-0">
      <svg width={92} height={184} viewBox="0 0 100 200" aria-hidden="true">
        {data.map((region) =>
          region.svgPoints.map((points, i) => {
            const mg = BODY_MUSCLE_TO_GROUP[region.muscle]
            const pct = mg ? recoveryPctMap[mg] : undefined
            const color = pct != null ? recoveryStatusColor(pct) : '#3A3D42'
            const isHovered = mg != null && mg === hoveredGroup
            return (
              <polygon
                key={`${region.muscle}-${i}`}
                points={points}
                style={{
                  fill: color,
                  fillOpacity: mg == null ? 0.5 : isHovered ? 1 : hoveredGroup ? 0.35 : 0.8,
                  cursor: mg ? 'pointer' : 'default',
                  transition: 'fill-opacity 150ms ease',
                  filter: isHovered ? `drop-shadow(0 0 3px ${color})` : undefined,
                }}
                onMouseEnter={() => mg && onHoverGroup(mg)}
                onMouseLeave={() => mg && onHoverGroup(null)}
              />
            )
          })
        )}
      </svg>
    </div>
  )
}
