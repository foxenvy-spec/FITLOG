'use client'

import NotificationButton from './NotificationButton'
import type { LatestPR, TopMuscle } from '@/lib/dashboardStats'

interface GreetingProps {
  text: string
  latestPR: LatestPR | null
  topMuscleThisWeek: TopMuscle | null
}

// แถวบนสุดของ header — ข้อความทักทาย (เปลี่ยนตามช่วงเวลาของวัน, ดู lib/dashboardStats.ts) +
// กระดิ่งแจ้งเตือนชิดขวา แยกออกมาเป็น component เดี่ยวเพื่อให้ Header.tsx อ่านง่ายขึ้น
export default function Greeting({ text, latestPR, topMuscleThisWeek }: GreetingProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs text-muted">👋 {text}</p>
      <div className="shrink-0">
        <NotificationButton latestPR={latestPR} topMuscleThisWeek={topMuscleThisWeek} />
      </div>
    </div>
  )
}
