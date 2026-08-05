'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  COLORS,
  NEUTRAL,
  AMBER_GLOW_SHADOW,
  CARD_GRADIENT_CSS,
  DIAGONAL_TITANIUM_CSS,
  TITANIUM_MESH_CSS,
  NOISE_BG,
  TITANIUM_TRACK_GRADIENT_CSS,
} from '@/lib/theme'
import { dashboardSpec } from '@/lib/dashboardSpec'
import { hapticTap, hapticSuccess } from '@/lib/haptics'

// v32: สีตัวอักษร/ไอคอนบนปุ่ม Start Workout ใหม่ — เดิม NEUTRAL.onAmberText (เข้ม) ใช้เพราะพื้นหลังปุ่ม
// เป็นสีอำพันสว่างล้วน ตอนนี้พื้นตรงกลางปุ่มเปลี่ยนเป็นแผ่นเข้ม (Orange Energy Core บนพื้นมืด แบบ Hero
// Ring) ต้องใช้สีอ่อน/อุ่นแทนเพื่อให้อ่านออกบนพื้นเข้ม — โทนเดียวกับ hot-spot ของ AMBER_GLOW_SHADOW/
// AMBER_GRADIENT_CSS (ครีมอมทอง) ไม่ใช่สีใหม่ที่ไม่เกี่ยวกับธีม
const START_BUTTON_ACCENT = '#FFE3B0'

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

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-20 backdrop-blur safe-bottom"
      // v32: "Bottom Nav ยังไม่ใช่ Titanium จริง" — เดิม bg-surface/95 (สีทึบเรียบเดียว) + border-t
      // border-line (เส้นขอบแบนสีเดียว) เป็นพื้นผิว Material Design ธรรมดา คนละวัสดุกับการ์ดด้านบน
      // ทั้งหมดที่ใช้ CARD_GRADIENT_CSS + ลายเฉียง/mesh ไทเทเนียมชุดเดียวกัน — เปลี่ยนมาใช้วัสดุชุดเดียวกัน
      // เป๊ะๆ (Titanium Plate) ให้ Nav อ่านว่าเป็น "แผ่นเดียวกัน" กับ Dashboard ด้านบน ไม่ใช่แถบ UI
      // มาตรฐานแปะซ้อนไว้ — Orange Reflection เป็นแสงอุ่นจางๆ (screen blend, 6%) กระจายลงมาจากตำแหน่งปุ่ม
      // Start เท่านั้น (ไม่ใช่พื้นหลังสีส้มเต็มแถบ) จำลองแสงสะท้อนจาก Energy Core ของปุ่มตกกระทบแผ่นโลหะ
      style={{
        backgroundImage: [
          'radial-gradient(ellipse 55% 100% at 50% 0%, rgba(255,150,30,.06), transparent 70%)',
          TITANIUM_MESH_CSS,
          DIAGONAL_TITANIUM_CSS,
          CARD_GRADIENT_CSS,
        ].join(', '),
        backgroundBlendMode: 'screen, normal, normal, normal, normal',
        // Glass Shadow — เงากว้างทอด "ขึ้น" จากแผ่น Nav ทับเนื้อหาด้านบนเล็กน้อย (offset ลบ) แทน border-t
        // เส้นเดียวเดิม จำลองแผ่นกระจก/โลหะหนาวางทับอยู่ ไม่ใช่เส้นแบ่งบางๆ ระหว่างสองพื้นผิว
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05), 0 -18px 32px -14px rgba(0,0,0,.55)',
      }}
    >
      {/* Hairline Highlight — เส้นคมชัดสว่างจ้าเส้นเดียวชิดขอบบนสุดเป๊ะ ต่างจาก inset boxShadow ด้านบน
          ที่นุ่ม/จาง จำลองขอบแผ่นโลหะกลึงที่แสงจับเป็นเส้นคม (ไม่ใช่แถบฟุ้ง) */}
      <div className="absolute top-0 inset-x-0 pointer-events-none" style={{ height: 1, background: 'rgba(255,255,255,.22)' }} aria-hidden="true" />
      {/* CNC Edge — ร่องคู่มืด/สว่างต่ำจาก Hairline Highlight ลงมาอีกนิด (เทคนิคเดียวกับ CNC seam ของ
          TodaysFocusCard.tsx แต่แนวนอนแทนแนวตั้ง) จำลองรอยกลึงเป็นแผงแยกออกจากเนื้อโลหะ ไม่ใช่ผิวเรียบ
          ต่อเนื่องชิ้นเดียว */}
      <div className="absolute inset-x-0 pointer-events-none" style={{ top: 4, height: 1, background: 'rgba(0,0,0,.4)' }} aria-hidden="true" />
      <div className="absolute inset-x-0 pointer-events-none" style={{ top: 5, height: 1, background: 'rgba(255,255,255,.08)' }} aria-hidden="true" />
      {/* เกรนผิวโลหะบางๆ ชุดเดียวกับ PremiumCard (NOISE_BG) — แยกชั้นต่างหากคุม opacity อิสระจากพื้นเบส */}
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: NOISE_BG, opacity: 0.03, mixBlendMode: 'overlay' }} aria-hidden="true" />
      {/* ความสูงจาก dashboardSpec.bottomNav.height (80px, เดิม 82px) */}
      <div className="max-w-sm md:max-w-2xl mx-auto grid grid-cols-5 items-center relative" style={{ minHeight: dashboardSpec.bottomNav.height }}>
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href

          // /session — ปุ่มลอยวงกลมใหญ่กลาง bottom nav ("START WORKOUT") แทนไอคอนเล็กปกติ
          // ข้อความ "START WORKOUT" อยู่ในวงกลมเลย (ไม่ใช่ label แยกข้างล่างแบบแท็บอื่น) — ขนาดวงจาก
          // dashboardSpec.floatingButton.size (84px, เดิม 86px) offset สเกลตามสัดส่วนเดิม (~35px)
          if (href === '/session') {
            const btnSize = dashboardSpec.floatingButton.size
            return (
              <Link
                key={href}
                href={href}
                className="relative flex items-start justify-center"
                aria-label="เริ่ม/ไปต่อเวิร์กเอาต์"
                onPointerDown={hapticSuccess}
              >
                <span
                  // animate-start-workout-pulse — Phase 5 Motion: glow วงนอกหายใจเบาๆ ต่อเนื่อง
                  // (globals.css bake ทั้ง shadow stack ไว้ในทุก keyframe กัน layer อื่นหายตอนแอนิเมชัน
                  // ทำงาน ดู comment ที่นั่น) — box-shadow ของ span นี้ต้องตรงกับ keyframes เป๊ะเหมือนเดิม
                  // ไม่แตะ (แก้แค่พื้นผิวด้านใน ไม่แก้ glow ของทั้งปุ่ม)
                  className="absolute rounded-full shrink-0 active:scale-[0.97] transition animate-start-workout-pulse"
                  style={{
                    top: -Math.round(btnSize * 0.42),
                    width: btnSize,
                    height: btnSize,
                    // v32: "Titanium Button" — เดิมพื้นหลังทั้งลูกเป็น radial-gradient สีอำพันสว่างล้วน (ปุ่ม
                    // สีส้มแบนๆ) เปลี่ยนตัวลูกนอกสุดนี้เป็น "Bezel" ไทเทเนียม (ไล่สีเดียวกับ Hero Ring เป๊ะ —
                    // TITANIUM_TRACK_GRADIENT_CSS) แทน — แผ่นสีส้มเดิมย้ายไปเป็น "Energy Core" ชั้นในแทน
                    // (ดู span ลูกด้านล่าง) ให้ปุ่มอ่านเป็น "วัสดุไทเทเนียม" ก่อน สีส้มเหลือแค่แกนพลังงานตรงกลาง
                    background: TITANIUM_TRACK_GRADIENT_CSS,
                    boxShadow: `0 6px 18px rgba(0,0,0,.45), ${AMBER_GLOW_SHADOW}, inset 0 1px rgba(255,255,255,.35)`,
                  }}
                >
                  {/* Orange Energy Core — จานเข้มตรงกลาง เว้นระยะ 7px จากขอบ (= strokeWidth เดียวกับ
                      Hero Ring ที่ size 84px พอดี, ดู FitnessRing.tsx: sw = size * 0.08) ให้ bezel
                      ไทเทเนียมรอบนอกหนาพอจะ "อ่านออก" ว่าเป็นวงแหวนจริง ไม่ใช่แค่เส้นขอบบางๆ + glow อำพัน
                      กลางจานหดขอบเขตลง (72% -> 58%) ให้เห็นจานเข้มรอบๆ core ชัดขึ้น แทนที่ glow จะไหลจน
                      เกือบชนขอบ bezel เหมือนรอบแรก (ดูเหมือนสีส้มทึบทั้งลูกอีกครั้ง) */}
                  <span
                    className="absolute rounded-full flex flex-col items-center justify-center"
                    style={{
                      inset: 7,
                      backgroundImage: [
                        'radial-gradient(circle at 50% 42%, rgba(255,244,204,.95) 0%, rgba(255,154,22,.55) 32%, transparent 58%)',
                        'linear-gradient(180deg, #1C1D1F 0%, #131416 60%, #0C0D0E 100%)',
                      ].join(', '),
                      backgroundBlendMode: 'screen, normal',
                      boxShadow: 'inset 0 0 10px rgba(0,0,0,.55)',
                    }}
                  >
                    <DumbbellIcon color={START_BUTTON_ACCENT} />
                    <span
                      className="text-[7px] font-display tracked uppercase leading-tight mt-0.5 text-center"
                      style={{ color: START_BUTTON_ACCENT }}
                      aria-hidden="true"
                    >
                      START
                      <br />
                      WORKOUT
                    </span>
                  </span>
                </span>
              </Link>
            )
          }

          return (
            <Link key={href} href={href} className="flex flex-col items-center gap-1 py-2.5" onPointerDown={hapticTap}>
              {Icon && <Icon active={active} />}
              <span className={`text-[9.5px] font-display tracked uppercase ${active ? 'text-amber' : 'text-muted'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function DumbbellIcon({ color }: { color: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12h2M5 9v6M8 7v10M16 7v10M19 9v6M22 12h-2M8 12h8"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function HomeIcon({ active }: { active: boolean }) {
  const c = active ? COLORS.amber : NEUTRAL.mutedIcon
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 11.5 12 4l8 7.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9h12v-9" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 19v-5h4v5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ProgramIcon({ active }: { active: boolean }) {
  const c = active ? COLORS.amber : NEUTRAL.mutedIcon
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="5" width="16" height="15" rx="2" stroke={c} strokeWidth="1.8" />
      <path d="M4 9.5h16" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 3v3M16 3v3" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 13h2M8 16.5h5" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ChartIcon({ active }: { active: boolean }) {
  const c = active ? COLORS.amber : NEUTRAL.mutedIcon
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M5 19V10M12 19V5M19 19v-7" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ProfileIcon({ active }: { active: boolean }) {
  const c = active ? COLORS.amber : NEUTRAL.mutedIcon
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.6" stroke={c} strokeWidth="1.8" />
      <path d="M4.5 19.5c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
