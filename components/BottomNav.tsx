'use client'

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
import { createClient } from '@/lib/supabase/client'
import { fetchDashboardData } from '@/app/(app)/dashboard/DashboardView'
import FitnessRing from '@/components/dashboard/FitnessRing'

// v57: ฟีดแบ็ก "ปุ่มกลาง Bottom Nav มี Glow ใหญ่กว่าแท็บอื่นชัดเจน (Home/Program/Statistics/Profile
// ไม่มี glow เลย) ถ้าอยากให้ Bottom Nav เป็น Navigation จริงๆ ลด Glow ~10-15% (ไม่ต้องลดขนาดปุ่ม)" —
// AMBER_GLOW_SHADOW (lib/theme.ts) เป็น token ใช้ร่วมหลายจุด (ปุ่ม CTA ใน Button.tsx, SidebarNav ฯลฯ)
// แก้ตรงนั้นจะกระทบทุกจุดที่ไม่ได้ถูกร้องขอ — ลด alpha ของทุกชั้น glow ลง ~12% เฉพาะที่นี่แทน (ไม่แตะ
// blur radius/ขนาด span ที่ครอบปุ่ม — ปุ่มเองยังใหญ่เท่าเดิมตามที่ขอ)
const BOTTOM_NAV_GLOW_SHADOW =
  '0 0 2px rgba(255,255,255,.53), 0 0 8px rgba(255,210,120,.53), 0 0 22px rgba(255,150,20,.31), 0 0 60px rgba(255,130,0,.105)'

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
function useIsRestDayToday(): boolean {
  const pathname = usePathname()
  const supabase = createClient()
  const today = todayStr()
  const { data } = useQuery({
    queryKey: ['dashboard', today],
    queryFn: () => fetchDashboardData(supabase),
    enabled: pathname === '/dashboard',
  })
  if (!data) return false
  const hasTodayPlan = data.todayExercises.length > 0
  const hasLoggedToday = data.todayWorkouts.length > 0
  const hasAnyProgram = data.programDays.length > 0
  return !hasTodayPlan && !hasLoggedToday && hasAnyProgram
}

export default function BottomNav() {
  const pathname = usePathname()
  const isRestDay = useIsRestDayToday()
  // มุมตัด CNC เดียวกับลายเซ็นทั้งแอป (บนซ้าย 18px) — เฉพาะ 2 มุมบน (มุมล่างชิดขอบจอจริง ไม่มีอะไรให้ตัด)
  // minorCut=0 ให้มุมบนขวา/ล่างทั้งสองเหลี่ยมคม ตัดจริงแค่มุมเดียวตรงตามสัญลักษณ์ CNC ของแอป
  const navClipPath = cncCornerClipPath('tl', 18, 0)

  return (
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
          if (href === '/session') {
            const btnSize = dashboardSpec.floatingButton.size
            const coreSize = Math.round(btnSize * 0.52)
            // v55: วันพัก (isRestDay) ไม่พาไป /session (เริ่มเวิร์กเอาต์) อีกต่อไป — พาไปดู /coach
            // (Recovery) แทน ปุ่มเดียวกับที่ AI Coach ใช้ตอน isRestDay ("ดู Recovery →") ให้ปลายทางตรงกับ
            // ป้ายที่เห็นจริง ไม่ใช่แค่เปลี่ยนคำแต่กดแล้วยังพาไปเริ่มเวิร์กเอาต์เหมือนเดิม
            const sessionHref = isRestDay ? '/coach' : '/session'
            return (
              <Link
                key={href}
                href={sessionHref}
                className="relative flex items-start justify-center"
                aria-label={isRestDay ? 'ดู Recovery' : 'เริ่ม/ไปต่อเวิร์กเอาต์'}
                onPointerDown={hapticSuccess}
              >
                <span
                  className="absolute rounded-full pointer-events-none animate-start-workout-pulse"
                  aria-hidden="true"
                  style={{
                    top: -Math.round(btnSize * 0.42),
                    width: btnSize,
                    height: btnSize,
                    boxShadow: BOTTOM_NAV_GLOW_SHADOW,
                  }}
                />
                <span
                  className="absolute rounded-full active:scale-[0.97] transition"
                  style={{
                    top: -Math.round(btnSize * 0.42),
                    width: btnSize,
                    height: btnSize,
                    boxShadow: '0 6px 18px rgba(0,0,0,.45), inset 0 1px rgba(255,255,255,.35)',
                  }}
                >
                  <FitnessRing value={100} size={btnSize} simple>
                    <div className="relative flex flex-col items-center justify-center w-full h-full">
                      {/* Energy Core — แกนพลังงานส้มลอยกลางวง Titanium (ไม่ใช่พื้นทึบเต็มวงเหมือนเดิม)
                          ไล่จางออกจากศูนย์กลางแบบรัศมี ให้ความรู้สึก "แสง/พลังงาน" มากกว่า "ปุ่มสี" —
                          จัดกึ่งกลางจริงด้วย top/left 50% + transform (absolute เฉยๆ ไม่มี offset จะไป
                          ยึดตำแหน่ง static ตาม flex flow แทน ไม่ centered ทับ icon/label แบบที่ต้องการ) */}
                      <span
                        className="absolute rounded-full"
                        aria-hidden="true"
                        style={{
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          width: coreSize,
                          height: coreSize,
                          background: 'radial-gradient(circle at 35% 30%, #FFF4CC 0%, #FFB84A 40%, #FF9A16 68%, transparent 85%)',
                        }}
                      />
                      {isRestDay ? <MoonIcon /> : <DumbbellIcon />}
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
