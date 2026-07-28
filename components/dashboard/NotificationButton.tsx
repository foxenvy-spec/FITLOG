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
        className="relative w-11 h-11 rounded-full flex items-center justify-center hover:brightness-110 transition backdrop-blur-md"
        style={{
          border: '1.5px solid transparent',
          backgroundImage:
            'linear-gradient(180deg, #13233Acc, #08121Fcc), linear-gradient(135deg, #FF8A0014, #FF8A0040, #FF8A0014)',
          backgroundOrigin: 'border-box',
          backgroundClip: 'padding-box, border-box',
          boxShadow: '0 4px 14px rgba(0,0,0,.35), 0 0 16px rgba(255,170,0,.45)',
        }}
      >
        {/* SVG แทน emoji 🔔 เดิม — emoji บังคับสีตามสเปกไม่ได้ (มีสีของตัวเองมากับฟอนต์/แพลตฟอร์ม)
            ใช้ currentColor ผ่าน fill ตรงๆ ให้ตรงสเปก icon #FFD24A ได้จริง */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3a4 4 0 0 0-4 4v2.2c0 .9-.32 1.77-.9 2.45L5.6 13.8c-.63.74-.12 1.87.85 1.87h11.1c.97 0 1.48-1.13.85-1.87l-1.5-2.15A3.75 3.75 0 0 1 16 9.2V7a4 4 0 0 0-4-4Z"
            fill="#FFD24A"
          />
          <path d="M9.5 18a2.5 2.5 0 0 0 5 0h-5Z" fill="#FFD24A" />
        </svg>
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
