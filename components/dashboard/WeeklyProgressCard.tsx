'use client'

import { dashboardSpec } from '@/lib/dashboardSpec'
import AnimatedBarFill from '../AnimatedBarFill'
import { HOME_COLORS } from '@/lib/homeColors'

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

// ฟีดแบ็ก (Product/UI review, "#3 — Weekly Progress interpretation") "แปลตัวเลข -> ความหมาย (ไม่ใช่โชว์
// ข้อมูลซ้ำ) — ห้ามเพิ่ม metric ใหม่/scoring system ใหม่ ห้ามเพิ่มความสูงการ์ด" — ใช้ pattern เดียวกับ
// readinessVerdict() ใน AICoachCompactCard.tsx เป๊ะ (map ค่า % ที่มีอยู่แล้วเป็นข้อความสั้นๆ ตาม tier
// ไม่คำนวณ % ใหม่/ไม่ใช้ scoring แยกต่างหาก) — displayPct มาจาก plannedConsistency จริงที่คำนวณไว้แล้ว
// (เห็นได้จาก AnimatedBarFill ที่ใช้ตัวเดียวกันอยู่แล้วด้านล่าง) threshold ตรงกับตัวอย่างที่ผู้ใช้ให้มาเป๊ะ
// (3/5=60% -> "Great pace" ฯลฯ) — เคส remaining===0 ไม่ต้องมี interpretation ซ้ำ เพราะ "All workouts done"
// ก็เป็นการตีความสำเร็จอยู่แล้วในตัว (กัน "Week complete — All workouts done" ซ้ำความหมาย)
function weeklyPaceLabel(pct: number): string {
  if (pct >= 80) return 'Almost there'
  if (pct >= 60) return 'Great pace'
  if (pct >= 40) return 'Building momentum'
  if (pct > 0) return 'Good start'
  return 'Just getting started'
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
  // v2: ฟีดแบ็ก (Product/UI review, "#3") "3/5 days / Great pace this week / 2 workouts left this week —
  // ถ้าความสูงเดิมจำกัดมาก ให้แทนที่ caption เดิมมากกว่าเพิ่มบรรทัดใหม่" — รวม interpretation เข้าบรรทัด
  // เดียวกับ remainingLabel เดิมเป๊ะ (คนละประโยคคั่นด้วย em dash) แทนการเพิ่มบรรทัดที่ 2 แยก ไม่เพิ่ม
  // ความสูงการ์ดเลยสักพิกเซล เหมือน pattern "รวมเป็นบรรทัดเดียว ไม่ตัดข้อมูลออก" ที่ AICoachCompactCard.tsx
  // เคยใช้แก้ปัญหาเดียวกันมาก่อน (verdict + เหตุผล ในบรรทัดเดียว)
  const remaining = plannedCount > 0 ? Math.max(plannedCount - completedCount, 0) : null
  const remainingLabel =
    remaining == null
      ? null
      : remaining === 0
        ? 'All workouts done this week 🎉'
        : `${weeklyPaceLabel(displayPct)} — ${remaining} workout${remaining === 1 ? '' : 's'} left this week`

  return (
    <div
      style={{
        background: HOME_COLORS.cardGlass,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: `1px solid ${HOME_COLORS.cardBorder}`,
        borderRadius,
        padding,
        boxShadow: '0 8px 20px rgba(0,0,0,.35)',
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span className="font-bold" style={{ fontSize: 14.5, color: HOME_COLORS.textPrimary }}>
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
        <span className="font-homeNum font-extrabold" style={{ fontSize: 20, color: HOME_COLORS.textPrimary }}>
          {completedCount}/{total}{' '}
          <span className="font-semibold" style={{ fontSize: 12, color: HOME_COLORS.textSecondary }}>
            days
          </span>
        </span>
      </div>
      <div style={{ height: barHeight, borderRadius: 999, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
        <AnimatedBarFill pct={displayPct} color={HOME_COLORS.cyan} background={`linear-gradient(90deg,${HOME_COLORS.cyan},#20d6c7)`} />
      </div>
      {/* ฟีดแบ็ก "ตัดเลข % ออกทั้งหมด (ซ้ำกับที่แถบ progress สื่ออยู่แล้ว) แทนที่ด้วยประโยคบอกพฤติกรรม" —
          แทนที่ตัวเลข 60% เดิมด้วยบรรทัดนี้ ให้คำตอบ "ต้องทำอีกกี่ครั้ง" ตรงๆ แทนเปอร์เซ็นต์นามธรรม —
          ข้อความนี้เป็น actionable information ที่ user อ่านบ่อย ไม่ควรใช้โทน muted (rgba จางเดิม) */}
      {remainingLabel && (
        <p className="font-homeTh" style={{ color: HOME_COLORS.textSecondary, fontSize: 10.5, marginTop: 6 }}>
          {remainingLabel}
        </p>
      )}
    </div>
  )
}
