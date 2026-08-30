// คะแนนรวม "Fitness Score" — ไม่มีอยู่ใน FITLOG เดิมมาก่อน สร้างใหม่ตามสเปคที่ผู้ใช้ให้มา:
// น้ำหนักตั้งต้นของแต่ละปัจจัย (รวมกัน 100%):
//   Workout Completion (ฝึกกี่วันใน 7 วันที่ผ่านมา) 30%, Workout Streak 20%, Sleep 20%,
//   Recovery 15%, Weekly Goal Progress 10%, Activity วันนี้ 5%
// FITLOG ไม่มีการเชื่อมต่อข้อมูลการนอน (ไม่มี Apple Health/Google Fit) จึง "Sleep" จะไม่มีค่า
// (value: null) เสมอ — เมื่อปัจจัยไหนไม่มีค่า ระบบจะตัดออกแล้วกระจายน้ำหนักของมันไปให้ปัจจัย
// ที่เหลือตามสัดส่วนเดิม (proportional redistribution) แทนที่จะนับเป็น 0 หรือข้ามทั้งคะแนน

export interface FitnessScoreFactor {
  key: string
  // ชื่อปัจจัยที่อ่านออกได้ (เช่น "Workout Completion") — ใช้แสดงใน breakdown ของผลลัพธ์เท่านั้น
  // ไม่มีผลต่อการคำนวณคะแนน
  label: string
  // 0-100, หรือ null ถ้าไม่มีข้อมูลสำหรับปัจจัยนี้ (เช่น Sleep)
  value: number | null
  // น้ำหนักตั้งต้น (หน่วยเดียวกับเปอร์เซ็นต์ เช่น 30 = 30%) รวมกันทุกปัจจัยควรเป็น 100
  weight: number
}

export type FitnessScoreTier = 'excellent' | 'very-good' | 'good' | 'moderate' | 'recovery' | 'rest-today'

export interface GradientStop {
  offset: string
  color: string
}

export interface FitnessScoreResult {
  score: number
  tier: FitnessScoreTier
  tierLabel: string
  tierLabelTh: string
  /** สีตัวแทนของ tier (hex เดียว) — ใช้กับจุดที่ต้องการแค่สีเดียว เช่น glow, AmbientGlow */
  color: string
  /** ไล่สีเต็มของ tier — ใช้กับ FitnessRing/HeroEnergyWave ให้ทั้ง header เป็นธีมเดียวกับ tier */
  gradientStops: readonly GradientStop[]
  /** ระดับความหนักที่แนะนำ ("Heavy Training" ฯลฯ) — ข้อความสั้นบอกสถานะ */
  aiCoachStatus: string
  /** ประโยคแนะนำเต็ม โชว์เป็นบรรทัดที่ 3 ใต้วง (ต่อจากตัวเลขและ tier label) */
  recommendation: string
  /** ปัจจัยที่ใช้คำนวณคะแนน (ค่าเดียวกับ input เป๊ะ รวมปัจจัยที่ value เป็น null ด้วย เช่น Sleep) —
   * ใช้ตอบคำถาม "ทำไมฉันได้คะแนนนี้" ในหน้า/แผ่น detail แทนที่จะโชว์แค่ตัวเลขรวมเฉยๆ ไม่ recompute
   * ซ้ำ ใช้ input ชุดเดียวกับที่คำนวณคะแนนจริง กันไม่ให้ breakdown กับคะแนนที่โชว์ไม่ตรงกัน */
  breakdown: FitnessScoreFactor[]
}

// 6 tier ตามที่กำหนด — สี Ring/Wave/Glow ผูกกับ tier โดยตรง (เปลี่ยนจากเดิมที่ตั้งใจให้เป็นธีมไฟคงที่
// เสมอ — ดูคอมเมนต์ที่อัปเดตแล้วใน lib/theme.ts) ให้ผู้ใช้มองแวบเดียวก็เข้าใจทั้งสภาพร่างกายและคำแนะนำ
// โดยไม่ต้องตีความจากตัวเลขอย่างเดียว
const TIERS: {
  min: number
  tier: FitnessScoreTier
  label: string
  labelTh: string
  color: string
  gradientStops: readonly GradientStop[]
  aiCoachStatus: string
  recommendation: string
}[] = [
  {
    min: 90,
    tier: 'excellent',
    label: 'Excellent',
    labelTh: 'ยอดเยี่ยม',
    color: '#FFB000',
    gradientStops: [
      { offset: '0%', color: '#FFD166' },
      { offset: '50%', color: '#FFB000' },
      { offset: '100%', color: '#FF8A00' },
    ],
    aiCoachStatus: 'Heavy Training',
    recommendation: 'Ready for Heavy Training 💪',
  },
  {
    min: 75,
    tier: 'very-good',
    label: 'Very Good',
    labelTh: 'ดีมาก',
    color: '#3FD965',
    gradientStops: [
      { offset: '0%', color: '#65E572' },
      { offset: '100%', color: '#3FD965' },
    ],
    aiCoachStatus: 'Normal Training',
    recommendation: 'Ready for Normal Training',
  },
  {
    min: 60,
    tier: 'good',
    label: 'Good',
    labelTh: 'ดี',
    color: '#FFD84A',
    gradientStops: [
      { offset: '0%', color: '#FFD84A' },
      { offset: '100%', color: '#FFB400' },
    ],
    aiCoachStatus: 'Moderate Training',
    recommendation: 'Ready for Regular Workout',
  },
  {
    min: 40,
    tier: 'moderate',
    label: 'Moderate',
    labelTh: 'ปานกลาง',
    color: '#FF9E42',
    gradientStops: [
      { offset: '0%', color: '#FF9E42' },
      { offset: '100%', color: '#FF7A00' },
    ],
    aiCoachStatus: 'Light Training',
    recommendation: 'Light Training Recommended',
  },
  {
    min: 20,
    tier: 'recovery',
    label: 'Recovery',
    labelTh: 'พักฟื้น',
    color: '#FF6B5B',
    gradientStops: [
      { offset: '0%', color: '#FF6B5B' },
      { offset: '100%', color: '#FF4E3A' },
    ],
    aiCoachStatus: 'Recovery Workout',
    recommendation: 'Light Workout Recommended',
  },
  {
    min: 0,
    tier: 'rest-today',
    label: 'Rest Today',
    labelTh: 'พักผ่อนวันนี้',
    color: '#FF4D4D',
    gradientStops: [
      { offset: '0%', color: '#FF4D4D' },
      { offset: '100%', color: '#D63031' },
    ],
    aiCoachStatus: 'Rest & Sleep',
    recommendation: 'Your body needs recovery',
  },
]

export function fitnessScoreTierOf(score: number): (typeof TIERS)[number] {
  return TIERS.find((t) => score >= t.min) ?? TIERS[TIERS.length - 1]
}

export interface FitnessScoreImprovementTip {
  factorLabel: string
  currentValue: number
  suggestedValue: number
  scoreDelta: number
}

// ก้าวที่แนะนำให้ลองพัฒนาปัจจัยที่เลือกไว้ (จุดเปอร์เซ็นต์) — ตัวเลขคงที่ กันไม่ให้คำแนะนำแกว่งไปมาตามข้อมูล
// (เช่น แนะนำก้าวเล็กมากตอนใกล้ 100% จนดูไม่มีความหมาย)
const IMPROVEMENT_STEP = 10

// ฟีดแบ็ก "Fitness Score ต้องบอกได้ว่า 'ทำอะไรแล้วคะแนนขึ้น' ไม่ใช่แค่บอกที่มาของคะแนนเฉยๆ" — เลือกปัจจัย
// ที่คะแนนต่ำสุดในบรรดาปัจจัยที่มีข้อมูล+น้ำหนัก > 0 (ปัจจัยที่ไม่มีข้อมูล เช่น Sleep ไม่มีทางแนะนำให้
// "พัฒนา" ได้ เพราะยังไม่มีตัวเลขให้ตั้งต้น) แล้วจำลองผลถ้าปัจจัยนั้นขึ้นอีก IMPROVEMENT_STEP จุด (เพดาน
// 100) — เรียก computeFitnessScore ซ้ำสองรอบ (ค่าจริง vs ค่าจำลอง) แทนคำนวณสูตรถ่วงน้ำหนักแยกเอง กัน
// ตัวเลขคำแนะนำเพี้ยนจากคะแนนที่โชว์จริงถ้าสูตรใน computeFitnessScore เปลี่ยนในอนาคต
export function suggestFitnessScoreImprovement(factors: FitnessScoreFactor[]): FitnessScoreImprovementTip | null {
  const available = factors.filter((f): f is FitnessScoreFactor & { value: number } => f.value != null && f.weight > 0)
  if (available.length === 0) return null

  const lowest = available.reduce((worst, f) => (f.value < worst.value ? f : worst), available[0])
  if (lowest.value >= 100) return null

  const suggestedValue = Math.min(100, lowest.value + IMPROVEMENT_STEP)
  const currentScore = computeFitnessScore(factors).score
  const improvedFactors = factors.map((f) => (f.key === lowest.key ? { ...f, value: suggestedValue } : f))
  const improvedScore = computeFitnessScore(improvedFactors).score

  return {
    factorLabel: lowest.label,
    currentValue: lowest.value,
    suggestedValue,
    scoreDelta: improvedScore - currentScore,
  }
}

export function computeFitnessScore(factors: FitnessScoreFactor[]): FitnessScoreResult {
  const available = factors.filter((f): f is FitnessScoreFactor & { value: number } => f.value != null)
  const totalWeight = available.reduce((sum, f) => sum + f.weight, 0)

  const score =
    totalWeight > 0
      ? Math.round(Math.max(0, Math.min(100, available.reduce((sum, f) => sum + f.value * (f.weight / totalWeight), 0))))
      : 0

  const tier = fitnessScoreTierOf(score)
  return {
    score,
    tier: tier.tier,
    tierLabel: tier.label,
    tierLabelTh: tier.labelTh,
    color: tier.color,
    gradientStops: tier.gradientStops,
    aiCoachStatus: tier.aiCoachStatus,
    recommendation: tier.recommendation,
    breakdown: factors,
  }
}
