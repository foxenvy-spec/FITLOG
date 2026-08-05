'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDashboardSettings } from './DashboardSettingsProvider'
import { HomeIcon, ProgramIcon, ChartIcon, ProfileIcon } from './BottomNav'
import {
  COLORS,
  NEUTRAL,
  CARD_GRADIENT_CSS,
  CARD_REFLECTION_CSS,
  CARD_MULTI_REFLECTION_CSS,
  NOISE_BG,
  TITANIUM_MESH_CSS,
  withAlpha,
} from '@/lib/theme'

// Desktop-only (lg+) sidebar — mirrors BottomNav's role on mobile/tablet but with
// room for the full nav set instead of just the 4 tabs that fit a thumb-reachable
// bottom bar. Kept as a separate component (rather than branching BottomNav) since
// the two have very different markup/layout, not just different styling.
//
// v44: "ทำตรงเมนูด้านซ้าย กับ profile ให้เหมือน v3" — เมนูนี้ยังไม่เคยผ่านรอบ Dark Titanium เลยตั้งแต่
// แรก (พื้นเรียบ bg-surface/60 + border-r ธรรมดา, ไอคอน emoji, active state แค่ bg-surface2 ทึบ) ในขณะ
// ที่ BottomNav (คู่กันบนมือถือ) เป็นแผ่นไทเทเนียมเต็มรูปแบบไปแล้ว (v28) — ดึงชุดโทเคน/เทคนิคเดียวกัน
// (CARD_GRADIENT_CSS ไล่สีแผ่นโลหะ + CARD_REFLECTION_CSS/CARD_MULTI_REFLECTION_CSS แถบสะท้อนแสง +
// NOISE_BG/TITANIUM_MESH_CSS เกรน+ตาราง CNC) มาใช้กับแผ่น sidebar เอง ให้เป็น "แผ่นไทเทเนียมเดียวกัน"
// กับ nav บนมือถือจริงๆ ไม่ใช่แค่สีเข้มคล้ายกัน — ไม่ใส่ cncCornerClipPath (ต่างจาก BottomNav) เพราะ
// sidebar สูงเต็มจอ ไม่มีมุมที่ "ลอยเหนือพื้นหลัง" ให้ตัดแบบแผ่น nav ลอยของมือถือ — ใช้ hairline แนวตั้ง
// ที่ขอบขวาแทน (คู่กับ hairline แนวนอนของ BottomNav) เป็นตัวบอกขอบแผ่นแทน border-r ทึบเดิม
// ไอคอน emoji เดิมเปลี่ยนเป็น SVG เส้นชุดเดียวกับ BottomNav (4 อันที่มีแท็บตรงกันคือ import ตัวเดียวกัน
// มาใช้ซ้ำเป๊ะ — หน้าแรก/โปรแกรม/สถิติ/โปรไฟล์ ไม่วาดซ้ำคนละไฟล์ ส่วนที่เหลือ (เทรน/ปฏิทิน/ท่าฝึก/
// AI Coach) เป็นแท็บที่ไม่มีใน BottomNav อยู่แล้ว วาดใหม่ในไฟล์นี้)
const LINKS = [
  { href: '/dashboard', label: 'หน้าแรก', icon: HomeIcon },
  { href: '/train', label: 'เทรน', icon: TrainIcon },
  { href: '/stats', label: 'สถิติ', icon: ChartIcon },
  { href: '/calendar', label: 'ปฏิทิน', icon: CalendarIcon },
  { href: '/exercises', label: 'ท่าฝึก', icon: BarbellIcon },
  { href: '/program', label: 'โปรแกรม', icon: ProgramIcon },
  { href: '/coach', label: 'AI Coach', icon: SparkleIcon },
  { href: '/profile', label: 'โปรไฟล์', icon: ProfileIcon },
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
    <aside
      className="hidden lg:flex lg:flex-col lg:w-44 lg:shrink-0 lg:h-screen lg:sticky lg:top-0 relative"
      style={{
        backgroundImage: [CARD_MULTI_REFLECTION_CSS, CARD_REFLECTION_CSS, CARD_GRADIENT_CSS].join(', '),
        boxShadow: '10px 0 32px -16px rgba(0,0,0,.55)',
      }}
    >
      {/* เกรนผิวโลหะ + mesh ไขว้ CNC ชั้นเดียวกับ BottomNav/PremiumCard — ให้แผ่น sidebar "จับต้องได้"
          เป็นวัสดุจริง แทนสีทึบเรียบๆ เหมือนเดิม */}
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: NOISE_BG, opacity: 0.03, mixBlendMode: 'overlay' }} aria-hidden="true" />
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: TITANIUM_MESH_CSS }} aria-hidden="true" />
      {/* Hairline ขอบขวา — เส้นคมสว่างจ้าบางๆ พาดขอบขวาสุดของแผ่น (คู่กับ hairline แนวนอนของ BottomNav
          ที่ขอบบน) แทน border-r ทึบเดิม สว่างสุดกลางความสูง ค่อยๆ จางไปทั้งบน/ล่าง */}
      <div
        className="absolute top-0 right-0 bottom-0 pointer-events-none"
        style={{
          width: 1,
          backgroundImage: 'linear-gradient(180deg, transparent 4%, rgba(255,255,255,.14) 35%, rgba(255,255,255,.2) 50%, rgba(255,255,255,.14) 65%, transparent 96%)',
        }}
        aria-hidden="true"
      />

      <div className="relative px-4 py-4">
        <Link href="/dashboard" className="font-display tracked-lg uppercase text-base text-ink">
          FITLOG
        </Link>
      </div>
      <nav className="relative flex-1 px-2 space-y-0.5">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition ${active ? '' : 'hover:bg-white/5'}`}
              style={
                active
                  ? {
                      backgroundImage: `linear-gradient(90deg, ${withAlpha(COLORS.amber, '1c')}, transparent 85%)`,
                      boxShadow: `inset 2px 0 0 0 ${COLORS.amber}`,
                    }
                  : undefined
              }
            >
              <Icon active={active} />
              <span className={`font-display tracked uppercase text-[11px] ${active ? 'text-amber' : 'text-muted'}`}>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* ตั้งค่า — ย้ายมาจากไอคอนเฟืองที่เคยลอยอยู่มุมขวาบนของหน้า Dashboard เท่านั้น มาไว้จุดเดียว
          ที่ทุกหน้าเห็น เหมือนแอปทั่วไป (เมนูหลักด้านบน, ตั้งค่า+โปรไฟล์ปักไว้ด้านล่างสุด) */}
      <div className="relative px-2 pb-2">
        <button
          type="button"
          onClick={handleSettingsClick}
          className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted hover:text-ink hover:bg-white/5 transition"
        >
          <GearIcon active={false} />
          <span className="font-display tracked uppercase text-[11px]">ตั้งค่า</span>
        </button>
      </div>

      {/* การ์ดผู้ใช้ท้าย sidebar — ตัวอักษรย่อแทนรูปโปรไฟล์จริง (ยังไม่มีคอลัมน์ avatar_url ในฐานข้อมูล)
          พร้อมชื่อที่ตั้งไว้ (หรือ fallback จากอีเมล) กดแล้วไปหน้าโปรไฟล์ — วงแหวนอำพัน+พื้นไทเทเนียม
          เดียวกับภาษาวง avatar ที่ใช้ทั่วแอป (AiRingAvatar) แทนวงกลมทึบ bg-surface2 เดิม */}
      <Link
        href="/profile"
        className="relative flex items-center gap-2.5 px-4 py-3 hover:bg-white/5 transition"
        style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}
      >
        <span
          className="relative shrink-0 rounded-full flex items-center justify-center font-display text-xs tracked uppercase text-amber"
          style={{
            width: 36,
            height: 36,
            backgroundImage: CARD_GRADIENT_CSS,
            border: `1.5px solid ${withAlpha(COLORS.amber, '45')}`,
            boxShadow: `0 0 8px ${withAlpha(COLORS.amber, '20')}`,
          }}
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

function TrainIcon({ active }: { active: boolean }) {
  const c = active ? COLORS.amber : NEUTRAL.mutedIcon
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="relative shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="8.2" stroke={c} strokeWidth="1.8" />
      <path d="M12 8.2v7.6M8.2 12h7.6" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CalendarIcon({ active }: { active: boolean }) {
  const c = active ? COLORS.amber : NEUTRAL.mutedIcon
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="relative shrink-0" aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" stroke={c} strokeWidth="1.8" />
      <path d="M4 10h16" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 3v3.5M16 3v3.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function BarbellIcon({ active }: { active: boolean }) {
  const c = active ? COLORS.amber : NEUTRAL.mutedIcon
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="relative shrink-0" aria-hidden="true">
      <path d="M2 12h2M20 12h2M5 9v6M19 9v6M8 7v10M16 7v10M8 12h8" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SparkleIcon({ active }: { active: boolean }) {
  const c = active ? COLORS.amber : NEUTRAL.mutedIcon
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="relative shrink-0" aria-hidden="true">
      <path
        d="M12 3.5c.6 3.3 1.6 4.5 5 5.2-3.4.7-4.4 1.9-5 5.2-.6-3.3-1.6-4.5-5-5.2 3.4-.7 4.4-1.9 5-5.2Z"
        stroke={c}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M18 15.5c.35 1.9.9 2.55 2.8 2.9-1.9.35-2.45 1-2.8 2.9-.35-1.9-.9-2.55-2.8-2.9 1.9-.35 2.45-1 2.8-2.9Z" stroke={c} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function GearIcon({ active }: { active: boolean }) {
  const c = active ? COLORS.amber : NEUTRAL.mutedIcon
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="relative shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.8" />
      <path
        d="M12 4.2v1.9M12 17.9v1.9M19.8 12h-1.9M6.1 12H4.2M17.5 6.5l-1.3 1.3M7.8 16.2l-1.3 1.3M17.5 17.5l-1.3-1.3M7.8 7.8 6.5 6.5"
        stroke={c}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
