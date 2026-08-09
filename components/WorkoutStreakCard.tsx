'use client'

import { WEEKDAY_LABELS } from '@/app/(app)/dashboard/DashboardView'
import { COLORS, NEUTRAL, TEXT, withAlpha } from '@/lib/theme'
import PremiumCard from './ui/PremiumCard'

interface WorkoutStreakCardProps {
  streak: number
  weekDayTicks: { iso: string; trained: boolean; isFuture: boolean }[]
  today: string
}

// การ์ด "Workout Streak" แบบย่อ (เดิมสูง ~180px ลดเหลือ ~90-100px ตามที่ขอ) — รวมทุกอย่างลง
// แถวเดียว: ไอคอนไฟ+จำนวนวัน ซ้าย, จุดวงกลม 7 วันเล็กๆ (ไม่มีตัวย่อวันกำกับใต้จุดแล้ว — ข้อมูล
// วันยังอยู่ครบใน aria-label ให้ screen reader อ่านได้ปกติ) ขวา ตัดคำบรรยายใต้หัวข้อออกไปเลย
export default function WorkoutStreakCard({ streak, weekDayTicks, today }: WorkoutStreakCardProps) {
  return (
    <PremiumCard className="animate-rise px-4 py-3">
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
        <div className="flex items-end gap-1">
          {weekDayTicks.map((tick, i) => {
            const isToday = tick.iso === today
            return (
              <div key={tick.iso} className="flex flex-col items-center gap-0.5 shrink-0">
                {/* v1: ฟีดแบ็ก "Typography บางจุดยังบางและเล็ก โดยเฉพาะ Streak day labels — เพิ่ม
                    contrast ก่อน" — #6B6B6E เดิมมืดกว่า caption อื่นในแอปมาก (ใกล้เคียง TEXT.caption
                    ซึ่งตั้งใจให้จางสุดในระบบ) ขยับขึ้นมาระดับเดียวกับ caption ทั่วไปที่ปรับไปแล้วรอบนี้ */}
                <span
                  className="text-[7px] leading-none tracked uppercase"
                  style={{ color: isToday ? COLORS.amber : '#A8ACB4' }}
                  aria-hidden="true"
                >
                  {WEEKDAY_LABELS[i]}
                </span>
                {/* v2: ฟีดแบ็ก "Workout Streak ควรบอก 'วันนี้' ชัดขึ้น — ขอบหนาขึ้น + glow บางๆ" — เดิมมี
                    แค่ boxShadow ring 2px สีอำพัน (ไม่มี glow) ให้ทั้ง 2px ring หนาขึ้นเป็น 2.5px และเพิ่ม
                    glow บางๆ ซ้อนอีกชั้น (blur 4px, alpha ~35%) ไม่ใช้ animation ตามที่ระบุว่าไม่จำเป็น */}
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] shrink-0"
                  role="img"
                  aria-label={`${WEEKDAY_LABELS[i]}${isToday ? ' (วันนี้)' : ''}: ${tick.trained ? 'ฝึกแล้ว' : tick.isFuture ? 'ยังไม่ถึงวัน' : 'ยังไม่ได้ฝึก'}`}
                  style={{
                    ...(tick.trained
                      ? { backgroundColor: COLORS.amber, color: NEUTRAL.onAmberText }
                      : { backgroundColor: NEUTRAL.chipInactive, color: NEUTRAL.mutedIcon }),
                    ...(isToday ? { boxShadow: `0 0 0 2.5px ${COLORS.amber}, 0 0 4px 1px ${withAlpha(COLORS.amber, '59')}` } : {}),
                  }}
                >
                  {tick.trained ? '✓' : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </PremiumCard>
  )
}
