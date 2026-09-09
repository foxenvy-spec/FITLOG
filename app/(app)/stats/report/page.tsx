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
import ProgressRing from '@/components/ui/ProgressRing'
import { AiRingAvatar } from '@/components/AICoachCompactCard'
import { COLORS, NEUTRAL, FIRE_GRADIENT_STOPS, withAlpha } from '@/lib/theme'

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
    // เดิมมี lg:max-w-2xl lg:mx-auto บีบ Report ให้แคบเหลือ ~672px ทั้งที่ layout กลาง (app/(app)/layout.tsx)
    // ให้พื้นที่เต็มจอ desktop อยู่แล้ว (lg:max-w-none lg:mx-0) — ตัดออก ใช้ max-width กว้างขึ้นแทนแค่กัน
    // เนื้อหายืดสุดโต่งบนจอกว้างมากๆ ไม่ centered (ให้ต่อจาก sidebar เหมือนหน้าอื่นในแอป)
    <div className="space-y-4 lg:max-w-[1200px]">
      <Link href="/stats" className="print:hidden text-[12px] text-muted hover:text-amber inline-flex items-center gap-1">
        ← กลับไปสถิติ
      </Link>

      <div>
        <h1 className="font-display text-2xl lg:text-[32px] tracked uppercase">Workout Report</h1>
        <p className="text-[12px] text-muted mt-1">
          📅 {periodLabel} ({dateRangeLabel})
        </p>
      </div>

      {/* period toggle + Export PDF บนแถวเดียวกัน (locked layout) — ย้าย Export PDF ขึ้นจาก footer เดิม */}
      <div className="print:hidden flex items-center justify-between gap-2 flex-wrap">
        <div className="shrink-0 flex items-center gap-0.5 rounded-full border border-line bg-surface2 p-0.5">
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
        <button
          type="button"
          onClick={() => window.print()}
          className="shrink-0 flex items-center gap-1.5 rounded-full border border-amber/40 text-amber text-[12px] font-display tracked uppercase px-3 py-1.5 active:scale-[0.98] transition"
        >
          📄 Export PDF
        </button>
      </div>

      {/* 1. Workout Summary — hero card: 1 container ล้อม 4 KPI ตรงๆ (คั่นด้วยเส้นแบ่งบางๆ) ไม่ใช่การ์ด
          ซ้อนการ์ดย่อยแบบเดิม (SummaryTile เดิมแต่ละใบมีกรอบ/พื้นหลังของตัวเอง ทำให้ดูเป็น "การ์ดเล็กเรียง
          กัน" มากกว่า KPI แถวเดียวของรายงานฉบับเดียว) */}
      <PremiumCard className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <SectionHeader icon="🏋️" title="Workout Summary" />
          <p className="text-[11px] text-muted">เทียบ{periodLabel}ก่อน</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-5 gap-x-4 mt-4">
          <SummaryTile label="Workouts" value={report.currentTotals.workoutCount} unit="ครั้ง" deltaPct={report.workoutCountDeltaPct} isFirst />
          <SummaryTile label="Duration" value={Math.round(report.currentTotals.totalDurationMin)} unit="นาที" deltaPct={report.durationDeltaPct} />
          <SummaryTile
            label="Volume"
            value={Math.round(toDisplay(report.currentTotals.totalVolumeKg))}
            unit={unit}
            deltaPct={report.volumeDeltaPct}
          />
          <SummaryTile label="Sets" value={report.currentTotals.totalSets} unit="เซ็ต" deltaPct={report.setsDeltaPct} />
        </div>
      </PremiumCard>

      {/* 2+3. Consistency / Training Trend — จัดคู่กันเป็น 2 คอลัมน์ (มือถือ: เรียงตกลงมาปกติ) ตาม layout
          ที่ล็อกไว้ ให้ Report อ่านเป็น "การ์ดรายงาน" มากกว่าการ์ด /stats เรียงต่อกันเฉยๆ — สัดส่วน 0.85:1.5
          ให้ Training Trend (มีกราฟ) กว้างกว่า Consistency (แค่วงกลม+ตัวเลข) ตามที่ล็อกไว้ */}
      <div className="grid grid-cols-1 sm:grid-cols-[0.85fr_1.5fr] gap-4">
        {/* 2. Consistency — โดนัทวงกลมแทน bar เดิม (reuse ProgressRing ที่มีอยู่แล้วทั่วแอป ปิด glow ให้
            เบาที่สุดตามที่ล็อกไว้ "glow ต้องเบามาก") */}
        <PremiumCard className="p-5 sm:p-6">
          <SectionHeader icon="🎯" title="Consistency" />
          {report.consistency.pct === null ? (
            <p className="text-sm text-muted mt-3">ยังไม่ได้ตั้งโปรแกรมประจำสัปดาห์ — ตั้งได้ที่หน้าโปรแกรม</p>
          ) : (
            <div className="mt-4 flex items-center gap-4">
              <ProgressRing value={report.consistency.pct} size={92} strokeWidth={9} gradientStops={FIRE_GRADIENT_STOPS} glow={false}>
                <p className="font-mono font-bold text-xl text-ink">{report.consistency.pct}%</p>
              </ProgressRing>
              <div>
                <p className="text-sm text-ink font-medium">ทำตามแผน</p>
                <p className="font-mono text-lg text-ink mt-0.5">
                  {report.consistency.completedCount} / {report.consistency.plannedCount} <span className="text-[12px] text-muted font-sans">วัน</span>
                </p>
              </div>
            </div>
          )}
        </PremiumCard>

        {/* 3. Training Trend (Volume เท่านั้นตามที่ล็อกไว้) */}
        <PremiumCard className="p-5 sm:p-6">
          <SectionHeader icon="📊" title="Training Trend" />
          <p className="text-[11px] text-muted mt-0.5">Volume · {period === 7 ? 'รายวัน' : 'รายสัปดาห์'}</p>
          <div className="h-48 mt-3">
            {/* minWidth/minHeight เป็น fallback ตาม docs ของ recharts เอง สำหรับกรณี ResponsiveContainer
                วัดขนาด container จริงได้ 0 (หรือใกล้ 0) ตอน mount ครั้งแรก — ไม่งั้นทุกอย่าง (แกน X และ Y
                พร้อมกันทั้งคู่) จะถูกวาดที่พิกัดใกล้ (0,0) เหมือนกันหมด อ่านออกมาเป็น label ทุกตัวติดกันไม่มี
                ช่องไฟเลยทั้งสองแกน ("พฤศสอาจอพ" และ "04k8k12k16k" พร้อมกัน) ตรงกับที่ live-test เจอบนมือถือ
                จริง — ถ้าเป็นแค่ label ชนกันเพราะที่ไม่พอ (ปัญหาที่ interval="preserveStartEnd" แก้ไปรอบก่อน)
                แกน Y ที่มีแค่ 5 ค่าเรียงแนวตั้งไม่ควรชนกันเองด้วยเลย บ่งชี้ว่าทั้ง chart render ที่ขนาดยุบ
                ไม่ใช่แค่ label หนาแน่นเกินพื้นที่ */}
            <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={128}>
              <BarChart data={report.trendPoints.map((p) => ({ ...p, value: Math.round(toDisplay(p.value)) }))} margin={{ top: 4, right: 4, left: -4, bottom: 4 }}>
                <CartesianGrid stroke={NEUTRAL.chipInactive} vertical={false} />
                {/* interval="preserveStartEnd" ให้ recharts เว้น label กลางๆ ที่จะชนกันเองถ้าพื้นที่ไม่พอ
                    (เช่นจอมือถือแคบ) แทนที่จะบังคับวาดครบทุก label จนซ้อนทับกันแบบ default (interval=0) */}
                <XAxis
                  dataKey="label"
                  interval="preserveStartEnd"
                  tick={{ fill: NEUTRAL.mutedIcon, fontSize: 10 }}
                  axisLine={{ stroke: NEUTRAL.chipInactive }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: NEUTRAL.mutedIcon, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${v}`)}
                />
                <Tooltip
                  cursor={{ fill: withAlpha(COLORS.amber, '14') }}
                  contentStyle={{ background: '#1C1F24', border: `1px solid ${NEUTRAL.chipInactive}`, borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: NEUTRAL.mutedIcon }}
                  itemStyle={{ color: '#F3F0E8' }}
                  formatter={(v: number) => [`${v} ${unit}`, 'วอลุ่ม']}
                />
                {/* palette ที่ล็อกไว้: chart ใช้ amber เป็นสีหลักจุดเดียว ไม่ทำ rainbow/gradient ต่อแท่ง */}
                <Bar dataKey="value" fill={COLORS.amber} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Training Insight — ประโยคเดียวใต้กราฟ ประกอบจากข้อมูลที่คำนวณอยู่แล้ว (จุดสูงสุดของ trendPoints
              + volumeDeltaPct ที่มีอยู่แล้วใน Workout Summary) ไม่ใช่ metric ใหม่ */}
          {report.trendPeak && (
            <p className="text-[12px] text-muted mt-2">
              Volume สูงสุด{report.trendPeak.label} {Math.round(toDisplay(report.trendPeak.value)).toLocaleString()} {unit}
              {report.volumeDeltaPct !== null && report.volumeDeltaPct !== 0 && (
                <>
                  {' · '}
                  <span style={{ color: report.volumeDeltaPct > 0 ? COLORS.moss : COLORS.rust }}>
                    {report.volumeDeltaPct > 0 ? '↑' : '↓'} {Math.abs(report.volumeDeltaPct)}%
                  </span>{' '}
                  เทียบช่วงก่อนหน้า
                </>
              )}
            </p>
          )}
        </PremiumCard>
      </div>

      {/* 4. Body Progress — เปรียบเทียบต้นช่วง -> ปัจจุบัน ใช้ computeBodyMetricsSummary ตรงๆ ไม่คิด metric
          ใหม่ — Goal bar ใช้ goalProgress ที่มาจาก lib/goalProgress.ts เดิม (weight/bodyFat เท่านั้น ตาราง
          goals ไม่รองรับ goal_type อื่น — กล้ามเนื้อจึงไม่มี goal ให้โชว์ ไม่ใช่ bug) */}
      <PremiumCard className="p-5 sm:p-6">
        <SectionHeader icon="💪" title="Body Progress" />
        <div className="grid grid-cols-3 gap-4 mt-4">
          <BodyProgressColumn
            label="น้ำหนัก"
            delta={report.bodySummary.weight}
            unit={unit}
            format={format}
            toDisplay={toDisplay}
            goal={
              report.goalProgress.weight
                ? { targetText: format(report.goalProgress.weight.targetValue, 1), progressPct: report.goalProgress.weight.progressPct }
                : null
            }
          />
          <BodyProgressColumn
            label="ไขมัน"
            delta={report.bodySummary.bodyFatPct}
            unit="%"
            decimals={1}
            goal={
              report.goalProgress.bodyFatPct
                ? { targetText: `${report.goalProgress.bodyFatPct.targetValue.toFixed(1)}%`, progressPct: report.goalProgress.bodyFatPct.progressPct }
                : null
            }
          />
          <BodyProgressColumn label="กล้ามเนื้อ" delta={report.bodySummary.skeletalMuscleKg} unit={unit} format={format} toDisplay={toDisplay} goal={null} />
        </div>
      </PremiumCard>

      {/* 5. MINT Coach (เดิมชื่อ "MINT Summary" — เปลี่ยนตามที่ล็อกใหม่ เพราะการ์ดนี้ตอนนี้มี persona
          ชัดเจนแล้ว ไม่ใช่แค่ข้อความสรุปเฉยๆ) — ยังคง 1 ประโยคตีความ + 1 next-step เท่านั้นตามเดิม ไม่ใช่
          chat/AI dashboard ใหม่ — avatar reuse AiRingAvatar ตัวเดียวกับ AICoachCompactCard.tsx (ตั้งใจไม่
          เอา ai-coach-avatar.png รูป Robot เดิมกลับมา เพราะถูกถอดออกตามการตัดสินใจของผู้ใช้ไปแล้วก่อนหน้านี้) */}
      <PremiumCard className="p-5 sm:p-6" style={{ background: withAlpha(COLORS.violet, '0d'), border: `1px solid ${withAlpha(COLORS.violet, '30')}` }}>
        <SectionHeader icon="✨" title="MINT Coach" iconBg={withAlpha(COLORS.violet, '22')} />
        <div className="flex items-start gap-3 mt-4">
          <AiRingAvatar size={56} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink font-medium">{report.summary.interpretation}</p>
            <div className="mt-3 pt-3 border-t" style={{ borderColor: withAlpha(COLORS.violet, '20') }}>
              <p className="text-[10px] tracked uppercase font-semibold" style={{ color: COLORS.violet }}>
                💡 สิ่งที่ควรทำต่อ
              </p>
              <p className="text-[13px] text-muted mt-1">{report.summary.nextStep}</p>
            </div>
          </div>
        </div>
      </PremiumCard>

      {/* Footer — Export PDF ย้ายขึ้นไปอยู่แถว period toggle ด้านบนแล้ว เหลือแค่ลิงก์เดียวตาม layout ที่
          ล็อกไว้ — ไม่มีปุ่ม "แชร์รายงาน" เพราะ Share-as-image ยังเป็น backlog รอบหน้า ยังไม่มีของจริงให้กด */}
      <div className="print:hidden text-center">
        <Link href="/stats" className="text-[12px] font-display tracked uppercase text-amber hover:opacity-80 transition inline-flex items-center gap-1">
          ดูสถิติเพิ่มเติม →
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
  isFirst = false,
}: {
  label: string
  value: number
  unit: string
  deltaPct: number | null
  isFirst?: boolean
}) {
  // v2 (visual polish): เดิมแต่ละ KPI มีกรอบ+พื้นหลังของตัวเอง (การ์ดซ้อนการ์ดใน Workout Summary) —
  // เปลี่ยนเป็นคั่นด้วยเส้นแบ่งบางๆ แทน (เฉพาะ sm ขึ้นไปที่เรียงแนวนอนจริง — มือถือเป็น grid 2 คอลัมน์
  // เส้นแบ่งแนวตั้งจะดูแปลก) ให้ทั้ง 4 ตัวเลขรู้สึกเป็น "แถว KPI เดียว" ของการ์ดเดียว ไม่ใช่การ์ดย่อย 4 ใบ
  return (
    <div className={isFirst ? '' : 'sm:border-l sm:pl-4'} style={{ borderColor: NEUTRAL.chipInactive }}>
      <p className="text-[11px] tracked uppercase text-muted">{label}</p>
      <p className="font-mono text-2xl sm:text-3xl font-bold text-ink mt-1">
        {value.toLocaleString()} <span className="text-xs font-normal text-muted">{unit}</span>
      </p>
      <div className="mt-1 h-4">
        <DeltaBadge pct={deltaPct} />
      </div>
    </div>
  )
}

function BodyProgressColumn({
  label,
  delta,
  unit,
  decimals = 1,
  format,
  toDisplay,
  goal,
}: {
  label: string
  delta: { value: number | null; delta: number | null; isGood: boolean | null }
  unit: string
  decimals?: number
  format?: (kg: number | null | undefined, decimals?: number) => string
  toDisplay?: (kg: number) => number
  // เฉพาะ weight/bodyFat มี goal จริง (ดูคอมเมนต์ WorkoutReportData.goalProgress) — กล้ามเนื้อส่ง null เสมอ
  goal: { targetText: string; progressPct: number | null } | null
}) {
  // % ไม่มีเว้นวรรคก่อนหน่วย (ตามธรรมเนียมเดิมทั้งแอป เช่น DashboardView.tsx "22.2%") ส่วน kg/lb เว้นวรรค
  // (ตามธรรมเนียม formatWeight() "81.5 kg") — format() (ถ้ามี) ใส่หน่วยต่อท้ายให้ในตัวอยู่แล้ว ห้ามเติม
  // {unit} ซ้ำนอก displayValue อีก
  const unitSuffix = unit === '%' ? unit : ` ${unit}`
  if (delta.value === null) {
    return (
      <div>
        <p className="text-[11px] tracked uppercase text-muted">{label}</p>
        <p className="text-sm text-muted mt-1">— ยังไม่มีข้อมูล</p>
      </div>
    )
  }
  const displayValue = (v: number) => (format ? format(v, decimals) : `${v.toFixed(decimals)}${unitSuffix}`)
  // delta เป็นผลต่างหน่วย kg เสมอ (จาก DB) — คอลัมน์ที่ใช้ format (น้ำหนัก/กล้ามเนื้อ) ต้อง toDisplay ผลต่างด้วย
  // ไม่งั้นตอนผู้ใช้เลือกหน่วยเป็น lb ตัวเลขหลักจะโชว์เป็น lb แต่ delta ยังเป็น kg ดิบไม่ตรงกัน
  const deltaMagnitude =
    delta.delta !== null ? (toDisplay ? toDisplay(Math.abs(delta.delta)) : Math.abs(delta.delta)) : 0
  const color = delta.isGood === null ? NEUTRAL.mutedIcon : delta.isGood ? COLORS.moss : COLORS.rust
  return (
    <div>
      <p className="text-[11px] tracked uppercase text-muted">{label}</p>
      <p className="font-mono text-lg sm:text-xl font-bold text-ink mt-1 truncate">{displayValue(delta.value)}</p>
      <p className="text-[12px] mt-0.5" style={{ color: delta.delta === null || delta.delta === 0 ? NEUTRAL.mutedIcon : color }}>
        {delta.delta === null
          ? ' '
          : delta.delta === 0
            ? 'ไม่เปลี่ยนแปลง'
            : `${delta.delta > 0 ? '↑' : '↓'} ${deltaMagnitude.toFixed(decimals)}${unitSuffix}`}
      </p>
      {goal && (
        <div className="mt-2">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: NEUTRAL.chipInactive }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(0, Math.min(100, goal.progressPct ?? 0))}%`, background: COLORS.amber }}
            />
          </div>
          <p className="text-[10px] text-muted mt-1 truncate">เป้าหมาย {goal.targetText}</p>
        </div>
      )}
    </div>
  )
}
