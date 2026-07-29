'use client'

import type { ReactNode, ElementType, ComponentPropsWithoutRef } from 'react'

interface GlassCardOwnProps {
  children: ReactNode
  /** สีหลักของ glow ขอบ/เงา (hex) — ดีฟอลต์เป็นสีอำพันของแอป */
  glowColor?: string
  /** ทรงมน — 'full' สำหรับปุ่มวงกลม (เช่นกระดิ่งแจ้งเตือน), '2xl'/'xl'/'lg' สำหรับการ์ดสี่เหลี่ยมมน */
  rounded?: 'full' | '2xl' | 'xl' | 'lg'
  className?: string
}

type GlassCardProps<T extends ElementType = 'div'> = GlassCardOwnProps & {
  as?: T
} & Omit<ComponentPropsWithoutRef<T>, keyof GlassCardOwnProps | 'as'>

const ROUNDED = {
  full: 'rounded-full',
  '2xl': 'rounded-[20px]',
  xl: 'rounded-2xl',
  lg: 'rounded-xl',
} as const

// GlassCard — พื้นผิว "กระจกฝ้า" (glass/blur/glow แบบ Apple) ใช้ซ้ำได้ทุกจุดในแอปที่ต้องการลุคนี้
// เช่น ปุ่มกลม (กระดิ่งแจ้งเตือน) หรือการ์ดลอยตัว — ไม่ผูกกับ dashboard โดยเฉพาะ
//
// polymorphic ผ่าน prop `as` (ดีฟอลต์เป็น div, ส่ง as="button" เพื่อได้ปุ่มที่กดได้พร้อม type ที่ถูกต้อง)
export default function GlassCard<T extends ElementType = 'div'>({
  children,
  glowColor = '#E8A33D',
  rounded = '2xl',
  className = '',
  as,
  ...rest
}: GlassCardProps<T>) {
  const Comp = (as || 'div') as ElementType
  return (
    <Comp
      className={`relative backdrop-blur-md ${ROUNDED[rounded]} ${className}`}
      style={{
        border: '1.5px solid transparent',
        backgroundImage: `linear-gradient(180deg, #13233Acc, #08121Fcc), linear-gradient(135deg, ${glowColor}14, ${glowColor}40, ${glowColor}14)`,
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, border-box',
        boxShadow: `0 4px 14px rgba(0,0,0,.35), 0 0 16px ${glowColor}66`,
      }}
      {...rest}
    >
      {children}
    </Comp>
  )
}
