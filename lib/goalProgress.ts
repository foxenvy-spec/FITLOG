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

// ฟีดแบ็ก "Body Goal โชว์ '0% Progress' ดูเหมือนยังไม่ก้าวหน้าเลย ทั้งที่จริงๆ อาจเพิ่งตั้งเป้าหมายวันนี้ —
// ควรเขียนว่า 'เริ่มต้นเป้าหมาย' แทน" — goalProgressPct คืน 0 ทั้งกรณี "เพิ่งเริ่ม ยังไม่มีข้อมูลขยับ" และ
// "ขยับผิดทาง" (ค่าปัจจุบันแย่กว่าจุดเริ่มต้น ถูก clamp ไว้ที่ 0) แยกกันไม่ได้จากตัวเลขเฉยๆ แต่ทั้งสองกรณีก็
// ไม่ควรใช้คำว่า "0% Progress" เหมือนกัน (สื่อว่า "ยังไม่ได้ทำอะไรเลย" ซึ่งให้ความรู้สึกลบเกินจริง)
// ฟีดแบ็ก "อย่าใช้ progress bar ว่างๆ เฉยๆ — เพิ่มข้อมูลเล็กๆ เช่น 'เหลืออีก 7.1 kg'" — remainingText
// (คำนวณไว้แล้วจากฝั่งเรียก เช่น Math.abs(target - current) ในหน่วยที่แสดงผลจริง) ต่อท้ายด้วย " · เหลืออีก
// X" ต่อจากป้ายเดิม (เริ่มต้นเป้าหมาย/N% Progress) ให้มีตัวเลขที่มีความหมายให้ดูแม้ตอน progress ยังเป็น 0
// ไม่ระบุ = พฤติกรรมเดิมทุกประการ (แค่ป้าย progress เฉยๆ)
export function goalProgressLabel(pct: number, remainingText?: string | null): string {
  const rounded = Math.round(Math.max(0, Math.min(100, pct)))
  const base = rounded <= 0 ? 'เริ่มต้นเป้าหมาย' : `${rounded}% Progress`
  return remainingText ? `${base} · เหลืออีก ${remainingText}` : base
}
