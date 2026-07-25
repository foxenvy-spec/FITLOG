import type { BodyMetric } from './types'

export function bmiOf(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (!weightKg || !heightCm) return null
  const h = heightCm / 100
  return weightKg / (h * h)
}

// เกณฑ์สากลทั่วไป (WHO general cutoffs) — ให้ตรงกับหน้า Health/ObesityAnalysisChart
export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return 'น้ำหนักน้อยกว่าเกณฑ์'
  if (bmi < 25) return 'อยู่ในเกณฑ์มาตรฐาน'
  if (bmi < 30) return 'ท้วม'
  return 'อ้วน'
}

// เขียวเมื่ออยู่ในเกณฑ์ปกติ, อำพันเมื่อสูง/ต่ำกว่าเล็กน้อย, แดงเมื่อเสี่ยง
export function bmiCategoryColor(bmi: number): string {
  if (bmi < 18.5) return '#E8A33D'
  if (bmi < 25) return '#7A9B57'
  if (bmi < 30) return '#E8A33D'
  return '#C1503A'
}

export interface MetricDelta {
  value: number | null
  delta: number | null
  // true = การเปลี่ยนแปลงนี้ถือว่าดีขึ้น (ใช้เลือกสี เขียว/แดง)
  isGood: boolean | null
}

// เอนทรีก่อนหน้าล่าสุด (ไม่ว่าจะห่างกี่วัน) — ไม่ยึดกรอบ 7 วันอีกต่อไป
// รองรับทั้งผู้ใช้ที่อัปเดตถี่ (รายวัน/สัปดาห์) และไม่ถี่ (รายเดือน) ให้เห็น delta เสมอถ้ามีข้อมูลเก่า
function findPreviousEntry(sortedDesc: BodyMetric[]): BodyMetric | null {
  if (sortedDesc.length < 2) return null
  return sortedDesc[1]
}

// แปลงระยะห่างระหว่างเอนทรีล่าสุดกับเอนทรีก่อนหน้าเป็นข้อความไทยที่อ่านเป็นธรรมชาติ
// เช่น "จากเมื่อวาน" / "จาก 3 วันก่อน" / "จากสัปดาห์ที่แล้ว" / "จากเดือนที่แล้ว"
export function periodLabelOf(latest: BodyMetric | null, previous: BodyMetric | null): string | null {
  if (!latest || !previous) return null
  const diffMs = new Date(latest.measured_at).getTime() - new Date(previous.measured_at).getTime()
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000))
  if (days <= 0) return null
  if (days === 1) return 'จากเมื่อวาน'
  if (days <= 6) return `จาก ${days} วันก่อน`
  if (days <= 13) return 'จากสัปดาห์ที่แล้ว'
  if (days <= 24) return `จาก ${Math.round(days / 7)} สัปดาห์ก่อน`
  if (days <= 45) return 'จากเดือนที่แล้ว'
  return `จาก ${Math.round(days / 30)} เดือนก่อน`
}

// higherIsGood: undefined = ไม่ตัดสิน (ใช้กับ BMI ที่ใช้ category แทน)
function metricDelta(
  sortedDesc: BodyMetric[],
  previous: BodyMetric | null,
  pick: (m: BodyMetric) => number | null,
  higherIsGood: boolean
): MetricDelta {
  const latest = sortedDesc[0] ?? null
  const value = latest ? pick(latest) : null
  if (value == null) return { value: null, delta: null, isGood: null }
  const prevValue = previous ? pick(previous) : null
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
  // ข้อความช่วงเวลาที่ใช้เทียบ delta ด้านบน (เทียบกับเอนทรีก่อนหน้าจริง ไม่ใช่กรอบ 7 วันคงที่)
  // ใช้ label เดียวกันกับทุกการ์ด เพราะทุกตัวเทียบกับเอนทรีก่อนหน้าตัวเดียวกัน
  periodLabel: string | null
}

// metrics ควรเรียงใหม่ -> เก่า (measured_at desc) — ตรงกับที่หน้า /health query มาอยู่แล้ว
export function computeBodyMetricsSummary(metrics: BodyMetric[], heightCm: number | null): BodyMetricsSummary {
  const previous = findPreviousEntry(metrics)
  const latest = metrics[0] ?? null

  // มวลไขมัน (kg) — ใช้ body_fat_kg ถ้ามีจากเครื่องชั่ง bioimpedance, ไม่งั้นคำนวณจาก weight * body_fat_pct
  const fatMassOf = (m: BodyMetric) => {
    if (m.body_fat_kg != null) return m.body_fat_kg
    if (m.weight_kg != null && m.body_fat_pct != null) return (m.weight_kg * m.body_fat_pct) / 100
    return null
  }
  const muscleOf = (m: BodyMetric) => m.skeletal_muscle_kg ?? m.muscle_kg ?? null

  return {
    weight: metricDelta(metrics, previous, (m) => m.weight_kg, false),
    bodyFatPct: metricDelta(metrics, previous, (m) => m.body_fat_pct, false),
    skeletalMuscleKg: metricDelta(metrics, previous, muscleOf, true),
    fatMassKg: metricDelta(metrics, previous, fatMassOf, false),
    bmi: bmiOf(latest?.weight_kg ?? null, heightCm),
    periodLabel: periodLabelOf(latest, previous),
  }
}
