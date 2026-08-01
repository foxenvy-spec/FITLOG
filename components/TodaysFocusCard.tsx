'use client'

import Link from 'next/link'
import Image from 'next/image'
import { COLORS, withAlpha, cncCornerClipPath } from '@/lib/theme'
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
        // v27: มุมตัด (CNC_CORNER_CLIP_PATH_DEFAULT) ย้ายไปเป็นดีฟอลต์กลางของ PremiumCard เองแล้ว (ทุก
        // การ์ดตัดมุมเดียวกันหมดตามฟีดแบ็ก "ทุก Card คนจะจำได้เลย") ค่าที่การ์ดนี้เคย hardcode ไว้ตรงกับ
        // ดีฟอลต์ใหม่เป๊ะอยู่แล้ว จึงตัด override ตรงนี้ทิ้งได้เลย ไม่ต้องประกาศซ้ำ
      }}
    >
      {/* v23/v27: ลายตาข่ายไทเทเนียม (mesh) ย้ายไปเป็นดีฟอลต์กลางของ PremiumCard แล้วเช่นกัน (ทุกการ์ด
          ได้ลายเดียวกัน ละเอียดขึ้นกว่าเดิม 22px -> 12px) — เหลือไว้เฉพาะจุดที่ยังเป็นเอกลักษณ์เฉพาะการ์ด
          นี้จริงๆ คือเส้นไฮไลต์สีอำพันพาดตามแนวมุมตัด ด้านล่าง */}
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
      {/* v25/v28: ฟีดแบ็ก "ฝั่งซ้าย-ขวาน้ำหนักยังไม่เท่ากัน" (v25) แล้วรอบนี้ "Focus Card อยากให้เหมือน
          Mission Card ของทหาร" (v28) — เพิ่ม Reflection อีกนิด (.045 -> .06) เป็นส่วนหนึ่งของชุด CNC/
          Titanium Layers/Energy Line ด้านล่าง ให้ผิวการ์ดสว่างสมดุลกับเส้น/ชั้นที่เพิ่มเข้ามาใหม่ */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(115deg, transparent 55%, rgba(255,255,255,.06) 68%, transparent 82%)' }}
        aria-hidden="true"
      />
      {/* v28: "Mission Card" — ฟีดแบ็ก "อยากให้เหมือนอุปกรณ์ทางทหาร มีเส้น CNC มี Titanium Layers มี
          Energy Line มี Reflection" — Reflection เพิ่มไปแล้วด้านบน เหลือ 3 อย่าง: (1) CNC seam — เส้นคู่
          บาง (สว่าง+มืด) แนวตั้งใกล้ขอบขวา จำลองรอยต่อแผงโลหะที่กัด CNC จริง (2) Titanium Layers — กรอบ
          ชั้นในเยื้องจากขอบนอก 5px พร้อมมุมตัดเล็กกว่าของตัวเอง จำลอง "แผงซ้อนแผง" แบบเกราะ/อุปกรณ์ทหาร
          ไม่ใช่การ์ดแผ่นเดียวเรียบๆ (3) Energy Line — เส้นเรืองแสงอำพันบางๆ ขอบล่างสุด หายใจเบาๆ ต่อเนื่อง
          จำลองไฟสถานะ (status strip) ของอุปกรณ์จริง */}
      <div
        className="absolute pointer-events-none"
        style={{ top: 10, bottom: 10, right: 30, width: 1, background: 'rgba(255,255,255,.14)' }}
        aria-hidden="true"
      />
      <div
        className="absolute pointer-events-none"
        style={{ top: 10, bottom: 10, right: 31, width: 1, background: 'rgba(0,0,0,.35)' }}
        aria-hidden="true"
      />
      <div
        className="absolute pointer-events-none"
        style={{
          inset: 5,
          clipPath: cncCornerClipPath('tl', 12, 3),
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.09), inset 0 1px 0 0 rgba(255,255,255,.06)',
        }}
        aria-hidden="true"
      />
      <div
        className="focus-energy-line absolute pointer-events-none"
        style={{
          left: 14,
          right: 14,
          bottom: 4,
          height: 1.5,
          background: 'linear-gradient(90deg, transparent, rgba(255,180,90,.75) 30%, rgba(255,180,90,.75) 70%, transparent)',
        }}
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
      <style jsx>{`
        .focus-energy-line {
          animation: focus-energy-line-breathe 2.8s ease-in-out infinite;
        }
        @keyframes focus-energy-line-breathe {
          0%,
          100% {
            opacity: 0.55;
          }
          50% {
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .focus-energy-line {
            animation: none;
            opacity: 0.8;
          }
        }
      `}</style>
    </PremiumCard>
  )
}
