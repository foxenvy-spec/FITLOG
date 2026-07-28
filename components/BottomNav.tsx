'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { COLORS, NEUTRAL } from '@/lib/theme'

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
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-surface/95 backdrop-blur border-t border-line safe-bottom">
      <div className="max-w-sm md:max-w-2xl mx-auto grid grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href

          // /session — ปุ่มลอยวงกลมใหญ่กลาง bottom nav ("START WORKOUT") แทนไอคอนเล็กปกติ
          // ข้อความ "START WORKOUT" อยู่ในวงกลมเลย (ไม่ใช่ label แยกข้างล่างแบบแท็บอื่น)
          if (href === '/session') {
            return (
              <Link key={href} href={href} className="relative flex items-start justify-center" aria-label="เริ่ม/ไปต่อเวิร์กเอาต์">
                <span
                  className="absolute -top-8 w-[76px] h-[76px] rounded-full flex flex-col items-center justify-center shrink-0 active:scale-[0.97] transition"
                  style={{
                    background: `radial-gradient(circle at 35% 30%, #FFC069, ${COLORS.amber} 55%, ${COLORS.rust} 100%)`,
                    boxShadow: `0 6px 18px rgba(0,0,0,.45), 0 0 22px ${COLORS.amber}88, inset 0 1px rgba(255,255,255,.35)`,
                    border: `3px solid ${NEUTRAL.onAmberText}`,
                  }}
                >
                  <DumbbellIcon />
                  <span
                    className="text-[7px] font-display tracked uppercase leading-tight mt-0.5 text-center"
                    style={{ color: NEUTRAL.onAmberText }}
                    aria-hidden="true"
                  >
                    START
                    <br />
                    WORKOUT
                  </span>
                </span>
              </Link>
            )
          }

          return (
            <Link key={href} href={href} className="flex flex-col items-center gap-1 py-2.5">
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

function DumbbellIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12h2M5 9v6M8 7v10M16 7v10M19 9v6M22 12h-2M8 12h8"
        stroke={NEUTRAL.onAmberText}
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
