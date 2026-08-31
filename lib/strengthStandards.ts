import type { Workout } from './types'

export type Sex = 'male' | 'female' | null

interface TierRatios {
  novice: number
  intermediate: number
  advanced: number
  elite: number
}

export type CompoundAxis = 'push' | 'pull' | 'legs'

// เกณฑ์อัตราส่วน 1RM ต่อน้ำหนักตัว อ้างอิงตารางมาตรฐานความแข็งแรงทั่วไปที่เผยแพร่กันแพร่หลาย (ลักษณะ
// เดียวกับตาราง Strength Level/บทความฟิตเนสทั่วไป) ไม่ผูกกับสหพันธ์ยกน้ำหนักใดสหพันธ์หนึ่งโดยเฉพาะ — เป็น
// เกณฑ์ประมาณคร่าวๆ แบบเดียวกับที่ lib/vo2max.ts ใช้กับ VO2max (ระบุไว้ในคอมเมนต์ตัวนั้นเหมือนกันว่า "ไม่
// ปรับตามอายุ") แยกชาย/หญิงเพราะสัดส่วนความแข็งแรงบน-ล่างตัวต่างกันจริงตามงานวิจัยสรีรวิทยา (โดยเฉพาะ
// ช่วงบนตัว) ถ้าผู้ใช้ไม่ได้ตั้งค่าเพศไว้ในโปรไฟล์ ใช้ค่าเฉลี่ยของทั้งสองตารางแทน (ดู averagedRatios)
const RATIOS: Record<CompoundAxis, Record<'male' | 'female', TierRatios>> = {
  push: {
    male: { novice: 0.75, intermediate: 1.0, advanced: 1.5, elite: 2.0 },
    female: { novice: 0.5, intermediate: 0.75, advanced: 1.0, elite: 1.25 },
  },
  legs: {
    male: { novice: 1.0, intermediate: 1.5, advanced: 2.0, elite: 2.5 },
    female: { novice: 0.75, intermediate: 1.0, advanced: 1.5, elite: 2.0 },
  },
  pull: {
    male: { novice: 1.25, intermediate: 1.75, advanced: 2.25, elite: 2.75 },
    female: { novice: 1.0, intermediate: 1.5, advanced: 2.0, elite: 2.5 },
  },
}

function averagedRatios(axis: CompoundAxis): TierRatios {
  const m = RATIOS[axis].male
  const f = RATIOS[axis].female
  return {
    novice: (m.novice + f.novice) / 2,
    intermediate: (m.intermediate + f.intermediate) / 2,
    advanced: (m.advanced + f.advanced) / 2,
    elite: (m.elite + f.elite) / 2,
  }
}

// แปลงอัตราส่วน 1RM/น้ำหนักตัว เป็นตำแหน่งบนสเกล 0-100 เทียบกับ 4 ระดับ (novice=25, intermediate=50,
// advanced=75, elite=100) แบบ interpolate เป็นเส้นตรงระหว่างระดับ ไม่ใช่ขั้นบันไดกระโดด เพื่อให้กราฟ
// เรดาร์ขยับตามพัฒนาการจริงทีละนิด ไม่ใช่กระโดดทีละ 25% ตอนข้ามระดับพอดี
function ratioToPct(ratio: number, tiers: TierRatios): number {
  const anchors: [number, number][] = [
    [0, 0],
    [tiers.novice, 25],
    [tiers.intermediate, 50],
    [tiers.advanced, 75],
    [tiers.elite, 100],
  ]
  if (ratio <= 0) return 0
  for (let i = 0; i < anchors.length - 1; i++) {
    const [r0, p0] = anchors[i]
    const [r1, p1] = anchors[i + 1]
    if (ratio <= r1) {
      const t = r1 === r0 ? 1 : (ratio - r0) / (r1 - r0)
      return Math.round(p0 + t * (p1 - p0))
    }
  }
  return 100
}

export interface StrengthAxisResult {
  pct: number
  best1RMKg: number | null
  ratio: number | null
}

const AXIS_KEYWORDS: Record<CompoundAxis, string[]> = {
  push: ['bench press', 'เบนช์เพรส'],
  pull: ['deadlift', 'เดดลิฟต์'],
  legs: ['squat', 'สควอท'],
}

// หา 1RM โดยประมาณที่ดีที่สุด (สูตร Epley) ของท่าที่ตรงกับ keyword ของแกนนี้ จากประวัติ workout เวท
// เทรนนิ่งทั้งหมด — จับคู่แบบ substring บนชื่อท่าที่ผู้ใช้บันทึกจริงตรงๆ (ไม่ผ่าน exercise library) เพราะ
// exercise_name เป็น free text ที่ผู้ใช้พิมพ์เองได้ ไม่การันตีว่าตรงกับชื่อมาตรฐานในคลังท่าเป๊ะ — ครอบคลุม
// ทุกท่าย่อยที่มีคำนี้เป็นส่วนหนึ่งของชื่อ (เช่น "Incline Bench Press", "Sumo Deadlift", "Box Squat") ซึ่ง
// เป็นตัวแทนความแข็งแรงของ movement pattern เดียวกันได้สมเหตุสมผล ไม่ต้องเป๊ะแค่ชื่อมาตรฐานตรงตัว
export function computeStrengthAxis(
  axis: CompoundAxis,
  workouts: Pick<Workout, 'exercise_name' | 'weight_kg' | 'reps' | 'type'>[],
  bodyWeightKg: number | null,
  sex: Sex
): StrengthAxisResult {
  if (!bodyWeightKg || bodyWeightKg <= 0) return { pct: 0, best1RMKg: null, ratio: null }

  const keywords = AXIS_KEYWORDS[axis]
  let best1RM = 0
  workouts.forEach((w) => {
    if (w.type !== 'strength' || !w.exercise_name || !w.weight_kg || !w.reps) return
    const name = w.exercise_name.toLowerCase()
    if (!keywords.some((k) => name.includes(k))) return
    const oneRM = w.weight_kg * (1 + w.reps / 30)
    if (oneRM > best1RM) best1RM = oneRM
  })

  if (best1RM <= 0) return { pct: 0, best1RMKg: null, ratio: null }

  const tiers = sex === 'male' || sex === 'female' ? RATIOS[axis][sex] : averagedRatios(axis)
  const ratio = best1RM / bodyWeightKg
  return { pct: ratioToPct(ratio, tiers), best1RMKg: Math.round(best1RM * 10) / 10, ratio: Math.round(ratio * 100) / 100 }
}

// Endurance — ใช้เกณฑ์เดียวกับ classifyVO2Max (lib/vo2max.ts) แปลงเป็นสเกล 0-100 แบบ interpolate เพื่อให้
// อยู่บนมาตราส่วนเดียวกับแกนอื่นในกราฟเรดาร์ ไม่ได้คิดเกณฑ์ใหม่แยกต่างหาก (จุดตัด 25/35/45/55 ตรงกับ
// classifyVO2Max เป๊ะ)
export function vo2MaxToPct(vo2max: number | null): number {
  if (vo2max === null || vo2max <= 0) return 0
  const anchors: [number, number][] = [
    [0, 0],
    [25, 25],
    [35, 50],
    [45, 75],
    [55, 100],
  ]
  for (let i = 0; i < anchors.length - 1; i++) {
    const [r0, p0] = anchors[i]
    const [r1, p1] = anchors[i + 1]
    if (vo2max <= r1) {
      const t = (vo2max - r0) / (r1 - r0)
      return Math.round(p0 + t * (p1 - p0))
    }
  }
  return 100
}

// Core — ไม่มีเกณฑ์มาตรฐาน 1RM/bodyweight สากลแบบ push/pull/legs (ยืนยันแล้วว่าไม่ควรสมมติเกณฑ์ขึ้นเอง)
// ใช้ % วอลุ่มเทรนนิ่งจริงของกลุ่มกล้ามเนื้อแกนกลางลำตัวเทียบกับวอลุ่มรวมแทน — 100% เมื่อสัดส่วนถึง
// TARGET_CORE_SHARE_PCT (จุดกึ่งกลางของช่วง 10-15% ที่โปรแกรมฝึกทั่วไปแนะนำให้เป็นสัดส่วนของกล้ามเนื้อ
// แกนกลาง) ไม่มีเพดานให้ไต่เกิน 100% แม้ฝึกเกินสัดส่วนนี้มาก เพราะนี่คือตัวชี้วัด "ฝึกสม่ำเสมอเพียงพอไหม"
// ไม่ใช่ตัวชี้วัดความแข็งแรงที่ยิ่งเยอะยิ่งดีไม่มีเพดานแบบ 3 แกนบน
const TARGET_CORE_SHARE_PCT = 12.5

export function coreVolumeToPct(coreVolumeKg: number, totalVolumeKg: number): number {
  if (totalVolumeKg <= 0) return 0
  const sharePct = (coreVolumeKg / totalVolumeKg) * 100
  return Math.round(Math.min(100, (sharePct / TARGET_CORE_SHARE_PCT) * 100))
}
