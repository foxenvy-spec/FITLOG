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
      className="flex items-center justify-between gap-2 px-3 py-1.5 active:scale-[0.99] transition"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: withAlpha(COLORS.amber, '22'), fontSize: 11 }}
          aria-hidden="true"
        >
          🎯
        </span>
        <div className="min-w-0">
          <p className="text-[10px] tracked uppercase text-muted">Today&apos;s Focus</p>
          <p className="font-display tracked uppercase text-amber truncate" style={{ fontSize: 12 }}>
            {label ?? 'ยังไม่ได้ตั้งโปรแกรม'}
          </p>
        </div>
      </div>
      <span className="text-muted shrink-0" aria-hidden="true">›</span>
    </PremiumCard>
  )
}
