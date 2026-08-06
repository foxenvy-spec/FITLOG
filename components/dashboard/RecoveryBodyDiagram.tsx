'use client'

import { useState } from 'react'
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
// สลับหน้า/หลังได้ (tab เล็กมุมขวาบน) เพราะกล้ามเนื้อบางกลุ่มไม่มีในโมเดลด้านหน้าเลย (เช่น "หลัง" ทั้งกลุ่ม
// อยู่ในโมเดลด้านหลังเท่านั้น) — ไม่มีทางแสดงครบ 7 กลุ่มพร้อมกันในมุมมองเดียว
export default function RecoveryBodyDiagram({ recoveryPctMap, hoveredGroup, onHoverGroup }: RecoveryBodyDiagramProps) {
  const [view, setView] = useState<'front' | 'back'>('front')
  const data = view === 'front' ? ANTERIOR_BODY_DATA : POSTERIOR_BODY_DATA

  return (
    <div className="relative shrink-0">
      {/* การ์ดนี้ทั้งใบอยู่ใน <Link href="/recovery"> (ดู DashboardView.tsx) — ปุ่มสลับหน้า/หลังนี้ใช้
          <span role="button"> แทน <button> จริง เพราะ <button> ซ้อนอยู่ใน <a> เป็น HTML ที่ผิดสเปก
          (interactive content ซ้อน interactive content) ต่างจาก <polygon> ด้านล่างซึ่งไม่ได้อยู่ใน
          รายการ "interactive content" ต้องห้ามของสเปก จึงไม่มีปัญหาแบบเดียวกัน — stopPropagation กัน
          ไม่ให้คลิกเปลี่ยนมุมมองไปเด้ง navigate ไปหน้า /recovery ตามไปด้วย */}
      <div className="absolute -top-1 right-0 flex rounded-full overflow-hidden border border-white/10 z-10">
        {(['front', 'back'] as const).map((v) => (
          <span
            key={v}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setView(v)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                setView(v)
              }
            }}
            className="text-[8px] font-display tracked uppercase px-1.5 py-0.5 transition cursor-pointer select-none"
            style={{
              backgroundColor: view === v ? 'rgba(34,211,238,.25)' : 'transparent',
              color: view === v ? '#22D3EE' : 'rgba(255,255,255,.4)',
            }}
          >
            {v === 'front' ? 'หน้า' : 'หลัง'}
          </span>
        ))}
      </div>
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
