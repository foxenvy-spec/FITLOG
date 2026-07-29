'use client'

import Link from 'next/link'
import { COLORS, FIRE_GRADIENT_CSS } from '@/lib/theme'
import AnimatedBarFill from './AnimatedBarFill'

interface TodaysWorkoutCompactCardProps {
  completed: number
  total: number
  href: string
}

// เวอร์ชันย่อของการ์ด "Today's Workout" — ตัดรูปประกอบใหญ่ออก เหลือไอคอนวงกลม + เศษส่วน +
// progress bar ในแถวเดียว (Mobile Dashboard v2: ปรับ padding/ขนาดตัวอักษรให้สูงรวม ~110px)
export default function TodaysWorkoutCompactCard({ completed, total, href }: TodaysWorkoutCompactCardProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0

  return (
    <Link
      href={href}
      className="rounded-[20px] border border-amber/40 bg-surface flex items-center gap-4 px-4 py-4 active:bg-surface2 transition"
    >
      <span
        className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-xl"
        style={{ backgroundColor: `${COLORS.amber}22` }}
        aria-hidden="true"
      >
        🏋️
      </span>
      <div className="min-w-0 flex-1">
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
      <span className="text-muted shrink-0" aria-hidden="true">›</span>
    </Link>
  )
}
