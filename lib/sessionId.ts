import { todayStr } from './weekdays'

// 6F-P1 — session_id ของ /session ต้อง "สร้างครั้งเดียวต่อการเข้าเซสชัน" ไม่ใช่ต่อการ persist แต่ละครั้ง
// (ไม่งั้นจะย้อนกลับไปเป็นปัญหาเดิมที่ session_id ควรแก้) และต้อง resume ค่าเดิมได้ถ้า refresh/ปิดแท็บ
// กลางเซสชันแล้วกลับมาต่อ — เก็บใน sessionStorage คีย์เดียวต่อ "context" ของเซสชันนั้น ไม่ใช่คีย์เดียว
// ต่อวันเฉยๆ (ต่างจาก sessionStorageKey ของนาฬิกาจับเวลาใน session/page.tsx ซึ่งเป็น single-slot ต่อวัน
// พอสำหรับ cosmetic timer แต่ไม่พอสำหรับ identity: ถ้าทำเซสชันชดเชยค้างไว้ไม่จบแล้วเปิดเซสชันปกติของวันนี้
// contextKey ที่ต่างกัน (dayId คนละค่า) จะกันไม่ให้สอง session ปนกันได้เอง โดยไม่ต้องพึ่ง endSession() ถูก
// เรียกครบทุกครั้ง — ดู 6F-P1 lifecycle trace: ไม่มี beforeunload/unmount cleanup ในแอปนี้โดยเจตนา (ตั้งใจ
// ไม่เพิ่ม เพราะการปล่อยเซสชันค้างแล้วกลับมาทำต่อคือ resume ที่ถูกต้องอยู่แล้ว ไม่ใช่บั๊ก)
//
// contextKey ที่ปลอดภัยต้องเป็น identity ของ "สิ่งที่กำลังเริ่ม" ไม่ใช่ literal คงที่ — program day มี
// dayId เป็น identity อยู่แล้ว (unique ต่อแผน) แต่ generated session ไม่มี program_days row ให้อ้างอิง จึง
// ต้องมี StoredGeneratedSession.id ของตัวเอง (lib/generatedSession.ts) ห้ามใช้ literal 'generated' ตรงๆ
// เพราะสอง generated session คนละรอบ (สร้างใหม่ทับ sessionStorage เดิม) จะใช้ contextKey เดียวกัน ทำให้
// session ที่สองสืบทอด session_id ของ session แรกที่ทำค้างไว้แบบผิดๆ
function sessionIdKey(contextKey: string): string {
  return `fitlog:active-session-id:${todayStr()}:${contextKey}`
}

export function getOrCreateSessionId(contextKey: string): string {
  const key = sessionIdKey(contextKey)
  const existing = window.sessionStorage.getItem(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  window.sessionStorage.setItem(key, id)
  return id
}

export function clearSessionId(contextKey: string): void {
  window.sessionStorage.removeItem(sessionIdKey(contextKey))
}
