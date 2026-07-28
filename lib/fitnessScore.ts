// คะแนนรวม "Fitness Score" — ไม่มีอยู่ใน FITLOG เดิมมาก่อน สร้างใหม่ตามสเปคที่ผู้ใช้ให้มา:
// น้ำหนักตั้งต้นของแต่ละปัจจัย (รวมกัน 100%):
//   Workout Completion (ฝึกกี่วันใน 7 วันที่ผ่านมา) 30%, Workout Streak 20%, Sleep 20%,
//   Recovery 15%, Weekly Goal Progress 10%, Activity วันนี้ 5%
// FITLOG ไม่มีการเชื่อมต่อข้อมูลการนอน (ไม่มี Apple Health/Google Fit) จึง "Sleep" จะไม่มีค่า
// (value: null) เสมอ — เมื่อปัจจัยไหนไม่มีค่า ระบบจะตัดออกแล้วกระจายน้ำหนักของมันไปให้ปัจจัย
// ที่เหลือตามสัดส่วนเดิม (proportional redistribution) แทนที่จะนับเป็น 0 หรือข้ามทั้งคะแนน

export interface FitnessScoreFactor {
  key: string
  // 0-100, หรือ null ถ้าไม่มีข้อมูลสำหรับปัจจัยนี้ (เช่น Sleep)
  value: number | null
  // น้ำหนักตั้งต้น (หน่วยเดียวกับเปอร์เซ็นต์ เช่น 30 = 30%) รวมกันทุกปัจจัยควรเป็น 100
  weight: number
}

export type FitnessScoreTier = 'elite' | 'excellent' | 'good' | 'fair' | 'recovery-needed'

export interface FitnessScoreResult {
  score: number
  tier: FitnessScoreTier
  tierLabel: string
  tierLabelTh: string
  color: string
}

const TIERS: { min: number; tier: FitnessScoreTier; label: string; labelTh: string; color: string }[] = [
  { min: 95, tier: 'elite', label: 'Elite', labelTh: 'ยอดเยี่ยมที่สุด', color: '#4ADE80' },
  { min: 85, tier: 'excellent', label: 'Excellent', labelTh: 'ยอดเยี่ยม', color: '#7A9B57' },
  { min: 70, tier: 'good', label: 'Good', labelTh: 'ดี', color: '#EAB308' },
  { min: 50, tier: 'fair', label: 'Fair', labelTh: 'พอใช้', color: '#E8A33D' },
  { min: 0, tier: 'recovery-needed', label: 'Recovery Needed', labelTh: 'ควรพักผ่อน', color: '#C1503A' },
]

export function fitnessScoreTierOf(score: number): (typeof TIERS)[number] {
  return TIERS.find((t) => score >= t.min) ?? TIERS[TIERS.length - 1]
}

export function computeFitnessScore(factors: FitnessScoreFactor[]): FitnessScoreResult {
  const available = factors.filter((f): f is FitnessScoreFactor & { value: number } => f.value != null)
  const totalWeight = available.reduce((sum, f) => sum + f.weight, 0)

  const score =
    totalWeight > 0
      ? Math.round(Math.max(0, Math.min(100, available.reduce((sum, f) => sum + f.value * (f.weight / totalWeight), 0))))
      : 0

  const tier = fitnessScoreTierOf(score)
  return { score, tier: tier.tier, tierLabel: tier.label, tierLabelTh: tier.labelTh, color: tier.color }
}
