import type { Workout } from './types'
import { computeCurrentStreak, computeLongestStreak } from './dashboardStats'
import { workoutVolumeKg } from './workoutDisplay'

// แยกออกมาจากหน้า /achievements เดิม (เคยเป็น local function ในไฟล์นั้นล้วนๆ) ให้ ProfileView ใช้
// เกณฑ์ปลดล็อกเหรียญชุดเดียวกันเป๊ะสำหรับการ์ด "ความสำเร็จล่าสุด" แทนที่จะกำหนดเกณฑ์ซ้ำแยกกัน 2 ที่
// จนอาจเพี้ยนไม่ตรงกันในอนาคต (เช่น ปรับ target ที่ /achievements แต่ลืมปรับที่โปรไฟล์)
export interface AchievementStats {
  totalLogs: number
  totalDays: number
  totalVolume: number
  longestStreak: number
  currentStreak: number
}

export function computeAchievementStats(workouts: Workout[], workoutWeekdays: Set<number>): AchievementStats {
  const totalLogs = workouts.length
  const days = Array.from(new Set(workouts.map((w) => w.performed_at))).sort()
  const totalDays = days.length
  const totalVolume = workouts.reduce((sum, w) => (w.type === 'strength' ? sum + workoutVolumeKg(w) : sum), 0)

  const longestStreak = computeLongestStreak(days, workoutWeekdays)
  const currentStreak = computeCurrentStreak(days, workoutWeekdays)

  return { totalLogs, totalDays, totalVolume, longestStreak, currentStreak }
}

export interface Badge {
  key: string
  icon: string
  title: string
  desc: string
  current: number
  target: number
  isWeight?: boolean
}

export function buildBadges(stats: AchievementStats): Badge[] {
  return [
    { key: 'first', icon: '🥇', title: 'ก้าวแรก', desc: 'บันทึกออกกำลังกายครั้งแรก', current: stats.totalLogs, target: 1 },
    { key: 'logs_50', icon: '💪', title: 'มือใหม่ตั้งใจ', desc: 'บันทึกครบ 50 ครั้ง', current: stats.totalLogs, target: 50 },
    { key: 'logs_100', icon: '🏋️', title: 'สายเหล็ก', desc: 'บันทึกครบ 100 ครั้ง', current: stats.totalLogs, target: 100 },
    { key: 'logs_500', icon: '🔱', title: 'ตัวจริง', desc: 'บันทึกครบ 500 ครั้ง', current: stats.totalLogs, target: 500 },
    { key: 'volume_1000', icon: '🏆', title: 'ตันแรก', desc: 'ยกรวมสะสม 1,000 กก.', current: stats.totalVolume, target: 1000, isWeight: true },
    { key: 'volume_10000', icon: '⚡', title: 'หมื่นกิโล', desc: 'ยกรวมสะสม 10,000 กก.', current: stats.totalVolume, target: 10000, isWeight: true },
    { key: 'volume_100000', icon: '🌋', title: 'แสนกิโล', desc: 'ยกรวมสะสม 100,000 กก.', current: stats.totalVolume, target: 100000, isWeight: true },
    { key: 'streak_7', icon: '🔥', title: '7 วันติด', desc: 'ออกกำลังกายต่อเนื่อง 7 วัน', current: stats.longestStreak, target: 7 },
    { key: 'streak_30', icon: '🌟', title: '30 วันติด', desc: 'ออกกำลังกายต่อเนื่อง 30 วัน', current: stats.longestStreak, target: 30 },
    { key: 'days_50', icon: '📅', title: '50 วันฝึก', desc: 'ออกกำลังกายรวม 50 วัน', current: stats.totalDays, target: 50 },
    { key: 'days_200', icon: '🗓️', title: '200 วันฝึก', desc: 'ออกกำลังกายรวม 200 วัน', current: stats.totalDays, target: 200 },
  ]
}
