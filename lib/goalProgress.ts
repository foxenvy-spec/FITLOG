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

export interface GoalEtaEntry {
  date: string // measured_at, "YYYY-MM-DD"
  value: number
}

// เกณฑ์ความน่าเชื่อถือก่อนกล้าโชว์ ETA — ตัดสินใจร่วมกับผู้ใช้ตอนออกแบบฟีเจอร์นี้ (ไม่ใช่ค่าที่เดาเอง):
// ข้อมูลน้อยกว่านี้/ช่วงเวลาสั้นกว่านี้ อัตราเปลี่ยนแปลง/สัปดาห์จะแกว่งเยอะเกินกว่าจะทำนายได้จริง
// (น้ำหนักวันต่อวันแกว่งจากน้ำ/อาหารในกระเพาะได้หลาย kg โดยไม่เกี่ยวกับเทรนด์จริงเลย)
const MIN_ENTRIES = 3
const MIN_SPAN_DAYS = 14
// อัตราช้ากว่านี้ (>2 ปีถึงเป้า) ถือว่าไม่ใช่ ETA ที่มีประโยชน์อีกต่อไป มีแต่จะดูมั่นใจเกินจริง
const MAX_ETA_WEEKS = 104

// คาดว่าจะถึงเป้าหมายอีกกี่สัปดาห์ — คำนวณจากอัตราเปลี่ยนแปลงจริงระหว่างค่าที่บันทึกเก่าสุด/ใหม่สุดในชุด
// ข้อมูลที่ส่งเข้ามา (endpoint-to-endpoint ตรงกับที่ goalProgressPct ใช้อยู่แล้ว ไม่ใช่ regression แยกสูตร
// ใหม่ ให้ % progress กับ ETA มาจากฐานข้อมูลชุดเดียวกันเป๊ะ) — คืน null (ไม่โชว์ ETA เลย ไม่ใช่โชว์ตัวเลข
// ที่ไม่น่าเชื่อถือ) เมื่อ: ข้อมูลไม่พอ (ดู MIN_ENTRIES/MIN_SPAN_DAYS ด้านบน), ถึงเป้าหมายพอดีแล้ว,
// แนวโน้มสวนทางเป้าหมาย (เช่น ตั้งเป้าลดน้ำหนักแต่ช่วงนี้น้ำหนักขึ้น — ฟีดแบ็ก "ซ่อน ETA ไปเลย ไม่โชว์
// อะไรเพิ่ม" แทนที่จะโชว์ตัวเลขติดลบ/สวนทางที่สับสน), หรืออัตราช้าเกิน MAX_ETA_WEEKS
export function estimateGoalEtaWeeks(entries: GoalEtaEntry[], target: number): number | null {
  if (entries.length < MIN_ENTRIES) return null

  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const earliest = sorted[0]
  const latest = sorted[sorted.length - 1]

  const spanDays =
    (new Date(`${latest.date}T00:00:00`).getTime() - new Date(`${earliest.date}T00:00:00`).getTime()) / 86_400_000
  if (spanDays < MIN_SPAN_DAYS) return null

  const remaining = target - latest.value
  if (remaining === 0) return null

  const ratePerWeek = ((latest.value - earliest.value) / spanDays) * 7
  // เครื่องหมายของ remaining กับ ratePerWeek ต้องตรงกัน = กำลังเข้าใกล้เป้าหมายจริง (ไม่ใช่ห่างออกไป)
  if (ratePerWeek === 0 || Math.sign(ratePerWeek) !== Math.sign(remaining)) return null

  const weeks = Math.round(remaining / ratePerWeek)
  if (weeks <= 0 || weeks > MAX_ETA_WEEKS) return null
  return weeks
}
