// 0 = อาทิตย์ ... 6 = เสาร์ (ตรงกับ Date.prototype.getDay())
export const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'] as const
export const WEEKDAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const

// ใช้ timezone เอเชีย/กรุงเทพฯ ตรงๆ เสมอ แทนที่จะพึ่ง timezone ของเครื่องที่รันโค้ด —
// server บน Vercel รันเป็น UTC ส่วน browser ของผู้ใช้เป็นเวลาไทย ถ้าคำนวณจาก
// timezone ของเครื่องจะได้คนละค่ากันช่วง 00:00-07:00 น. เวลาไทย (ยังเป็นเมื่อวานตาม UTC)
// การ fix ให้เป็น Asia/Bangkok เสมอทำให้ server กับ client ได้ "วันนี้" ตรงกันทุกครั้ง
const BANGKOK_TZ = 'Asia/Bangkok'

function bangkokParts(d: Date) {
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
