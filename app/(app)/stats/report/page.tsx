'use client'

// Workout Report — หน้าแยกจาก /stats ตามที่ตัดสินใจ: /stats = Analytics ("ขอดูข้อมูลของฉัน", ข้อมูลเยอะ
// ได้เพราะคนตั้งใจมาวิเคราะห์), /stats/report = curated summary ("สรุปให้ฉันหน่อยว่าช่วงที่ผ่านมาเป็น
// อย่างไร") เหมาะกับการอ่านเร็ว/พิมพ์/ส่งให้เทรนเนอร์มากกว่า — เข้าหน้านี้ผ่านปุ่ม "📄 Workout Report"
// ใน header ของ /stats เท่านั้น ไม่เพิ่ม bottom nav/tab ใหม่ตามที่ยืนยันชัดเจน
//
// Data/compute ทั้งหมดมาจาก lib/useWorkoutReport.ts (hook เดียว ใช้ pure function ชุดเดียวกับที่เคย
// embed ไว้บน /stats ตรงๆ) — ตั้งใจไม่ implement การคำนวณซ้ำที่นี่เลยแม้แต่จุดเดียว กัน "แก้ Consistency/
// Training Trend แล้วตัวเลขสองชุดไม่ตรงกัน" ตามที่กังวลไว้ — หน้านี้มีหน้าที่แค่ orchestrate การแสดงผล/
// เลือกช่วงเวลา และจัด visual hierarchy ให้รู้สึกเป็น "รายงาน" (การ์ดเดียวยาวๆ ไล่ section มีหัวข้อ+ไอคอน
// ชัดเจน) มากกว่าที่เคยเป็นตอน embed อยู่บน /stats
import { useState } from 'react'
import Link from 'next/link'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { useWorkoutReport, reportPeriodLabel, reportDateRange, type ReportPeriod } from '@/lib/useWorkoutReport'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import PremiumCard from '@/components/ui/PremiumCard'
import LoadingState from '@/components/LoadingState'
import ErrorState from '@/components/ErrorState'
import { COLORS, NEUTRAL, withAlpha } from '@/lib/theme'

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: 7, label: '7D' },
  { value: 30, label: '30D' },
]

// รูปแบบ "16-22 ส.ค. 2569" — เฉพาะการแสดงผลหัวรายงาน ไม่เกี่ยวกับ calculation ใดๆ (แค่ format วันที่ที่
// ได้จาก reportDateRange ให้อ่านง่าย) จึงเป็น local helper ของหน้านี้ล้วนๆ ไม่ต้องอยู่ใน lib
function formatDateRangeLabel(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T00:00:00Z`)
  const end = new Date(`${endIso}T00:00:00Z`)
  const startLabel = start.toLocaleDateString('th-TH', { day: 'numeric', timeZone: 'UTC' })
  const endLabel = end.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return `${startLabel}-${endLabel}`
}

export default function WorkoutReportPage() {
  const { unit, toDisplay, format } = useWeightUnit()
  const [period, setPeriod] = useState<ReportPeriod>(7)
  const { loading, error, report, retry } = useWorkoutReport(period)

  if (loading) return <LoadingState />
  if (error) return <ErrorState title="โหลด Workout Report ไม่สำเร็จ" message={error} onRetry={retry} />

  const periodLabel = reportPeriodLabel(period)
  const { startIso, endIso } = reportDateRange(period)
  const dateRangeLabel = formatDateRangeLabel(startIso, endIso)

  return (
    <div className="space-y-5 lg:max-w-2xl lg:mx-auto">
      <Link href="/stats" className="print:hidden text-[12px] text-muted hover:text-amber inline-flex items-center gap-1">
        ← กลับไปสถิติ
      </Link>

      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="font-display text-2xl tracked uppercase">Workout Report</h1>
          <p className="text-[12px] text-muted mt-1">
            📅 {periodLabel} ({dateRangeLabel})
          </p>
        </div>
        <div className="print:hidden shrink-0 flex items-center gap-0.5 rounded-full border border-line bg-surface2 p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriod(opt.value)}
              className="px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors"
              style={period === opt.value ? { backgroundColor: withAlpha(COLORS.amber, '22'), color: COLORS.amber } : { color: NEUTRAL.mutedIcon }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. Workout Summary */}
      <PremiumCard className="p-4">
        <SectionHeader icon="🏋️" title="Workout Summary" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <SummaryTile label="Workouts" value={report.currentTotals.workoutCount} unit="ครั้ง" deltaPct={report.workoutCountDeltaPct} accent={COLORS.amber} />
          <SummaryTile
            label="Duration"
            value={Math.round(report.currentTotals.totalDurationMin)}
            unit="นาที"
            deltaPct={report.durationDeltaPct}
            accent={COLORS.steel}
          />
          <SummaryTile
            label="Volume"
            value={Math.round(toDisplay(report.currentTotals.totalVolumeKg))}
            unit={unit}
            deltaPct={report.volumeDeltaPct}
            accent={COLORS.moss}
          />
          <SummaryTile label="Sets" value={report.currentTotals.totalSets} unit="เซ็ต" deltaPct={report.setsDeltaPct} accent={COLORS.violet} />
        </div>
      </PremiumCard>

      {/* 2. Consistency */}
      <PremiumCard className="p-4">
        <SectionHeader icon="🎯" title="Consistency" />
        {report.consistency.pct === null ? (
          <p className="text-sm text-muted mt-3">ยังไม่ได้ตั้งโปรแกรมประจำสัปดาห์ — ตั้งได้ที่หน้าโปรแกรม</p>
        ) : (
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <p className="font-mono font-bold text-2xl text-ink">{report.consistency.pct}%</p>
              <p className="text-[12px] text-muted">
                ทำตามแผน {report.consistency.completedCount} / {report.consistency.plannedCount} วัน
              </p>
            </div>
            <div className="h-2 mt-2 rounded-full overflow-hidden" style={{ background: NEUTRAL.chipInactive }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, report.consistency.pct)}%`, background: COLORS.amber }} />
            </div>
          </div>
        )}
      </PremiumCard>

      {/* 3. Training Trend (Volume เท่านั้นตามที่ล็อกไว้) */}
      <PremiumCard className="p-4">
        <SectionHeader icon="📊" title={`Training Trend · Volume (${period === 7 ? 'รายวัน' : 'รายสัปดาห์'})`} />
        <div className="h-32 mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.trendPoints.map((p) => ({ ...p, value: Math.round(toDisplay(p.value)) }))} margin={{ top: 4, right: 4, left: -4, bottom: 0 }}>
              <CartesianGrid stroke={NEUTRAL.chipInactive} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: NEUTRAL.mutedIcon, fontSize: 10 }} axisLine={{ stroke: NEUTRAL.chipInactive }} tickLine={false} />
              <YAxis
                tick={{ fill: NEUTRAL.mutedIcon, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${v}`)}
              />
              <Tooltip
                cursor={{ fill: 'rgba(108,140,168,0.08)' }}
                contentStyle={{ background: '#1C1F24', border: `1px solid ${NEUTRAL.chipInactive}`, borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: NEUTRAL.mutedIcon }}
                itemStyle={{ color: '#F3F0E8' }}
                formatter={(v: number) => [`${v} ${unit}`, 'วอลุ่ม']}
              />
              <Bar dataKey="value" fill={COLORS.steel} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </PremiumCard>

      {/* 4. Body Progress — เปรียบเทียบต้นช่วง -> ปัจจุบัน ใช้ computeBodyMetricsSummary ตรงๆ ไม่คิด metric ใหม่ */}
      <PremiumCard className="p-4">
        <SectionHeader icon="💪" title="Body Progress" />
        <div className="space-y-2 mt-3">
          <BodyProgressRow label="น้ำหนัก" delta={report.bodySummary.weight} unit={unit} format={format} />
          <BodyProgressRow label="ไขมัน" delta={report.bodySummary.bodyFatPct} unit="%" decimals={1} />
          <BodyProgressRow label="กล้ามเนื้อ" delta={report.bodySummary.skeletalMuscleKg} unit={unit} format={format} />
        </div>
      </PremiumCard>

      {/* 5. MINT Summary — 1 ประโยคตีความ + 1 next-step เท่านั้น ไม่ใช่ chat/AI dashboard ใหม่ */}
      <PremiumCard className="p-4" style={{ background: withAlpha(COLORS.violet, '0d'), border: `1px solid ${withAlpha(COLORS.violet, '30')}` }}>
        <SectionHeader icon="✨" title="MINT Summary" iconBg={withAlpha(COLORS.violet, '22')} />
        <p className="text-sm text-ink mt-3 font-medium">{report.summary.interpretation}</p>
        <p className="text-[12px] text-muted mt-1">{report.summary.nextStep}</p>
      </PremiumCard>

      {/* Footer — Export PDF ใช้ window.print() เดิมของ /stats ตรงๆ (ไม่เพิ่ม dependency ใหม่) — ไม่มีปุ่ม
          "แชร์รายงาน" เพราะ Share-as-image ยังเป็น backlog รอบหน้า ยังไม่มีของจริงให้กด */}
      <div className="print:hidden flex gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-full border border-amber/40 text-amber text-[12px] font-display tracked uppercase px-3 py-2.5 active:scale-[0.98] transition"
        >
          📄 Export PDF
        </button>
        <Link
          href="/stats"
          className="flex-1 flex items-center justify-center gap-1.5 rounded-full bg-steel text-bg text-[12px] font-display tracked uppercase px-3 py-2.5 active:scale-[0.98] transition"
        >
          📊 ดูสถิติทั้งหมด →
        </Link>
      </div>
    </div>
  )
}

function SectionHeader({ icon, title, iconBg }: { icon: string; title: string; iconBg?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] shrink-0"
        style={{ backgroundColor: iconBg ?? 'rgba(255,255,255,.06)' }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <p className="font-display text-[12px] tracked uppercase text-muted">{title}</p>
    </div>
  )
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null || pct === 0) return null
  const color = pct > 0 ? COLORS.moss : COLORS.rust
  return (
    <span className="text-[11px] font-mono font-semibold" style={{ color }}>
      {pct > 0 ? '↑' : '↓'} {Math.abs(pct)}%
    </span>
  )
}

function SummaryTile({
  label,
  value,
  unit,
  deltaPct,
  accent,
}: {
  label: string
  value: number
  unit: string
  deltaPct: number | null
  accent: string
}) {
  return (
    <div className="border shadow-glow rounded-card px-3 py-2.5" style={{ borderColor: withAlpha(accent, '33'), backgroundColor: '#1C1F24' }}>
      <p className="text-[11px] tracked uppercase text-muted">{label}</p>
      <p className="font-mono text-lg text-ink mt-0.5">
        {value.toLocaleString()} <span className="text-[11px] text-muted">{unit}</span>
      </p>
      <div className="mt-0.5 h-3.5">
        <DeltaBadge pct={deltaPct} />
      </div>
    </div>
  )
}

function BodyProgressRow({
  label,
  delta,
  unit,
  decimals = 1,
  format,
}: {
  label: string
  delta: { value: number | null; delta: number | null; isGood: boolean | null }
  unit: string
  decimals?: number
  format?: (kg: number | null | undefined, decimals?: number) => string
}) {
  if (delta.value === null) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="text-muted">— ยังไม่มีข้อมูล</span>
      </div>
    )
  }
  const startValue = delta.delta !== null ? delta.value - delta.delta : null
  const displayValue = (v: number) => (format ? format(v, decimals) : v.toFixed(decimals))
  const color = delta.isGood === null ? NEUTRAL.mutedIcon : delta.isGood ? COLORS.moss : COLORS.rust
  return (
    <div className="flex items-center justify-between text-sm gap-2 flex-wrap">
      <span className="text-muted shrink-0">{label}</span>
      <span className="font-mono text-ink text-right">
        {startValue !== null ? (
          <>
            {displayValue(startValue)} → {displayValue(delta.value)} {unit}
          </>
        ) : (
          <>
            {displayValue(delta.value)} {unit}
          </>
        )}
        {delta.delta !== null && (
          <span className="ml-1.5 font-semibold" style={{ color }}>
            {delta.delta > 0 ? '↑' : delta.delta < 0 ? '↓' : ''} {Math.abs(delta.delta).toFixed(decimals)}
          </span>
        )}
      </span>
    </div>
  )
}
