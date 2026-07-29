'use client'

import { WEEKDAY_LABELS } from '@/app/(app)/dashboard/DashboardView'
import { COLORS, NEUTRAL, withAlpha } from '@/lib/theme'
import PremiumCard from './ui/PremiumCard'

interface WorkoutStreakCardProps {
  streak: number
  weekDayTicks: { iso: string; trained: boolean; isFuture: boolean }[]
  today: string
}

// การ์ด "Workout Streak" แบบย่อ (เดิมสูง ~180px ลดเหลือ ~90-100px ตามที่ขอ) — รวมทุกอย่างลง
// แถวเดียว: ไอคอนไฟ+จำนวนวัน ซ้าย, จุดวงกลม 7 วันเล็กๆ (ไม่มีตัวย่อวันกำกับใต้จุดแล้ว — ข้อมูล
// วันยังอยู่ครบใน aria-label ให้ screen reader อ่านได้ปกติ) ขวา ตัดคำบรรยายใต้หัวข้อออกไปเลย
export default function WorkoutStreakCard({ streak, weekDayTicks, today }: WorkoutStreakCardProps) {
  return (
    <PremiumCard className="animate-rise px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 shrink-0">
          <span
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm"
            style={{ backgroundColor: withAlpha(COLORS.amber, '22') }}
            aria-hidden="true"
          >
            🔥
          </span>
          <div>
            <p className="text-[9px] tracked uppercase text-muted leading-none">Workout Streak</p>
            <p className="font-mono text-amber leading-none mt-1" style={{ fontSize: 13 }}>{streak} วัน</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {weekDayTicks.map((tick, i) => {
            const isToday = tick.iso === today
            return (
              <span
                key={tick.iso}
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] shrink-0"
                role="img"
                aria-label={`${WEEKDAY_LABELS[i]}${isToday ? ' (วันนี้)' : ''}: ${tick.trained ? 'ฝึกแล้ว' : tick.isFuture ? 'ยังไม่ถึงวัน' : 'ยังไม่ได้ฝึก'}`}
                style={{
                  ...(tick.trained
                    ? { backgroundColor: COLORS.amber, color: NEUTRAL.onAmberText }
                    : { backgroundColor: NEUTRAL.chipInactive, color: NEUTRAL.mutedIcon }),
                  ...(isToday ? { boxShadow: `0 0 0 2px ${COLORS.amber}` } : {}),
                }}
              >
                {tick.trained ? '✓' : ''}
              </span>
            )
          })}
        </div>
      </div>
    </PremiumCard>
  )
}
