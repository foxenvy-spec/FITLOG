'use client'

import { useState } from 'react'
import { WEEKDAY_LABELS } from '@/app/(app)/dashboard/DashboardView'
import { COLORS, NEUTRAL, TEXT, withAlpha } from '@/lib/theme'
import PremiumCard from './ui/PremiumCard'
import WorkoutStreakDetailSheet from './dashboard/WorkoutStreakDetailSheet'

interface WorkoutStreakCardProps {
  streak: number
  bestStreak: number
  weekDayTicks: { iso: string; trained: boolean; isFuture: boolean; inStreak: boolean }[]
  today: string
}

// การ์ด "Workout Streak" แบบย่อ (เดิมสูง ~180px ลดเหลือ ~90-100px ตามที่ขอ) — รวมทุกอย่างลง
// แถวเดียว: ไอคอนไฟ+จำนวนวัน ซ้าย, จุดวงกลม 7 วันเล็กๆ (ไม่มีตัวย่อวันกำกับใต้จุดแล้ว — ข้อมูล
// วันยังอยู่ครบใน aria-label ให้ screen reader อ่านได้ปกติ) ขวา ตัดคำบรรยายใต้หัวข้อออกไปเลย
// v4: ฟีดแบ็ก "แยก Current กับ Best Streak — เช่นใน Detail" — การ์ดนี้แตะได้แล้วเปิด
// WorkoutStreakDetailSheet โชว์ Current เทียบ Best (ไม่เพิ่ม Best ขึ้นการ์ดหลักตามที่ขอ)
export default function WorkoutStreakCard({ streak, bestStreak, weekDayTicks, today }: WorkoutStreakCardProps) {
  const [open, setOpen] = useState(false)
  // ฟีดแบ็ก "WEEKLY ACTIVITY — 2 วัน ให้ตรงกับวันที่แสดง" — ตัวเลขบรรทัดนี้เดิมใช้ `streak` (สายโซ่ต่อเนื่อง
  // จาก computeCurrentStreakDates) ซึ่งนับคนละแบบกับจุดวงกลม 7 วันด้านขวา (ตั้งแต่ v62 จุดสีเขียว = "ฝึกแล้ว
  // วันนั้นๆ" ล้วนๆ ไม่สนว่าสายโซ่ขาดหรือไม่ — ดู comment v62 ด้านล่าง) ทำให้ 2 ค่าอาจไม่ตรงกัน (เช่น ฝึก
  // จ./พ./พฤ./ศ. ขาดอังคาร -> จุดเขียวติด 4 จุด แต่ตัวเลขสายโซ่เหลือแค่ 1) — ป้ายหัวข้อเปลี่ยนเป็น "Weekly
  // Activity" ไปแล้วตั้งแต่รอบก่อน แต่ตัวเลขยังไม่ได้ตามไปด้วย จุดนี้แก้ให้ตัวเลขนับจาก weekDayTicks ชุด
  // เดียวกับที่ render จุดจริงๆ (จำนวนวันที่ trained ในแถวที่เห็น) รับประกันว่าตรงกันเป๊ะเสมอ — แนวคิด
  // "สายโซ่ต่อเนื่อง" (streak/bestStreak เดิม) ยังไม่ทิ้ง ยังส่งเข้า Detail Sheet ที่เปิดจากการแตะการ์ดนี้
  // ต่อไป ซึ่งมีป้าย "Current Streak"/"Best Streak" ระบุความหมายชัดเจนแยกจากหน้าการ์ดหลักอยู่แล้ว
  const weeklyTrainedCount = weekDayTicks.filter((t) => t.trained).length
  return (
    <>
    <PremiumCard as="button" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="animate-rise px-4 py-2.5 w-full text-left">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 shrink-0">
          {/* v60: ฟีดแบ็ก "Hierarchy ช่วงล่างควรเป็น AI Coach > Workout > Body > Streak > Health > Quick
              Actions ตอนนี้ใกล้เคียงกันหมด — ลด visual emphasis ของ Streak ลงเล็กน้อย" — ลด alpha พื้นหลัง
              ไอคอนไฟจาก 22 (13%) เหลือ 18 (~9%) จุดเดียว (ไม่แตะสีตัวเลข streak — ยังเป็นอำพันเต็มตามกฎ
              "Orange = Progress" เดิม, ไม่แตะจุดวงกลม/contrast ที่เพิ่งแก้ readability ไปรอบก่อน)
              v71: ฟีดแบ็ก "Weekly Activity ยังไม่ควรเด่นเท่า AI Coach — ลด visual weight ลงอีก ~20-30%" —
              ลดต่อจาก v60: การ์ดพี่ padding แนวตั้ง 12px -> 10px (-17%), ไอคอนไฟ 32px -> 28px (-12.5%) +
              alpha พื้นหลัง 18 (~9%) -> 12 (~7%) — ไม่แตะวงกลม 7 วันด้านขวา/ตัวเลข streak สีอำพัน (ทั้งคู่
              เพิ่งผ่านการปรับ readability มาหลายรอบแล้วในไฟล์นี้ v56/v62/v63 การลดต่อจะย้อนกลับปัญหาที่แก้ไปแล้ว) */}
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs"
            style={{ backgroundColor: withAlpha(COLORS.amber, '12') }}
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
                จากจุดวงกลมทางขวาต่างหาก) — ไม่แตะความยาวบรรทัดตัวเลข กันการ์ดล้นในเบอร์ streak สองหลัก
                v63: ฟีดแบ็ก "ตอนนี้จุดสีเขียวหลายจุด แต่ป้ายเขียน 'Current Streak 1 วัน' — อาจตีความว่า
                streak ควรมากกว่า 1" — ตั้งแต่ v62 จุดสีเขียวหมายถึง 'ฝึกแล้ว' ทุกวัน ไม่ใช่เฉพาะวันใน streak
                ปัจจุบันอีกต่อไป (ดู comment v62 ด้านล่าง) ป้าย "Current Streak" เดิมเลยอ่านเหมือนกำลังอธิบาย
                แถวจุดทั้งหมด ทั้งที่จริงๆ แถวจุด = ประวัติสัปดาห์นี้, ตัวเลข = สายโซ่ต่อเนื่องเท่านั้น (คนละ
                ขอบเขต) — เปลี่ยนป้ายเป็น "Weekly Activity" ให้ตรงกับสิ่งที่แถวจุดแสดงจริง (ยาวใกล้เคียงป้าย
                เดิมพอดี "Current Streak"=14 ตัวอักษร vs "Weekly Activity"=15 — ไม่กระทบความกว้างคอลัมน์ซ้าย)
                — บรรทัดตัวเลข "{streak} วัน" ไม่แตะ/ไม่ยืดยาวขึ้น (เคยลองต่อท้ายเป็น "N Day Streak" แต่คำนวณ
                แล้วยาวเกินจนกินพื้นที่ที่ตั้งใจเผื่อให้แถวจุด 7 วันด้านขวา — ขัดกับเป้าหมายหลักของรอบนี้คือ
                ลดความแน่นของแถวจุด ไม่ใช่เพิ่มความกว้างฝั่งซ้ายไปแย่งพื้นที่คืน) — 🔥 + สีอำพันของตัวเลขบรรทัด
                นี้สื่อความหมาย "streak" อยู่แล้วโดยไม่ต้องเขียนคำว่า streak ซ้ำ */}
            <p className="text-[12px] tracked uppercase leading-none" style={{ color: TEXT.body }}>Weekly Activity</p>
            <p className="font-mono text-amber leading-none mt-1" style={{ fontSize: 13 }}>{weeklyTrainedCount} วัน</p>
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
            (contrast ~6:1) อ่านง่ายขึ้นชัดเจนโดยไม่แตะโทนสีธีมหลัก (ยังเป็นเทากลาง ไม่ใช่สีใหม่)
            v63: ฟีดแบ็ก "แน่นเกินไปบนจอมือถือ โดยเฉพาะ 'พฤ'/'อา' (ป้ายวัน 2 ตัวอักษร) มีโอกาสชนขอบ — แนะนำ
            ลดเหลือ 5 วัน หรือถ้าจะคง 7 วันจริงๆ ให้ลดวงเล็กน้อย+เพิ่ม spacing" — เลือกทางที่สอง (คง 7 วันไว้
            ไม่ตัดข้อมูลออกจากมือถือ ตรงข้ามกับที่เคยเน้นย้ำหลายรอบว่าอยากให้ Home อ่านครบไม่ต้องกดดูที่อื่น)
            ไม่ลดขนาดวงกลม (22px เพิ่งขยับมาเพื่อ readability เมื่อ 2 รอบก่อน ลดกลับจะย้อนกลับปัญหาเดิม) —
            เพิ่ม gap แถวจาก 2px (gap-0.5) เป็น 4px (gap-1) แทน ให้แต่ละคอลัมน์มีที่หายใจมากขึ้นโดยไม่ต้อง
            แลกกับอะไร (เช็คพื้นที่การ์ดเหลือพอ เพราะบรรทัดตัวเลข streak ฝั่งซ้ายไม่ได้ยืดยาวขึ้นในรอบนี้ ดู
            comment ด้านบน) */}
        <div className="flex items-end gap-1">
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
                {/* v62: ฟีดแบ็ก "แนะนำ scheme ใหม่: วันนี้=วงส้ม, วันที่ทำสำเร็จ=เขียวทั้งหมด (ไม่ต้อง
                    แยกอยู่ใน/นอก streak)" — v58 (รอบก่อน) เคยแก้ "1 วัน ดูขัดกับ ✓ หลายจุด" ด้วยการแยกสี 2
                    เฉด (อำพัน=อยู่ใน streak ปัจจุบัน / moss=ฝึกแล้วแต่ streak ขาด) แต่ 2 เฉดใกล้กันในวงกลม
                    22px จอมือถือจริงแยกยาก — เปลี่ยนมาใช้ scheme ง่ายกว่าตามคำแนะนำที่เลือก: ฝึกแล้ว = เขียว
                    (moss) ทึบ+✓ สม่ำเสมอทุกวัน (ไม่แยกอีกต่อไป) ตรงกับ pattern เดียวกับที่ desktop's Weekly
                    Goal ใช้อยู่แล้ว (DashboardView.tsx) — อำพันเหลือแค่ 2 จุดที่ "active" จริงๆ: ตัวเลข streak
                    บนสุด กับวงวันนี้ตรงนี้ ตรงกับกฎ "Orange = Action/Progress เท่านั้น" ยิ่งกว่า scheme เดิม
                    (เดิมใช้อำพันกับวันในอดีตที่ไม่ใช่ progress ที่กำลังเกิดขึ้นแล้วด้วย) — tick.inStreak ยังคง
                    คำนวณอยู่ (DashboardView.tsx) แต่ตอนนี้ใช้แค่ใน aria-label ให้ screen reader ยังแยกได้ว่า
                    วันไหนอยู่ใน streak ปัจจุบันจริง ไม่ได้ทิ้งข้อมูลนี้ไปเฉยๆ แค่ไม่ใช้ทำสีอีกต่อไป */}
                <span
                  className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[12px] shrink-0"
                  role="img"
                  aria-label={`${WEEKDAY_LABELS[i]}${isToday ? ' (วันนี้)' : ''}: ${
                    tick.trained
                      ? tick.inStreak
                        ? 'ฝึกแล้ว (อยู่ใน Streak ปัจจุบัน)'
                        : 'ฝึกแล้ว (ก่อนหน้า Streak ปัจจุบันขาด)'
                      : tick.isFuture
                        ? 'ยังไม่ถึงวัน'
                        : 'ยังไม่ได้ฝึก'
                  }`}
                  style={
                    tick.trained
                      ? { backgroundColor: COLORS.moss, color: NEUTRAL.onAmberText }
                      : isToday
                        ? { backgroundColor: 'transparent', color: COLORS.amber, border: `1.5px solid ${COLORS.amber}` }
                        : { backgroundColor: NEUTRAL.chipInactive, color: NEUTRAL.mutedIcon }
                  }
                >
                  {/* v57: ฟีดแบ็ก "Today เป็นวงแหวนส้มเฉยๆ ดูคล้าย 'กำลังทำอยู่' มากกว่า 'วันนี้' — อย่าใช้
                      ✓ เพราะยังไม่ complete แนะนำวงแหวนส้ม + จุดเล็กตรงกลาง" — วงกลวงเปล่า (ring ไม่มีอะไร
                      ข้างใน) อ่านกำกวมได้ว่าเป็น spinner/loading state เพิ่มจุดกลมเล็กสีอำพันตรงกลางให้อ่าน
                      เป็น "จุดหมายวันนี้บนปฏิทิน" ชัดเจนแทน — เฉพาะกรณีวันนี้ + ยังไม่ฝึก เท่านั้น (ฝึกแล้ว
                      ยังโชว์ ✓ ตามเดิม เพราะกรณีนั้น "สำเร็จแล้วจริง" ไม่ใช่ "กำลังจะถึง") */}
                  {tick.trained ? (
                    '✓'
                  ) : isToday ? (
                    <span
                      aria-hidden="true"
                      style={{ width: 4, height: 4, borderRadius: 9999, backgroundColor: COLORS.amber }}
                    />
                  ) : isPastMissed ? (
                    '–'
                  ) : (
                    ''
                  )}
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
