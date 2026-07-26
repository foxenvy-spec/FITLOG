'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDashboardSettings } from './DashboardSettingsProvider'

// Desktop-only (lg+) sidebar — mirrors BottomNav's role on mobile/tablet but with
// room for the full nav set instead of just the 4 tabs that fit a thumb-reachable
// bottom bar. Kept as a separate component (rather than branching BottomNav) since
// the two have very different markup/layout, not just different styling.
const LINKS = [
  { href: '/dashboard', label: 'หน้าแรก', icon: '🏠' },
  { href: '/train', label: 'เทรน', icon: '➕' },
  { href: '/stats', label: 'สถิติ', icon: '📈' },
  { href: '/calendar', label: 'ปฏิทิน', icon: '📅' },
  { href: '/exercises', label: 'ท่าฝึก', icon: '🏋️' },
  { href: '/program', label: 'โปรแกรม', icon: '🗓️' },
  { href: '/coach', label: 'AI Coach', icon: '✨' },
  { href: '/profile', label: 'โปรไฟล์', icon: '👤' },
]

function emailDisplayName(email: string | undefined | null) {
  if (!email) return 'นักยก'
  const prefix = email.split('@')[0]
  return prefix.charAt(0).toUpperCase() + prefix.slice(1)
}

export default function SidebarNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { setOpen } = useDashboardSettings()

  // ข้อมูลย่อไว้โชว์การ์ดผู้ใช้ท้าย sidebar (ชื่อ + ตัวอักษรย่อ) — ดึงแบบเบาๆ ครั้งเดียวตอน mount
  // ด้วย useEffect ธรรมดา ไม่ใช้ react-query เพราะ SidebarNav อยู่นอก QueryProvider (ซึ่งครอบแค่
  // <main> ในเลย์เอาต์) และข้อมูลนี้ไม่จำเป็นต้อง refetch บ่อยเท่าข้อมูล dashboard
  const [profile, setProfile] = useState<{ email: string | null; displayName: string | null }>({
    email: null,
    displayName: null,
  })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setProfile((p) => ({ ...p, email: user?.email ?? null }))
      if (user) {
        supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', user.id)
          .maybeSingle()
          .then(({ data }) => {
            setProfile((p) => ({ ...p, displayName: (data as { display_name: string | null } | null)?.display_name ?? null }))
          })
      }
    })
  }, [])

  const name = profile.displayName || emailDisplayName(profile.email)
  const initial = name.charAt(0).toUpperCase()

  // ปุ่ม "ตั้งค่า" เปิด modal ตั้งค่า Dashboard (การ์ดไหนโชว์/ซ่อน, ชื่อที่แสดง) — ถ้าไม่ได้อยู่หน้า
  // Dashboard อยู่แล้ว ให้พาไปหน้า Dashboard ก่อน (ตั้งค่าพวกนี้มีความหมายเฉพาะหน้านั้น) ค่อยเปิด modal
  function handleSettingsClick() {
    if (pathname === '/dashboard') {
      setOpen(true)
    } else {
      router.push('/dashboard?settings=1')
    }
  }

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-44 lg:shrink-0 lg:h-screen lg:sticky lg:top-0 border-r border-line bg-surface/60">
      <div className="px-4 py-4">
        <Link href="/dashboard" className="font-display tracked-lg uppercase text-base text-ink">
          FITLOG
        </Link>
      </div>
      <nav className="flex-1 px-2 space-y-0.5">
        {LINKS.map(({ href, label, icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition ${
                active ? 'bg-surface2 text-amber' : 'text-muted hover:text-ink hover:bg-surface2/60'
              }`}
            >
              <span aria-hidden="true">{icon}</span>
              <span className="font-display tracked uppercase text-[11px]">{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* ตั้งค่า — ย้ายมาจากไอคอนเฟืองที่เคยลอยอยู่มุมขวาบนของหน้า Dashboard เท่านั้น มาไว้จุดเดียว
          ที่ทุกหน้าเห็น เหมือนแอปทั่วไป (เมนูหลักด้านบน, ตั้งค่า+โปรไฟล์ปักไว้ด้านล่างสุด) */}
      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={handleSettingsClick}
          className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted hover:text-ink hover:bg-surface2/60 transition"
        >
          <span aria-hidden="true">⚙️</span>
          <span className="font-display tracked uppercase text-[11px]">ตั้งค่า</span>
        </button>
      </div>

      {/* การ์ดผู้ใช้ท้าย sidebar — ตัวอักษรย่อแทนรูปโปรไฟล์จริง (ยังไม่มีคอลัมน์ avatar_url ในฐานข้อมูล)
          พร้อมชื่อที่ตั้งไว้ (หรือ fallback จากอีเมล) กดแล้วไปหน้าโปรไฟล์ */}
      <Link
        href="/profile"
        className="flex items-center gap-2.5 px-4 py-3 border-t border-line hover:bg-surface2/40 transition"
      >
        <span
          className="shrink-0 w-9 h-9 rounded-full bg-surface2 border border-line flex items-center justify-center font-display text-xs tracked uppercase text-amber"
          aria-hidden="true"
        >
          {initial}
        </span>
        <span className="min-w-0">
          <p className="text-sm text-ink truncate">{name}</p>
          <p className="text-[10px] text-muted truncate">ดูโปรไฟล์</p>
        </span>
      </Link>
    </aside>
  )
}
