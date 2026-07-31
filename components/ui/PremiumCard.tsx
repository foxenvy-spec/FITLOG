'use client'

import type { ReactNode, ElementType, ComponentPropsWithoutRef } from 'react'
import { NOISE_BG, CARD_GRADIENT_CSS, CARD_INSET_SHADOW, CARD_BORDER_CSS, CARD_REFLECTION_CSS, CARD_FLOAT_SHADOW } from '@/lib/theme'

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
          // ไล่สีการ์ดเทาเย็น (CARD_GRADIENT_CSS) + rim light เฉียง 135deg มุมบนซ้าย (แสงสตูดิโอ) +
          // CARD_REFLECTION_CSS แถบสะท้อนแสงแนวนอนตรงจากขอบบน (brushed titanium) — สองชั้นนี้คนละมุม
          // แสง ซ้อนกันให้ผิวการ์ดดูเป็นโลหะขัดเงาจริง ไม่ใช่พลาสติกด้าน (matte) เหมือนก่อนหน้า
          backgroundImage: [
            CARD_REFLECTION_CSS,
            'linear-gradient(135deg, rgba(255,255,255,.06) 0%, transparent 35%)',
            CARD_GRADIENT_CSS,
          ].join(', '),
          // ขอบเทาเย็นจางๆ (CARD_BORDER_CSS) แทนขอบส้ม rgba(255,180,70,.12) เดิม — เดิมทำให้ทุกการ์ด
          // (รวม Today's Focus/Today's Workout ที่ไม่ใช่จุดเน้นสีส้มเสมอไป) มีขอบอมส้มตลอดเวลา
          border: `1px solid ${CARD_BORDER_CSS}`,
          // CARD_FLOAT_SHADOW (เบาบางกว่าเดิม 0 10px 30px rgba(0,0,0,.45)) ให้การ์ดดูลอยเหนือพื้นหลัง
          // แทนที่จะติดพื้น + CARD_INSET_SHADOW (highlight ขอบบน + เงาจมขอบล่าง, bevel แบบแผ่นโลหะจริง)
          // แสงส้มยังโผล่ได้ตอน :active เท่านั้น (ดู style jsx ด้านล่าง) ไม่ใช่ทุกการ์ดตลอดเวลา
          boxShadow: `${CARD_FLOAT_SHADOW}, ${CARD_INSET_SHADOW}`,
          transition: 'box-shadow 150ms ease',
        }}
        {...rest}
      >
        {/* เกรนผิวโลหะบางๆ (Dark Titanium เดียวกับหน้าเทมเพลต) — ชั้นแยกต่างหาก (ไม่รวมเข้า
            backgroundImage หลัก) เพราะต้องคุม opacity ของตัวเองอิสระจากพื้นเบส */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: NOISE_BG, opacity: 0.01, mixBlendMode: 'overlay' }}
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
