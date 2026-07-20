import type { SupabaseClient } from '@supabase/supabase-js'

// ค่า default เมื่อผู้ใช้ยังไม่เคยตั้งเป้าหมาย cardio เอง (ตัวเลขอ้างอิงหลักการออกกำลังกาย
// cardio ทั่วไปที่แนะนำกัน ~150 นาที/สัปดาห์ ไม่ใช่คำแนะนำทางการแพทย์)
export const DEFAULT_CARDIO_TARGETS = {
  minutes: 150,
  sessions: 3,
}

export type WeeklyCardioTargets = {
  minutes: number
  sessions: number
}

type WeeklyCardioTargetsRow = {
  cardio_minutes: number | null
  cardio_sessions: number | null
}

// รวมค่าจากแถวในตาราง (ถ้ามี) เข้ากับ default — คอลัมน์ไหนเป็น null/ไม่มีแถวเลย ใช้ default แทน
export function mergeWeeklyCardioTargets(row: WeeklyCardioTargetsRow | null): WeeklyCardioTargets {
  return {
    minutes: typeof row?.cardio_minutes === 'number' && row.cardio_minutes > 0 ? row.cardio_minutes : DEFAULT_CARDIO_TARGETS.minutes,
    sessions:
      typeof row?.cardio_sessions === 'number' && row.cardio_sessions > 0 ? row.cardio_sessions : DEFAULT_CARDIO_TARGETS.sessions,
  }
}

// ดึงเป้าหมาย cardio ของผู้ใช้ปัจจุบัน (ตาม RLS ของ session ใน supabase client) รวมกับ default แล้ว
export async function fetchWeeklyCardioTargets(supabase: SupabaseClient): Promise<WeeklyCardioTargets> {
  const { data } = await supabase.from('weekly_volume_targets').select('cardio_minutes, cardio_sessions').maybeSingle()
  return mergeWeeklyCardioTargets(data as WeeklyCardioTargetsRow | null)
}

// บันทึกเป้าหมาย cardio ของผู้ใช้ (upsert แถวเดียวต่อ user ร่วมกับเป้าหมายกลุ่มกล้ามเนื้อ
// ถ้ามีอยู่แล้ว — onConflict: 'user_id' จึงอัปเดตเฉพาะคอลัมน์ที่ส่งมา ไม่ทับค่าอื่นในแถว)
export async function saveWeeklyCardioTargets(supabase: SupabaseClient, userId: string, targets: WeeklyCardioTargets) {
  const { error } = await supabase.from('weekly_volume_targets').upsert(
    {
      user_id: userId,
      cardio_minutes: targets.minutes,
      cardio_sessions: targets.sessions,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
  if (error) throw error
}
