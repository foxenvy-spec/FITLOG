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
