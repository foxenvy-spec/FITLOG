'use client'

import type { FitnessScoreResult } from '@/lib/fitnessScore'
import type { LatestPR, TopMuscle } from '@/lib/dashboardStats'
import { dashboardSpec } from '@/lib/dashboardSpec'
import { NOISE_BG, DIAGONAL_TITANIUM_CSS, CARD_REFLECTION_CSS } from '@/lib/theme'
import FitnessScore from './FitnessScore'
import NotificationButton from './NotificationButton'
import Greeting from './Greeting'
import SubtitleAccent from './SubtitleAccent'

interface HeaderProps {
  greetingText: string
  latestPR: LatestPR | null
  topMuscleThisWeek: TopMuscle | null
  displayName: string
  fitnessScore: FitnessScoreResult
}

// Header ของหน้า Dashboard (มือถือ) — v19: แก้บั๊กกระดิ่งทับวง Fitness Score — รอบก่อน (v18) แยก
// กระดิ่งออกมาเป็น absolute top-0 right-0 (44px) แต่คอลัมน์วงแหวนยังใช้ marginTop:8 เดิม (ตอนกระดิ่ง
// ยังอยู่ในโฟลว์) ทำให้วง (เริ่มที่ y=8) ทับซ้อนกับกระดิ่ง (y=0-44) จริง — แก้เป็น marginTop 52
// (=ความสูงกระดิ่ง 44px + ช่องไฟ 8px) ให้วงเริ่มหลังกระดิ่งจริงๆ ไม่ทับกันอีก — font ชื่อ/ระยะห่าง
// บรรทัดฝั่งซ้ายคงค่าจาก v18 ไว้ทั้งหมด (ผู้ใช้ระบุว่ารอบนี้ไม่ลด font เพิ่ม เน้นความสูง/padding/gap)
export default function Header({ greetingText, latestPR, topMuscleThisWeek, displayName, fitnessScore }: HeaderProps) {
  return (
    <div className="relative flex items-start justify-between gap-3 animate-rise">
      {/* Ambient light เฉพาะโซน Header — เดิมพื้นหลังทั้งหน้าตัดแสงส้มออกหมดแล้ว (เทาเย็นล้วน) แต่
          ผลคือ Header ไม่มีแสงสะท้อนเลย ดูแบนไปด้วย — แสงขาวเย็นจางมากๆ เฉพาะจุดนี้ ไม่ใช่สีส้ม จำลอง
          แสงตกกระทบผิวโลหะบริเวณหัวเรื่อง — ลดจาก 3% เหลือ 2% ตามที่ขอ (Soft Reflection ไม่ใช่ Glow
          แรงเกินไปจะเริ่มอ่านเป็น glow แทนที่จะเป็นแค่แสงสะท้อนเบาๆ) */}
      <div
        className="absolute -inset-x-4 -top-6 h-36 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(ellipse at 25% 0%, rgba(255,255,255,.02), transparent 65%)' }}
        aria-hidden="true"
      />

      {/* v17: ฟีดแบ็ก "Hero Area ยังดูแยก" — ฝั่งซ้าย (ชื่อ/greeting) กับฝั่งขวา (Fitness Score Ring)
          ดูเหมือนคนละโลก เพิ่มแสงส้มอุ่นจาง (Ambient Light) ยึดตำแหน่งใกล้ Ring (มุมขวา) ฟุ้งเข้ามาทาง
          ซ้ายเบามากๆ (peak 5%, screen blend เหมือนเทคนิคแสงส้มจุดอื่นในแอป) ให้สองฝั่งรู้สึกอยู่ในแสง
          เดียวกัน ไม่ใช่แค่แสงขาวเย็นด้านบน (ชั้นบนนี้) อย่างเดียว
          v17b: รอบแรกเช็คด้วย pixel sample พบว่าแสงจางหมดตั้งแต่ก่อนถึงกลางคอลัมน์ซ้าย ไม่ถึงคำว่า BANK
          จริง (ellipse แคบไป, จางหมดที่ 62% ของรัศมี) ขยาย ellipse แนวนอนจาก 55% เป็น 85% ของความกว้าง
          Header และเลื่อนจุด transparent ออกไปที่ 90% ของรัศมี ให้แสงไล่จางยาวพอจะแตะขอบคอลัมน์ซ้ายจริงๆ
          ตามที่ขอ "ฟุ้งเข้ามาด้านซ้ายประมาณ 10%" */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(ellipse 85% 70% at 88% 55%, rgba(255,142,20,.05), transparent 90%)',
          mixBlendMode: 'screen',
        }}
        aria-hidden="true"
      />
      <div className="min-w-0" style={{ paddingRight: 44 }}>
        <Greeting text={greetingText} />
        <p
          className="uppercase"
          style={{
            marginTop: 4,
            fontFamily: 'var(--font-oswald), var(--font-kanit)',
            // ชื่อ 54px (เทียบเท่า text-6xl ลด 10%, เดิม 60px) — ออกแบบเจาะจงสำหรับ iPhone 15/16 Pro
            // (393px) เท่านั้น ไม่ต้อง responsive-scale ตามจอใหญ่ เผื่อ clamp ขั้นต่ำไว้นิดเดียวกันจอแคบ
            // ผิดปกติ (< 360px) เท่านั้น
            fontSize: 'clamp(46px, 15vw, 54px)',
            fontWeight: 900,
            letterSpacing: '2px',
            lineHeight: 1,
            // v4: สต็อปเดิมยังอ่านเป็น "ตัวหนังสือสีขาว" มากกว่าโลหะ (โซนบนสุด/ล่างสุดสว่างเกินไป ไม่มี
            // จุดมืดจริงจังพอ) — เปลี่ยนตามค่าที่ขอเป๊ะ: บนสุด #DADADA (ไม่ใช่ขาวจ้า) → มืดสุด #6F6F72
            // ที่ 20% (เข้มกว่าเดิมชัดเจน) → กลับขึ้น #A9A9A9 ที่ 45% → #E6E6E6 ที่ 75% → ขาวจ้าที่สุด
            // (100%) อยู่ล่างสุดแทนบนสุด ให้จุดสว่างที่สุดของตัวอักษรอยู่คนละตำแหน่งกับจุดมืดสุด อ่านเป็น
            // ผิวโลหะสะท้อนแสงจริง ไม่ใช่ไล่จากขาวลงเทาทางเดียว
            //
            // v5: ยังเป็นไล่สีแนวตั้งทางเดียวเส้นเดียว — เพิ่มไล่สีแนวนอน (90deg) ตามที่ขอเป็นชั้นซ้อนบน
            // แล้วผสมด้วย backgroundBlendMode:'overlay' (ไม่ใช่วาดทับตรงๆ ซึ่งจะบังไล่สีแนวตั้งจนหายไป
            // เพราะสต็อปแนวนอนเป็นสีทึบไม่มี alpha) ให้เกิดลาย "ไขว้" สองทิศทางพร้อมกันแบบผิวโลหะขัดเงาจริง
            // ที่แสงสะท้อนไม่ได้มาจากทิศทางเดียว
            //
            // v6: การไขว้ 2 gradient ยังอ่านเป็น "ไล่เฉด" อยู่ดี ไม่ใช่ "โลหะ" — เพิ่มชั้นที่ 3 (บนสุด) เป็น
            // แถบสะท้อนแสงแนวนอนบางๆ (เข้ม→สว่างจาง 2%→เข้ม) พาดกลางตัวอักษรพอดี จำลองเส้นสะท้อนแสงคาดผ่าน
            // ผิวโลหะขัดเงาจริง (ไม่ใช่ไล่เฉดกว้างทั้งตัวอักษรแบบ 2 ชั้นล่าง) — blend เป็น normal (ไม่ใช่
            // overlay) เพราะพื้นเกือบทั้งหมดโปร่งใสอยู่แล้ว แค่แต้มสว่างจางๆ ตรงกลางเท่านั้น
            //
            // v7: ยังอ่านเป็น "Gradient Text" มากกว่า "Brushed Titanium" ต่างกันแค่นิดเดียว — เพิ่มชั้น
            // บนสุด NOISE_BG (เกรนเดียวกับที่ใช้กับผิวการ์ด/พื้นหลังทั้งแอป) ผสม overlay อัลฟาต่ำมากๆ
            // จำลองรอยขัดเงาละเอียดแบบไทเทเนียมแปรงจริง แทนที่จะเป็นผิวเรียบไล่สีล้วนๆ
            //
            // v16: ฟีดแบ็ก "BANK สว่างเกินทุกอย่าง สายตาไปที่ชื่อก่อน Fitness Score" — ชื่อควรเป็นแค่
            // Branding ไม่ใช่ Hero ของหน้า เพิ่มลายเฉียงไทเทเนียม (DIAGONAL_TITANIUM_CSS) เป็นอีกชั้น
            // ผสม overlay (ให้ผิวตัวอักษรมีลายเดียวกับพื้นหลัง/การ์ดทั้งแอป) + ลด brightness ของทั้งบล็อก
            // ด้วย filter (ดูด้านล่าง) แทนการลดสี stop ทีละจุด เพื่อคุมความสว่างโดยรวมได้ตรงเป้าหมายกว่า
            //
            // v17: ฟีดแบ็ก "ยังเป็นสีขาวล้วน ยังไม่เข้าธีม Titanium" — ต้นเหตุจริงคือสต็อปสีฐาน (ชั้นล่างสุด)
            // เดิมจบที่ #FFFFFF เต็ม 100% (ขอบล่างสุดของตัวอักษร ซึ่งเป็นพื้นที่เห็นชัดมากสำหรับฟอนต์ตัวใหญ่)
            // filter brightness(.82) ลดความสว่างรวมแต่ยังอ่านเป็น "ขาวถูกหรี่" ไม่ใช่ "โลหะ" — ออกแบบสต็อปสี
            // ใหม่ทั้งหมดเป็นแบบ มืด→สว่าง→มืด (ขอบบน/ขอบล่างมืดลง จุดกึ่งกลางสว่างสุดแต่ไม่ใช่ขาวจ้า #FFFFFF)
            // จำลองแท่งโลหะขัดเงาโค้งที่แสงจับกลางแท่งแล้วมืดลงที่ขอบทั้งสองด้าน แก้ทั้ง "Vertical Reflection"
            // (แสงจับกลาง) และ "ขอบมืดลงเล็กน้อย" (ขอบบน/ล่างมืดกว่าเดิม) ในสต็อปเดียวกัน + เพิ่ม
            // CARD_REFLECTION_CSS เป็นชั้นแยกต่างหาก (โทเคนเดียวกับที่การ์ดทุกใบใช้ ไม่ใช่ค่าลอยใหม่) ให้ตัว
            // อักษรใช้ "แสงสะท้อนแนวตั้ง" ภาษาเดียวกับผิวการ์ดทั้งแอปจริงๆ ตามที่ขอ (Consistency)
            backgroundImage: [
              DIAGONAL_TITANIUM_CSS,
              NOISE_BG,
              CARD_REFLECTION_CSS,
              'linear-gradient(180deg, transparent 0%, transparent 42%, rgba(255,255,255,.02) 50%, transparent 58%, transparent 100%)',
              'linear-gradient(90deg, #D2D2D2, #A8A8A8, #DADADA, #7C7C7C)',
              'linear-gradient(180deg, #6E7074 0%, #B7B8BB 15%, #E4E4E4 45%, #A8A9AC 72%, #5A5C60 100%)',
            ].join(', '),
            backgroundBlendMode: 'overlay, overlay, normal, normal, overlay, normal',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            // เงาเข้มขึ้นเล็กน้อย (.5 -> .6) ให้ตัวอักษรดูจมสลักลงในผิวโลหะ (inner-shadow จำลอง) ชัดขึ้น —
            // v16: เพิ่ม brightness(.82) นำหน้า (ลดความสว่างโดยรวมของทั้งบล็อกลง ~18% ตามที่ขอ "100% ->
            // 82%") ให้ Score Ring เด่นกว่าชื่อ ไม่ใช่ให้ชื่อสว่างจ้าแย่งซีนก่อน
            filter: 'brightness(.82) drop-shadow(0 2px 1px rgba(0,0,0,.6)) drop-shadow(0 1px 0 rgba(255,255,255,.14))',
            // text-shadow เพิ่มเติม (แยกจาก filter:drop-shadow ด้านบน) — ไฮไลต์เส้นบางสว่างขอบบนตัวอักษร
            // (rgba ขาว 15% -> 20% ตาม "Metallic Highlight" ที่ขอเพิ่ม) + เงาฟุ้งนุ่มด้านล่าง (ไม่ใช่เงา
            // คมชัด) ให้ตัวอักษรดูมีความหนา/ลอยเหนือพื้นหลังเล็กน้อย ใช้ได้พร้อมกับ background-clip:text
            // เพราะ text-shadow วาดตามรูปทรงตัวอักษรจริง ไม่สนใจสี fill (ซึ่งตอนนี้ตั้งเป็น transparent)
            textShadow: '0 1px 0 rgba(255,255,255,.20), 0 10px 20px rgba(0,0,0,.35)',
          }}
        >
          {displayName}
        </p>

        <p className="tracked text-muted whitespace-nowrap" style={{ marginTop: 7, fontSize: 11 }}>
          Personalized Fitness
        </p>
        <SubtitleAccent />

        <p className="text-ink" style={{ marginTop: 7, fontSize: 13 }}>
          วันนี้พร้อมสำหรับการออกกำลังกาย 💪
        </p>
      </div>

      {/* กระดิ่งแจ้งเตือน — ลอยมุมขวาบนอิสระ ไม่กินพื้นที่ในโฟลว์แนวตั้งของคอลัมน์ขวาอีกต่อไป */}
      <div className="absolute top-0 right-0">
        <NotificationButton latestPR={latestPR} topMuscleThisWeek={topMuscleThisWeek} />
      </div>

      <div className="flex flex-col items-end shrink-0" style={{ marginTop: 52 }}>
        {/* วง Fitness Score — ขนาดมาจาก dashboardSpec.header.scoreRingSize (90px) แหล่งความจริงเดียว
            แทนตัวเลขลอยในไฟล์นี้ — FitnessRing/FitnessScore สเกล stroke/font ภายในตาม size prop เอง */}
        <FitnessScore score={fitnessScore} size={dashboardSpec.header.scoreRingSize} />
      </div>
    </div>
  )
}
