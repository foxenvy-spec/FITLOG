'use client'

import Link from 'next/link'
import { COLORS, TEXT } from '@/lib/theme'
import { dashboardSpec } from '@/lib/dashboardSpec'
import AnimatedBarFill from './AnimatedBarFill'
import FitnessRing from './dashboard/FitnessRing'

// ไอคอนดัมเบลเส้นล้วน (path เดียวกับ DumbbellIcon ใน BottomNav.tsx — ลายเซ็นเดียวกันทั้งแอป) แทนอีโมจิ
// 🏋️ เดิม — เหตุผลเดียวกับ TargetIcon ใน TodaysFocusCard.tsx (อีโมจิมีสีของตัวเองติดมา ชนกับพื้นส้มทึบ)
function DumbbellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12h2M5 9v6M8 7v10M16 7v10M19 9v6M22 12h-2M8 12h8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface TodaysWorkoutCompactCardProps {
  completed: number
  total: number
  href: string
  // ฟีดแบ็ก "Volume +X% จากครั้งก่อน มีแค่เดสก์ท็อป อยากให้มือถือมีด้วย" — ใช้ data.sessionVolumeChange
  // ตัวเดียวกับที่เดสก์ท็อป (DashboardView.tsx) ใช้อยู่แล้ว (ไม่คำนวณซ้ำ)
  volumeChangePct?: number | null
}

// เขียนใหม่ทั้งหมดตาม mockup "Version 5" ("ของจริงไม่สวยเหมือน Version 5 เลย ปรับสี กรอบ พื้นหลังใหม่ให้
// เหมือน 100% ไม่ต้องสนใจของเก่า") — เดิมเป็นการ์ด hero เต็มรูปแบบ: รูปดัมเบลถ่ายจริงเต็มพื้นหลัง +
// scrim ไล่สี + Orange Reflection/Bloom/Fog + ลายไทเทเนียมเฉียง+ตาข่าย + particle 5 จุด + dust overlay +
// edge highlight + floor reflection + light sweep animation (มากกว่า 10 เลเยอร์) — mockup เป็นการ์ด
// เรียบแบน พื้นเทาเข้มเรียบ + border บางๆ + badge วงแหวนเล็ก + progress bar เท่านั้น ไม่มีรูปพื้นหลัง/
// texture ใดๆ เลย — เขียนใหม่ให้ตรงกับ mockup (component นี้ใช้เฉพาะ Mobile Dashboard เท่านั้น ไม่กระทบ
// เดสก์ท็อป/หน้าอื่น) ตรรกะคำนวณ pct/isCompleted ไม่แตะ
export default function TodaysWorkoutCompactCard({ completed, total, href, volumeChangePct }: TodaysWorkoutCompactCardProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
  const isCompleted = total > 0 && completed >= total
  const exerciseWord = total === 1 ? 'Exercise' : 'Exercises'

  return (
    <Link
      href={href}
      className="rounded-card border border-line flex items-center gap-3 active:opacity-80 transition"
      style={{
        padding: dashboardSpec.workoutCard.padding,
        minHeight: dashboardSpec.workoutCard.height,
        background: 'linear-gradient(180deg, #1E2228 0%, #17191E 100%)',
      }}
    >
      <div className="relative shrink-0 flex items-center justify-center">
        <FitnessRing value={pct} size={56} strokeWidth={4} simple>
          <span
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: COLORS.amber, color: '#1A1200' }}
            aria-hidden="true"
          >
            <DumbbellIcon />
          </span>
        </FitnessRing>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[12px] tracked uppercase text-muted">Today&apos;s Workout</p>
        <div className="flex items-baseline gap-1 mt-0.5">
          <span className="font-mono font-bold leading-none" style={{ fontSize: 24, color: TEXT.title }}>
            {completed}
          </span>
          <span className="leading-none text-muted" style={{ fontSize: 14 }}>
            /{total}
          </span>
          <span className="leading-none uppercase tracked text-muted" style={{ fontSize: 9, color: isCompleted ? COLORS.moss : undefined }}>
            {isCompleted ? 'Completed ✓' : exerciseWord}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-surface2 overflow-hidden mt-1.5">
          <AnimatedBarFill pct={pct} color={COLORS.amber} />
        </div>
        {isCompleted && volumeChangePct != null && (
          <p className="text-[12px] leading-none mt-1" style={{ color: volumeChangePct >= 0 ? COLORS.moss : COLORS.amber }}>
            Volume {volumeChangePct >= 0 ? '+' : ''}
            {volumeChangePct}% จากครั้งก่อน
          </p>
        )}
      </div>
      <span className="text-muted shrink-0" aria-hidden="true">›</span>
    </Link>
  )
}
