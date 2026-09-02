'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange, volumeStatus, volumeBucket, optimalVolumeRange, type VolumeBucket } from '@/lib/dashboardStats'
import { fetchWeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
import { todayDayOfWeek } from '@/lib/weekdays'
import { VOLUME_MUSCLES, type MuscleGroup } from '@/lib/muscle-groups'
import { COLORS } from '@/lib/theme'
import AnimatedBarFill from './AnimatedBarFill'
import Skeleton from './Skeleton'
import VolumeTargetsSettings from './VolumeTargetsSettings'
import PremiumCard from './ui/PremiumCard'

// ลำดับแสดงผล — จัดให้ตรงกับ Graphic Muscle Heatmap (อก, หลัง, ไหล่, แขน, แกนกลางลำตัว, ขา, น่อง)
// แยกจาก VOLUME_MUSCLES ตัวหลัก (ซึ่งใช้ลำดับอื่นและถูกอ้างจากหลายที่ในแอป) เพื่อไม่กระทบจุดอื่น
const DISPLAY_ORDER = ['อก', 'หลัง', 'ไหล่', 'แขน', 'แกนกลางลำตัว', 'ขา', 'น่อง'] as const

// ฟีดแบ็ก "สีคล้ายกันจนต้องอ่านตัวเลขก่อนถึงจะเข้าใจ — อยาก 🔴 ต่ำกว่าเป้ามาก (ต้องสนใจ) / 🟡 สูงกว่าเป้า
// (ควรระวัง) / 🟢 อยู่ในเป้าหมาย (ดี) ชัดกว่านี้" — เดิมใช้ steel/moss/rust 3 เฉด (บางเฉดใกล้เคียงกันจน
// ต้องอ่านตัวเลขก่อนถึงจะรู้ว่าดีหรือไม่ดี) เปลี่ยนเป็น 3 สีจริงที่แยกกันชัดเจน (rust แดง/yellow เหลือง/
// moss เขียว) ตาม VolumeBucket (lib/dashboardStats.ts) — ไม่มีการไล่เฉดความเข้ม-อ่อนภายในกลุ่มอีกต่อไป
// (เดิม behind/met มีเฉดอ่อนกว่า onTrack/high) เพราะเป็นสาเหตุที่ทำให้ "ต้องอ่านตัวเลขก่อน" ตามฟีดแบ็ก —
// badge กับแท่ง progress ในแถวเดียวกันตอนนี้ใช้สีเดียวกันเป๊ะเสมอ ไม่มีจุดไหนสีไม่ตรงกันอีก
const BUCKET_META: Record<VolumeBucket, { emoji: string; color: string }> = {
  under: { emoji: '🔴', color: COLORS.rust },
  onTarget: { emoji: '🟢', color: COLORS.moss },
  over: { emoji: '🟡', color: COLORS.yellow },
}

interface WeeklyVolumeProps {
  // ฟีดแบ็ก (P1, "เชื่อม Muscle Heatmap ↔ Insight ↔ Weekly Sets ให้เป็น interaction เดียวกัน") — กลุ่มที่
  // hover/แตะอยู่บนไดอะแกรม Muscle Heatmap ตอนนี้ (มาจาก WeeklyMuscleHeatmap ผ่าน onActiveGroupChange ->
  // DashboardView.tsx -> ส่งต่อมาที่นี่) ใช้ไฮไลต์แถวที่ตรงกันในลิสต์นี้ — ต่อยอดจาก P2 รอบก่อน (ที่เชื่อม
  // ไดอะแกรมกับ Insight Banner ไปแล้ว) ให้ครบ 3 จุด: ไดอะแกรม -> Insight -> แถว Weekly Sets เดียวกัน ไม่ระบุ
  // prop นี้ (เช่นตอนไม่มี parent ส่งมา) = ไม่ไฮไลต์อะไรเลย พฤติกรรมเดิมทุกประการ
  highlightGroup?: MuscleGroup | null
}

export default function WeeklyVolume({ highlightGroup }: WeeklyVolumeProps = {}) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { start, end } = getWeekRange()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const { data: setsByMuscle = {}, isLoading: loadingSets } = useQuery({
    queryKey: ['weekly-volume', start, end],
    queryFn: async () => {
      const { data } = await supabase
        .from('workouts')
        .select('muscle_group, sets')
        .eq('type', 'strength')
        .gte('performed_at', start)
        .lte('performed_at', end)

      const totals: Record<string, number> = {}
      ;((data as { muscle_group: string | null; sets: number | null }[]) ?? []).forEach((r) => {
        if (!r.muscle_group) return
        totals[r.muscle_group] = (totals[r.muscle_group] ?? 0) + (r.sets ?? 0)
      })
      return totals
    },
    staleTime: 60_000,
  })

  // เป้าหมายของผู้ใช้เอง (ตั้งได้ต่อคนใน weekly_volume_targets) — ถ้ายังไม่เคยตั้ง จะได้ค่า
  // default กลับมาแทน (ดู lib/weeklyVolumeTargets.ts)
  const { data: targets = null, isLoading: loadingTargets } = useQuery({
    queryKey: ['weekly-volume-targets'],
    queryFn: () => fetchWeeklyVolumeTargets(supabase),
    staleTime: 60_000,
  })

  const loading = loadingSets || loadingTargets || !targets

  const dayOfWeek1to7 = ((todayDayOfWeek() + 6) % 7) + 1
  const maxSets = targets
    ? Math.max(1, ...VOLUME_MUSCLES.map((mg) => setsByMuscle[mg] ?? 0), ...Object.values(targets))
    : 1

  const rows = targets
    ? DISPLAY_ORDER.map((mg) => {
        const sets = setsByMuscle[mg] ?? 0
        const target = targets[mg]
        const status = volumeStatus(sets, target, dayOfWeek1to7)
        return { mg, sets, target, status }
      })
    : []

  // สรุปท้ายการ์ด — รวมเซ็ตทั้งหมด + จำนวนกลุ่มที่ถึงเป้าหมายแล้ว (เดิมมี Balance Score ตรงนี้ด้วย
  // แต่ซ้ำกับ Balance % ในการ์ด Graphic Muscle Heatmap ที่คำนวณจากเซ็ตต่อกลุ่มชุดเดียวกัน จนบางสัปดาห์
  // ตัวเลขไม่ตรงกัน (ใช้คนละสูตร) — เอาออกจากการ์ดนี้ ให้ Balance เป็นของ Muscle Heatmap อย่างเดียว
  // ส่วนการ์ดนี้เน้นความคืบหน้าเทียบเป้าหมายส่วนตัวแทน ซึ่งเป็นข้อมูลเฉพาะของการ์ดนี้ ไม่ซ้ำที่ไหน)
  const totalSets = rows.reduce((sum, r) => sum + r.sets, 0)
  // ฟีดแบ็ก "ถึงเป้าหมายแล้ว 6/7 ทำให้เข้าใจผิดว่า Balance ดี ทั้งที่จริงมีแค่ 1 กลุ่มอยู่ในเป้าพอดี
  // ส่วนอีก 5 กลุ่มคือ 'เกินเป้า' ไม่ใช่ 'ถึงเป้า'" — แยกเป็น 3 กลุ่มให้ตรงความจริง นับผ่าน volumeBucket()
  // ตัวเดียวกับที่ badge/แท่งต่อแถวใช้ (ดูคอมเมนต์ที่ BUCKET_META ด้านบน) กันตัวเลขสรุปกับป้ายต่อแถวขัดกัน
  const onTargetCount = rows.filter((r) => volumeBucket(r.status) === 'onTarget').length
  const overTargetCount = rows.filter((r) => volumeBucket(r.status) === 'over').length
  const underTargetCount = rows.filter((r) => volumeBucket(r.status) === 'under').length

  // ฟีดแบ็ก "สัปดาห์หน้าฉันควรเล่นอะไร? — เพิ่ม Priority: Chest · Shoulders · Arms ให้รู้ทันที" — เอา
  // เฉพาะกลุ่มที่ "behind" จริง (ยังห่างเป้าหมายเทียบสัดส่วนวันในสัปดาห์ ไม่ใช่แค่ onTrack ที่กำลังไปได้ดี
  // อยู่แล้ว) เรียงตามส่วนต่างที่ขาดมากสุดก่อน เอาแค่ 3 กลุ่มแรกไม่ให้ยาวเกิน — ไม่มีกลุ่มไหน behind เลย
  // (ทุกกลุ่มอย่างน้อย onTrack ขึ้นไป) ไม่โชว์บรรทัดนี้เลย ไม่มโนคำแนะนำเมื่อไม่มีอะไรต้องเร่ง
  const priorityGroups = rows
    .filter((r) => r.status === 'behind')
    .sort((a, b) => b.target - b.sets - (a.target - a.sets))
    .slice(0, 3)
    .map((r) => r.mg)

  return (
    // v(รอบก่อน): เคยลด texture เป็น reducedTexture เพราะตอนนั้นจัด Weekly Volume อยู่กลุ่มเดียวกับ
    // Consistency/Cardio Volume (Level 3 เท่ากันหมด) — ฟีดแบ็กรอบใหม่แยกละเอียดขึ้น: "Muscle Heatmap +
    // Weekly Volume ควร PRIMARY, Consistency + Week Streak ควร SECONDARY" จัดการ์ดนี้เป็น primary แล้ว
    // (คู่กับ Muscle Heatmap ที่ใช้พื้นผิวเต็มอยู่แล้ว) จึงคืนพื้นผิวเต็มกลับมา ไม่ลด texture อีกต่อไป —
    // ส่วน ConsistencyStrip.tsx ถูกปรับให้เบาลง (bg-surface2/40) แทน เพื่อสร้าง contrast primary/secondary
    <PremiumCard className="overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-2">
        <div>
          {/* ฟีดแบ็ก (Information Hierarchy review) "'Weekly Volume' + '64 sets' ผิด terminology —
              Volume ≠ Sets เสมอไป (Volume จริงคือ kg x reps x sets) ถ้า metric นี้นับจากจำนวน Sets จริง
              ควรเปลี่ยนป้ายเป็น Weekly Sets ให้ตรงความหมาย" — การ์ดนี้นับ "จำนวนเซ็ต" ล้วนๆ (ไม่ใช่
              kg x reps x sets — ดู totalSets ด้านล่าง) เปลี่ยนป้ายให้ตรงกับสิ่งที่วัดจริง ไม่แตะสูตร/
              ระบบเป้าหมาย (weekly_volume_targets ทั้งระบบผูกกับหน่วย "เซ็ต" อยู่แล้วทั่วแอป เปลี่ยนไปเป็น
              kg-volume จริงจะกระทบระบบ target เดิมทั้งชุด ไม่ใช่แค่ป้ายชื่อจุดเดียว) */}
          <p className="text-[12px] tracked uppercase text-muted">Weekly Sets</p>
          <p className="font-display text-sm uppercase text-ink mt-0.5">เซ็ตต่อกลุ่มกล้ามเนื้อ (สัปดาห์นี้)</p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="text-[12px] text-muted hover:text-ink border border-line rounded px-2 py-1 mt-0.5 shrink-0"
        >
          ตั้งเป้าหมาย
        </button>
      </div>

      {/* ฟีดแบ็ก "ตัวเลขดิบต้องคิดเองว่าดีหรือไม่ดี ควรให้ระบบสรุปให้เลย ก่อนเข้ารายละเอียด (Insight > Data)"
          — บล็อกสรุปนี้ (รวมเซ็ต/อยู่ในเป้าหมาย + สถานะ 3 กลุ่ม + กลุ่มที่ควรเน้นสัปดาห์นี้) เดิมอยู่ท้าย
          การ์ด หลังลิสต์ 7 แถวเต็ม ทำให้ต้องเลื่อนผ่านตัวเลขดิบก่อนถึงจะเห็นข้อสรุป — ย้ายมาไว้บนสุด (ใต้
          หัวข้อการ์ดทันที ก่อนลิสต์รายกลุ่ม) ให้เห็น "สรุปแล้วว่าดีไหม" ก่อน ไม่ได้ตัดลิสต์ 7 แถวหรือข้อมูล
          ไหนออกเลย แค่สลับลำดับให้ insight นำหน้า data (ปุ่ม "ดูรายละเอียดทั้งหมด" ยังอยู่ท้ายลิสต์เหมือนเดิม
          เพราะเป็นตัวควบคุมคำอธิบายต่อแถว ไม่ใช่ส่วนหนึ่งของสรุปนี้) */}
      {!loading && (
        <div className="px-4 pb-2">
          <div className="grid grid-cols-2 gap-2">
            {/* ฟีดแบ็ก (P0, Typography รอบล่าสุด) "รวมสัปดาห์นี้/อยู่ในเป้าหมาย ยังดูเบาไป — เพิ่ม font
                weight" — font-medium เฉพาะ label คู่นี้ (ทำหน้าที่อธิบายตัวเลขข้างล่างโดยตรง ไม่ใช่แค่
                หมวดหมู่ตกแต่ง) */}
            <div className="text-center">
              <p className="text-[12px] font-medium text-muted">รวมสัปดาห์นี้</p>
              <p className="font-mono text-sm text-ink mt-0.5">
                {totalSets} <span className="text-[12px] text-muted font-sans">เซ็ต</span>
              </p>
            </div>
            <div className="text-center">
              <p className="text-[12px] font-medium text-muted">อยู่ในเป้าหมาย</p>
              <p className="font-mono text-sm text-ink mt-0.5">
                {onTargetCount} <span className="text-[12px] text-muted font-sans">/ {rows.length} กลุ่ม</span>
              </p>
            </div>
          </div>

          {/* ป้ายสรุปใช้ BUCKET_META เดียวกับ badge ต่อแถว (ดูคอมเมนต์ด้านบน) — สี/emoji ตรงกันเป๊ะเสมอ
              ไม่มีทางขัดกันข้ามจุดแบบที่เคยเจอบั๊กมาก่อน (ป้ายสรุปหนึ่งสี แถวจริงอีกสี) */}
          <div className="flex items-center justify-center gap-3 mt-2 text-[12px]">
            <span style={{ color: BUCKET_META.under.color }}>
              {BUCKET_META.under.emoji} ต่ำกว่าเป้า {underTargetCount}
            </span>
            <span style={{ color: BUCKET_META.onTarget.color }}>
              {BUCKET_META.onTarget.emoji} ในเป้าหมาย {onTargetCount}
            </span>
            <span style={{ color: BUCKET_META.over.color }}>
              {BUCKET_META.over.emoji} เกินเป้า {overTargetCount}
            </span>
          </div>

          {priorityGroups.length > 0 && (
            <p className="text-center text-[12px] mt-1.5" style={{ color: BUCKET_META.under.color }}>
              🎯 สัปดาห์นี้เน้น: {priorityGroups.join(' · ')}
            </p>
          )}
        </div>
      )}

      <div className="px-4 pb-2 space-y-1.5">
        {loading ? (
          DISPLAY_ORDER.map((mg) => (
            <div key={mg} className="rounded-md bg-surface2 px-2.5 py-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-14" />
              </div>
            </div>
          ))
        ) : (
          rows.map(({ mg, sets, target, status }) => {
            const barPct = Math.min(100, (sets / maxSets) * 100)
            const targetPct = Math.min(100, (target / maxSets) * 100)
            const pct = target > 0 ? Math.round((sets / target) * 100) : 0
            const diff = sets - target
            const meta = BUCKET_META[volumeBucket(status)]
            const color = meta.color
            // ฟีดแบ็ก "เกินเป้า ≠ แย่เสมอ — ควรโชว์เป็นช่วงที่เหมาะสม ไม่ใช่จุดเดียว" — ดู optimalVolumeRange
            const range = optimalVolumeRange(target)
            // แถวย่อ ๆ: จุดสี + ชื่อ + จำนวนเซ็ต/เป้าหมาย + เส้นคั่นบาง ๆ + ป้ายสถานะ (met -> +diff,
            // onTrack -> เปอร์เซ็นต์, behind -> -diff) ต่อด้วยแถบ progress ที่ยาวตาม % จริง — เดิมแถบนี้
            // ซ่อนอยู่หลัง "ดูรายละเอียดทั้งหมด" อ่านเป็น list ตัวเลขล้วนๆ ก่อน ตอนนี้ยาวตาม % ให้เห็นเลย
            // ทุกแถว (ฟีดแบ็ก "แท่งสีควรยาวตาม % จะอ่านง่ายกว่า") ส่วนคำอธิบายท้ายแถว ("อีก X เซ็ตถึง
            // เป้าหมาย") ยังคงซ่อนอยู่หลัง toggle เหมือนเดิม (เป็นรายละเอียดเสริม ไม่ใช่ตัวข้อมูลหลัก)
            // ไฮไลต์พื้นหลังจาง ๆ เฉพาะแถวที่ทำถึง/เกินเป้าหมายแล้ว (met/high/veryHigh) ให้เด่น — สีพื้นหลัง
            // ไล่ตาม color ของแต่ละ status เอง (moss/amber/rust) ไม่ใช่เขียวตายตัวเหมือนเดิม เพราะ veryHigh
            // ควรดูต่างจาก met ธรรมดาแม้จะ "ถึงเป้าแล้ว" เหมือนกัน ส่วนแถวอื่นไม่มีพื้นหลัง (ตามการ์ดต้นแบบ)
            const reachedTarget = status === 'met' || status === 'high' || status === 'veryHigh'
            // ไฮไลต์แถวนี้ถ้าตรงกับกลุ่มที่กำลัง hover/แตะอยู่บนไดอะแกรม Muscle Heatmap (ดูคอมเมนต์ที่
            // highlightGroup prop ด้านบน) — ใช้สีสถานะของแถวเอง (color, ตัวเดียวกับ badge/แท่ง progress
            // ในแถวนี้) ไม่ hardcode สีแยก ให้ไฮไลต์ยังสื่อความหมายสถานะไปด้วยในตัว
            const isHighlighted = highlightGroup === mg
            return (
              <div
                key={mg}
                className={`${reachedTarget ? 'rounded-md' : 'rounded-md bg-surface2'} transition-shadow`}
                style={{
                  ...(reachedTarget ? { backgroundColor: `${color}1A` } : undefined),
                  ...(isHighlighted ? { boxShadow: `0 0 0 1.5px ${color}`, backgroundColor: `${color}26` } : undefined),
                }}
              >
                <div className="flex flex-wrap items-center gap-2 px-2.5 pt-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-xs text-ink flex-1">{mg}</span>
                  <span className="text-[12px] font-mono text-muted shrink-0">
                    {sets}
                    <span className="text-muted/60"> / {target} เซ็ต</span>
                  </span>
                  <span className="w-px h-4 bg-line shrink-0" />
                  {/* ฟีดแบ็ก "ขา 24/18 sets +6 sets · OVER TARGET จะอ่านง่ายกว่าแค่ตัวเลขสีเขียว" — เดิมมี
                      แค่ตัวเลข diff/% เฉยๆ ต่อแถว (สถานะ 3 กลุ่มมีแค่ในสรุปท้ายการ์ดรวม ไม่ได้อยู่ติดแต่ละแถว)
                      เพิ่มป้ายคำสั้นๆ กำกับใต้ตัวเลขต่อแถวเลย
                      ฟีดแบ็ก (รอบถัดมา) "Weekly Volume ยังดูเป็นรายงานมากกว่า insight — ตัดป้ายคำ (ต่ำกว่า
                      เป้า/ในเป้า/เกินเป้า) ต่อแถวออก ให้เหลือแค่ตัวเลข" — ตัดคำออกแต่ "ไม่ตัด emoji"
                      (เหลือแค่ 🔴/🟡/🟢 นำหน้าตัวเลข) เพื่อไม่ให้พึ่งสีอย่างเดียวในการสื่อสถานะ (คนตาบอดสี/
                      จอมือถือแสงจ้าจะอ่านสีล้วนๆ ยากกว่ามี emoji กำกับ) ยุบจาก 2 บรรทัด (ตัวเลข/คำ) เหลือ
                      บรรทัดเดียว (emoji+ตัวเลข) คอลัมน์แคบลงตาม (w-24 -> w-20) — emoji มาจาก BUCKET_META
                      เดียวกับป้ายสรุปด้านบนเป๊ะ (ดูคอมเมนต์ที่ BUCKET_META) ไม่ได้ hardcode แยกอิสระ */}
                  <span className="flex items-center gap-1 shrink-0">
                    <span aria-hidden="true">{meta.emoji}</span>
                    <span className="text-[12px] font-mono font-bold" style={{ color }}>
                      {status === 'behind'
                        ? `${diff} เซ็ต`
                        : status === 'high' || status === 'veryHigh'
                          ? `+${diff} เซ็ต`
                          : `${pct}%`}
                    </span>
                  </span>
                </div>
                <div className="px-2.5 pt-1.5 pb-2">
                  <span className="relative block h-1.5 rounded-full bg-bg/60 overflow-hidden">
                    <AnimatedBarFill pct={barPct} color={color} />
                    <div
                      className="absolute top-0 h-full w-px bg-ink/40"
                      style={{ left: `${targetPct}%` }}
                      title={`เหมาะสม ${range.min}–${range.max} เซ็ต/สัปดาห์`}
                    />
                  </span>
                </div>
                {detailsOpen && (
                  <div className="px-2.5 pb-2 -mt-1">
                    <p className="text-[12px]" style={{ color }}>
                      {status === 'met' || status === 'high'
                        ? `อยู่ในช่วงที่เหมาะสม (${range.min}–${range.max} เซ็ต)`
                        : status === 'veryHigh'
                          ? `เกินช่วงที่เหมาะสม (${range.min}–${range.max} เซ็ต) — ลองพักกลุ่มนี้บ้าง`
                          : `อีก ${target - sets} เซ็ตถึงช่วงที่เหมาะสม (${range.min}–${range.max} เซ็ต)`}
                    </p>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {!loading && (
        <div className="px-4 pb-3.5 flex justify-end pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="text-[12px] font-medium"
            style={{ color: '#E8A33D' }}
          >
            {detailsOpen ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียดทั้งหมด'} {detailsOpen ? '↑' : '→'}
          </button>
        </div>
      )}

      {targets && (
        <VolumeTargetsSettings
          open={settingsOpen}
          targets={targets}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['weekly-volume-targets'] })
            // 'dashboard' query's weeklyGoalPct also depends on these targets — invalidate by
            // key prefix rather than the exact ['dashboard', today] key, since this component
            // doesn't know today's date string.
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            setSettingsOpen(false)
          }}
        />
      )}
    </PremiumCard>
  )
}
