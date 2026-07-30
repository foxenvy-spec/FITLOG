// ==================================================================
// BMR/TDEE — ประมาณอัตราการเผาผลาญพื้นฐาน (Basal Metabolic Rate) ด้วยสูตร Mifflin-St Jeor
// (1990) จากน้ำหนัก/ส่วนสูง/อายุ/เพศที่ผู้ใช้กรอกไว้ในโปรไฟล์และหน้า Health — ใช้เมื่อผู้ใช้ยังไม่ได้
// กรอก BMR จากรายงานเครื่องชั่ง (InBody/Fitdays ฯลฯ) ซึ่งวัดจริงและแม่นกว่าค่าประมาณนี้
// อ้างอิง: Mifflin MD, et al. "A new predictive equation for resting energy expenditure"
// Am J Clin Nutr. 1990 — สูตรนี้แม่นกว่า Harris-Benedict รุ่นเก่าโดยเฉลี่ย
// ==================================================================

export function computeBmr(weightKg: number, heightCm: number, age: number, sex: 'male' | 'female'): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return Math.round(sex === 'male' ? base + 5 : base - 161)
}

export const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
} as const

export type ActivityLevel = keyof typeof ACTIVITY_MULTIPLIERS

export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'นั่งทำงาน ไม่ค่อยขยับตัว',
  light: 'ออกกำลังกายเบาๆ 1-3 วัน/สัปดาห์',
  moderate: 'ออกกำลังกายปานกลาง 3-5 วัน/สัปดาห์',
  active: 'ออกกำลังกายหนัก 6-7 วัน/สัปดาห์',
  veryActive: 'ออกกำลังกายหนักมาก + งานใช้แรงกาย',
}

export function computeTdee(bmr: number, level: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[level])
}
