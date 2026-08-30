'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Workout } from '@/lib/types'
import { computeCurrentStreak, computeLongestStreak } from '@/lib/dashboardStats'
import { workoutVolumeKg } from '@/lib/workoutDisplay'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'
import PremiumCard from '@/components/ui/PremiumCard'
import AnimatedBarFill from '@/components/AnimatedBarFill'
import { COLORS, withAlpha } from '@/lib/theme'
import { useCountUp } from '@/lib/useCountUp'

interface Stats {
  totalLogs: number
  totalDays: number
  totalVolume: number
  longestStreak: number
  currentStreak: number
}

// บั๊ก (เจอตอนไล่เช็คทั้งโปรเจค): ไฟล์นี้เคยคำนวณ volume/streak แยกสูตรของตัวเองจากทุกหน้าอื่นในแอป
// 1) totalVolume ใช้ sets*reps*weight_kg ตรงๆ แทน total_volume_kg (ผลรวมจริงต่อเซ็ต) ทำให้ pyramid/drop
//    set (น้ำหนัก/reps ไม่เท่ากันทุกเซ็ต) ได้ยอดรวมผิดเทียบกับ Stats/Dashboard — เปลี่ยนมาใช้ workoutVolumeKg
//    (lib/workoutDisplay.ts) ตัวเดียวกับทุกหน้าอื่น
// 2) streak (ทั้ง current/longest) เดินนับ "ทุกวันปฏิทินต้องมี workout ติดกัน" ล้วนๆ ไม่รู้จักวันพักตามโปรแกรม
//    เลย ทำให้ผู้ใช้ที่มีโปรแกรม (เช่น จ/พ/ศ) เห็นเลข streak ที่นี่ต่ำกว่า Dashboard มาก (ขาดทุกวันที่ไม่ตรง
//    ตาราง ทั้งที่เป็นวันพักตามแผน ไม่ใช่วันที่ "พลาด") — เปลี่ยนมาใช้ computeCurrentStreak/
//    computeLongestStreak (lib/dashboardStats.ts) ตัวเดียวกับ DashboardView.tsx ส่ง workoutWeekdays เข้าไป
function computeStats(workouts: Workout[], workoutWeekdays: Set<number>): Stats {
  const totalLogs = workouts.length
  const days = Array.from(new Set(workouts.map((w) => w.performed_at))).sort()
  const totalDays = days.length
  const totalVolume = workouts.reduce((sum, w) => (w.type === 'strength' ? sum + workoutVolumeKg(w) : sum), 0)

  const longestStreak = computeLongestStreak(days, workoutWeekdays)
  const currentStreak = computeCurrentStreak(days, workoutWeekdays)

  return { totalLogs, totalDays, totalVolume, longestStreak, currentStreak }
}

interface Badge {
  key: string
  icon: string
  title: string
  desc: string
  current: number
  target: number
  isWeight?: boolean
}

function buildBadges(stats: Stats): Badge[] {
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

export default function AchievementsPage() {
  const supabase = createClient()
  const { unit, toDisplay } = useWeightUnit()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [workoutWeekdays, setWorkoutWeekdays] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [{ data, error: err }, { data: dayRows }] = await Promise.all([
      supabase.from('workouts').select('*').order('performed_at'),
      // วันที่ตั้งโปรแกรมไว้จริง — ให้ streak เดียวกับ Dashboard (ดู comment ที่ computeStats ด้านบน)
      supabase.from('program_days').select('day_of_week'),
    ])
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setWorkouts((data as Workout[]) ?? [])
    setWorkoutWeekdays(new Set(((dayRows as { day_of_week: number }[]) ?? []).map((d) => d.day_of_week)))
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const stats = useMemo(() => computeStats(workouts, workoutWeekdays), [workouts, workoutWeekdays])
  const badges = useMemo(() => buildBadges(stats), [stats])
  const unlockedCount = badges.filter((b) => b.current >= b.target).length

  if (loading) return <LoadingState />
  if (error) return <ErrorState title="โหลดข้อมูลความสำเร็จไม่สำเร็จ" message={error} onRetry={load} />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl tracked uppercase">ความสำเร็จ</h1>
        <p className="text-sm text-muted mt-1">
          ปลดล็อกแล้ว {unlockedCount}/{badges.length}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <StatBox label="ต่อเนื่องตอนนี้" value={stats.currentStreak} unit="วัน" />
        <StatBox label="สถิติต่อเนื่อง" value={stats.longestStreak} unit="วัน" />
        <StatBox label="วันฝึกรวม" value={stats.totalDays} unit="วัน" />
      </div>

      {/* v52: ฟีดแบ็ก "หน้าอื่นควรอิงภาษาเดียวกับ Dashboard" — เดิม badge แต่ละใบเป็น div เขียนเอง
          (rounded-lg 8px + bg/border ตรงๆ) ไม่ได้ใช้ PremiumCard เลยทั้งที่เป็นเนื้อหาหลักของหน้า —
          เปลี่ยนเป็น PremiumCard (rounded-card 24px + material เดียวกับทั้งแอป) ส่วนสถานะ unlocked/locked
          ยังคงไว้ผ่าน className (dimmed) + style border override (สีอำพันตอน unlocked ชนะ default ของ
          PremiumCard ได้เพราะ ...style วางท้ายสุดเสมอ) — progress bar เปลี่ยนจาก div width คงที่เป็น
          AnimatedBarFill ให้เติมพร้อม micro-interaction เดียวกับที่อื่นในแอป */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {badges.map((b) => {
          const unlocked = b.current >= b.target
          const pct = Math.min(100, Math.round((b.current / b.target) * 100))
          return (
            <PremiumCard
              key={b.key}
              className={`px-3 py-4 text-center space-y-1.5 ${unlocked ? '' : 'opacity-60'}`}
              style={unlocked ? { border: `1px solid ${withAlpha(COLORS.amber, '40')}` } : undefined}
            >
              <div className={`text-3xl ${unlocked ? '' : 'grayscale opacity-50'}`}>{b.icon}</div>
              <p className={`text-xs font-display tracked uppercase ${unlocked ? 'text-ink' : 'text-muted'}`}>{b.title}</p>
              <p className="text-[10px] text-muted">{b.desc}</p>
              {!unlocked && (
                <div className="pt-1">
                  <div className="h-1 rounded-full bg-line overflow-hidden">
                    <AnimatedBarFill pct={pct} color={COLORS.steel} />
                  </div>
                  <p className="text-[9px] text-muted mt-1 font-mono">
                    {b.isWeight
                      ? `${Math.floor(toDisplay(b.current)).toLocaleString()}/${Math.round(toDisplay(b.target)).toLocaleString()} ${unit}`
                      : `${Math.floor(b.current)}/${b.target}`}
                  </p>
                </div>
              )}
            </PremiumCard>
          )
        })}
      </div>
    </div>
  )
}

// v52: ฟีดแบ็ก "ทำ Micro-interactions (count-up, ...)" — เดิมตัวเลขโผล่มานิ่งๆ ทันที ใช้ useCountUp
// เดียวกับที่ GoalRing/StatCard (หน้า Stats) ใช้อยู่แล้ว ให้ตัวเลขไต่ขึ้นตอนโหลดแทน
function StatBox({ label, value, unit }: { label: string; value: number; unit: string }) {
  const animatedValue = useCountUp(value)
  return (
    <PremiumCard className="px-2 py-3">
      <p className="text-lg font-display text-amber">
        {Math.round(animatedValue)} {unit}
      </p>
      <p className="text-[10px] text-muted tracked uppercase mt-0.5">{label}</p>
    </PremiumCard>
  )
}
