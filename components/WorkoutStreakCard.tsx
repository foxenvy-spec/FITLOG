'use client'

import { useState } from 'react'
import { WEEKDAY_LABELS } from '@/app/(app)/dashboard/DashboardView'
import { COLORS, NEUTRAL, TEXT, withAlpha } from '@/lib/theme'
import PremiumCard from './ui/PremiumCard'
import WorkoutStreakDetailSheet from './dashboard/WorkoutStreakDetailSheet'

interface WorkoutStreakCardProps {
  streak: number
  bestStreak: number
  weekDayTicks: { iso: string; trained: boolean; isFuture: boolean }[]
  today: string
}

// การ์ด "Workout Streak" แบบย่อ (เดิมสูง ~180px ลดเหลือ ~90-100px ตามที่ขอ) — รวมทุกอย่างลง
// แถวเดียว: ไอคอนไฟ+จำนวนวัน ซ้าย, จุดวงกลม 7 วันเล็กๆ (ไม่มีตัวย่อวันกำกับใต้จุดแล้ว — ข้อมูล
// วันยังอยู่ครบใน aria-label ให้ screen reader อ่านได้ปกติ) ขวา ตัดคำบรรยายใต้หัวข้อออกไปเลย
// v4: ฟีดแบ็ก "แยก Current กับ Best Streak — เช่นใน Detail" — การ์ดนี้แตะได้แล้วเปิด
// WorkoutStreakDetailSheet โชว์ Current เทียบ Best (ไม่เพิ่ม Best ขึ้นการ์ดหลักตามที่ขอ)
export default function WorkoutStreakCard({ streak, bestStreak, weekDayTicks, today }: WorkoutStreakCardProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
    <PremiumCard as="button" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="animate-rise px-4 py-3 w-full text-left">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 shrink-0">
          <span
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm"
            style={{ backgroundColor: withAlpha(COLORS.amber, '22') }}
            aria-hidden="true"
          >
            🔥
          </span>
          <div>
            {/* v30: ฟีดแบ็ก "Typography Hierarchy — Workout Streak ควรเป็น Level 2 เหมือน Today's
                Workout/Recovery" — text-muted (#9498A0) เดิมเท่ากับ caption ทั่วไป เปลี่ยนเป็น TEXT.body
                (#BDBDBD) ให้อ่านเป็นชื่อการ์ดจริงๆ ไม่ใช่แค่รายละเอียดจาง — ตัวเลขวัน (streak) ยังเป็นสีส้ม
                ไว้เหมือนเดิม เพราะเป็น "Progress" ตามกฎ Orange = Action/Energy/Progress ที่ตั้งไว้ */}
            {/* v3: ฟีดแบ็ก "'0 วัน' แต่ทางขวามีวงกลม workout หลายวัน — ดูเหมือนขัดแย้งกัน" — computeCurrentStreak
                (lib/dashboardStats.ts) ถูกต้องอยู่แล้ว (0 = สายโซ่ต่อเนื่องถึงวันนี้/เมื่อวานขาดจริง แม้จะมี
                ประวัติฝึกในสัปดาห์) นี่เป็นปัญหาคำ ไม่ใช่บั๊กคำนวณ — เปลี่ยนป้ายจาก "Workout Streak" เป็น
                "Current Streak" ให้ชัดว่านับเฉพาะสายโซ่ปัจจุบัน ไม่ใช่จำนวนวันที่ฝึกทั้งหมดในสัปดาห์ (ดูได้
                จากจุดวงกลมทางขวาต่างหาก) — ไม่แตะความยาวบรรทัดตัวเลข กันการ์ดล้นในเบอร์ streak สองหลัก */}
            <p className="text-[9px] tracked uppercase leading-none" style={{ color: TEXT.body }}>Current Streak</p>
            <p className="font-mono text-amber leading-none mt-1" style={{ fontSize: 13 }}>{streak} วัน</p>
          </div>
        </div>

        {/* v31: ฟีดแบ็ก "อยากให้ Progression ดูเป็น Calendar มากกว่า (M T W T F S S เหนือจุด)" — เดิมมีแค่
            แถวจุดกลม ไม่มีตัวอักษรวันกำกับที่มองเห็น (ตัดออกไปตั้งแต่รอบก่อนเพื่อลดความสูง ดู comment เดิม
            ด้านบนไฟล์ "ไม่มีตัวย่อวันกำกับใต้จุดแล้ว") ตอนนี้ขอกลับมาแสดง (WEEKDAY_LABELS ตัวเดียวกับที่ใช้
            ทำ aria-label อยู่แล้ว ไม่ต้องเพิ่มข้อมูลใหม่) ให้อ่านเป็นปฏิทินสัปดาห์จริงๆ แทนเส้นจุดเฉยๆ */}
        {/* v56: ฟีดแบ็ก "P2 — วงกลมยังค่อนข้างเล็ก ตัวอักษรวันนี้เกือบกลืนกับ background" (ยืนยัน
            "ไม่ต้องเพิ่มขนาด Card") — ขยายวงจาก 20px (w-5 h-5) เป็น 22px เฉพาะเส้นผ่านศูนย์กลาง (ไม่ใช่
            padding/ความสูงการ์ด) ลด gap แถว 4px->2px ชดเชยความกว้างที่เพิ่มขึ้น ให้แถว 7 วงยังพอดีความกว้าง
            เดิมของการ์ด ไม่ล้น — ตัวอักษรวันสีเดิม #A8ACB4 (contrast ~2.7:1 บนพื้นเข้ม) ขยับเป็น #D2D5DC
            (contrast ~6:1) อ่านง่ายขึ้นชัดเจนโดยไม่แตะโทนสีธีมหลัก (ยังเป็นเทากลาง ไม่ใช่สีใหม่) */}
        <div className="flex items-end gap-0.5">
          {weekDayTicks.map((tick, i) => {
            const isToday = tick.iso === today
            // อดีตที่พลาด (ไม่ใช่วันนี้/อนาคต/ฝึกแล้ว) โชว์ขีดเล็กๆ แยกจาก "อนาคต" (ว่างเปล่า) ตามที่ขอ
            // "Past missed ... อาจแยกด้วยจุด/เส้นเล็กๆ ก็ได้" — ทั้งคู่ยังเป็นพื้นเทาเข้มเดียวกัน (ไม่ต้อง
            // เปลี่ยนสี) แค่ต่างที่มีขีดหรือไม่มี
            const isPastMissed = !tick.trained && !isToday && !tick.isFuture
            return (
              <div key={tick.iso} className="flex flex-col items-center gap-0.5 shrink-0">
                <span
                  className="text-[8px] leading-none tracked uppercase"
                  style={{ color: isToday ? COLORS.amber : '#D2D5DC' }}
                  aria-hidden="true"
                >
                  {WEEKDAY_LABELS[i]}
                </span>
                <span
                  className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] shrink-0"
                  role="img"
                  aria-label={`${WEEKDAY_LABELS[i]}${isToday ? ' (วันนี้)' : ''}: ${tick.trained ? 'ฝึกแล้ว' : tick.isFuture ? 'ยังไม่ถึงวัน' : 'ยังไม่ได้ฝึก'}`}
                  style={
                    tick.trained
                      ? { backgroundColor: COLORS.amber, color: NEUTRAL.onAmberText }
                      : isToday
                        ? { backgroundColor: 'transparent', color: COLORS.amber, border: `1.5px solid ${COLORS.amber}` }
                        : { backgroundColor: NEUTRAL.chipInactive, color: NEUTRAL.mutedIcon }
                  }
                >
                  {tick.trained ? '✓' : isPastMissed ? '–' : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </PremiumCard>
    <WorkoutStreakDetailSheet open={open} onClose={() => setOpen(false)} streak={streak} bestStreak={bestStreak} />
    </>
  )
}
