'use client'

import { useState } from 'react'
import { WEEKDAY_LABELS } from '@/app/(app)/dashboard/DashboardView'
import { COLORS, NEUTRAL, TEXT, withAlpha } from '@/lib/theme'
import WorkoutStreakDetailSheet from './dashboard/WorkoutStreakDetailSheet'

interface WorkoutStreakCardProps {
  streak: number
  bestStreak: number
  weekDayTicks: { iso: string; trained: boolean; isFuture: boolean; inStreak: boolean }[]
  today: string
}

// ฟีดแบ็ก "emoji หน้านี้ใช้ที่เรามีอยู่แล้วได้ไหม ลองแมฟดู" — เดิมใช้อีโมจิ 🔥 ดิบๆ (มีสีของตัวเองติดมา
// ชนกับพื้นวงกลมสีอำพันตั้งใจ เหมือนปัญหาเดียวกับไอคอนอื่นในหน้านี้ที่แก้ไปแล้ว) เปลี่ยนเป็น SVG เส้นล้วน
// (stroke=currentColor) — path เดียวกับ FlameIcon ที่มีอยู่แล้วใน app/(app)/session/page.tsx (ไฟล์นั้น
// component ท้องถิ่น ไม่ได้ export ให้ import ข้ามไฟล์ได้ เลย define ซ้ำที่นี่ด้วย path เดิมเป๊ะ ให้หน้าตา
// ไอคอนไฟตรงกันทั้งแอป แทนที่จะออกแบบทรงใหม่)
function FlameIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2c1 3-2 4-2 7a4 4 0 008 0c0-1-.5-2-1-3 1 0 3 2 3 6a6 6 0 11-12 0c0-4 2-7 4-10z" />
    </svg>
  )
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
    {/* ฟีดแบ็ก "ของจริงไม่สวยเหมือน Version 5 เลย — ปรับสี กรอบ พื้นหลังใหม่ให้เหมือน 100%" — เปลี่ยนจาก
        PremiumCard (พื้นผิว Dark Titanium หลายเลเยอร์) เป็นการ์ดเรียบแบนตรงกับ mockup (component นี้ใช้
        เฉพาะ Mobile Dashboard เท่านั้น ไม่กระทบจุดอื่น) ตรรกะจุด/สายโซ่ด้านในไม่แตะเลย
        v2: "Mobile_app_design_brief_1.zip" (6a, บรรทัด 114-131) — สเปกละเอียดแยกเป็น 2 แถวชัดเจน (แถวหัวข้อ
        +chevron / แถวจุด 7 วัน+ตัวเลขรวม) แทนแถวเดียวที่เคยแน่นจนวง 7 วันเกือบล้นการ์ด (ดู comment เดิม
        เรื่อง overflow ด้านล่าง) — การแยก 2 แถวนี้แก้ปัญหานั้นไปในตัวเลย: แถวจุดไม่ต้องแย่งพื้นที่แนวนอนกับ
        ไอคอน/ป้ายข้อความอีกต่อไป ทำให้กลับไปใช้วงกลมขนาด 26px (ตามสเปก, ใหญ่กว่า 18px ที่เคยลดไว้ตอนแก้ล้น)
        ได้สบายๆ พร้อม gap 7px ตามสเปกเป๊ะ — คงป้าย "Weekly Activity" (ไม่ใช่ "Training This Week" ของ
        brief) เพราะเป็นชื่อที่ผ่านการปรับหลายรอบมาก่อนแล้วให้ตรงกับสิ่งที่แถวจุดสื่อจริง (ดู comment
        ประวัติ v63 เดิม) — เปลี่ยนแค่โครงสร้าง/ขนาด ไม่เปลี่ยนคำ */}
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      className="animate-rise w-full text-left"
      style={{ borderRadius: 16, padding: '14px 16px', background: '#16191D', boxShadow: '0 0 0 1px rgba(255,255,255,.05)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: withAlpha(COLORS.amber, '12'), color: COLORS.amber }}
            aria-hidden="true"
          >
            <FlameIcon />
          </span>
          <p className="text-[12px] tracked uppercase leading-none" style={{ color: TEXT.body }}>Weekly Activity</p>
        </div>
        <span className="text-muted shrink-0" aria-hidden="true">›</span>
      </div>

      {/* แถว 2: จุด 7 วัน (ซ้าย) + ตัวเลขรวมสัปดาห์ (ขวา) — แยกออกมาจากแถวหัวข้อด้านบนแล้ว ไม่ต้องแย่ง
          พื้นที่แนวนอนกับไอคอน/ป้ายข้อความอีกต่อไป (ดู comment ด้านบน) */}
      <div className="flex items-center justify-between gap-3" style={{ marginTop: 12 }}>
        <div className="flex items-end gap-[7px]">
          {weekDayTicks.map((tick, i) => {
            const isToday = tick.iso === today
            // อดีตที่พลาด (ไม่ใช่วันนี้/อนาคต/ฝึกแล้ว) โชว์ขีดเล็กๆ แยกจาก "อนาคต" (ว่างเปล่า) ตามที่ขอ
            // "Past missed ... อาจแยกด้วยจุด/เส้นเล็กๆ ก็ได้" — ทั้งคู่ยังเป็นพื้นเทาเข้มเดียวกัน (ไม่ต้อง
            // เปลี่ยนสี) แค่ต่างที่มีขีดหรือไม่มี
            const isPastMissed = !tick.trained && !isToday && !tick.isFuture
            return (
              <div key={tick.iso} className="flex flex-col items-center gap-1 shrink-0">
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
                    จอมือถือจริงแยกยาก — เปลี่ยนมาใช้ scheme ง่ายกว่าตามคำแนะนำที่เลือก: ฝึกแล้ว = เขียว
                    (moss) ทึบ+✓ สม่ำเสมอทุกวัน (ไม่แยกอีกต่อไป) ตรงกับ pattern เดียวกับที่ desktop's Weekly
                    Goal ใช้อยู่แล้ว (DashboardView.tsx) — อำพันเหลือแค่ 2 จุดที่ "active" จริงๆ: ตัวเลขรวม
                    ด้านขวา กับวงวันนี้ตรงนี้ ตรงกับกฎ "Orange = Action/Progress เท่านั้น" — tick.inStreak
                    ยังคงคำนวณอยู่ (DashboardView.tsx) แต่ตอนนี้ใช้แค่ใน aria-label ให้ screen reader ยังแยก
                    ได้ว่าวันไหนอยู่ใน streak ปัจจุบันจริง ไม่ได้ทิ้งข้อมูลนี้ไปเฉยๆ แค่ไม่ใช้ทำสีอีกต่อไป */}
                <span
                  className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[12px] shrink-0"
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
                      style={{ width: 5, height: 5, borderRadius: 9999, backgroundColor: COLORS.amber }}
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
        <p className="font-display font-bold leading-none shrink-0" style={{ fontSize: 18, marginLeft: 8 }}>
          <span style={{ color: COLORS.amber }}>{weeklyTrainedCount}</span>
          <span className="text-muted" style={{ fontSize: 12 }}>/7</span>
        </p>
      </div>
    </button>
    <WorkoutStreakDetailSheet open={open} onClose={() => setOpen(false)} streak={streak} bestStreak={bestStreak} />
    </>
  )
}
