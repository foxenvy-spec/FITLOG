'use client'

import type { PointerEvent, ReactNode, ElementType, ComponentPropsWithoutRef } from 'react'
import {
  NOISE_BG,
  CARD_GRADIENT_CSS,
  CARD_INSET_SHADOW,
  CARD_REFLECTION_CSS,
  CARD_CURVATURE_HIGHLIGHT_CSS,
  CARD_CORNER_GLEAM_CSS,
  CARD_MULTI_REFLECTION_CSS,
  CARD_AMBIENT_SHADOW_CSS,
  CARD_FLOAT_SHADOW,
  CNC_CORNER_CLIP_PATH_DEFAULT,
  TITANIUM_MESH_CSS,
} from '@/lib/theme'
import { hapticTap } from '@/lib/haptics'

interface PremiumCardOwnProps {
  children: ReactNode
  className?: string
  // v55: ฟีดแบ็ก "Texture (grain+mesh) ใช้ทุก Section เกิด Visual Noise — Hero/Important ได้ texture เต็มที่
  // ส่วน Secondary Cards ควรลดลง 30-50%" — ดีฟอลต์ false = พฤติกรรมเดิมทุกจุดที่ใช้ PremiumCard อยู่แล้วเป๊ะ
  // (ไม่กระทบจุดใช้อื่นทั้งแอปที่ไม่ได้ระบุ prop นี้) true = ลด opacity ของทั้งชั้น noise grain และชั้น mesh
  // ลงครึ่งหนึ่ง — ใช้กับการ์ดที่ถือว่า "รอง" เท่านั้น (จุดเรียกใช้ตัดสินเอง ไม่ใช่ default กลาง)
  reducedTexture?: boolean
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
  reducedTexture = false,
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
        className={`premium-card relative overflow-hidden rounded-card ${className}`}
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
          // v48: "Corner Gleam" — เพิ่ม CARD_CORNER_GLEAM_CSS เป็นชั้นบนสุด (ดึงมุมบนซ้ายให้มีประกายจาง
          // ~2% แยกจาก CARD_CURVATURE_HIGHLIGHT_CSS ซึ่งอยู่กลางขอบบนไม่ใช่มุม) — เพิ่ม 1 layer ทำให้ทุก
          // อาเรย์ background* ด้านล่างขยับ index ทั้งหมด (ดูหมายเหตุ CARD_MULTI_REFLECTION_CSS ด้านล่าง)
          backgroundImage: [
            CARD_CORNER_GLEAM_CSS,
            CARD_MULTI_REFLECTION_CSS,
            CARD_CURVATURE_HIGHLIGHT_CSS,
            CARD_REFLECTION_CSS,
            'linear-gradient(135deg, rgba(255,255,255,.06) 0%, transparent 35%)',
            CARD_GRADIENT_CSS,
          ].join(', '),
          // ชั้นที่ 4 (CARD_REFLECTION_CSS) ขยายสูงกว่ากล่องจริง (150%) + ตั้ง backgroundPosition ไว้ —
          // ให้ :active เลื่อนตำแหน่งชั้นนี้ลงมานิดหน่อยได้ (ดู style jsx) จำลอง "แถบสะท้อนแสงขยับ" ตอน
          // แตะการ์ด แทนที่จะเป็นภาพนิ่งตลอด — ชั้นอื่น (corner gleam, multi reflection, curvature
          // highlight, rim light เฉียง, CARD_GRADIENT_CSS) คงขนาด/ตำแหน่งปกติไม่ขยับตาม
          // หมายเหตุ: CARD_MULTI_REFLECTION_CSS เป็นสตริงที่รวม 3 เกรเดียนต์ไว้ในตัวเองแล้ว (คั่นด้วย
          // comma) ดังนั้นนับเป็น 3 layer ไม่ใช่ 1 — background-size/position ด้านล่างต้องมี 3 ค่าตรงกับ
          // 3 layer นั้นด้วย ไม่งั้น CSS จะไล่ค่าผิดตำแหน่งไปให้ layer อื่นแทน (spec: ถ้าจำนวนค่าน้อยกว่า
          // จำนวน layer จะวนซ้ำ (cycle) ไม่ error แต่เลื่อนตำแหน่งผิดเงียบๆ) — รวม corner gleam(1) +
          // multi-reflection(3) + curvature(1) + reflection(1) + rim light(1) + gradient(1) = 8 layer
          backgroundSize: 'auto, auto, auto, auto, 100% 100%, 100% 150%, 100% 100%, 100% 100%',
          backgroundPosition: '0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%',
          // v48: ฟีดแบ็ก "Border ทุก Card หนาเท่ากันหมด อยากให้ Outer Shadow ทำหน้าที่บอกขอบแทน Border
          // บางส่วน จะดูแพงกว่า" — ตัด `border: 1px solid CARD_BORDER_CSS` (เส้นกรอบสม่ำเสมอทั้ง 4 ด้าน)
          // ออกทั้งหมด ให้ CARD_AMBIENT_SHADOW_CSS/CARD_FLOAT_SHADOW (เงาลอย/แวดล้อมที่มีอยู่แล้ว) +
          // contact shadow ใหม่ด้านล่าง ทำหน้าที่บอกขอบการ์ดแทน — ผิวมองต่อเนื่องกับพื้นหลังมากขึ้น ขอบ
          // อ่านออกจากเงา/แสงตกกระทบ ไม่ใช่เส้นกรอบวาดทับ (CARD_INSET_SHADOW ยังให้ไฮไลต์มุมบนซ้ายอยู่)
          // v27: "Titanium Geometry" — ฟีดแบ็ก "Card ยัง Rounded Rectangle ธรรมดา อยากได้มุมตัดแบบ CNC
          // ทุก Card ให้เป็นลายเซ็นเดียวกันทั้งแอป" — ค่าเดียวกับที่ TodaysFocusCard.tsx ใช้อยู่ก่อนแล้ว
          // (มุมบนซ้ายตัด 18px มุมอื่นตัดเบา 4px) ย้ายมาเป็นดีฟอลต์กลางที่นี่แทน ให้การ์ดทุกใบที่ใช้
          // PremiumCard (Focus/Workout/AI Coach/Recommended Program/Streak ฯลฯ) ได้มุมตัดเดียวกันโดย
          // อัตโนมัติ — consumer ที่ส่ง clipPath ของตัวเองมาทาง prop `style` (เช่น TodaysFocusCard ซึ่ง
          // ตั้งค่าเดียวกันนี้อยู่แล้ว) ยังชนะได้ตามปกติเพราะ `...style` ยังวางท้ายสุดเหมือนเดิม ไม่กระทบ
          clipPath: CNC_CORNER_CLIP_PATH_DEFAULT,
          // CARD_FLOAT_SHADOW (เบาบางกว่าเดิม 0 10px 30px rgba(0,0,0,.45)) ให้การ์ดดูลอยเหนือพื้นหลัง
          // แทนที่จะติดพื้น + CARD_INSET_SHADOW (highlight ขอบบน + เงาจมขอบล่าง, bevel แบบแผ่นโลหะจริง)
          // แสงส้มยังโผล่ได้ตอน :active เท่านั้น (ดู style jsx ด้านล่าง) ไม่ใช่ทุกการ์ดตลอดเวลา
          // v21: เพิ่ม CARD_AMBIENT_SHADOW_CSS (เงากว้าง/นุ่ม/จางกว่า) ซ้อนก่อน CARD_FLOAT_SHADOW เดิม
          // (เทียบ contact shadow) ให้การ์ดมีทั้งเงาชิดขอบ + เงาแวดล้อมกว้างๆ แบบวางอยู่ในห้องจริง
          // v48: เพิ่ม contact shadow แคบๆ ท้ายสุด (0 0 0 1px เงาดำจาง ไม่ใช่ border) แทนที่เส้นกรอบเดิม —
          // ให้ขอบยังแยกจากพื้นหลังได้ชัดพอ แต่เป็น "เงา" ไม่ใช่ "เส้น" (blur 0 แต่สีเป็นเงาดำโปร่งแสง
          // ไม่ใช่สีขาว/เทาแบบ border เดิม จึงยังอ่านเป็นมิติความลึกไม่ใช่กรอบวาดทับ)
          boxShadow: `${CARD_AMBIENT_SHADOW_CSS}, ${CARD_FLOAT_SHADOW}, 0 0 0 1px rgba(0,0,0,.3), ${CARD_INSET_SHADOW}`,
          transition: 'box-shadow 150ms ease, background-position 200ms ease',
          ...style,
        }}
        {...rest}
      >
        {/* เกรนผิวโลหะบางๆ (Dark Titanium เดียวกับหน้าเทมเพลต) — ชั้นแยกต่างหาก (ไม่รวมเข้า
            backgroundImage หลัก) เพราะต้องคุม opacity ของตัวเองอิสระจากพื้นเบส
            v48b: บั๊ก — consumer ที่ส่ง `divide-y` มาทาง className (เช่น รายการ divide-y divide-white/5
            หลายจุดทั่วแอป) ทำให้ div ชั้นนี้ (เป็น sibling ตัวที่ 2 ของ Comp นับจาก div เกรนตัวแรก) โดน
            เลือกด้วย selector ของ divide-y (`:not([hidden]) ~ :not([hidden])`) ไปด้วย — ผลคือ children
            ตัวแรกสุด (แถวแรกของลิสต์) ก็โดนนับเป็น "ตัวที่ 3" (ไม่ใช่ตัวแรก) แล้วได้ border-top ที่ไม่ควรมี
            ขึ้นมาเงียบๆ (ตรวจพบจริงจาก getComputedStyle: แถวแรกมี borderTopWidth 1px ทั้งที่ควรเป็น 0)
            — ใส่ attribute `hidden` จริง (ไม่ใช่แค่ aria-hidden) ให้ selector ข้าม div นี้ไปเลย แล้ว
            override `display` ผ่าน style (ชนะกฎ UA stylesheet [hidden]{display:none} เสมอ เพราะ inline
            style ชนะทุก selector-based rule) กันไม่ให้ hidden attribute ทำให้เลเยอร์เกรนหายไปจริงๆ */}
        <div
          hidden
          className="absolute inset-0 pointer-events-none"
          // v22: ฟีดแบ็ก "Tiny Noise/Fine Brushed Texture เบามาก แทบมองไม่เห็น แต่เวลาถือมือถือจะรู้สึกว่า
          // เป็นวัสดุจริง" — ขยับจาก 0.02 (2%) เป็น 0.03 (3%) เล็กน้อย ยังอยู่ในเพดาน "แทบมองไม่เห็น" ตาม
          // ที่ขอ ไม่ใช่เพิ่มจนเห็นชัดเป็นลายกราฟิก
          style={{ display: 'block', backgroundImage: NOISE_BG, opacity: reducedTexture ? 0.015 : 0.03, mixBlendMode: 'overlay' }}
          aria-hidden="true"
        />
        {/* v27: "Titanium Mesh" — ลายไขว้ 2 ทิศละเอียด (12px, ~2%) แยกชั้นจาก noise ด้านบน (คนละเทคนิค:
            grain = feTurbulence สุ่ม, mesh = เส้นเรขาคณิตไขว้จริง) จำลองผิวโลหะกัด CNC เป็นตารางละเอียด
            v48b: hidden + display override เหตุผลเดียวกับ div เกรนด้านบน
            v55: reducedTexture ลด opacity ชั้นนี้ลงครึ่งหนึ่งด้วย (ดูคอมเมนต์ที่ prop) */}
        <div
          hidden
          className="absolute inset-0 pointer-events-none"
          style={{ display: 'block', backgroundImage: TITANIUM_MESH_CSS, opacity: reducedTexture ? 0.5 : 1 }}
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
          background-position: 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 8%, 0% 0%, 0% 0%;
        }
      `}</style>
    </>
  )
}
