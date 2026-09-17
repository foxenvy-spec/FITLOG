// 0 = อาทิตย์ ... 6 = เสาร์ (ตรงกับ Date.prototype.getDay())
export const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'] as const
export const WEEKDAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const

// ใช้ timezone เอเชีย/กรุงเทพฯ ตรงๆ เสมอ แทนที่จะพึ่ง timezone ของเครื่องที่รันโค้ด —
// server บน Vercel รันเป็น UTC ส่วน browser ของผู้ใช้เป็นเวลาไทย ถ้าคำนวณจาก
// timezone ของเครื่องจะได้คนละค่ากันช่วง 00:00-07:00 น. เวลาไทย (ยังเป็นเมื่อวานตาม UTC)
// การ fix ให้เป็น Asia/Bangkok เสมอทำให้ server กับ client ได้ "วันนี้" ตรงกันทุกครั้ง
const BANGKOK_TZ = 'Asia/Bangkok'

// export ไว้ให้ dashboardStats.ts (getWeekRange/getPreviousWeekRange) ใช้ normalize reference date เป็น
// ปฏิทินไทยก่อนคำนวณขอบเขตสัปดาห์ ด้วยตรรกะเดียวกับ todayStr()/todayDayOfWeek() ด้านล่างเป๊ะ (ไม่คำนวณ
// แยกสูตรใหม่ กันสองจุดหลุด sync กันในอนาคต)
export function bangkokParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  return `${map.year}-${map.month}-${map.day}`
}

export function todayDayOfWeek(): number {
  // en-CA ให้ผลเป็น YYYY-MM-DD ที่ parse กลับเป็น Date (เที่ยงคืน UTC) แล้วอ่าน getUTCDay()
  // ได้ day-of-week ที่ตรงกับปฏิทินวันไทยจริงๆ โดยไม่ปนกับ timezone ของเครื่อง
  const str = bangkokParts(new Date())
  return new Date(`${str}T00:00:00Z`).getUTCDay()
}

export function todayStr() {
  return bangkokParts(new Date())
}

// วันที่ N วันก่อนวันนี้ ในรูปแบบเดียวกับ todayStr() — ใช้ทำ .gte() cutoff
// เพื่อจำกัดขอบเขต query ไม่ให้โตไม่จำกัดตามอายุการใช้งานของผู้ใช้
export function daysAgoStr(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return bangkokParts(d)
}

// จับคู่วันที่ N (0-based ตามลำดับที่เจอในไฟล์) เข้ากับวันจันทร์-เสาร์ (1-6) เป็นค่าเริ่มต้น
// ข้ามวันอาทิตย์ไว้เป็นวันพักโดยปริยาย
export function defaultWeekdayForIndex(index: number): number {
  return (1 + (index % 6)) as number
}

// 6G-P1 #1 — ปี/เดือน (0-based) ของ "วันนี้" ตามปฏิทินไทย (Asia/Bangkok) ใช้ตั้งค่าเริ่มต้นของ cursor
// ปฏิทิน/heatmap แทนการอ่าน new Date().getFullYear()/getMonth() ของเครื่องตรงๆ ซึ่งอาจได้คนละเดือนกับ
// Bangkok ถ้าเครื่องตั้ง timezone อื่นและอยู่ช่วงคาบเกี่ยวเที่ยงคืน (เช่น เครื่องเป็น UTC ตอน 23:xx น.
// วันสุดท้ายของเดือนตามเวลาไทย จะยังเห็นเป็นเดือนเดียวกันของ UTC ซึ่งอาจเป็นเดือนก่อนหน้า)
export function bangkokYearMonth(d: Date = new Date()): { year: number; month0: number } {
  const [y, m] = bangkokParts(d).split('-').map(Number)
  return { year: y, month0: m - 1 }
}

// 6G-P1 #1 — สร้าง grid ปฏิทินของเดือนหนึ่งๆ (firstWeekday ของวันที่ 1 + รายการวันที่ทั้งเดือนเป็น
// YYYY-MM-DD string) โดยไม่ขึ้นกับ timezone ของเครื่องที่รันเลย คำนวณผ่าน Date.UTC ซึ่งเป็นข้อเท็จจริง
// ปฏิทินเกรกอเรียนล้วนๆ (ปี/เดือนที่รู้อยู่แล้วมีกี่วัน วันที่ 1 ตรงกับวันอะไร) ไม่เกี่ยวกับ "ตอนนี้"/
// timezone เลย — ต่างจากคำถามว่า "ตอนนี้คือเดือนไหน" ที่ต้องพึ่ง bangkokYearMonth() ด้านบน
export function bangkokMonthGrid(year: number, month0: number): { firstWeekday: number; days: string[] } {
  const firstWeekday = new Date(Date.UTC(year, month0, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
  const mm = String(month0 + 1).padStart(2, '0')
  const days = Array.from({ length: daysInMonth }, (_, i) => `${year}-${mm}-${String(i + 1).padStart(2, '0')}`)
  return { firstWeekday, days }
}

// 6G-P1 #1 — เลื่อนเดือนไป delta เดือน (ใช้กับปุ่มเปลี่ยนเดือนก่อนหน้า/ถัดไปของ Calendar/Heatmap) คำนวณผ่าน
// Date.UTC เช่นกัน เพราะเป็นเลขคณิตปฏิทินล้วนๆ (ไม่ได้ถามว่า "ตอนนี้" คือเมื่อไหร่) ไม่ต้องพึ่ง Bangkok
// offset แต่ยังต้องเลี่ยง local Date constructor กันปัญหา rollover ข้ามปีที่ผิดพลาดจาก timezone ของเครื่อง
export function shiftMonth(year: number, month0: number, delta: number): { year: number; month0: number } {
  const d = new Date(Date.UTC(year, month0 + delta, 1))
  return { year: d.getUTCFullYear(), month0: d.getUTCMonth() }
}
