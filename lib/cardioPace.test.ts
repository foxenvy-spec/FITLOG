import { describe, it, expect } from 'vitest'
import { computePaceSpeed, formatPace } from './cardioPace'

describe('computePaceSpeed', () => {
  it('คำนวณ pace และ speed จากระยะทาง/เวลาปกติ', () => {
    const result = computePaceSpeed(4.57, 45.45)
    expect(result).not.toBeNull()
    expect(result!.paceMinPerKm).toBeCloseTo(9.945, 2)
    expect(result!.speedKmh).toBeCloseTo(6.033, 2)
  })

  it('คืนค่า null ถ้าไม่มีระยะทาง', () => {
    expect(computePaceSpeed(null, 30)).toBeNull()
    expect(computePaceSpeed(0, 30)).toBeNull()
  })

  it('คืนค่า null ถ้าไม่มีเวลา', () => {
    expect(computePaceSpeed(5, null)).toBeNull()
    expect(computePaceSpeed(5, 0)).toBeNull()
  })
})

describe('formatPace', () => {
  it('แปลงนาทีทศนิยมเป็น m:ss', () => {
    expect(formatPace(9.945)).toBe('9:57')
    expect(formatPace(5)).toBe('5:00')
    expect(formatPace(4.5)).toBe('4:30')
  })

  it('ปัดวินาทีให้ไม่เกิน 59 (ปัดขึ้นไปเป็นนาทีถัดไปถ้าจำเป็น)', () => {
    expect(formatPace(9.999)).toBe('10:00')
  })
})
