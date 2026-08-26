import type { Goal } from './types'

// v62: ฟีดแบ็ก "ทำให้ progress % เป็นเรียลไทม์ตลอดการบันทึก แทนที่จะแช่แข็งตอนตั้งเป้าหมาย" — starting_value
// ถูกบันทึกครั้งเดียวตอนสร้างเป้าหมาย (ดู calendar/page.tsx currentBaseline()) เป็นค่าน้ำหนัก/ไขมัน ณ วันนั้น
// เป๊ะ ทำให้ % คืบหน้านับตั้งแต่ "วันตั้งเป้า" เท่านั้น ไม่นับความคืบหน้าที่เกิดก่อนหน้านั้น หรือถ้าลืมบันทึกค่า
// ใหม่หลังตั้งเป้าเลยจะติด 0% แม้ค่าจริงจะขยับใกล้เป้าหมายไปมากแล้วในประวัติทั้งหมด — เปลี่ยนให้ใช้ค่าที่เก่า
// ที่สุดที่มีบันทึกไว้จริง (earliestTrackedValue, จุดเรียกใช้หาให้จาก metrics ทั้งหมด ไม่ใช่แค่ตอนตั้งเป้า)
// เป็นค่าเริ่มต้นแทน starting_value เสมอเมื่อมีให้ — ทุกครั้งที่บันทึกข้อมูลใหม่ ทั้ง current และ (ถ้าเป็นเอนทรี
// เก่าสุด) earliestTrackedValue จะขยับตาม ทำให้ % คำนวณสดใหม่ตลอดโดยอัตโนมัติ ไม่ต้องแตะโค้ดจุดอื่น
// (fallback ไป starting_value เดิมเฉพาะตอนหาค่าประวัติไม่ได้จริงๆ เช่น query ล้มเหลว)
export function goalProgressPct(
  goal: Pick<Goal, 'target_value' | 'starting_value'>,
  currentValue: number | null,
  earliestTrackedValue?: number | null,
): number | null {
  if (currentValue === null || goal.target_value === null) return null
  const start = earliestTrackedValue ?? goal.starting_value ?? null
  if (start === null) return null
  if (goal.target_value === start) return currentValue >= goal.target_value ? 100 : 0
  return Math.min(100, Math.max(0, ((currentValue - start) / (goal.target_value - start)) * 100))
}
