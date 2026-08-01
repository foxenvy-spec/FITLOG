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

// การ์ด "Today's Workout" — v8: รูปดัมเบลเป็นพื้นหลังเต็มการ์ด (full-bleed) แทนคอลัมน์แคบฝั่งขวา (27%)
// แบบ v7 ตามที่ขอ "อยากให้แสดงเต็มการ์ดเหมือนตัวอย่าง" (เทียบกับ mockup ที่ตัวรูป+ลายพื้นผิวคลุมทั้งใบ
// ไม่ใช่แค่โซนแคบๆ) — เปลี่ยนจากโครงสร้าง 2 คอลัมน์ (เนื้อหา flex-1 + รูป shrink-0) มาเป็นรูปวางเป็น
// absolute inset-0 ชั้นล่างสุด แล้ววางไล่สีมืด (ซ้ายทึบ -> ขวาจาง) ทับอีกชั้นให้ตัวหนังสืออ่านออกฝั่งซ้าย
// โดยยังเห็นรายละเอียดรูปฝั่งขวาชัดอยู่ — เนื้อหา (ring+ข้อความ) กับปุ่มลูกศรลอยอยู่ชั้นบนสุด (z-10)
// ทับพื้นหลังทั้งคู่ — dashboardSpec.workoutCard.imageWidthPct เดิมไม่ใช้แล้ว (รูปเต็มการ์ดไม่มีคอลัมน์
// แยกอีกต่อไป)
//
// v7: กลับไปมีบรรทัดกลุ่มกล้ามเนื้อ ("Chest • Triceps") + badge วงกลมมี arc progress รอบไอคอน (ใช้
// FitnessRing component เดียวกับ Fitness Score บน Header) แทนไอคอนแบนเดิม — การ์ดสูงขึ้น 92 -> 112px
// เพื่อให้มีที่พอ ปุ่มลูกศรวงกลมย้ายจากคอลัมน์ซ้ายไปลอยทับมุมล่างขวาของรูปแทน (ยกเลิกสเปกเดิม "Button
// should NOT overlap image" ของ v5 โดยตั้งใจ ยืนยันจากผู้ใช้แล้ว)
export default function TodaysWorkoutCompactCard({ completed, total, href, muscleGroups = [] }: TodaysWorkoutCompactCardProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
  const muscleLine = muscleGroups.slice(0, 2).join(' • ')

  return (
    <PremiumCard
      as={Link}
      href={href}
      // active:translate-y-[1px] ผสมกับ active:scale-[0.99] เดิม — การ์ดรู้สึก "กดจมลง" ตอนแตะ
      // (Card Press Effect) เหมือน TodaysFocusCard — ต้องมี `block` เสมอ: as={Link} เรนเดอร์เป็น <a>
      // ซึ่ง display เริ่มต้นเป็น inline (ไม่ใช่ block) และ min-height/height ไม่มีผลกับ inline element
      // ตามสเปก CSS เลย — ถ้าลืมใส่ block/flex การ์ดจะยุบเหลือแค่ความสูงจาก inline content จริง (~88px
      // แทนที่จะเป็น 112px ตาม spec) แล้วรูปพื้นหลัง (position:absolute; inset:0) ก็ไปวัดขนาดตามกล่อง
      // ที่ยุบผิดนั้นด้วย ทำให้ครอปรูปผิดสัดส่วน (บั๊กที่เจอจริงตอนขึ้น production — v9 fix)
      className="relative overflow-hidden block active:scale-[0.99] active:translate-y-[1px] transition"
      style={{ padding: 0, minHeight: dashboardSpec.workoutCard.height }}
    >
      {/* พื้นหลังรูปเต็มการ์ด + ไล่สีมืดทับ (ซ้ายทึบสุด 92% -> ขวาโปร่งใส) ให้ตัวหนังสือฝั่งซ้ายอ่านออก
          ชัดเจน โดยยังเห็นรายละเอียด (แผ่นน้ำหนัก/แสงส้ม) ของรูปฝั่งขวาเต็มๆ ไม่ถูกบัง */}
      <div className="absolute inset-0" aria-hidden="true">
        <Image src="/images/today-workout-bg-mobile.png" alt="" fill className="object-cover" style={{ objectPosition: '68% 55%' }} />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(13,14,16,.94) 0%, rgba(13,14,16,.86) 40%, rgba(13,14,16,.55) 62%, rgba(13,14,16,.15) 85%, rgba(13,14,16,0) 100%)',
          }}
        />
      </div>

      {/* เนื้อหา — badge วงแหวนซ้าย + ข้อความในแถวเดียวกัน (จัดกึ่งกลางแนวตั้งด้วยกัน) ลอยทับพื้นหลังรูป
          ชั้นบน (z-10) — จำกัดความกว้างไว้ที่ ~68% กันไม่ให้ข้อความยาวๆ ล้ำเข้าไปทับปุ่มลูกศร/รายละเอียด
          รูปฝั่งขวา */}
      <div
        className="relative z-10 flex min-w-0 items-center gap-3"
        style={{ padding: dashboardSpec.workoutCard.padding, maxWidth: '68%' }}
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

      {/* ปุ่มลูกศรลอยทับมุมล่างขวาของการ์ด (บนรูปพื้นหลังเต็มการ์ดโดยตรง) — ไอคอนนี้เป็น badge วงกลม
          สมบูรณ์ในตัวอยู่แล้ว (มีวงกลม+glow ของตัวเอง) ไม่ต้องมี wrapper background/mixBlendMode เพิ่ม
          เหมือนไอคอนดัมเบล */}
      <span
        className="absolute z-10 bottom-2 right-2 w-8 h-8 rounded-full overflow-hidden"
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,.5)' }}
        aria-hidden="true"
      >
        <Image src="/icons/today-workout-icon-arrow.png" alt="" width={32} height={32} className="w-full h-full object-cover" />
      </span>
    </PremiumCard>
  )
}
