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
//
// ฟีดแบ็ก (design review, micro-polish หลังปิด P1) "การ์ด Body Goal ตอนนี้ '7% Progress · เหลืออีก 6.5 kg'
// เป็นประโยคเดียวความหนาแน่นเท่ากันหมด อยากให้ Progress % เด่นเป็น visual hierarchy ชัดกว่านี้ ไม่ต้องเพิ่ม
// ข้อมูลใหม่" — แยกข้อความเป็น 2 ส่วน (headline = ตัวเลข %/ป้าย "เริ่มต้นเป้าหมาย", detail = ส่วนที่เหลือ)
// ให้ผู้เรียกใช้ (DashboardView.tsx) ไปจัด hierarchy ทางภาพเอง (ตัวใหญ่/สีเด่น vs ตัวเล็ก/จาง) โดยไม่ต้อง
// parse string ย้อนกลับ — goalProgressLabel() เดิมยังคงพฤติกรรม/string output เป๊ะทุกประการ (ประกอบจาก
// parts นี้เอง) ไม่กระทบจุดเรียกใช้เดิมที่ยังต้องการ string เดียว (เช่น MobileDashboardView.tsx)
export function goalProgressLabelParts(pct: number, remainingText?: string | null): { headline: string; detail: string } {
  const rounded = Math.round(Math.max(0, Math.min(100, pct)))
  if (rounded <= 0) {
    return { headline: 'เริ่มต้นเป้าหมาย', detail: remainingText ? `· เหลืออีก ${remainingText}` : '' }
  }
  return { headline: `${rounded}%`, detail: remainingText ? `Progress · เหลืออีก ${remainingText}` : 'Progress' }
}

export function goalProgressLabel(pct: number, remainingText?: string | null): string {
  const { headline, detail } = goalProgressLabelParts(pct, remainingText)
  return detail ? `${headline} ${detail}` : headline
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

// คาดว่าจะถึงเป้าหมายอีกกี่สัปดาห์ — อัตราเปลี่ยนแปลง/สัปดาห์คำนวณด้วยเส้นแนวโน้ม least-squares
// (linear regression) จาก "ทุก" ค่าที่บันทึกไว้ในช่วงเก่าสุด-ใหม่สุด ไม่ใช่แค่ 2 จุดปลาย (endpoint-to-
// endpoint) — ฟีดแบ็ก "ผู้ใช้บันทึกไม่สม่ำเสมอ บางสัปดาห์ไม่ได้วัด อย่างต่ำเดือนละ 4 ครั้ง" ค่าที่วัดแต่ละ
// ครั้งเป็นค่าวันเดียว แกว่งได้จากน้ำ/อาหารในกระเพาะ (±0.5-2 kg ปกติ) ถ้าอิงแค่จุดแรก/จุดสุดท้าย ตัวไหน
// สุ่มมาไม่ดีก็ทำให้ ETA เพี้ยนทั้งก้อน — regression ใช้ทุกจุดช่วยเฉลี่ย noise ออก และไม่ต้องมีจังหวะบันทึก
// สม่ำเสมอเลย (รองรับข้อมูลห่างไม่เท่ากันได้เป็นปกติ) ยิ่งบันทึกถี่/สม่ำเสมอขึ้นเรื่อยๆ เส้นก็ยิ่งนิ่งขึ้นเอง
// โดยอัตโนมัติ ไม่ต้องแก้เกณฑ์ขั้นต่ำเพิ่ม — remaining (ระยะที่เหลือถึงเป้าหมาย) ยังอิงค่าจริงล่าสุดที่
// บันทึกไว้ (ไม่ใช่ค่าที่ fit จาก regression) ให้ตรงกับตัวเลข "ตอนนี้" ที่ผู้ใช้เห็นในการ์ดเป๊ะ
// คืน null (ไม่โชว์ ETA เลย ไม่ใช่โชว์ตัวเลขที่ไม่น่าเชื่อถือ) เมื่อ: ข้อมูลไม่พอ (ดู MIN_ENTRIES/
// MIN_SPAN_DAYS ด้านบน), ถึงเป้าหมายพอดีแล้ว, แนวโน้มสวนทางเป้าหมาย (เช่น ตั้งเป้าลดน้ำหนักแต่ช่วงนี้
// น้ำหนักขึ้น — ฟีดแบ็ก "ซ่อน ETA ไปเลย ไม่โชว์อะไรเพิ่ม" แทนที่จะโชว์ตัวเลขติดลบ/สวนทางที่สับสน),
// หรืออัตราช้าเกิน MAX_ETA_WEEKS
export function estimateGoalEtaWeeks(entries: GoalEtaEntry[], target: number): number | null {
  if (entries.length < MIN_ENTRIES) return null

  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const earliest = sorted[0]
  const latest = sorted[sorted.length - 1]

  const earliestMs = new Date(`${earliest.date}T00:00:00`).getTime()
  const spanDays = (new Date(`${latest.date}T00:00:00`).getTime() - earliestMs) / 86_400_000
  if (spanDays < MIN_SPAN_DAYS) return null

  const remaining = target - latest.value
  if (remaining === 0) return null

  // เส้นแนวโน้ม least-squares: x = จำนวนวันนับจากจุดแรก, y = ค่าที่วัด
  const points = sorted.map((e) => ({
    x: (new Date(`${e.date}T00:00:00`).getTime() - earliestMs) / 86_400_000,
    y: e.value,
  }))
  const n = points.length
  const meanX = points.reduce((s, p) => s + p.x, 0) / n
  const meanY = points.reduce((s, p) => s + p.y, 0) / n
  const numerator = points.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0)
  const denominator = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0)
  if (denominator === 0) return null // จุดทั้งหมดอยู่วันเดียวกัน (ไม่ควรเกิดเพราะผ่าน spanDays check แล้ว แต่กันไว้)

  const ratePerWeek = (numerator / denominator) * 7
  // เครื่องหมายของ remaining กับ ratePerWeek ต้องตรงกัน = กำลังเข้าใกล้เป้าหมายจริง (ไม่ใช่ห่างออกไป)
  if (ratePerWeek === 0 || Math.sign(ratePerWeek) !== Math.sign(remaining)) return null

  const weeks = Math.round(remaining / ratePerWeek)
  if (weeks <= 0 || weeks > MAX_ETA_WEEKS) return null
  return weeks
}
