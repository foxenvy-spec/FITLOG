'use client'

import type { ReactNode, ElementType, ComponentPropsWithoutRef } from 'react'
import { AMBER_GRADIENT_CSS, AMBER_GLOW_SHADOW, NEUTRAL, COLORS, withAlpha } from '@/lib/theme'

interface ButtonOwnProps {
  children: ReactNode
  className?: string
  // v49 (Design System Phase 2): ฟีดแบ็ก "แต่ละ Card ใช้สีคนละแบบ...Button ควรใช้ Component เดียว" —
  // เดิมปุ่ม CTA หลัก ("เริ่มเทรนเลย"/"ไปต่อ" ใน DashboardView, "เริ่ม X"/"สร้างโปรแกรมแรก" ใน AI Coach)
  // เขียนกันคนละที่ ทำหน้าที่เดียวกัน (primary action) แต่หน้าตาต่างกัน — DashboardView ใช้ bg-amber
  // เรียบๆ ไม่มี glow เลย ส่วน AI Coach ใช้ AMBER_GRADIENT_CSS + AMBER_GLOW_SHADOW (โทเคนที่มีอยู่แล้ว
  // ในแอป) — เลือกแบบ AI Coach เป็นมาตรฐาน (สมบูรณ์กว่า ใช้โทเคนที่ประกาศไว้แล้วอยู่แล้ว ไม่ใช่ค่าใหม่)
  // `icon` แยกไว้สำหรับปุ่มวงกลมขอบบาง (เช่น ลิงก์ไอคอนไปหน้า AI Coach เต็ม) ซึ่งเป็นรูปแบบที่ต่างกัน
  // จริง (secondary, ไม่ใช่ primary action) ไม่ใช่แค่สีต่าง จึงแยก variant ไม่ยุบรวมกับ primary
  variant?: 'primary' | 'icon'
  // ขนาด CTA หลัก — 'sm' (เดิม: AI Coach, การ์ดรอง) ปุ่มเล็ก text-[11px]/px-4 py-2, 'md' (เดิม: Hero
  // Workout CTA เดียวในหน้า) ปุ่มใหญ่กว่า text-sm/px-5 py-2.5 — ใช้ prop แทนให้ className ไปแข่งกันเอง
  // (ลำดับ class ใน stylesheet ที่คอมไพล์แล้วไม่แน่นอน จะพึ่ง "class หลังชนะ" ไม่ได้จริง) ไม่มีผลกับ
  // variant="icon" (ขนาดวงกลมคงที่เสมอ)
  size?: 'sm' | 'md'
}

type ButtonProps<T extends ElementType = 'button'> = ButtonOwnProps & {
  as?: T
} & Omit<ComponentPropsWithoutRef<T>, keyof ButtonOwnProps | 'as'>

const PRIMARY_SIZE_CLASS = {
  sm: 'text-[11px] px-4 py-2',
  md: 'text-sm px-5 py-2.5',
} as const

// Button — ปุ่ม/ลิงก์ CTA กลาง ใช้ pattern polymorphic `as` เดียวกับ PremiumCard.tsx/GlassCard.tsx
// (as="a" หรือ as={Link} เวลาทำหน้าที่นำทางแทนการกระทำ) สโคปแรกคือปุ่ม CTA หลักในหน้า Dashboard
// (DashboardView.tsx, AICoachCompactCard.tsx) เท่านั้น — ยังไม่แตะปุ่มในหน้าอื่นของแอป
export default function Button<T extends ElementType = 'button'>({
  children,
  className = '',
  variant = 'primary',
  size = 'sm',
  as,
  style,
  ...rest
}: ButtonProps<T>) {
  const Comp = (as || 'button') as ElementType
  if (variant === 'icon') {
    return (
      <Comp
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${className}`}
        style={{ border: `1px solid ${withAlpha(COLORS.amber, '40')}`, ...style }}
        {...rest}
      >
        {children}
      </Comp>
    )
  }
  return (
    <Comp
      className={`inline-flex items-center justify-center gap-1.5 font-display tracked uppercase rounded-full active:scale-[0.99] transition disabled:opacity-50 ${PRIMARY_SIZE_CLASS[size]} ${className}`}
      style={{ background: AMBER_GRADIENT_CSS, boxShadow: AMBER_GLOW_SHADOW, color: NEUTRAL.onAmberText, ...style }}
      {...rest}
    >
      {children}
    </Comp>
  )
}
