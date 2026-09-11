'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  COLORS,
  NEUTRAL,
  CARD_GRADIENT_CSS,
  CARD_REFLECTION_CSS,
  CARD_MULTI_REFLECTION_CSS,
  NOISE_BG,
  TITANIUM_MESH_CSS,
  cncCornerClipPath,
} from '@/lib/theme'
import { dashboardSpec } from '@/lib/dashboardSpec'
import { hapticTap, hapticSuccess } from '@/lib/haptics'
import { todayStr } from '@/lib/weekdays'
import { getActiveMakeupDayId } from '@/lib/activeMakeupSession'
import { createClient } from '@/lib/supabase/client'
import { fetchDashboardData } from '@/app/(app)/dashboard/DashboardView'
import FitnessRing from '@/components/dashboard/FitnessRing'

// v57: ฟีดแบ็ก "ปุ่มกลาง Bottom Nav มี Glow ใหญ่กว่าแท็บอื่นชัดเจน (Home/Program/Statistics/Profile
// ไม่มี glow เลย) ถ้าอยากให้ Bottom Nav เป็น Navigation จริงๆ ลด Glow ~10-15% (ไม่ต้องลดขนาดปุ่ม)" —
// AMBER_GLOW_SHADOW (lib/theme.ts) เป็น token ใช้ร่วมหลายจุด (ปุ่ม CTA ใน Button.tsx, SidebarNav ฯลฯ)
// แก้ตรงนั้นจะกระทบทุกจุดที่ไม่ได้ถูกร้องขอ — ลด alpha ของทุกชั้น glow ลง ~12% เฉพาะที่นี่แทน (ไม่แตะ
// blur radius/ขนาด span ที่ครอบปุ่ม — ปุ่มเองยังใหญ่เท่าเดิมตามที่ขอ)
// ฟีดแบ็ก "สีดูสดเกินไป" รอบเดียวกับที่แก้ ring gradient ด้านล่าง — สี glow เดิม (255,150,20 / 255,130,0)
// เป็นส้มจัดคนละโทนกับทองนุ่มที่เพิ่งเปลี่ยนไป ปรับให้เป็นโทนทองเดียวกัน (ลด G/เพิ่ม R สัดส่วนใกล้เคียง
// BOTTOM_NAV_RING_GRADIENT ด้านล่าง) ไม่แตะ alpha/blur radius เดิม (ขนาด/ความจางยังเท่าเดิมตามที่เคยขอ)
const BOTTOM_NAV_GLOW_SHADOW =
  '0 0 2px rgba(255,255,255,.53), 0 0 8px rgba(230,192,119,.53), 0 0 22px rgba(198,144,61,.31), 0 0 60px rgba(180,120,45,.105)'

// ฟีดแบ็ก "สีดูสดเกินไป แสง/เงาไม่สวยเหมือนตัวอย่าง" — FitnessRing เดิมไม่ได้ส่ง gradientStops มา
// เลยตกไปใช้ดีฟอลต์ FIRE_GRADIENT_STOPS (lib/theme.ts) ซึ่งมีจุดสว่างเกือบขาว (#FFF4CC) และส้มจัด
// (#FF8A00/#D96A00) ตั้งใจให้ "จัดจ้านแบบไฟ" สำหรับจุดอื่น (Hero Ring ฯลฯ) แต่ทำให้วงปุ่มนี้ดูเป็นนีออน
// สดเกินไปเทียบกับ mockup ที่เป็นโทนทองนุ่มกว่า ไม่มีจุดขาวจ้า — ทำชุดสีทองเฉพาะปุ่มนี้แยกต่างหาก (ไม่แตะ
// FIRE_GRADIENT_STOPS/FitnessRing.tsx เพราะใช้ร่วมกับ Hero Ring จุดอื่น) ลดทั้งความสว่างสุด (ตัดจุดขาว
// #FFF4CC ออก) และความจัดของโทนส้ม (D96A00/FF8A00 → น้ำตาลทอง/ทองอ่อนกว่า) ให้เป็น "โลหะทอง" แทน "ไฟ"
// v2: ฟีดแบ็ก "แสง/เงายังไม่ดีขึ้นเลย" หลังลดความจัดจ้านรอบแรก — ช่วงสีเดิม (#8A6023 ถึง #EFCE8C) แคบ
// เกินไป (ความต่างความสว่างน้อย) เลยดูแบนเรียบเป็นโทนทองสม่ำเสมอ ไม่มี "จุดแวววาว" ชัดแบบโลหะขัดเงาจริง
// ใน mockup — ขยายช่วง contrast ให้กว้างขึ้นมาก: ฐานเข้มลงเป็นบรอนซ์เข้ม (#4A3110) แทนน้ำตาลทองเดิม
// จุดสว่างสุดเป็นทองอ่อนเกือบขาวอมครีม (#FFE9B8 — ยังอุ่น ไม่ใช่ขาวจ้า/ส้มจัดแบบที่เคยโดนฟีดแบ็ก) และ
// บีบโซนสว่างให้แคบลง (stop 48-52% แทน 45-55% เดิม) ให้เป็น "ประกาย" คมชัดจุดเดียวแทนแถบสว่างกว้างจาง ๆ
const BOTTOM_NAV_RING_GRADIENT = [
  { offset: '0%', color: '#4A3110' },
  { offset: '22%', color: '#8A6023' },
  { offset: '40%', color: '#D9A94F' },
  { offset: '48%', color: '#FFE9B8' },
  { offset: '52%', color: '#FFE9B8' },
  { offset: '60%', color: '#D9A94F' },
  { offset: '78%', color: '#8A6023' },
  { offset: '100%', color: '#4A3110' },
] as const

// 5 แท็บตามมอคอัพ: หน้าแรก / โปรแกรม / START WORKOUT (ปุ่มลอยกลาง) / สถิติ / โปรไฟล์
// เดิมมี 4 แท็บ (หน้าแรก/เทรน-hub/สถิติ/โปรไฟล์) โดย "เทรน" เป็น hub รวมทางลัดไปโปรแกรม/
// เทมเพลต/ไทม์เมอร์/คลังท่า (เพราะเคยมี 8 แท็บแน่นเกินไป — ดูคอมเมนต์เดิมใน app/(app)/train/page.tsx)
// ตอนนี้แยก "โปรแกรม" กลับมาเป็นแท็บของตัวเอง และปุ่มกลางไปที่ /session ตรงๆ (เริ่ม/ไปต่อ
// เทรนทันที — /session มี fallback ในตัวอยู่แล้วถ้าวันนี้ยังไม่มีโปรแกรม ไม่ต้องทำอะไรเพิ่ม)
// ผลคือหน้า /train (hub เดิม) ไม่มีทางเข้าจาก bottom nav อีกต่อไป (ไม่มีที่อื่นลิงก์ไปหาแล้ว
// เหมือนกัน) แต่ตัวไฟล์/route ยังอยู่ครบ ไม่ได้ลบ แค่ไม่ผูกกับแท็บไหนใน bottom nav
const TABS = [
  { href: '/dashboard', label: 'หน้าแรก', icon: HomeIcon },
  { href: '/program', label: 'โปรแกรม', icon: ProgramIcon },
  { href: '/session', label: 'เทรน', icon: null },
  { href: '/stats', label: 'สถิติ', icon: ChartIcon },
  { href: '/profile', label: 'โปรไฟล์', icon: ProfileIcon },
] as const

// v28: "Titanium Bottom Nav" — ฟีดแบ็ก "Bottom Nav ยังไม่ใช่ Titanium จริง ยังเป็น Material Design
// ธรรมดา (พื้นเรียบ bg-surface/95 + border-t เฉยๆ) ในขณะที่ Dashboard ด้านบนเป็น Dark Titanium เต็มรูป
// แบบแล้ว (การ์ด/พื้นหลัง/wordmark ใช้ CARD_GRADIENT_CSS/CARD_REFLECTION_CSS/NOISE_BG/TITANIUM_MESH_CSS/
// cncCornerClipPath ทั้งหมด) — สองส่วนนี้เลย 'คนละวัสดุ' คนละโลกกัน — ดึงชุดโทเคนไทเทเนียมเดียวกับ
// PremiumCard.tsx (ไล่สีแผ่นโลหะ + แถบสะท้อนแสงหลายชั้น + เกรนนอยส์ + mesh ไขว้ CNC) มาใช้กับตัวแผ่น
// nav เอง แทนพื้นเรียบเดิม ให้เป็น "แผ่นไทเทเนียมชิ้นเดียวกัน" กับการ์ดด้านบนจริงๆ ไม่ใช่แค่สีเข้มคล้ายกัน
// v55: ฟีดแบ็ก "P1 (สูงมาก) — ปุ่มกลาง Bottom Nav ยังเขียน START WORKOUT ตายตัว แม้วันนี้เป็น REST DAY
// (Today's Workout/Focus/AI Coach ทั้งหมดสลับเป็น Recovery แล้วตาม isRestDay) ให้ความรู้สึกขัดกันเล็กน้อย
// แม้ผู้ใช้จะไม่ได้กด" — BottomNav render อยู่ทุกหน้า (app/(app)/layout.tsx) ไม่ใช่แค่ /dashboard จึงไม่มี
// isRestDay ส่งตรงมาให้แบบ prop ได้ — อ่านจาก React Query cache เดียวกับที่ MobileDashboardView.tsx ใช้อยู่
// (queryKey ['dashboard', today] เป๊ะๆ) แทนการ prop-drill ผ่าน layout ที่ครอบทุก route หรือ fetch ซ้ำเอง —
// enabled เฉพาะตอนอยู่หน้า /dashboard จริง (หน้าอื่นอ่าน cache เฉยๆ ไม่ trigger fetch ใหม่ กัน network
// call ที่ไม่จำเป็นบนหน้า /program, /stats ฯลฯ) ถ้ายังไม่มี cache เลย (เพิ่งเปิดแอปหน้าอื่นก่อน /dashboard)
// fallback isRestDay=false เหมือนพฤติกรรมเดิมทุกประการ — ไม่กระทบ UX เดิมตอนไม่มีข้อมูล
// v65: ฟีดแบ็ก "หลัง Workout Complete ปุ่มกลางยังเขียน START WORKOUT ทั้งที่การ์ด Today's Workout บอก
// 8/8 COMPLETED แล้ว — ควรเป็น VIEW SUMMARY แทน" — เพิ่ม isCompleted ควบคู่กับ isRestDay เดิม ใช้สูตร
// completed/total เดียวกับที่ TodaysWorkoutCompactCard.tsx ใช้คำนวณ "8/8 COMPLETED" เป๊ะๆ (completed =
// นับท่าตามแผน+ad-hoc ที่จบแล้ว ถ้าไม่มีแผนใช้จำนวน log จริงแทน, total = Math.max(แผน, log จริง, 1)) กัน
// ปุ่มกับการ์ดขัดกันเอง — กดตอน completed แล้วยัง href ไป /session เหมือนเดิม (ไม่เปลี่ยนปลายทาง) เพราะ
// session/page.tsx (แก้ไปพร้อมกันใน P3 ของฟีดแบ็กรอบก่อน) ตรวจแล้วว่าวันนี้ทำครบ จะพาไปหน้าสรุปผลตรงๆ
// ให้เองอยู่แล้ว ไม่ต้องเปลี่ยน route ที่นี่ซ้ำ
// v66: ฟีดแบ็ก "หน้า Home ควรมี State: ก่อน Workout (START WORKOUT) / กำลัง Workout (RESUME WORKOUT) /
// Complete (VIEW SUMMARY) / Recovery Day (VIEW RECOVERY)" — isCompleted/isRestDay มีอยู่แล้ว เพิ่ม
// isInProgress (0 < completed < total) ให้ปุ่มแยก "ยังไม่เริ่มเลย" ออกจาก "เริ่มแล้วแต่ยังไม่ครบ" ได้ —
// สูตรเดียวกับ isCompleted เป๊ะ ("Program Complete" ในฟีดแบ็กไม่ได้ทำ — FITLOG ไม่มีข้อมูล "จบโปรแกรม
// ทั้งชุด" จริง โปรแกรมเป็นตารางประจำสัปดาห์ที่วนซ้ำไม่มีจุดจบ ใส่ state นี้จะต้องเดา/ปั้นความหมายขึ้นมาเอง)
function useTodayWorkoutStatus(): { isRestDay: boolean; isCompleted: boolean; isInProgress: boolean } {
  const pathname = usePathname()
  const supabase = createClient()
  const today = todayStr()
  const { data } = useQuery({
    queryKey: ['dashboard', today],
    queryFn: () => fetchDashboardData(supabase),
    enabled: pathname === '/dashboard',
  })
  if (!data) return { isRestDay: false, isCompleted: false, isInProgress: false }
  const hasTodayPlan = data.todayExercises.length > 0
  const hasLoggedToday = data.todayWorkouts.length > 0
  const hasAnyProgram = data.programDays.length > 0
  const isRestDay = !hasTodayPlan && !hasLoggedToday && hasAnyProgram

  const entryCount = data.todayWorkouts.length
  const completed = hasTodayPlan ? data.completedCount + data.adhocCompletedCount : entryCount
  const total = Math.max(data.todayExercises.length, entryCount, 1)
  const isCompleted = !isRestDay && completed >= total && (hasTodayPlan || hasLoggedToday)
  const isInProgress = !isRestDay && !isCompleted && completed > 0

  return { isRestDay, isCompleted, isInProgress }
}

export default function BottomNav() {
  const pathname = usePathname()
  const { isRestDay, isCompleted, isInProgress } = useTodayWorkoutStatus()
  // บั๊ก (ฟีดแบ็ก "เล่นเซสชันชดเชยอยู่ สลับไปหน้าอื่น แล้วกดปุ่ม START WORKOUT ลอยกลางอีกครั้ง — พาไปแผน
  // จริงของวันนี้แทนที่จะกลับเข้าเซสชันชดเชยเดิม") — ปุ่มนี้ผูกกับ '/session' เฉยๆ มาตั้งแต่ก่อนมีฟีเจอร์
  // เซสชันชดเชย ไม่รู้จัก ?day= เลย อ่าน pointer ที่ session/page.tsx เขียนไว้ (lib/activeMakeupSession.ts)
  // เพื่อสร้าง href กลับเข้าเซสชันเดิมได้ถูกต้อง — re-read ทุกครั้งที่ pathname เปลี่ยน (สลับหน้าไปมา)
  // เพราะ localStorage ไม่ reactive เอง ไม่มี pointer ค้าง = พฤติกรรมเดิมทุกประการ (ไป /session เฉยๆ)
  const [activeMakeupDay, setActiveMakeupDay] = useState<string | null>(null)
  useEffect(() => {
    setActiveMakeupDay(getActiveMakeupDayId())
  }, [pathname])
  // มุมตัด CNC เดียวกับลายเซ็นทั้งแอป (บนซ้าย 18px) — เฉพาะ 2 มุมบน (มุมล่างชิดขอบจอจริง ไม่มีอะไรให้ตัด)
  // minorCut=0 ให้มุมบนขวา/ล่างทั้งสองเหลี่ยมคม ตัดจริงแค่มุมเดียวตรงตามสัญลักษณ์ CNC ของแอป
  const navClipPath = cncCornerClipPath('tl', 18, 0)

  // ฟีดแบ็ก "ทำไมไม่เห็นครบวงครับ" — ปุ่มลอย /session เดิมอยู่ *ข้างใน* <nav> ที่มี clipPath (สำหรับตัด
  // มุม CNC) ครอบอยู่ clipPath ตัดทุกอย่างที่ล้นเหนือกรอบ nav ทิ้งเสมอ (ไม่ใช่แค่ overflow:hidden ที่พอมี
  // ทางเลี่ยง) พอเพิ่มระยะยกปุ่มขึ้น (-0.58*btnSize) ในรอบก่อน ปุ่มเลยโผล่พ้นกรอบ nav จริงและโดนตัดหัวเรียบ
  // เป็นสาเหตุที่วงไม่ครบ — ทางแก้ที่ถูกจุด: ย้ายปุ่มลอยออกมาเป็น sibling ของ <nav> แทนลูกข้างใน (render
  // แยกด้านล่าง หลัง </nav>) ให้พ้นเงื้อมมือ clipPath ไปเลย ส่วนใน TABS.map ที่ตำแหน่ง /session เดิม
  // แทนที่ด้วย placeholder ว่างๆ (ดูโค้ดใน map ด้านล่าง) แค่กันที่ให้ grid-cols-5 จัดระยะ 4 แท็บที่เหลือ
  // เท่าเดิม ไม่ต้องคำนวณตำแหน่งใหม่เอง — overlay ใหม่ใช้ grid/minHeight/safe-bottom ชุดเดียวกับ nav เป๊ะ
  // (CSS กฎเดียวกัน = ตำแหน่งคำนวณออกมาตรงกันเป๊ะ ไม่ต้อง hardcode พิกเซลเอง)
  const btnSize = dashboardSpec.floatingButton.size
  // ฟีดแบ็ก (เทียบกับ mockup ตรงๆ 2 รอบ) "ยังมีจุดส้มตรงกลาง ไม่ใช่จานเข้มล้วนแบบ mockup" —
  // รอบแรกแค่ลดขนาด/เพิ่มความโปร่งใสของ Energy Core (ยังเป็น radial-gradient สีส้ม) ไม่พอ เพราะ
  // FitnessRing เอง (simple mode) ก็มีชั้น "Orange Inner Glow" ในตัวอยู่แล้ว (ใช้ร่วมกับ Hero
  // Ring จุดอื่น แก้ไฟล์นั้นตรงๆ ไม่ได้เพราะกระทบทั้งแอป) เปลี่ยนจาก "แสงส้ม" เป็น "จานทึบสีเข้ม"
  // ล้วนแทน ให้ปิดทับ Orange Inner Glow ของ FitnessRing ได้เต็มที่ (จานทึบวาดทีหลังใน DOM จึงอยู่
  // บนสุด) เหลือแค่วงคะแนนสีทอง (ring-progress) ที่ขอบเป็นสีเดียวที่เห็นได้ ตรงกับจานเข้ม+กรอบทอง
  // ของ mockup เป๊ะ
  const coreSize = Math.round(btnSize * 0.74)
  // v55: วันพัก (isRestDay) ไม่พาไป /session (เริ่มเวิร์กเอาต์) อีกต่อไป — พาไปดู /coach
  // (Recovery) แทน ปุ่มเดียวกับที่ AI Coach ใช้ตอน isRestDay ("ดู Recovery →") ให้ปลายทางตรงกับ
  // ป้ายที่เห็นจริง ไม่ใช่แค่เปลี่ยนคำแต่กดแล้วยังพาไปเริ่มเวิร์กเอาต์เหมือนเดิม
  // pointer เซสชันชดเชยที่ยังไม่จบต้องมาก่อน isRestDay เสมอ — isRestDay มาจากสถานะแผนจริงของ
  // วันนี้ (React Query cache) ซึ่งอาจยังเป็น true ได้ถ้าเพิ่งเริ่มเซสชันชดเชยแบบยังไม่ log
  // เซ็ตไหนเลยสักเซ็ต (hasLoggedToday ยังเป็น false) กันปุ่มพาไป /coach ทั้งที่กำลังทำเซสชันชดเชย
  // อยู่จริง
  const sessionHref = activeMakeupDay ? `/session?day=${activeMakeupDay}` : isRestDay ? '/coach' : '/session'

  const floatingButton = (
    <Link
      href={sessionHref}
      className="relative flex items-start justify-center"
      aria-label={isRestDay ? 'ดู Recovery' : isCompleted ? 'ดูสรุปผลวันนี้' : isInProgress ? 'ทำเวิร์กเอาต์ต่อ' : 'เริ่มเวิร์กเอาต์'}
      onPointerDown={hapticSuccess}
    >
      {/* v3: ฟีดแบ็ก "เอาให้วงขึ้นเหนือกรอบ ให้มีมิติแบบตัวอย่าง" — เพิ่ม top offset จาก -0.42*btnSize
          เป็น -0.58*btnSize ให้โผล่พ้นขอบบนชัดเจน + contact shadow วงรีด้านล่างจำลองเงาทอดลงพื้น
          v4: ฟีดแบ็ก "ไม่อยากให้มีช่องว่าง อยากได้แสง/เงาสวยๆ" — -0.58 ทำให้เห็นเป็นจานลอยแยกจากแผ่น
          nav ชัดเกินไป (มีช่องว่าง/เงาใต้ปุ่มดูเป็นสองชิ้น) ผู้ใช้อยากได้ปุ่มที่ดูเป็นเนื้อเดียวกับแผ่น
          nav (นูนขึ้นมาจากผิว ไม่ใช่ลอยแยก) แต่ยังมีมิติแสง/เงาสวย — ลดกลับมาที่ -0.46*btnSize (ระหว่าง
          ค่าเดิม 0.42 กับ 0.58 — โผล่พ้นขอบบนแค่พอเห็นเป็นทรงกลมเต็มวง ไม่ได้ห่างจนดูแยกชิ้น) คงชุดสี/
          contrast ของ ring gradient และ glow ที่ปรับไว้ก่อนหน้าไว้ทั้งหมด (จุดที่ทำให้ "มีมิติ" จริงๆ คือ
          ตรงนั้น ไม่ใช่ระยะยก) */}
      <span
        className="absolute rounded-full pointer-events-none animate-start-workout-pulse"
        aria-hidden="true"
        style={{
          top: -Math.round(btnSize * 0.46),
          width: btnSize,
          height: btnSize,
          boxShadow: BOTTOM_NAV_GLOW_SHADOW,
        }}
      />
      <span
        className="absolute rounded-full pointer-events-none"
        aria-hidden="true"
        style={{
          top: 2,
          width: Math.round(btnSize * 0.8),
          height: Math.round(btnSize * 0.24),
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'radial-gradient(ellipse, rgba(0,0,0,.55), transparent 72%)',
          filter: 'blur(2px)',
        }}
      />
      <span
        className="absolute rounded-full active:scale-[0.97] transition"
        style={{
          top: -Math.round(btnSize * 0.46),
          width: btnSize,
          height: btnSize,
          // v2: ฟีดแบ็ก "แสง/เงายังไม่ดีขึ้นเลย" — เส้น inset highlight เดิม (1px, ไม่มี blur)
          // บางเกินไปจนแทบไม่เห็นเป็น "แสงสะท้อนบนผิวโลหะ" เพิ่ม blur (4px) ให้ฟุ้งเป็นส่วนโค้ง
          // สว่างจริงตามขอบบนของวง ผสานกับจุดสว่างของ ring gradient ด้านล่างเป็นชั้นเดียวกัน
          // v3: ฟีดแบ็ก "มิติแบบตัวอย่าง" — เพิ่มระยะ/ความเข้ม drop shadow ใต้ปุ่ม (6px/.45 ->
          // 10px/.55) ให้ตัวกลมดูยกตัวลอยขึ้นชัดกว่าเดิม แทนที่จะแบนราบกับพื้น
          boxShadow: '0 10px 22px rgba(0,0,0,.55), inset 0 3px 4px rgba(255,255,255,.4)',
        }}
      >
        <FitnessRing value={100} size={btnSize} simple gradientStops={BOTTOM_NAV_RING_GRADIENT}>
          <div className="relative flex flex-col items-center justify-center w-full h-full">
            {/* จานพื้นหลังทึบเข้ม — แทนที่ Energy Core สีส้มเดิม ปิดทับ "Orange Inner Glow" +
                "Center Glass" ที่ FitnessRing (simple mode) วาดไว้ในตัวเองอยู่แล้ว ให้เนื้อที่
                ตรงกลางปุ่มเป็นจานเข้มล้วนแบบ mockup ไม่มีสีส้ม/แสงเรืองใดๆ เหลือแค่วงคะแนนสีทอง
                (ring-progress) ที่ขอบเป็นสีเดียวที่เห็น จัดกึ่งกลางจริงด้วย top/left 50% +
                transform (absolute เฉยๆ ไม่มี offset จะไปยึดตำแหน่ง static ตาม flex flow แทน) */}
            <span
              className="absolute rounded-full"
              aria-hidden="true"
              style={{
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: coreSize,
                height: coreSize,
                background: '#101012',
              }}
            />
            {isRestDay ? <MoonIcon /> : isCompleted ? <CheckIcon /> : <DumbbellIcon />}
            <span
              className="text-[7px] font-display tracked uppercase leading-tight mt-0.5 text-center relative"
              style={{ color: '#FFF4E0' }}
              aria-hidden="true"
            >
              {isRestDay ? (
                <>
                  VIEW
                  <br />
                  RECOVERY
                </>
              ) : isCompleted ? (
                <>
                  VIEW
                  <br />
                  SUMMARY
                </>
              ) : isInProgress ? (
                <>
                  RESUME
                  <br />
                  WORKOUT
                </>
              ) : (
                <>
                  START
                  <br />
                  WORKOUT
                </>
              )}
            </span>
          </div>
        </FitnessRing>
      </span>
    </Link>
  )

  return (
    <>
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-20 safe-bottom"
      style={{
        clipPath: navClipPath,
        // ไล่สีแผ่นไทเทเนียมเดียวกับการ์ด (CARD_GRADIENT_CSS) + แถบสะท้อนแสงหลายชั้น (CARD_REFLECTION_CSS/
        // CARD_MULTI_REFLECTION_CSS) + "Orange Reflection" วงรีแสงส้มจางๆ ลอยขึ้นจากตำแหน่งปุ่ม Start
        // Workout ตรงกลาง (จำลองแสงพลังงานสะท้อนขึ้นมาบนผิวโลหะรอบปุ่ม) — เรียงจากบนสุด (จะ paint ทับ
        // ล่างสุด) ไปหาไล่สีฐาน
        backgroundImage: [
          CARD_MULTI_REFLECTION_CSS,
          CARD_REFLECTION_CSS,
          'radial-gradient(ellipse 46% 160% at 50% 0%, rgba(255,150,30,.09), transparent 65%)',
          'linear-gradient(135deg, rgba(255,255,255,.05) 0%, transparent 30%)',
          CARD_GRADIENT_CSS,
        ].join(', '),
        // "Glass Shadow" — เงานุ่มกว้างยกแผ่นขึ้นจากพื้นหลังหน้า (แทนเงาชิดขอบบางๆ เดิม) + inset
        // highlight ขอบบนบางๆ จำลองผิวกระจก/โลหะขัดเงาที่มีความหนา ไม่ใช่แผ่นแบนแปะติดพื้นหลัง
        boxShadow: '0 -24px 48px -12px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.05)',
        borderTop: '1px solid rgba(255,255,255,.05)',
      }}
    >
      {/* เกรนผิวโลหะ + mesh ไขว้ CNC ชั้นเดียวกับ PremiumCard — ให้แผ่น nav "จับต้องได้" เป็นวัสดุจริง
          แทนสีทึบเรียบๆ เหมือนเดิม */}
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: NOISE_BG, opacity: 0.03, mixBlendMode: 'overlay' }} aria-hidden="true" />
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: TITANIUM_MESH_CSS }} aria-hidden="true" />
      {/* Hairline Highlight — เส้นคมสว่างจ้าบางๆ พาดขอบบนสุดของแผ่น (จำลองขอบโลหะกัดคมที่โดนแสงจับเป็น
          เส้น ต่างจาก border-top ทึบเดิม) สว่างสุดกลางแผ่น (ใต้ปุ่ม Start Workout พอดี) แล้วจางไปทั้งสอง
          ข้าง — ผสมเส้นขาวกับโทนส้มอุ่นตรงกลาง ให้เชื่อมกับ glow ของปุ่มด้านบน */}
      <div
        className="absolute top-0 inset-x-0 pointer-events-none"
        style={{
          height: 1,
          backgroundImage: [
            'linear-gradient(90deg, transparent 4%, rgba(255,255,255,.4) 30%, rgba(255,255,255,.55) 50%, rgba(255,255,255,.4) 70%, transparent 96%)',
            'linear-gradient(90deg, transparent 38%, rgba(255,170,80,.5) 50%, transparent 62%)',
          ].join(', '),
        }}
        aria-hidden="true"
      />
      <div className="relative max-w-sm md:max-w-2xl mx-auto grid grid-cols-5 items-center" style={{ minHeight: dashboardSpec.bottomNav.height }}>
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href

          // /session — ปุ่มลอยวงกลมใหญ่กลาง bottom nav ("START WORKOUT") แทนไอคอนเล็กปกติ
          // v28: "Titanium Button + Orange Energy Core" — ปุ่มเดิมเป็นวงสีส้มทึบล้วน (AMBER_GRADIENT_CSS
          // แปะเต็มวง) ซึ่งเป็น "ปุ่มสีส้ม" ธรรมดา ไม่ใช่วัสดุเดียวกับ Fitness Score Ring บน Header —
          // เปลี่ยนมาใช้ FitnessRing (simple mode) ตัวเดียวกับ Hero Ring ย่อขนาดลงมาแทนที่วงสีส้มทึบ:
          // ขอบวงเป็น Titanium Track จริง (brushed metal/micro scratch/specular/CNC edge เหมือน Hero
          // Ring ทุกกระเบียดนิ้ว — คนละไฟล์แต่วัสดุเดียวกันเป๊ะ ไม่ต้องคัดลอกโค้ด) value=100 (วงเต็มคงที่
          // เสมอ ไม่ใช่ progress จริง — ปุ่มนี้เป็น CTA ไม่ใช่ตัวบอกความคืบหน้า) ล้อมรอบแกนพลังงานสีส้ม
          // (Energy Core) ตรงกลางแทนพื้นหลังทึบเดิม — glow วง pulse เดิม (animate-start-workout-pulse)
          // ยังอยู่เป็นชั้นนอกสุด ห่อ ring ไว้อีกที
          // v: glow เดิม animate บน box-shadow ของ span เดียวกับ ring โดยตรง (ไม่ compositable, repaint
          // จริงทุกเฟรมตลอดไป) — แยกเป็น span glow ต่างหาก (box-shadow คงที่ ไม่ animate) วางไว้ใต้ span
          // ring แล้ว animate แค่ opacity/scale ของมันแทน (ดู .animate-start-workout-pulse ใน globals.css)
          // ปุ่มลอยจริง render แยกเป็น sibling ของ <nav> ด้านล่าง (นอก clipPath ที่ตัดมุม CNC) — ดูคอมเมนต์
          // "ทำไมไม่เห็นครบวงครับ" ก่อน return ด้านบน ที่นี่แค่กันที่ในกริด 5 คอลัมน์ไว้เฉยๆ (ว่างจริง
          // ไม่ render อะไร) ไม่งั้น 4 แท็บที่เหลือจะเลื่อนมาแทนคอลัมน์กลางที่หายไป
          if (href === '/session') {
            return <div key={href} aria-hidden="true" />
          }

          return (
            <Link key={href} href={href} className="relative flex flex-col items-center gap-1 py-2.5 active:scale-[0.94] transition" onPointerDown={hapticTap}>
              {active && (
                <span
                  className="absolute rounded-full pointer-events-none"
                  aria-hidden="true"
                  style={{
                    width: 40,
                    height: 40,
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'radial-gradient(circle, rgba(232,163,61,.18), transparent 70%)',
                  }}
                />
              )}
              {Icon && <Icon active={active} />}
              <span className={`relative text-[9.5px] font-display tracked uppercase ${active ? 'text-amber' : 'text-muted'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
    {/* ปุ่มลอย /session จริง — ใช้ grid/minHeight/safe-bottom ชุดเดียวกับ <nav> ด้านบนเป๊ะ (กฎ CSS
        เดียวกัน = คำนวณตำแหน่งแนวนอน/แนวตั้งออกมาตรงกับคอลัมน์กลางของ nav พอดี ไม่ต้อง hardcode พิกัด
        เอง) แต่ไม่มี clipPath ครอบ ปุ่มเลยลอยพ้นกรอบ nav ได้เต็มที่โดยไม่โดนตัด — pointer-events-none
        ทั้ง wrapper/placeholder คอลัมน์ว่าง เปิดเฉพาะคอลัมน์ปุ่มจริงให้กดได้ */}
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 pointer-events-none safe-bottom" aria-hidden="false">
      <div className="relative max-w-sm md:max-w-2xl mx-auto grid grid-cols-5 items-center" style={{ minHeight: dashboardSpec.bottomNav.height }}>
        <div aria-hidden="true" />
        <div aria-hidden="true" />
        <div className="pointer-events-auto">{floatingButton}</div>
        <div aria-hidden="true" />
        <div aria-hidden="true" />
      </div>
    </div>
    </>
  )
}

function DumbbellIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="relative">
      <path
        d="M2 12h2M5 9v6M8 7v10M16 7v10M19 9v6M22 12h-2M8 12h8"
        stroke="#FFF4E0"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// v55: ไอคอนแทน DumbbellIcon เฉพาะตอน isRestDay — เสี้ยวจันทร์เดียวกับที่ TodaysWorkoutEmptyCard/Header
// ใช้สื่อ "พัก/ฟื้นตัว" ทั่วแอปอยู่แล้ว (🌙) ให้ปุ่มลอยไม่ค้างสัญลักษณ์ดัมเบลตอนวันพัก
function MoonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="relative">
      <path
        d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"
        stroke="#FFF4E0"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// v65: ไอคอนแทน DumbbellIcon เฉพาะตอน isCompleted — เครื่องหมายถูก สื่อ "ทำครบแล้ว วันนี้เหลือแค่ดูสรุป"
// แยกจาก DumbbellIcon (ยังไม่เริ่ม/กำลังทำ) เหมือนที่ MoonIcon แยกจาก Rest Day ด้านบน
function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="relative">
      <path d="M5 12.5 10 17.5 19 7" stroke="#FFF4E0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ไอคอนพวกนี้ export ไว้ให้ SidebarNav.tsx (เมนูซ้ายเดสก์ท็อป) ใช้ร่วมด้วย — แท็บที่ตรงกัน
// (หน้าแรก/โปรแกรม/สถิติ/โปรไฟล์) ควรเป็นเส้นเดียวกันเป๊ะทั้งมือถือ/เดสก์ท็อป ไม่ใช่วาดซ้ำคนละไฟล์
export function HomeIcon({ active }: { active: boolean }) {
  const c = active ? COLORS.amber : NEUTRAL.mutedIcon
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="relative">
      <path d="M4 11.5 12 4l8 7.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9h12v-9" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 19v-5h4v5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ProgramIcon({ active }: { active: boolean }) {
  const c = active ? COLORS.amber : NEUTRAL.mutedIcon
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="relative">
      <rect x="4" y="5" width="16" height="15" rx="2" stroke={c} strokeWidth="1.8" />
      <path d="M4 9.5h16" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 3v3M16 3v3" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 13h2M8 16.5h5" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function ChartIcon({ active }: { active: boolean }) {
  const c = active ? COLORS.amber : NEUTRAL.mutedIcon
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="relative">
      <path d="M5 19V10M12 19V5M19 19v-7" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function ProfileIcon({ active }: { active: boolean }) {
  const c = active ? COLORS.amber : NEUTRAL.mutedIcon
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="relative">
      <circle cx="12" cy="8" r="3.6" stroke={c} strokeWidth="1.8" />
      <path d="M4.5 19.5c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
