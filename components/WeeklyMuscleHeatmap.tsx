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
  volumeStatus,
  optimalVolumeRange,
  computeTrainingBalance,
  type VolumeStatus,
} from '@/lib/dashboardStats'
import { computePushPullBalance } from '@/lib/aiCoach'
import { COLORS, withAlpha } from '@/lib/theme'
import { fetchWeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
import { todayDayOfWeek } from '@/lib/weekdays'
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
  // Priority 5 (Training Balance อธิบายได้) — เดิมการ์ดนี้บอกแค่ "กล้ามเนื้อเด่น/ด้อย" จาก % ส่วนแบ่งเซ็ต
  // (top 3/bottom 2) ซึ่งเป็นค่าสัมพัทธ์ล้วนๆ ไม่บอกว่าเทียบกับเป้าหมายจริงของกลุ่มนั้นแล้วเกิน/ขาดแค่ไหน —
  // เพิ่มสถานะเทียบเป้าหมายรายสัปดาห์ (เอนจินเดียวกับการ์ด WeeklyVolume: volumeStatus) เข้ามาในแถวขยาย
  // ของทุกกลุ่ม (ไม่ใช่แค่ top/bottom) ให้ผู้ใช้อธิบายได้เองว่า Balance % นี้มาจากอะไรจริงๆ
  targetSets: number
  targetStatus: VolumeStatus
}

// ฟีดแบ็ก "อยากได้แค่ 3 สี (steel/moss/rust) ใช้ความเข้มสื่อระดับความรุนแรง" — ชุดสีเดียวกับ
// WeeklyVolume.tsx/WeeklyCardioVolume.tsx ให้การ์ดที่เกี่ยวข้องกับ volume target ทั้งหมดอ่านสอดคล้องกัน
const TARGET_STATUS_COLOR: Record<VolumeStatus, string> = {
  behind: withAlpha(COLORS.steel, '99'),
  onTrack: COLORS.steel,
  met: withAlpha(COLORS.moss, 'BF'),
  high: COLORS.moss,
  veryHigh: COLORS.rust,
}

const TARGET_STATUS_LABEL: Record<VolumeStatus, string> = {
  behind: 'ต่ำกว่าเป้า',
  onTrack: 'กำลังไปได้ดี',
  met: 'ถึงเป้าพอดี',
  high: 'เกินเป้า',
  veryHigh: 'เกินเป้ามาก',
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
  // ฟีดแบ็ก "Balance 58% ต้องอธิบายได้ — กดเข้าไปแล้วเห็น Upper/Lower, Push/Pull, จุดที่ควรปรับ"
  const [balanceDetailsOpen, setBalanceDetailsOpen] = useState(false)

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

  // ใช้ query key เดียวกับการ์ด WeeklyVolume (fetchWeeklyVolumeTargets) — react-query แชร์ cache ให้
  // อัตโนมัติเมื่อทั้งสองการ์ดแสดงพร้อมกันบน Dashboard ไม่ต้อง fetch ซ้ำ และเป้าหมายที่โชว์ตรงนี้จะตรงกับ
  // การ์ด WeeklyVolume เป๊ะเสมอ (ค่าเดียวกัน ไม่ใช่คำนวณ/ดึงแยกกันจนเพี้ยนกันได้)
  const { data: targets } = useQuery({
    queryKey: ['weekly-volume-targets'],
    queryFn: () => fetchWeeklyVolumeTargets(supabase),
    staleTime: 60_000,
  })
  const dayOfWeek1to7 = ((todayDayOfWeek() + 6) % 7) + 1

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
      const targetSets = targets?.[group] ?? 0
      const targetStatus = volumeStatus(sets, targetSets, dayOfWeek1to7)
      return {
        group,
        sets,
        pct,
        topExercises,
        targetSets,
        targetStatus,
        volumeKg: quality?.volumeKg ?? 0,
        sessions: quality?.sessions ?? 0,
        avgRpe: quality?.avgRpe ?? null,
        recoveryPct,
      }
    })
  }, [data, lastTrainedByMuscle, targets, dayOfWeek1to7])

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

  // ฟีดแบ็ก "Balance 58% ต้องอธิบายได้ — Upper/Lower %, Push/Pull %, จุดที่ควรปรับ, แนะนำสัปดาห์หน้า" —
  // ใช้ setsByMuscle ตัวเดียวกับที่ stats ข้างบนคำนวณไว้แล้ว (ไม่ query ซ้ำ) ผ่าน computeTrainingBalance
  // (Upper/Lower — ตัวเดียวกับที่ trainingBalanceInsight ใช้บน Dashboard) และ computePushPullBalance
  // (Push/Pull — ตัวเดียวกับการ์ด AI Coach) ให้ตัวเลขตรงกันทุกจุดในแอป ไม่คำนวณสูตรแยกใหม่
  const setsByMuscle = useMemo(() => {
    const map: Record<string, number> = {}
    stats.forEach((s) => {
      map[s.group] = s.sets
    })
    return map
  }, [stats])
  const trainingBalanceDetail = useMemo(
    () => (hasAnyData ? computeTrainingBalance(setsByMuscle, VOLUME_MUSCLES) : null),
    [setsByMuscle, hasAnyData]
  )
  const pushPull = useMemo(() => (hasAnyData ? computePushPullBalance(setsByMuscle) : null), [setsByMuscle, hasAnyData])
  // "จุดที่ควรปรับ" — กลุ่มที่เกินช่วงที่เหมาะสมไปมาก (veryHigh) หรือยังห่างเป้าหมายมาก (behind) ใช้
  // targetStatus ตัวเดียวกับที่แถวขยายรายกลุ่มด้านบนใช้อยู่แล้ว (volumeStatus, เอนจินเดียวกับ WeeklyVolume)
  const balanceIssues = useMemo(() => {
    const over = stats.filter((s) => s.targetStatus === 'veryHigh' && s.targetSets > 0)
    const under = stats.filter((s) => s.targetStatus === 'behind' && s.targetSets > 0)
    return { over, under }
  }, [stats])

  // ฟีดแบ็ก "Balance 58% ต้องอธิบายตัวเองได้ทันที ไม่ใช่ซ่อนหลังปุ่ม 'ดูรายละเอียด Balance' อย่างเดียว" —
  // สรุปสั้น ๆ 1 บรรทัดจาก balanceIssues ชุดเดียวกับที่ "จุดที่ควรปรับ" ในรายละเอียดใช้อยู่แล้ว (ไม่คำนวณซ้ำ
  // ไม่มโนข้อความเพิ่ม) หยิบกลุ่มที่เกินเป้ามากสุดไม่เกิน 2 กลุ่ม + กลุ่มที่ขาดเป้ามากสุด 1 กลุ่ม
  const balanceSummary = useMemo(() => {
    const over = [...balanceIssues.over]
      .sort((a, b) => b.sets - b.targetSets - (a.sets - a.targetSets))
      .slice(0, 2)
    const under = [...balanceIssues.under]
      .sort((a, b) => a.sets - a.targetSets - (b.sets - b.targetSets))
      .slice(0, 1)
    return [
      ...over.map((s) => `${s.group} +${s.sets - s.targetSets} เซ็ต`),
      ...under.map((s) => `${s.group} ${s.sets - s.targetSets} เซ็ต`),
    ].join(' · ')
  }, [balanceIssues])

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
                      {/* ฟีดแบ็ก "ตัวเลขเยอะไปนิด — % + Sets + bar ต้องอ่านพร้อมกัน ทั้งที่ bar กับ % ทำหน้าที่
                          ซ้ำกันบางส่วน ให้ Sets เป็น secondary text เล็กๆ แทน" — เดิม "X เซ็ต" อยู่แถวเดียวกับ
                          % (4 อย่างในแถวเดียว: จุดสี+ชื่อ, %, เซ็ต, ลูกศร) ย้ายลงไปเป็น caption เล็กๆ ใต้แท่ง
                          progress แทน ลดแถวหัวให้เหลือแค่ชื่อ+% (สิ่งที่สำคัญที่สุด) ไม่ตัดข้อมูลออก แค่ลดลำดับ
                          ความสำคัญให้ตรงกับที่ใช้จริง */}
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color, opacity: intensityOpacity(s.pct) }} />
                        <span className="text-xs text-ink flex-1 min-w-0 truncate">
                          {s.group} <span className="text-muted text-[10px]">({MUSCLE_GROUP_LABELS_EN[s.group]})</span>
                        </span>
                        <span className="text-[11px] font-mono font-bold shrink-0" style={{ color }}>
                          {Math.round(s.pct)}%
                        </span>
                        <span className="text-muted text-[10px] shrink-0">{isOpen ? '▲' : '▼'}</span>
                      </span>
                      <span className="relative h-1.5 rounded-full bg-bg/60 overflow-hidden">
                        <AnimatedBarFill pct={s.pct} color={color} />
                      </span>
                      <span className="text-[9px] text-muted pl-4">{s.sets} เซ็ต</span>
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
                        {/* Priority 5 (Training Balance อธิบายได้) — เดิม "กล้ามเนื้อเด่น/ด้อย" ท้ายการ์ด
                            บอกแค่ % ส่วนแบ่งเซ็ตของ top 3/bottom 2 กลุ่ม ไม่รู้ว่าเทียบกับเป้าหมายรายสัปดาห์
                            ของกลุ่มนั้นแล้วเกิน/ขาดแค่ไหน — เพิ่มบรรทัดนี้ให้ทุกกลุ่ม (ไม่ใช่แค่ top/bottom)
                            เอนจินเดียวกับการ์ด WeeklyVolume (volumeStatus) ให้ตัวเลข/สถานะตรงกันทั้งสองการ์ด */}
                        {s.targetSets > 0 &&
                          (() => {
                            // ฟีดแบ็ก "เพิ่มรายละเอียด +diff เซ็ต / % ของเป้าหมาย ให้เข้าใจง่ายขึ้น" —
                            // ต่อยอดบรรทัดเดิม (เป้าหมาย X/Y เซ็ต — สถานะ) ด้วยตัวเลขที่ผู้เรียกไม่ต้องคำนวณเอง
                            const diff = s.sets - s.targetSets
                            const diffLabel = diff > 0 ? `+${diff} เซ็ต` : diff < 0 ? `${diff} เซ็ต` : null
                            const pctOfTarget = Math.round((s.sets / s.targetSets) * 100)
                            return (
                              <p className="pl-[18px] text-[11px]" style={{ color: TARGET_STATUS_COLOR[s.targetStatus] }}>
                                เป้าหมาย {s.sets}/{s.targetSets} เซ็ต
                                {diffLabel && <> · {diffLabel}</>} · {pctOfTarget}% ของเป้าหมาย —{' '}
                                {TARGET_STATUS_LABEL[s.targetStatus]}
                              </p>
                            )
                          })()}
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

      {/* ฟีดแบ็ก "ข้อมูลเยอะเกินไปใน Card เดียว (97 sets, 24 exercises, Balance 58%, กล้ามเนื้อเด่น,
          กล้ามเนื้อด้อย พร้อมกันหมด) — เหลือ Hero Insight (Balance %) แล้วซ่อนรายละเอียดไว้หลังปุ่ม" —
          เดิม 5 คอลัมน์โชว์พร้อมกันหมด ลดเหลือ 3 (เซ็ต/ท่า/Balance) ย้าย "กล้ามเนื้อเด่น/ด้อย" ไปอยู่ใน
          ส่วน "ดูรายละเอียด Balance" ด้านล่างแทน (ปุ่มเดียวกับที่ใช้เปิด Upper/Lower, Push/Pull) */}
      {!isLoading && hasAnyData && balance && (
        <div className="border-t border-line px-2 py-3 grid grid-cols-3 gap-1">
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
            {balanceSummary && <p className="text-[9px] text-muted mt-1 leading-tight">{balanceSummary}</p>}
          </div>
        </div>
      )}

      {/* ฟีดแบ็ก "Balance 58% ต้องอธิบายได้ — Upper/Lower, Push/Pull, Muscle Distribution, จุดที่ควรปรับ,
          แนะนำสัปดาห์หน้า" — Muscle Distribution คือแถวรายกลุ่มด้านบนอยู่แล้ว (ไม่ทำซ้ำ) ตรงนี้เพิ่มส่วนที่
          ยังไม่มี: Upper/Lower %, Push/Pull %, และสรุปคำแนะนำที่อ่านแล้วลงมือทำได้ทันที */}
      {!isLoading && hasAnyData && trainingBalanceDetail && (
        <div className="border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={() => setBalanceDetailsOpen((v) => !v)}
            className="text-[11px] font-medium flex items-center gap-1"
            style={{ color: '#E8A33D' }}
          >
            {balanceDetailsOpen ? 'ซ่อนรายละเอียด Balance' : 'ดูรายละเอียด Balance'} {balanceDetailsOpen ? '↑' : '→'}
          </button>

          {balanceDetailsOpen && (
            <div className="mt-3 space-y-3">
              {/* กล้ามเนื้อเด่น/ด้อย — ย้ายมาจากแถวสรุปด้านบน (เดิมโชว์เสมอ ทำให้ Card แน่นเกินไปตอนไม่ได้
                  ต้องการรายละเอียด) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] tracked uppercase text-muted mb-1" style={{ color: BALANCE_COLOR.good }}>
                    กล้ามเนื้อเด่น
                  </p>
                  <p className="text-[11px] text-muted">{topGroups.join(', ')}</p>
                </div>
                <div>
                  <p className="text-[10px] tracked uppercase text-muted mb-1" style={{ color: BALANCE_COLOR.poor }}>
                    กล้ามเนื้อด้อย
                  </p>
                  <p className="text-[11px] text-muted">{bottomGroups.join(', ')}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] tracked uppercase text-muted mb-1">Upper / Lower</p>
                  <div className="h-1.5 rounded-full bg-surface2 overflow-hidden flex">
                    <div style={{ width: `${trainingBalanceDetail.upperPct}%`, backgroundColor: COLORS.steel }} />
                    <div style={{ width: `${trainingBalanceDetail.lowerPct}%`, backgroundColor: COLORS.amber }} />
                  </div>
                  <p className="text-[11px] text-muted mt-1">
                    Upper {trainingBalanceDetail.upperPct}% · Lower {trainingBalanceDetail.lowerPct}%
                  </p>
                </div>
                {pushPull && pushPull.status !== 'insufficient_data' && (
                  <div>
                    <p className="text-[10px] tracked uppercase text-muted mb-1">Push / Pull</p>
                    {(() => {
                      const total = Math.max(1, pushPull.pushSets + pushPull.pullSets)
                      const pushPct = Math.round((pushPull.pushSets / total) * 100)
                      return (
                        <>
                          <div className="h-1.5 rounded-full bg-surface2 overflow-hidden flex">
                            <div style={{ width: `${pushPct}%`, backgroundColor: COLORS.rust }} />
                            <div style={{ width: `${100 - pushPct}%`, backgroundColor: COLORS.steel }} />
                          </div>
                          <p className="text-[11px] text-muted mt-1">
                            Push {pushPct}% · Pull {100 - pushPct}%
                          </p>
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>

              {(balanceIssues.over.length > 0 || balanceIssues.under.length > 0) && (
                <div>
                  <p className="text-[10px] tracked uppercase text-muted mb-1">จุดที่ควรปรับ</p>
                  <ul className="space-y-0.5">
                    {balanceIssues.over.map((s) => (
                      <li key={s.group} className="text-[11px]" style={{ color: BALANCE_COLOR.poor }}>
                        {s.group} สูงกว่าค่าเหมาะสม
                      </li>
                    ))}
                    {balanceIssues.under.map((s) => (
                      <li key={s.group} className="text-[11px]" style={{ color: BALANCE_COLOR.ok }}>
                        {s.group} ต่ำกว่าเป้าหมาย
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(balanceIssues.over.length > 0 || balanceIssues.under.length > 0) && (
                <div>
                  <p className="text-[10px] tracked uppercase text-muted mb-1">แนะนำสัปดาห์หน้า</p>
                  <ul className="space-y-0.5">
                    {balanceIssues.over.map((s) => {
                      const range = optimalVolumeRange(s.targetSets)
                      return (
                        <li key={s.group} className="text-[11px] text-muted">
                          ลด{s.group}ให้อยู่ในช่วง {range.min}–{range.max} เซ็ต (ตอนนี้ {s.sets} เซ็ต)
                        </li>
                      )
                    })}
                    {balanceIssues.under.map((s) => {
                      const range = optimalVolumeRange(s.targetSets)
                      const setsNeeded = Math.max(0, range.min - s.sets)
                      return (
                        <li key={s.group} className="text-[11px] text-muted">
                          เพิ่ม{s.group}อีก {setsNeeded} เซ็ต ให้ถึงช่วงที่เหมาะสม
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
