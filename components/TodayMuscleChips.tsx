'use client'

import { useMemo } from 'react'
import type { Workout } from '@/lib/types'
import { VOLUME_MUSCLES, MUSCLE_GROUP_COLORS, type MuscleGroup } from '@/lib/muscle-groups'

interface TodayMuscleChipsProps {
  todayWorkouts: Workout[]
}

// แถบชิปเล็กๆ บอกกลุ่มกล้ามเนื้อที่เทรนวันนี้ — ฝังอยู่ในการ์ด Today's Workout เอง
// (แทนที่การ์ดใหญ่แยกต่างหาก ซึ่งซ้ำซ้อนกับการ์ด "สัดส่วนกล้ามเนื้อ (สัปดาห์นี้)" ที่มี body
// diagram + %/เซ็ตอยู่แล้ว — ข้อมูล "วันนี้เทรนอะไรบ้าง" ควรอยู่ในบริบทของ Today's Workout แทน)
// ถ้ายังไม่เทรนวันนี้เลย ไม่ต้องแสดงกริดเปล่าๆ 7 ช่อง แค่ข้อความสั้นๆ พอ
export default function TodayMuscleChips({ todayWorkouts }: TodayMuscleChipsProps) {
  const trainedList = useMemo(() => {
    const set = new Set<MuscleGroup>()
    for (const w of todayWorkouts) {
      if (w.muscle_group && (VOLUME_MUSCLES as readonly string[]).includes(w.muscle_group)) {
        set.add(w.muscle_group as MuscleGroup)
      }
      for (const m of w.secondary_muscles ?? []) {
        if ((VOLUME_MUSCLES as readonly string[]).includes(m)) set.add(m as MuscleGroup)
      }
    }
    // คงลำดับตาม VOLUME_MUSCLES แทนลำดับที่ insert เข้า set
    return VOLUME_MUSCLES.filter((g) => set.has(g))
  }, [todayWorkouts])

  if (trainedList.length === 0) {
    return <p className="text-[12px] text-muted mt-3">ยังไม่ได้เทรนวันนี้ — เริ่มบันทึกแล้วกล้ามเนื้อจะขึ้นตรงนี้</p>
  }

  return (
    <div className="flex items-center flex-wrap gap-1.5 mt-3">
      <span className="text-[12px] text-muted mr-0.5">วันนี้:</span>
      {trainedList.map((group) => {
        const color = MUSCLE_GROUP_COLORS[group]
        return (
          <span
            key={group}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-display tracked uppercase"
            style={{ borderColor: `${color}55`, backgroundColor: `${color}22`, color }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}99` }} />
            {group}
          </span>
        )
      })}
    </div>
  )
}
