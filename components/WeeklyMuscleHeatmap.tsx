'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange } from '@/lib/dashboardStats'
import { VOLUME_MUSCLES, MUSCLE_GROUP_COLORS, MUSCLE_GROUP_LABELS_EN, type MuscleGroup } from '@/lib/muscle-groups'
import AnimatedBarFill from './AnimatedBarFill'
import Skeleton from './Skeleton'
import MuscleBodyDiagram from './MuscleBodyDiagram'

// Graphic Muscle Heatmap — ไดอะแกรมรูปร่างคน (วาดเองด้วย SVG ธรรมดา ไม่พึ่ง react-body-highlighter
// เพราะไลบรารีนั้นไม่รองรับกล้ามเนื้อขา) ไล่สีตาม % สัดส่วนเซ็ตของกลุ่มกล้ามเนื้อนั้นเทียบกับ
// เซ็ตทั้งหมดในสัปดาห์นี้ พร้อมด้านหลัง (back view) และรายการท่าที่โดนกลุ่มนั้นบ้าง
type BalanceTier = 'good' | 'ok' | 'poor'

interface GroupStat {
  group: MuscleGroup
  sets: number
  pct: number
  topExercises: { name: string; sets: number }[]
}

// กลุ่มที่ปรากฏในไดอะแกรมของแต่ละมุมมอง — ด้านหน้าไม่มี "หลัง", ด้านหลังไม่มี "อก"/"แกนกลางลำตัว"
// "น่อง" ใส่ไว้ทั้งสองมุมมอง (ใช้ mask ที่ครอบตั้งแต่ใต้เข่าลงไปทั้งด้านหน้า/หลัง)
const FRONT_REGIONS: MuscleGroup[] = ['ไหล่', 'อก', 'แขน', 'แกนกลางลำตัว', 'ขา', 'น่อง']
const BACK_REGIONS: MuscleGroup[] = ['ไหล่', 'หลัง', 'แขน', 'ขา', 'น่อง']

// ลำดับแสดงผลของรายการด้านขวา — จัดให้ตรงกับ reference (อก, หลัง, ไหล่, แขน, แกนกลางลำตัว, ขา, น่อง)
// แยกจาก VOLUME_MUSCLES ตัวหลัก (ซึ่งใช้ลำดับอื่นและถูกอ้างจากหลายที่ในแอป) เพื่อไม่กระทบจุดอื่น
const DISPLAY_ORDER: MuscleGroup[] = ['อก', 'หลัง', 'ไหล่', 'แขน', 'แกนกลางลำตัว', 'ขา', 'น่อง']

const BALANCE_COLOR: Record<BalanceTier, string> = {
  good: '#7A9B57', // moss
  ok: '#E8A33D', // amber
  poor: '#C1503A', // rust
}

// ป้ายข้อความ + ลูกศรของ balance tier — ใช้ในแถบสรุปด้านล่างการ์ด (แทนที่ข้อความ AI Coach เดิม)
const BALANCE_TIER_LABEL: Record<BalanceTier, string> = {
  good: 'ดีเยี่ยม',
  ok: 'ปานกลาง',
  poor: 'ควรปรับปรุง',
}
const BALANCE_TIER_ARROW: Record<BalanceTier, string> = {
  good: '↑',
  ok: '→',
  poor: '↓',
}

function balanceTier(pct: number): BalanceTier {
  if (pct >= 80) return 'good'
  if (pct >= 50) return 'ok'
  return 'poor'
}

// แปลง % ส่วนแบ่งของกลุ่ม เทียบกับเซ็ตรวมทั้งสัปดาห์ ให้เป็นความเข้ม opacity ของสีกลุ่มนั้น
// (เส้นโค้ง: 0% = จาง 12%, ตั้งแต่ ~35% ขึ้นไป = เข้มเต็มที่ เพราะเฉลี่ยแล้ว 6 กลุ่มจะอยู่ราว 16-17% ต่อกลุ่ม)
function intensityOpacity(pct: number): number {
  if (pct <= 0) return 0.12
  return Math.min(1, 0.12 + (pct / 35) * 0.88)
}

export default function WeeklyMuscleHeatmap() {
  const supabase = createClient()
  const { start, end } = getWeekRange()
  const [expanded, setExpanded] = useState<MuscleGroup | null>(null)
  const [view, setView] = useState<'volume' | 'balance'>('volume')

  const { data, isLoading } = useQuery({
    queryKey: ['weekly-muscle-heatmap', start, end],
    queryFn: async () => {
      const { data } = await supabase
        .from('workouts')
        .select('muscle_group, sets, exercise_name')
        .eq('type', 'strength')
        .gte('performed_at', start)
        .lte('performed_at', end)

      const rows = (data as { muscle_group: string | null; sets: number | null; exercise_name: string | null }[]) ?? []
      const setsByGroup: Record<string, number> = {}
      const exercisesByGroup: Record<string, Record<string, number>> = {}
      rows.forEach((r) => {
        if (!r.muscle_group) return
        const sets = r.sets ?? 0
        setsByGroup[r.muscle_group] = (setsByGroup[r.muscle_group] ?? 0) + sets
        const exMap = (exercisesByGroup[r.muscle_group] ??= {})
        const name = r.exercise_name ?? 'ไม่ระบุชื่อท่า'
        exMap[name] = (exMap[name] ?? 0) + sets
      })
      return { setsByGroup, exercisesByGroup }
    },
    staleTime: 60_000,
  })

  const stats: GroupStat[] = useMemo(() => {
    const setsByGroup = data?.setsByGroup ?? {}
    const exercisesByGroup = data?.exercisesByGroup ?? {}
    const totalSets = VOLUME_MUSCLES.reduce((sum, g) => sum + (setsByGroup[g] ?? 0), 0)
    return VOLUME_MUSCLES.map((group) => {
      const sets = setsByGroup[group] ?? 0
      const pct = totalSets > 0 ? (sets / totalSets) * 100 : 0
      const topExercises = Object.entries(exercisesByGroup[group] ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name, exSets]) => ({ name, sets: exSets }))
      return { group, sets, pct, topExercises }
    })
  }, [data])

  const statByGroup = useMemo(() => {
    const map = new Map<MuscleGroup, GroupStat>()
    stats.forEach((s) => map.set(s.group, s))
    return map
  }, [stats])

  const hasAnyData = stats.some((s) => s.sets > 0)

  const totalSets = useMemo(() => stats.reduce((sum, s) => sum + s.sets, 0), [stats])
  const totalExercises = useMemo(() => {
    const exercisesByGroup = data?.exercisesByGroup ?? {}
    const names = new Set<string>()
    Object.values(exercisesByGroup).forEach((exMap) => Object.keys(exMap).forEach((name) => names.add(name)))
    return names.size
  }, [data])

  // Balance score — เทียบ % ของแต่ละกลุ่มกับสัดส่วนที่ "เท่ากันทุกกลุ่มพอดี" (100/6 ≈ 16.7%)
  // ยิ่งกลุ่มไหนเบี่ยงจากค่านี้มาก (ฝึกหนักไปทางเดียว หรือไม่ฝึกเลย) คะแนนยิ่งลด
  const balance = useMemo(() => {
    if (!hasAnyData) return null
    const idealPct = 100 / VOLUME_MUSCLES.length
    const avgDeviation = stats.reduce((sum, s) => sum + Math.abs(s.pct - idealPct), 0) / stats.length
    const pct = Math.max(0, Math.min(100, Math.round(100 - (avgDeviation / idealPct) * 100)))
    return { pct, tier: balanceTier(pct) }
  }, [stats, hasAnyData])

  // กลุ่มเด่น/ด้อย — จัดอันดับตาม % ส่วนแบ่งเซ็ตของสัปดาห์นี้ (สมมติฐาน: เด่น = 3 อันดับบนสุด,
  // ด้อย = 2 อันดับล่างสุด — ถ้าต้องการเกณฑ์อื่น เช่น เทียบกับเป้าหมายต่อกลุ่มแทน แจ้งได้)
  const { topGroups, bottomGroups } = useMemo(() => {
    if (!hasAnyData) return { topGroups: [] as MuscleGroup[], bottomGroups: [] as MuscleGroup[] }
    const sorted = [...stats].sort((a, b) => b.pct - a.pct)
    return {
      topGroups: sorted.slice(0, 3).map((s) => s.group),
      bottomGroups: sorted.slice(-2).map((s) => s.group),
    }
  }, [stats, hasAnyData])

  // แท็บ "ความสมดุล" — ให้คะแนนความสมดุลรายกลุ่ม (เทียบ % ของกลุ่มนั้นกับสัดส่วนอุดมคติ 100/6 ≈ 16.7%
  // แบบเดียวกับที่ใช้คำนวณ Balance score รวมด้านล่าง) แล้วเรียงกลุ่มที่เบี่ยงเบนมากสุดขึ้นบนสุด เพื่อชี้
  // ให้เห็นจุดที่ควรปรับก่อน ต่างจากแท็บ "ปริมาณ" ที่เรียงลำดับคงที่ตาม DISPLAY_ORDER เสมอ
  const idealPct = 100 / VOLUME_MUSCLES.length
  function rowTier(pct: number): BalanceTier {
    const score = Math.max(0, Math.min(100, Math.round(100 - (Math.abs(pct - idealPct) / idealPct) * 100)))
    return balanceTier(score)
  }

  const displayGroups = useMemo(() => {
    if (view === 'volume') return DISPLAY_ORDER
    return [...stats].sort((a, b) => Math.abs(b.pct - idealPct) - Math.abs(a.pct - idealPct)).map((s) => s.group)
  }, [view, stats, idealPct])

  function groupOpacity(group: MuscleGroup) {
    return intensityOpacity(statByGroup.get(group)?.pct ?? 0)
  }

  function groupColor(group: MuscleGroup) {
    return MUSCLE_GROUP_COLORS[group]
  }

  function toggleExpand(group: MuscleGroup) {
    setExpanded((prev) => (prev === group ? null : group))
  }

  return (
    <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] tracked uppercase text-muted">Graphic Muscle Heatmap</p>
          <p className="font-display text-sm uppercase text-ink mt-0.5">สัดส่วนกล้ามเนื้อ (สัปดาห์นี้)</p>
        </div>
        <div className="shrink-0 flex items-center gap-0.5 rounded-full border border-line bg-surface2 p-0.5">
          <button
            type="button"
            onClick={() => setView('volume')}
            className="px-3 py-1 rounded-full text-[11px] font-medium transition-colors"
            style={view === 'volume' ? { backgroundColor: '#E8A33D22', color: '#E8A33D' } : { color: '#9498A0' }}
          >
            ปริมาณ
          </button>
          <button
            type="button"
            onClick={() => setView('balance')}
            className="px-3 py-1 rounded-full text-[11px] font-medium transition-colors"
            style={view === 'balance' ? { backgroundColor: '#E8A33D22', color: '#E8A33D' } : { color: '#9498A0' }}
          >
            ความสมดุล
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 pb-4">
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : (
        <div className="pb-4 flex flex-col sm:flex-row gap-3 sm:gap-1.5">
          {/* ไดอะแกรมร่างกาย ด้านหน้า+ด้านหลัง ชิดติดกัน — ขนาดลดลงจากเดิม (130/205/240px) ราว 28%
              เหลือ 95/150/175px และดึงชิดคอลัมน์ลิสต์ด้านขวามากขึ้น (pl-1 แทน pl-2, gap-1.5 แทน gap-3
              บนจอ sm ขึ้นไป — มือถือยังคง gap-3 เพราะเรียงเป็นคอลัมน์ ไม่ใช่แถว) ตามมอกอัพที่ยืนยันแล้ว
              lg ลดอีกครั้งจาก 175px เหลือ 130px เพราะการ์ดนี้แคบลง (col-span-6 แทน col-span-9 ในหน้า
              dashboard) ทำให้คอลัมน์ลิสต์ด้านขวาแน่นและชื่อกลุ่มกล้ามเนื้อ เช่น "แกนกลางลำตัว" ตัดคำ */}
          <div className="shrink-0 pl-1 flex items-center gap-0">
            <div className="w-[95px] sm:w-[150px] lg:w-[105px]">
              <MuscleBodyDiagram
                view="front"
                regions={FRONT_REGIONS}
                getOpacity={groupOpacity}
                getColor={groupColor}
                onClickGroup={toggleExpand}
                width={250}
              />
            </div>
            <div className="w-[95px] sm:w-[150px] lg:w-[105px]">
              <MuscleBodyDiagram
                view="back"
                regions={BACK_REGIONS}
                getOpacity={groupOpacity}
                getColor={groupColor}
                onClickGroup={toggleExpand}
                width={250}
              />
            </div>
          </div>

          {/* รายการสัดส่วน + breakdown ท่า */}
          <div className="flex-1 min-w-0 space-y-1.5 px-4 sm:pl-0">
            {!hasAnyData ? (
              <p className="text-xs text-muted text-center py-6">ยังไม่มีข้อมูลสัปดาห์นี้ — เริ่มบันทึกแล้วสัดส่วนจะขึ้นที่นี่</p>
            ) : (
              displayGroups.map((group) => {
                const s = statByGroup.get(group)
                if (!s) return null
                const isOpen = expanded === s.group
                const color = view === 'balance' ? BALANCE_COLOR[rowTier(s.pct)] : MUSCLE_GROUP_COLORS[s.group]
                return (
                  <div key={s.group} className="rounded-md bg-surface2 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleExpand(s.group)}
                      className="w-full flex flex-col gap-1 px-2.5 py-1.5 text-left"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color, opacity: intensityOpacity(s.pct) }} />
                        <span className="text-xs text-ink flex-1 min-w-0 truncate">
                          {s.group} <span className="text-muted text-[10px]">({MUSCLE_GROUP_LABELS_EN[s.group]})</span>
                        </span>
                        <span className="text-[11px] font-mono font-bold shrink-0" style={{ color }}>
                          {Math.round(s.pct)}%
                        </span>
                        <span className="text-[10px] font-mono text-muted shrink-0">{s.sets} เซ็ต</span>
                        {s.topExercises.length > 0 && <span className="text-muted text-[10px] shrink-0">{isOpen ? '▲' : '▼'}</span>}
                      </span>
                      <span className="relative h-1.5 rounded-full bg-bg/60 overflow-hidden">
                        <AnimatedBarFill pct={s.pct} color={color} />
                      </span>
                    </button>
                    {isOpen && s.topExercises.length > 0 && (
                      <ul className="px-2.5 pb-2 space-y-1">
                        {s.topExercises.map((ex) => (
                          <li key={ex.name} className="flex items-center justify-between text-[11px] text-muted pl-[18px]">
                            <span className="truncate">{ex.name}</span>
                            <span className="font-mono shrink-0 ml-2">{ex.sets} เซ็ต</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {!isLoading && hasAnyData && balance && (
        <div className="border-t border-line px-2 py-3 grid grid-cols-[1fr_1fr_1.6fr_1fr_1fr] gap-1">
          <div className="text-center px-1">
            <p className="text-[10px] text-muted">รวมสัปดาห์นี้</p>
            <p className="font-mono font-bold text-lg text-ink leading-tight mt-0.5">
              {totalSets} <span className="text-xs font-sans font-normal text-muted">เซ็ต</span>
            </p>
          </div>
          <div className="text-center border-l border-line px-1">
            <p className="text-[10px] text-muted">รวมสัปดาห์นี้</p>
            <p className="font-mono font-bold text-lg text-ink leading-tight mt-0.5">
              {totalExercises} <span className="text-xs font-sans font-normal text-muted">ท่า</span>
            </p>
          </div>
          <div className="text-center border-l border-line px-1 flex items-center justify-center">
            <p className="font-mono font-bold text-lg leading-tight flex items-center gap-1.5 flex-wrap justify-center" style={{ color: BALANCE_COLOR[balance.tier] }}>
              <span>Balance {balance.pct}%</span>
              <span
                className="text-[11px] font-sans font-bold flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${BALANCE_COLOR[balance.tier]}26` }}
              >
                <span className="font-bold">{BALANCE_TIER_ARROW[balance.tier]}</span>
                {BALANCE_TIER_LABEL[balance.tier]}
              </span>
            </p>
          </div>
          <div className="text-center border-l border-line px-1">
            <p className="text-[11px] font-medium" style={{ color: BALANCE_COLOR.good }}>
              กล้ามเนื้อเด่น
            </p>
            <p className="text-[10px] text-muted mt-0.5">{topGroups.join(', ')}</p>
          </div>
          <div className="text-center border-l border-line px-1">
            <p className="text-[11px] font-medium" style={{ color: BALANCE_COLOR.poor }}>
              กล้ามเนื้อด้อย
            </p>
            <p className="text-[10px] text-muted mt-0.5">{bottomGroups.join(', ')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
