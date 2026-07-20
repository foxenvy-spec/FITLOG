// ==================================================================
// Heart Rate Zones — ใช้โมเดลมาตรฐาน 5 โซนตาม % ของชีพจรสูงสุด (%MaxHR)
// ข้อจำกัด: เรามีแค่ "ชีพจรเฉลี่ยต่อเซสชัน" (avg_heart_rate) ไม่ใช่ข้อมูลชีพจรต่อเนื่อง
// ระหว่างออกกำลังกาย ดังนั้นการคำนวณนี้เป็นการ "จัดทั้งเซสชันเข้าโซนเดียว" ตามค่าเฉลี่ย
// ซึ่งเป็นค่าประมาณ ไม่ใช่เวลาที่อยู่ในแต่ละโซนจริง — ควรระบุไว้ให้ผู้ใช้เห็นในหน้า UI เสมอ
// ==================================================================

export const DEFAULT_MAX_HEART_RATE = 190 // ใช้เมื่อผู้ใช้ยังไม่ได้ตั้งค่าชีพจรสูงสุดของตัวเอง

export interface HRZoneDef {
  key: string
  label: string
  minPct: number // รวมค่าเริ่มต้น (>=)
  maxPct: number // ไม่รวมค่าสูงสุด (<), ยกเว้นโซนสุดท้าย
  color: string
}

export const HR_ZONES: HRZoneDef[] = [
  { key: 'z1', label: 'Zone 1 · ฟื้นตัว', minPct: 0, maxPct: 60, color: '#8FA0AD' },
  { key: 'z2', label: 'Zone 2 · เผาผลาญไขมัน', minPct: 60, maxPct: 70, color: '#7A9B57' },
  { key: 'z3', label: 'Zone 3 · แอโรบิก', minPct: 70, maxPct: 80, color: '#E8A33D' },
  { key: 'z4', label: 'Zone 4 · เทรชโฮลด์', minPct: 80, maxPct: 90, color: '#C1503A' },
  { key: 'z5', label: 'Zone 5 · สูงสุด', minPct: 90, maxPct: Infinity, color: '#8B2E2E' },
]

// หาโซนของชีพจรเฉลี่ยหนึ่งค่า เทียบกับชีพจรสูงสุด — คืน key ของโซน (เช่น 'z2')
export function classifyHRZone(avgHeartRate: number, maxHeartRate: number = DEFAULT_MAX_HEART_RATE): string {
  const pct = (avgHeartRate / maxHeartRate) * 100
  const zone = HR_ZONES.find((z) => pct >= z.minPct && pct < z.maxPct)
  return (zone ?? HR_ZONES[HR_ZONES.length - 1]).key
}

export interface HRZoneMinutes {
  // นาทีรวมต่อโซน ในสัปดาห์นี้ (key ของ HR_ZONES -> นาที)
  minutesByZone: Record<string, number>
  // จำนวนเซสชันคาร์ดิโอที่ "มี" ข้อมูลชีพจรเฉลี่ย เทียบกับทั้งหมด — ใช้โชว์ข้อความเตือนถ้าข้อมูลไม่ครบ
  sessionsWithHR: number
  totalCardioSessions: number
}

// รวมเวลาในแต่ละ HR zone จากรายการ cardio session ของสัปดาห์นี้ — เซสชันที่ไม่มี avg_heart_rate
// หรือ duration_min จะถูกข้ามไป (นับรวมเฉพาะใน totalCardioSessions เพื่อโชว์ว่าข้อมูลยังไม่ครบ)
export function computeWeeklyHRZoneMinutes(
  cardioSessions: { avg_heart_rate: number | null; duration_min: number | null }[],
  maxHeartRate: number = DEFAULT_MAX_HEART_RATE
): HRZoneMinutes {
  const minutesByZone: Record<string, number> = {}
  HR_ZONES.forEach((z) => (minutesByZone[z.key] = 0))

  let sessionsWithHR = 0
  cardioSessions.forEach((s) => {
    if (s.avg_heart_rate === null || s.avg_heart_rate === undefined || !s.duration_min) return
    sessionsWithHR++
    const zoneKey = classifyHRZone(s.avg_heart_rate, maxHeartRate)
    minutesByZone[zoneKey] += s.duration_min
  })

  return { minutesByZone, sessionsWithHR, totalCardioSessions: cardioSessions.length }
}
