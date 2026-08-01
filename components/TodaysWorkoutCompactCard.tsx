'use client'

import Link from 'next/link'
import Image from 'next/image'
import { COLORS, FIRE_GRADIENT_CSS, NEUTRAL, TEXT, withAlpha } from '@/lib/theme'
import { dashboardSpec } from '@/lib/dashboardSpec'
import AnimatedBarFill from './AnimatedBarFill'
import PremiumCard from './ui/PremiumCard'
import FitnessRing from './dashboard/FitnessRing'

interface TodaysWorkoutCompactCardProps {
  completed: number
  total: number
  href: string
  /** กลุ่มกล้ามเนื้อของโปรแกรมวันนี้ (จาก ProgramExercise.muscle_group) — โชว์สูงสุด 2 กลุ่มแรกคั่นด้วย "•" */
  muscleGroups?: string[]
}

// การ์ด "Today's Workout" — v7: กลับไปมีบรรทัดกลุ่มกล้ามเนื้อ ("Chest • Triceps") + badge วงกลมมี arc
// progress รอบไอคอน (ใช้ FitnessRing component เดียวกับ Fitness Score บน Header) แทนไอคอนแบนเดิม ตาม
// mockup ที่ขอ "ทำออกมาให้เหมือนนี้" — เดิม v6 ตัดบรรทัดกลุ่มกล้ามเนื้อออกเพราะการ์ดสูงแค่ 92px ไม่พอ
// รอบนี้ยืนยันแล้วว่ายอมให้การ์ดสูงขึ้น (92 -> dashboardSpec.workoutCard.height 112px) เพื่อใส่กลับมา
//
// ปุ่มลูกศรวงกลมย้ายจากคอลัมน์ซ้าย (ต่อท้าย progress bar) ไปลอยทับมุมล่างขวาของรูปแทน ตาม mockup —
// ยกเลิกสเปกเดิม "Button should NOT overlap image" ของ v5 โดยตั้งใจ (ยืนยันจากผู้ใช้แล้วว่าต้องการ
// แบบนี้ตรงๆ ไม่ใช่ regression)
export default function TodaysWorkoutCompactCard({ completed, total, href, muscleGroups = [] }: TodaysWorkoutCompactCardProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
  const muscleLine = muscleGroups.slice(0, 2).join(' • ')

  return (
    <PremiumCard
      as={Link}
      href={href}
      // active:translate-y-[1px] ผสมกับ active:scale-[0.99] เดิม — การ์ดรู้สึก "กดจมลง" ตอนแตะ
      // (Card Press Effect) เหมือน TodaysFocusCard
      className="relative overflow-hidden flex active:scale-[0.99] active:translate-y-[1px] transition"
      style={{ padding: 0, minHeight: dashboardSpec.workoutCard.height }}
    >
      {/* คอลัมน์เนื้อหา — badge วงแหวนซ้าย + ข้อความในแถวเดียวกัน (จัดกึ่งกลางแนวตั้งด้วยกัน) แทนที่
          จะแยกเป็นแถวไอคอนบนสุด+แถวเนื้อหาล่างแบบ v6 — ประหยัดพื้นที่แนวตั้งลงได้มาก แม้การ์ดจะสูงขึ้น */}
      <div
        className="relative z-10 flex-1 min-w-0 flex items-center gap-3"
        style={{ padding: dashboardSpec.workoutCard.padding }}
      >
        <FitnessRing
          value={pct}
          size={dashboardSpec.workoutCard.ringSize}
          strokeWidth={4}
          trackColor={NEUTRAL.ringTrack}
          className="shrink-0"
        >
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: withAlpha(COLORS.amber, '22') }}
            aria-hidden="true"
          >
            <Image
              src="/icons/today-workout-icon-dumbbell.png"
              alt=""
              width={24}
              height={24}
              className="w-full h-full object-cover"
              style={{ mixBlendMode: 'screen' }}
            />
          </span>
        </FitnessRing>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracked uppercase text-muted">Today&apos;s Workout</p>

          {/* เศษส่วนตัวใหญ่ + "Exercises" ต่อท้ายบรรทัดเดียวกัน (ไม่กินพื้นที่แนวตั้งเพิ่ม) */}
          <div className="flex items-baseline gap-1">
            <span className="font-mono font-bold leading-none" style={{ fontSize: 24, color: TEXT.title }}>
              {completed}
            </span>
            <span className="text-muted leading-none" style={{ fontSize: 14 }}>
              /{total}
            </span>
            <span className="text-muted leading-none uppercase tracked" style={{ fontSize: 9 }}>
              Exercises
            </span>
          </div>

          {muscleLine && (
            <p className="text-muted truncate" style={{ fontSize: 10, marginTop: 1 }}>
              {muscleLine}
            </p>
          )}

          {/* progress bar — v2: เพิ่ม inner shadow เบาๆ (จมลงเล็กน้อย) + reflection บาง 2% ด้านบน ให้
              รางดูเป็นร่องโลหะจริง (ไม่ใช่แถบสีทึบแบน) */}
          <div
            className="h-1.5 rounded-full bg-surface2 overflow-hidden mt-1.5"
            style={{
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,.5)',
              backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,.02), transparent 60%)',
            }}
          >
            <AnimatedBarFill pct={pct} color={COLORS.amber} background={FIRE_GRADIENT_CSS} />
          </div>
        </div>
      </div>

      {/* คอลัมน์รูปฝั่งขวา — ชนขอบการ์ดเต็มความสูง overflow-hidden ของ PremiumCard ตัดขอบให้เอง
          เกรเดียนต์บางๆ ที่ขอบซ้ายกลืนรอยต่อกับคอลัมน์เนื้อหาไม่ให้ดูตัดแข็งเกินไป — ความกว้างจาก
          dashboardSpec.workoutCard.imageWidthPct */}
      <div className="relative shrink-0" style={{ width: `${dashboardSpec.workoutCard.imageWidthPct}%` }} aria-hidden="true">
        <Image src="/images/today-workout-bg-mobile.png" alt="" fill className="object-cover" style={{ objectPosition: '75% 55%' }} />
        <div
          className="absolute inset-y-0 left-0 w-10"
          style={{ background: 'linear-gradient(90deg, rgba(22,22,22,0.9), transparent)' }}
        />
        {/* ปุ่มลูกศรลอยทับมุมล่างขวาของรูป — ไอคอนนี้เป็น badge วงกลมสมบูรณ์ในตัวอยู่แล้ว (มีวงกลม+glow
            ของตัวเอง) ไม่ต้องมี wrapper background/mixBlendMode เพิ่มเหมือนไอคอนดัมเบล */}
        <span className="absolute bottom-2 right-2 w-8 h-8 rounded-full overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,.5)' }}>
          <Image src="/icons/today-workout-icon-arrow.png" alt="" width={32} height={32} className="w-full h-full object-cover" />
        </span>
      </div>
    </PremiumCard>
  )
}
