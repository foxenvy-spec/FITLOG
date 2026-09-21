// Auth Expiry Handling v1 (Option 2, LOCKED) — เนื้อหาสำหรับ session-specific acknowledgement เท่านั้น
// (ดู components/AuthExpiryListener.tsx สำหรับ global detection ผ่าน onAuthStateChange ซึ่งเป็นคนละ
// layer กันโดยเจตนา: isAuthError() ที่นี่ไม่ได้ตัดสินใจ redirect ใดๆ แค่บอกว่า error ที่ throw ออกมาจาก
// write หนึ่งครั้ง "หน้าตาเหมือน" auth ล้มเหลว พอจะเลือกข้อความที่เข้าใจได้แทน raw PostgREST/GoTrue error
// เฉยๆ — ไม่ scan error message กระจายทุกจุดของแอปตามที่ trace เตือนไว้ว่าไม่ scale เพราะ scope ของ
// helper นี้จำกัดแค่ session/page.tsx (ตาม contract v1's IN SCOPE)
export function isAuthError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: unknown; status?: unknown; message?: unknown }
  if (e.code === 'PGRST301') return true
  if (e.status === 401) return true
  if (typeof e.message === 'string' && /jwt|token/i.test(e.message)) return true
  return false
}

export const AUTH_EXPIRED_MESSAGE = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'

// Flag ให้ AuthExpiryListener แยกได้ว่า SIGNED_OUT ที่เพิ่งเกิดมาจาก SignOutButton (ผู้ใช้กดออกจากระบบ
// เอง — ไม่ควรเห็นข้อความ "เซสชันหมดอายุ" ซ้ำกับ redirect ที่ SignOutButton ทำเองอยู่แล้ว) หรือมาจาก
// refresh token ใช้ไม่ได้แล้วจริงๆ (ต้องแจ้งเตือน) — module-level เพียงพอเพราะทั้งสอง component mount
// อยู่ใน client bundle เดียวกันตลอดอายุ tab เดียวกัน ไม่ต้อง persist ข้าม reload
let intentionalSignOut = false

export function markIntentionalSignOut(): void {
  intentionalSignOut = true
}

export function consumeIntentionalSignOut(): boolean {
  const was = intentionalSignOut
  intentionalSignOut = false
  return was
}
