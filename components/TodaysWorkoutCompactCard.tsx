'use client'

import Link from 'next/link'
import { COLORS } from '@/lib/theme'

interface TodaysWorkoutCompactCardProps {
  completed: number
  total: number
  href: string
}

// เวอร์ชันย่อของการ์ด "Today's Workout" — ตัดรูปประกอบออก (ไม่จำเป็นต้องมีรูปใหญ่ตามที่ขอ)
// เหลือแค่ไอคอน + เศษส่วน + progress bar แถวเดียว จากเดิม ~170px ลดเหลือ ~90-100px
export default function TodaysWorkoutCompactCard({ completed, total, href }: TodaysWorkoutCompactCardProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0

  return (
    <Link
      href={href}
      className="rounded-[20px] border border-amber/40 bg-surface flex items-center gap-3 px-4 py-3 active:bg-surface2 transition"
    >
      <span
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-base"
        style={{ backgroundColor: `${COLORS.amber}22` }}
        aria-hidden="true"
      >
        🏋️
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10px] tracked uppercase text-muted">Today&apos;s Workout</p>
          <p className="text-[11px] text-muted shrink-0">
            <span className="font-mono text-ink text-sm">{completed}</span>/{total} ท่า
          </p>
        </div>
        <div className="h-1.5 rounded-full bg-surface2 mt-1.5 overflow-hidden">
          <div className="h-full rounded-full bg-amber" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="text-muted shrink-0" aria-hidden="true">›</span>
    </Link>
  )
}
