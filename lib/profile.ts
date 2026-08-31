import type { createClient } from './supabase/client'

// ชื่อที่แสดงบน Dashboard (การ์ดทักทายด้านบนสุด) — เก็บใน public.profiles.display_name
// ผู้ใช้ตั้งเองได้ผ่านปุ่มตั้งค่า ⚙️ ที่ Dashboard ถ้าเว้นว่างไว้ (null/สตริงว่าง) แอปจะ
// fallback ไปใช้ชื่อที่ตัดจาก email แทนเหมือนเดิม (ดู emailDisplayName ใน dashboard/page.tsx)

export async function saveDisplayName(
  supabase: ReturnType<typeof createClient>,
  name: string
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('ยังไม่ได้ล็อกอิน')

  const trimmed = name.trim()
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: user.id, display_name: trimmed === '' ? null : trimmed, updated_at: new Date().toISOString() })
  if (error) throw error
}

// อายุจริง (ปี) — ใช้คำนวณ BMR/TDEE โดยประมาณ (สูตร Mifflin-St Jeor) ร่วมกับ height_cm/sex/น้ำหนักล่าสุด
// ดู lib/bmr.ts — ส่ง null เพื่อล้างค่า
export async function saveAge(
  supabase: ReturnType<typeof createClient>,
  age: number | null
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('ยังไม่ได้ล็อกอิน')

  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: user.id, age, updated_at: new Date().toISOString() })
  if (error) throw error
}

// เพศ — ใช้แยกเกณฑ์มาตรฐาน "สัดส่วนน้ำในร่างกาย (%)" ที่ต่างกันระหว่างชาย/หญิง (ดูหน้า Health)
// และเป็นหนึ่งในตัวแปรของสูตร BMR Mifflin-St Jeor (ดู lib/bmr.ts) — ส่ง null เพื่อล้างค่า
export async function saveSex(
  supabase: ReturnType<typeof createClient>,
  sex: 'male' | 'female' | null
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('ยังไม่ได้ล็อกอิน')

  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: user.id, sex, updated_at: new Date().toISOString() })
  if (error) throw error
}

// ส่วนสูง (ซม.) — เดิมกรอกได้เฉพาะที่หน้า Health (ผูกกับฟอร์มบันทึกวัดผล) ย้ายมาให้กรอกที่การ์ด
// "ข้อมูลส่วนตัว" หน้าโปรไฟล์ได้ด้วย เพื่อให้ตั้งค่าที่ใช้คำนวณ BMR/TDEE (เพศ/อายุ/ส่วนสูง) ครบในที่เดียว
// ส่ง null เพื่อล้างค่า
export async function saveHeightCm(
  supabase: ReturnType<typeof createClient>,
  heightCm: number | null
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('ยังไม่ได้ล็อกอิน')

  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: user.id, height_cm: heightCm, updated_at: new Date().toISOString() })
  if (error) throw error
}

// ชีพจรสูงสุดโดยประมาณ (bpm) — ใช้คำนวณ Heart Rate Zone ใน Weekly Cardio Volume (ดู lib/heartRate.ts)
// ส่ง null เพื่อล้างค่า (กลับไปใช้ค่าประมาณมาตรฐานแทน)
export async function saveMaxHeartRate(
  supabase: ReturnType<typeof createClient>,
  maxHeartRate: number | null
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('ยังไม่ได้ล็อกอิน')

  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: user.id, max_heart_rate: maxHeartRate, updated_at: new Date().toISOString() })
  if (error) throw error
}

// ชีพจรขณะพัก (bpm) — ใช้คู่กับ max_heart_rate ประมาณ VO2Max โดยประมาณ (ดู lib/vo2max.ts)
// ส่ง null เพื่อล้างค่า
export async function saveRestingHeartRate(
  supabase: ReturnType<typeof createClient>,
  restingHeartRate: number | null
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('ยังไม่ได้ล็อกอิน')

  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: user.id, resting_heart_rate: restingHeartRate, updated_at: new Date().toISOString() })
  if (error) throw error
}
