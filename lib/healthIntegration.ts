// FITLOG ยังไม่ได้เชื่อมต่อ Apple Health, Google Fit, หรือ health-data source ใดๆ เลยในตอนนี้
// ไฟล์นี้เป็น "โครงล่วงหน้า" (scaffold) สำหรับ kcal/ก้าว/นอนหลับ — เตรียม type + hook ไว้ก่อน
// เวลาจะต่อของจริงในอนาคต แค่แก้ implementation ของ useHealthSnapshot() ที่เดียว (เช่น ดึงจาก
// HealthKit/Google Fit API หรือตารางใหม่ใน Supabase) ไม่ต้องแก้ UI (TodayHealthStatsRow) เลย
// เพราะ component นั้น render ตาม HealthSnapshot ที่ hook นี้คืนกลับมาอยู่แล้ว

export interface HealthMetric {
  // ค่าปัจจุบัน — null แปลว่ายังไม่มีข้อมูล (ไม่ใช่ 0 จริงๆ)
  value: number | null
  // เป้าหมายรายวัน — null แปลว่ายังไม่ได้ตั้ง/ไม่มีเป้าหมาย
  goal: number | null
  unit: string
}

export interface HealthSnapshot {
  // false = ยังไม่ได้เชื่อมต่อ health app ใดๆ (สถานะปัจจุบันของ FITLOG เสมอ ณ ตอนนี้)
  connected: boolean
  calories: HealthMetric
  steps: HealthMetric
  sleepHours: HealthMetric
  // ป้ายคุณภาพการนอน เช่น "คุณภาพดี" — มาจาก health app โดยตรง ไม่ใช่สิ่งที่ FITLOG คำนวณเอง
  sleepQualityLabel: string | null
}

const NOT_CONNECTED: HealthSnapshot = {
  connected: false,
  calories: { value: null, goal: null, unit: 'kcal' },
  steps: { value: null, goal: null, unit: 'ก้าว' },
  sleepHours: { value: null, goal: null, unit: 'ชม.' },
  sleepQualityLabel: null,
}

/**
 * คืนสถานะ health data ปัจจุบันของผู้ใช้ ตอนนี้คืน "ยังไม่เชื่อมต่อ" เสมอ เพราะ FITLOG ยังไม่มี
 * การเชื่อมต่อจริง — เป็น hook (ไม่ใช่แค่ const) ไว้ล่วงหน้า เพราะของจริงในอนาคตน่าจะต้องใช้
 * useQuery/useState ภายใน (ดึงจาก API หรือฟัง native bridge) ซึ่งต้องเป็น hook อยู่แล้ว
 */
export function useHealthSnapshot(): HealthSnapshot {
  return NOT_CONNECTED
}
