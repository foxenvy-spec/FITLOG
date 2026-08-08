import type { Goal } from './types'

// สูตรเดียวกับ goalProgressPct() ใน app/(app)/health/page.tsx (ไม่ import ตรงๆ เพราะไฟล์นั้นเป็น
// closure ผูกกับ state ของหน้า/component นั้นโดยเฉพาะ) — คำนวณ % ความคืบหน้าจาก starting_value ->
// target_value เทียบกับค่าปัจจุบัน ใช้ร่วมกันได้ทุกจุดที่มี currentValue + Goal อยู่แล้ว
export function goalProgressPct(goal: Pick<Goal, 'target_value' | 'starting_value'>, currentValue: number | null): number | null {
  if (currentValue === null || goal.target_value === null) return null
  const start = goal.starting_value ?? currentValue
  if (goal.target_value === start) return currentValue >= goal.target_value ? 100 : 0
  return Math.min(100, Math.max(0, ((currentValue - start) / (goal.target_value - start)) * 100))
}
