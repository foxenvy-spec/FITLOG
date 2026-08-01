'use client'

import type { PointerEvent, ReactNode, ElementType, ComponentPropsWithoutRef } from 'react'
import {
  NOISE_BG,
  CARD_GRADIENT_CSS,
  CARD_INSET_SHADOW,
  CARD_BORDER_CSS,
  CARD_REFLECTION_CSS,
  CARD_CURVATURE_HIGHLIGHT_CSS,
  CARD_MULTI_REFLECTION_CSS,
  CARD_FLOAT_SHADOW,
} from '@/lib/theme'
import { hapticTap } from '@/lib/haptics'

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
  onPointerDown,
  style,
  ...rest
}: PremiumCardProps<T>) {
  const Comp = (as || 'div') as ElementType
  // Haptic Feedback (แตะการ์ด) — feature-detect ใน hapticTap เอง (no-op บน iOS Safari/เดสก์ท็อป) —
  // เรียกต่อจาก onPointerDown เดิมที่ผู้ใช้ component ส่งมา (ถ้ามี) ไม่ใช่แทนที่
  function handlePointerDown(e: PointerEvent) {
    hapticTap()
    ;(onPointerDown as ((e: PointerEvent) => void) | undefined)?.(e)
  }
  return (
    <>
      <Comp
        className={`premium-card relative overflow-hidden rounded-[24px] ${className}`}
        onPointerDown={handlePointerDown}
        // v2: เดิม `style={{...}} {...rest}` — ถ้า rest มี style ของตัวเอง (เช่น TodaysFocusCard/
        // TodaysWorkoutCompactCard ที่ส่ง padding/minHeight/clipPath มา) จะ "แทนที่" ทั้งก้อนแทนที่จะ
        // merge (JSX ให้ค่าซ้ำตัวหลังชนะทั้งอ็อบเจกต์เสมอ ไม่ใช่ shallow merge ทีละ key) ทำให้ไล่สี
        // การ์ด/border/boxShadow ของ PremiumCard หายไปเงียบๆ ทุกจุดที่ส่ง style เข้ามา (ตรวจพบจาก
        // getComputedStyle จริง: backgroundImage/boxShadow กลายเป็น "none" ทั้งที่ตั้งใจให้มี) —
        // ดึง style ออกมา destructure แยกแล้ว merge เอง กันปัญหานี้ทั้งไฟล์
        style={{
          // ไล่สีการ์ดเทาเย็น (CARD_GRADIENT_CSS) + rim light เฉียง 135deg มุมบนซ้าย (แสงสตูดิโอ) +
          // CARD_REFLECTION_CSS แถบสะท้อนแสงแนวนอนตรงจากขอบบน (brushed titanium) — สองชั้นนี้คนละมุม
          // แสง ซ้อนกันให้ผิวการ์ดดูเป็นโลหะขัดเงาจริง ไม่ใช่พลาสติกด้าน (matte) เหมือนก่อนหน้า
          //
          // v18: ฟีดแบ็ก "Card ยังดูเป็นการ์ด ไม่ใช่ Surface" — CARD_REFLECTION_CSS เป็นเส้นสะท้อนแสงตรง
          // ยาวทั้งเส้น (จำลองผิวเรียบสนิท) เพิ่ม CARD_CURVATURE_HIGHLIGHT_CSS (วงรีไฮไลต์แคบตรงกลางขอบบน)
          // ซ้อนบนสุดอีกชั้น จำลองผิวโลหะโค้งเล็กน้อยที่แสงจับเป็น "จุด" ไม่ใช่เส้นตรงทั้งเส้น
          // v20: "Titanium Reflection" — เพิ่ม CARD_MULTI_REFLECTION_CSS (เส้นทแยงสั้นๆ 3 เส้น ยาวไม่
          // เท่ากัน 2-3%) ซ้อนบนสุดอีกชั้น จำลองรอยขัดเงาหลายจุดที่แสงกระทบไม่พร้อมกัน ไม่ใช่รอยเดียวยาว
          // ต่อเนื่องแบบ CARD_REFLECTION_CSS อย่างเดียว
          backgroundImage: [
            CARD_MULTI_REFLECTION_CSS,
            CARD_CURVATURE_HIGHLIGHT_CSS,
            CARD_REFLECTION_CSS,
            'linear-gradient(135deg, rgba(255,255,255,.06) 0%, transparent 35%)',
            CARD_GRADIENT_CSS,
          ].join(', '),
          // ชั้นที่ 3 (CARD_REFLECTION_CSS) ขยายสูงกว่ากล่องจริง (150%) + ตั้ง backgroundPosition ไว้ —
          // ให้ :active เลื่อนตำแหน่งชั้นนี้ลงมานิดหน่อยได้ (ดู style jsx) จำลอง "แถบสะท้อนแสงขยับ" ตอน
          // แตะการ์ด แทนที่จะเป็นภาพนิ่งตลอด — ชั้นอื่น (multi reflection, curvature highlight, rim
          // light เฉียง, CARD_GRADIENT_CSS) คงขนาด/ตำแหน่งปกติไม่ขยับตาม
          // หมายเหตุ: CARD_MULTI_REFLECTION_CSS เป็นสตริงที่รวม 3 เกรเดียนต์ไว้ในตัวเองแล้ว (คั่นด้วย
          // comma) ดังนั้นนับเป็น 3 layer ไม่ใช่ 1 — background-size/position ด้านล่างต้องมี 3 ค่าแรก
          // ตรงกับ 3 layer นั้นด้วย ไม่งั้น CSS จะไล่ค่าผิดตำแหน่งไปให้ layer อื่นแทน (spec: ถ้าจำนวนค่า
          // น้อยกว่าจำนวน layer จะวนซ้ำ (cycle) ไม่ error แต่เลื่อนตำแหน่งผิดเงียบๆ)
          backgroundSize: 'auto, auto, auto, 100% 100%, 100% 150%, 100% 100%, 100% 100%',
          backgroundPosition: '0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%',
          // ขอบเทาเย็นจางๆ (CARD_BORDER_CSS) แทนขอบส้ม rgba(255,180,70,.12) เดิม — เดิมทำให้ทุกการ์ด
          // (รวม Today's Focus/Today's Workout ที่ไม่ใช่จุดเน้นสีส้มเสมอไป) มีขอบอมส้มตลอดเวลา
          border: `1px solid ${CARD_BORDER_CSS}`,
          // CARD_FLOAT_SHADOW (เบาบางกว่าเดิม 0 10px 30px rgba(0,0,0,.45)) ให้การ์ดดูลอยเหนือพื้นหลัง
          // แทนที่จะติดพื้น + CARD_INSET_SHADOW (highlight ขอบบน + เงาจมขอบล่าง, bevel แบบแผ่นโลหะจริง)
          // แสงส้มยังโผล่ได้ตอน :active เท่านั้น (ดู style jsx ด้านล่าง) ไม่ใช่ทุกการ์ดตลอดเวลา
          boxShadow: `${CARD_FLOAT_SHADOW}, ${CARD_INSET_SHADOW}`,
          transition: 'box-shadow 150ms ease, background-position 200ms ease',
          ...style,
        }}
        {...rest}
      >
        {/* เกรนผิวโลหะบางๆ (Dark Titanium เดียวกับหน้าเทมเพลต) — ชั้นแยกต่างหาก (ไม่รวมเข้า
            backgroundImage หลัก) เพราะต้องคุม opacity ของตัวเองอิสระจากพื้นเบส */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: NOISE_BG, opacity: 0.02, mixBlendMode: 'overlay' }}
          aria-hidden="true"
        />
        {children}
      </Comp>
      {/* glow เพิ่มเฉพาะตอนแตะ (:active) เท่านั้น ไม่ใช่ hover ถาวร — กันไม่ให้ล้นตาบนมือถือที่ไม่มี
          hover จริงอยู่แล้ว แค่ให้ความรู้สึก "ตอบสนอง" ตอนกดจริงๆ — เพิ่ม background-position เลื่อนชั้น
          CARD_REFLECTION_CSS ลงมา 8% (Material Animation: "Card เวลาแตะ Reflection ขยับนิดๆ") ชั้นอื่น
          ไม่ขยับตาม (ยังคง 0% 0% เหมือน default) */}
      <style jsx>{`
        .premium-card:active {
          box-shadow:
            0 10px 30px rgba(0, 0, 0, 0.45),
            0 0 30px rgba(255, 138, 0, 0.15),
            inset 0 1px rgba(255, 255, 255, 0.04);
          background-position: 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 8%, 0% 0%, 0% 0%;
        }
      `}</style>
    </>
  )
}
