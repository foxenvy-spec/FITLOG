'use client'

import Link from 'next/link'
import Image from 'next/image'
import { COLORS, FIRE_GRADIENT_CSS } from '@/lib/theme'
import AnimatedBarFill from './AnimatedBarFill'
import PremiumCard from './ui/PremiumCard'

interface TodaysWorkoutCompactCardProps {
  completed: number
  total: number
  href: string
}

// เวอร์ชันย่อของการ์ด "Today's Workout" — ไอคอนวงกลม + เศษส่วน + progress bar ในแถวเดียว (Mobile
// Dashboard v2: ปรับ padding/ขนาดตัวอักษรให้สูงรวม ~110px) — รูปประกอบพื้นหลัง/ไอคอนที่ผู้ใช้สร้างเอง
// (v3) กลับมาแล้ว แต่วางเป็น background layer จางๆ ด้านหลังแถวเนื้อหาเดิม แทนที่จะเป็นรูปใหญ่แยก
// บล็อกต่างหากเหมือนเวอร์ชันก่อน v2 (ที่ตัดออกไปตอนทำ compact) — ไม่ดันความสูงการ์ดกลับขึ้นไป
export default function TodaysWorkoutCompactCard({ completed, total, href }: TodaysWorkoutCompactCardProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0

  return (
    <PremiumCard
      as={Link}
      href={href}
      className="relative overflow-hidden flex items-center gap-4 px-4 py-4 active:scale-[0.99] transition"
    >
      {/* พื้นหลังฉากยิม — จางๆ อยู่หลังเนื้อหาทั้งหมด (z-0) โฟกัสไปมุมขวาล่างที่มีดัมเบลเรืองแสง แล้วไล่
          เฉดมืดจากซ้ายทับอีกชั้น (z-[1]) กันตัวหนังสือ/ไอคอนอ่านไม่ออก */}
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
        <Image
          src="/images/today-workout-bg-mobile.png"
          alt=""
          fill
          className="object-cover"
          style={{ objectPosition: '85% 75%' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(90deg, rgba(20,22,26,0.94) 0%, rgba(20,22,26,0.75) 45%, rgba(20,22,26,0.35) 100%)' }}
        />
      </div>

      <span
        className="relative z-10 w-12 h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
        style={{ backgroundColor: `${COLORS.amber}22` }}
        aria-hidden="true"
      >
        <Image src="/icons/today-workout-icon-dumbbell.png" alt="" width={48} height={48} className="w-full h-full object-cover" />
      </span>
      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] tracked uppercase text-muted">Today&apos;s Workout</p>
          <p className="text-xs text-muted shrink-0">
            <span className="font-mono text-ink text-base font-semibold">{completed}</span>
            <span className="mx-0.5">/</span>
            {total} ท่า
          </p>
        </div>
        <div className="h-2 rounded-full bg-surface2 mt-2.5 overflow-hidden">
          <AnimatedBarFill pct={pct} color={COLORS.amber} background={FIRE_GRADIENT_CSS} />
        </div>
      </div>
      <span className="relative z-10 shrink-0 w-4 h-4" aria-hidden="true">
        <Image src="/icons/today-workout-icon-arrow.png" alt="" width={16} height={16} className="w-full h-full object-contain" />
      </span>
    </PremiumCard>
  )
}
