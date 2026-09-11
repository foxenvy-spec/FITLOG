'use client'

import Image from 'next/image'
import Link from 'next/link'
import { COLORS, TEXT } from '@/lib/theme'
import { dashboardSpec } from '@/lib/dashboardSpec'
import AnimatedBarFill from './AnimatedBarFill'

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
//
// v2: "Mobile_app_design_brief_1.zip" (6a, บรรทัด 103-112) — สเปกละเอียดตัดวง progress + badge ดัมเบล
// ออกทั้งหมด (ไม่มี ring badge อีกต่อไป) เปลี่ยนเป็นเนื้อหาข้อความล้วนฝั่งซ้าย (ป้าย+ไอคอนเล็ก -> ตัวเลข
// ใหญ่ -> caption -> progress bar) และรูปธัมบ์เนลเวิร์กเอาต์ 64px ทรงกลมมุมโค้งฝั่งขวาแทน — ใช้
// workout-hero.jpg ที่มีอยู่แล้วในแอป (README ระบุให้ crop ภาพนี้ใช้ได้เลย ไม่ต้องหารูปใหม่) พื้นหลังการ์ด
// เปลี่ยนจาก gradient 2 stop ธรรมดาเป็น gradient 3 stop มุมเอียง 158deg ตามสเปกเป๊ะ + shadow ยกการ์ดขึ้น
// จากพื้น (การ์ดนี้เด่นสุดในหน้ารองจาก Hero ตาม README) — caption ("เซ็ทที่บันทึกแล้ว" ใน mockup) ยังใช้
// exerciseWord/Completed✓ เดิม เพราะตัวเลขจริงของแอปนับ "ท่า/exercise" ไม่ใช่ "เซ็ท" ที่ mockup สมมติไว้
// (ข้อความ mockup เป็นแค่ static mock data ไม่ใช่ความหมายจริงที่ต้องคัดลอกคำต่อคำ)
export default function TodaysWorkoutCompactCard({ completed, total, href, volumeChangePct }: TodaysWorkoutCompactCardProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
  const isCompleted = total > 0 && completed >= total
  const exerciseWord = total === 1 ? 'Exercise' : 'Exercises'

  return (
    <Link
      href={href}
      className="rounded-card flex items-center gap-3.5 active:opacity-80 transition"
      style={{
        padding: dashboardSpec.workoutCard.padding,
        minHeight: dashboardSpec.workoutCard.height,
        background: 'linear-gradient(158deg, #262A30 0%, #1A1D22 62%, #15181C 100%)',
        boxShadow: '0 16px 36px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.05)',
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-muted">
          <span className="shrink-0" aria-hidden="true">
            <DumbbellIcon />
          </span>
          <p className="text-[12px] tracked uppercase">Today&apos;s Workout</p>
        </div>
        <div className="flex items-baseline gap-1 mt-2">
          <span className="font-display font-bold leading-none" style={{ fontSize: 30, color: TEXT.title }}>
            {completed}
          </span>
          <span className="leading-none text-muted" style={{ fontSize: 16 }}>
            /{total}
          </span>
        </div>
        <p className="leading-none text-muted mt-1" style={{ fontSize: 12, color: isCompleted ? COLORS.moss : undefined }}>
          {isCompleted ? 'Completed ✓' : exerciseWord}
        </p>
        {/* v3: brief สเปก progress bar เป็น gradient อำพัน->แดงส้ม (linear-gradient(90deg,#E8A33D,#C1503A))
            ไม่ใช่อำพันล้วน — background prop ของ AnimatedBarFill รองรับ gradient อยู่แล้ว (ใช้ที่ Weekly
            Volume/Muscle Heatmap มาก่อน) ไม่ต้องเพิ่ม prop ใหม่ */}
        <div className="h-1.5 rounded-full bg-surface2 overflow-hidden mt-2.5">
          <AnimatedBarFill pct={pct} color={COLORS.amber} background={`linear-gradient(90deg, ${COLORS.amber}, ${COLORS.rust})`} />
        </div>
        {isCompleted && volumeChangePct != null && (
          <p className="text-[12px] leading-none mt-1" style={{ color: volumeChangePct >= 0 ? COLORS.moss : COLORS.amber }}>
            Volume {volumeChangePct >= 0 ? '+' : ''}
            {volumeChangePct}% จากครั้งก่อน
          </p>
        )}
      </div>

      <div
        className="relative shrink-0 rounded-[14px] overflow-hidden"
        style={{ width: dashboardSpec.workoutCard.thumbSize, height: dashboardSpec.workoutCard.thumbSize }}
      >
        <Image src="/images/workout-hero.jpg" alt="" fill className="object-cover" />
      </div>
      {/* ฟีดแบ็ก "ไอคอนที่มีอยู่แล้วลองเอามาใช้" -> "ตัดพื้นหลังดำออกแล้วลองใช้" — เปลี่ยนตัวอักษร "›" เป็น
          ไอคอนลูกศรเรืองแสงจริงจากชุด today-workout-icon-arrow.png (ตัดพื้นดำ+ครอปแล้ว ดู comment เต็มที่
          TodaysFocusCard.tsx จุดเดียวกัน) ใช้ตัวเดียวกันทุกการ์ดที่มี chevron แบบนี้ */}
      <Image src="/icons/today-workout-chevron-glow.png" alt="" width={20} height={20} className="shrink-0" aria-hidden="true" />
    </Link>
  )
}
