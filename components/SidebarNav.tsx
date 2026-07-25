'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Desktop-only (lg+) sidebar — mirrors BottomNav's role on mobile/tablet but with
// room for the full nav set instead of just the 4 tabs that fit a thumb-reachable
// bottom bar. Kept as a separate component (rather than branching BottomNav) since
// the two have very different markup/layout, not just different styling.
//
// Icons are hand-drawn inline SVGs (24x24, stroke-based, 1.75px) rather than emoji —
// no new npm dependency (no network access to install an icon package in every
// environment this runs in), but reads much closer to a "real" product nav than emoji.
function NavIcon({ name, className }: { name: string; className?: string }) {
  const common = { className, viewBox: '0 0 24 24', fill: 'none', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'home':
      return (
        <svg {...common} stroke="currentColor">
          <path d="M4 11.5 12 4l8 7.5" />
          <path d="M6 10v9h12v-9" />
          <path d="M10 19v-5h4v5" />
        </svg>
      )
    case 'train':
      return (
        <svg {...common} stroke="currentColor">
          <path d="M6 7v10M18 7v10" />
          <path d="M2 10v4M22 10v4" />
          <path d="M6 12h12" />
        </svg>
      )
    case 'stats':
      return (
        <svg {...common} stroke="currentColor">
          <path d="M4 20V10M12 20V4M20 20v-7" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...common} stroke="currentColor">
          <rect x="4" y="5.5" width="16" height="15" rx="2.5" />
          <path d="M4 10h16M8 3.5v3M16 3.5v3" />
        </svg>
      )
    case 'exercises':
      return (
        <svg {...common} stroke="currentColor">
          <circle cx="12" cy="6" r="2.5" />
          <path d="M12 8.5V14M9 20l3-6 3 6M8 12h8" />
        </svg>
      )
    case 'program':
      return (
        <svg {...common} stroke="currentColor">
          <rect x="4.5" y="4" width="15" height="16" rx="2" />
          <path d="M8 9h8M8 13h8M8 17h5" />
        </svg>
      )
    case 'coach':
      return (
        <svg {...common} stroke="currentColor">
          <path d="M12 3.5 13.6 8l4.6 1.6-4.6 1.6L12 15.7l-1.6-4.5L5.8 9.6l4.6-1.6L12 3.5Z" />
          <path d="M18.5 15.5 19.3 17.5l2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" />
        </svg>
      )
    case 'profile':
      return (
        <svg {...common} stroke="currentColor">
          <circle cx="12" cy="8.3" r="3.3" />
          <path d="M5.5 20c1-3.6 4-5.5 6.5-5.5s5.5 1.9 6.5 5.5" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common} stroke="currentColor">
          <circle cx="12" cy="12" r="2.8" />
          <path d="M12 3.5v2.3M12 18.2v2.3M20.5 12h-2.3M5.8 12H3.5M17.6 6.4l-1.6 1.6M8 16l-1.6 1.6M17.6 17.6 16 16M8 8 6.4 6.4" />
        </svg>
      )
    default:
      return null
  }
}

const LINKS = [
  { href: '/dashboard', label: 'หน้าแรก', icon: 'home' },
  { href: '/train', label: 'เทรน', icon: 'train' },
  { href: '/stats', label: 'สถิติ', icon: 'stats' },
  { href: '/calendar', label: 'ปฏิทิน', icon: 'calendar' },
  { href: '/exercises', label: 'ท่าฝึก', icon: 'exercises' },
  { href: '/program', label: 'โปรแกรม', icon: 'program' },
  { href: '/coach', label: 'AI Coach', icon: 'coach' },
  { href: '/profile', label: 'โปรไฟล์', icon: 'profile' },
]

export default function SidebarNav() {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:shrink-0 lg:h-screen lg:sticky lg:top-0 border-r border-line bg-surface/60">
      <div className="px-5 py-5 flex items-center gap-2">
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-amber shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12h3l2.5-7L13 19l2.5-7H21" />
        </svg>
        <Link href="/dashboard" className="font-display tracked-lg uppercase text-lg text-ink">
          FITLOG
        </Link>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {LINKS.map(({ href, label, icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
                active ? 'bg-surface2 text-amber' : 'text-muted hover:text-ink hover:bg-surface2/60'
              }`}
            >
              <NavIcon name={icon} className="w-[18px] h-[18px] shrink-0" />
              <span className="font-display tracked uppercase text-xs">{label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
