import type { BodyMetric } from './types'

// Priority 11 (Progress Timeline) — เดิม /health มีกราฟเทรนด์อยู่แล้ว (MetricRowCard) แต่จำกัดแค่
// 7/30/90 วัน (trendPeriodDays) และไม่มี event marker เลย — ไฟล์นี้เป็นชุดฟังก์ชันแยกต่างหาก ไม่แตะ
// trendPeriodDays เดิม (ค่านั้นถูกใช้คำนวณ insight อื่นอยู่ด้วย เปลี่ยนช่วงจะกระทบวงกว้าง) ให้
// Progress Timeline มีช่วงเวลาของตัวเอง (1M/3M/6M/1Y) แยกอิสระ

export type ProgressTimelineMetric = 'weight' | 'bodyFatPct' | 'muscleMass' | 'waist' | 'bmi'

export interface ProgressTimelineMetricConfig {
  key: ProgressTimelineMetric
  label: string
  unit: string
  color: string
}

export const PROGRESS_TIMELINE_METRICS: ProgressTimelineMetricConfig[] = [
  { key: 'weight', label: 'น้ำหนัก', unit: 'kg', color: '#E8A33D' },
  { key: 'bodyFatPct', label: 'ไขมัน', unit: '%', color: '#C9508A' },
  { key: 'muscleMass', label: 'กล้ามเนื้อ', unit: 'kg', color: '#3B82F6' },
  { key: 'waist', label: 'รอบเอว', unit: 'cm', color: '#7A9B57' },
  { key: 'bmi', label: 'BMI', unit: '', color: '#6C8CA8' },
]

export const PROGRESS_TIMELINE_RANGES: { key: 30 | 90 | 180 | 365; label: string }[] = [
  { key: 30, label: '1M' },
  { key: 90, label: '3M' },
  { key: 180, label: '6M' },
  { key: 365, label: '1Y' },
]

function metricValue(m: BodyMetric, metric: ProgressTimelineMetric, heightCm: number | null): number | null {
  switch (metric) {
    case 'weight':
      return m.weight_kg
    case 'bodyFatPct':
      return m.body_fat_pct
    case 'muscleMass':
      // ล็อกให้ใช้ฟิลด์เดียวกับเอนทรีล่าสุดเสมอ (เหตุผลเดียวกับ BodyMetricsRow.tsx v39 — ผสม
      // skeletal_muscle_kg/muscle_kg คนละตัวชี้วัดกันเข้าเส้นเดียวจะวาดเป็นเส้นดิ่งปลอมได้)
      return m.skeletal_muscle_kg ?? m.muscle_kg
    case 'waist':
      return m.waist_cm
    case 'bmi':
      return m.weight_kg != null && heightCm ? m.weight_kg / (heightCm / 100) ** 2 : null
  }
}

export interface ProgressTimelinePoint {
  date: string
  value: number
}

// metrics: รายการที่กรองอยู่ในช่วงเวลาที่เลือกไว้แล้ว (ผู้เรียกกรองมาก่อน) — ไม่เรียงลำดับก็ได้ ฟังก์ชัน
// จะเรียงเก่า->ใหม่ให้เอง (สำหรับกราฟไล่จากซ้ายไปขวาตามเวลา)
export function buildProgressTimelineSeries(
  metrics: BodyMetric[],
  metric: ProgressTimelineMetric,
  heightCm: number | null = null
): ProgressTimelinePoint[] {
  return metrics
    .map((m) => ({ date: m.measured_at, value: metricValue(m, metric, heightCm) }))
    .filter((p): p is ProgressTimelinePoint => p.value != null)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export interface ProgressTimelineMarker {
  date: string
  icon: string
  label: string
}

// รวม 3 ประเภทเหตุการณ์เด่นในช่วงที่เลือก (สูงสุด 1 ต่อประเภท กันการ์ดรกด้วยจุดเยอะๆ):
// 🏋️ เซสชันฝึกที่หนักที่สุด (รวมเซ็ตต่อวันเยอะสุด), 📉 วันที่ไขมันต่ำสุด, 💪 วันที่กล้ามเนื้อสูงสุด
// ต้องมีอย่างน้อย 2 จุดข้อมูลถึงจะขึ้น marker ไขมัน/กล้ามเนื้อ (จุดเดียวเทียบอะไรไม่ได้ ไม่มีความหมาย)
export function computeProgressTimelineMarkers(
  metricsInWindow: BodyMetric[],
  workoutsInWindow: { performed_at: string; sets: number | null }[]
): ProgressTimelineMarker[] {
  const markers: ProgressTimelineMarker[] = []

  const setsByDay: Record<string, number> = {}
  workoutsInWindow.forEach((w) => {
    const day = w.performed_at.slice(0, 10)
    setsByDay[day] = (setsByDay[day] ?? 0) + (w.sets ?? 0)
  })
  const bestTrainingDay = Object.entries(setsByDay).sort((a, b) => b[1] - a[1])[0]
  if (bestTrainingDay && bestTrainingDay[1] > 0) {
    markers.push({ date: bestTrainingDay[0], icon: '🏋️', label: `เทรนหนักสุดในช่วงนี้ (${bestTrainingDay[1]} เซ็ต)` })
  }

  const bodyFatPoints = metricsInWindow.filter((m) => m.body_fat_pct != null) as (BodyMetric & { body_fat_pct: number })[]
  if (bodyFatPoints.length >= 2) {
    const lowest = bodyFatPoints.reduce((min, m) => (m.body_fat_pct < min.body_fat_pct ? m : min))
    markers.push({ date: lowest.measured_at, icon: '📉', label: `ไขมันต่ำสุดในช่วงนี้ (${lowest.body_fat_pct.toFixed(1)}%)` })
  }

  const musclePoints = metricsInWindow
    .map((m) => ({ date: m.measured_at, value: m.skeletal_muscle_kg ?? m.muscle_kg }))
    .filter((p): p is ProgressTimelinePoint => p.value != null)
  if (musclePoints.length >= 2) {
    const highest = musclePoints.reduce((max, p) => (p.value > max.value ? p : max))
    markers.push({ date: highest.date, icon: '💪', label: `กล้ามเนื้อสูงสุดในช่วงนี้ (${highest.value.toFixed(1)} kg)` })
  }

  return markers.sort((a, b) => a.date.localeCompare(b.date))
}
