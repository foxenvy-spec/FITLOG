import type { SupabaseClient } from '@supabase/supabase-js'

// Finish-for-Today State Contract v1 (locked) — user intent แยกจาก program_completions (training fact)
// และ active session (transient execution state) โดยเจตนา เก็บที่ profiles.finished_workout_for_date
// เป็น "วันที่ล่าสุด" ที่กด "จบก่อน" แทน boolean ตรงๆ เพื่อให้ cross-day expiry เกิดเองโดยไม่ต้องมี
// cleanup job — เทียบกับ today ตอน read พอ (ดู isFinishedToday ด้านล่าง)

export function isFinishedToday(storedDate: string | null, today: string): boolean {
  return storedDate === today
}

// เรียกจาก handleFinishEarly() (session/page.tsx) "ก่อน" endSession() เท่านั้น — ห้ามเรียกจาก
// natural-completion path (8/8) หรือจาก endSession() เอง เพราะ endSession() เป็น shared path ของทั้งสองเคส
export async function setFinishedToday(
  supabase: SupabaseClient,
  params: { userId: string; date: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: params.userId, finished_workout_for_date: params.date, updated_at: new Date().toISOString() })
  return { error: error?.message ?? null }
}

// เรียกจาก onClick ของปุ่ม START/RESUME "ก่อน" นำทางเข้า /session เท่านั้น (ตาม state contract: เปิด
// /session เฉยๆ/reload/deep-link ต้องไม่ clear) ตั้งใจเป็น fire-and-forget ที่ผู้เรียกไม่ await/ไม่
// preventDefault การนำทาง — ถ้าเขียนพลาด flag ค้างไว้แค่ชั่วคราว (isFinishedToday หมดผลเองข้ามวัน หรือ
// setFinishedToday ครั้งถัดไปเขียนทับ) ไม่ควรบล็อกไม่ให้ผู้ใช้เข้าเซสชันได้
export async function clearFinishedToday(supabase: SupabaseClient, userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: userId, finished_workout_for_date: null, updated_at: new Date().toISOString() })
  return { error: error?.message ?? null }
}
