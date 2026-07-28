'use client'

import { useEffect, useRef, useState } from 'react'
import { relativeDayLabel } from '@/lib/dashboardStats'
import type { LatestPR, TopMuscle } from '@/lib/dashboardStats'

// ย้าย "PR ล่าสุด" / "ฝึกมากสุดสัปดาห์นี้" ออกจากเนื้อหาหลักของ Dashboard มาไว้ในกระดิ่งแจ้งเตือนแทน —
// เดิมสองการ์ดนี้กินพื้นที่แถวเต็มความกว้างอยู่ใต้การ์ดสถิติร่างกาย ทั้งที่เป็นข้อมูล "เชิงแจ้งเตือน"
// มากกว่า "ต้องดูตลอดเวลา" จึงย้ายมาไว้เป็นรายการแจ้งเตือนแทน กดกระดิ่งแล้วค่อยดู
export default function NotificationButton({
  latestPR,
  topMuscleThisWeek,
}: {
  latestPR: LatestPR | null
  topMuscleThisWeek: TopMuscle | null
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const items = [
    latestPR
      ? {
          key: 'pr',
          icon: '🏆',
          title: 'PR ล่าสุด',
          heading: latestPR.exerciseName,
          detail: (
            <>
              <span className="font-mono font-semibold text-violet">{latestPR.weightKg}kg</span>{' '}
              <span className="text-muted">· {relativeDayLabel(latestPR.performedAt)}</span>
            </>
          ),
        }
      : null,
    topMuscleThisWeek
      ? {
          key: 'top-muscle',
          icon: '💪',
          title: 'ฝึกมากสุดสัปดาห์นี้',
          heading: topMuscleThisWeek.muscleGroup,
          detail: (
            <>
              <span className="font-mono text-ink">{topMuscleThisWeek.sets}</span> <span className="text-muted">Sets</span>
            </>
          ),
        }
      : null,
  ].filter((i): i is NonNullable<typeof i> => i != null)

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="การแจ้งเตือน"
        aria-expanded={open}
        className="relative w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-amber transition"
        style={{
          border: '1.5px solid transparent',
          backgroundImage:
            'linear-gradient(180deg, #13233A, #08121F), linear-gradient(135deg, #E8A33D14, #E8A33D40, #E8A33D14)',
          backgroundOrigin: 'border-box',
          backgroundClip: 'padding-box, border-box',
          boxShadow: '0 4px 14px rgba(0,0,0,.35), 0 0 12px #E8A33D33',
        }}
      >
        🔔
        {items.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rust text-[9px] font-mono font-bold text-white flex items-center justify-center leading-none">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 max-w-[85vw] rounded-lg bg-surface border border-line shadow-elevated z-20 overflow-hidden">
          <p className="px-3.5 pt-3 pb-2 text-[10px] tracked uppercase text-muted border-b border-line">การแจ้งเตือน</p>
          {items.length === 0 ? (
            <p className="px-3.5 py-4 text-xs text-muted text-center">ยังไม่มีการแจ้งเตือนใหม่</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.key} className="px-3.5 py-3 border-b border-line last:border-b-0">
                  <p className="text-[10px] tracked uppercase text-muted">
                    {item.icon} {item.title}
                  </p>
                  <p className="text-sm text-ink truncate mt-0.5">{item.heading}</p>
                  <p className="text-[11px] mt-0.5">{item.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
