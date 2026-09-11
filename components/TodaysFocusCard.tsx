'use client'

import Link from 'next/link'
import { describeMuscleFocus, dominantMuscleGroup, formatRelatedGroups, type MuscleGroup } from '@/lib/muscle-groups'
import { COLORS } from '@/lib/theme'
import { dashboardSpec } from '@/lib/dashboardSpec'

// ไอคอนเป้า (target) เส้นล้วน แทนอีโมจิ 🎯 เดิม — อีโมจิมีสีของตัวเองติดมา (แดง/ขาว/น้ำเงินตามแพลตฟอร์ม)
// ชนกับพื้นส้มทึบที่ตั้งใจให้เป็นสีเดียวตาม mockup — stroke=currentColor ควบคุมสีได้เต็มที่จาก parent
function TargetIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </svg>
  )
}

interface TodaysFocusCardProps {
  /** ชื่อโปรแกรมจริงของวันนี้ (scheduledDay.title) ถ้ามี — มาก่อนเสมอ */
  workoutTitle: string | null
  /** fallback ตอนไม่มีโปรแกรมตั้งไว้จริง — ชุดเดียวกับที่ AICoachCompactCard ใช้ (data.muscleRecommendation)
   * ใช้ describeMuscleFocus() ตัวเดียวกันแปลงเป็น region+relatedGroups ให้สองการ์ดพูดตรงกันเป๊ะ แทนที่จะ
   * โชว์แค่ muscleGroup ดิบๆ ("อก") ในขณะที่ AI Coach ด้านล่างโชว์ "UPPER BODY / อก • ไหล่ • แขน" */
  muscleRecommendation: { muscleGroup: string } | null
  /** ท่าตามแผนจริงของวันนี้ (data.todayExercises) — ใช้หากล้ามเนื้อที่มีท่ามากที่สุด (dominantMuscleGroup)
   * เพื่อเติม "หมวดร่างกาย" นำหน้ารายละเอียดในวงเล็บของ workoutTitle */
  todayExercises?: { muscle_group: string | null }[]
  /** true เมื่อวันนี้เป็น Rest Day จริง — ตัด workoutTitle/muscleRecommendation ทิ้งไปเลย */
  isRestDay?: boolean
  href: string
}

// ชื่อโปรแกรม (scheduledDay.title) เป็นข้อความอิสระที่ผู้ใช้พิมพ์เอง (เช่น "Day 5 — Lower
// (Hamstring/Glute)") ไม่มีฟิลด์กล้ามเนื้อแยกต่างหากใน ProgramDay (lib/types.ts) ให้ดึงมาแสดงบรรทัด 2
// ตรงๆ — label ยาวๆ แบบนี้โดน truncate จะตัดจนอ่านไม่รู้เรื่อง ถ้าเจอวงเล็บ แยกเป็น 2 บรรทัดแทน: บรรทัด
// หลัก (ก่อนวงเล็บ) + บรรทัดรายละเอียด (ในวงเล็บ, "/" แทนด้วย " • ")
export function splitTitleDetail(text: string): { main: string; detail: string | null } {
  const openIdx = text.indexOf('(')
  if (openIdx === -1) return { main: text, detail: null }
  const closeIdx = text.lastIndexOf(')')
  const main = text.slice(0, openIdx).trim() || text
  const inner = closeIdx > openIdx ? text.slice(openIdx + 1, closeIdx) : text.slice(openIdx + 1)
  const detail = inner.replace(/\//g, ' • ').trim()
  return { main, detail: detail || null }
}

// เขียนใหม่ทั้งหมดตาม mockup "Version 5" ("ของจริงไม่สวยเหมือน Version 5 เลย ปรับสี กรอบ พื้นหลังใหม่ให้
// เหมือน 100% ไม่ต้องสนใจของเก่า") — เดิมใช้ PremiumCard (พื้นผิว "Dark Titanium" หลายเลเยอร์: ไล่สีโลหะ,
// มุมตัด CNC, เส้นสะท้อนแสงหลายเส้น, เกรนนอยส์) ซึ่งเป็นสไตล์ "skeuomorphic ornate" คนละแนวกับ mockup ที่
// เป็นการ์ดเรียบแบน (flat) พื้นเทาเข้มเรียบ + border บางๆ เส้นเดียว ไม่มีลายผิว/มุมตัด — เขียนใหม่เป็น
// การ์ดเรียบตรงตาม mockup แทน ไม่ใช้ PremiumCard อีกต่อไป (component นี้ใช้เฉพาะ Mobile Dashboard เท่านั้น
// ไม่กระทบเดสก์ท็อป/หน้าอื่น) ตรรกะการเลือกข้อความ (workoutTitle/muscleRecommendation/isRestDay) ไม่แตะ
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
        : { main: 'ยังไม่มี Workout วันนี้', detail: null }

  const todayDominantMg = workoutTitle && !isRestDay ? dominantMuscleGroup(todayExercises) : null
  const todayRegion = todayDominantMg ? describeMuscleFocus(todayDominantMg).region : null
  const detail = rawDetail && todayRegion ? `${todayRegion} • ${rawDetail}` : rawDetail

  return (
    <Link
      href={href}
      className="rounded-card border border-line flex items-center gap-3 active:opacity-80 transition"
      style={{
        padding: dashboardSpec.focusCard.padding,
        minHeight: dashboardSpec.focusCard.height,
        background: 'linear-gradient(180deg, #1E2228 0%, #17191E 100%)',
      }}
    >
      <span
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: COLORS.amber, color: '#1A1200' }}
        aria-hidden="true"
      >
        <TargetIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] tracked uppercase text-muted">Today&apos;s Focus</p>
        <p className="font-display tracked uppercase text-ink truncate" style={{ fontSize: 14 }}>
          {main}
        </p>
        {detail && (
          <p className="truncate text-muted" style={{ fontSize: 10, marginTop: 1 }}>
            {detail}
          </p>
        )}
      </div>
      <span className="text-muted shrink-0" aria-hidden="true">›</span>
    </Link>
  )
}
