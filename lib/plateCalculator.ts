import type { WeightUnit } from './weightUnit'

export interface PlateBreakdown {
  // แผ่นที่ต้องใส่ "ต่อข้าง" ของบาร์ เรียงจากแผ่นใหญ่สุดไปเล็กสุด
  perSide: { plate: number; count: number }[]
  barWeight: number
  // น้ำหนักรวมจริงที่ประกอบได้จากแผ่นชุดนี้ (บาร์ + แผ่นทั้งสองข้าง) — อาจไม่เท่า targetWeight เป๊ะ
  // ถ้า targetWeight หารด้วย 2 (ต่อข้าง) แล้วลงตัวไม่พอดีกับชุดแผ่นที่มี (ดู leftoverPerSide)
  achievedWeight: number
  // ส่วนต่อข้างที่แบ่งเป็นแผ่นในชุดนี้ไม่ได้ (ปกติควรเป็น 0 เสมอถ้ากรอกน้ำหนักตาม step ปกติของแอป)
  leftoverPerSide: number
}

// ชุดแผ่นน้ำหนักมาตรฐานที่โรงยิมทั่วไปมี (Olympic plates) — kg และ lb มีขนาดคนละชุดกันจริงๆ ไม่ใช่แค่แปลงหน่วย
const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25]
const PLATES_LB = [45, 35, 25, 10, 5, 2.5]

// น้ำหนักบาร์เปล่ามาตรฐาน — Olympic barbell 20kg / 45lb (ค่าคงที่ทั่วไปที่สุด ไม่ได้ให้ผู้ใช้ปรับเอง
// เพราะแอปไม่มีข้อมูลบาร์เฉพาะทาง เช่น EZ-bar/trap bar ต่อท่า)
const BAR_WEIGHT: Record<WeightUnit, number> = { kg: 20, lb: 45 }

// คำนวณแผ่นน้ำหนักที่ต้องใส่ต่อข้างของบาร์เบล จากน้ำหนักรวมเป้าหมาย — ใช้วิธี greedy (ไล่จากแผ่นใหญ่สุด
// ไปเล็กสุดตามชุดแผ่นมาตรฐานของหน่วยนั้นๆ) targetWeight ต้องเป็นหน่วยเดียวกับ unit ที่ส่งมา (หน้าจอเป็น
// คนแปลง kg<->lb ก่อนเรียกฟังก์ชันนี้เอง เหมือน dropSetWeightKg)
export function calculatePlates(targetWeight: number, unit: WeightUnit): PlateBreakdown {
  const barWeight = BAR_WEIGHT[unit]
  const plates = unit === 'lb' ? PLATES_LB : PLATES_KG
  const perSideTarget = Math.max(0, (targetWeight - barWeight) / 2)
  const EPSILON = 0.01

  let remaining = perSideTarget
  const perSide: { plate: number; count: number }[] = []
  for (const plate of plates) {
    if (remaining + EPSILON < plate) continue
    const count = Math.floor((remaining + EPSILON) / plate)
    if (count > 0) {
      perSide.push({ plate, count })
      remaining -= count * plate
    }
  }

  const leftoverPerSide = Math.max(0, Math.round(remaining * 100) / 100)
  const achievedWeight = Math.round((barWeight + (perSideTarget - leftoverPerSide) * 2) * 100) / 100

  return { perSide, barWeight, achievedWeight, leftoverPerSide }
}
