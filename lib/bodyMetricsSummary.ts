import type { BodyMetric } from './types'

export function bmiOf(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (!weightKg || !heightCm) return null
  const h = heightCm / 100
  return weightKg / (h * h)
}

export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return 'น้ำหนักน้อยกว่าเกณฑ์'
  if (bmi < 23) return 'อยู่ในเกณฑ์มาตรฐาน'
  if (bmi < 25) return 'ท้วม'
  if (bmi < 30) return 'อ้วน'
  return 'อ้วนมาก'
}

// เขียวเมื่ออยู่ในเกณฑ์ปกติ, อำพันเมื่อสูง/ต่ำกว่าเล็กน้อย, แดงเมื่อเสี่ยง
export function bmiCategoryColor(bmi: number): string {
  if (bmi < 18.5) return '#E8A33D'
  if (bmi < 23) return '#7A9B57'
  if (bmi < 25) return '#E8A33D'
  return '#C1503A'
}

export interface MetricDelta {
  value: number | null
  delta: number | null
  // true = การเปลี่ยนแปลงนี้ถือว่าดีขึ้น (ใช้เลือกสี เขียว/แดง)
  isGood: boolean | null
}

// หา entry ที่ใกล้เคียง ~7 วันก่อนหน้าที่สุด (ไม่เกิน 10 วัน) เพื่อเทียบเป็น "จากสัปดาห์ที่แล้ว"
// ถ้าไม่มีข้อมูลเก่าพอ คืน null (การ์ดจะไม่โชว์ delta แทนที่จะโชว์เลขผิดๆ)
function findWeekAgoEntry(sortedDesc: BodyMetric[]): BodyMetric | null {
  if (sortedDesc.length < 2) return null
  const latestDate = new Date(sortedDesc[0].measured_at).getTime()
  const targetMs = latestDate - 7 * 24 * 60 * 60 * 1000
  let best: BodyMetric | null = null
  let bestDiff = Infinity
  for (const m of sortedDesc.slice(1)) {
    const diff = Math.abs(new Date(m.measured_at).getTime() - targetMs)
    if (diff < bestDiff) {
      bestDiff = diff
      best = m
    }
  }
  // เกิน 10 วันจากเป้าหมาย ถือว่าห่างเกินไปจะเรียกว่า "สัปดาห์ที่แล้ว" ไม่ได้
  if (bestDiff > 10 * 24 * 60 * 60 * 1000) return null
  return best
}

// higherIsGood: undefined = ไม่ตัดสิน (ใช้กับ BMI ที่ใช้ category แทน)
function metricDelta(
  sortedDesc: BodyMetric[],
  weekAgo: BodyMetric | null,
  pick: (m: BodyMetric) => number | null,
  higherIsGood: boolean
): MetricDelta {
  const latest = sortedDesc[0] ?? null
  const value = latest ? pick(latest) : null
  if (value == null) return { value: null, delta: null, isGood: null }
  const prevValue = weekAgo ? pick(weekAgo) : null
  if (prevValue == null) return { value, delta: null, isGood: null }
  const delta = Math.round((value - prevValue) * 10) / 10
  const isGood = delta === 0 ? null : higherIsGood ? delta > 0 : delta < 0
  return { value, delta, isGood }
}

export interface BodyMetricsSummary {
  weight: MetricDelta
  bodyFatPct: MetricDelta
  skeletalMuscleKg: MetricDelta
  fatMassKg: MetricDelta
  bmi: number | null
}

// metrics ควรเรียงใหม่ -> เก่า (measured_at desc) — ตรงกับที่หน้า /health query มาอยู่แล้ว
export function computeBodyMetricsSummary(metrics: BodyMetric[], heightCm: number | null): BodyMetricsSummary {
  const weekAgo = findWeekAgoEntry(metrics)
  const latest = metrics[0] ?? null

  // มวลไขมัน (kg) — ใช้ body_fat_kg ถ้ามีจากเครื่องชั่ง bioimpedance, ไม่งั้นคำนวณจาก weight * body_fat_pct
  const fatMassOf = (m: BodyMetric) => {
    if (m.body_fat_kg != null) return m.body_fat_kg
    if (m.weight_kg != null && m.body_fat_pct != null) return (m.weight_kg * m.body_fat_pct) / 100
    return null
  }
  const muscleOf = (m: BodyMetric) => m.skeletal_muscle_kg ?? m.muscle_kg ?? null

  return {
    weight: metricDelta(metrics, weekAgo, (m) => m.weight_kg, false),
    bodyFatPct: metricDelta(metrics, weekAgo, (m) => m.body_fat_pct, false),
    skeletalMuscleKg: metricDelta(metrics, weekAgo, muscleOf, true),
    fatMassKg: metricDelta(metrics, weekAgo, fatMassOf, false),
    bmi: bmiOf(latest?.weight_kg ?? null, heightCm),
  }
}
