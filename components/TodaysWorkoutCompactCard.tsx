'use client'

import Link from 'next/link'

interface TodaysWorkoutCompactCardProps {
  completed: number
  total: number
  href: string
}

// เวอร์ชันย่อของการ์ด "Today's Workout" ตามมอคอัพ — เศษส่วน + progress bar + รูปเล็ก แทนที่
// รายละเอียดเต็ม (ชื่อโปรแกรม/กลุ่มกล้ามเนื้อ/exercises-sets-นาที/ปุ่มเริ่มเทรน) ที่เคยอยู่ตรงนี้
export default function TodaysWorkoutCompactCard({ completed, total, href }: TodaysWorkoutCompactCardProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0

  return (
    <Link
      href={href}
      className="relative rounded-lg border border-amber/40 bg-surface overflow-hidden flex items-center gap-3 px-4 py-4 active:bg-surface2 transition"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[10px] tracked uppercase text-muted">Today&apos;s Workout</p>
        <p className="mt-1">
          <span className="font-mono text-2xl text-ink">{completed}</span>
          <span className="text-muted text-base">/{total}</span>
        </p>
        <p className="text-[11px] text-muted mt-0.5">ท่าที่บันทึกแล้ว</p>
        <div className="h-1.5 rounded-full bg-surface2 mt-2.5 overflow-hidden">
          <div className="h-full rounded-full bg-amber" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div
        className="relative w-20 h-20 rounded-lg overflow-hidden shrink-0"
        style={{ backgroundImage: "url('/images/workout-hero.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
        aria-hidden="true"
      >
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.45))' }} />
        <span className="absolute right-1.5 bottom-1.5 w-7 h-7 rounded-full bg-amber flex items-center justify-center text-bg text-sm">
          ›
        </span>
      </div>
    </Link>
  )
}
