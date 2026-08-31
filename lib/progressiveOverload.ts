import type { LastPerformance } from './workoutSession'
import type { WeightUnit } from './weightUnit'

export interface OverloadSuggestion {
  weightKg: number
  reps: number
  increasedWeight: boolean
}

// แกะช่วง reps เป้าหมาย (เช่น "8-12" -> {min:8, max:12}, "10" -> {min:10, max:10})
// จากข้อความอิสระของ target_reps — คนละหน้าที่กับ parseRangeToNumber (importWorkoutExcel.ts) ซึ่งคืน
// ค่าเฉลี่ยตัวเดียว ตรงนี้ต้องแยก min/max จริงเพื่อรู้ "ขอบบน" (ใช้ตัดสินใจว่าควรเพิ่มน้ำหนักหรือยัง)
function parseRepRange(raw: string | null): { min: number; max: number } | null {
  if (!raw) return null
  const nums = raw.match(/[\d.]+/g)
  if (!nums || nums.length === 0) return null
  const values = nums.map(Number).filter((n) => !Number.isNaN(n))
  if (values.length === 0) return null
  return { min: Math.min(...values), max: Math.max(...values) }
}

// แนะนำน้ำหนัก/reps ของ "วันนี้" จากผลงานครั้งก่อน เทียบกับช่วง reps เป้าหมายตามแผน (double progression:
// วิธีมาตรฐานที่ใช้กันทั่วไปในโปรแกรมฝึกความแข็งแรง) — ถ้าครั้งก่อนทำได้ >= ขอบบนของช่วง reps แล้ว
// แปลว่าน้ำหนักเบาไปสำหรับช่วงนี้ ให้เพิ่มน้ำหนักขึ้นหนึ่ง step (ตามหน่วยที่ผู้ใช้ตั้งไว้ เดียวกับ step ของ
// NumberStepper/dropSetWeightKg ในหน้านี้ — 2.5kg/5lb) แล้วปรับเป้า reps กลับไปที่ขอบล่างของช่วง (เพราะ
// น้ำหนักมากขึ้น reps ต่อเซ็ตจะทำได้น้อยลงตามธรรมชาติ) ถ้ายังไม่ถึงขอบบน ให้คงน้ำหนักเดิม แนะนำเพิ่ม reps
// อีก 1 ครั้งจากครั้งก่อน (ไม่เกินขอบบนของช่วง) — ท่า bodyweight (น้ำหนัก 0 หรือไม่มี) ไม่มีอะไรให้ "เพิ่ม
// น้ำหนัก" จึงคืน null ไปเลย
export function suggestNextLoad(
  last: LastPerformance,
  targetRepsRaw: string | null,
  unit: WeightUnit
): OverloadSuggestion | null {
  if (!last || last.weightKg <= 0) return null

  const range = parseRepRange(targetRepsRaw) ?? { min: last.reps, max: last.reps }
  const step = unit === 'lb' ? 5 * 0.45359237 : 2.5

  if (last.reps >= range.max) {
    return {
      weightKg: Math.round((last.weightKg + step) * 100) / 100,
      reps: Math.max(1, Math.round(range.min)),
      increasedWeight: true,
    }
  }

  return {
    weightKg: last.weightKg,
    reps: Math.min(Math.round(range.max), Math.round(last.reps) + 1),
    increasedWeight: false,
  }
}
