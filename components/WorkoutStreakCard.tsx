'use client'

import { WEEKDAY_LABELS } from '@/app/(app)/dashboard/DashboardView'
import { COLORS, NEUTRAL, withAlpha } from '@/lib/theme'

interface WorkoutStreakCardProps {
  streak: number
  weekDayTicks: { iso: string; trained: boolean; isFuture: boolean }[]
  today: string
}

// การ์ด "Workout Streak" แยกเดี่ยว ตามมอคอัพ — ไอคอนไฟ + จำนวนวันติดต่อกันเด่นๆ ด้านบน แล้ว
// แถววงกลม 7 วัน (จ-อา) ด้านล่าง วันนี้ไฮไลต์เป็นวงแหวน+คำว่า "วันนี้" แทนตัวย่อวันปกติ
// (ต่างจากการ์ด Weekly Goal ที่นับ "กี่กลุ่มกล้ามเนื้อบรรลุเป้า" — อันนี้นับแค่ "วันไหนออกกำลังกายแล้วบ้าง")
export default function WorkoutStreakCard({ streak, weekDayTicks, today }: WorkoutStreakCardProps) {
  const caption =
    streak >= 7
      ? 'สุดยอด! รักษาสถิติให้ต่อเนื่อง'
      : streak > 0
        ? 'กำลังไปได้ดี ฝึกต่ออีกนิด!'
        : 'เริ่มสถิติใหม่วันนี้กันเถอะ'

  return (
    <div className="rounded-[20px] bg-surface border border-amber/40 shadow-elevated overflow-hidden animate-rise px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-base"
            style={{ backgroundColor: withAlpha(COLORS.amber, '22') }}
            aria-hidden="true"
          >
            🔥
          </span>
          <p className="font-display text-sm tracked uppercase text-ink">Workout Streak</p>
        </div>
        <p className="font-mono text-lg text-amber shrink-0">{streak} วัน</p>
      </div>
      <p className="text-[11px] text-muted mt-1.5 ml-[46px]">{caption}</p>

      <div className="grid grid-cols-7 gap-1.5 mt-4">
        {weekDayTicks.map((tick, i) => {
          const isToday = tick.iso === today
          return (
            <div
              key={tick.iso}
              className="flex flex-col items-center gap-1.5"
              role="img"
              aria-label={`${WEEKDAY_LABELS[i]}${isToday ? ' (วันนี้)' : ''}: ${tick.trained ? 'ฝึกแล้ว' : tick.isFuture ? 'ยังไม่ถึงวัน' : 'ยังไม่ได้ฝึก'}`}
            >
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0"
                style={{
                  ...(tick.trained
                    ? { backgroundColor: COLORS.amber, color: NEUTRAL.onAmberText }
                    : { backgroundColor: NEUTRAL.chipInactive, color: NEUTRAL.mutedIcon }),
                  ...(isToday ? { boxShadow: `0 0 0 2px ${COLORS.amber}, 0 0 10px ${withAlpha(COLORS.amber, '88')}` } : {}),
                }}
                aria-hidden="true"
              >
                {tick.trained ? '✓' : ''}
              </span>
              <span className={`text-[9px] ${tick.isFuture ? 'text-muted/50' : 'text-muted'}`} aria-hidden="true">
                {isToday ? 'วันนี้' : WEEKDAY_LABELS[i]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
