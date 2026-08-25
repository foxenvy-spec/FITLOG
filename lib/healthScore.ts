import type { BodyMetric } from './types'

// v32: ฟีดแบ็ก "Health Score ที่ดี = แปลงข้อมูลต่อเนื่องเป็นคะแนน 0-100 แบบ trapezoid (อยู่ในช่วง ideal =
// 100, ยิ่งห่างยิ่งลดแบบเส้นตรง) แทน pass/fail แบบเดิม (23.9 → 100, 25.1 → 0 ทั้งที่ต่างกันนิดเดียว)" —
// เอนจิ้นคะแนนสุขภาพเวอร์ชันใหม่ทั้งหมด: Body Composition 40% (Body Fat 50/BMI 20/Visceral Fat 20 —
// Waist 10% ข้ามไปก่อน ไม่มี threshold มาตรฐานในระบบ, redistribute ให้ 3 ตัวที่เหลือ) + Muscle 25%
// (Muscle Mass 60/Skeletal Muscle 40) + Metabolic Health 20% (Visceral Fat 40/Body Age 30 — BMR 30% ข้าม
// เหตุผลเดียวกับ Waist) + Progress 15% (Weight/Body Fat/Muscle เทียบค่าก่อนหน้าล่าสุด) — ไม่มี Hydration
// ในคะแนนหลักแล้วตามที่ตกลง ทุกน้ำหนัก/สูตรมาจากที่ผู้ใช้ออกแบบไว้ตรงๆ ไม่ได้เดาเอง
//
// v33: ฟีดแบ็ก "Body Fat 25.1%/BMI ยังห่างเป้าหมายมาก แต่ Body Composition ขึ้น 100/100/100 เพราะทั้งโซน
// Standard แบนคะแนน 100 หมด" — เปลี่ยน Body Fat/BMI จาก trapezoidScore (แบนเต็มโซน) เป็น peakScore
// (จุดสูงสุดกึ่งกลางโซนเท่านั้น ไล่ลดหลั่นไปสองขอบ) ขอบเขตโซน (min/low/high/max) ไม่เปลี่ยน ยังตรงกับ
// ZoneBarRow/pills ที่แสดงผลอยู่ทั่วแอป — Muscle/Visceral Fat/Body Age (ทางเดียว) คงค้างไว้แบบเดิมตามที่
// ยืนยัน (ยิ่งดีกว่ายิ่งไม่โดนหักคะแนน) และปรับน้ำหนัก Progress เป็น Fat 40/Muscle 35/Weight 15 (เดิม
// Weight 30/Fat 40/Muscle 30) ยังไม่ใส่ Consistency เพราะไม่มีนิยาม/เกณฑ์อ้างอิงในระบบตอนนี้

export type ScoreDirection = 'lowerBetter' | 'higherBetter'

// v33: ฟีดแบ็ก "Body Fat 25.1%/BMI ยังห่างเป้าหมายแต่ Body Composition ขึ้น 100 เพราะทั้งโซน Standard (เช่น
// หญิง 18-28%) ให้ 100 แบนตลอด ไม่แยกว่า 18% กับ 27.9% ต่างกัน" — เปลี่ยนทรงคะแนนจาก "แบนเต็มโซน" เป็น
// "จุดสูงสุดอยู่กึ่งกลางโซนเท่านั้น" ไล่ลดหลั่นแบบเส้นตรงไปทั้งสองขอบของโซน (ถึงขอบ = edgeScore ไม่ใช่ 100)
// แล้วไล่ต่อจากขอบไปแตะ 0 ที่ min/max เหมือนเดิม — min/low/high/max ยังเป็นขอบเขตเดียวกับโซน Low/Standard/
// High ที่ใช้แสดงผล (ZoneBarRow/pills) อยู่ทั่วแอปไม่เปลี่ยน เปลี่ยนแค่ทรงคะแนนภายในโซน ใช้กับตัวชี้วัดสองทาง
// (Body Fat, BMI) ที่ทั้งต่ำไปและสูงไปแย่ทั้งคู่ — edgeScore ดีฟอลต์ 88 (กึ่งกลางของช่วง 85-90 ที่ตกลงกันไว้)
export function peakScore(value: number, min: number, low: number, high: number, max: number, edgeScore = 88): number {
  const center = (low + high) / 2
  if (value === center) return 100
  if (value > center) {
    if (value >= max) return 0
    if (value <= high) return 100 - ((value - center) / (high - center)) * (100 - edgeScore)
    return (edgeScore * (max - value)) / (max - high)
  }
  if (value <= min) return 0
  if (value >= low) return 100 - ((center - value) / (center - low)) * (100 - edgeScore)
  return (edgeScore * (value - min)) / (low - min)
}

// ยิ่งสูงยิ่งดี ไม่มีเพดานโทษ (ไม่แตะ 0 อีกฝั่งถ้าค่าสูงเกินไป) — value <= floor = 0, value >= good = 100
export function higherBetterScore(value: number, floor: number, good: number): number {
  if (value >= good) return 100
  if (value <= floor) return 0
  return ((value - floor) / (good - floor)) * 100
}

// ยิ่งต่ำยิ่งดี ไม่มีเพดานโทษฝั่งต่ำ — value <= good = 100, value >= ceiling = 0
export function lowerBetterScore(value: number, good: number, ceiling: number): number {
  if (value <= good) return 100
  if (value >= ceiling) return 0
  return ((ceiling - value) / (ceiling - good)) * 100
}

export interface WeightedInput {
  weight: number
  score: number | null
}

// ไม่มีข้อมูล (score: null) = ตัวนั้นหลุดออกจากการคำนวณ แล้ว normalize น้ำหนักที่เหลือใหม่โดยอัตโนมัติ
// (ผลรวมน้ำหนักไม่ต้องเท่ากับ 100 พอดีก็ได้ — หารด้วยผลรวมจริงของตัวที่มีข้อมูลเสมอ) ไม่มีตัวไหนมีข้อมูลเลย = null
export function weightedAverage(inputs: WeightedInput[]): number | null {
  const available = inputs.filter((i): i is { weight: number; score: number } => i.score !== null)
  const total = available.reduce((s, i) => s + i.weight, 0)
  if (total === 0) return null
  return available.reduce((s, i) => s + i.score * i.weight, 0) / total
}

// คะแนนความคืบหน้าจากเดลต้าจริง (ไม่ใช่ pass/fail "ขยับถูกทาง y/n" แบบเดิมของ trendScorePct) — ไม่เปลี่ยนแปลง
// เลย = 50 (กลาง) ขยับถูกทาง = ไล่ขึ้นถึง 100 ขยับผิดทาง = ไล่ลงถึง 0 ตาม magnitude เทียบหน่วยอ้างอิง `unit`
// (ครบ 1 unit เต็มในทิศทางใดทิศทางหนึ่ง = สุดสเกล 0 หรือ 100) — unit เป็นค่าที่เลือกเองให้สมเหตุสมผลต่อหน่วย
// (เช่น 2kg สำหรับน้ำหนัก, 2 percentage point สำหรับไขมัน) ไม่มีเกณฑ์การแพทย์ตายตัวมารองรับตัวเลขนี้โดยตรง
export function progressScore(delta: number | null, direction: ScoreDirection, unit: number): number | null {
  if (delta === null) return null
  const signedGood = direction === 'higherBetter' ? delta : -delta
  const magnitude = Math.max(-1, Math.min(1, signedGood / unit))
  return 50 + magnitude * 50
}

// เกณฑ์ %ไขมันในร่างกาย — ซ้ำกับ bodyFatPctRange ใน app/(app)/health/page.tsx โดยตั้งใจ (ไฟล์นั้น import
// จากที่นี่แทนแล้ว ดูจุด import ในไฟล์นั้น) เก็บไว้ในนี้เพราะ compute*Score ทุกตัวต้องใช้ ให้ lib/healthScore.ts
// ทดสอบเป็นเอกเทศได้โดยไม่ต้อง import จากไฟล์หน้า
export function bodyFatPctRange(sex: 'male' | 'female' | null): { min: number; low: number; high: number; max: number } {
  if (sex === 'male') return { min: 2, low: 10, high: 20, max: 40 }
  return { min: 8, low: 18, high: 28, max: 48 }
}

export interface HealthScoreCategory {
  title: string
  pct: number
  // v34: ฟีดแบ็ก "ถ้าถ่วงน้ำหนักไม่เท่ากัน (96/100/100/71 เฉลี่ยเท่ากันไม่ได้ 94) UI ควรโชว์น้ำหนักจริง ไม่ใช่
  // ให้ดูสัมพันธ์กันด้วยสายตาอย่างเดียว" — น้ำหนักที่ใช้จริงในการคำนวณ overall (เป็น % ที่ normalize แล้วจาก
  // น้ำหนักตั้งต้น 40/25/20/15 เฉพาะหมวดที่มีข้อมูล — ถ้าบางหมวดหลุดเพราะไม่มีข้อมูล ตัวเลขนี้จะโตขึ้นตาม
  // สัดส่วนจริงที่ redistribute ไป ไม่ใช่ค่าคงที่ 40/25/20/15 เสมอไป)
  weight: number
}

export interface HealthScoreResult {
  overall: number
  categories: HealthScoreCategory[]
}

export interface HealthScoreRanges {
  skeletalMuscleLow: number | null
  skeletalMuscleHigh: number | null
  muscleLow: number | null
  muscleHigh: number | null
  bodyAgeLow: number | null
  bodyAgeHigh: number | null
}

export function computeHealthScore(params: {
  row: BodyMetric | null
  // เอนทรีก่อนหน้า `row` ทันที (ไม่จำเป็นต้องเป็น metrics[1] เป๊ะ — ถ้า row มาจาก history อื่น prevRow ก็ควร
  // เป็นเอนทรีก่อนหน้าของ history นั้น) ใช้คำนวณ Progress เท่านั้น ไม่มี = หมวด Progress หลุด (redistribute)
  prevRow: BodyMetric | null
  bmi: number | null
  sex: 'male' | 'female' | null
  ranges: HealthScoreRanges
  // ทิศทาง "ดีขึ้น" ของน้ำหนัก — อ้างอิงเป้าหมายที่ตั้งไว้ถ้ามี ไม่มี = lowerBetter (ดีฟอลต์เดิมของทั้งแอป)
  weightDirection: ScoreDirection
}): HealthScoreResult | null {
  const { row, prevRow, bmi, sex, ranges, weightDirection } = params
  if (!row) return null

  const bf = bodyFatPctRange(sex)
  const bodyFatComp = row.body_fat_pct != null ? peakScore(row.body_fat_pct, bf.min, bf.low, bf.high, bf.max) : null
  const bmiComp = bmi != null ? peakScore(bmi, 10, 18.5, 25, 40) : null
  const visceralComp = row.visceral_fat_grade != null ? lowerBetterScore(row.visceral_fat_grade, 9, 30) : null
  const bodyComposition = weightedAverage([
    { weight: 50, score: bodyFatComp },
    { weight: 20, score: bmiComp },
    { weight: 20, score: visceralComp },
  ])

  const muscleMassComp =
    row.muscle_kg != null && ranges.muscleLow != null && ranges.muscleHigh != null
      ? higherBetterScore(row.muscle_kg, ranges.muscleLow - (ranges.muscleHigh - ranges.muscleLow), ranges.muscleLow)
      : null
  const skeletalComp =
    row.skeletal_muscle_kg != null && ranges.skeletalMuscleLow != null && ranges.skeletalMuscleHigh != null
      ? higherBetterScore(
          row.skeletal_muscle_kg,
          ranges.skeletalMuscleLow - (ranges.skeletalMuscleHigh - ranges.skeletalMuscleLow),
          ranges.skeletalMuscleLow
        )
      : null
  const muscle = weightedAverage([
    { weight: 60, score: muscleMassComp },
    { weight: 40, score: skeletalComp },
  ])

  const bodyAgeComp =
    row.body_age_years != null && ranges.bodyAgeLow != null && ranges.bodyAgeHigh != null
      ? lowerBetterScore(row.body_age_years, ranges.bodyAgeLow, ranges.bodyAgeHigh)
      : null
  const metabolic = weightedAverage([
    { weight: 40, score: visceralComp },
    { weight: 30, score: bodyAgeComp },
  ])

  const weightDelta = row.weight_kg != null && prevRow?.weight_kg != null ? row.weight_kg - prevRow.weight_kg : null
  const bodyFatDelta = row.body_fat_pct != null && prevRow?.body_fat_pct != null ? row.body_fat_pct - prevRow.body_fat_pct : null
  const muscleDelta = row.muscle_kg != null && prevRow?.muscle_kg != null ? row.muscle_kg - prevRow.muscle_kg : null
  // v33: ฟีดแบ็ก "Fat Trend 40% / Muscle Trend 35% / Weight Trend 15%" — เดิม Weight 30/Fat 40/Muscle 30
  // ลดน้ำหนัก Weight ลง (มักเป็นผลพลอยได้จาก Fat/Muscle อยู่แล้ว ไม่ใช่ตัวชี้ทิศทางหลัก) เพิ่มให้ Muscle
  // Trend แทน — ไม่ใส่ Consistency (ยังไม่มีนิยาม/เกณฑ์อ้างอิงในระบบตอนนี้)
  const progress = weightedAverage([
    { weight: 15, score: progressScore(weightDelta, weightDirection, 2) },
    { weight: 40, score: progressScore(bodyFatDelta, 'lowerBetter', 2) },
    { weight: 35, score: progressScore(muscleDelta, 'higherBetter', 0.3) },
  ])

  // v34: หมวดหลัก 4 หมวด + น้ำหนักตั้งต้นตามสูตรที่ตกลง (40/25/20/15) — ใช้ array เดียวกันทั้งคำนวณ overall
  // และ derive น้ำหนักที่ normalize แล้วสำหรับแสดงผล ไม่ต้องคำนวณซ้ำสองที่ให้เสี่ยงหลุดจากกัน
  const topLevel = [
    { title: 'BODY COMPOSITION', weight: 40, score: bodyComposition },
    { title: 'MUSCLE', weight: 25, score: muscle },
    { title: 'METABOLIC HEALTH', weight: 20, score: metabolic },
    { title: 'PROGRESS', weight: 15, score: progress },
  ]
  const availableWeightSum = topLevel.filter((c) => c.score !== null).reduce((s, c) => s + c.weight, 0)
  const categories: HealthScoreCategory[] = topLevel
    .filter((c): c is { title: string; weight: number; score: number } => c.score !== null)
    .map((c) => ({ title: c.title, pct: Math.round(c.score), weight: Math.round((c.weight / availableWeightSum) * 100) }))

  const overall = weightedAverage(topLevel.map((c) => ({ weight: c.weight, score: c.score })))
  if (overall === null) return null
  return { overall: Math.round(overall), categories }
}
