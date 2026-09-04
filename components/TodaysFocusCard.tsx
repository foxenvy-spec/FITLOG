'use client'

import Link from 'next/link'
import Image from 'next/image'
import { cncCornerClipPath } from '@/lib/theme'
import { dashboardSpec } from '@/lib/dashboardSpec'
import { describeMuscleFocus, dominantMuscleGroup, formatRelatedGroups, type MuscleGroup } from '@/lib/muscle-groups'
import PremiumCard from './ui/PremiumCard'

interface TodaysFocusCardProps {
  /** ชื่อโปรแกรมจริงของวันนี้ (scheduledDay.title) ถ้ามี — มาก่อนเสมอ */
  workoutTitle: string | null
  /** fallback ตอนไม่มีโปรแกรมตั้งไว้จริง — ชุดเดียวกับที่ AICoachCompactCard ใช้ (data.muscleRecommendation)
   * ใช้ describeMuscleFocus() ตัวเดียวกันแปลงเป็น region+relatedGroups ให้สองการ์ดพูดตรงกันเป๊ะ แทนที่จะ
   * โชว์แค่ muscleGroup ดิบๆ ("อก") ในขณะที่ AI Coach ด้านล่างโชว์ "UPPER BODY / อก • ไหล่ • แขน" */
  muscleRecommendation: { muscleGroup: string } | null
  /** ท่าตามแผนจริงของวันนี้ (data.todayExercises) — ใช้หากล้ามเนื้อที่มีท่ามากที่สุด (dominantMuscleGroup)
   * เพื่อเติม "หมวดร่างกาย" นำหน้ารายละเอียดในวงเล็บของ workoutTitle เช่น "Day 4 — Upper (Volume)" เดิม
   * โชว์บรรทัดรองแค่ "Volume" เฉยๆ (ฟีดแบ็ก "Volume ไม่ได้บอกว่าวันนี้เน้นอะไร ทั้งที่ตัวบรรทัดหลักบอกแล้วว่า
   * Day 4 — Upper") — เติม region จริงจากท่าที่ตั้งไว้จริงนำหน้า ("Upper Body • Volume") ให้บรรทัดรองมี
   * ความหมายในตัวเองโดยไม่ต้องเดา ไม่ระบุ = พฤติกรรมเดิมทุกประการ (เผื่อจุดอื่นเรียกใช้การ์ดนี้) */
  todayExercises?: { muscle_group: string | null }[]
  /** true เมื่อวันนี้เป็น Rest Day จริง (มีโปรแกรมอยู่แล้วแต่ไม่มีคิววันนี้ — workoutCardVariant==='restDay'
   * ใน MobileDashboardView.tsx ค่าเดียวกับที่ TodaysWorkoutEmptyCard ใช้ตัดสินใจ) — ตัด workoutTitle/
   * muscleRecommendation ทิ้งไปเลยตอนนี้จริง แทนที่จะโชว์ "UPPER BODY" ต่อไปเหมือนไม่มีอะไรเกิดขึ้น
   * (ฟีดแบ็ก "REST DAY กับ UPPER BODY ไม่ควรเกิดพร้อมกัน — Today's Focus ต้องเปลี่ยนตาม Rest State") */
  isRestDay?: boolean
  href: string
}

// ชื่อโปรแกรม (scheduledDay.title) เป็นข้อความอิสระที่ผู้ใช้พิมพ์เอง (เช่น "Day 5 — Lower
// (Hamstring/Glute)") ไม่มีฟิลด์กล้ามเนื้อแยกต่างหากใน ProgramDay (lib/types.ts) ให้ดึงมาแสดงบรรทัด 2
// ตรงๆ — เดิม label ยาวๆ แบบนี้โดน `truncate` (1 บรรทัด + ...) ตัดจนอ่านไม่รู้เรื่อง ("DAY 5 — LOWER
// (HAMSTRING/GLUT...") ถ้าเจอวงเล็บ แยกเป็น 2 บรรทัดแทน: บรรทัดหลัก (ก่อนวงเล็บ) + บรรทัดรายละเอียด
// (ในวงเล็บ, "/" แทนด้วย " • ") — ถ้าไม่มีวงเล็บเลย (label สั้น/ไม่มีรายละเอียดเพิ่ม) แสดงบรรทัดเดียว
// เหมือนเดิมทุกประการ ไม่กระทบ
export function splitTitleDetail(text: string): { main: string; detail: string | null } {
  const openIdx = text.indexOf('(')
  if (openIdx === -1) return { main: text, detail: null }
  const closeIdx = text.lastIndexOf(')')
  const main = text.slice(0, openIdx).trim() || text
  const inner = closeIdx > openIdx ? text.slice(openIdx + 1, closeIdx) : text.slice(openIdx + 1)
  const detail = inner.replace(/\//g, ' • ').trim()
  return { main, detail: detail || null }
}

// "Today's Focus" ตามมอคอัพ — ใช้ workoutTitle (โปรแกรมที่ตั้งไว้วันนี้) ถ้ามี ไม่งั้น fallback ไปกล้ามเนื้อ
// ที่แนะนำวันนี้ (muscleRecommendation) ผ่าน describeMuscleFocus() เดียวกับที่ AICoachCompactCard ใช้ —
// เดิม fallback แสดงแค่ muscleGroup ดิบๆ ("อก") ทำให้ดูไม่ตรงกับ AI Coach ด้านล่างที่โชว์ "UPPER BODY /
// อก • ไหล่ • แขน" จากข้อมูลชุดเดียวกันเป๊ะ — ฟีดแบ็ก "Today's Focus คือ อก หรือ Upper Body?"
//
// v2: isRestDay มาก่อนทุกอย่าง — เดิม muscleRecommendation คำนวณจาก recovery % ล้วนๆ ไม่รู้จัก concept
// "วันนี้พัก" เลย ทำให้ Today's Focus ยังโชว์ "UPPER BODY" ต่อไปแม้ Today's Workout จะบอก "REST DAY" แล้ว
// (ฟีดแบ็ก "REST DAY กับ UPPER BODY ไม่ควรเกิดพร้อมกัน")
export default function TodaysFocusCard({ workoutTitle, muscleRecommendation, isRestDay = false, href, todayExercises = [] }: TodaysFocusCardProps) {
  const mg = muscleRecommendation?.muscleGroup as MuscleGroup | undefined
  const { main, detail: rawDetail } = isRestDay
    ? { main: 'Recovery Day', detail: 'Rest • Mobility' }
    : workoutTitle
      ? splitTitleDetail(workoutTitle)
      : mg
        ? (() => {
            const focus = describeMuscleFocus(mg)
            return { main: focus.region, detail: formatRelatedGroups(focus.relatedGroups) }
          })()
        // ฟีดแบ็ก "'ยังไม่ได้ตั้งโปรแกรม' อ่านยากกว่า 'ยังไม่มี Workout วันนี้'" (ตัวเดียวกับ DashboardView.tsx)
        : { main: 'ยังไม่มี Workout วันนี้', detail: null }

  // เติม "หมวดร่างกาย" นำหน้ารายละเอียดในวงเล็บของ workoutTitle เท่านั้น (rawDetail ที่มาจาก splitTitleDetail)
  // ไม่แตะ path ของ Rest Day/muscleRecommendation fallback ด้านบน (มี region ของตัวเองอยู่แล้วในตัว)
  const todayDominantMg = workoutTitle && !isRestDay ? dominantMuscleGroup(todayExercises) : null
  const todayRegion = todayDominantMg ? describeMuscleFocus(todayDominantMg).region : null
  const detail = rawDetail && todayRegion ? `${todayRegion} • ${rawDetail}` : rawDetail
  return (
    <PremiumCard
      as={Link}
      href={href}
      // active:translate-y-[1px] ผสมกับ active:scale-[0.99] เดิม (Tailwind ประกอบ transform เดียวกัน
      // จาก --tw-translate-y/--tw-scale-x/y ร่วมกัน) ให้การ์ดรู้สึก "กดจมลง" จริงๆ ตอนแตะ ไม่ใช่แค่
      // ย่อขนาดเฉยๆ (Card Press Effect ตามที่ขอ)
      className="flex items-center justify-between gap-3 active:scale-[0.99] active:translate-y-[1px] transition"
      style={{
        // padding/ความสูงจาก dashboardSpec.focusCard (16px / 74px) — ลดลงจากรอบก่อน (18px / 88px)
        // ตามที่ขอ "reduce card padding" + ความสูงเป้าหมายใหม่
        padding: dashboardSpec.focusCard.padding,
        minHeight: dashboardSpec.focusCard.height,
        // v27: มุมตัด (CNC_CORNER_CLIP_PATH_DEFAULT) ย้ายไปเป็นดีฟอลต์กลางของ PremiumCard เองแล้ว (ทุก
        // การ์ดตัดมุมเดียวกันหมดตามฟีดแบ็ก "ทุก Card คนจะจำได้เลย") ค่าที่การ์ดนี้เคย hardcode ไว้ตรงกับ
        // ดีฟอลต์ใหม่เป๊ะอยู่แล้ว จึงตัด override ตรงนี้ทิ้งได้เลย ไม่ต้องประกาศซ้ำ
      }}
    >
      {/* v30: ฟีดแบ็ก "สีส้มควรหายากขึ้น — Orange = Action/Energy เท่านั้น (Start/Progress/Active/
          คำแนะนำสำคัญ) ส่วนที่ไม่ต้องการ action ให้กลับไปใช้ Titanium/Gray/White" — การ์ดนี้เป็นแค่ป้าย
          บอกชื่อโปรแกรมวันนี้ ไม่ใช่ปุ่ม action ไม่ใช่คำแนะนำ — เส้นไฮไลต์มุมตัด (เดิมสีอำพัน rgba(255,
          180,90,.55)) เปลี่ยนเป็นสีขาวกลาง (Titanium) แทน ให้เหลือแต่ Today's Workout/ปุ่ม Start เท่านั้น
          ที่ยังเป็นสีส้ม */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 26,
          height: 1.5,
          top: 9,
          left: 9,
          transform: 'translate(-50%, -50%) rotate(45deg)',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.4), transparent)',
        }}
        aria-hidden="true"
      />
      {/* v25/v28: ฟีดแบ็ก "ฝั่งซ้าย-ขวาน้ำหนักยังไม่เท่ากัน" (v25) แล้วรอบนี้ "Focus Card อยากให้เหมือน
          Mission Card ของทหาร" (v28) — เพิ่ม Reflection อีกนิด (.045 -> .06) เป็นส่วนหนึ่งของชุด CNC/
          Titanium Layers/Energy Line ด้านล่าง ให้ผิวการ์ดสว่างสมดุลกับเส้น/ชั้นที่เพิ่มเข้ามาใหม่ */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(115deg, transparent 55%, rgba(255,255,255,.06) 68%, transparent 82%)' }}
        aria-hidden="true"
      />
      {/* v29: ฟีดแบ็ก "Hero Card ควรมีแค่ใบเดียว — Focus Card กับ Today's Workout ใช้โทนส้มใกล้กันเกินไป
          แข่งกันเอง Focus Card → Titanium ล้วน + เส้น Orange บางๆ เหมือนแผง CNC, Today's Workout → Hero
          ใบเดียวที่ได้ Glow/Motion มากกว่าใบอื่น" — ตัด "Energy Line" (เส้นเรืองแสงหายใจที่ขอบล่าง จาก v28)
          ออกทั้งหมด เพราะเป็น Motion ที่ควรอยู่แค่การ์ด Hero ใบเดียว เหลือ CNC seam + Titanium Layers
          (โครงสร้าง/ไม่ใช่สีส้ม) ไว้ตามเดิม ให้การ์ดนี้เป็น "Titanium ล้วน" นิ่งๆ จริงๆ + เส้นสีส้มบางๆ
          เส้นเดียว (มุมตัดด้านบน) ไม่มีอะไรเรืองแสง/เคลื่อนไหวแข่งกับ Hero */}
      <div
        className="absolute pointer-events-none"
        style={{ top: 10, bottom: 10, right: 30, width: 1, background: 'rgba(255,255,255,.14)' }}
        aria-hidden="true"
      />
      <div
        className="absolute pointer-events-none"
        style={{ top: 10, bottom: 10, right: 31, width: 1, background: 'rgba(0,0,0,.35)' }}
        aria-hidden="true"
      />
      <div
        className="absolute pointer-events-none"
        style={{
          inset: 5,
          clipPath: cncCornerClipPath('tl', 12, 3),
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.09), inset 0 1px 0 0 rgba(255,255,255,.06)',
        }}
        aria-hidden="true"
      />
      <div className="flex items-center gap-3 min-w-0">
        {/* กลับไปใหญ่ขึ้น (24px -> 36px) ตามที่ยืนยันทิศทางแล้ว — เดิมย่อลงไปรอบก่อนหน้า —
            ไอคอนเป้าที่ผู้ใช้สร้างเอง แทนอีโมจิ 🎯 เดิม — รูปมีพื้นวงกลมดำของตัวเองติดมาด้วย (ไม่ใช่
            พื้นโปร่งใส) ทำให้ดูเหมือนกรอบดำทับอยู่บนวงพื้นหลังสีอำพัน ใช้ mixBlendMode: screen (เทคนิค
            เดียวกับ glow ทุกจุดใน Header.tsx/HeroEnergyWave.tsx) ให้พื้นดำเกือบสนิทของรูปนี้ "หายไป"
            กลืนกับพื้นหลังมืดของวง เหลือแค่ไอคอนเรืองแสงจริงๆ */}
        {/* v30: ไอคอนพื้นวงกลม เดิมอำพัน (withAlpha(COLORS.amber,'22')) — เปลี่ยนเป็นเทากลาง (Titanium)
            เหตุผลเดียวกับเส้นมุมตัดด้านบน (การ์ดนี้ไม่ใช่ action) */}
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
          style={{ backgroundColor: 'rgba(255,255,255,.08)' }}
          aria-hidden="true"
        >
          <Image
            src="/icons/today-focus.png"
            alt=""
            width={36}
            height={36}
            className="w-full h-full object-cover"
            style={{ mixBlendMode: 'screen' }}
          />
        </span>
        <div className="min-w-0">
          {/* v30: ฟีดแบ็ก "เพิ่ม contrast ข้อความรองบนพื้น Titanium เล็กน้อย" — text-muted (#9498A0) เดิม
              จางไปหน่อยเมื่ออ่านในยิม/แสงน้อย ขยับเฉพาะจุดนี้เป็น #A8ACB4 (สว่างกว่า ~12%) เหมือนที่ทำกับ
              หน้าสุขภาพไปแล้วรอบก่อนๆ — ไม่แตะ text-muted ที่อื่นในแอป (แก้เฉพาะมือถือ/การ์ดที่ระบุ)
              v14: ฟีดแบ็ก "เพิ่ม Contrast ของ Secondary Text อีก 10-15% โดยเฉพาะ Hamstring • Glute"
              (ตรงกับ `detail` ด้านล่างพอดี ซึ่งเป็นบรรทัดที่แสดงข้อความในวงเล็บ เช่น "Hamstring • Glute")
              — #A8ACB4 -> #BCC1CA ทั้งสองจุดในไฟล์นี้
              v16: ฟีดแบ็ก "Typography บางจุดยังบางและเล็ก โดยเฉพาะ Hamstring • Glute — เพิ่ม contrast
              ก่อน ไม่ต้องขยายขนาดเยอะ" (ยังไม่พอแม้บวกไปแล้วรอบก่อน) — บวกอีกขั้น #BCC1CA -> #CFD4DE
              (ไม่แตะขนาด/font-weight ตามที่ขอ) */}
          <p className="text-[12px] tracked uppercase" style={{ color: '#CFD4DE' }}>Today&apos;s Focus</p>
          {/* v30: ชื่อโปรแกรมวันนี้ — เดิม text-amber (สีส้ม) เปลี่ยนเป็น text-ink (ขาว/ไทเทเนียม) ตามกฎ
              "Orange = Action/Energy เท่านั้น" — ป้ายนี้เป็นแค่ข้อมูล ไม่ใช่ปุ่ม/คำแนะนำ */}
          <p className="font-display tracked uppercase text-ink truncate" style={{ fontSize: 14 }}>
            {main}
          </p>
          {detail && (
            <p className="truncate" style={{ fontSize: 10, marginTop: 1, color: '#CFD4DE' }}>
              {detail}
            </p>
          )}
        </div>
      </div>
      <span className="text-muted shrink-0" aria-hidden="true">›</span>
    </PremiumCard>
  )
}
