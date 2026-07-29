'use client'

import Link from 'next/link'
import { COLORS, withAlpha } from '@/lib/theme'
import PremiumCard from './ui/PremiumCard'

interface TodaysFocusCardProps {
  label: string | null
  href: string
}

// "Today's Focus" ตามมอคอัพ — ใช้ workoutTitle (โปรแกรมที่ตั้งไว้วันนี้) ถ้ามี ไม่งั้น fallback
// ไปกล้ามเนื้อที่แนะนำวันนี้ (data.muscleRecommendation) ซึ่ง MobileDashboardView เป็นคนเลือกส่งมาให้แล้ว
export default function TodaysFocusCard({ label, href }: TodaysFocusCardProps) {
  return (
    <PremiumCard
      as={Link}
      href={href}
      className="flex items-center justify-between gap-3 active:scale-[0.99] transition"
      style={{ padding: 20 }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* กลับไปใหญ่ขึ้น (24px -> 36px) ตามที่ยืนยันทิศทางแล้ว — เดิมย่อลงไปรอบก่อนหน้า */}
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: withAlpha(COLORS.amber, '22'), fontSize: 16 }}
          aria-hidden="true"
        >
          🎯
        </span>
        <div className="min-w-0">
          <p className="text-[10px] tracked uppercase text-muted">Today&apos;s Focus</p>
          <p className="font-display tracked uppercase text-amber truncate" style={{ fontSize: 14 }}>
            {label ?? 'ยังไม่ได้ตั้งโปรแกรม'}
          </p>
        </div>
      </div>
      <span className="text-muted shrink-0" aria-hidden="true">›</span>
    </PremiumCard>
  )
}
