'use client'

import Image from 'next/image'
import Link from 'next/link'
import { describeMuscleFocus, dominantMuscleGroup, formatRelatedGroups, type MuscleGroup } from '@/lib/muscle-groups'
import { splitTitleDetail } from '@/lib/workoutDisplay'
import { dashboardSpec } from '@/lib/dashboardSpec'
import AnimatedBarFill from '../AnimatedBarFill'
import { HOME_COLORS } from '@/lib/homeColors'

interface TodayCardProps {
  /** ชื่อโปรแกรมจริงของวันนี้ (scheduledDay.title) ถ้ามี — มาก่อนเสมอ */
  workoutTitle: string | null
  /** fallback ตอนไม่มีโปรแกรมตั้งไว้จริง — ชุดเดียวกับที่ AICoachCompactCard ใช้ */
  muscleRecommendation: { muscleGroup: string } | null
  todayExercises?: { muscle_group: string | null }[]
  /** active: มีแผน/กำลังฝึก, restDay: มีโปรแกรมแต่วันนี้พัก, noProgram: ยังไม่เคยตั้งโปรแกรมเลย */
  variant: 'active' | 'restDay' | 'noProgram'
  completed: number
  total: number
  href: string
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

// การ์ด "Today" ใหม่ตาม "New_mobile_app.zip" — รวม TodaysFocusCard.tsx (บอกว่าวันนี้ควรฝึกอะไร) กับ
// TodaysWorkoutCompactCard.tsx (ความคืบหน้า/ปุ่มเริ่ม) เดิมที่เป็นการ์ดแยกกัน 2 ใบ (ตาม "brief 2") เข้า
// เป็นการ์ด hero ใบเดียวตามสเปกใหม่ — TodaysWorkoutEmptyCard.tsx (restDay/noProgram state) ก็รวมเข้ามา
// ที่นี่เป็น variant เดียวกัน ไม่ต้องมี component แยกอีกต่อไป
//
// brief ต้นฉบับโชว์ "50 นาที / 357 kcal" เป็นค่าประมาณการล่วงหน้าก่อนเริ่มฝึก — แอปนี้ไม่มีฟิลด์ประมาณ
// เวลา/แคลอรี่ล่วงหน้าของแผน (มีแค่ประเมินย้อนหลังจากที่ล็อกจริงแล้ว, ดู estimateCaloriesToday/
// computeTodayTotals ใน lib/dashboardStats.ts) การใส่ตัวเลขสมมติจะเป็นข้อมูลเท็จ — ใช้ completed/total
// ท่าจริง (ของเดิมจาก TodaysWorkoutCompactCard) แทนแถวนั้น ให้ยังมีความคืบหน้าจริงให้ดู ไม่ต้องเดาตัวเลข
//
// v2: ฟีดแบ็ก (design review poster, "Version 2 — 9.3/10") "Today's Workout: ใช้ภาพและสีสันเพื่อดึงดูด
// สายตา" — เปลี่ยนจากพื้นหลังไล่สีส้มล้วนเป็นรูปถ่ายจริง (workout-hero.jpg ตัวเดียวกับที่ใช้ในเดสก์ท็อป/
// TodaysWorkoutCompactCard เดิม) เต็มการ์ด + scrim ไล่สีส้ม-เข้มทับ (คงกลิ่นอายสีส้มของแบรนด์ไว้ ไม่ใช่แค่
// มืดเฉยๆ ตามที่ฟีดแบ็กระบุว่าอยากได้ "ภาพและสีสัน" ไปพร้อมกัน ไม่ใช่เลือกอย่างใดอย่างหนึ่ง) เข้มขึ้นทางซ้าย
// (โซนตัวหนังสือ) จางลงทางขวา (โซนที่เห็นเนื้อภาพชัด) — ตัดรูปธัมบ์เนล 56px เดิมออกเพราะทั้งการ์ดเป็นภาพแล้ว
export default function TodayCard({
  workoutTitle,
  muscleRecommendation,
  todayExercises = [],
  variant,
  completed,
  total,
  href,
}: TodayCardProps) {
  const { borderRadius, padding } = dashboardSpec.todayCard
  const mg = muscleRecommendation?.muscleGroup as MuscleGroup | undefined

  const { main, detail: rawDetail } =
    variant === 'restDay'
      ? { main: 'Recovery Day', detail: 'Rest • Mobility' }
      : variant === 'noProgram'
        ? { main: 'No Program Yet', detail: null }
        : workoutTitle
          ? splitTitleDetail(workoutTitle)
          : mg
            ? (() => {
                const focus = describeMuscleFocus(mg)
                return { main: focus.region, detail: formatRelatedGroups(focus.relatedGroups) }
              })()
            : { main: 'No Workout Today', detail: null }

  const todayDominantMg = workoutTitle && variant === 'active' ? dominantMuscleGroup(todayExercises) : null
  const todayRegion = todayDominantMg ? describeMuscleFocus(todayDominantMg).region : null
  const detail = rawDetail && todayRegion ? `${todayRegion} • ${rawDetail}` : rawDetail

  const isCompleted = variant === 'active' && total > 0 && completed >= total
  const buttonLabel = variant === 'noProgram' ? 'Ask MINT' : isCompleted ? 'View Summary' : 'START WORKOUT'
  const buttonHref = variant === 'noProgram' ? '/coach' : href
  // ฟีดแบ็ก "เพิ่มสถานะของ Today's Workout ให้ actionable ขึ้น — Ready to start / X% complete / Workout
  // complete ✓ แทนที่จะมีแค่เลขจำนวนท่า" — สามสถานะตามความคืบหน้าจริง (completed/total เดิม ไม่คำนวณใหม่)
  const workoutStatusLabel = isCompleted
    ? 'Workout complete ✓'
    : completed > 0
      ? `${Math.round((completed / Math.max(total, 1)) * 100)}% complete`
      : 'Ready to start'

  return (
    <div
      style={{
        borderRadius,
        padding,
        position: 'relative',
        overflow: 'hidden',
        // ฟีดแบ็ก (poster "Version 2 — 9.3/10", โพลิช "ลด glow บางจุดที่มากเกินไป") — ลด alpha ของชั้น
        // ส้ม .2 -> .16 และเงาเข้ม .45 -> .4 ให้เบาลงเล็กน้อยตามที่ระบุ ไม่แตะโครงสร้าง/สีพื้นฐาน
        // v2: ฟีดแบ็ก (เทียบ poster รอบละเอียด) "Orange กระจายทั่วหน้าเกินไป — การ์ดนี้ควรเป็น Black/
        // Titanium ที่มีแสงส้มแตะเบาๆ ('Orange → Black' เดิมหนักไปคนละด้าน ต้องการ 'Black → subtle
        // orange light' แทน)" — ลด boxShadow ส้มลงอีกขั้น (.16 -> .12)
        // v3: ย้ายชั้นส้มไปใช้ HOME_COLORS.orangeGlow (#FF6500) แทน hex เดิม (#ff5416) ให้ตรงกับโทเคนส้ม
        // ชุดเดียวที่ใช้ทั้งหน้า Home (Header logo badge, CTA ปุ่มด้านล่าง)
        boxShadow: '0 16px 32px rgba(255,101,0,.12), 0 8px 20px rgba(0,0,0,.4)',
      }}
    >
      <Image src="/images/workout-hero.jpg" alt="" fill className="object-cover" aria-hidden="true" />
      {/* ฟีดแบ็ก (เทียบ poster รอบละเอียด) "ลด Orange background ลงประมาณ 30-40% ให้เป็น Black/Titanium
          → subtle orange light แทน Orange → Black" — ลด alpha ชั้นส้มจาก .55 ลงมาเหลือ .22 (-60%) พื้นที่
          ส่วนใหญ่ของการ์ดกลายเป็นมืด/ไทเทเนียมเป็นหลัก มีแค่แสงส้มจางๆ แตะมุมซ้ายบน แทนที่จะเป็นภาพ "ล้าง
          ด้วยสีส้ม" ทั้งการ์ดแบบเดิม */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(115deg, rgba(255,101,0,.22) 0%, rgba(5,11,18,.72) 40%, rgba(5,11,18,.92) 100%)' }}
        aria-hidden="true"
      />

      <div className="relative">
        <div className="flex-1 min-w-0">
          <div
            className="flex items-center font-homeTh font-semibold"
            style={{ gap: 5, color: 'rgba(255,255,255,.85)', fontSize: 11.5, marginBottom: 6 }}
          >
            <ClockIcon />
            Today&apos;s Focus
          </div>
          <div className="font-homeNum font-extrabold text-white truncate" style={{ fontSize: 19, marginBottom: 5 }}>
            {main}
          </div>
          {detail && (
            <div className="font-homeTh truncate" style={{ color: 'rgba(255,255,255,.85)', fontSize: 11.5, marginBottom: 10 }}>
              {detail}
            </div>
          )}
          {variant === 'active' && (
            // ฟีดแบ็ก "ทุกตัวแข็งแรงหมด (bold) — ควรมี hierarchy ชัดเจนกว่านี้ ระหว่างข้อมูลหลักกับข้อมูล
            // รอง" — แถวนี้เป็นสถานะสนับสนุน (ไม่ใช่ตัวเลขหลักของการ์ด เช่น "Day 5 — Lower" ด้านบน) ลดจาก
            // font-semibold เป็นน้ำหนักปกติ ให้ตัวเลขหลัก/ปุ่ม CTA ยังคงเป็นจุดหนักสุดของการ์ดเหมือนเดิม
            <div>
              <div className="flex items-center font-homeNum" style={{ gap: 14, color: 'rgba(255,255,255,.75)', fontSize: 11.5, marginBottom: 6 }}>
                <span>
                  {completed}/{Math.max(total, 1)} exercises
                </span>
                <span>{workoutStatusLabel}</span>
              </div>
              {/* ฟีดแบ็ก "Today's Focus ควรแสดง Progress แบบ visual เพิ่มอีกนิด — เส้น progress บางๆ
                  ด้านล่างจำนวนท่า ให้เห็นความคืบหน้าทันทีโดยไม่ต้องเข้า workout" */}
              <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,.15)', overflow: 'hidden', maxWidth: 160 }}>
                <AnimatedBarFill pct={(completed / Math.max(total, 1)) * 100} color="#fff" background="rgba(255,255,255,.9)" />
              </div>
            </div>
          )}
        </div>

        {variant !== 'restDay' && (
          // ฟีดแบ็ก "ทำสี/font/ตำแหน่งให้เหมือน 100%" (poster "Version 2 — 9.3/10") — ปุ่มเดิมพื้นขาว/
          // ตัวหนังสือส้ม แต่ mockup ใช้ปุ่มพื้นส้มทึบ (ไล่สีเดียวกับโลโก้/แบรนด์) + ตัวหนังสือขาว สลับให้ตรง
          <Link
            href={buttonHref}
            className="flex items-center justify-center active:opacity-90 active:scale-[0.97] transition font-homeTh font-bold"
            style={{
              width: '100%',
              marginTop: 14,
              background: `linear-gradient(135deg,${HOME_COLORS.orange},${HOME_COLORS.orangeGlow})`,
              color: '#fff',
              borderRadius: 999,
              padding: 11,
              fontSize: 13.5,
              gap: 6,
            }}
          >
            {variant === 'noProgram' && <span aria-hidden="true">🤖</span>}
            {variant === 'active' && !isCompleted && <PlayIcon />}
            {buttonLabel}
          </Link>
        )}
      </div>
    </div>
  )
}
