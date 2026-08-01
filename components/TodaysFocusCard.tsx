'use client'

import Link from 'next/link'
import Image from 'next/image'
import { COLORS, withAlpha } from '@/lib/theme'
import { dashboardSpec } from '@/lib/dashboardSpec'
import PremiumCard from './ui/PremiumCard'

interface TodaysFocusCardProps {
  label: string | null
  href: string
}

// ชื่อโปรแกรม (scheduledDay.title) เป็นข้อความอิสระที่ผู้ใช้พิมพ์เอง (เช่น "Day 5 — Lower
// (Hamstring/Glute)") ไม่มีฟิลด์กล้ามเนื้อแยกต่างหากใน ProgramDay (lib/types.ts) ให้ดึงมาแสดงบรรทัด 2
// ตรงๆ — เดิม label ยาวๆ แบบนี้โดน `truncate` (1 บรรทัด + ...) ตัดจนอ่านไม่รู้เรื่อง ("DAY 5 — LOWER
// (HAMSTRING/GLUT...") ถ้าเจอวงเล็บ แยกเป็น 2 บรรทัดแทน: บรรทัดหลัก (ก่อนวงเล็บ) + บรรทัดรายละเอียด
// (ในวงเล็บ, "/" แทนด้วย " • ") — ถ้าไม่มีวงเล็บเลย (label สั้น/ไม่มีรายละเอียดเพิ่ม) แสดงบรรทัดเดียว
// เหมือนเดิมทุกประการ ไม่กระทบ
function splitTitleDetail(text: string): { main: string; detail: string | null } {
  const openIdx = text.indexOf('(')
  if (openIdx === -1) return { main: text, detail: null }
  const closeIdx = text.lastIndexOf(')')
  const main = text.slice(0, openIdx).trim() || text
  const inner = closeIdx > openIdx ? text.slice(openIdx + 1, closeIdx) : text.slice(openIdx + 1)
  const detail = inner.replace(/\//g, ' • ').trim()
  return { main, detail: detail || null }
}

// "Today's Focus" ตามมอคอัพ — ใช้ workoutTitle (โปรแกรมที่ตั้งไว้วันนี้) ถ้ามี ไม่งั้น fallback
// ไปกล้ามเนื้อที่แนะนำวันนี้ (data.muscleRecommendation) ซึ่ง MobileDashboardView เป็นคนเลือกส่งมาให้แล้ว
export default function TodaysFocusCard({ label, href }: TodaysFocusCardProps) {
  const { main, detail } = label ? splitTitleDetail(label) : { main: 'ยังไม่ได้ตั้งโปรแกรม', detail: null }
  return (
    <PremiumCard
      as={Link}
      href={href}
      className="flex items-center justify-between gap-3 active:scale-[0.99] transition"
      style={{
        // padding/ความสูงจาก dashboardSpec.focusCard (16px / 74px) — ลดลงจากรอบก่อน (18px / 88px)
        // ตามที่ขอ "reduce card padding" + ความสูงเป้าหมายใหม่
        padding: dashboardSpec.focusCard.padding,
        minHeight: dashboardSpec.focusCard.height,
        // มุมตัด (cut-corner) ที่ขอบซ้ายบน — ให้ความรู้สึก "แผ่นโลหะ/ตั๋วเข้างาน" แทนมุมโค้งมนเรียบๆ
        // เหมือนการ์ดอื่น ตัดเฉพาะการ์ดนี้ใบเดียว (จุดสนใจของหน้า ไม่ใช่ทุกการ์ดตัดหมด) มุมที่เหลือ
        // (บนขวา/ล่างขวา/ล่างซ้าย) เป็นมุมตัดเล็ก 4px แทนมุมโค้งเดิม (clip-path ทับ border-radius ของ
        // PremiumCard ไปเลย ไม่ต้องแก้ radius ของ component กลาง) ค่าเป็น calc() ทั้งหมดกันพัง ถ้าการ์ด
        // เปลี่ยนความสูง/กว้างทีหลัง
        clipPath:
          'polygon(18px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px), 0 18px)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* กลับไปใหญ่ขึ้น (24px -> 36px) ตามที่ยืนยันทิศทางแล้ว — เดิมย่อลงไปรอบก่อนหน้า —
            ไอคอนเป้าที่ผู้ใช้สร้างเอง แทนอีโมจิ 🎯 เดิม — รูปมีพื้นวงกลมดำของตัวเองติดมาด้วย (ไม่ใช่
            พื้นโปร่งใส) ทำให้ดูเหมือนกรอบดำทับอยู่บนวงพื้นหลังสีอำพัน ใช้ mixBlendMode: screen (เทคนิค
            เดียวกับ glow ทุกจุดใน Header.tsx/HeroEnergyWave.tsx) ให้พื้นดำเกือบสนิทของรูปนี้ "หายไป"
            กลืนกับพื้นหลังมืดของวง เหลือแค่ไอคอนเรืองแสงจริงๆ */}
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
          style={{ backgroundColor: withAlpha(COLORS.amber, '22') }}
          aria-hidden="true"
        >
          <Image
            src="/icons/today-focus.png"
            alt=""
            width={36}
            height={36}
            className="w-full h-full object-cover"
            style={{ mixBlendMode: 'screen' }}
          />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] tracked uppercase text-muted">Today&apos;s Focus</p>
          <p className="font-display tracked uppercase text-amber truncate" style={{ fontSize: 14 }}>
            {main}
          </p>
          {detail && (
            <p className="text-muted truncate" style={{ fontSize: 10, marginTop: 1 }}>
              {detail}
            </p>
          )}
        </div>
      </div>
      <span className="text-muted shrink-0" aria-hidden="true">›</span>
    </PremiumCard>
  )
}
