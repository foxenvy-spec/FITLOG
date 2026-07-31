'use client'

import type { ReactNode, ElementType, ComponentPropsWithoutRef } from 'react'

interface PremiumCardOwnProps {
  children: ReactNode
  className?: string
}

type PremiumCardProps<T extends ElementType = 'div'> = PremiumCardOwnProps & {
  as?: T
} & Omit<ComponentPropsWithoutRef<T>, keyof PremiumCardOwnProps | 'as'>

// PremiumCard — พื้นผิวการ์ดกลาง (ไล่สีเข้ม + ขอบเรืองแสงอำพันจางๆ + เงาหลายชั้น) แทนกล่องเรียบๆ
// (bg-surface border border-line/amber เดิม) ที่ใช้ซ้ำอยู่หลายการ์ดในหน้า Dashboard มือถือ — สโคปแรก
// คือการ์ดพวกนี้เท่านั้น (ไม่แตะเดสก์ท็อป/หน้าอื่น และไม่แตะ MetricCard ที่มีดีไซน์ premium ของตัวเอง
// อยู่แล้วซึ่งซับซ้อนกว่านี้ ผูกกับสีธีมต่อเมตริก) ใช้ pattern polymorphic `as` เดียวกับ GlassCard.tsx
// เพื่อรองรับทั้งการ์ดที่เป็น <div> เฉยๆ และการ์ดที่คลิกได้ทั้งใบ (as={Link})
export default function PremiumCard<T extends ElementType = 'div'>({
  children,
  className = '',
  as,
  ...rest
}: PremiumCardProps<T>) {
  const Comp = (as || 'div') as ElementType
  return (
    <>
      <Comp
        className={`premium-card relative overflow-hidden rounded-[24px] ${className}`}
        style={{
          backgroundImage: 'linear-gradient(180deg, #1A1B20, #121317)',
          border: '1px solid rgba(255,180,70,.12)',
          boxShadow: '0 10px 30px rgba(0,0,0,.45), 0 0 40px rgba(255,138,0,.06), inset 0 1px rgba(255,255,255,.04)',
          transition: 'box-shadow 150ms ease',
        }}
        {...rest}
      >
        {children}
      </Comp>
      {/* glow เพิ่มเฉพาะตอนแตะ (:active) เท่านั้น ไม่ใช่ hover ถาวร — กันไม่ให้ล้นตาบนมือถือที่ไม่มี
          hover จริงอยู่แล้ว แค่ให้ความรู้สึก "ตอบสนอง" ตอนกดจริงๆ */}
      <style jsx>{`
        .premium-card:active {
          box-shadow:
            0 10px 30px rgba(0, 0, 0, 0.45),
            0 0 30px rgba(255, 138, 0, 0.15),
            inset 0 1px rgba(255, 255, 255, 0.04);
        }
      `}</style>
    </>
  )
}
