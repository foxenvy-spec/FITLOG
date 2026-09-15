import { todayStr } from './weekdays'

// บั๊ก (ฟีดแบ็ก "เล่นเซสชันชดเชยอยู่ สลับไปหน้าอื่น แล้วกดปุ่มพา ไป /session อีกครั้ง — พาไปแผนจริงของวันนี้
// แทนที่จะกลับเข้าเซสชันชดเชยเดิม") — ทุกจุดในแอปที่ลิงก์ไป "/session" เฉยๆ (BottomNav ปุ่มลอย, การ์ด
// Today's Workout, ฯลฯ) ถูกสร้างไว้ก่อนฟีเจอร์เซสชันชดเชยจะเกิดขึ้น จึงไม่รู้จัก ?day= เลย — session/page.tsx
// เขียน id ของแผนที่กำลังทำ (ถ้าเป็นเซสชันชดเชยที่ยังไม่จบ) ไว้ที่นี่ ให้ทุกจุดที่ลิงก์ไปเทรนอ่านค่าเดียวกัน
// นี้แทนการ hardcode '/session' ตรงๆ — คีย์ผูกกับวันที่จริง (todayStr()) กันค้างข้ามวัน
//
// localStorage เป็นแค่ "navigation pointer" (จะพากลับไปเซสชันไหน) ไม่ใช่ source of truth ของสถานะการฝึก —
// ข้อมูลจริงยังคงมาจาก DB (workouts.program_day_id, program_completions) ทั้งหมดเหมือนเดิม
function activeMakeupDayKey(): string {
  return `fitlog:active-makeup-day:${todayStr()}`
}

export function getActiveMakeupDayId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(activeMakeupDayKey())
  } catch {
    return null
  }
}

export function setActiveMakeupDayId(dayId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(activeMakeupDayKey(), dayId)
  } catch {}
}

export function clearActiveMakeupDayId(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(activeMakeupDayKey())
  } catch {}
}

// ใช้ตรงจุดที่มี href="/session" hardcode ไว้ — คืน '/session?day=<id>' ถ้ามีเซสชันชดเชยค้างอยู่ ไม่งั้น
// คืน '/session' เฉยๆ เหมือนเดิมทุกประการ
export function sessionHrefWithMakeup(): string {
  const dayId = getActiveMakeupDayId()
  return dayId ? `/session?day=${dayId}` : '/session'
}

// 6C-1 (6A/6C audit — "schedule-override session mislabeled as makeup") — ?day=<program_day_id> ใน URL
// ของ /session มีอย่างน้อย 2 ที่มาที่ต้องแยกออกจากกัน:
// (1) genuine makeup/catch-up — ลิงก์จาก /program, "มีแผนที่พลาด" ใน session/page.tsx เอง, หรือ
//     activeMakeupDayId (เซสชันชดเชยที่ทำค้างไว้) — ตั้งใจ "ทำแผนของอีกวันหนึ่งแทนวันนี้" จริงๆ
// (2) คำแนะนำที่สลับกล้ามเนื้อเพราะ Volume/Recovery ตามปกติ (computeTodaysAction's scheduleOverriddenFrom
//     branch, lib/dashboardStats.ts) — เลือกวันที่ตรงกับกล้ามเนื้อที่แนะนำ ไม่ใช่การ "ชดเชย" อะไรเลย แนบ
//     &source=recommendation ต่อท้าย ?day= มาด้วยเสมอเพื่อบอกจุดนี้
// ก่อนหน้านี้ session/page.tsx ตัดสิน "นี่คือเซสชันชดเชยไหม" จากแค่ day_of_week ต่างจากวันนี้เฉยๆ (ใช้ได้
// ตอน ?day= มีความหมายเดียว) พอมีที่มาที่ 2 เกิดขึ้น เงื่อนไขเดิมเข้าใจผิดว่าเป็นเซสชันชดเชยเสมอ ทำให้ banner/
// BottomNav/Dashboard (ผ่าน activeMakeupSession ทั้งไฟล์นี้) ขึ้น "โหมดชดเชย" ผิดๆ — ฟังก์ชันนี้เป็นจุดเดียว
// ที่ session/page.tsx ต้องเรียกเพื่อตัดสินเรื่องนี้ กัน logic ซ้ำ/หลุด sync กันอีกในอนาคต
export function isGenuineMakeupSession(params: {
  dayParam: string | null
  selectedDayOfWeek: number
  todayDayOfWeek: number
  source: string | null
}): boolean {
  return params.dayParam != null && params.selectedDayOfWeek !== params.todayDayOfWeek && params.source !== 'recommendation'
}
