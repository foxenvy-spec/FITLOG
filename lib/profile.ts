import type { createClient } from './supabase/client'

// ขอบเขตค่าที่เป็นไปได้จริงของมนุษย์ — export ออกมาเป็น write boundary เดียวที่ saveHeightCm/saveAge ด้านล่าง
// เช็คเอง (แทนที่แต่ละหน้าที่เขียน profiles.height_cm/age จะคิดเกณฑ์ของตัวเองแยกกัน) บั๊ก (ไล่ตรวจทั้ง
// โปรเจครอบใหม่ — Final Invariant Check C) "เดิม /profile กับฟอร์มกรอกมือที่ /health มี bounds check ของ
// ตัวเองแยกกัน (เพิ่งเพิ่มไปคนละจุด) แต่ path OCR อ่านรูปเครื่องชั่ง (handleExtracted ใน health/page.tsx)
// เรียก onHeightExtracted ตรงๆ โดยไม่ผ่าน bounds check เลยสักจุด — ถ้า OCR อ่านตัวเลขผิดจะบันทึกค่าที่เป็น
// ไปไม่ได้ลง DB ตรงๆ" — ย้าย validation มาไว้ที่นี่ (write boundary จริง) กันบั๊กคลาสนี้ย้อนกลับมาอีกจากทางเข้า
// ใหม่ในอนาคตที่อาจลืมเช็คเอง
export const HEIGHT_CM_RANGE = { min: 50, max: 250 } as const
export const AGE_RANGE = { min: 1, max: 120 } as const

export function isValidHeightCm(n: number): boolean {
  return Number.isFinite(n) && n >= HEIGHT_CM_RANGE.min && n <= HEIGHT_CM_RANGE.max
}

export function isValidAge(n: number): boolean {
  return Number.isFinite(n) && n >= AGE_RANGE.min && n <= AGE_RANGE.max
}

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
  if (age !== null && !isValidAge(age)) {
    throw new Error(`อายุต้องอยู่ระหว่าง ${AGE_RANGE.min}-${AGE_RANGE.max} ปี`)
  }
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
  if (heightCm !== null && !isValidHeightCm(heightCm)) {
    throw new Error(`ส่วนสูงต้องอยู่ระหว่าง ${HEIGHT_CM_RANGE.min}-${HEIGHT_CM_RANGE.max} ซม.`)
  }
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
