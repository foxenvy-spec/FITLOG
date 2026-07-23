import type { DaySummary } from '@/lib/workoutDisplay'
import { formatDuration } from '@/lib/workoutDisplay'
import type { WeightUnit } from '@/lib/weightUnit'

// สรุปภาพรวมของวันนั้นๆ วางไว้บนสุดก่อนรายการท่าออกกำลังกาย ให้รู้ภาพรวมได้ภายใน 2 วินาที
// โดยไม่ต้องไล่อ่านทีละท่า
export default function DaySummaryHeader({
  summary,
  prCount,
  unit,
  toDisplay,
}: {
  summary: DaySummary
  prCount: number
  unit: WeightUnit
  toDisplay: (kg: number) => number
}) {
  return (
    <div className="rounded-lg bg-surface border border-line shadow-elevated px-4 py-3.5 mb-3 space-y-1.5">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink">
        {summary.caloriesKcal > 0 && <span>🔥 {Math.round(summary.caloriesKcal).toLocaleString()} kcal</span>}
        <span>🏋 {summary.exerciseCount} Exercises</span>
        {summary.totalVolumeKg > 0 && (
          <span>
            📦 {Math.round(toDisplay(summary.totalVolumeKg)).toLocaleString()} {unit}
          </span>
        )}
        {summary.durationMin !== null && <span>⏱ {formatDuration(summary.durationMin)}</span>}
        {prCount > 0 && <span className="text-violet">🏆 PR +{prCount}</span>}
      </div>
      {summary.muscleGroups.length > 0 && <p className="text-sm text-muted">💪 {summary.muscleGroups.join(' • ')}</p>}
    </div>
  )
}
