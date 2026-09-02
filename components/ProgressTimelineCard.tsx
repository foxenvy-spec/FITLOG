'use client'

import { useEffect, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceDot } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import type { BodyMetric } from '@/lib/types'
import { daysAgoStr } from '@/lib/weekdays'
import {
  PROGRESS_TIMELINE_METRICS,
  PROGRESS_TIMELINE_RANGES,
  buildProgressTimelineSeries,
  computeProgressTimelineMarkers,
  type ProgressTimelineMetric,
} from '@/lib/progressTimeline'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import PremiumCard from '@/components/ui/PremiumCard'

// Priority 11 (Progress Timeline) — "หน้า/Section ให้ดูย้อนหลังได้ (Weight/Body Fat/Muscle/Waist/BMI)
// พร้อม timeframe 1M/3M/6M/1Y และ Event Marker" — แยกช่วงเวลาของตัวเองจาก trendPeriodDays เดิมของ
// หน้า /health (7/30/90 วัน ผูกกับ insight อื่นอยู่แล้ว เปลี่ยนช่วงจะกระทบวงกว้าง) และดึงข้อมูลของตัวเอง
// แยกต่างหาก (metrics ของหน้าหลักจำกัดแค่ 60 แถวล่าสุด ไม่พอสำหรับช่วง 1 ปีถ้าบันทึกถี่) — โหลดครั้งเดียว
// ตอน mount ด้วยช่วงกว้างสุด (365 วัน) แล้วกรอง client-side ตาม range ที่เลือก ไม่ query ซ้ำทุกครั้งที่สลับ
export default function ProgressTimelineCard({ heightCm }: { heightCm: number | null }) {
  const supabase = createClient()
  const { toDisplay, unit } = useWeightUnit()
  const [metric, setMetric] = useState<ProgressTimelineMetric>('weight')
  const [rangeDays, setRangeDays] = useState<30 | 90 | 180 | 365>(90)
  const [metrics, setMetrics] = useState<BodyMetric[]>([])
  const [workouts, setWorkouts] = useState<{ performed_at: string; sets: number | null }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const since = daysAgoStr(365)
      const [{ data: metricRows }, { data: workoutRows }] = await Promise.all([
        supabase.from('body_metrics').select('*').gte('measured_at', since).order('measured_at', { ascending: false }),
        supabase.from('workouts').select('performed_at, sets').eq('type', 'strength').gte('performed_at', since),
      ])
      if (cancelled) return
      setMetrics((metricRows as BodyMetric[]) ?? [])
      setWorkouts((workoutRows as { performed_at: string; sets: number | null }[]) ?? [])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const cutoff = daysAgoStr(rangeDays)
  const metricsInWindow = metrics.filter((m) => m.measured_at >= cutoff)
  const activeConfig = PROGRESS_TIMELINE_METRICS.find((m) => m.key === metric)!
  const rawSeries = buildProgressTimelineSeries(metricsInWindow, metric, heightCm)
  const series = rawSeries.map((p) => ({
    ...p,
    // น้ำหนักแปลงหน่วยตาม preference ผู้ใช้ (kg/lb) ก่อนวาดกราฟ — เมตริกอื่น (%/cm/BMI) ไม่มีหน่วยให้แปลง
    value: metric === 'weight' ? toDisplay(p.value) : p.value,
  }))
  const markers = computeProgressTimelineMarkers(
    metricsInWindow,
    workouts.filter((w) => w.performed_at >= cutoff)
  )
  const markerByDate = new Map(series.map((p) => [p.date, p.value]))

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display text-sm tracked uppercase text-muted">Progress Timeline</h2>
        <div className="flex rounded-full bg-surface p-1 border border-line shrink-0">
          {PROGRESS_TIMELINE_RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRangeDays(r.key)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-display tracked uppercase transition ${
                rangeDays === r.key ? 'bg-steel text-bg' : 'text-muted'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {PROGRESS_TIMELINE_METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-display tracked uppercase transition ${
              metric === m.key ? 'bg-amber text-bg' : 'bg-surface border border-line text-muted'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <PremiumCard className="p-3.5">
        {loading ? (
          <div className="h-56 flex items-center justify-center text-xs text-muted">กำลังโหลด...</div>
        ) : series.length > 1 ? (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#2E333A" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#9498A0', fontSize: 10 }}
                    axisLine={{ stroke: '#2E333A' }}
                    tickLine={false}
                    tickFormatter={(d: string) => d.slice(5)}
                    minTickGap={30}
                  />
                  <YAxis tick={{ fill: '#9498A0', fontSize: 10 }} axisLine={false} tickLine={false} width={36} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ background: '#1C1F24', border: '1px solid #2E333A', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#9498A0' }}
                    itemStyle={{ color: '#F3F0E8' }}
                    formatter={(v: number) => [`${v.toFixed(1)}${activeConfig.unit ? ` ${activeConfig.unit}` : ''}`, activeConfig.label]}
                  />
                  <Line type="monotone" dataKey="value" stroke={activeConfig.color} strokeWidth={2} dot={{ r: 2, fill: activeConfig.color }} />
                  {markers.map((mk) => {
                    const y = markerByDate.get(mk.date)
                    if (y == null) return null
                    return <ReferenceDot key={mk.date + mk.icon} x={mk.date} y={y} r={7} fill="none" stroke="none" label={{ value: mk.icon, fontSize: 14, position: 'top' }} />
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {markers.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-line pt-2">
                {markers.map((mk) => (
                  <li key={mk.date + mk.icon} className="text-[12px] text-muted flex items-center gap-1.5">
                    <span>{mk.icon}</span>
                    <span>{mk.label}</span>
                    <span className="text-muted/60">· {mk.date}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-[12px] text-muted text-center py-8">
            ยังไม่มีข้อมูล {activeConfig.label} พอในช่วงนี้ — บันทึกอย่างน้อย 2 ครั้งแล้วกราฟจะขึ้นให้อัตโนมัติ
          </p>
        )}
      </PremiumCard>
    </section>
  )
}
