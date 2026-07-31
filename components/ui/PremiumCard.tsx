'use client'

import type { ReactNode, ElementType, ComponentPropsWithoutRef } from 'react'
import { NOISE_BG } from '@/lib/theme'

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
          // เบสสีการ์ด #161616 ตาม Color token ใหม่ (เดิม #1A1B20→#121317 โทนเทาอมม่วง) — ไล่เฉดบางๆ
          // เข้ากว่าเล็กน้อยด้านล่างให้ยังมีมิติ ไม่ใช่สีตันแบนเดียว + rim light เฉียง 135deg มุมบนซ้าย
          // จำลองแสงสตูดิโอตกกระทบผิวโลหะ (เทคนิคเดียวกับหน้าเทมเพลต "Dark Titanium")
          backgroundImage: [
            'linear-gradient(135deg, rgba(255,255,255,.06) 0%, transparent 35%)',
            'linear-gradient(180deg, #1C1C1C, #161616)',
          ].join(', '),
          border: '1px solid rgba(255,180,70,.12)',
          // เพิ่ม inset เงาเข้มขอบล่าง (เดิมมีแค่ inset สว่างขอบบน) ให้ครบคู่ bevel แบบแผ่นโลหะจริง
          // (แสงจับขอบบน เงาจมขอบล่าง) แทนที่จะมีแค่ด้านเดียว
          boxShadow:
            '0 10px 30px rgba(0,0,0,.45), 0 0 40px rgba(255,138,0,.06), inset 0 1px rgba(255,255,255,.05), inset 0 -1px rgba(0,0,0,.4)',
          transition: 'box-shadow 150ms ease',
        }}
        {...rest}
      >
        {/* เกรนผิวโลหะบางๆ (Dark Titanium เดียวกับหน้าเทมเพลต) — ชั้นแยกต่างหาก (ไม่รวมเข้า
            backgroundImage หลัก) เพราะต้องคุม opacity ของตัวเองอิสระจากพื้นเบส */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: NOISE_BG, opacity: 0.05, mixBlendMode: 'overlay' }}
          aria-hidden="true"
        />
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
