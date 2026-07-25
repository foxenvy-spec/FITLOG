'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

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

export default function SidebarNav() {
  const pathname = usePathname()

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
    </aside>
  )
}
