import type { ExerciseProgress } from '@/lib/workoutDisplay'

export default function ExerciseProgressBadge({
  progress,
  format,
}: {
  progress: ExerciseProgress
  format: (kg: number | null | undefined) => string
}) {
  // pr/bestVolume/up/down คือคำตอบของคำถาม "วันนี้เก่งกว่าครั้งก่อนหรือยัง" —
  // โชว์เป็นบล็อกเล็กหลายบรรทัด (ค่าที่เปลี่ยน + เทียบกับอะไร + ป้ายสถิติ) แทนบรรทัดเดียว
  // ให้เห็นชัดทันทีโดยไม่ต้องกดดูอะไรเพิ่ม
  if (progress.kind === 'pr') {
    return (
      <div className="text-right shrink-0 leading-tight">
        <span className="inline-block rounded-full bg-violetdim px-2.5 py-1">
          <p className="text-[12px] font-semibold text-violet">PR 🎉</p>
        </span>
        <p className="text-[11px] font-mono font-semibold text-moss tabular mt-1">▲ +{format(progress.deltaKg)}</p>
        <p className="text-[9px] text-muted">vs Last Session</p>
      </div>
    )
  }
  if (progress.kind === 'bestVolume') {
    return (
      <div className="text-right shrink-0 leading-tight">
        <span className="inline-block rounded-full bg-violetdim px-2.5 py-1">
          <p className="text-[12px] font-semibold text-violet">🏆 Best Volume</p>
        </span>
        {progress.topPercent !== null && <p className="text-[9px] text-muted mt-1">Top {progress.topPercent}%</p>}
      </div>
    )
  }
  if (progress.kind === 'up') {
    return (
      <div className="text-right shrink-0 leading-tight">
        <span className="inline-block rounded-full bg-mossdim px-2.5 py-1">
          <p className="text-[12px] font-mono font-semibold text-moss tabular">▲ +{format(progress.deltaKg)}</p>
        </span>
        <p className="text-[9px] text-muted mt-1">vs Last Session</p>
      </div>
    )
  }
  if (progress.kind === 'down') {
    return (
      <div className="text-right shrink-0 leading-tight">
        <span className="inline-block rounded-full bg-rustdim px-2.5 py-1">
          <p className="text-[12px] font-mono font-semibold text-rusttext tabular">▼ -{format(progress.deltaKg)}</p>
        </span>
        <p className="text-[9px] text-muted mt-1">vs Last Session</p>
      </div>
    )
  }
  if (progress.kind === 'repsUp') {
    return <span className="text-[10px] font-mono text-moss shrink-0">🟢 +{progress.deltaReps} reps</span>
  }
  if (progress.kind === 'repsDown') {
    return <span className="text-[10px] font-mono text-rusttext shrink-0">🔴 -{progress.deltaReps} reps</span>
  }
  if (progress.kind === 'same') {
    return <span className="text-[10px] font-mono text-muted shrink-0">⚪ Same</span>
  }
  return null
}
