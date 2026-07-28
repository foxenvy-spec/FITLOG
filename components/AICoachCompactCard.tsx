'use client'

import Link from 'next/link'

interface AICoachCompactCardProps {
  message: string
  href?: string
}

// เวอร์ชันย่อของการ์ด AI Coach — ข้อความบรรทัดเดียว + ปุ่ม "ดูคำแนะนำ" แทนลิสต์ insight เต็มรูปแบบ
// (เวอร์ชันเต็มพร้อม insight หลายรายการยังอยู่ในแถบปัด Recovery/AI Coach ด้านล่างของหน้าเหมือนเดิม)
export default function AICoachCompactCard({ message, href = '/coach' }: AICoachCompactCardProps) {
  return (
    <Link
      href={href}
      className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden flex items-center gap-3 px-4 py-3.5 active:bg-surface2 transition"
    >
      <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 bg-surface2 flex items-center justify-center text-xl" aria-hidden="true">
        🤖
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-xs tracked uppercase text-amber flex items-center gap-1">
          <span aria-hidden="true">✨</span> AI Coach
        </p>
        <p className="text-xs text-ink mt-0.5 truncate">{message}</p>
      </div>
      <span className="shrink-0 text-[10px] font-display tracked uppercase text-amber border border-amber/40 rounded-full px-3 py-1.5 whitespace-nowrap">
        ดูคำแนะนำ ›
      </span>
    </Link>
  )
}
