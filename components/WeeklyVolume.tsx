'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange, volumeStatus, optimalVolumeRange, type VolumeStatus } from '@/lib/dashboardStats'
import { fetchWeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
import { todayDayOfWeek } from '@/lib/weekdays'
import { VOLUME_MUSCLES } from '@/lib/muscle-groups'
import AnimatedBarFill from './AnimatedBarFill'
import Skeleton from './Skeleton'
import VolumeTargetsSettings from './VolumeTargetsSettings'
import PremiumCard from './ui/PremiumCard'

// ลำดับแสดงผล — จัดให้ตรงกับ Graphic Muscle Heatmap (อก, หลัง, ไหล่, แขน, แกนกลางลำตัว, ขา, น่อง)
// แยกจาก VOLUME_MUSCLES ตัวหลัก (ซึ่งใช้ลำดับอื่นและถูกอ้างจากหลายที่ในแอป) เพื่อไม่กระทบจุดอื่น
const DISPLAY_ORDER = ['อก', 'หลัง', 'ไหล่', 'แขน', 'แกนกลางลำตัว', 'ขา', 'น่อง'] as const

const STATUS_COLOR: Record<VolumeStatus, string> = {
  behind: '#C1503A', // rust — ตามหลัง
  onTrack: '#E8A33D', // amber — กำลังไปได้ดี
  met: '#7A9B57', // moss — ถึงเป้าหมายพอดี
  // v: เดิม "met" ครอบตั้งแต่พอดีเป้าไปจนถึงเกินเป้าเท่าไรก็ได้เหมือนกันหมด (สีเดียวกันหมด) — แยก high/
  // veryHigh ออกมาให้เห็นว่าเกินเป้าไปมากน้อยแค่ไหน (ฟีดแบ็ก "ขา Recovery 100% แต่ Volume 29/12 เกินเป้า
  // ไปมาก ควรมีสัญญาณเตือน ไม่ใช่แค่ +diff สีเขียวเหมือนเกินนิดเดียว") — high ยังใช้อำพันเดียวกับ onTrack
  // (ยังโอเค แค่เกินนิดหน่อย) veryHigh ใช้สนิม (rust) เดียวกับ behind (สุดโต่งทั้งสองทาง = ควรสนใจเหมือนกัน)
  high: '#E8A33D', // amber — เกินเป้าไปบ้างแล้ว (100-120%) ยังไม่น่ากังวล
  veryHigh: '#C1503A', // rust — เกินเป้าไปมาก (>120%) อาจเสี่ยง overtraining
}

export default function WeeklyVolume() {
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
  // ส่วนอีก 5 กลุ่มคือ 'เกินเป้า' ไม่ใช่ 'ถึงเป้า'" — เดิมนับ met/high/veryHigh รวมกันเป็น "ถึงเป้าหมายแล้ว"
  // ก้อนเดียว ซึ่งซ่อนความจริงว่าส่วนใหญ่เกินเป้าไปมาก ไม่ใช่แค่พอดีเป้า — แยกเป็น 3 กลุ่มให้ตรงความจริง:
  // onTarget (พอดีเป้าเป๊ะ), overTarget (เกินเป้า — high/veryHigh), underTarget (ยังไม่ถึงเป้า — behind/onTrack)
  const onTargetCount = rows.filter((r) => r.status === 'met').length
  const overTargetCount = rows.filter((r) => r.status === 'high' || r.status === 'veryHigh').length
  const underTargetCount = rows.filter((r) => r.status === 'behind' || r.status === 'onTrack').length

  return (
    <PremiumCard className="overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] tracked uppercase text-muted">Weekly Volume</p>
          <p className="font-display text-sm uppercase text-ink mt-0.5">เซ็ตต่อกลุ่มกล้ามเนื้อ (สัปดาห์นี้)</p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="text-[11px] text-muted hover:text-ink border border-line rounded px-2 py-1 mt-0.5 shrink-0"
        >
          ตั้งเป้าหมาย
        </button>
      </div>

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
            const color = STATUS_COLOR[status]
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
            return (
              <div
                key={mg}
                className={reachedTarget ? 'rounded-md' : 'rounded-md bg-surface2'}
                style={reachedTarget ? { backgroundColor: `${color}1A` } : undefined}
              >
                <div className="flex items-center gap-2 px-2.5 pt-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-xs text-ink flex-1 min-w-0">{mg}</span>
                  <span className="text-[11px] font-mono text-muted shrink-0">
                    {sets}
                    <span className="text-muted/60"> / {target} เซ็ต</span>
                  </span>
                  <span className="w-px h-4 bg-line shrink-0" />
                  <span className="text-[11px] font-mono font-bold shrink-0 w-14 text-right" style={{ color }}>
                    {status === 'behind'
                      ? `${diff} เซ็ต`
                      : status === 'high' || status === 'veryHigh'
                        ? `+${diff} เซ็ต`
                        : `${pct}%`}
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
                    <p className="text-[11px]" style={{ color }}>
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
        <div className="px-4 pb-3.5">
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/5">
            <div className="text-center">
              <p className="text-[10px] text-muted">รวมสัปดาห์นี้</p>
              <p className="font-mono text-sm text-ink mt-0.5">
                {totalSets} <span className="text-[10px] text-muted font-sans">เซ็ต</span>
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted">อยู่ในเป้าหมาย</p>
              <p className="font-mono text-sm text-ink mt-0.5">
                {onTargetCount} <span className="text-[10px] text-muted font-sans">/ {rows.length} กลุ่ม</span>
              </p>
            </div>
          </div>

          {/* ฟีดแบ็ก "ควรแยก On Target / Over Target / Under Target ให้เห็นชัดว่าส่วนใหญ่เกินเป้า ไม่ใช่พอดีเป้า" */}
          <div className="flex items-center justify-center gap-3 mt-2 text-[10px]">
            <span style={{ color: STATUS_COLOR.met }}>🟢 ในเป้า {onTargetCount}</span>
            <span style={{ color: STATUS_COLOR.veryHigh }}>🔴 เกินเป้า {overTargetCount}</span>
            <span style={{ color: STATUS_COLOR.onTrack }}>🟡 ยังไม่ถึงเป้า {underTargetCount}</span>
          </div>

          <div className="flex justify-end mt-2.5">
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              className="text-[11px] font-medium"
              style={{ color: '#E8A33D' }}
            >
              {detailsOpen ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียดทั้งหมด'} {detailsOpen ? '↑' : '→'}
            </button>
          </div>
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
