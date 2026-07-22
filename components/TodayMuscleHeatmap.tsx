'use client'

import { useMemo } from 'react'
import type { Workout } from '@/lib/types'
import { VOLUME_MUSCLES, MUSCLE_GROUP_COLORS, MUSCLE_GROUP_LABELS_EN, type MuscleGroup } from '@/lib/muscle-groups'

interface TodayMuscleHeatmapProps {
  todayWorkouts: Workout[]
}

// การ์ด "กล้ามเนื้อที่เทรนวันนี้" — สรุปกลุ่มกล้ามเนื้อ (primary + secondary) จาก workout ของวันนี้
// เป็น chip สีต่อกลุ่ม กลุ่มที่เทรนแล้ว = สีเต็ม/เรืองแสงเบาๆ, กลุ่มที่ยังไม่เทรน = สีเทาจาง
// ไม่ใช้ไดอะแกรมรูปร่างคน เพราะไลบรารีที่มี (react-body-highlighter) รองรับแค่กล้ามเนื้อช่วงบน
// ไม่มีขา ซึ่งจะพลาดวันเทรนขาไปเลย — ใช้ chip ตามกลุ่มกล้ามเนื้อแทนเพื่อให้ครอบคลุมทุกกลุ่ม
export default function TodayMuscleHeatmap({ todayWorkouts }: TodayMuscleHeatmapProps) {
  const trainedSet = useMemo(() => {
    const set = new Set<MuscleGroup>()
    for (const w of todayWorkouts) {
      if (w.muscle_group && (VOLUME_MUSCLES as readonly string[]).includes(w.muscle_group)) {
        set.add(w.muscle_group as MuscleGroup)
      }
      for (const m of w.secondary_muscles ?? []) {
        if ((VOLUME_MUSCLES as readonly string[]).includes(m)) set.add(m as MuscleGroup)
      }
    }
    return set
  }, [todayWorkouts])

  const hasTrainedToday = trainedSet.size > 0

  return (
    <div className="rounded-lg border border-amber/15 shadow-hero px-4 py-4 bg-surface">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] tracked uppercase text-muted">กล้ามเนื้อที่เทรนวันนี้</p>
        {hasTrainedToday && (
          <span className="text-[10px] font-mono text-muted">{trainedSet.size}/{VOLUME_MUSCLES.length}</span>
        )}
      </div>
      {hasTrainedToday ? (
        <div className="grid grid-cols-3 gap-2">
          {VOLUME_MUSCLES.map((group) => {
            const active = trainedSet.has(group)
            const color = MUSCLE_GROUP_COLORS[group]
            return (
              <div
                key={group}
                className="rounded-lg border px-2.5 py-2.5 text-center transition-all"
                style={
                  active
                    ? {
                        borderColor: color,
                        backgroundColor: `${color}33`,
                        boxShadow: `0 0 0 1px ${color}44, 0 4px 14px -4px ${color}66`,
                      }
                    : { borderColor: '#2E333A', backgroundColor: 'transparent', opacity: 0.4 }
                }
              >
                <div
                  className="w-2.5 h-2.5 rounded-full mx-auto mb-1.5"
                  style={{
                    backgroundColor: active ? color : '#9498A0',
                    boxShadow: active ? `0 0 8px ${color}99` : 'none',
                  }}
                />
                <p className="text-[11px] font-display tracked uppercase" style={{ color: active ? color : '#9498A0' }}>
                  {group}
                </p>
                <p className="text-[9px] text-muted">{MUSCLE_GROUP_LABELS_EN[group]}</p>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-muted text-center py-3">ยังไม่ได้เทรนวันนี้ — เริ่มบันทึกแล้วกล้ามเนื้อจะติดสีที่นี่</p>
      )}
    </div>
  )
}
