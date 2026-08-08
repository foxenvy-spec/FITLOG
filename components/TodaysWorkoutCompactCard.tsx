'use client'

import Link from 'next/link'
import Image from 'next/image'
import {
  COLORS,
  FIRE_GRADIENT_CSS,
  NEUTRAL,
  TEXT,
  withAlpha,
  CARD_MULTI_REFLECTION_CSS,
  CARD_AMBIENT_SHADOW_CSS,
  CARD_FLOAT_SHADOW,
  DIAGONAL_TITANIUM_CSS,
  TITANIUM_MESH_CSS,
  DUST_PARTICLES_BG,
} from '@/lib/theme'
import { dashboardSpec } from '@/lib/dashboardSpec'
import { MUSCLE_GROUP_BODY_REGION, type MuscleGroup } from '@/lib/muscle-groups'
import AnimatedBarFill from './AnimatedBarFill'
import PremiumCard from './ui/PremiumCard'
import FitnessRing from './dashboard/FitnessRing'

interface TodaysWorkoutCompactCardProps {
  completed: number
  total: number
  href: string
  /** กลุ่มกล้ามเนื้อของโปรแกรมวันนี้ (จาก ProgramExercise.muscle_group) — โชว์สูงสุด 2 กลุ่มแรกคั่นด้วย "•" */
  muscleGroups?: string[]
}

// การ์ด "Today's Workout" — v10: 3 การปรับตามฟีดแบ็กหลังขึ้น production —
// (1) ไล่สีมืดทับรูปเบาลงมาก (94%->0% แบบ v9 ทึบเกินจนรู้สึกว่า "รูปไม่เต็มการ์ด") ให้เห็นเนื้อรูป/
//     texture ผ่านได้มากขึ้นทั่วทั้งใบ พึ่งความมืดตามธรรมชาติของรูป (พื้นดำ มีแค่ดัมเบล+glow สว่าง) แทน
//     สกริมทึบ
// (2) badge วงแหวนเปลี่ยนไปใช้ FitnessRing simple mode (ดู FitnessRing.tsx) — จาก ~7-8 เลเยอร์ (glow
//     ambient/bloom/reflection rim/highlight arc/light sweep/dots/tip) เหลือแค่ 3: Titanium Track ->
//     Progress Ring -> ไอคอนดัมเบล — เวอร์ชันเต็มที่ FitnessScore บน Header ใช้ไม่ถูกแตะ (badge เล็ก
//     46px vs ring header 80px ใหญ่กว่ามาก layer เยอะเลยดู "หนัก"/bevel จัดที่ขนาดเล็ก)
// (3) เพิ่ม rim light สีอำพันบางๆ รอบการ์ด (boxShadow เฉพาะการ์ดนี้ ไม่แตะ border กลางของ PremiumCard
//     ซึ่งตั้งใจให้เป็นกลาง/เทาเย็นสำหรับการ์ดอื่นๆ ที่ไม่ใช่ธีมไฟ)
//
// v8: รูปดัมเบลเป็นพื้นหลังเต็มการ์ด (full-bleed) แทนคอลัมน์แคบฝั่งขวา (27%)
// แบบ v7 ตามที่ขอ "อยากให้แสดงเต็มการ์ดเหมือนตัวอย่าง" (เทียบกับ mockup ที่ตัวรูป+ลายพื้นผิวคลุมทั้งใบ
// ไม่ใช่แค่โซนแคบๆ) — เปลี่ยนจากโครงสร้าง 2 คอลัมน์ (เนื้อหา flex-1 + รูป shrink-0) มาเป็นรูปวางเป็น
// absolute inset-0 ชั้นล่างสุด แล้ววางไล่สีมืด (ซ้ายทึบ -> ขวาจาง) ทับอีกชั้นให้ตัวหนังสืออ่านออกฝั่งซ้าย
// โดยยังเห็นรายละเอียดรูปฝั่งขวาชัดอยู่ — เนื้อหา (ring+ข้อความ) กับปุ่มลูกศรลอยอยู่ชั้นบนสุด (z-10)
// ทับพื้นหลังทั้งคู่ — dashboardSpec.workoutCard.imageWidthPct เดิมไม่ใช้แล้ว (รูปเต็มการ์ดไม่มีคอลัมน์
// แยกอีกต่อไป)
//
// v7: กลับไปมีบรรทัดกลุ่มกล้ามเนื้อ ("Chest • Triceps") + badge วงกลมมี arc progress รอบไอคอน (ใช้
// FitnessRing component เดียวกับ Fitness Score บน Header) แทนไอคอนแบนเดิม — การ์ดสูงขึ้น 92 -> 112px
// เพื่อให้มีที่พอ ปุ่มลูกศรวงกลมย้ายจากคอลัมน์ซ้ายไปลอยทับมุมล่างขวาของรูปแทน (ยกเลิกสเปกเดิม "Button
// should NOT overlap image" ของ v5 โดยตั้งใจ ยืนยันจากผู้ใช้แล้ว)
export default function TodaysWorkoutCompactCard({ completed, total, href, muscleGroups = [] }: TodaysWorkoutCompactCardProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
  // v21: ฟีดแบ็ก "ขา ซ้ำกับ DAY 5 — LOWER ที่อยู่ด้านบนแล้ว (Today's Focus card) ดูเหมือนข้อมูลซ้ำกัน" —
  // เดิม join ชื่อกลุ่มกล้ามเนื้อไทยดิบๆ (เช่น "ขา") ซึ่งเป็นคนละคำกับ "LOWER" บน Today's Focus (มาจาก
  // ชื่อโปรแกรมที่ผู้ใช้พิมพ์เอง) — แปลงเป็นหมวดร่างกายภาษาอังกฤษตัวพิมพ์ใหญ่แทน (ตารางเดียวกับที่
  // AICoachCompactCard ใช้อยู่แล้ว ไม่สร้างชุดใหม่) ให้เข้าชุดกับคำว่า LOWER/UPPER ด้านบนจริงๆ แทนที่จะ
  // เป็นแค่คำแปลตรงตัวคนละภาษา
  const muscleRegions = Array.from(
    new Set(muscleGroups.map((m) => MUSCLE_GROUP_BODY_REGION[m as MuscleGroup]).filter((r): r is string => !!r))
  )
  const muscleLine = muscleRegions.slice(0, 2).join(' • ').toUpperCase()

  return (
    <PremiumCard
      as={Link}
      href={href}
      // active:translate-y-[1px] ผสมกับ active:scale-[0.99] เดิม — การ์ดรู้สึก "กดจมลง" ตอนแตะ
      // (Card Press Effect) เหมือน TodaysFocusCard — ต้องมี `block` เสมอ: as={Link} เรนเดอร์เป็น <a>
      // ซึ่ง display เริ่มต้นเป็น inline (ไม่ใช่ block) และ min-height/height ไม่มีผลกับ inline element
      // ตามสเปก CSS เลย — ถ้าลืมใส่ block/flex การ์ดจะยุบเหลือแค่ความสูงจาก inline content จริง (~88px
      // แทนที่จะเป็น 112px ตาม spec) แล้วรูปพื้นหลัง (position:absolute; inset:0) ก็ไปวัดขนาดตามกล่อง
      // ที่ยุบผิดนั้นด้วย ทำให้ครอปรูปผิดสัดส่วน (บั๊กที่เจอจริงตอนขึ้น production — v9 fix)
      className="relative overflow-hidden block active:scale-[0.99] active:translate-y-[1px] transition"
      style={{
        padding: 0,
        minHeight: dashboardSpec.workoutCard.height,
        // v48: ฟีดแบ็ก "Glow ตอนนี้อยู่รอบ Card ทั้งใบ อยากย้ายไปอยู่ที่ Icon แทน การ์ดจะสะอาดขึ้น" — เดิม
        // ตรงนี้มี rim light สีอำพันรอบการ์ด (0 0 0 1px + inset glow) มาตั้งแต่ v9 (ดูประวัติ comment ที่
        // เคยอยู่ตรงนี้ผ่าน git log) ตัดทั้งคู่ออก เหลือแค่เงาลอย/แวดล้อมกลาง (ไม่มีสีธีม) — glow อำพันยกไป
        // อยู่ที่วง badge ดัมเบลแทน (ดู glow blob หลัง FitnessRing ด้านล่าง ซึ่งเข้มขึ้นชดเชย)
        boxShadow: `${CARD_AMBIENT_SHADOW_CSS}, ${CARD_FLOAT_SHADOW}`,
      }}
    >
      {/* พื้นหลังรูปเต็มการ์ด + ไล่สีมืดทับ — v11: asset ใหม่ (เดิม v10 ครอปไว้ตอนพื้นซ้ายเกือบดำสนิท
          ไม่มีลาย ตอนนี้ผู้ใช้ส่งรูปใหม่มาที่มีลายไทเทเนียม+แสงส้มกระจายเต็มทั้งภาพรวมถึงโซนซ้ายด้วย)
          ทำให้พื้นหลังทั้งใบสว่าง/มีลายรกขึ้นเยอะกว่าเดิมมาก — scrim บางแบบ v10 (55%->0%) ไม่พอจะให้
          ตัวหนังสือขาว/เหลืองอ่านออกอีกต่อไป (ทดสอบแล้วมองไม่เห็นตัวหนังสือเลยกับรูปใหม่) ต้องปรับให้เข้มขึ้น
          กว่าเดิมพอสมควร แต่ยังไม่เท่า v9 (94% ซึ่งบังลายจนดูเหมือนรูปว่าง) — จุดต่างจาก v9 คือรูปใหม่มีลาย
          เยอะพอที่จะโผล่ผ่าน scrim เข้มได้โดยไม่ดูว่างเปล่าเหมือนรูปเก่า */}
      <div className="absolute inset-0" aria-hidden="true">
        <Image src="/images/today-workout-bg-mobile.png" alt="" fill className="object-cover" style={{ objectPosition: '68% 55%' }} />
        {/* v14: สี scrim เปลี่ยนจาก rgb(13,14,16) เป็น rgb(20,20,20) — #141414 ตามที่ขอ "Hero Card
            background #141414 vs Background #0B0B0D ต่างกันประมาณ 8%" — เดิมสี scrim (13,14,16) ใกล้เคียง
            กับสีมืดสุดของพื้นหลังหน้าเว็บ (DASHBOARD_BG_CSS จบที่ #090909) มากจนการ์ดกับพื้นหลังกลืนกัน
            ไม่ลอยเด่นขึ้นมา ค่าใหม่สว่างกว่าเดิมเล็กน้อยพอให้แยกออกจากกันชัดเจน แต่ยังมืดพอให้ตัวหนังสือ
            อ่านออก (สัดส่วนความทึบ 0%/30%/50%/68%/84% เดิมทุกจุด ไม่เปลี่ยน แค่เปลี่ยนสีฐาน) */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(20,20,20,.82) 0%, rgba(20,20,20,.68) 30%, rgba(20,20,20,.4) 50%, rgba(20,20,20,.14) 68%, rgba(20,20,20,0) 84%)',
          }}
        />
        {/* v16/v29: Orange Reflection — ฟีดแบ็ก "Design Language: Titanium 70% / Matte Black 20% /
            Orange 10% — Orange มีหน้าที่ดึงสายตา ไม่ใช่ระบายพื้น" — สต็อปเดิมเข้มถึง .2 ทำให้สีส้มกลาย
            เป็น "พื้น" ของรูปแทนที่จะเป็นแค่จุดเน้น ลดทุกสต็อปลง ~40% (.05/.1/.16/.2 -> .03/.06/.1/.12) */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, transparent 7%, rgba(255,138,0,.03) 25%, rgba(255,150,20,.06) 43%, rgba(255,164,40,.1) 60%, rgba(255,170,50,.12) 75%, rgba(255,170,50,.12) 100%)',
            mixBlendMode: 'screen',
          }}
        />
        {/* v19/v29: Orange Bloom — ลดจาก .12 เหลือ .08 ตามสัดส่วนเดียวกับ Orange Reflection ด้านบน ให้
            รวมกันแล้วยัง "เชื่อม Ring กับดัมเบล" ได้แต่ไม่กลืนเป็นพื้นสีส้มทั้งการ์ด */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(ellipse 65% 90% at 10% 25%, rgba(255,142,20,.08), transparent 60%)',
            mixBlendMode: 'screen',
          }}
        />
        {/* v21: ฟีดแบ็ก "Card Reflection ผมอยากเพิ่ม Reflection แบบนี้ opacity 2% พอ" — การ์ดนี้ใช้
            PremiumCard เป็น wrapper ซึ่งมี CARD_MULTI_REFLECTION_CSS อยู่แล้วจาก v20 แต่รูปพื้นหลังเต็ม
            การ์ด (absolute inset-0 ด้านบน) วาดทับปิดมันหมดเงียบๆ (children วาดทีหลัง = อยู่บนสุดเสมอ) —
            เพิ่มชั้นเดียวกันตรงนี้แทน ให้เห็นจริงบนการ์ดใบนี้ด้วย ไม่ใช่แค่ทฤษฎีว่ามีอยู่ใน PremiumCard */}
        <div className="absolute inset-0" style={{ backgroundImage: CARD_MULTI_REFLECTION_CSS }} />
        {/* v25: ฟีดแบ็ก "อยากให้พื้นหลังต่อเนื่องกับ Titanium Ring เหมือน Ring ถูกกลึงจากแผ่นเดียวกับ
            Card" — ก่อนหน้านี้การ์ดนี้มีแค่ CARD_MULTI_REFLECTION_CSS (เส้นสะท้อนสั้นๆ 3 เส้นแยกกัน) ไม่ใช่
            ลายเฉียงต่อเนื่องแบบ DIAGONAL_TITANIUM_CSS ที่ Ring/พื้นหลังหน้าใช้ — เพิ่ม DIAGONAL_TITANIUM_CSS
            ตรงๆ (โทเคนเดียวกับที่ FitnessRing.tsx ใช้ทำ Brushed Metal บนวงเป๊ะๆ ไม่ใช่ค่าลอยใหม่ มุม 115deg
            เดียวกัน) ให้เส้นบนการ์ดกับเส้นบนวงเป็นลายต่อเนื่องเดียวกันจริงๆ ไม่ใช่แค่โทนสีคล้ายกัน */}
        {/* v29: ฟีดแบ็ก "Titanium 70% / Matte Black 20% / Orange 10% — ใช้ Brushed Titanium แทน Orange
            Fog ที่ตัดออก" — ขยับความเข้มขึ้นเล็กน้อย (.7 -> .85) ให้ผิวโลหะเด่นขึ้นมาแทนที่ปริมาณสีส้มที่
            ลดลง */}
        {/* v32: ฟีดแบ็ก "ลด texture หลังตัวหนังสือ ~20-30% เพื่อให้ text อ่านง่ายขึ้น" — ลายเฉียงชั้นนี้
            อยู่ใต้คอลัมน์ข้อความ (Today's Workout/0-6 Exercises/Lower Body) โดยตรง แม้มี scrim มืดทับอยู่
            แล้วก็ยังโผล่เป็น noise รบกวนการอ่านอยู่บ้าง ลด .85 -> 0.6 (-29%) */}
        <div className="absolute inset-0" style={{ backgroundImage: DIAGONAL_TITANIUM_CSS, opacity: 0.6 }} />
        {/* v28: "Brushed Titanium" เพิ่มเติม — TITANIUM_MESH_CSS โทเคนเดียวกับที่การ์ดอื่นทั่วแอปใช้ (ไขว้
            2 ทิศ 12px) ซ้อนกับลายเฉียงทิศทางเดียวเดิมด้านบน ให้ Workout Card มีลายตารางไทเทเนียมชุดเดียว
            กับการ์ดอื่นด้วย (เดิมมีแค่ลายเฉียงทิศทางเดียว ไม่มีลายตาข่าย) */}
        <div className="absolute inset-0" style={{ backgroundImage: TITANIUM_MESH_CSS }} />
        {/* v28/v29: ฟีดแบ็ก "Orange Fog ตอนนี้เยอะไป ลดเหลือ 10% แล้วใช้ Brushed Titanium แทน" — ลด
            alpha ลงเหลือเกือบครึ่งหนึ่งของเดิม (.1 -> .04) ให้เป็นแค่ "ไอความอุ่นบางๆ" ไม่ใช่หมอกเห็นชัด
            ผิวโลหะ (ลายเฉียง+ตาข่าย ด้านบน) รับหน้าที่เพิ่มมิติแทนตามที่ขอ */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(ellipse 90% 70% at 60% 40%, rgba(255,150,40,.04), transparent 65%)',
            filter: 'blur(10px)',
            mixBlendMode: 'screen',
          }}
        />
        {/* Particles — จุดลอยเล็กๆ กระจายไม่สม่ำเสมอ (ต่างจาก Dust ด้านล่างซึ่งเป็นฝุ่นละเอียดทั่วภาพ อันนี้
            คืออนุภาคเด่นเป็นจุดๆ ไม่กี่จุด ขนาด/ความสว่างไม่เท่ากัน) เพิ่มมิติความลึกให้อากาศรอบดัมเบลดูมีวัตถุ
            ลอยอยู่จริง ไม่ใช่แค่พื้นหลังนิ่งๆ */}
        {[
          { left: '38%', top: '18%', size: 2, opacity: 0.5 },
          { left: '82%', top: '22%', size: 1.5, opacity: 0.4 },
          { left: '90%', top: '62%', size: 2, opacity: 0.45 },
          { left: '30%', top: '70%', size: 1.5, opacity: 0.35 },
          { left: '52%', top: '80%', size: 1, opacity: 0.3 },
        ].map((p, i) => (
          <span
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              background: '#FFF4E0',
              opacity: p.opacity,
              boxShadow: '0 0 3px 1px rgba(255,244,224,.5)',
            }}
            aria-hidden="true"
          />
        ))}
        {/* v27/v29: "Edge Highlight" — ฟีดแบ็ก "Dumbbell ตอนนี้ Glow เยอะ ผมจะเหลือ Edge Highlight แบบนี้
            ให้ดูเหมือน Titanium จริง" — เดิมมี Rim Light + Lens Bloom + Spark 2 จุด แยกกัน 4 ชั้น (glow
            กระจายหลายจุด) รวมเหลือชั้นเดียว: แถบสว่างจ้าแคบๆ เฉียงตามขอบดัมเบล จำลองแสงสตูดิโอกระทบขอบผิว
            โลหะขัดเงาเป็น "เส้นคม" เส้นเดียว (ตัด Lens Bloom + Spark ทั้งสองจุดออกทั้งหมด — glow ควรอยู่ที่
            Ring เท่านั้น ไม่ใช่กระจายทุกจุดบนดัมเบลด้วย) */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(112deg, transparent 42%, rgba(255,244,224,.16) 50%, transparent 56%)',
            mixBlendMode: 'screen',
          }}
        />
        {/* Dust — ฝุ่นละเอียดฟุ้งในอากาศโดนแสงสตูดิโอ (DUST_PARTICLES_BG: feTurbulence + threshold สูง
            ให้เหลือแค่จุดกระจายห่างๆ ไม่ใช่เกรนทึบ) ทับทั้งการ์ด แต่จางมากจนแทบมองไม่เห็นเว้นแต่จ้องนาน */}
        <div
          className="absolute inset-0"
          style={{ backgroundImage: DUST_PARTICLES_BG, backgroundSize: '180px 180px', opacity: 0.09, mixBlendMode: 'screen' }}
        />
        {/* Floor Reflection — แถบสะท้อนแสงแนวนอนบางๆ ใกล้ขอบล่างสุด จำลองพื้นสตูดิโอมันวาวที่สะท้อนแสงอุ่น
            จากดัมเบล ต่างจาก Reflection sweep เดิม (แสงเฉียงวิ่งผ่านทั้งการ์ด) อันนี้อยู่นิ่งเฉพาะแถบล่างสุด
            v29: ลด alpha ลงเล็กน้อย (.08 -> .05) พร้อมกับ Orange Reflection/Bloom/Fog ด้านบน */}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: '18%',
            backgroundImage: 'linear-gradient(0deg, rgba(255,160,60,.05), transparent)',
            mixBlendMode: 'screen',
          }}
        />
        {/* v21/v29: ฟีดแบ็ก "Animation เหลือแค่ 3 อย่าง: Ring Glow (15-20s), Light Sweep (8-10s ครั้งเดียว),
            Particle" — Light Sweep เดิมกวาดทุก 20 วิ ช้าไปตามสเปคใหม่ ปรับเหลือ 9 วิ (อยู่ในช่วง 8-10 ที่
            ขอ) โครงสร้างเดิม (กวาดครั้งเดียวใน 35% แรกของรอบ แล้วค้างจนครบรอบ) ยังเหมือนเดิมทุกประการ */}
        <div className="workout-banner-sweep absolute inset-0 pointer-events-none" aria-hidden="true" />
      </div>

      {/* เนื้อหา — badge วงแหวนซ้าย + ข้อความในแถวเดียวกัน (จัดกึ่งกลางแนวตั้งด้วยกัน) ลอยทับพื้นหลังรูป
          ชั้นบน (z-10) — จำกัดความกว้างไว้ที่ ~68% กันไม่ให้ข้อความยาวๆ ล้ำเข้าไปทับปุ่มลูกศร/รายละเอียด
          รูปฝั่งขวา */}
      <div
        className="relative z-10 flex min-w-0 items-center gap-3"
        style={{ padding: dashboardSpec.workoutCard.padding, maxWidth: '68%' }}
      >
        <div className="relative shrink-0 flex items-center justify-center">
          {/* v21/v31: "Orange Core" — ฟีดแบ็ก "Ring Icon ใน Banner ยังดูต่างจาก Ring Hero" — Hero Ring
              (FitnessScore.tsx) มีชั้น Fog/Bloom/Core อยู่หลังวงอยู่แล้ว badge เล็กในนี้ไม่มีเลย เพิ่ม
              glow อำพันชั้นเดียว (ไม่ใช่ 3 ชั้นแบบ Hero เพราะ badge เล็กกว่ามาก 76px vs 110px) ไว้หลังวง
              ให้รู้สึกว่าเป็น "แกนแสง" เดียวกับ Ring Hero ไม่ใช่ badge ลอยเดี่ยวๆ ไม่มีแสงรอบตัวเลย —
              v31: ฟีดแบ็ก "เหลือแค่ 7 Animation ทั้งแอป — Hero Card: sweep 10s เท่านั้น" — ตัด "Ring Glow"
              หมุน (v29) ออกทั้งชั้น วงนี้กลับไปเป็นแกนแสงนิ่งเหมือนเดิม การ์ดนี้เหลือ animation เดียวคือ
              Light Sweep ที่พื้นหลังการ์ดด้านล่าง
              v48: ฟีดแบ็ก "Glow ย้ายจาก Card ไป Icon" — ตัด rim light อำพันรอบการ์ดทั้งใบออกแล้ว (ดู
              boxShadow ของ PremiumCard ด้านบน) ชดเชยด้วยการเพิ่มความเข้ม/ขนาดแกนแสงไอคอนนี้ขึ้น
              (40->55 alpha, 1.6x->1.85x ของ ringSize) ให้ไอคอนเป็นจุดที่ "มีไฟ" แทนขอบการ์ด */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: dashboardSpec.workoutCard.ringSize * 1.85,
              height: dashboardSpec.workoutCard.ringSize * 1.85,
              background: `radial-gradient(circle, ${COLORS.amber}55, transparent 60%)`,
            }}
            aria-hidden="true"
          />
          <FitnessRing
            value={pct}
            size={dashboardSpec.workoutCard.ringSize}
            strokeWidth={5}
            trackColor={NEUTRAL.ringTrack}
            simple
          >
            {/* ไอคอนใหญ่ขึ้นมาก (24 -> 56px) ตาม ringSize ที่ขยายจาก 46 -> 76 — ให้พอมีพื้นที่เห็นวงแหวน/
                glow/เงาที่ฝังอยู่ในตัวไอคอนเองชัดเจน (ที่ 24px เดิมมันบีบจนมัว มองไม่ออกเลยว่ามีวง)
                v48: ฟีดแบ็ก "Ring ใหญ่ไป ลด 10%" ตอนแรกเข้าใจผิดว่าเป็น ring ตรงนี้ ลองลดไปรอบนึงแล้วคืนกลับ
                (ดู comment ที่ dashboardSpec.workoutCard.ringSize) — ring ที่ฟีดแบ็กพูดถึงจริงๆ คือ
                GoalRing "ความพร้อม" บน Hero การ์ดของเดสก์ท็อป (DashboardView.tsx) คนละจุดกัน ring/ไอคอนนี้
                (มือถือ) จึงคงขนาดเดิมไว้ ไม่แตะ */}
            <span
              className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden"
              style={{ backgroundColor: withAlpha(COLORS.amber, '22') }}
              aria-hidden="true"
            >
              <Image
                src="/icons/today-workout-icon-dumbbell.png"
                alt=""
                width={56}
                height={56}
                className="w-full h-full object-cover"
                style={{ mixBlendMode: 'screen' }}
              />
            </span>
          </FitnessRing>
        </div>

        <div className="min-w-0 flex-1">
          {/* v20: ฟีดแบ็ก "TODAY'S WORKOUT อยากเพิ่ม Tracking อีกนิด ประมาณ +8~10 ให้ดู Luxury ขึ้น" —
              class .tracked กลาง (0.08em) ใช้ร่วมกับ label อื่นทั่วแอป ไม่แตะเพื่อไม่ให้กระทบจุดอื่น ตั้ง
              letter-spacing ตรงจุดนี้แทนที่จะเพิ่ม em สูงขึ้นเฉพาะป้ายนี้จุดเดียว — ทดสอบจริงแล้วคอลัมน์นี้
              กว้างแค่ ~131px (ถูกบีบด้วย maxWidth 68% ของการ์ด + ring badge + gap) ค่า 0.17em ตามที่ขอเป๊ะ
              ทำให้ตัดบรรทัดเป็น 2 บรรทัด ("TODAY'S" / "WORKOUT") ดันเนื้อหาอื่นเลื่อนลง — วัดหาค่าสูงสุดที่
              ยังอยู่บรรทัดเดียวจริงได้ 0.14em (ทดสอบทีละ step ด้วย getBoundingClientRect ในเบราว์เซอร์จริง)
              ใกล้เคียงที่ขอที่สุดโดยไม่ทำให้ layout พัง + เพิ่ม nowrap กันเผื่อกรณีฟอนต์โหลดช้า/fallback */}
          {/* v30: ฟีดแบ็ก "Typography Hierarchy — Today's Workout ควรเป็น Level 2 (จับคู่กับ Recovery/
              Body Fat) ไม่ใช่จางเท่า Level 3 (Personalized Fitness/timestamp)" — เดิม text-muted (#9498A0)
              เท่ากับ caption ทั่วไปในการ์ดอื่น เปลี่ยนเป็น TEXT.body (#BDBDBD สว่างกว่า) + font-medium ให้
              มีน้ำหนักมากกว่า Level 3 จริง — ไม่แตะขนาด (11px คงเดิม) เพราะคอลัมน์นี้แคบ (~131px จาก maxWidth
              68%) เคยวัดมาแล้วว่าขยับ tracking ขึ้นถึง 0.17em ก็ตัดขึ้น 2 บรรทัด (ดู comment เดิมด้านบน) —
              เพิ่มขนาดจะเสี่ยงบั๊กเดิมซ้ำ ใช้สี/น้ำหนักตัวอักษรสร้าง hierarchy แทน */}
          <p className="text-[11px] uppercase whitespace-nowrap" style={{ letterSpacing: '0.14em', color: TEXT.body, fontWeight: 500 }}>
            Today&apos;s Workout
          </p>

          {/* เศษส่วนตัวใหญ่ + "Exercises" ต่อท้ายบรรทัดเดียวกัน (ไม่กินพื้นที่แนวตั้งเพิ่ม) */}
          <div className="flex items-baseline gap-1">
            <span className="font-mono font-bold leading-none" style={{ fontSize: 24, color: TEXT.title }}>
              {completed}
            </span>
            <span className="text-muted leading-none" style={{ fontSize: 14 }}>
              /{total}
            </span>
            <span className="text-muted leading-none uppercase tracked" style={{ fontSize: 9 }}>
              Exercises
            </span>
          </div>

          {/* v30: ฟีดแบ็ก "เพิ่ม contrast ข้อความรองบนพื้น Titanium เล็กน้อย" — text-muted เดิม (#9498A0)
              จางไปในที่แสงน้อย ขยับเป็น #A8ACB4 เหมือนจุดอื่นในรอบนี้
              v22: ฟีดแบ็ก "เพิ่ม Contrast ของ Secondary Text อีก 10-15% โดยเฉพาะ Lower Body" (บรรทัดนี้
              คือ muscleLine ซึ่งตอนนี้แสดง "LOWER BODY" ตามที่ยกตัวอย่างพอดี) — #A8ACB4 -> #BCC1CA */}
          {muscleLine && (
            <p className="truncate" style={{ fontSize: 10, marginTop: 1, color: '#BCC1CA' }}>
              {muscleLine}
            </p>
          )}

          {/* progress bar — v2: เพิ่ม inner shadow เบาๆ (จมลงเล็กน้อย) + reflection บาง 2% ด้านบน ให้
              รางดูเป็นร่องโลหะจริง (ไม่ใช่แถบสีทึบแบน) */}
          <div
            className="h-1.5 rounded-full bg-surface2 overflow-hidden mt-1.5"
            style={{
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,.5)',
              backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,.02), transparent 60%)',
            }}
          >
            <AnimatedBarFill pct={pct} color={COLORS.amber} background={FIRE_GRADIENT_CSS} />
          </div>
        </div>
      </div>

      {/* ปุ่มลูกศรลอยทับมุมล่างขวาของการ์ด (บนรูปพื้นหลังเต็มการ์ดโดยตรง) — ไอคอนนี้เป็น badge วงกลม
          สมบูรณ์ในตัวอยู่แล้ว (มีวงกลม+glow ของตัวเอง) ไม่ต้องมี wrapper background/mixBlendMode เพิ่ม
          เหมือนไอคอนดัมเบล */}
      <span
        className="absolute z-10 bottom-2 right-2 w-8 h-8 rounded-full overflow-hidden"
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,.5)' }}
        aria-hidden="true"
      >
        <Image src="/icons/today-workout-icon-arrow.png" alt="" width={32} height={32} className="w-full h-full object-cover" />
      </span>
      <style jsx>{`
        /* v31: ฟีดแบ็ก "เหลือแค่ 7 Animation ทั้งแอป — Hero Card: sweep 10s" — ปรับจาก 9s เป็น 10s
           (Ring Glow ของการ์ดนี้ตัดออกแล้ว เหลือ Light Sweep เป็น animation เดียวของการ์ด) โครงสร้างเดิม
           ไม่เปลี่ยน (กวาดครั้งเดียวใน 35% แรกของรอบแล้วค้างจนครบรอบ ไม่ใช่กวาดวนซ้ำในรอบเดียว) */
        .workout-banner-sweep {
          background: linear-gradient(115deg, transparent 40%, rgba(255, 255, 255, 0.06) 50%, transparent 60%);
          background-size: 300% 300%;
          background-position: -120% -120%;
          mix-blend-mode: screen;
          animation: workout-banner-sweep-move 10s linear infinite;
        }
        @keyframes workout-banner-sweep-move {
          0% {
            background-position: -120% -120%;
          }
          35%,
          100% {
            background-position: 120% 120%;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .workout-banner-sweep {
            animation: none;
            background-position: 120% 120%;
          }
        }
      `}</style>
    </PremiumCard>
  )
}
