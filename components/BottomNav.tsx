'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/dashboard', label: 'หน้าแรก', icon: HomeIcon },
  { href: '/train', label: 'เทรน', icon: PlusIcon },
  { href: '/stats', label: 'สถิติ', icon: ChartIcon },
  { href: '/profile', label: 'โปรไฟล์', icon: ProfileIcon },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-surface/95 backdrop-blur border-t border-line safe-bottom">
      <div className="max-w-sm md:max-w-2xl mx-auto grid grid-cols-4">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href

          // เทรน (/train) — ปุ่มลอยวงกลมใหญ่กลาง bottom nav แทนไอคอนเล็กปกติ (ตามมอคอัพ
          // "START WORKOUT") ยังเป็น tab เดิม เส้นทางเดิมทุกอย่าง แค่เปลี่ยนดีไซน์การแสดงผล
          // เฉพาะ tab นี้ — ไม่ได้เพิ่ม/ลด tab ใดๆ ในแอป จึงไม่กระทบ routing ที่อื่น
          if (href === '/train') {
            return (
              <Link key={href} href={href} className="relative flex items-start justify-center" aria-label={label}>
                <span
                  className="absolute -top-7 w-16 h-16 rounded-full flex items-center justify-center shrink-0 active:scale-[0.97] transition"
                  style={{
                    background: 'radial-gradient(circle at 35% 30%, #FFC069, #E8A33D 55%, #C1503A 100%)',
                    boxShadow: '0 6px 18px rgba(0,0,0,.45), 0 0 22px #E8A33D88, inset 0 1px rgba(255,255,255,.35)',
                    border: '3px solid #14161A',
                  }}
                >
                  <DumbbellIcon />
                </span>
                <span
                  className={`text-[8px] font-display tracked uppercase mt-9 ${active ? 'text-amber' : 'text-muted'}`}
                  aria-hidden="true"
                >
                  เทรน
                </span>
              </Link>
            )
          }

          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-1 py-2.5"
            >
              <Icon active={active} />
              <span
                className={`text-[9.5px] font-display tracked uppercase ${
                  active ? 'text-amber' : 'text-muted'
                }`}
              >
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
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12h2M5 9v6M8 7v10M16 7v10M19 9v6M22 12h-2M8 12h8"
        stroke="#14161A"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function HomeIcon({ active }: { active: boolean }) {
  const c = active ? '#E8A33D' : '#9498A0'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 11.5 12 4l8 7.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9h12v-9" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 19v-5h4v5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon({ active }: { active: boolean }) {
  const c = active ? '#E8A33D' : '#9498A0'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.8" />
      <path d="M12 8v8M8 12h8" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ChartIcon({ active }: { active: boolean }) {
  const c = active ? '#E8A33D' : '#9498A0'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M5 19V10M12 19V5M19 19v-7" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ProfileIcon({ active }: { active: boolean }) {
  const c = active ? '#E8A33D' : '#9498A0'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.6" stroke={c} strokeWidth="1.8" />
      <path d="M4.5 19.5c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
