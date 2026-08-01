'use client'

import Link from 'next/link'
import Image from 'next/image'
import { COLORS, FIRE_GRADIENT_CSS, NEUTRAL, TEXT, withAlpha, CARD_MULTI_REFLECTION_CSS, CARD_AMBIENT_SHADOW_CSS, CARD_FLOAT_SHADOW } from '@/lib/theme'
import { dashboardSpec } from '@/lib/dashboardSpec'
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
  const muscleLine = muscleGroups.slice(0, 2).join(' • ')

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
        // rim light สีอำพันบางๆ รอบการ์ด — ขอบเทาเย็นเดิมจาก PremiumCard เป็นค่าพื้นฐานของการ์ดทุกใบ
        // (ตั้งใจให้ไม่อมส้มทุกใบ ดู CARD_BORDER_CSS ใน lib/theme.ts) แต่การ์ดนี้มีรูป/ธีมไฟเป็นจุดเด่น
        // อยู่แล้ว (ปุ่ม arrow, progress bar, ไอคอนดัมเบลล้วนอำพัน) จึงเพิ่ม rim เฉพาะใบนี้แทนที่จะแก้
        // border กลางของ PremiumCard (จะกระทบการ์ดอื่นที่ไม่ต้องการโทนอำพันซ้ำ) — บางมากตามที่ขอ
        // ("แทบมองไม่เห็น") แค่ให้รู้สึกขอบมีไฟจางๆ ตอนเลื่อนผ่าน ไม่ใช่เส้นส้มชัดเจน
        //
        // v21: ค้นพบระหว่างตรวจ "Ambient Shadow" ที่ขอ — การ์ดนี้ส่ง boxShadow ของตัวเองมา ซึ่งไป
        // "แทนที่" boxShadow เริ่มต้นของ PremiumCard ทั้งก้อน (shallow merge ทับทั้ง key ไม่ใช่ merge
        // ทีละค่าใน string เดียวกัน) แปลว่าการ์ดนี้ไม่เคยมี CARD_FLOAT_SHADOW/เงาลอยจริงๆ เลยมาตลอด (มีแค่
        // เส้นขอบอำพัน+inset glow) เพิ่ม CARD_AMBIENT_SHADOW_CSS + CARD_FLOAT_SHADOW นำหน้า rim light เดิม
        // ให้การ์ดนี้ได้เงาลอย/เงาแวดล้อมเหมือนการ์ดอื่นด้วย ไม่ใช่แค่เส้นขอบเรืองแสงอย่างเดียว
        boxShadow: `${CARD_AMBIENT_SHADOW_CSS}, ${CARD_FLOAT_SHADOW}, 0 0 0 1px rgba(255,154,22,.14), inset 0 0 12px rgba(255,138,0,.05)`,
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
        {/* v16: Orange Reflection ลากเข้ามาทางซ้ายอีก ~25% ตามฟีดแบ็ก "รูปดัมเบลยังตัดกับพื้นหลังเกินไป
            ฝั่งขวา" — ต้องการให้ Ring → ข้อความ → รูปดัมเบล เชื่อมเป็นชิ้นเดียวกันชัดเจนขึ้น (เดิม v12
            เริ่มขึ้นที่ ~32%/50% ตอนนี้เริ่มเร็วขึ้นที่ ~7%/25% แต่ละสต็อปเลื่อนซ้ายมาประมาณ 25 จุดเท่ากัน
            หมด ความเข้มสูงสุดคงเดิมไม่เปลี่ยน) mixBlendMode: screen ผสมกับพื้นหลังเดิม ไม่ใช่ทาสีทับ */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, transparent 7%, rgba(255,138,0,.05) 25%, rgba(255,150,20,.1) 43%, rgba(255,164,40,.16) 60%, rgba(255,170,50,.2) 75%, rgba(255,170,50,.2) 100%)',
            mixBlendMode: 'screen',
          }}
        />
        {/* v19: ฟีดแบ็ก "ด้านซ้ายยังมืดไป อยากให้มี Orange Bloom วิ่งเข้ามาแล้วค่อย Fade จะเชื่อมกับ Ring
            และ Hero ด้านบนทันที" — เดิมความอุ่นทั้งหมดมาจากไล่สีแนวนอน (ขวา->ซ้าย) ซึ่งจางเกือบหมดแล้วตอน
            ถึงโซน badge/ข้อความฝั่งซ้าย ชั้นนี้เป็นวงรีแยกต่างหาก ยึดตำแหน่งใกล้ badge วงแหวน (มุมซ้ายบน)
            จำลองแสงจากวง Fitness Score ด้านบน Header ไหลต่อเนื่องลงมาถึงการ์ดนี้ ไม่ใช่แค่แสงจากรูปดัมเบล
            ฝั่งขวาอย่างเดียว — screen blend เหมือนชั้นอื่น ให้เชื่อมกันจริงไม่ใช่ทาสีทับ */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(ellipse 65% 90% at 10% 25%, rgba(255,142,20,.12), transparent 60%)',
            mixBlendMode: 'screen',
          }}
        />
        {/* v21: ฟีดแบ็ก "Card Reflection ผมอยากเพิ่ม Reflection แบบนี้ opacity 2% พอ" — การ์ดนี้ใช้
            PremiumCard เป็น wrapper ซึ่งมี CARD_MULTI_REFLECTION_CSS อยู่แล้วจาก v20 แต่รูปพื้นหลังเต็ม
            การ์ด (absolute inset-0 ด้านบน) วาดทับปิดมันหมดเงียบๆ (children วาดทีหลัง = อยู่บนสุดเสมอ) —
            เพิ่มชั้นเดียวกันตรงนี้แทน ให้เห็นจริงบนการ์ดใบนี้ด้วย ไม่ใช่แค่ทฤษฎีว่ามีอยู่ใน PremiumCard */}
        <div className="absolute inset-0" style={{ backgroundImage: CARD_MULTI_REFLECTION_CSS }} />
        {/* v21: ฟีดแบ็ก "Orange Highlight อยากเพิ่ม Light Sweep บางๆ วิ่งผ่าน Banner ช้าๆ ทุก 20 วินาที
            แทบไม่รู้สึกแต่ดูแพงมาก" — แถบแสงเฉียงกว้าง กวาดจากซ้ายไปขวาเต็มการ์ด รอบละ 20 วิ อัลฟาต่ำมาก
            (peak 6%) + screen blend ให้เห็นเป็นแค่ "แสงวาบผ่าน" ไม่ใช่แถบสีทึบ เคารพ prefers-reduced-motion
            (ปิด animation เหลือ opacity 0 นิ่งๆ) เหมือนแอนิเมชันอื่นในระบบนี้ */}
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
          {/* v21: "Orange Core" — ฟีดแบ็ก "Ring Icon ใน Banner ยังดูต่างจาก Ring Hero" — Hero Ring
              (FitnessScore.tsx) มีชั้น Fog/Bloom/Core อยู่หลังวงอยู่แล้ว badge เล็กในนี้ไม่มีเลย เพิ่ม
              glow อำพันชั้นเดียว (ไม่ใช่ 3 ชั้นแบบ Hero เพราะ badge เล็กกว่ามาก 76px vs 110px) ไว้หลังวง
              ให้รู้สึกว่าเป็น "แกนแสง" เดียวกับ Ring Hero ไม่ใช่ badge ลอยเดี่ยวๆ ไม่มีแสงรอบตัวเลย */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: dashboardSpec.workoutCard.ringSize * 1.6,
              height: dashboardSpec.workoutCard.ringSize * 1.6,
              background: `radial-gradient(circle, ${COLORS.amber}40, transparent 60%)`,
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
                glow/เงาที่ฝังอยู่ในตัวไอคอนเองชัดเจน (ที่ 24px เดิมมันบีบจนมัว มองไม่ออกเลยว่ามีวง) */}
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
          <p className="text-[11px] uppercase text-muted whitespace-nowrap" style={{ letterSpacing: '0.14em' }}>
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

          {muscleLine && (
            <p className="text-muted truncate" style={{ fontSize: 10, marginTop: 1 }}>
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
        .workout-banner-sweep {
          background: linear-gradient(115deg, transparent 40%, rgba(255, 255, 255, 0.06) 50%, transparent 60%);
          background-size: 300% 300%;
          background-position: -120% -120%;
          mix-blend-mode: screen;
          animation: workout-banner-sweep-move 20s linear infinite;
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
