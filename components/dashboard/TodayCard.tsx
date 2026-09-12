'use client'

import Image from 'next/image'
import Link from 'next/link'
import { describeMuscleFocus, dominantMuscleGroup, formatRelatedGroups, type MuscleGroup } from '@/lib/muscle-groups'
import { splitTitleDetail } from '@/lib/workoutDisplay'
import { dashboardSpec } from '@/lib/dashboardSpec'

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
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#e85f1a" aria-hidden="true">
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
        ? { main: 'ยังไม่มีโปรแกรม', detail: null }
        : workoutTitle
          ? splitTitleDetail(workoutTitle)
          : mg
            ? (() => {
                const focus = describeMuscleFocus(mg)
                return { main: focus.region, detail: formatRelatedGroups(focus.relatedGroups) }
              })()
            : { main: 'ยังไม่มี Workout วันนี้', detail: null }

  const todayDominantMg = workoutTitle && variant === 'active' ? dominantMuscleGroup(todayExercises) : null
  const todayRegion = todayDominantMg ? describeMuscleFocus(todayDominantMg).region : null
  const detail = rawDetail && todayRegion ? `${todayRegion} • ${rawDetail}` : rawDetail

  const isCompleted = variant === 'active' && total > 0 && completed >= total
  const buttonLabel = variant === 'noProgram' ? 'ให้ MINT แนะนำ' : isCompleted ? 'ดูสรุปวันนี้' : 'START WORKOUT'
  const buttonHref = variant === 'noProgram' ? '/coach' : href

  return (
    <div
      style={{
        borderRadius,
        padding,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 16px 32px rgba(255,84,22,.2), 0 8px 20px rgba(0,0,0,.45)',
      }}
    >
      <Image src="/images/workout-hero.jpg" alt="" fill className="object-cover" aria-hidden="true" />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(115deg, rgba(255,84,22,.55) 0%, rgba(10,13,18,.65) 45%, rgba(10,13,18,.88) 100%)' }}
        aria-hidden="true"
      />

      <div className="relative">
        <div className="flex-1 min-w-0">
          <div
            className="flex items-center font-homeTh font-semibold"
            style={{ gap: 5, color: 'rgba(255,255,255,.85)', fontSize: 11.5, marginBottom: 6 }}
          >
            <ClockIcon />
            วันนี้ควรทำอะไร?
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
            <div className="flex items-center font-homeNum font-semibold" style={{ gap: 14, color: 'rgba(255,255,255,.9)', fontSize: 11.5 }}>
              <span>
                {completed}/{Math.max(total, 1)} ท่า
              </span>
              {isCompleted && <span>เสร็จแล้ว ✓</span>}
            </div>
          )}
        </div>

        {variant !== 'restDay' && (
          <Link
            href={buttonHref}
            className="flex items-center justify-center active:opacity-90 transition font-homeTh font-bold"
            style={{
              width: '100%',
              marginTop: 14,
              background: '#fff',
              color: '#e85f1a',
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
