import { describe, expect, it, afterEach, vi } from 'vitest'
import { bangkokMonthGrid, bangkokYearMonth, shiftMonth, daysAgoStr, todayStr } from './weekdays'

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

// P1-07 — daysAgoStr() ไม่เคยมี test ตรงๆ มาก่อน ทั้งที่เป็น utility ที่ทั้งแอปพึ่งพา (streak cutoff ใน
// lib/dashboardStats.ts, และตอนนี้ 4 จุดใน health/page.tsx) — ยืนยันว่า anchor ที่ Asia/Bangkok จริง ไม่ใช่
// timezone ของเครื่อง/runner ที่รัน test (ตัวอย่างเช่น CI ที่มักรันเป็น UTC)
describe('daysAgoStr', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('anchors "today" to Bangkok time near a day boundary, not UTC/runner-local time', () => {
    // 2026-07-18T17:30:00Z = 2026-07-19T00:30:00+07:00 (Bangkok) — เป็น "19 กรกฎาคม" แล้วตามเวลากรุงเทพฯ
    // ทั้งที่ยังเป็น "18 กรกฎาคม" ตาม UTC — ถ้า daysAgoStr() ไม่ anchor ที่ Bangkok จริง N=0 จะได้ 18 แทน 19
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T17:30:00Z'))
    expect(daysAgoStr(0)).toBe('2026-07-19')
    expect(daysAgoStr(7)).toBe('2026-07-12')
  })

  it('N=0 matches todayStr() exactly', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T09:00:00Z'))
    expect(daysAgoStr(0)).toBe(todayStr())
  })

  it('30 and 90 day cutoffs shift by exactly that many Bangkok calendar days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T09:00:00Z')) // 2026-07-18T16:00+07:00 — ยังเป็นวันที่ 18 ที่ Bangkok
    expect(daysAgoStr(30)).toBe('2026-06-18')
    expect(daysAgoStr(90)).toBe('2026-04-19')
  })
})
