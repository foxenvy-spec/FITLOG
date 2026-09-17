import { describe, expect, it } from 'vitest'
import { bangkokMonthGrid, bangkokYearMonth, shiftMonth } from './weekdays'

// 6G-P1 #1 — ทดสอบ helper ใหม่ทั้ง 3 ตัวที่ calendar/page.tsx และ WorkoutHeatmap.tsx เรียกใช้แทน
// browser-local Date construction เดิม ทุก assertion เป็นค่า deterministic ที่รู้ล่วงหน้า (ไม่พึ่ง
// timezone ของเครื่องที่รัน test เลย — ทั้ง bangkokMonthGrid/shiftMonth ใช้ Date.UTC ตรงๆ และ
// bangkokYearMonth ใช้ bangkokParts ซึ่ง fix เป็น Asia/Bangkok ผ่าน Intl.DateTimeFormat ข้าง in อยู่แล้ว)

describe('bangkokMonthGrid', () => {
  it('เดือนปกติ 31 วัน (มกราคม 2024 — วันที่ 1 ตรงกับวันจันทร์)', () => {
    const { firstWeekday, days } = bangkokMonthGrid(2024, 0)
    expect(firstWeekday).toBe(1) // Monday
    expect(days).toHaveLength(31)
    expect(days[0]).toBe('2024-01-01')
    expect(days[days.length - 1]).toBe('2024-01-31')
  })

  it('เดือนปีอธิกสุรทิน (กุมภาพันธ์ 2024 — 29 วัน, วันที่ 1 ตรงกับวันพฤหัสบดี)', () => {
    const { firstWeekday, days } = bangkokMonthGrid(2024, 1)
    expect(firstWeekday).toBe(4) // Thursday
    expect(days).toHaveLength(29)
    expect(days[days.length - 1]).toBe('2024-02-29')
  })

  it('เดือนปีปกติ (กุมภาพันธ์ 2023 — 28 วัน)', () => {
    const { days } = bangkokMonthGrid(2023, 1)
    expect(days).toHaveLength(28)
    expect(days[days.length - 1]).toBe('2023-02-28')
  })

  it('เดือนธันวาคม (ปลายปี, ไม่ rollover ข้ามปีผิดพลาด)', () => {
    const { days } = bangkokMonthGrid(2024, 11)
    expect(days[0]).toBe('2024-12-01')
    expect(days[days.length - 1]).toBe('2024-12-31')
  })
})

describe('shiftMonth', () => {
  it('เลื่อนไปข้างหน้าภายในปีเดียวกัน', () => {
    expect(shiftMonth(2024, 5, 1)).toEqual({ year: 2024, month0: 6 })
  })

  it('เลื่อนถอยหลังข้ามปี (ม.ค. -> ธ.ค. ปีก่อนหน้า)', () => {
    expect(shiftMonth(2024, 0, -1)).toEqual({ year: 2023, month0: 11 })
  })

  it('เลื่อนไปข้างหน้าข้ามปี (ธ.ค. -> ม.ค. ปีถัดไป)', () => {
    expect(shiftMonth(2024, 11, 1)).toEqual({ year: 2025, month0: 0 })
  })

  it('delta 0 คืนค่าเดิม', () => {
    expect(shiftMonth(2024, 5, 0)).toEqual({ year: 2024, month0: 5 })
  })
})

describe('bangkokYearMonth', () => {
  it('ข้าม boundary เที่ยงคืนกรุงเทพฯ ไปเดือนถัดไป (UTC 17:00 = 00:00 กรุงเทพฯ)', () => {
    // 2024-02-29T17:00:00Z = 2024-03-01T00:00:00+07:00 (Bangkok)
    expect(bangkokYearMonth(new Date('2024-02-29T17:00:00Z'))).toEqual({ year: 2024, month0: 2 })
  })

  it('ก่อน boundary หนึ่งนาที ยังเป็นเดือนเดิมตามเวลากรุงเทพฯ', () => {
    // 2024-02-29T16:59:00Z = 2024-02-29T23:59:00+07:00 (Bangkok)
    expect(bangkokYearMonth(new Date('2024-02-29T16:59:00Z'))).toEqual({ year: 2024, month0: 1 })
  })

  it('กลางเดือนธรรมดา', () => {
    expect(bangkokYearMonth(new Date('2024-06-15T10:00:00Z'))).toEqual({ year: 2024, month0: 5 })
  })
})
