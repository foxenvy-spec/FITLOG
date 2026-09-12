'use client'

import { dashboardSpec } from '@/lib/dashboardSpec'
import AnimatedBarFill from '../AnimatedBarFill'

interface WeeklyProgressCardProps {
  /** จำนวนวันที่ทำสำเร็จของแผนสัปดาห์นี้ (จาก computePlannedConsistency — นับเทียบกับวันที่ "ตั้งโปรแกรม
   * ไว้จริง" เท่านั้น ไม่ใช่ปฏิทินดิบ 7 วัน) */
  completedCount: number
  /** จำนวนวันที่ตั้งโปรแกรมไว้ทั้งหมดในสัปดาห์นี้ — 0 = ยังไม่เคยตั้งโปรแกรม (fallback ไปนับปฏิทินดิบแทน
   * ที่ผู้เรียกต้องจัดการเอง ก่อนส่ง props มาที่นี่) */
  plannedCount: number
  pct: number | null
  /** สายโซ่ต่อเนื่องปัจจุบัน (วัน) — คนละความหมายกับ completedCount (ดูสายโซ่ vs จำนวนสำเร็จในสัปดาห์) */
  streak: number
}

// การ์ด "ความคืบหน้าสัปดาห์นี้" ใหม่ตาม "New_mobile_app.zip" — แทนที่ WorkoutStreakCard.tsx (มีแถวจุด
// วงกลม 7 วัน) ด้วยเลย์เอาต์เรียบกว่ามาก (เศษส่วน+% ตัวเลขใหญ่+แถบเดียว) ไม่มีปฏิทินรายวันแล้ว — badge
// สตรีคยังอยู่ (🔥 N วันติดต่อกัน) คนละตัวเลขกับเศษส่วนหลัก (ดู comment ที่ props ด้านบน) เหมือนที่การ์ด
// เดิมก็แยก 2 แนวคิดนี้ไว้อยู่แล้ว (streak/bestStreak vs weeklyTrainedCount)
export default function WeeklyProgressCard({ completedCount, plannedCount, pct, streak }: WeeklyProgressCardProps) {
  const { borderRadius, padding, barHeight } = dashboardSpec.weeklyProgressCard
  const displayPct = pct ?? 0
  const total = Math.max(plannedCount, 1)
  // ฟีดแบ็ก "เปลี่ยนจากตัวเลขเป็นพฤติกรรม — เอา % ออก เปลี่ยนเป็น 'N workouts left this week' ตอบคำถาม
  // 'ฉันต้องทำอีกเท่าไร' ทันที" — เฉพาะเมื่อมีแผนตั้งไว้จริง (plannedCount>0) เท่านั้น ไม่งั้นไม่มีความหมาย
  const remaining = plannedCount > 0 ? Math.max(plannedCount - completedCount, 0) : null
  const remainingLabel =
    remaining == null ? null : remaining === 0 ? 'All workouts done this week 🎉' : `${remaining} workout${remaining === 1 ? '' : 's'} left this week`

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #171c25 0%, #12161d 100%)',
        border: '1px solid rgba(255,255,255,.06)',
        borderRadius,
        padding,
        boxShadow: '0 8px 20px rgba(0,0,0,.35)',
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span className="text-white font-bold" style={{ fontSize: 14.5 }}>
          Weekly Progress
        </span>
        {streak > 0 && (
          // ฟีดแบ็ก (เทียบ poster รอบละเอียด) "Orange กระจายทั่วหน้าเกินไป (Today's Focus/Start/Streak/
          // Progress/Bottom Nav/AI Coach ล้วนส้มหมด — ควรสงวนส้มไว้แค่ Action/CTA จริง ใช้ฟ้า/เขียวสำหรับ
          // Information/Progress แทน)" — สตรีคเป็นสถิติ ไม่ใช่ปุ่มกด เปลี่ยนจากส้มเป็นเขียว (สื่อ "ทำสำเร็จ
          // ต่อเนื่อง" ตรงกับโทน isGood=true ที่ Body Overview ใช้อยู่แล้ว)
          <span
            className="font-homeNum font-bold"
            style={{
              background: 'linear-gradient(135deg,#3ee089,#1fae63)',
              color: '#fff',
              fontSize: 10.5,
              padding: '4px 8px',
              borderRadius: 999,
            }}
          >
            🔥 {streak} Day Streak
          </span>
        )}
      </div>
      <div className="flex justify-between items-baseline" style={{ marginBottom: 8 }}>
        <span className="font-homeNum font-extrabold text-white" style={{ fontSize: 20 }}>
          {completedCount}/{total}{' '}
          <span className="font-semibold" style={{ fontSize: 12, color: '#A7ADB7' }}>
            days
          </span>
        </span>
      </div>
      <div style={{ height: barHeight, borderRadius: 999, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
        <AnimatedBarFill pct={displayPct} color="#35b8ff" background="linear-gradient(90deg,#35b8ff,#20d6c7)" />
      </div>
      {/* ฟีดแบ็ก "ตัดเลข % ออกทั้งหมด (ซ้ำกับที่แถบ progress สื่ออยู่แล้ว) แทนที่ด้วยประโยคบอกพฤติกรรม" —
          แทนที่ตัวเลข 60% เดิมด้วยบรรทัดนี้ ให้คำตอบ "ต้องทำอีกกี่ครั้ง" ตรงๆ แทนเปอร์เซ็นต์นามธรรม —
          ข้อความนี้เป็น actionable information ที่ user อ่านบ่อย ไม่ควรใช้โทน muted (rgba จางเดิม) เปลี่ยน
          เป็น Secondary tier (#A7ADB7) ตามที่ผู้ใช้ระบุ */}
      {remainingLabel && (
        <p className="font-homeTh" style={{ color: '#A7ADB7', fontSize: 10.5, marginTop: 6 }}>
          {remainingLabel}
        </p>
      )}
    </div>
  )
}
