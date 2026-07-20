// ==================================================================
// Pace / Speed — คำนวณจากระยะทาง (กม.) และเวลา (นาที) ที่ผู้ใช้กรอกในฟอร์มบันทึกคาร์ดิโอ
// เป็นค่า derived เสมอ ไม่มีคอลัมน์เก็บแยกใน DB — คำนวณสดตอนแสดงผล/ตอนบันทึกก็คำนวณใหม่ได้เรื่อยๆ
// ==================================================================

export interface PaceSpeed {
  paceMinPerKm: number // นาทีต่อกิโลเมตร (เช่น 9.933 = 9:56/km)
  speedKmh: number // กิโลเมตรต่อชั่วโมง
}

// คืนค่า null ถ้าข้อมูลไม่พอคำนวณ (ระยะทางหรือเวลาว่าง/เป็น 0) — กันหารด้วยศูนย์และเลข Infinity
export function computePaceSpeed(distanceKm: number | null, durationMin: number | null): PaceSpeed | null {
  if (!distanceKm || !durationMin || distanceKm <= 0 || durationMin <= 0) return null
  return {
    paceMinPerKm: durationMin / distanceKm,
    speedKmh: distanceKm / (durationMin / 60),
  }
}

// แปลง 9.933 (นาที) -> "9:56" (นาที:วินาที) สำหรับโชว์ผล Pace แบบอ่านง่าย
export function formatPace(paceMinPerKm: number): string {
  const totalSeconds = Math.round(paceMinPerKm * 60)
  const min = Math.floor(totalSeconds / 60)
  const sec = totalSeconds % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}
