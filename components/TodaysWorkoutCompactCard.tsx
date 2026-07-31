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

// การ์ด "Today's Workout" — v5: คอลัมน์เนื้อหาซ้าย + รูปภาพชิดขวา (แยกโซนชัดเจน แทนรูปเต็มพื้นหลัง
// การ์ด+ไล่เฉดมืดทับแบบ v4 เดิม) ตามสเปคใหม่ที่ขอ "Image stays on right. Content stays left. Button
// should NOT overlap image." — ปุ่มลูกศร/progress bar อยู่ในคอลัมน์ซ้ายล้วนๆ จึงไม่มีทางทับรูปได้เลย
// โดยโครงสร้าง ไม่ต้องคำนวณตำแหน่งเอง — ความสูงขั้นต่ำ 180px ตาม spacing token (เดิมสูงตามเนื้อหา
// ~130-140px)
export default function TodaysWorkoutCompactCard({ completed, total, href }: TodaysWorkoutCompactCardProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0

  return (
    <PremiumCard
      as={Link}
      href={href}
      className="relative overflow-hidden flex active:scale-[0.99] transition"
      style={{ padding: 0, minHeight: 180 }}
    >
      {/* คอลัมน์เนื้อหา — padding ของตัวเองแทนที่ padding ของ PremiumCard (ปิดไว้ที่ 0 ด้านบน เพราะ
          คอลัมน์รูปฝั่งขวาต้องชนขอบการ์ดเต็มๆ ไม่มี padding ครอบ) */}
      <div className="relative z-10 flex-1 min-w-0 flex flex-col justify-between" style={{ padding: 18 }}>
        {/* แถวบน — ไอคอนเล็ก + label */}
        <div className="flex items-center gap-2">
          <span
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
            style={{ backgroundColor: `${COLORS.amber}22` }}
            aria-hidden="true"
          >
            <Image
              src="/icons/today-workout-icon-dumbbell.png"
              alt=""
              width={32}
              height={32}
              className="w-full h-full object-cover"
              style={{ mixBlendMode: 'screen' }}
            />
          </span>
          <p className="text-[11px] tracked uppercase text-muted">Today&apos;s Workout</p>
        </div>

        <div>
          {/* เศษส่วนตัวใหญ่ — จุดเด่นหลักของการ์ด */}
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-ink font-bold leading-none" style={{ fontSize: 34 }}>
              {completed}
            </span>
            <span className="text-muted leading-none" style={{ fontSize: 18 }}>
              /{total}
            </span>
          </div>
          <p className="text-xs text-muted mt-1">ท่าที่ทำแล้ว</p>

          {/* progress bar + ปุ่มลูกศรวงกลม — อยู่ในคอลัมน์ซ้ายทั้งคู่ ไม่ล้ำเข้าไปในโซนรูปฝั่งขวาแน่นอน */}
          <div className="flex items-center gap-3 mt-4">
            <div className="h-2 rounded-full bg-surface2 flex-1 overflow-hidden">
              <AnimatedBarFill pct={pct} color={COLORS.amber} background={FIRE_GRADIENT_CSS} />
            </div>
            <span className="shrink-0 w-9 h-9" aria-hidden="true">
              <Image src="/icons/today-workout-icon-arrow.png" alt="" width={36} height={36} className="w-full h-full object-cover rounded-full" />
            </span>
          </div>
        </div>
      </div>

      {/* คอลัมน์รูปฝั่งขวา — ชนขอบการ์ดเต็มความสูง overflow-hidden ของ PremiumCard ตัดขอบให้เอง
          เกรเดียนต์บางๆ ที่ขอบซ้ายกลืนรอยต่อกับคอลัมน์เนื้อหาไม่ให้ดูตัดแข็งเกินไป */}
      {/* ความกว้าง 40% ตามภาพอ้างอิงจริง (Image A) — เดิมลอง 45% กว้างไปนิด */}
      <div className="relative w-[40%] shrink-0" aria-hidden="true">
        <Image src="/images/today-workout-bg-mobile.png" alt="" fill className="object-cover" style={{ objectPosition: '75% 55%' }} />
        <div
          className="absolute inset-y-0 left-0 w-10"
          style={{ background: 'linear-gradient(90deg, rgba(22,22,22,0.9), transparent)' }}
        />
      </div>
    </PremiumCard>
  )
}
