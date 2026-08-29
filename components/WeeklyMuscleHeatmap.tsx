'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  getWeekRange,
  computeMuscleBalance,
  balanceStatusTier,
  BALANCE_STATUS_LABEL,
  computeRecoveryPct,
  recoveryTier,
  aggregateMuscleTrainingQuality,
} from '@/lib/dashboardStats'
import { VOLUME_MUSCLES, MUSCLE_GROUP_COLORS, MUSCLE_GROUP_LABELS_EN, type MuscleGroup } from '@/lib/muscle-groups'
import { useWeightUnit } from './WeightUnitProvider'
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
  // Priority 4 (Training Quality ต่อกล้ามเนื้อ) — ขยายจากเดิมที่มีแค่ "สัดส่วนเซ็ต" เพียงอย่างเดียว
  // ให้เห็นภาพครบ: ปริมาณจริง (kg), ความถี่ (ครั้ง/สัปดาห์), ความหนัก (RPE เฉลี่ย — ตัวเดียวกับที่
  // computeProgressiveOverload/computeSessionMuscleRecovery ใช้เป็นตัวแทนความหนักอยู่แล้ว ไม่ใช้
  // น้ำหนักดิบเฉลี่ยเพราะเทียบข้ามท่า/กลุ่มกล้ามเนื้อกันไม่ได้), และการฟื้นตัว (นำมาจากเอนจิน
  // computeRecoveryPct ตัวเดียวกับหน้า Recovery เพื่อให้ตัวเลขตรงกันทั้งแอป)
  volumeKg: number
  sessions: number
  avgRpe: number | null
  recoveryPct: number
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
// หมายเหตุ: label ใช้ BALANCE_STATUS_LABEL จาก lib/dashboardStats.ts (ตัวเดียวกับการ์ด WeeklyVolume)
// เพื่อให้ตัวเลข/คำอธิบาย Balance ตรงกันทั้งสองการ์ด — เดิมการ์ดนี้คำนวณ Balance ด้วยสูตรของตัวเอง
// (average deviation จากค่าอุดมคติ) ซึ่งให้ผลต่างจากสูตร coefficient-of-variation ที่ WeeklyVolume ใช้
// ทำให้สองการ์ดโชว์ Balance % คนละค่ากับข้อมูลชุดเดียวกัน — เปลี่ยนมาใช้ computeMuscleBalance ร่วมกัน
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
  const { toDisplay, unit } = useWeightUnit()
  const [expanded, setExpanded] = useState<MuscleGroup | null>(null)
  const [view, setView] = useState<'volume' | 'balance'>('volume')

  const { data, isLoading } = useQuery({
    queryKey: ['weekly-muscle-heatmap', start, end],
    queryFn: async () => {
      const { data } = await supabase
        .from('workouts')
        .select('muscle_group, sets, exercise_name, performed_at, reps, weight_kg, total_volume_kg, rpe')
        .eq('type', 'strength')
        .gte('performed_at', start)
        .lte('performed_at', end)

      const rows =
        (data as {
          muscle_group: string | null
          sets: number | null
          exercise_name: string | null
          performed_at: string
          reps: number | null
          weight_kg: number | null
          total_volume_kg: number | null
          rpe: number | null
        }[]) ?? []
      const exercisesByGroup: Record<string, Record<string, number>> = {}
      rows.forEach((r) => {
        if (!r.muscle_group) return
        const exMap = (exercisesByGroup[r.muscle_group] ??= {})
        const name = r.exercise_name ?? 'ไม่ระบุชื่อท่า'
        exMap[name] = (exMap[name] ?? 0) + (r.sets ?? 0)
      })
      const qualityByGroup = aggregateMuscleTrainingQuality(rows)
      return { exercisesByGroup, qualityByGroup }
    },
    staleTime: 60_000,
  })

  // Recovery ต่อกลุ่ม ต้องรู้วันที่ฝึกล่าสุด "จริง" (อาจเก่ากว่าสัปดาห์นี้) จึงต้อง query แยกจากด้านบน
  // (ซึ่งจำกัดแค่ start..end ของสัปดาห์นี้) — รูปแบบเดียวกับ app/(app)/recovery/page.tsx ทุกประการ
  // เพื่อให้ Recovery % ที่โชว์ตรงนี้ตรงกับหน้า Recovery เป๊ะ ไม่ใช่คำนวณใหม่ด้วยเกณฑ์ต่างกัน
  const { data: lastTrainedByMuscle } = useQuery({
    queryKey: ['weekly-muscle-heatmap-last-trained'],
    queryFn: async () => {
      const { data } = await supabase
        .from('workouts')
        .select('muscle_group, performed_at')
        .eq('type', 'strength')
        .order('performed_at', { ascending: false })
        .limit(500)
      const rows = (data as { muscle_group: string | null; performed_at: string }[]) ?? []
      const map: Record<string, string> = {}
      rows.forEach((r) => {
        if (!r.muscle_group) return
        if (!map[r.muscle_group]) map[r.muscle_group] = r.performed_at
      })
      return map
    },
    staleTime: 60_000,
  })

  const stats: GroupStat[] = useMemo(() => {
    const exercisesByGroup = data?.exercisesByGroup ?? {}
    const qualityByGroup = data?.qualityByGroup ?? {}
    const totalSets = VOLUME_MUSCLES.reduce((sum, g) => sum + (qualityByGroup[g]?.sets ?? 0), 0)
    return VOLUME_MUSCLES.map((group) => {
      const quality = qualityByGroup[group]
      const sets = quality?.sets ?? 0
      const pct = totalSets > 0 ? (sets / totalSets) * 100 : 0
      const topExercises = Object.entries(exercisesByGroup[group] ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name, exSets]) => ({ name, sets: exSets }))
      const recoveryPct = computeRecoveryPct(lastTrainedByMuscle?.[group] ?? null, group)
      return {
        group,
        sets,
        pct,
        topExercises,
        volumeKg: quality?.volumeKg ?? 0,
        sessions: quality?.sessions ?? 0,
        avgRpe: quality?.avgRpe ?? null,
        recoveryPct,
      }
    })
  }, [data, lastTrainedByMuscle])

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
    const pct = computeMuscleBalance(stats.map((s) => s.pct))
    return { pct, tier: balanceStatusTier(pct) }
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

  // v1: ฟีดแบ็ก "User ต้องการตอบคำถามเดียว: สัปดาห์นี้เล่นกล้ามเนื้อส่วนไหนมากที่สุด?" — แท็บ "ปริมาณ" เดิม
  // ใช้ DISPLAY_ORDER (ลำดับกายวิภาคคงที่ อก→หลัง→ไหล่→...) ไม่ได้เรียงตามปริมาณเลย ทั้งที่ชื่อแท็บคือ "ปริมาณ"
  // — เปลี่ยนให้เรียงจากเซ็ตเยอะสุดไปน้อยสุดจริงๆ ตรงกับชื่อแท็บและคำถามที่ผู้ใช้ต้องการคำตอบ
  const displayGroups = useMemo(() => {
    if (view === 'volume') return [...stats].sort((a, b) => b.pct - a.pct).map((s) => s.group)
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
    // v49: rounded-lg (8px) -> rounded-card (24px, token เดียวกับ PremiumCard) ตามฟีดแบ็ก Radius
    <div className="rounded-card bg-surface border border-line shadow-elevated overflow-hidden">
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
                        <span className="text-muted text-[10px] shrink-0">{isOpen ? '▲' : '▼'}</span>
                      </span>
                      <span className="relative h-1.5 rounded-full bg-bg/60 overflow-hidden">
                        <AnimatedBarFill pct={s.pct} color={color} />
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-2.5 pb-2 space-y-2">
                        {/* Priority 4 — Training Quality: Sets/Sessions ก็มีอยู่แล้วเป็น pct/sets ด้านบน
                            แถวนี้เพิ่ม Volume(kg)/ความถี่/ความหนัก(RPE)/Recovery ที่ไม่เคยรวมไว้ที่เดียวกัน
                            มาก่อน — ใช้ pl-[18px] ให้ชิดกับจุดสีด้านบน (ระยะเดียวกับลิสต์ท่าด้านล่าง) */}
                        <div className="pl-[18px] flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                          <span className="text-muted">
                            <span className="font-mono text-ink">{s.sessions}</span> ครั้ง/สัปดาห์
                          </span>
                          <span className="text-muted">
                            Volume <span className="font-mono text-ink">{Math.round(toDisplay(s.volumeKg)).toLocaleString('th-TH')}</span> {unit}
                          </span>
                          {s.avgRpe !== null && (
                            <span className="text-muted">
                              RPE เฉลี่ย <span className="font-mono text-ink">{s.avgRpe}</span>
                            </span>
                          )}
                          <span style={{ color: recoveryTier(s.recoveryPct).color }}>
                            Recovery <span className="font-mono">{s.recoveryPct}%</span>
                          </span>
                        </div>
                        {s.topExercises.length > 0 && (
                          <ul className="space-y-1">
                            {s.topExercises.map((ex) => (
                              <li key={ex.name} className="flex items-center justify-between text-[11px] text-muted pl-[18px]">
                                <span className="truncate">{ex.name}</span>
                                <span className="font-mono shrink-0 ml-2">{ex.sets} เซ็ต</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
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
            <p className="text-[10px] text-muted">จำนวนเซ็ต</p>
            <p className="font-mono font-bold text-lg text-ink leading-tight mt-0.5">
              {totalSets} <span className="text-xs font-sans font-normal text-muted">เซ็ต</span>
            </p>
          </div>
          <div className="text-center border-l border-line px-1">
            <p className="text-[10px] text-muted">จำนวนท่า</p>
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
                {BALANCE_STATUS_LABEL[balance.tier]}
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
