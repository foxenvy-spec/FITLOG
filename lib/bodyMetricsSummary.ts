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
  if (bmi < 25) return '#8CB264'
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

// ฟีดแบ็ก "อยากเลือกดูแนวโน้มย้อนหลัง 7/30/90 วัน หรือทั้งหมด แทนที่จะให้ระบบเลือกช่วงเวลาเอง" — 'all' คือ
// เทียบกับเอนทรีเก่าสุดที่มี (การเปลี่ยนแปลงตั้งแต่เริ่มบันทึก) ตัวเลข (7/30/90) คือจำนวนวันย้อนหลังจาก
// เอนทรีล่าสุด
export type MetricsTimeframe = 7 | 30 | 90 | 'all'

// หาเอนทรีที่ใกล้เคียงกรอบเวลาที่เลือกที่สุด — ไล่หาเอนทรีตัวแรก (ใหม่สุด) ที่ "เก่ากว่าหรือเท่ากับ"
// จุดเป้าหมาย (latest - N วัน) ถ้าประวัติสั้นกว่ากรอบที่เลือก (ไม่มีเอนทรีเก่าขนาดนั้นเลย) ใช้เอนทรีเก่าสุด
// ที่มีอยู่แทน (ดีกว่าไม่มีอะไรให้เทียบเลย) — sortedDesc ต้องเรียงใหม่->เก่าเสมอ (measured_at desc)
export function findComparisonEntry(sortedDesc: BodyMetric[], timeframe: MetricsTimeframe): BodyMetric | null {
  if (sortedDesc.length < 2) return null
  if (timeframe === 'all') return sortedDesc[sortedDesc.length - 1]

  const targetMs = new Date(sortedDesc[0].measured_at).getTime() - timeframe * 24 * 60 * 60 * 1000
  for (let i = 1; i < sortedDesc.length; i++) {
    if (new Date(sortedDesc[i].measured_at).getTime() <= targetMs) return sortedDesc[i]
  }
  return sortedDesc[sortedDesc.length - 1]
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

// v39: บั๊กที่พบ — "กล้ามเนื้อ" การ์ดโชว์ delta ผิดปกติ (เช่น -22.2kg ใน 4 เดือน ทั้งที่ตัวเลขจริงไม่ได้
// ลดขนาดนั้น) สาเหตุ: muscleOf เดิม (m) => m.skeletal_muscle_kg ?? m.muscle_kg ?? null ใช้ pick ตัวเดียว
// แต่ "??" คลี่ออกมาต่อเอนทรี ไม่ใช่ต่อทั้ง series — ถ้าเอนทรีล่าสุดมี skeletal_muscle_kg (ฟีเจอร์ใหม่จาก
// migration 028 คนละค่ากับ muscle_kg เดิมจริงๆ ตามคอมเมนต์ในนั้น: "กล้ามเนื้อโครงร่าง...ต่างจาก muscle_kg
// ซึ่งเป็นกล้ามเนื้อรวม") แต่เอนทรีก่อนหน้า (ก่อนมีฟีเจอร์นี้) มีแค่ muscle_kg เก่า จะกลายเป็นเทียบคนละตัวชี้วัด
// กันข้ามเวลา (กล้ามเนื้อโครงร่างเทียบกับกล้ามเนื้อรวม) ไม่ใช่การเปลี่ยนแปลงจริงของค่าเดียวกันเลย —
// metricDeltaWithFallbackFields "ล็อก" ให้ latest/previous ต้องใช้ฟิลด์เดียวกันเท่านั้น (เลือกฟิลด์แรกที่
// latest มีค่า แล้วใช้ฟิลด์นั้นกับ previous ด้วย) ถ้า previous ไม่มีฟิลด์นั้นเลย ให้ delta เป็น null (ไม่โชว์
// เลขเปรียบเทียบ) แทนที่จะเดาข้ามฟิลด์แบบเดิม — ปลอดภัยกว่าโชว์ตัวเลขหลอกที่ไม่ได้สะท้อนความจริง
function metricDeltaWithFallbackFields(
  sortedDesc: BodyMetric[],
  previous: BodyMetric | null,
  fields: Array<(m: BodyMetric) => number | null>,
  higherIsGood: boolean
): MetricDelta {
  const latest = sortedDesc[0] ?? null
  if (!latest) return { value: null, delta: null, isGood: null }
  const pick = fields.find((f) => f(latest) != null)
  if (!pick) return { value: null, delta: null, isGood: null }
  const value = pick(latest)
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
  // ฟีดแบ็ก "เพิ่มการ์ดที่ 5 ให้ Body Overview บนเดสก์ท็อป (grid ตั้งไว้ 5 ช่องแต่มีแค่ 4 การ์ด)" —
  // เลือก Visceral Fat แทน Fat Mass (เคยถูกตัดออกจาก BodyMetricsRow.tsx ไปแล้วเพราะซ้ำกับ Body Fat %
  // — ดู comment ที่ METRIC_THEME ในไฟล์นั้น) Visceral Fat เป็นมิติข้อมูลคนละแบบ ไม่ซ้ำกับ 4 การ์ดเดิม
  visceralFat: MetricDelta
  bmi: number | null
  // ข้อความช่วงเวลาที่ใช้เทียบ delta ด้านบน (เทียบกับเอนทรีก่อนหน้าจริง ไม่ใช่กรอบ 7 วันคงที่)
  // ใช้ label เดียวกันกับทุกการ์ด เพราะทุกตัวเทียบกับเอนทรีก่อนหน้าตัวเดียวกัน
  periodLabel: string | null
}

// metrics ควรเรียงใหม่ -> เก่า (measured_at desc) — ตรงกับที่หน้า /health query มาอยู่แล้ว
// timeframe: null (ดีฟอลต์) = พฤติกรรมเดิม เทียบกับเอนทรีก่อนหน้าล่าสุดเสมอไม่ว่าจะห่างกี่วัน — ส่งค่านี้
// เมื่อผู้ใช้เลือกกรอบเวลาเอง (BodyMetricsRow.tsx) เท่านั้น จุดเรียกอื่น (เช่น AI Coach insight ใน
// DashboardView.tsx) ไม่ส่งค่านี้ จึงไม่ได้รับผลกระทบจากฟีเจอร์นี้เลย
export function computeBodyMetricsSummary(
  metrics: BodyMetric[],
  heightCm: number | null,
  timeframe: MetricsTimeframe | null = null
): BodyMetricsSummary {
  const previous = timeframe === null ? findPreviousEntry(metrics) : findComparisonEntry(metrics, timeframe)
  const latest = metrics[0] ?? null

  // มวลไขมัน (kg) — ใช้ body_fat_kg ถ้ามีจากเครื่องชั่ง bioimpedance, ไม่งั้นคำนวณจาก weight * body_fat_pct
  const fatMassOf = (m: BodyMetric) => {
    if (m.body_fat_kg != null) return m.body_fat_kg
    if (m.weight_kg != null && m.body_fat_pct != null) return (m.weight_kg * m.body_fat_pct) / 100
    return null
  }
  return {
    weight: metricDelta(metrics, previous, (m) => m.weight_kg, false),
    bodyFatPct: metricDelta(metrics, previous, (m) => m.body_fat_pct, false),
    // ห้าม fallback ข้ามฟิลด์ระหว่าง latest/previous (ดู comment ของ metricDeltaWithFallbackFields
    // ด้านบน) — skeletal_muscle_kg กับ muscle_kg เป็นคนละตัวชี้วัดกันจริงๆ ไม่ใช่แค่ชื่อคอลัมน์ต่างกัน
    skeletalMuscleKg: metricDeltaWithFallbackFields(metrics, previous, [(m) => m.skeletal_muscle_kg, (m) => m.muscle_kg], true),
    fatMassKg: metricDelta(metrics, previous, fatMassOf, false),
    visceralFat: metricDelta(metrics, previous, (m) => m.visceral_fat_grade, false),
    bmi: bmiOf(latest?.weight_kg ?? null, heightCm),
    periodLabel: periodLabelOf(latest, previous),
  }
}
