'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange } from '@/lib/dashboardStats'
import { MUSCLE_GROUP_COLORS, VOLUME_MUSCLES, type MuscleGroup } from '@/lib/muscle-groups'

async function fetchWeekSets(supabase: ReturnType<typeof createClient>) {
  const { start, end } = getWeekRange()
  const { data } = await supabase
    .from('workouts')
    .select('muscle_group, sets, exercise_name')
    .eq('type', 'strength')
    .gte('performed_at', start)
    .lte('performed_at', end)

  const rows = (data as { muscle_group: string | null; sets: number | null; exercise_name: string | null }[]) ?? []
  const setsByMuscle: Record<string, number> = {}
  const exerciseNames = new Set<string>()
  rows.forEach((r) => {
    if (r.muscle_group) setsByMuscle[r.muscle_group] = (setsByMuscle[r.muscle_group] ?? 0) + (r.sets ?? 0)
    if (r.exercise_name) exerciseNames.add(r.exercise_name)
  })
  return { setsByMuscle, distinctExercises: exerciseNames.size }
}

// วัดความสมดุลของการกระจายเซ็ตข้ามกลุ่มกล้ามเนื้อ — ใช้สัมประสิทธิ์การแปรผัน (coefficient of
// variation) ของสัดส่วน แล้วแปลงกลับเป็น 0-100% (100% = กระจายเท่ากันทุกกลุ่มเป๊ะ, ต่ำ = กระจุกตัว)
// เป็นตัวชี้วัดคร่าวๆ ให้เห็นภาพรวม ไม่ใช่คำแนะนำทางการแพทย์/โภชนาการ
function computeBalance(shares: number[]): number {
  const nonZero = shares.filter((s) => s > 0)
  if (nonZero.length <= 1) return nonZero.length === 0 ? 0 : 100
  const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length
  const variance = nonZero.reduce((a, b) => a + (b - mean) ** 2, 0) / nonZero.length
  const cv = Math.sqrt(variance) / mean
  // cv 0 -> 100%, cv >= 1 -> 0% (clamp) — สเกลคร่าวๆ พอให้เทียบกันได้ ไม่ใช่สูตรมาตรฐานตายตัว
  return Math.max(0, Math.round(100 - cv * 100))
}

export default function MuscleShareCard() {
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: ['muscle-share'],
    queryFn: () => fetchWeekSets(supabase),
    staleTime: 60_000,
  })

  const rows = useMemo(() => {
    const setsByMuscle = data?.setsByMuscle ?? {}
    const totalSets = VOLUME_MUSCLES.reduce((sum, mg) => sum + (setsByMuscle[mg] ?? 0), 0)
    return VOLUME_MUSCLES.map((mg) => {
      const sets = setsByMuscle[mg] ?? 0
      const pct = totalSets > 0 ? Math.round((sets / totalSets) * 100) : 0
      return { mg, sets, pct }
    })
  }, [data])

  const totalSets = rows.reduce((s, r) => s + r.sets, 0)
  const balance = computeBalance(rows.map((r) => r.pct))
  const maxPct = Math.max(1, ...rows.map((r) => r.pct))

  return (
    <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
      <div className="px-4 pt-3.5 pb-1">
        <p className="text-[10px] tracked uppercase text-muted">สัดส่วนกล้ามเนื้อ (สัปดาห์นี้)</p>
      </div>

      <div className="px-4 pb-4 flex flex-col sm:flex-row gap-4 sm:gap-5 items-start">
        {/* simplified body silhouette — front view, each region tinted by that muscle
            group's color at an opacity proportional to its share of this week's sets,
            so the figure itself reads as a rough "where did volume go" heatmap */}
        <div className="shrink-0 mx-auto sm:mx-0">
          <BodySilhouette shares={Object.fromEntries(rows.map((r) => [r.mg, r.pct])) as Record<MuscleGroup, number>} />
        </div>

        <div className="flex-1 w-full min-w-0 space-y-2.5">
          {isLoading
            ? null
            : rows.map(({ mg, sets, pct }) => (
                <div key={mg} className="flex items-center gap-2.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: MUSCLE_GROUP_COLORS[mg] }}
                  />
                  <span className="text-xs text-ink w-9 shrink-0">{mg}</span>
                  <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(pct / maxPct) * 100}%`, backgroundColor: MUSCLE_GROUP_COLORS[mg] }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-muted w-9 text-right shrink-0">{pct}%</span>
                  <span className="text-[11px] font-mono text-muted w-14 text-right shrink-0">{sets} เซ็ต</span>
                </div>
              ))}
        </div>
      </div>

      <div className="border-t border-line px-4 py-3 flex items-center justify-between">
        <div>
          <p className="font-mono text-sm text-ink">{totalSets} เซ็ต</p>
          <p className="text-[10px] text-muted">รวมสัปดาห์นี้</p>
        </div>
        <div>
          <p className="font-mono text-sm text-ink">{data?.distinctExercises ?? 0} ท่า</p>
          <p className="text-[10px] text-muted">รวมสัปดาห์นี้</p>
        </div>
        <a href="/stats" className="text-right">
          <p className="font-mono text-sm" style={{ color: balance >= 70 ? '#7A9B57' : '#E8A33D' }}>
            Balance {balance}%
          </p>
          <p className="text-[10px] text-amber">{balance >= 70 ? 'สมดุลดี' : 'ควรปรับปรุง →'}</p>
        </a>
      </div>
    </div>
  )
}

function BodySilhouette({ shares }: { shares: Partial<Record<MuscleGroup, number>> }) {
  const alpha = (mg: MuscleGroup, base = 0.28) => {
    const pct = shares[mg] ?? 0
    return Math.min(1, base + pct / 130)
  }
  const fill = (mg: MuscleGroup) => `${MUSCLE_GROUP_COLORS[mg]}${Math.round(alpha(mg) * 255).toString(16).padStart(2, '0')}`

  return (
    <svg viewBox="0 0 120 180" width="110" height="165" aria-hidden="true">
      {/* head */}
      <circle cx="60" cy="18" r="13" fill="#2E333A" />
      {/* shoulders / ไหล่ */}
      <circle cx="30" cy="42" r="11" fill={fill('ไหล่')} />
      <circle cx="90" cy="42" r="11" fill={fill('ไหล่')} />
      {/* arms / แขน */}
      <rect x="18" y="50" width="14" height="55" rx="7" fill={fill('แขน')} />
      <rect x="88" y="50" width="14" height="55" rx="7" fill={fill('แขน')} />
      {/* chest / อก */}
      <rect x="38" y="34" width="44" height="34" rx="10" fill={fill('อก')} />
      {/* core / แกนกลางลำตัว */}
      <rect x="40" y="68" width="40" height="42" rx="9" fill={fill('แกนกลางลำตัว')} />
      {/* back accent strip (ด้านหลัง แสดงเป็นขอบข้างลำตัวเพราะโมเดลเป็นมุมหน้า) */}
      <rect x="34" y="34" width="6" height="76" rx="3" fill={fill('หลัง')} />
      <rect x="80" y="34" width="6" height="76" rx="3" fill={fill('หลัง')} />
      {/* legs / ขา — ยังไม่นับใน VOLUME_MUSCLES หลัก โชว์เป็นสีเทากลาง */}
      <rect x="42" y="112" width="15" height="60" rx="7" fill="#2E333A" />
      <rect x="63" y="112" width="15" height="60" rx="7" fill="#2E333A" />
    </svg>
  )
}
