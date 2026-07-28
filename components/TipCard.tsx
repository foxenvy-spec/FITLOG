'use client'

import Link from 'next/link'

interface TipCardProps {
  // ใช้ data.aiDailySummary ที่คำนวณมาแล้วใน fetchDashboardData (ชุดเดียวกับที่การ์ด AI Coach
  // แสดงตอนไม่มี insight อื่น) — ไม่ต้องคำนวณซ้ำ
  summary: string
}

export default function TipCard({ summary }: TipCardProps) {
  if (!summary) return null
  return (
    <Link
      href="/coach"
      className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden flex items-start gap-3 px-4 py-3.5 animate-rise active:bg-surface2 transition"
    >
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-base leading-none"
        style={{ backgroundColor: '#E8A33D22' }}
        aria-hidden="true"
      >
        ✨
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-xs tracked uppercase text-amber">Tip</p>
        <p className="text-xs text-muted mt-0.5 whitespace-pre-line">{summary}</p>
      </div>
      <span className="text-muted shrink-0 mt-1" aria-hidden="true">›</span>
    </Link>
  )
}
