'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { DashboardNotification } from '@/lib/dashboardStats'
import GlassCard from '@/components/ui/GlassCard'

// เดิมโชว์แค่ "PR ล่าสุด"/"ฝึกมากสุดสัปดาห์นี้" (สรุปสถิติเฉยๆ กดแล้วไปไหนไม่ได้) — เปลี่ยนเป็นรับ
// รายการแจ้งเตือน 4 หมวด (Workout/Recovery/Progress/Goal, computeDashboardNotifications ใน
// lib/dashboardStats.ts) ที่ actionable จริง แต่ละรายการกดแล้วพาไปหน้าที่เกี่ยวข้องได้ (ดู href)
export default function NotificationButton({ notifications }: { notifications: DashboardNotification[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative shrink-0" ref={ref}>
      <GlassCard
        as="button"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="การแจ้งเตือน"
        aria-expanded={open}
        rounded="full"
        glowColor="#FF8A00"
        className="relative w-11 h-11 flex items-center justify-center hover:brightness-110 transition"
      >
        {/* SVG แทน emoji 🔔 เดิม — emoji บังคับสีตามสเปกไม่ได้ (มีสีของตัวเองมากับฟอนต์/แพลตฟอร์ม)
            ใช้ fill ตรงๆ ให้ตรงสเปก icon #FFD24A ได้จริง — animate-bell-swing (Phase 5 Motion) แกว่งเบาๆ
            เฉพาะตอนมีรายการแจ้งเตือนจริง (notifications.length > 0) เล่นครั้งเดียวไม่วนตลอด */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={notifications.length > 0 ? 'animate-bell-swing' : undefined}
        >
          <path
            d="M12 3a4 4 0 0 0-4 4v2.2c0 .9-.32 1.77-.9 2.45L5.6 13.8c-.63.74-.12 1.87.85 1.87h11.1c.97 0 1.48-1.13.85-1.87l-1.5-2.15A3.75 3.75 0 0 1 16 9.2V7a4 4 0 0 0-4-4Z"
            fill="#FFD24A"
          />
          <path d="M9.5 18a2.5 2.5 0 0 0 5 0h-5Z" fill="#FFD24A" />
        </svg>
        {notifications.length > 0 && (
          <span className="animate-badge-pulse absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rust text-[12px] font-mono font-bold text-white flex items-center justify-center leading-none">
            {notifications.length}
          </span>
        )}
      </GlassCard>

      {open && (
        <div className="absolute right-0 mt-2 w-72 max-w-[85vw] rounded-lg bg-surface border border-line shadow-elevated z-20 overflow-hidden">
          <p className="px-3.5 pt-3 pb-2 text-[12px] tracked uppercase text-muted border-b border-line">การแจ้งเตือน</p>
          {notifications.length === 0 ? (
            <p className="px-3.5 py-4 text-xs text-muted text-center">ยังไม่มีการแจ้งเตือนใหม่</p>
          ) : (
            <ul>
              {notifications.map((item) => (
                <li key={item.id} className="border-b border-line last:border-b-0">
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block px-3.5 py-3 hover:bg-surface2 active:bg-surface2 transition"
                  >
                    <p className="text-[12px] tracked uppercase text-muted">
                      {item.icon} {item.title}
                    </p>
                    <p className="text-sm text-ink mt-0.5">{item.detail}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
