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
      // active:translate-y-[1px] ผสมกับ active:scale-[0.99] เดิม (Tailwind ประกอบ transform เดียวกัน
      // จาก --tw-translate-y/--tw-scale-x/y ร่วมกัน) ให้การ์ดรู้สึก "กดจมลง" จริงๆ ตอนแตะ ไม่ใช่แค่
      // ย่อขนาดเฉยๆ (Card Press Effect ตามที่ขอ)
      className="flex items-center justify-between gap-3 active:scale-[0.99] active:translate-y-[1px] transition"
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
      {/* v23: ฟีดแบ็ก "Focus Card ยังเรียบไปนิด อยากได้ Titanium Mesh/Diagonal Cut/Orange Accent/Micro
          Reflection ให้เหมือน Dashboard รถยุโรป" — การ์ดนี้ใช้ PremiumCard เป็น wrapper อยู่แล้ว (ได้
          grain/reflection/bevel/ambient shadow มาตรฐานทุกใบครบ) แต่การ์ดนี้มีจุดต่างจากใบอื่นตรงมุมตัด
          (clipPath ด้านบน) ซึ่งยังไม่มีการตกแต่งอะไรเสริมเลย — เพิ่ม 2 อย่างเฉพาะจุดนี้: (1) ลายตาข่าย
          ไทเทเนียม (mesh) ไขว้ 2 ทิศทาง แยกจากลายเฉียงทิศทางเดียวที่การ์ดอื่นมี ให้ใบนี้มีลายเป็นเอกลักษณ์
          ของตัวเอง (2) เส้นสีอำพันบางๆ พาดตามแนวมุมตัดพอดี (คำนวณจากจุดตัดจริง 18,0 -> 0,18 ในclipPath
          ด้านบน) ให้มุมตัดดูเหมือนขอบโลหะเจียรมีเส้นไฮไลต์ ไม่ใช่แค่ถูกตัดเฉยๆ */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: [
            'repeating-linear-gradient(115deg, rgba(255,255,255,.025) 0px, rgba(255,255,255,.025) 1px, transparent 1px, transparent 22px)',
            'repeating-linear-gradient(25deg, rgba(255,255,255,.02) 0px, rgba(255,255,255,.02) 1px, transparent 1px, transparent 22px)',
          ].join(', '),
        }}
        aria-hidden="true"
      />
      <div
        className="absolute pointer-events-none"
        style={{
          width: 26,
          height: 1.5,
          top: 9,
          left: 9,
          transform: 'translate(-50%, -50%) rotate(45deg)',
          background: 'linear-gradient(90deg, transparent, rgba(255,180,90,.55), transparent)',
        }}
        aria-hidden="true"
      />
      {/* v25: ฟีดแบ็ก "ฝั่งซ้าย-ขวาน้ำหนักยังไม่เท่ากัน ไอคอน Titanium สวยแล้วแต่ฝั่งขวาโล่ง อยากได้
          Diagonal Reflection แบบ BMW Dashboard ผ่านด้านขวา จางๆ" — ไอคอนวงกลมฝั่งซ้ายมีผิว/glow ของตัวเอง
          หนาแน่นอยู่แล้ว ฝั่งขวามีแค่ตัวหนังสือ+ลูกศรบางๆ ลอยอยู่ ไม่มีอะไรถ่วงน้ำหนักภาพ — แถบสะท้อนแสง
          เฉียงกว้าง (115deg องศาเดียวกับลายเฉียงทั่วแอป) stop ทั้งหมดอยู่ฝั่งขวาของการ์ด (55-80%) ให้มีน้ำหนัก
          เฉพาะฝั่งขวาจริงๆ ไม่ใช่พาดเต็มการ์ดแบบสมมาตร */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(115deg, transparent 55%, rgba(255,255,255,.045) 68%, transparent 82%)' }}
        aria-hidden="true"
      />
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
