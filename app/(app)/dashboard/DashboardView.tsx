'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useDashboardSettings } from '@/components/DashboardSettingsProvider'
import Button from '@/components/ui/Button'
import type { ProgramDay, ProgramExercise, Workout, BodyMetric } from '@/lib/types'
import { todayDayOfWeek, todayStr, daysAgoStr } from '@/lib/weekdays'
import {
  computeCurrentStreakDates,
  computeLongestStreak,
  computeTodayTotals,
  computeRecoveryPct,
  recoveryStatusColor,
  recoveryTier,
  recoveryVerdictEmoji,
  FULLY_RECOVERED_PCT,
  findNextProgramDay,
  getWeekRange,
  getPreviousWeekRange,
  computeVolumeTrendInsights,
  computeImbalanceInsights,
  computeMissedMuscleInsights,
  suggestMuscleToTrain,
  computeTodaysRecommendation,
  computeDashboardNotifications,
  computeTrainingBalance,
  trainingBalanceInsight,
  recoveryRecommendationLabel,
  computeBestVolumeIncrease,
  computeGreetingContext,
  computeWorkoutMotivationLabel,
  getScheduledMuscleForDay,
  getNextScheduledMuscle,
  estimateCaloriesToday,
  computeLatestPR,
  computeSessionVolumeChange,
  daysSinceLastTrained,
  computePlannedConsistency,
  type Insight,
  type MuscleRecommendation,
  type TodaysRecommendation,
  type VolumeIncrease,
  type ScheduledDay,
  type LatestPR,
  type SessionVolumeChange,
} from '@/lib/dashboardStats'
import { fetchWeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
import { goalProgressPct, goalProgressLabel, estimateGoalEtaWeeks } from '@/lib/goalProgress'
import { saveDisplayName } from '@/lib/profile'
import { computePushPullBalance, computeAIDailySummary, bodyFatTrendInsight, muscleMassTrendInsight, workoutFrequencyInsight } from '@/lib/aiCoach'
import { computeBodyMetricsSummary, type BodyMetricsSummary } from '@/lib/bodyMetricsSummary'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { VOLUME_MUSCLES, RECOVERY_MUSCLES, MUSCLE_GROUPS, MUSCLE_GROUP_COLORS, dominantMuscleGroup, type MuscleGroup } from '@/lib/muscle-groups'
import { DEFAULT_DASHBOARD_PREFS, loadDashboardPrefs, saveDashboardPrefs, type DashboardPrefs } from '@/lib/dashboardPrefs'
import { isOnboardingBannerDismissed, dismissOnboardingBanner } from '@/lib/onboarding'
import GoalRing from '@/components/GoalRing'
import ShareWeeklySummaryButton from '@/components/ShareWeeklySummaryButton'
import WarmupGuideSheet from '@/components/WarmupGuideSheet'
import { getWarmupMoves } from '@/lib/warmupGuide'
import DashboardSkeleton from '@/components/DashboardSkeleton'
import InsightCarousel from '@/components/InsightCarousel'
import TodayMuscleChips from '@/components/TodayMuscleChips'
import { splitTitleDetail } from '@/components/TodaysFocusCard'
import OnboardingBanner from '@/components/OnboardingBanner'
import ErrorState from '@/components/ErrorState'
import Skeleton from '@/components/Skeleton'
import BodyMetricsRow from '@/components/BodyMetricsRow'
import NotificationButton from '@/components/dashboard/NotificationButton'
import AICoachCompactCard from '@/components/AICoachCompactCard'
import AnimatedBarFill from '@/components/AnimatedBarFill'
import { CARD_GRADIENT_CSS, withAlpha, COLORS, NEUTRAL } from '@/lib/theme'
import { computeFitnessScore } from '@/lib/fitnessScore'
import FitnessScoreDetailSheet from '@/components/dashboard/FitnessScoreDetailSheet'
import HeroGaugeConcept from '@/components/dashboard/HeroGaugeConcept'

// ฟีดแบ็ก (Information Hierarchy review, รอบที่ 3) — "Highlights ซ้ำกับ Training This Week (89%
// Consistency โผล่ทั้ง 2 การ์ด) ควรเป็น 'Weekly Insights' ที่วิเคราะห์ให้จริง (Streak + กลุ่มไหนเกิน/ขาด
// เป้า) ส่วนด้านล่าง Heatmap/Weekly Volume/Consistency/Cardio/HR Zone ยังยาวเกินไปสำหรับ Home ควรย้าย
// ไป /stats ให้หมด เหลือแค่ Weekly Insights เป็นจุดจบของหน้า" — ย้าย WeeklyMuscleHeatmap/WeeklyVolume/
// ConsistencyStrip ออกจากหน้านี้ไปที่ /stats (รายละเอียดเต็มยังอยู่ครบที่นั่น) แทนที่ HighlightsRow เดิม
// ด้วย WeeklyInsightsCard ใหม่ (รวม Streak + insight volume, มีลิงก์ "ดูการวิเคราะห์ทั้งหมด →" ไป /stats
// ในตัวอยู่แล้ว ไม่ต้องเพิ่มปุ่มแยกท้ายหน้าอีก) — WeeklyCardioVolume ตัดออกเฉยๆ ไม่ต้องย้ายไปเพิ่มที่ไหน
// เพราะมีหน้าของตัวเองอยู่แล้วที่ /cardio (app/(app)/cardio/page.tsx เรียก component เดียวกันนี้อยู่แล้ว)
//
// Below-the-fold widgets are code-split out of the initial dashboard bundle.
// Each fetches its own data independently, so there's no reason to block
// first paint of the hero card on their JS or their network round-trip.
const WeeklyInsightsCard = dynamic(() => import('@/components/dashboard/WeeklyInsightsCard'), {
  loading: () => <Skeleton className="h-40 w-full rounded-card" />,
})
const DashboardSettings = dynamic(() => import('@/components/DashboardSettings'), { ssr: false })

// จ-อา (เริ่มจันทร์) ใช้กับแถวติ๊กถูกในการ์ด Weekly Goal — ตรงกับลำดับของ data.weekDayTicks
// ที่คำนวณจาก getWeekRange() (สัปดาห์เริ่มวันจันทร์) ใน fetchDashboardData ด้านล่าง
export const WEEKDAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

// PR ที่จะขึ้นแจ้งเตือน (computeDashboardNotifications) ต้องทำไว้ไม่เกินกี่วัน — กัน PR เก่าเป็นเดือน
// ขึ้นราวกับเพิ่งเกิด (data.latestPR เป็น PR ล่าสุด "ทุกช่วงเวลา" ไม่ใช่แค่ล่าสุดที่ทำไปไม่นาน) — export
// ให้ MobileDashboardView.tsx ใช้ค่าเดียวกัน
export const FITLOG_PR_RECENT_DAYS = 7

export function greeting() {
  const h = new Date().getHours()
  if (h < 11) return 'สวัสดีตอนเช้า'
  if (h < 17) return 'สวัสดีตอนบ่าย'
  return 'สวัสดีตอนเย็น'
}

// Fallback เมื่อผู้ใช้ยังไม่ได้ตั้ง display_name เอง — ตัดจาก email เหมือนพฤติกรรมเดิม
export function emailDisplayName(email: string | undefined | null) {
  if (!email) return 'นักยก'
  const prefix = email.split('@')[0]
  return prefix.charAt(0).toUpperCase() + prefix.slice(1)
}

export interface DashboardData {
  email: string | null
  profileDisplayName: string | null
  todayWorkouts: Workout[]
  streak: number
  // สายโซ่ต่อเนื่องยาวที่สุดในประวัติ (ไม่ใช่แค่สายที่ต่อถึงวันนี้แบบ `streak`) — ใช้ใน
  // WorkoutStreakDetailSheet เท่านั้น ไม่โชว์บนการ์ดหลักของ Dashboard (ฟีดแบ็ก "ไม่ต้องเอา Best
  // มาไว้ Dashboard")
  bestStreak: number
  programDays: ProgramDay[]
  todayExercises: ProgramExercise[]
  completedCount: number
  // จำนวนท่า ad-hoc ("เพิ่มท่า" ระหว่างเซสชัน) ที่กดจบแล้ววันนี้ — แยกจาก completedCount ตั้งใจ (ดู
  // comment เต็มที่จุดคำนวณใน fetchDashboardData) การ์ด Hero เอาไปบวกกับ completedCount เองตอนแสดงผล
  adhocCompletedCount: number
  completedExerciseIds: string[]
  recoveryDates: Record<string, string | null>
  insights: Insight[]
  aiDailySummary: string
  // เทรนด์น้ำหนัก/ไขมัน/กล้ามเนื้อล่าสุด (เทียบเอนทรีก่อนหน้า) — ใช้ให้การ์ด AI Coach
  // วิเคราะห์สัดส่วนร่างกายเพิ่มจากเดิมที่มีแค่ recovery/push-pull balance
  bodyMetricsSummary: BodyMetricsSummary
  // เฉลี่ย % ของเป้าหมายเซ็ต/สัปดาห์ ข้ามทุกกล้ามเนื้อใน VOLUME_MUSCLES (เพดานที่ 100%
  // ต่อกลุ่ม ก่อนเฉลี่ย) ใช้ตัวเลขเดียวสรุปภาพรวมสำหรับ hero card — รายละเอียดรายกล้ามเนื้อ
  // ยังดูได้เต็ม ๆ ที่ WeeklyVolume ด้านล่าง
  weeklyGoalPct: number
  // ใช้ประกอบ dynamic greeting ด้านบนสุด — กล้ามเนื้อที่ฟื้นตัวมากที่สุด (สำหรับ "X ฟื้นตัวเต็มที่แล้ว")
  // และกลุ่มที่วอลุ่มเพิ่มขึ้นเด่นที่สุดสัปดาห์นี้ (สำหรับ "วอลุ่มเพิ่มขึ้น X%")
  muscleRecommendation: MuscleRecommendation | null
  // muscleRecommendation ต่อยอดด้วยเซ็ตที่เหลือถึงเป้าหมายรายสัปดาห์ของกลุ่มนั้น (จาก Weekly Volume
  // Engine) — ใช้ในป้ายแนะนำของการ์ด Recovery ให้ตอบทั้ง "พร้อมฝึกไหม" และ "เหลืออีกเท่าไหร่" พร้อมกัน
  todaysRecommendation: TodaysRecommendation | null
  // เป้าหมายน้ำหนัก/Body Fat ที่ตั้งไว้ (ดิบเป็น kg เสมอ) — ใช้คำนวณ "เหลือเท่าไหร่ถึงเป้าหมาย" สำหรับ
  // การแจ้งเตือนหมวด Goal (computeDashboardNotifications) null = ยังไม่ได้ตั้งเป้าหมายประเภทนั้น
  weightGoalTarget: number | null
  bodyFatGoalTarget: number | null
  // ค่าตั้งต้นตอนสร้างเป้าหมาย — คู่กับ target ด้านบน ใช้ผ่าน goalProgressPct (lib/goalProgress.ts,
  // ตัวเดียวกับหน้า Health) เพื่อรู้ทิศทางเป้าหมาย (ลด/เพิ่ม) แล้วเช็คว่าถึง/เกินเป้าหมายแล้วหรือยัง —
  // ไม่งั้นการแจ้งเตือน Goal จะโชว์ "เหลือ X kg" ค้างตลอดแม้ผู้ใช้ทำถึงเป้าหมายไปแล้ว (Math.abs เฉยๆ ไม่รู้ทิศทาง)
  weightGoalStart: number | null
  bodyFatGoalStart: number | null
  // ฟีดแบ็ก "Body Goal โชว์ 0% ทั้งที่ลดมาใกล้เป้าหมายมากแล้ว" — ค่าเก่าที่สุดที่มีบันทึกจริงใน body_metrics
  // (ไม่ใช่แค่ตอนตั้งเป้า) ส่งเข้า goalProgressPct เป็น earliestTrackedValue แทน *GoalStart ด้านบนตรงๆ
  // (ตัวเดียวกับที่ /health page ใช้อยู่แล้ว — ดู goalEarliestTrackedValue ในไฟล์นั้น)
  earliestTrackedWeight: number | null
  earliestTrackedBodyFat: number | null
  // ฟีดแบ็ก "Body Goal ควรบอกคาดว่าจะถึงเป้าหมายเมื่อไหร่" — จำนวนสัปดาห์โดยประมาณ (estimateGoalEtaWeeks
  // ใน lib/goalProgress.ts) null = ข้อมูลไม่พอ/แนวโน้มสวนทาง/ไม่มีเป้าหมายตั้งไว้ (ไม่โชว์อะไรเพิ่ม)
  weightEtaWeeks: number | null
  bodyFatEtaWeeks: number | null
  // สถิติใหม่ล่าสุด (ทุกช่วงเวลา ไม่ใช่แค่วันนี้) — กลับมาใช้อีกครั้งหลัง Priority 14 เอาออกไปตอนย้าย
  // การ์ดนี้เข้ากระดิ่งแจ้งเตือน (ตอนนั้นการ์ดเดิมไม่มี href เลยไม่เข้าเกณฑ์ actionable ของระบบใหม่ —
  // ผู้เรียก (DashboardView.tsx) กรองความเก่าก่อนส่งเข้า computeDashboardNotifications)
  latestPR: LatestPR | null
  // ฟีดแบ็ก "State C (เทรนเสร็จแล้ว) ควรโชว์ Volume เทียบกับครั้งก่อน" — null เมื่อยังเทียบไม่ได้
  // (ยังไม่ได้เทรนกลุ่มนี้วันนี้/ไม่มีเซสชันก่อนหน้าให้เทียบ) ดู computeSessionVolumeChange
  sessionVolumeChange: SessionVolumeChange | null
  // true เมื่อ muscleRecommendation ข้างบนคือกล้ามเนื้อของ "วันนี้" จริงๆ (ยังทำไม่ครบ/ยังไม่ได้เริ่ม) —
  // false เมื่อเป็นคำแนะนำของเซสชัน "ถัดไป" (วันนี้ทำครบแล้ว/เป็นวันพัก) ใช้ตัดสินป้าย "AI Coach · Today"
  // vs "· Next" ให้ตรงกับความเป็นจริง (ดู comment เต็มที่จุดคำนวณ scheduledMuscle ด้านล่าง)
  isRecommendationForToday: boolean
  bestVolumeIncrease: VolumeIncrease | null
  // ใช้กับการ์ด Weekly Goal แบบ motivation — จำนวนครั้งที่ฝึกแล้วสัปดาห์นี้ เทียบกับเป้าหมาย
  // (เป้าหมายนับจากจำนวนวันที่ตั้งโปรแกรมไว้เอง ถ้ายังไม่ตั้งเลยใช้ 3 เป็นค่าเริ่มต้น)
  thisWeekWorkoutDays: number
  weeklyWorkoutGoal: number
  // แถวติ๊กถูกรายวัน (จ-อา) ของสัปดาห์นี้ — ใช้โชว์ในการ์ด Weekly Goal
  weekDayTicks: { iso: string; trained: boolean; isFuture: boolean; inStreak: boolean }[]
  // ผู้ใช้ใหม่จริงๆ = ไม่เคยบันทึกอะไรเลย (400 วันย้อนหลัง) และยังไม่ได้ตั้งโปรแกรมเลยด้วย —
  // ใช้ตัดสินว่าควรโชว์ first-run banner (OnboardingBanner) หรือไม่
  hasAnyHistory: boolean
  // จำนวนวันที่ฝึกใน 7 วันล่าสุด (รวมวันนี้) 0-7 — ใช้คำนวณ Fitness Score เท่านั้น
  last7DaysTrainedCount: number
  // ฟีดแบ็ก "Weekly Goal/Volume/Consistency แยกกันมากจนรู้สึกเหมือน 3 ระบบ" — สรุปเลข Volume/Consistency
  // ของสัปดาห์นี้มาไว้ในการ์ด Weekly Goal ด้วย (คำนวณจากข้อมูลที่ query มาแล้วในฟังก์ชันนี้ ไม่ query ซ้ำ
  // กับ WeeklyVolume.tsx/ConsistencyStrip.tsx — สูตรเดียวกันเป๊ะ กันตัวเลขไม่ตรงกันข้ามการ์ด) รายละเอียด
  // เต็มยังคงอยู่ที่การ์ดเดิมเหมือนเดิม จุดนี้แค่เพิ่มสรุปสั้นๆ ให้เชื่อมกัน
  weeklyTotalSets: number
  weeklyConsistencyPct: number | null
}

export async function fetchDashboardData(supabase: ReturnType<typeof createClient>): Promise<DashboardData> {
  const dow = todayDayOfWeek()
  const today = todayStr()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { start: thisWeekStart, end: thisWeekEnd } = getWeekRange()
  const { start: lastWeekStart } = getPreviousWeekRange()

  // Streak นับต่อเนื่องจะขาดทันทีถ้าเว้นเกิน 1 วัน (ดู computeCurrentStreak) ดังนั้นย้อนหลัง
  // 400 วัน (เกินหนึ่งปี) ก็เกินพอสำหรับ streak ที่มีความหมายจริง — กัน query โตไม่จำกัดตาม
  // อายุการใช้งานของผู้ใช้ (ก่อนหน้านี้ query นี้ดึง performed_at ของทุกแถวที่เคยบันทึกทั้งหมด)
  const STREAK_LOOKBACK_DAYS = 400
  const streakCutoff = daysAgoStr(STREAK_LOOKBACK_DAYS)

  const [
    { data: todayRows },
    { data: allDates },
    { data: dayRows },
    { data: recentStrength },
    { data: twoWeeksStrength },
    weeklyVolumeTargets,
    { data: profileRow },
    { data: bodyMetricRows },
    { data: goalRows },
  ] = await Promise.all([
    supabase.from('workouts').select('*').eq('performed_at', today).order('created_at'),
    supabase
      .from('workouts')
      .select('performed_at')
      .gte('performed_at', streakCutoff)
      .order('performed_at', { ascending: false }),
    supabase.from('program_days').select('*').order('day_of_week'),
    supabase
      .from('workouts')
      .select('muscle_group, performed_at, exercise_name, type, weight_kg, total_volume_kg')
      .eq('type', 'strength')
      .order('performed_at', { ascending: false })
      .limit(1000),
    supabase
      .from('workouts')
      .select('muscle_group, sets, performed_at')
      .eq('type', 'strength')
      .gte('performed_at', lastWeekStart)
      .lte('performed_at', thisWeekEnd),
    // เป้าหมายเซ็ต/สัปดาห์ของผู้ใช้เอง (ตั้งได้ต่อคน) รวมกับ default แล้ว — ดู lib/weeklyVolumeTargets.ts
    fetchWeeklyVolumeTargets(supabase),
    // ชื่อที่แสดงบน Dashboard ที่ผู้ใช้ตั้งเอง (ถ้ามี) — ดู lib/profile.ts
    user
      ? supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null as { display_name: string | null } | null }),
    // ฟีดแบ็ก "Body Goal โชว์ '0% Progress'/'เริ่มต้นเป้าหมาย' ทั้งที่จริงๆ ลดมาใกล้เป้าหมายมากแล้ว —
    // ควรคำนวณจาก starting weight จริง" — /health page แก้ปัญหานี้ไปแล้วตั้งแต่ v62 (ใช้
    // earliestTrackedValue จากประวัติทั้งหมด แทน goal.starting_value ที่แช่แข็งไว้ตอนสร้างเป้าหมายเฉยๆ)
    // แต่ Dashboard นี้ไม่เคยพอร์ตตามมาด้วย (ยัง limit(2) เดิม ไม่พอหาค่าเก่าสุดจริง) — เพิ่ม limit เป็น 60
    // แถวเดียวกับที่ /health ใช้ (ดู goalEarliestTrackedValue ใน app/(app)/health/page.tsx) พอสำหรับหา
    // earliestTracked* ด้านล่าง ยังใช้แถวเดียวกันนี้คำนวณ bodyMetricsSummary/insight เทรนด์เดิมได้ปกติ
    // (ฟังก์ชันพวกนั้นสนใจแค่ 2 แถวล่าสุดอยู่ดี ไม่กระทบจากแถวเพิ่ม)
    supabase.from('body_metrics').select('*').order('measured_at', { ascending: false }).limit(60),
    // เป้าหมายน้ำหนัก/Body Fat ที่ตั้งไว้ (ถ้ามี) — ใช้คำนวณ "เหลือเท่าไหร่ถึงเป้าหมาย" สำหรับ
    // การแจ้งเตือนหมวด Goal (ดู computeDashboardNotifications) ตารางเดียวกับที่ /health และ
    // BodyMetricsRow.tsx ใช้อยู่แล้ว
    supabase.from('goals').select('goal_type, target_value, starting_value').in('goal_type', ['weight', 'body_fat']).eq('status', 'active'),
  ])

  const todayList = (todayRows as Workout[]) ?? []
  const typedDays = (dayRows as ProgramDay[]) ?? []

  // ฟีดแบ็ก "ดูจากตารางล่วงหน้าที่ลงไว้ วันไหนไม่มีลงคือวันพัก — Scheduled Rest Day ไม่ควรตัด Streak"
  // — weekday ที่มี ProgramDay ตั้งไว้จริง (ไม่ว่าง = วันฝึกตามตาราง) ส่งเข้า compute*Streak เพื่อข้าม
  // วันพักตามแผนตอนนับสายโซ่ (ดู comment เต็มที่ computeCurrentStreak ใน lib/dashboardStats.ts)
  const workoutWeekdays = new Set(typedDays.map((d) => d.day_of_week))

  const distinctDates = Array.from(new Set(((allDates as { performed_at: string }[]) ?? []).map((r) => r.performed_at)))
  // เซตวันที่ที่อยู่ในสายโซ่ต่อเนื่อง "ปัจจุบัน" จริงๆ (เดินสายโซ่เดียวกับ computeCurrentStreak เป๊ะๆ —
  // ใช้ผลลัพธ์ก่อนนับเป็นตัวเลข) ให้ weekDayTicks ด้านล่างแยกได้ว่าวันไหน "ฝึกแล้ว + อยู่ใน streak ที่
  // ตัวเลขข้างบนกำลังนับอยู่จริง" กับวันไหน "ฝึกไปแล้วแต่ streak ขาดไปแล้ว" — กัน "1 วัน" ข้างบนดูขัดกับ
  // จุด ✓ หลายจุดในแถวสัปดาห์ (ฟีดแบ็ก "Current Streak ดูขัดกับ Timeline")
  const streakChainDates = computeCurrentStreakDates(distinctDates, workoutWeekdays)
  const streak = streakChainDates.size
  const bestStreak = computeLongestStreak(distinctDates, workoutWeekdays)

  const strengthRows =
    (recentStrength as {
      muscle_group: string | null
      performed_at: string
      exercise_name: string | null
      weight_kg: number | null
      total_volume_kg: number | null
    }[]) ?? []
  const recoveryDates: Record<string, string | null> = {}
  RECOVERY_MUSCLES.forEach((mg) => {
    const match = strengthRows.find((r) => r.muscle_group === mg)
    recoveryDates[mg] = match?.performed_at ?? null
  })
  const latestPR = computeLatestPR(strengthRows)
  // ฟีดแบ็ก "State C (เทรนเสร็จแล้ว) ควรโชว์ 'Volume +8% จากครั้งก่อน'" — เทียบ volume รวมของกลุ่ม
  // กล้ามเนื้อที่เทรนจริงวันนี้ (todayList) กับเซสชันก่อนหน้าล่าสุดของกลุ่มเดียวกัน (ดู
  // computeSessionVolumeChange) — คืน null ถ้ายังไม่มีข้อมูลพอเทียบ (วันนี้ยังไม่ได้เทรน/ไม่มีเซสชันก่อนหน้า)
  const todayMuscleGroups = Array.from(new Set(todayList.map((w) => w.muscle_group).filter((mg): mg is string => !!mg)))
  const sessionVolumeChange = computeSessionVolumeChange(strengthRows, todayMuscleGroups, today)

  const twoWeeksRows =
    (twoWeeksStrength as { muscle_group: string | null; sets: number | null; performed_at: string }[]) ?? []
  const thisWeekSets: Record<string, number> = {}
  const lastWeekSets: Record<string, number> = {}
  twoWeeksRows.forEach((r) => {
    if (!r.muscle_group) return
    const bucket = r.performed_at >= thisWeekStart ? thisWeekSets : lastWeekSets
    bucket[r.muscle_group] = (bucket[r.muscle_group] ?? 0) + (r.sets ?? 0)
  })
  const weeklyGoalPct = Math.round(
    VOLUME_MUSCLES.reduce((sum, mg) => {
      const target = weeklyVolumeTargets[mg]
      const pct = target > 0 ? Math.min(100, ((thisWeekSets[mg] ?? 0) / target) * 100) : 0
      return sum + pct
    }, 0) / VOLUME_MUSCLES.length
  )

  // ฟีดแบ็ก "Weekly Goal/Volume/Consistency แยกกันมากจนรู้สึกเหมือน 3 ระบบ" — สรุป Volume รวมสัปดาห์นี้
  // (ผลรวมเดียวกับ totalSets ใน WeeklyVolume.tsx เป๊ะ — thisWeekSets มาจาก query เดียวกัน กรอง type
  // strength + performed_at ในสัปดาห์นี้เหมือนกัน) มาแสดงในการ์ด Weekly Goal ด้วย
  const weeklyTotalSets = VOLUME_MUSCLES.reduce((sum, mg) => sum + (thisWeekSets[mg] ?? 0), 0)

  // Consistency % ย้อนหลัง 21 วัน — สูตรเดียวกับ ConsistencyStrip.tsx (computePlannedConsistency) ทุก
  // ประการ ใช้ distinctDates/workoutWeekdays ชุดเดียวกับที่คำนวณ streak ด้านบนอยู่แล้ว (ครอบคลุม 400 วัน
  // ย้อนหลัง เกินพอสำหรับ 21 วัน) ไม่ query ซ้ำ — toIso ใช้ local timezone offset เดียวกับ ConsistencyStrip
  // เพื่อให้ตัวเลขตรงกันเป๊ะ (ทั้งคู่รันฝั่ง browser ผ่าน useQuery เหมือนกัน)
  const distinctDateSet = new Set(distinctDates)
  const CONSISTENCY_WINDOW_DAYS = 21
  const consistencyWindowDays: { dayOfWeek: number; hasWorkout: boolean }[] = []
  for (let i = 0; i < CONSISTENCY_WINDOW_DAYS; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const offset = d.getTimezoneOffset()
    const iso = new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10)
    consistencyWindowDays.push({ dayOfWeek: d.getDay(), hasWorkout: distinctDateSet.has(iso) })
  }
  const weeklyConsistencyPct = computePlannedConsistency(consistencyWindowDays, workoutWeekdays).pct

  const volumeInsights = computeVolumeTrendInsights(thisWeekSets, lastWeekSets)
  const imbalanceInsights = computeImbalanceInsights(thisWeekSets, VOLUME_MUSCLES)
  const missedInsights = computeMissedMuscleInsights(recoveryDates)
  // Training Balance Engine — imbalanceInsights ด้านบนเตือนทีละกลุ่มที่ต่ำกว่าค่าเฉลี่ย ส่วนอันนี้มองภาพรวม
  // กว่านั้น: ฝั่งบน/ล่างลำตัวเอียงผิดสัดส่วนไหม (เทียบกับอุดมคติตามจำนวนกลุ่มกล้ามเนื้อจริงของแต่ละฝั่ง ไม่ใช่
  // 50/50) พร้อมคะแนน Balance + 2 กลุ่มที่ควรเพิ่มสัปดาห์นี้ในใบเดียว — null เมื่อสมดุลดีอยู่แล้ว
  const trainingBalance = computeTrainingBalance(thisWeekSets, VOLUME_MUSCLES)
  const trainingBalanceInsights = [trainingBalanceInsight(trainingBalance)].filter((i): i is Insight => i !== null)
  // ไม่ slice ที่นี่แล้ว — คอมโพเนนต์เป็นคนรวมกับ body-composition/workout-frequency insight
  // (ที่ต้อง useWeightUnit() ซึ่งเป็น hook เรียกในนี้ไม่ได้) แล้วค่อย slice ทีเดียวตอน render
  const insights = [...imbalanceInsights, ...volumeInsights, ...missedInsights, ...trainingBalanceInsights]

  // เทรนด์สัดส่วนร่างกายล่าสุด — ใช้ทำ insight เพิ่มเติมในการ์ด AI Coach (ดู bodyFatTrendInsight/
  // muscleMassTrendInsight ใน lib/aiCoach.ts) ไม่ต้องใช้ heightCm เพราะ insight พวกนี้ไม่ได้ใช้ BMI
  const typedBodyMetricRows = (bodyMetricRows as BodyMetric[]) ?? []
  const bodyMetricsSummary = computeBodyMetricsSummary(typedBodyMetricRows, null)

  // ฟีดแบ็ก "Body Goal โชว์ 0% ทั้งที่ลดมาใกล้เป้าหมายมากแล้ว" — ค่าเก่าที่สุดที่มีบันทึกจริงใน 60 แถวล่าสุด
  // (typedBodyMetricRows เรียง measured_at ใหม่->เก่า ตัวสุดท้ายที่มีค่าไม่ null = เก่าที่สุด) ใช้แทน
  // goal.starting_value ที่แช่แข็งไว้ตอนสร้างเป้าหมายเฉยๆ — ตรรกะเดียวกับ goalEarliestTrackedValue ใน
  // app/(app)/health/page.tsx เป๊ะ (พอร์ตมาให้ Dashboard คำนวณ % เดียวกับหน้า Health จริงๆ)
  const earliestTrackedWeight = (() => {
    for (let i = typedBodyMetricRows.length - 1; i >= 0; i--) {
      if (typedBodyMetricRows[i].weight_kg != null) return typedBodyMetricRows[i].weight_kg
    }
    return null
  })()
  const earliestTrackedBodyFat = (() => {
    for (let i = typedBodyMetricRows.length - 1; i >= 0; i--) {
      if (typedBodyMetricRows[i].body_fat_pct != null) return typedBodyMetricRows[i].body_fat_pct
    }
    return null
  })()

  const recoveryPctForSummary: Record<string, number> = {}
  RECOVERY_MUSCLES.forEach((mg) => {
    recoveryPctForSummary[mg] = computeRecoveryPct(recoveryDates[mg] ?? null, mg)
  })
  const pushPullBalance = computePushPullBalance(thisWeekSets)
  const bestVolumeIncrease = computeBestVolumeIncrease(thisWeekSets, lastWeekSets)

  // จำนวนครั้งที่ฝึกแล้วสัปดาห์นี้ (นับวันที่ต่างกัน ไม่ใช่จำนวนแถว) — ใช้ distinctDates ที่ดึงมาแล้ว
  // สำหรับคำนวณ streak ด้านบน (ย้อนหลัง 400 วัน ครอบคลุมสัปดาห์นี้แน่นอน) ไม่ต้อง query ซ้ำ
  const thisWeekWorkoutDays = distinctDates.filter((d) => d >= thisWeekStart && d <= thisWeekEnd).length
  // เป้าหมายจำนวนครั้ง/สัปดาห์ นับจากจำนวนวันที่ผู้ใช้ตั้งโปรแกรมไว้เอง (program_days) — สะท้อน
  // ตารางฝึกจริงของแต่ละคน ถ้ายังไม่ตั้งโปรแกรมเลย ใช้ 3 เป็นค่าเริ่มต้นทั่วไป
  const weeklyWorkoutGoal = typedDays.length > 0 ? typedDays.length : 3

  // แถวติ๊กถูกรายวัน (จ-อา) สำหรับการ์ด Weekly Goal — ใช้ distinctDates ชุดเดียวกับที่คำนวณ
  // streak/thisWeekWorkoutDays ด้านบน ไม่ต้อง query ซ้ำ
  const trainedDateSet = new Set(distinctDates)
  const toIsoLocal = (d: Date) => {
    const offset = d.getTimezoneOffset()
    const local = new Date(d.getTime() - offset * 60000)
    return local.toISOString().slice(0, 10)
  }
  const monday = new Date(thisWeekStart + 'T00:00:00')
  const weekDayTicks: { iso: string; trained: boolean; isFuture: boolean; inStreak: boolean }[] = Array.from(
    { length: 7 },
    (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const iso = toIsoLocal(d)
      return { iso, trained: trainedDateSet.has(iso), isFuture: iso > today, inStreak: streakChainDates.has(iso) }
    }
  )

  const currentDay = typedDays.find((d) => d.day_of_week === dow) ?? null

  const { data: exRows } = currentDay
    ? await supabase.from('program_exercises').select('*').eq('program_day_id', currentDay.id).order('position')
    : { data: null as ProgramExercise[] | null }

  const todayExercises = (exRows as ProgramExercise[]) ?? []
  let completedCount = 0
  let completedExerciseIds: string[] = []
  if (todayExercises.length > 0) {
    const { data: completions } = await supabase
      .from('program_completions')
      .select('program_exercise_id')
      .eq('completed_at', today)
      .in(
        'program_exercise_id',
        todayExercises.map((e) => e.id)
      )
    completedExerciseIds = (completions ?? []).map((c) => (c as { program_exercise_id: string }).program_exercise_id)
    completedCount = completedExerciseIds.length
  }

  // ฟีดแบ็ก "Dashboard แสดง 7/8 ทั้งๆที่ประวัติบันทึกไป 8 ท่า" — completedCount ด้านบนนับได้เฉพาะท่าตาม
  // แผน (program_exercise_id) เท่านั้น ท่า ad-hoc ("เพิ่มท่า" ระหว่างเซสชัน) เดิมไม่มีทางบันทึก completion
  // ได้เลย (migration 042 เพิ่ม workout_id ให้ผูกแทนได้) — นับแยกต่างหากเป็น adhocCompletedCount ไม่รวม
  // เข้ากับ completedCount ตัวบน เพราะ completedCount/progressPctForLabel ด้านล่างมีความหมายเจาะจงว่า
  // "ทำครบตามแผนหรือยัง" (ใช้ตัดสิน AI แนะนำกลุ่มกล้ามเนื้อถัดไป) ซึ่งไม่ควรถูกกระทบจากงานพิเศษนอกแผน —
  // การ์ด Hero (ทั้งเดสก์ท็อป/มือถือ) จะเอาสองค่านี้มาบวกกันเองตอน render แทน (ดู completedCount +
  // adhocCompletedCount ด้านล่างไฟล์นี้/MobileDashboardView.tsx)
  const { data: adhocCompletions } = await supabase
    .from('program_completions')
    .select('id')
    .eq('completed_at', today)
    .not('workout_id', 'is', null)
  const adhocCompletedCount = (adhocCompletions ?? []).length

  // % ความคืบหน้าของแผนวันนี้ ใช้ทั้งโชว์ตัวเลขในข้อความแนะนำ และตัดสินว่า "ฝึกวันนี้ไปแล้ว" หรือยัง
  // ถ้าวันนี้ไม่มีแผนกำหนดไว้ (บันทึกอิสระ) ให้ถือว่า 100% ถ้ามี log อย่างน้อย 1 รายการ ไม่งั้นเป็น null (ยังไม่ได้ฝึกอะไรเลย)
  const progressPctForLabel =
    todayExercises.length > 0
      ? Math.round((completedCount / todayExercises.length) * 100)
      : todayList.length > 0
        ? 100
        : null

  // ท่าของ "ทุกวัน" ในตาราง (ไม่ใช่แค่วันนี้) — ใช้หากล้ามเนื้อหลักจริงของแต่ละวันจากท่าที่ตั้งไว้
  // (dominantMuscleGroup) แทนการเดาจาก title ตรงๆ (ดู comment เต็มที่ ScheduledDay ใน lib/dashboardStats.ts
  // — เดิม getScheduledMuscleForDay ต้องตั้งชื่อวันเป็นชื่อกล้ามเนื้อไทยล้วนๆ เช่น "ขา" ถึงจะจับคู่ได้ ทำให้
  // ผู้ใช้ที่ตั้งชื่อวันแบบบรรยาย เช่น "Day 5 — Lower" ไม่เคยได้ประโยชน์จาก "เคารพตารางประจำสัปดาห์" เลย —
  // ฟีดแบ็ก "AI Coach ยังบอก NEXT ทั้งที่ Today's Focus บอก Day 5 — Lower ซึ่งควรเป็นวันนี้จริงๆ") —
  // currentDay ใช้ todayExercises ที่ดึงไปแล้วด้านบน ไม่ต้อง query ซ้ำ ส่วนวันอื่นดึงเพิ่มทีเดียว
  const otherDayIds = typedDays.filter((d) => d.id !== currentDay?.id).map((d) => d.id)
  const { data: otherDaysExRows } =
    otherDayIds.length > 0
      ? await supabase.from('program_exercises').select('program_day_id, muscle_group').in('program_day_id', otherDayIds)
      : { data: [] as { program_day_id: string; muscle_group: string | null }[] }

  const exercisesByDayId: Record<string, { muscle_group: string | null }[]> = {}
  if (currentDay) exercisesByDayId[currentDay.id] = todayExercises
  ;((otherDaysExRows as { program_day_id: string; muscle_group: string | null }[]) ?? []).forEach((row) => {
    exercisesByDayId[row.program_day_id] = exercisesByDayId[row.program_day_id] ?? []
    exercisesByDayId[row.program_day_id].push(row)
  })

  const scheduledDaysWithMuscle: ScheduledDay[] = typedDays.map((d) => ({
    day_of_week: d.day_of_week,
    title: d.title,
    muscleGroup: dominantMuscleGroup(exercisesByDayId[d.id] ?? []),
  }))

  // กล้ามเนื้อที่ควรแนะนำ: ยึดตามตารางโปรแกรมประจำสัปดาห์ก่อน (ถ้ามี) แทนที่จะดู recovery % สูงสุดล้วนๆ
  // เพื่อไม่ให้แนะนำสวนทางกับตาราง เช่น ตารางบอกวันนี้เป็นวันขา แต่ recovery ของอกดันสูงกว่า
  // ถ้าวันนี้ทำครบตามแผนแล้ว หรือวันนี้เป็นวันพัก/ไม่ได้ผูกกล้ามเนื้อไว้ ให้มองไปที่วันถัดไปในตาราง
  const todayScheduledMuscle = getScheduledMuscleForDay(scheduledDaysWithMuscle, dow, MUSCLE_GROUPS)
  // บั๊ก (ฟีดแบ็ก "MINT Coach บอก 'ครั้งหน้าแนะนำเล่นอก' ทั้งที่เพิ่งเล่นอกไปและฟื้นตัว 0% แล้ว ทั้งที่การ์ด
  // Training This Week บอก Next → Day 2 — Pull ถูกต้องอยู่แล้ว") — preferTodayMuscle เดิมเช็คแค่
  // progressPctForLabel (% ท่าที่ติ๊กครบตามแผน, program_completions) ซึ่งตั้งใจไม่นับงานนอกแผน (ดู comment
  // ด้านบน) แต่พอผู้ใช้ล็อกเซ็ตจริงของกล้ามเนื้อวันนี้ไปแล้ว (recovery ร่วงลงมาจริง) โดยยังไม่ได้ติ๊กครบทุก
  // ท่าตามแผน (หรือเล่นแบบ ad-hoc/generated) ระบบยังคงแนะนำกลุ่มเดิมของวันนี้ซ้ำอยู่ ทั้งที่ "Training This
  // Week"/"findNextProgramDay" มองไปข้างหน้าถูกต้องแล้ว — เพิ่มเงื่อนไข ต้องยังไม่เคย log ท่ากลุ่มนี้จริงวันนี้
  // เลย (todayMuscleGroups จาก todayList ด้านบน) ถึงจะยังนับว่า "วันนี้ยังไม่เสร็จ" ให้แนะนำกลุ่มเดิมต่อ
  const preferTodayMuscle =
    !!todayScheduledMuscle &&
    !todayMuscleGroups.includes(todayScheduledMuscle) &&
    (progressPctForLabel === null || progressPctForLabel < 100)
  const scheduledMuscle = preferTodayMuscle
    ? todayScheduledMuscle
    : getNextScheduledMuscle(scheduledDaysWithMuscle, dow, MUSCLE_GROUPS)
  // thisWeekSets/weeklyVolumeTargets ส่งเข้าไปด้วย (เดิมไม่มี) — ให้ engine แนะนำกลุ่มอื่นแทนกลุ่มตามตาราง
  // ได้ถ้า Volume ของกลุ่มตามตารางเกินเป้าหมายไปแล้ว (ฟีดแบ็ก "Recovery ฟื้นตัวแล้ว ≠ ควรฝึก" — ดู comment
  // เต็มที่ suggestMuscleToTrain) และให้กรณี "เลือกอิสระ" (ไม่มีตารางบังคับ) ไม่แนะนำกลุ่มที่เกินเป้าซ้ำๆ ด้วย
  const muscleRecommendation = suggestMuscleToTrain(recoveryPctForSummary, scheduledMuscle, thisWeekSets, weeklyVolumeTargets)
  // suggestMuscleToTrain ตกกลับไปเลือกกล้ามเนื้อ recovery สูงสุดเงียบๆ ถ้า scheduledMuscle ไม่มีอยู่ใน
  // recoveryPctByMuscle (เช่น วันนี้ตั้งชื่อวันเป็น "ทั้งตัว"/"อื่นๆ" ซึ่งไม่อยู่ใน RECOVERY_MUSCLES) —
  // เช็คว่าผลลัพธ์จริงตรงกับ todayScheduledMuscle เป๊ะๆ (หรือ "แทนที่" กลุ่มตามตารางเพราะ Volume เกินเป้า —
  // scheduleOverriddenFrom ตรงกับ todayScheduledMuscle) ก่อน ไม่ใช่เชื่อแค่ preferTodayMuscle เฉยๆ — กันป้าย
  // "· Today" ผิดพลาดตอน fallback ไปแนะนำกลุ่มที่ไม่เกี่ยวกับตารางวันนี้เลยจริงๆ (คนละกรณีกับ Volume override
  // ซึ่งยังนับเป็น "วันนี้" อยู่ แค่แนะนำกลุ่มอื่นแทนอย่างมีเหตุผล)
  const isRecommendationForToday =
    preferTodayMuscle &&
    (muscleRecommendation?.muscleGroup === todayScheduledMuscle ||
      muscleRecommendation?.scheduleOverriddenFrom === todayScheduledMuscle)

  // ต่อยอด muscleRecommendation (recovery ล้วนๆ) ด้วยเซ็ตที่เหลือถึงเป้าหมายรายสัปดาห์ของกลุ่มนั้น
  // (thisWeekSets/weeklyVolumeTargets คำนวณไว้แล้วด้านบนสำหรับการ์ด Weekly Goal/Weekly Volume อยู่แล้ว)
  // ให้คำแนะนำ "วันนี้ควรเล่นอะไร" ตอบทั้งความพร้อม (recovery) และโควตาที่เหลือ (volume) ในคำตอบเดียว
  const todaysRecommendation = computeTodaysRecommendation(muscleRecommendation, thisWeekSets, weeklyVolumeTargets)

  const aiDailySummary = computeAIDailySummary(
    muscleRecommendation,
    pushPullBalance,
    progressPctForLabel,
    trainingBalance,
    isRecommendationForToday
  )

  // เป้าหมายน้ำหนัก/Body Fat (ถ้ามี) — ใช้คำนวณ "เหลือเท่าไหร่ถึงเป้าหมาย" ของการแจ้งเตือนหมวด Goal
  // ดิบเป็น kg เสมอ (แปลงหน่วยแสดงผล kg/lb ทำที่ฝั่ง render ผ่าน useWeightUnit ซึ่งเป็น hook เรียกในนี้ไม่ได้)
  const typedGoals = (goalRows as { goal_type: string; target_value: number | null; starting_value: number | null }[]) ?? []
  const weightGoalTarget = typedGoals.find((g) => g.goal_type === 'weight')?.target_value ?? null
  const bodyFatGoalTarget = typedGoals.find((g) => g.goal_type === 'body_fat')?.target_value ?? null
  const weightGoalStart = typedGoals.find((g) => g.goal_type === 'weight')?.starting_value ?? null
  const bodyFatGoalStart = typedGoals.find((g) => g.goal_type === 'body_fat')?.starting_value ?? null

  // ฟีดแบ็ก "Body Goal ควรบอกคาดว่าจะถึงเป้าหมายเมื่อไหร่" — คำนวณจากอัตราเปลี่ยนแปลงจริงของ
  // typedBodyMetricRows (60 แถวล่าสุด ตัวเดียวกับที่ earliestTrackedWeight/BodyFat ใช้อยู่แล้ว ไม่ query
  // ซ้ำ) ผ่าน estimateGoalEtaWeeks (lib/goalProgress.ts) ซึ่งมีเกณฑ์ขั้นต่ำกันไม่ให้โชว์ ETA จากข้อมูล
  // น้อย/ไม่นิ่งพอ (≥3 ครั้งบันทึก + ช่วงเวลา ≥14 วัน + ทิศทางต้องตรงกับเป้าหมาย) — คืน null (ไม่โชว์อะไร
  // เพิ่ม) แทนการเดา ตามที่ตกลงกันไว้ตอนออกแบบฟีเจอร์นี้
  const weightEtaWeeks =
    weightGoalTarget != null
      ? estimateGoalEtaWeeks(
          typedBodyMetricRows
            .filter((m) => m.weight_kg != null)
            .map((m) => ({ date: m.measured_at, value: m.weight_kg as number })),
          weightGoalTarget
        )
      : null
  const bodyFatEtaWeeks =
    bodyFatGoalTarget != null
      ? estimateGoalEtaWeeks(
          typedBodyMetricRows
            .filter((m) => m.body_fat_pct != null)
            .map((m) => ({ date: m.measured_at, value: m.body_fat_pct as number })),
          bodyFatGoalTarget
        )
      : null

  // จำนวนวันที่ฝึกใน 7 วันล่าสุด (รวมวันนี้) — ใช้สำหรับ Fitness Score เท่านั้น ใช้ distinctDates
  // ชุดเดียวกับที่คำนวณ streak ด้านบน ไม่ต้อง query ซ้ำ
  const sevenDaysAgo = daysAgoStr(6)
  const last7DaysTrainedCount = distinctDates.filter((d) => d >= sevenDaysAgo && d <= today).length

  return {
    email: user?.email ?? null,
    profileDisplayName: (profileRow as { display_name: string | null } | null)?.display_name ?? null,
    todayWorkouts: todayList,
    streak,
    bestStreak,
    programDays: typedDays,
    todayExercises,
    completedCount,
    adhocCompletedCount,
    completedExerciseIds,
    recoveryDates,
    latestPR,
    sessionVolumeChange,
    insights,
    aiDailySummary,
    bodyMetricsSummary,
    weeklyGoalPct,
    muscleRecommendation,
    todaysRecommendation,
    weightGoalTarget,
    bodyFatGoalTarget,
    weightGoalStart,
    bodyFatGoalStart,
    earliestTrackedWeight,
    earliestTrackedBodyFat,
    weightEtaWeeks,
    bodyFatEtaWeeks,
    isRecommendationForToday,
    bestVolumeIncrease,
    thisWeekWorkoutDays,
    weeklyWorkoutGoal,
    weekDayTicks,
    hasAnyHistory: distinctDates.length > 0 || typedDays.length > 0,
    last7DaysTrainedCount,
    weeklyTotalSets,
    weeklyConsistencyPct,
  }
}

// ไอคอนรูปจริงชุดเดียวกับหน้าสุขภาพ (health/page.tsx) — ใช้แทน emoji เดิม (📉/📈/💪) เฉพาะ insight
// ที่เป็นเทรนด์สัดส่วนร่างกาย ให้ภาพลักษณ์ตรงกับหน้าสุขภาพเป๊ะๆ คีย์เป็น "id|kind" เพราะ insight
// กล้ามเนื้อใช้ emoji 💪 ตัวเดียวกันทั้งขึ้นและลง แยกทิศทางไม่ได้ด้วย emoji ต้องแยกด้วย kind แทน
// insight อื่น (volume/imbalance/missed-muscle/workout-frequency) ยังใช้ emoji เดิมต่อไป
export const INSIGHT_IMAGE: Record<string, string> = {
  'trend-body-fat|positive': '/icons/trend-improved.png',
  'trend-body-fat|warning': '/icons/body-fat-high.png',
  'trend-muscle-mass|positive': '/icons/muscle-up-icon.png',
  'trend-muscle-mass|warning': '/icons/muscle-down-icon.png',
}

export default function DashboardPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const today = todayStr()

  const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_DASHBOARD_PREFS)
  // ตั้งค่า Dashboard modal ยกไป context กลาง (DashboardSettingsProvider) แล้ว เพราะปุ่มเปิดย้ายไป
  // อยู่ที่ท้าย Sidebar (เห็นได้ทุกหน้า) ไม่ใช่ไอคอนเฟืองในหน้านี้อีกต่อไป
  const { open: settingsOpen, setOpen: setSettingsOpen } = useDashboardSettings()
  const router = useRouter()
  const searchParams = useSearchParams()
  // ค่าเริ่มต้นคงที่ (ไม่ขึ้นกับเวลา) เพื่อให้ตรงกับ HTML ที่ server render มาเป๊ะๆ —
  // แล้วค่อยคำนวณคำทักทายจริงหลัง mount ฝั่ง client เท่านั้น เพราะ server (UTC) กับ
  // เครื่องผู้ใช้ (เวลาไทย) คำนวณ new Date().getHours() ได้คนละค่า ถ้าคำนวณตรงๆ ตอน
  // render จะทำให้ข้อความไม่ตรงกันระหว่างเซิร์ฟเวอร์กับ client (hydration mismatch)
  const [greetingText, setGreetingText] = useState('สวัสดี')
  // เริ่มด้วย true (ซ่อนไว้ก่อน) กันไม่ให้ banner กระพริบโผล่มาแวบเดียวระหว่างรอเช็ค localStorage
  // ตอน mount — ค่อยเปิดออกถ้าเช็คแล้วว่ายังไม่เคยปิด
  const [bannerDismissed, setBannerDismissed] = useState(true)
  // กลุ่มกล้ามเนื้อที่ hover อยู่ตอนนี้ในการ์ด Recovery — ใช้ไฮไลต์แท่งของกลุ่มนั้นในลิสต์ (v48d: เดิม
  // sync กับ RecoveryBodyDiagram ด้วย แต่ตัดรูปตัวคนออกแล้วตามฟีดแบ็ก เหลือแค่ highlight แท่งตัวเอง)
  const [hoveredRecoveryGroup, setHoveredRecoveryGroup] = useState<MuscleGroup | null>(null)
  // Priority 8 (Recovery Score -> Decision): เดิมลิสต์ Recovery โชว์ครบ 7 กลุ่มเสมอ ต่อให้ทุกกลุ่ม
  // ฟื้นตัวเต็มที่พร้อมกันหมด (badge "EXCELLENT" ซ้ำ 7 ครั้ง ไม่มีข้อมูลใหม่ให้อ่านเลย) — ดีฟอลต์ย่อเหลือ
  // เฉพาะกลุ่มที่ยังไม่พร้อม (< FULLY_RECOVERED_PCT) ให้เห็นแต่สิ่งที่ต้องตัดสินใจ พร้อม toggle ดูครบทั้งหมด
  const [showAllRecovery, setShowAllRecovery] = useState(false)
  // ฟีดแบ็ก "ก่อนเริ่มเซ็ตแรก เพิ่มปุ่ม [ ดูท่าวอร์มอัป 3 นาที ]" — เปิด/ปิด WarmupGuideSheet
  const [warmupOpen, setWarmupOpen] = useState(false)
  // ฟีดแบ็ก "40 Moderate ผู้ใช้ยังไม่รู้ว่า 'ทำไม?' ถ้าคลิกแล้วเปิดรายละเอียดได้จะดีมาก" — เดสก์ท็อปเดิม
  // pill Fitness Score บน header เป็นแค่ <div> โชว์เฉยๆ กดไม่ได้ ทั้งที่ FitnessScoreDetailSheet.tsx
  // (breakdown ทุกปัจจัย + "💡 เพิ่ม X จาก N% -> M% ได้อีก +คะแนน") มีอยู่แล้วและมือถือใช้อยู่แล้ว
  // (components/dashboard/FitnessScore.tsx) — เปิดใช้ sheet เดียวกันนี้ที่เดสก์ท็อปแทนที่จะคิดข้อความ
  // ใหม่/ยัดบรรทัดเพิ่มเข้าไปในพื้นที่ pill แคบๆ ที่ tune ความสูงมาหลายรอบแล้ว
  const [showFitnessScoreDetail, setShowFitnessScoreDetail] = useState(false)

  // v46: "Titanium Reflection — แสงวิ่งบน Card เวลาขยับ Mouse" — จุดสว่างจางๆ ตามตำแหน่งเมาส์บน Hero
  // Card (การ์ดเดียวที่ควรมี effect ใหม่ตามกฎ "Hero มีแค่ใบเดียว") จำลองแสงสะท้อนผิวโลหะเปลี่ยนมุมตามที่
  // มองจริง — ใช้ ref เขียน style ตรงๆ ตอน mousemove แทน useState (กัน re-render ทั้ง component ทุก
  // เฟรมที่เมาส์ขยับ ซึ่งจะหนักเกินจำเป็นสำหรับแค่ตำแหน่ง highlight เดียว)
  const heroSpotlightRef = useRef<HTMLDivElement>(null)
  function handleHeroMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    if (heroSpotlightRef.current) {
      heroSpotlightRef.current.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,.09), transparent 45%)`
    }
  }
  function handleHeroMouseLeave() {
    if (heroSpotlightRef.current) {
      heroSpotlightRef.current.style.background = 'transparent'
    }
  }

  useEffect(() => {
    setPrefs(loadDashboardPrefs())
    setGreetingText(greeting())
    setBannerDismissed(isOnboardingBannerDismissed())
  }, [])

  // มาจากปุ่ม "ตั้งค่า" ใน Sidebar ตอนอยู่หน้าอื่น (เช่น /dashboard?settings=1) — เปิด modal ให้เลย
  // แล้วล้าง query param ทิ้งไม่ให้ค้างอยู่ใน URL
  useEffect(() => {
    if (searchParams.get('settings') === '1') {
      setSettingsOpen(true)
      router.replace('/dashboard')
    }
  }, [searchParams, setSettingsOpen, router])

  function handleDismissBanner() {
    dismissOnboardingBanner()
    setBannerDismissed(true)
  }

  const {
    data,
    isLoading,
    isError,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['dashboard', today],
    queryFn: () => fetchDashboardData(supabase),
  })

  function updatePrefs(next: DashboardPrefs) {
    setPrefs(next)
    saveDashboardPrefs(next)
  }

  async function handleSaveDisplayName(name: string) {
    await saveDisplayName(supabase, name)
    queryClient.invalidateQueries({ queryKey: ['dashboard', today] })
  }

  function retry() {
    queryClient.invalidateQueries({ queryKey: ['dashboard', today] })
  }

  const { toDisplay, unit } = useWeightUnit()
  const dow = todayDayOfWeek()

  // การ์ด AI Coach: รวม insight เทรนด์สัดส่วนร่างกาย (ไขมัน/กล้ามเนื้อ) + ความถี่การฝึก
  // เข้ากับ insight เดิม (volume/imbalance/missed) — สามตัวแรกมาก่อนเพราะเป็นภาพรวมระดับ
  // "ก้าวหน้าไหม" ที่ผู้ใช้อยากเห็นทันที ส่วนที่เหลือเป็นรายละเอียดระดับกล้ามเนื้อย่อย
  const combinedInsights = useMemo(() => {
    if (!data) return []
    const { bodyMetricsSummary } = data
    const muscleDeltaDisplay =
      bodyMetricsSummary.skeletalMuscleKg.delta != null ? toDisplay(bodyMetricsSummary.skeletalMuscleKg.delta) : 0
    const extra = [
      bodyFatTrendInsight(bodyMetricsSummary.bodyFatPct, bodyMetricsSummary.periodLabel),
      muscleMassTrendInsight(bodyMetricsSummary.skeletalMuscleKg, bodyMetricsSummary.periodLabel, muscleDeltaDisplay, unit),
      workoutFrequencyInsight(data.thisWeekWorkoutDays, data.weeklyWorkoutGoal, dow),
    ].filter((i): i is Insight => i != null)
    return [...extra, ...data.insights].slice(0, 4)
  }, [data, toDisplay, unit, dow])

  const scheduledDay = useMemo(
    () => data?.programDays.find((d) => d.day_of_week === dow) ?? null,
    [data?.programDays, dow]
  )
  // ฟีดแบ็ก "วันพักตามแผนควรมี Badge บอกว่า Streak ไม่ขาด กันผู้ใช้รู้สึกผิด" — ตรรกะ "วันพักตามแผนไม่ตัด
  // Streak" มีอยู่แล้วจริงใน computeCurrentStreak/computeLongestStreak (lib/dashboardStats.ts, ใช้
  // workoutWeekdays ตัวเดียวกับที่ scheduledDay ด้านบนอิงอยู่) แค่ไม่เคยมี badge ให้ผู้ใช้ "เห็น" ว่ากำลัง
  // เกิดพฤติกรรมนี้อยู่ — true เฉพาะวันที่มีโปรแกรมตั้งไว้จริง (programDays.length > 0) แต่วันนี้ไม่ใช่
  // วันฝึกตามตาราง (ไม่มี scheduledDay) แยกจาก "ยังไม่เคยตั้งโปรแกรมเลย" (programDays.length === 0) ซึ่ง
  // ควรได้ข้อความชวนตั้งโปรแกรมแบบเดิม ไม่ใช่ badge นี้
  const isScheduledRestDay = !scheduledDay && (data?.programDays.length ?? 0) > 0
  const next = useMemo(() => (data ? findNextProgramDay(data.programDays, dow) : null), [data, dow])
  // ประโยคทักทายแบบมีบริบท — ลองมีเรื่อง "วันนี้ทำอะไรต่อ" ก่อน ถ้าไม่มีค่อยลองมี "อะไรดีขึ้นบ้างสัปดาห์นี้"
  const greetingContext = useMemo(
    () =>
      data
        ? computeGreetingContext(scheduledDay?.title ?? null, data.muscleRecommendation, data.bestVolumeIncrease)
        : { headline: null, detail: null },
    [data, scheduledDay]
  )
  const totals = useMemo(() => computeTodayTotals(data?.todayWorkouts ?? []), [data?.todayWorkouts])

  // v47: ฟีดแบ็ก "Workout Card ฝั่งซ้ายล่างยังว่างอยู่บ้าง อยากได้ Calories เติม" — ใช้สูตรประมาณเดียวกับ
  // หน้า Session/Stats (estimateCaloriesToday ใน lib/dashboardStats.ts) ไม่ใช่ตัวเลขสมมติ — น้ำหนักตัวใช้
  // ค่าล่าสุดจาก body_metrics ที่มีอยู่แล้ว (bodyMetricsSummary.weight.value) ถ้ายังไม่เคยบันทึกน้ำหนักเลย
  // ฟังก์ชัน fallback ไป DEFAULT_BODYWEIGHT_KG เอง (70kg) เหมือนจุดอื่นที่เรียกฟังก์ชันนี้ทุกที่
  const todayCalories = useMemo(
    () => estimateCaloriesToday(data?.todayWorkouts ?? [], totals.durationMin, data?.bodyMetricsSummary.weight.value ?? null),
    [data, totals.durationMin]
  )

  // สรุปกลุ่มกล้ามเนื้อหลักที่เทรนวันนี้เป็น label เดียว เช่น "อก + แขน" — ใช้แค่ muscle_group หลัก
  // ของแต่ละ workout (ไม่รวม secondary) เพื่อให้สั้นกระชับพอจะโชว์บน hero card ได้ ไล่ตามลำดับที่เทรนก่อน-หลัง
  const todayMuscleLabel = useMemo(() => {
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const w of data?.todayWorkouts ?? []) {
      if (w.muscle_group && (VOLUME_MUSCLES as readonly string[]).includes(w.muscle_group) && !seen.has(w.muscle_group)) {
        seen.add(w.muscle_group)
        ordered.push(w.muscle_group)
      }
    }
    return ordered.length > 0 ? ordered.join(' + ') : null
  }, [data?.todayWorkouts])
  // บั๊ก (ฟีดแบ็ก "มือถือขึ้น 8/8 COMPLETED แต่เดสก์ท็อปยังโชว์ 88% ความพร้อม + ปุ่มไปต่อ") — เดิม
  // progressPct นับแค่ data.completedCount (ท่าตามแผนที่จบผ่าน program_exercise_id ตรงๆ) ไม่รวม
  // data.adhocCompletedCount (ท่าที่จบผ่าน workout_id — เช่นท่าที่ "สลับ" กลางเซสชัน ดู comment เต็มที่
  // adhocCompletedCount ด้านบนไฟล์นี้) MobileDashboardView.tsx บวกสองค่านี้รวมกันอยู่แล้ว (ดู
  // TodaysWorkoutCompactCard's completed prop) แต่ progressPct/todayCompleted ของเดสก์ท็อปไม่เคยบวกตาม
  // ทำให้เซสชันที่มีท่าสลับ/ad-hoc ครบแล้วจริง เดสก์ท็อปยังคิดว่ายังไม่เสร็จ — บวกให้ตรงกัน (clamp ที่ 100
  // เผื่อกรณีท่า ad-hoc เกินจำนวนแผนเดิม)
  const progressPct =
    data && data.todayExercises.length > 0
      ? Math.min(100, Math.round(((data.completedCount + data.adhocCompletedCount) / data.todayExercises.length) * 100))
      : null
  // กลุ่มกล้ามเนื้อของ "แผนวันนี้" (ไม่ใช่ที่เทรนไปแล้ว) — มาจาก program_exercises ถ้าตั้งโปรแกรมไว้,
  // ไม่งั้น fallback ไปใช้ todayMuscleLabel (กลุ่มที่เทรนจริงวันนี้ กรณีบันทึกอิสระไม่มีโปรแกรม) — แยก
  // เป็น array ก่อน (plannedMuscleGroups) แล้วค่อย join เป็น label ให้ getWarmupMoves (lib/warmupGuide.ts)
  // ใช้ array เดียวกันนี้ต่อได้ ไม่ต้องแกะ label string กลับเป็น array อีกที
  const plannedMuscleGroups = useMemo(() => {
    if (!data) return []
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const e of data.todayExercises) {
      if (e.muscle_group && (VOLUME_MUSCLES as readonly string[]).includes(e.muscle_group) && !seen.has(e.muscle_group)) {
        seen.add(e.muscle_group)
        ordered.push(e.muscle_group)
      }
    }
    if (ordered.length > 0) return ordered
    return todayMuscleLabel ? todayMuscleLabel.split(' + ') : []
  }, [data, todayMuscleLabel])
  const plannedMuscleLabel = plannedMuscleGroups.length > 0 ? plannedMuscleGroups.join(' • ') : null
  const warmupMoves = useMemo(() => getWarmupMoves(plannedMuscleGroups), [plannedMuscleGroups])
  // จำนวนเซ็ตที่ตั้งเป้าไว้ทั้งหมดของวันนี้ (จากแผน) — ถ้าไม่มีแผน fallback ไปนับเซ็ตที่บันทึกจริงแล้ว
  const plannedTotalSets = useMemo(() => {
    if (!data) return 0
    if (data.todayExercises.length > 0) return data.todayExercises.reduce((s, e) => s + (e.sets ?? 0), 0)
    return data.todayWorkouts.reduce((s, w) => s + (w.sets ?? 0), 0)
  }, [data])
  // เวลาที่ใช้จริงยังไม่มีจนกว่าจะเริ่มบันทึก (totals.durationMin เป็น null) — ระหว่างนั้นประมาณคร่าวๆ
  // จากจำนวนเซ็ต (ราว 1.5 นาที/เซ็ต รวมพักระหว่างเซ็ต) แค่ให้พอเห็นภาพ ไม่ใช่ตัวเลขแม่นยำ
  const estimatedMinutes = Math.max(10, Math.round((plannedTotalSets * 1.5) / 5) * 5)
  const workoutTitle = scheduledDay?.title ?? ((data?.todayWorkouts.length ?? 0) > 0 ? 'บันทึกอิสระ' : null)
  // % ความคืบหน้าที่ใช้กับข้อความแนะนำกล้ามเนื้อ (recoveryRecommendationLabel) — เหมือน progressPct
  // ของ ring ด้านบน แต่ถ้าวันนี้ไม่มีแผนกำหนดไว้ (บันทึกอิสระ) ให้ถือว่า 100% เมื่อมี log อย่างน้อย 1 รายการ
  const recoveryLabelPct =
    progressPct !== null ? progressPct : (data?.todayWorkouts.length ?? 0) > 0 ? 100 : null

  // Priority 14 (Notifications Actionable) — รวม 4 สัญญาณที่คำนวณไว้แล้วทั่วหน้านี้ (ตารางวันนี้/
  // recovery/เทรนด์ body fat/เป้าหมาย) เป็นรายการแจ้งเตือนที่กดแล้วไปหน้าที่เกี่ยวข้องได้จริง แทนที่
  // "PR ล่าสุด"/"ฝึกมากสุดสัปดาห์นี้" เดิมซึ่งเป็นสรุปสถิติเฉยๆ กดแล้วไปไหนไม่ได้
  const todayCompleted = (progressPct !== null && progressPct >= 100) || (progressPct === null && (data?.todayWorkouts.length ?? 0) > 0)
  // ฟีดแบ็ก "Today's Workout มีหลายอย่างแย่งความสนใจ (0 Exercises, 0 Sets, ~10 นาที, AI reasoning, ปุ่ม,
  // ข้อความ) — User ไม่รู้ว่าควรกดอะไรใน 1-2 วินาทีแรก ตอนยังไม่มี Workout วันนี้เลย ให้เหลือแค่ Hero
  // Message + CTA เดียว" — true เฉพาะตอนไม่มีทั้งโปรแกรม (scheduledDay) และยังไม่ได้ log อะไรเลยวันนี้
  // (totals.entryCount === 0) เท่านั้น — ถ้าเริ่ม log ท่า ad-hoc ไปแล้วแม้ไม่มีโปรแกรม ตัวเลขจริงมีความหมาย
  // แล้ว ไม่ใช่ noise อีกต่อไป จึงยังโชว์ตามปกติ ไม่ถือเป็น "ว่างเปล่า"
  const isEmptyWorkoutState = !scheduledDay && !todayCompleted && totals.entryCount === 0
  // goalProgressPct (lib/goalProgress.ts, ตัวเดียวกับหน้า Health) รู้ทิศทางเป้าหมาย (ลด/เพิ่ม) จาก
  // starting_value เทียบ target — ใช้เช็คว่าถึง/เกินเป้าหมายแล้วหรือยัง ก่อนเดิม Math.abs(current-target)
  // เฉยๆ ไม่รู้ทิศทาง ทำให้แจ้งเตือน "เหลือ X kg" ค้างอยู่แม้ทำถึงเป้าหมาย (หรือเกิน) ไปแล้วจริงๆ
  const weightGoalReached =
    data?.weightGoalTarget != null && data.bodyMetricsSummary.weight.value != null
      ? (goalProgressPct({ target_value: data.weightGoalTarget, starting_value: data.weightGoalStart }, data.bodyMetricsSummary.weight.value, data.earliestTrackedWeight) ?? 0) >= 100
      : false
  const bodyFatGoalReached =
    data?.bodyFatGoalTarget != null && data.bodyMetricsSummary.bodyFatPct.value != null
      ? (goalProgressPct({ target_value: data.bodyFatGoalTarget, starting_value: data.bodyFatGoalStart }, data.bodyMetricsSummary.bodyFatPct.value, data.earliestTrackedBodyFat) ?? 0) >= 100
      : false
  const weightRemaining =
    data?.weightGoalTarget != null && data.bodyMetricsSummary.weight.value != null && !weightGoalReached
      ? { value: Math.abs(toDisplay(data.bodyMetricsSummary.weight.value) - toDisplay(data.weightGoalTarget)), unit }
      : null
  const bodyFatRemaining =
    data?.bodyFatGoalTarget != null && data.bodyMetricsSummary.bodyFatPct.value != null && !bodyFatGoalReached
      ? Math.abs(data.bodyMetricsSummary.bodyFatPct.value - data.bodyFatGoalTarget)
      : null
  // PR ย้อนหลัง "ทุกช่วงเวลา" ไม่ควรขึ้นแจ้งเตือนราวกับเพิ่งเกิด — จำกัดเฉพาะที่ทำไว้ใน 7 วันล่าสุดเท่านั้น
  // (ตัวเลขเดียวกับ FITLOG_PR_RECENT_DAYS ด้านล่าง กัน magic number ซ้ำ 2 จุด)
  const latestPRForNotif =
    data?.latestPR && data.latestPR.performedAt >= daysAgoStr(FITLOG_PR_RECENT_DAYS)
      ? { exerciseName: data.latestPR.exerciseName, weight: Math.round(toDisplay(data.latestPR.weightKg) * 10) / 10, unit }
      : null
  const notifications = data
    ? computeDashboardNotifications({
        scheduledWorkoutTitle: scheduledDay?.title ?? null,
        todayCompleted,
        recommendation: data.todaysRecommendation,
        bodyFatDelta: data.bodyMetricsSummary.bodyFatPct.delta,
        bodyFatIsGood: data.bodyMetricsSummary.bodyFatPct.isGood,
        weightRemaining,
        bodyFatRemaining,
        latestPR: latestPRForNotif,
      })
    : []

  // v45: ฟีดแบ็ก "Header ยังโล่งเกินไป มีพื้นที่ว่างเกือบ 40%" — เพิ่ม Fitness Score (สูตรจริงเดียวกับที่
  // มือถือใช้อยู่แล้ว ดู MobileDashboardView.tsx, ไม่ใช่เลขสมมติใหม่) ลงไปเติมช่องว่างระหว่างชื่อกับ
  // ป้ายวันที่ — สูตร/น้ำหนักปัจจัยตรงกับ MobileDashboardView.tsx เป๊ะ (Workout Completion 30% / Streak
  // 20% / Sleep 20% (ไม่มีข้อมูลเสมอ กระจายน้ำหนักให้ปัจจัยอื่น) / Recovery 15% / Weekly Goal 10% /
  // Activity วันนี้ 5%) — เดสก์ท็อปไม่เคยมี Fitness Score เลยมาก่อนรอบนี้
  const trainedRecoveryMuscles = data ? RECOVERY_MUSCLES.filter((mg) => data.recoveryDates[mg]) : []
  const recoveryPctMap: Record<string, number> = {}
  if (data) {
    RECOVERY_MUSCLES.forEach((mg) => {
      recoveryPctMap[mg] = computeRecoveryPct(data.recoveryDates[mg] ?? null, mg)
    })
  }
  const fitnessScoreRecoveryPct =
    trainedRecoveryMuscles.length > 0
      ? Math.round(trainedRecoveryMuscles.reduce((sum, mg) => sum + recoveryPctMap[mg], 0) / trainedRecoveryMuscles.length)
      : null
  const fitnessScore = useMemo(() => {
    if (!data) return null
    return computeFitnessScore([
      { key: 'workout', label: 'Workout Completion', value: Math.round((data.last7DaysTrainedCount / 7) * 100), weight: 30 },
      { key: 'streak', label: 'Streak', value: Math.min(100, Math.round((data.streak / 14) * 100)), weight: 20 },
      { key: 'sleep', label: 'Sleep', value: null, weight: 20 },
      { key: 'recovery', label: 'Recovery', value: fitnessScoreRecoveryPct, weight: 15 },
      { key: 'weeklyGoal', label: 'Weekly Goal', value: data.weeklyGoalPct, weight: 10 },
      { key: 'activityToday', label: 'Activity Today', value: progressPct ?? (totals.entryCount > 0 ? 100 : 0), weight: 5 },
    ])
  }, [data, fitnessScoreRecoveryPct, progressPct, totals.entryCount])

  if (isLoading || !data) {
    return <DashboardSkeleton />
  }

  if (isError) {
    return <ErrorState title="โหลด Dashboard ไม่สำเร็จ" message="ไม่สามารถโหลด Dashboard ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่" onRetry={retry} />
  }

  return (
    // < 1024px: flat vertical stack, unchanged from before.
    // >= 1024px (lg): the two column wrappers below switch to `lg:contents` so their
    // children become direct items of this 12-col grid — actual row order is controlled
    // per-item via `lg:order-*`, not by where the element sits in the JSX tree.
    // (Single breakpoint on purpose — many 14" laptops report a CSS viewport width
    // somewhere in the 1024–1280px range, so gating this on `xl` left that whole
    // range stuck on an in-between 2-column layout that never really got tested.)
    <>
    <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-4 lg:items-start">
      {/* greeting + settings */}
      <div className="relative z-20 lg:col-span-12 lg:order-1 flex items-start justify-between gap-3 px-1 animate-rise" style={{ animationDelay: '0ms' }}>
        {/* Hero Background — แสงอำพันจางมากๆ (~3% peak) หลัง Header ตรงจุดที่ชื่อ (BANK ฯลฯ) อยู่ ให้
            ตัวหนังสือรู้สึกมีแหล่งกำเนิดแสงอยู่ข้างหลังจริง แทนที่จะลอยอยู่บนพื้นหลังเรียบเฉยๆ — ยึดตำแหน่ง
            ชิดซ้าย (คอลัมน์ชื่อ ไม่ใช่กลางแถวซึ่งจะไปชนฝั่ง Fitness Score/Recovery pill ทางขวา) จางเร็ว
            (transparent ที่ 70% ของรัศมี) กันไม่ให้ลามไปเป็น glow ทั่วทั้งแถว — z-index ต่ำกว่าเนื้อหา
            (ไม่มี z-index ระบุ = 0 ตามค่า default ของ stacking context นี้ วางก่อน children อื่นใน DOM) */}
        <div
          className="absolute -inset-x-4 -top-8 h-40 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(ellipse 60% 100% at 15% 30%, rgba(255,150,30,.03), transparent 70%)',
          }}
          aria-hidden="true"
        />
        <div>
          <p className="text-xs text-muted">👋 {greetingText}</p>
          <p
            className="uppercase mt-1"
            style={{
              fontFamily: 'var(--font-oswald), var(--font-kanit)',
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: '2px',
              lineHeight: 1,
              backgroundImage: 'linear-gradient(180deg, #FFFFFF, #C7CBD1)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              textShadow: '0 0 24px rgba(255,255,255,.05)', // glow ด้านหลังชื่อ เบามาก ~3-5% ตามที่ขอ
            }}
          >
            {data.profileDisplayName || emailDisplayName(data.email)}
          </p>
          {/* เส้น gradient สั้นๆ ใต้ชื่อ (60-80px) คั่นระหว่าง hero name กับบรรทัด insight ด้านล่าง
              v60: ฟีดแบ็ก "เพิ่มระยะห่างระหว่าง BANK กับ BODY FAT... ประมาณ 6-8px จะหายใจขึ้น" —
              marginBottom (ช่องว่างระหว่างเส้นคั่นกับบรรทัด insight ด้านล่าง) 10 -> 18 (+8px) ไม่แตะ
              marginTop (ช่องว่างระหว่างชื่อกับเส้นคั่น) เพราะฟีดแบ็กพูดถึงช่องว่างรวมก่อนถึงบรรทัด Body Fat */}
          <div
            aria-hidden="true"
            style={{
              width: 70,
              height: 3,
              marginTop: 8,
              marginBottom: 18,
              borderRadius: 2,
              background: 'linear-gradient(90deg, rgba(255,255,255,.5), transparent)',
            }}
          />
          {(() => {
            // ลำดับความสำคัญของ insight ใต้ชื่อ: เทรนด์ไขมันดีขึ้น (ข่าวดีเฉพาะตัว) > streak ต่อเนื่อง (สม่ำเสมอ)
            // > fallback เป็น headline/detail เดิม (แผนวันนี้/คำแนะนำกล้ามเนื้อ) ถ้าไม่มี 2 อย่างแรก
            const bf = data.bodyMetricsSummary.bodyFatPct
            if (bf.delta != null && bf.isGood) {
              return (
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 shrink-0 rounded-full border border-moss flex items-center justify-center text-sm">
                    📉
                  </span>
                  {/* ฟีดแบ็ก "Typography Hierarchy — MINT (Hero) / BODY FAT ↓0.4% (Primary insight) /
                      ยอดเยี่ยม! (Secondary feedback) เด่นพร้อมกันหมด ควรแยกระดับ" — เดิมทั้ง 3 ส่วนอยู่ใน
                      <p className="text-sm"> เดียวกัน ขนาดเท่ากันหมด แยก "ยอดเยี่ยม! 🎉" ออกมาเป็น text-xs
                      (เล็กกว่า) ให้เห็นชัดว่าเป็นความรู้สึก/ฟีดแบ็กเสริม ไม่ใช่ข้อมูลหลักระดับเดียวกับตัวเลข
                      ห่อทั้งคู่ใน div เดียวกัน (แทนที่จะเป็น flex sibling แยกของ icon) กันสองบรรทัดเรียง
                      แนวนอนแทนที่จะซ้อนกันแนวตั้ง */}
                  <div>
                    <p className="text-sm">
                      <span className="font-display uppercase tracked text-ink">Body Fat</span>{' '}
                      <span className="font-mono font-semibold" style={{ color: COLORS.deltaGood }}>
                        ↓{Math.abs(bf.delta).toFixed(1)}%
                      </span>
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: COLORS.deltaGood }}>
                      ยอดเยี่ยม! 🎉
                    </p>
                  </div>
                </div>
              )
            }
            if (data.streak > 0) {
              return (
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 shrink-0 rounded-full border border-moss flex items-center justify-center text-sm">
                    🔥
                  </span>
                  <p className="text-sm">
                    <span className="font-display uppercase tracked text-ink">Workout Streak</span>
                    <span className="text-muted mx-1.5">•</span>
                    <span className="font-mono font-semibold" style={{ color: COLORS.deltaGood }}>
                      {data.streak} วัน
                    </span>
                  </p>
                </div>
              )
            }
            return (
              <>
                {greetingContext.headline && (
                  <p className="font-display text-sm tracked uppercase text-amber">{greetingContext.headline}</p>
                )}
                {greetingContext.detail && <p className="text-[12px] text-muted mt-1">{greetingContext.detail}</p>}
              </>
            )
          })()}
        </div>

        {/* v45: ฟีดแบ็ก "Header ยังโล่งเกินไป มีพื้นที่ว่างเกือบ 40%" — เติมช่องว่างระหว่างชื่อกับป้ายวันที่
            ด้วยป้าย Fitness Score (คำนวณจริงด้านบน ไม่ใช่เลขสมมติ) วงแหวนเล็ก+ตัวเลข+ระดับ (Excellent/Good
            ฯลฯ) สีตาม tier เดียวกับที่มือถือใช้ (fitnessScore.color)
            v46: ฟีดแบ็ก "Hero Dashboard" (10/10 wishlist) — มอคอัพขอ "👋 Good Evening / BANK / Ready for
            Upper Body / Fitness Score 84 / Recovery Excellent" แบบ Apple Fitness/Whoop — เลือกไม่รื้อ
            เลย์เอาต์ทักทาย/ชื่อทั้งหมด (เพิ่งทำ Fitness Score pill รอบ v45 ไปแล้ว เปลี่ยนโครงทั้งหมดจะทับ
            งานเดิม + เสี่ยงพังเลย์เอาต์ที่ทดสอบแล้ว) แต่เพิ่มสัญญาณ "Recovery" ที่มอคอัพขอเข้ามาแบบเสริม
            (ป้ายที่สอง สีฟ้าไซแอนเดียวกับการ์ด Recovery) วางคู่กับ Fitness Score pill — ครบทั้ง 2 สัญญาณ
            ที่มอคอัพต้องการโดยไม่ต้องรื้อโครงสร้างเดิม — ไม่โชว์ถ้ายังไม่เคยฝึกกลุ่มกล้ามเนื้อไหนเลย (ข้อมูล
            จริงไม่พอให้ประเมิน ไม่เดาให้ ดู fitnessScoreRecoveryPct ด้านบน) */}
        {/* ทดลอง (ฟีดแบ็ก "ลองเอาไปแทรกของจริง" หลังลองบนหน้า preview /dashboard-concept แล้ว) — แทนที่
            pill Fitness Score/Recovery คู่เดิมด้านบนด้วย HeroGaugeConcept (Twin Cyber Gauge เชื่อมด้วย
            คลื่นพลังงาน) wrapped=false (ไม่มีกรอบการ์ด/พื้นหลังของตัวเอง ฝังในแถว header ตรงๆ) ขนาดวง
            ย่อลงจากหน้า preview (140/124 -> 88/76) ให้พอดีกับความสูง header แถวนี้มากกว่า และคงปุ่มกดเปิด
            FitnessScoreDetailSheet เดิมไว้ผ่าน onFitnessScoreClick (ไม่เสียฟีเจอร์ "กดดูรายละเอียด" ที่
            เพิ่งทำไปก่อนหน้านี้)
            บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจค): gate เดิมตอนเปลี่ยนมาเป็น Twin Gauge เผลอรวม
            `fitnessScoreRecoveryPct != null` เข้ากับเงื่อนไขทั้งบล็อก (เดิมก่อน Twin Gauge, commit
            5a96de3, gate แค่ `fitnessScore &&` ส่วน Recovery pill gate แยกอิสระข้างในอีกที) ทำให้ผู้ใช้
            ที่ไม่มีข้อมูล recovery เลย (บัญชีใหม่/ฝึกแต่คาร์ดิโอ) เสีย Fitness Score widget ทั้งก้อนไปด้วย
            ทั้งที่ fitnessScore คำนวณได้เองอยู่แล้วไม่ต้องพึ่ง recovery — คืน gate เดิม (แค่ fitnessScore)
            แล้วส่ง recoveryPct/recoveryLabel เป็น undefined ถ้ายังไม่มีข้อมูลจริง (HeroGaugeConcept เอง
            อัปเดตให้ 2 props นี้เป็น optional แล้ว — ไม่โชว์วง Recovery แทนที่จะโชว์ค่าสมมติ) */}
        {fitnessScore && (
          <div className="hidden md:flex flex-1 justify-center items-center self-center">
            <HeroGaugeConcept
              fitnessScore={fitnessScore}
              recoveryPct={fitnessScoreRecoveryPct ?? undefined}
              recoveryLabel={fitnessScoreRecoveryPct != null ? recoveryTier(fitnessScoreRecoveryPct).labelEn : undefined}
              fitnessRingSize={88}
              recoveryRingSize={76}
              wrapped={false}
              onFitnessScoreClick={() => setShowFitnessScoreDetail(true)}
            />
            <FitnessScoreDetailSheet
              open={showFitnessScoreDetail}
              onClose={() => setShowFitnessScoreDetail(false)}
              score={fitnessScore}
            />
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          <span
            // v41: "Version 3" — พื้นกรมท่าเดิม (#13233A/#08121F) เปลี่ยนเป็น CARD_GRADIENT_CSS (titanium
            // เดียวกับทั้งแอป) + glow ลดลง (12px/33 -> 8px/1F)
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full text-[12px] text-ink px-3 py-1.5"
            style={{
              border: '1.5px solid transparent',
              backgroundImage: `${CARD_GRADIENT_CSS}, linear-gradient(135deg, ${withAlpha(COLORS.amber, '14')}, ${withAlpha(COLORS.amber, '40')}, ${withAlpha(COLORS.amber, '14')})`,
              backgroundOrigin: 'border-box',
              backgroundClip: 'padding-box, border-box',
              boxShadow: `0 4px 14px rgba(0,0,0,.35), 0 0 8px ${withAlpha(COLORS.amber, '1F')}`,
            }}
          >
            📅 {new Date(today + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <NotificationButton notifications={notifications} />
        </div>
      </div>

      {!data.hasAnyHistory && !bannerDismissed && (
        <div className="lg:col-span-12 lg:order-2">
          <OnboardingBanner onDismiss={handleDismissBanner} />
        </div>
      )}

      {/* body composition snapshot — weight/body fat/skeletal muscle/fat mass/BMI with
          week-over-week deltas, pulled from the same body_metrics rows as the /health page.
          Sits above the fold since it's the first thing a user checks each morning. */}
      <div className="lg:col-span-12 lg:order-3 animate-rise" style={{ animationDelay: '15ms' }}>
        {/* v41: ฟีดแบ็ก "ทำเป็น Version 3 (Minimal Dark Titanium)" — เดสก์ท็อปเคยใช้ชุดสีนีออนอิ่มตัวเต็มที่
            แยกต่างหากจากมือถือ (ผ่าน colorScheme="vibrant") — สลับมาใช้ชุดสี/glow เดียวกับมือถือแล้ว
            (compact ยังเป็น false ตามเดิม — โครงเลย์เอาต์ 5 คอลัมน์ของเดสก์ท็อปไม่กระทบ แค่สี/ความเข้ม glow
            เปลี่ยน) v43: prop colorScheme ตัดออกทั้งหมดแล้ว (ไม่มีจุดไหนใช้ "default" อีกเลย ดู
            BodyMetricsRow.tsx) เหลือแค่ชุดสีเดียวเป็นดีฟอลต์ ไม่ต้องส่ง prop นี้อีกต่อไป
            ฟีดแบ็ก "แถวปุ่มเลือกช่วงเวลากินพื้นที่แค่มุมขวา เหลือพื้นที่ว่างซ้าย-กลาง 80% ก่อนถึงการ์ด" —
            เดสก์ท็อปไม่เคยมีหัวข้อ section เหนือการ์ดชุดนี้เลยตั้งแต่แรก (ต่างจากมือถือที่มี "ภาพรวมร่างกาย"
            อยู่แล้ว) ใส่ title ให้แถว pill selector สมดุลซ้าย-ขวาเหมือนกับที่แก้ฝั่งมือถือ */}
        <BodyMetricsRow title="ภาพรวมร่างกาย" />
      </div>

      {/* ฟีดแบ็ก "Body Composition ควรมี 'Goal Progress' อยู่ใน Dashboard — User ที่มี Goal ต้องตอบได้ว่า
          กำลังไปถึงเป้าหมายหรือยัง" — ใช้ goalProgressPct ตัวเดียวกับหน้า /health (ไม่คำนวณสูตรแยกใหม่)
          โชว์เฉพาะเป้าหมายที่ตั้งไว้จริง+มีข้อมูลปัจจุบันให้เทียบ ไม่โชว์การ์ดเปล่าถ้าไม่มี Goal เลย */}
      {(() => {
        const weightPct =
          data.weightGoalTarget != null && data.bodyMetricsSummary.weight.value != null
            ? goalProgressPct(
                { target_value: data.weightGoalTarget, starting_value: data.weightGoalStart },
                data.bodyMetricsSummary.weight.value,
                data.earliestTrackedWeight
              )
            : null
        const bodyFatPct =
          data.bodyFatGoalTarget != null && data.bodyMetricsSummary.bodyFatPct.value != null
            ? goalProgressPct(
                { target_value: data.bodyFatGoalTarget, starting_value: data.bodyFatGoalStart },
                data.bodyMetricsSummary.bodyFatPct.value,
                data.earliestTrackedBodyFat
              )
            : null
        if (weightPct === null && bodyFatPct === null) return null
        return (
          <div className="lg:col-span-12 lg:order-4 animate-rise" style={{ animationDelay: '18ms' }}>
            {/* ฟีดแบ็ก "Level 2 (Body Goal, Recovery Details, Training This Week) ควรลด visual weight
                ลงจาก Level 1" — Recovery/Training This Week (การ์ดข้างเคียงระดับเดียวกัน) ใช้ bg-surface2/40
                ไม่มี shadow-elevated มาตั้งแต่ v41 ("การ์ดรอง ไม่ใช่ Hero") แต่การ์ดนี้หลุดไม่ได้ปรับตาม เลย
                ดูหนักกว่า 2 ใบข้างๆ ที่ควรเป็นน้ำหนักภาพเท่ากัน — ปรับให้ตรงกัน */}
            <div className="rounded-card bg-surface2/40 border border-line px-4 py-3.5">
              <p className="text-[12px] tracked uppercase text-muted mb-3">Body Goal</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {weightPct !== null && (
                  <div>
                    {/* ฟีดแบ็ก "Label ของ Card ควร Contrast ต่ำกว่าตัวเลขประมาณ 1 ระดับ (Label → Value
                        → Change ไหลเป็นลำดับ)" — เดิมสลับกัน: label 'น้ำหนัก' ใช้ text-ink (สว่าง) ส่วน
                        ค่าจริง '66.6 → 70.0 kg' ใช้ text-muted (จาง) ทั้งที่ตัวเลขควรเด่นกว่า สลับให้ label
                        จางลง (text-muted) และค่าจริงเด่นขึ้น (text-ink + font-semibold) */}
                    <div className="flex items-baseline justify-between">
                      <p className="text-xs text-muted">น้ำหนัก</p>
                      <p className="text-[12px] font-mono font-semibold text-ink">
                        {toDisplay(data.bodyMetricsSummary.weight.value as number).toFixed(1)} → {toDisplay(data.weightGoalTarget as number).toFixed(1)} {unit}
                      </p>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface2 overflow-hidden mt-1.5">
                      <AnimatedBarFill pct={Math.max(0, Math.min(100, weightPct))} color={COLORS.amber} />
                    </div>
                    <p className="text-[12px] text-muted mt-1">
                      {goalProgressLabel(
                        weightPct,
                        `${Math.abs(toDisplay(data.weightGoalTarget as number) - toDisplay(data.bodyMetricsSummary.weight.value as number)).toFixed(1)} ${unit}`
                      )}
                    </p>
                    {/* ฟีดแบ็ก "อยากเห็นคาดว่าจะถึงเป้าหมายเมื่อไหร่" — โชว์เฉพาะตอนข้อมูลนิ่งพอจริงๆ
                        (ดูเกณฑ์ใน estimateGoalEtaWeeks) null = ไม่โชว์บรรทัดนี้เลย ไม่เดา/ไม่ประมาณคร่าวๆ */}
                    {data.weightEtaWeeks !== null && (
                      <p className="text-[12px] mt-0.5" style={{ color: COLORS.amber }}>
                        🎯 คาดว่าจะถึงเป้าหมายใน ~{data.weightEtaWeeks} สัปดาห์
                      </p>
                    )}
                  </div>
                )}
                {bodyFatPct !== null && (
                  <div>
                    {/* เหตุผลเดียวกับบล็อกน้ำหนักด้านบน — label 'Body Fat' จางลง, ค่าจริงเด่นขึ้น */}
                    <div className="flex items-baseline justify-between">
                      <p className="text-xs text-muted">Body Fat</p>
                      <p className="text-[12px] font-mono font-semibold text-ink">
                        {(data.bodyMetricsSummary.bodyFatPct.value as number).toFixed(1)}% → {(data.bodyFatGoalTarget as number).toFixed(1)}%
                      </p>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface2 overflow-hidden mt-1.5">
                      <AnimatedBarFill pct={Math.max(0, Math.min(100, bodyFatPct))} color={COLORS.moss} />
                    </div>
                    <p className="text-[12px] text-muted mt-1">
                      {goalProgressLabel(
                        bodyFatPct,
                        `${Math.abs((data.bodyFatGoalTarget as number) - (data.bodyMetricsSummary.bodyFatPct.value as number)).toFixed(1)}%`
                      )}
                    </p>
                    {data.bodyFatEtaWeeks !== null && (
                      <p className="text-[12px] mt-0.5" style={{ color: COLORS.moss }}>
                        🎯 คาดว่าจะถึงเป้าหมายใน ~{data.bodyFatEtaWeeks} สัปดาห์
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* PR ล่าสุด / ฝึกมากสุดสัปดาห์นี้ ย้ายไปอยู่ในกระดิ่งแจ้งเตือนที่ header แล้ว (ดู NotificationButton)
          แทนที่จะกินพื้นที่แถวเต็มความกว้างตรงนี้ */}

      {/* Cards cluster (lg+): hero, recovery, weekly goal, AI coach, quick actions, heatmaps.
          This is its own nested grid (lg:grid, not lg:contents) so row numbers below (row-start-1..4)
          are LOCAL to this cluster — mixing an explicit-column item (AI Coach, col-start-10) with
          fully-automatic items (quick actions row, heatmaps) in the outer grid's auto-placement
          flow was leaving phantom empty rows before AI Coach and before the quick-actions row
          (an auto-placement cursor quirk). Explicit col-start / row-start classes on every item
          below sidestep that entirely — placement no longer depends on auto-placement order. */}
      <div className="space-y-6 lg:space-y-0 lg:col-span-12 lg:order-5 lg:grid lg:grid-cols-12 lg:gap-4 lg:items-start">
      {/* left column (lg+): today's workout, quick start, muscle heatmap. */}
      <div className="space-y-6 lg:space-y-0 lg:contents">
      {/* card 1: hero — today's workout. Sets the visual tone: everything else below is
          intentionally quieter (no shadow-hero, smaller type) so the eye has exactly one
          obvious place to land first. */}
      <div
        // v49: ฟีดแบ็ก "แต่ละ Card ใช้ Radius คนละแบบ" — เดิม rounded-lg (8px) ต่างจาก PremiumCard/
        // AICoachCompactCard/WeeklyVolume ที่ 24px มาก เปลี่ยนเป็น rounded-card (token เดียวกัน) ให้
        // มุมโค้งตรงกันทั้งแอป — border/shadow-hero ยังคงไว้เหมือนเดิม (จุดเด่นเฉพาะ Hero การ์ดเดียว)
        className={`relative rounded-card border border-amber/30 shadow-hero overflow-hidden hero-card-cq lg:col-start-1 lg:col-span-5 lg:row-start-1 ${
          totals.entryCount === 0 ? 'animate-hero-enter' : 'animate-rise'
        }`}
        style={{
          // v41: "Version 3 (Minimal Dark Titanium)" — glow เดิม 14px/40 alpha เข้มไป ลดลงให้ Hero
          // ยังเด่นอยู่ (การ์ดเดียวที่ควรมี glow ตามกฎ "Hero มีแค่ใบเดียว") แต่ไม่จัดจ้านเท่าเดิม
          boxShadow: `0 0 8px ${withAlpha(COLORS.amber, '26')}, 0 0 1px ${withAlpha(COLORS.amber, '66')}`,
          ...(totals.entryCount === 0 ? undefined : { animationDelay: '60ms' }),
        }}
        onMouseMove={handleHeroMouseMove}
        onMouseLeave={handleHeroMouseLeave}
      >
        {/* v45: ฟีดแบ็ก "ภาพคนดูธรรมดา ใช้ Dumbbell/Orange Spark จะเข้ากับ Theme มากกว่า" — เดิมเป็นรูปถ่าย
            จริง (/images/workout-hero.jpg) คนละภาษากับวัสดุไทเทเนียม/แสงพลังงานส้มที่การ์ดอื่นทั้งแอปใช้
            เปลี่ยนเป็น CSS/SVG ล้วนตอนนั้น (เงาดัมเบล + orange spark) แทนรูปถ่าย
            v47: ฟีดแบ็ก "Dumbbell Blur เยอะไป (~70%) จนแทบไม่รู้ว่าเป็นอะไร ผมว่าประมาณ 40% ก็พอ" — ปรับ
            opacity/พื้นที่ตาม "Option A: ใช้ Dumbbell เต็มพื้นที่ Ring ซ้อนอยู่มุมขวาล่าง แบบ Apple Fitness"
            v52: วิเคราะห์มอคอัพหลายชุด (ฉาก gym เต็ม + คำโปรยอังกฤษ vs. product shot ดัมเบลพื้นดำ) แล้วให้
            คะแนน product shot สูงสุด (ตรงกับทิศทาง CSS เดิมที่สุด แค่เป็นรูปถ่ายจริงแทนเงา SVG) ผู้ใช้อัปโหลด
            รูปที่เลือกมาที่ public/images/today-workout-hero-dumbbell.png — เปลี่ยนจากเงา SVG + orange spark
            กลับมาเป็นรูปถ่ายจริงอีกครั้ง (คนละจุดกับ workout-hero.jpg เดิมที่ถูกตัดไปเพราะ "เป็นภาพคนดู
            ธรรมดา" — รูปนี้เป็น product shot ดัมเบลพื้นดำ ไม่มีคน ตรงกับที่ฟีดแบ็กบอกว่าอยากได้ตั้งแต่ v45)
            ยังคง gradient fade ซ้ายให้ตัวหนังสืออ่านง่ายเหมือนเดิมทุกประการ วางรูปเป็นชั้นล่างสุด แล้ว
            gradient ทับอยู่ชั้นบน (สลับจากเดิมที่ gradient เป็นพื้นแล้ว SVG ลอยทับ เพราะตอนนี้รูปคือเนื้อหา
            หลัก ไม่ใช่ของตกแต่งอีกต่อไป)
            v53: ฟีดแบ็ก "จอ 14 นิ้ว รูปดัมเบลเห็นไม่ครบ แต่จอ 24 นิ้วไม่ต้องแก้ไขอะไร" — ความสูงการ์ดนี้
            ค่อนข้างคงที่ (คุมด้วยเนื้อหาตัวหนังสือ/ring ไม่ใช่ %) ขณะที่ความกว้างการ์ดแปรผันมากตาม viewport
            (12-col grid) ทำให้กรอบรูป (w-2/3 เดิม) ที่ 14" แคบกว่ามาก อัตราส่วนภาพเลยแคบลงจนเห็นดัมเบลได้
            น้อยกว่าที่ 24" มาก (วัดจริง: การ์ดกว้าง ~431px ที่ viewport 1280px ให้กรอบรูป aspect ~1.84 เทียบ
            กับ ~2.98 ที่การ์ดกว้าง ~697px ของ viewport 1920px) — ใช้ container query (.hero-card-cq ใน
            globals.css) ขยายกรอบรูปเป็น 92% เฉพาะตอนการ์ดแคบกว่า 550px เท่านั้น ให้เห็นดัมเบลครบขึ้นชัดเจน
            จอ 24" (การ์ดกว้างเกิน threshold มาก) ไม่โดนกฎนี้เลย หน้าตาเดิม 100%
            v54: ฟีดแบ็ก "ภาพดัมเบลคมเกินไป เหมือนรูปสินค้า แย่งความสนใจจากข้อความ" — เพิ่ม blur(1.5px) +
            contrast(.92) บนตัวรูป และรวม overlay มืดแนวตั้ง (บาง 18-32%) เข้ากับ gradient เดิม ให้รูปกลาย
            เป็น "บรรยากาศพื้นหลัง" แทนที่จะเป็น product shot คมกริบ — ลดขนาดดัมเบลลง ~8-10% ผ่าน
            transform: scale(.92) (จำเป็นต้องมี overflow-hidden เพิ่มที่กรอบรูปกันรูปสเกลแล้วล้นออกนอก
            กรอบตอน blur) + transform-origin ขยับจุดหมุนไปทาง 60% 42% ให้พื้นที่ว่างที่เพิ่มมาไปอยู่ฝั่งขวา/
            ล่างเป็นหลัก (ไม่ดันชนข้อความฝั่งซ้าย ตามที่ขอ "บาลานซ์กับข้อความ")
            v55: ฟีดแบ็ก "ภาพยังอยู่กลางเกินไป อยากเลื่อนไปทางขวาอีก 8-10%" — objectPosition 68% -> 76%
            (เลื่อนจุดโฟกัสของรูปไปทางขวาเพิ่ม ให้พื้นที่ว่างฝั่งซ้าย ซึ่งเป็นที่อยู่ของ panel ข้อความ
            "หายใจ" มากขึ้นตามที่ขอ) — "ปรับแสงของดัมเบล ตอนนี้ขาวไป อยากให้ warm ขึ้น (4200K)" — เพิ่ม
            sepia(.18) saturate(1.15) hue-rotate(-6deg) บน filter เดิม (blur/contrast คงไว้) ให้โทนสีรูป
            อุ่นขึ้นไปทางเดียวกับสีอำพัน (accent สีเดียวที่ใช้ทั้งแอป) แทนแสงขาวเย็นเดิม
            v56: ฟีดแบ็ก "ตอนนี้ blur+มืด+contrast ต่ำ เลยกลายเป็นเหมือน Texture มากกว่า Hero Image อยากได้
            ความรู้สึก 'วันนี้คือวันลุย' ไม่ใช่ 'มีดัมเบลอยู่'" — v54/v55 กดหนักไปฝั่ง "กลืนเป็นพื้นหลัง" จน
            รายละเอียดหาย ปรับกลับ: blur 1.5px -> 0.4px, contrast .92 -> 1.05, brightness .98 -> 1.02
            (คมและสว่างขึ้นชัดเจน เห็นลาย/พื้นผิวดัมเบลจริง) overlay มืดแนวตั้งลดจาก .18/.32 -> .08/.18
            (บางลงเกินครึ่ง) glow อำพันเดิม (radial 88% 28%) เพิ่ม alpha .16 -> .28 (~75%) ให้ความรู้สึก
            "แสงพลังงาน" เด่นขึ้นแทนที่จะจมอยู่ใต้ความมืด — เพิ่มเลเยอร์ "rim light" ใหม่ (เส้นไล่สีอำพันแนวตั้ง
            บางๆ ตรงรอยต่อระหว่างรูปกับ gradient fade ซ้าย, mixBlendMode: screen ให้เรืองแสงจริงไม่ใช่ทาสีทับ)
            จำลองขอบแสงกระทบดัมเบล ให้มีมิติมากกว่าแค่ภาพแบน
            v59: ฟีดแบ็ก "รูปดัมเบลยังนิ่ง อยากเพิ่มฝุ่นลอย/particle/แสงสะท้อน/flare นิดเดียว ไม่ถึงกับ Gaming
            แต่เหมือนถ่ายในสตูดิโอ" — เพิ่มเลเยอร์ specular flare (เส้นทแยงบางๆ ไล่ขาว/ครีมอ่อนๆ mixBlendMode:
            overlay จำลองแสงสะท้อนผิวโลหะแบบสตูดิโอ ไม่ใช่แสง flare แบบเกม) วางทับรูปแต่ใต้ overlay มืด/glow
            เดิม */}
        <div className="absolute inset-0 bg-surface overflow-hidden">
          <div className="absolute inset-y-0 right-0 w-full sm:w-2/3 hero-image-box overflow-hidden">
            <div className="absolute inset-0" style={{ transform: 'scale(0.92)', transformOrigin: '60% 42%' }}>
              <Image
                src="/images/today-workout-hero-dumbbell.png"
                alt=""
                fill
                className="object-cover"
                style={{
                  objectPosition: '76% 45%',
                  // v62: ฟีดแบ็ก "ภาพดัมเบลยังคมกว่า Card ฝั่งข้อความมาก สายตาโดนดึงไปที่ดัมเบลก่อน DAY 3/
                  // LEGS อยากได้ Text เป็น Hero รูปเป็น Supporting แบบ Apple" — ลด contrast ~10% (1.05 ->
                  // 0.95) + เพิ่ม blur เล็กน้อย (0.4px -> 0.7px, "sharpness ลดนิดเดียว") ให้รูปถอยไปเป็น
                  // บรรยากาศพื้นหลังชัดเจนขึ้น ไม่แย่งสายตาจากข้อความ — saturate ลดตามสัดส่วนเดียวกันเล็กน้อย
                  // (1.25 -> 1.2) กัน contrast ที่ลดลงทำให้สีดูซีดขึ้นสวนทาง (คงความอุ่นไว้) brightness 1.02 ->
                  // 1.0 (เดิมชดเชย overlay มืดที่ตัดไปเยอะแล้วจาก v56 ไม่จำเป็นต้องชดเชยเพิ่มอีก)
                  filter: 'blur(0.7px) contrast(0.95) sepia(0.15) saturate(1.2) hue-rotate(-6deg) brightness(1.0)',
                }}
                priority
              />
            </div>
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `linear-gradient(90deg, ${withAlpha(COLORS.amber, '00')} 0%, ${withAlpha(COLORS.amber, '55')} 8%, transparent 22%)`,
                mixBlendMode: 'screen',
              }}
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'linear-gradient(115deg, transparent 38%, rgba(255,255,255,.10) 47%, rgba(255,244,224,.16) 50%, rgba(255,255,255,.08) 53%, transparent 62%)',
                mixBlendMode: 'overlay',
              }}
              aria-hidden="true"
            />
            {/* v61: ฟีดแบ็ก "พื้นที่หลังดัมเบลยังโล่ง อยากเพิ่มฝุ่น/particle/แสง/หมอกบางๆ ให้หลังดัมเบล แบบ
                Nike/Apple Fitness/Whoop" — โซนล่างขวาของรูป (หลัง/ใต้ดัมเบล) ค่อนข้างว่างเปล่าหลังผ่าน
                overlay มืด/vignette หลายรอบ เพิ่มหมอกอุ่นบางๆ (radial ต่ำมาก 10% alpha) เติมเต็มโซนนั้น
                โดยเฉพาะ ไม่ใช่ครอบทั้งรูป */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 70% 60% at 82% 72%, rgba(255,180,90,.10), transparent 75%)' }}
              aria-hidden="true"
            />
          </div>
          <div
            className="absolute inset-y-0 right-0 w-full sm:w-2/3 hero-gradient-box"
            style={{
              // v58: ฟีดแบ็ก "ใส่ glow สีส้มอ่อนด้านหลังดัมเบลนิดเดียว ไม่ใช่ให้เห็นเป็นวง แต่ให้รู้สึกว่า
              // 'แสงกำลังตกที่ดัมเบล'" — glow เดิม (v56, ellipse 65%/55% ค่อนข้างกลม + fade ที่ 62% ค่อนข้าง
              // แข็ง) เริ่มอ่านเป็นรูปทรงวง/blob ชัดเจนไป — ขยาย ellipse ให้ใหญ่/รีกว่าเดิมมาก (95%/80%,
              // ไม่กลมแบบเดิม) ลด alpha (.28 -> .18) และยืด fade ให้นุ่มมาก (62% -> 82%) ให้ไม่มีขอบชัดเจน
              // ตำแหน่งศูนย์กลางยังอยู่บริเวณเดิม (มุมบนขวา เหนือหัวดัมเบล) ตามภาพร่างที่ให้มา (ประกาย/แสงอยู่
              // เหนือวัตถุ) — อ่านเป็น "แสงกระจายอุ่นๆ ตกกระทบ" แทนที่จะเป็นวงเรืองแสงลอยอยู่ต่างหาก
              backgroundImage: [
                'linear-gradient(180deg, rgba(7,9,13,.08), rgba(7,9,13,.18))',
                'radial-gradient(ellipse 95% 80% at 85% 25%, rgba(255,154,22,.18), transparent 82%)',
                'linear-gradient(90deg, rgba(28,31,36,1) 0%, rgba(28,31,36,0.55) 35%, rgba(28,31,36,0.15) 70%)',
              ].join(', '),
            }}
          />
          {/* ฟีดแบ็ก "Today's Workout ใหญ่เกินไปตอนยังไม่มีโปรแกรม — Visual Weight > Information Value"
              (ยืนยันจากสกรีนช็อตจริง — รูปดัมเบลยังเด่นมากแม้เนื้อหาจริงมีแค่ '0 Exercises') — ไม่แตะสูตรภาพ/
              filter/glow ที่ผ่านการปรับละเอียดมาหลายรอบเลย (เสี่ยงทำลายงานที่ verify แล้ว) แต่เพิ่ม scrim มืด
              อีกชั้นทับเฉพาะ State B (ยังไม่มีโปรแกรม + ยังไม่ได้เทรนวันนี้) ให้รูปถอยเป็นพื้นหลังมากขึ้นตอนที่
              เนื้อหาจริงมีน้อย — State A/C (มีโปรแกรม/เทรนเสร็จแล้ว) ไม่โดนกฎนี้ ยังเห็นรูปเต็มที่เหมือนเดิม
              รอบถัดมา: ฟีดแบ็ก "ลด opacity ลงอีกประมาณ 10-20% ให้ข้อความเป็นพระเอก" (เห็นจากสกรีนช็อตจริง
              หลังรอบแรกแล้วว่ายังไม่พอ) — เพิ่ม alpha .38 -> .50 (+~30% เชิงสัมพัทธ์ อยู่ในช่วงที่ขอ) */}
          {!scheduledDay && !todayCompleted && (
            <div className="absolute inset-y-0 right-0 w-full sm:w-2/3 pointer-events-none" style={{ backgroundColor: 'rgba(9,10,12,.50)' }} />
          )}
          {/* v48: ฟีดแบ็ก "โซน Dumbbell (~35% ของการ์ด) มีแค่รูปดัมเบลอย่างเดียว อยากเพิ่ม Glow/Particle
              เบาๆ ให้ดูมีชีวิต" — จุดกระพริบเล็กๆ กระจายรอบไอคอน (เทคนิคเดียวกับ "Particles" ใน
              TodaysWorkoutCompactCard.tsx ขนาด/ตำแหน่งไม่เท่ากันจำลองประกายลอยในอากาศ ไม่ใช่ pattern
              ซ้ำเป๊ะ) — สีทองอุ่นเดียวกับ spark SVG เดิม (#FFB84A) ให้เป็นชุดสีเดียวกัน ยังใช้ได้ดีทับรูปถ่าย
              จริง เพราะรูปที่เลือกมามีฝุ่นกระจายอยู่แล้ว เข้ากับธีมประกายลอยในอากาศพอดี
              v54: ฟีดแบ็ก "เพิ่มฝุ่นหรือ Spark ไม่ต้องเยอะ 2-3 จุดพอ จะดู Cinematic แบบ Nike/Under Armour" —
              เดิมมี 5 จุดเล็กคมเท่ากันหมด (sharp dot ล้วน) ลดเหลือ 3 จุด ผสม 2 แบบ: ฝุ่น/chalk (วงกลม
              เบลอนุ่มๆ ใหญ่กว่า ให้ความรู้สึกเป็นละอองฝุ่นลอย ไม่ใช่จุดคมแข็ง) 2 จุด + spark สว่างคมจุดเดียว
              (คงกลิ่นอายแสงระยิบเดิมไว้ 1 จุด ไม่ให้หายไปทั้งหมด)
              v55: ฟีดแบ็ก "เพิ่ม particle อีกนิด: ฝุ่นทอง 2-3 จุด + bokeh เล็กๆ เฉพาะบริเวณบนของดัมเบล" —
              เพิ่มอีก 2 จุด (bokeh วงใหญ่เบลอจาง + ฝุ่นทองเล็ก) รวมเป็น 5 ทั้งหมด แต่ทุกจุดใหม่กระจุกอยู่
              โซนบนของดัมเบล (top ~10-22%) ตามที่ขอเจาะจง ไม่ใช่กระจายทั่วการ์ดเหมือนเซ็ตเดิม
              v56: ฟีดแบ็ก "particle/dust/orange glow เพิ่มความรู้สึก 'วันนี้คือวันลุย'" — เพิ่มอีก 2 จุด
              (bokeh กลางเฟรม + spark ฝั่งขวาล่าง) รวมเป็น 7 จุด ให้ภาพดูมีพลัง/เคลื่อนไหวมากขึ้น
              v59: ฟีดแบ็ก "รูปดัมเบลยังนิ่ง อยากเพิ่มฝุ่นลอย นิดเดียว" — เพิ่ม animation ลอยเบาๆ (translate
              ไม่กี่ px, 6-8.5s/รอบ) ให้ 3 จุดที่เบลอนุ่มอยู่แล้ว (ไม่ใส่กับจุด spark คมๆ กันดูรบกวนเกินไป)
              — เพิ่ม 2 จุดฝุ่นจางมากๆ (opacity .22-.28) ที่ฝั่งซ้ายของการ์ด (นอกกรอบรูปเดิม เข้าไปในโซน
              ข้อความ) ให้ทั้งการ์ดรู้สึกเป็นฉากเดียวกัน ไม่ใช่รูปกับข้อความคนละที่ (ดู "การ์ดกับรูปแยกกัน" ด้านล่าง) */}
          <div
            className="absolute rounded-full pointer-events-none hero-dust-float-a"
            style={{ left: '58%', top: '16%', width: 22, height: 22, background: 'radial-gradient(circle, rgba(255,200,120,.22), transparent 70%)', filter: 'blur(3px)' }}
            aria-hidden="true"
          />
          <div
            className="absolute rounded-full pointer-events-none hero-dust-float-b"
            style={{ left: '68%', top: '10%', width: 10, height: 10, background: 'radial-gradient(circle, rgba(255,244,224,.35), transparent 70%)', filter: 'blur(1.5px)' }}
            aria-hidden="true"
          />
          <div
            className="absolute rounded-full pointer-events-none"
            style={{ left: '86%', top: '22%', width: 14, height: 14, background: 'radial-gradient(circle, rgba(255,184,74,.28), transparent 70%)', filter: 'blur(2px)' }}
            aria-hidden="true"
          />
          <div
            className="absolute rounded-full pointer-events-none hero-dust-float-c"
            style={{ left: '50%', top: '45%', width: 12, height: 12, background: 'radial-gradient(circle, rgba(255,184,74,.18), transparent 70%)', filter: 'blur(2px)' }}
            aria-hidden="true"
          />
          <span
            className="absolute rounded-full pointer-events-none"
            style={{ left: '73%', top: '14%', width: 2.5, height: 2.5, background: '#FFF4E0', opacity: 0.85, boxShadow: '0 0 5px 1.5px rgba(255,184,74,.7)' }}
            aria-hidden="true"
          />
          <span
            className="absolute rounded-full pointer-events-none"
            style={{ left: '80%', top: '58%', width: 2, height: 2, background: '#FFF4E0', opacity: 0.6, boxShadow: '0 0 4px 1px rgba(255,184,74,.55)' }}
            aria-hidden="true"
          />
          <span
            className="absolute rounded-full pointer-events-none"
            style={{ left: '92%', top: '38%', width: 2, height: 2, background: '#FFF4E0', opacity: 0.55, boxShadow: '0 0 4px 1px rgba(255,184,74,.5)' }}
            aria-hidden="true"
          />
          <span
            className="absolute rounded-full pointer-events-none hero-dust-float-d"
            style={{ left: '4%', top: '30%', width: 2, height: 2, background: '#FFF4E0', opacity: 0.28, boxShadow: '0 0 4px 1px rgba(255,184,74,.3)' }}
            aria-hidden="true"
          />
          <span
            className="absolute rounded-full pointer-events-none"
            style={{ left: '-2%', top: '68%', width: 1.5, height: 1.5, background: '#FFF4E0', opacity: 0.22, boxShadow: '0 0 3px 1px rgba(255,184,74,.25)' }}
            aria-hidden="true"
          />
          {/* v61: อีก 3 จุดเติมโซนล่างขวาที่ว่างเปล่า (ดูคอมเมนต์หมอกด้านบน) — bokeh ใหญ่จาง 1 จุด + spark
              เล็ก 2 จุด ให้สอดคล้องกับสัดส่วน bokeh:spark ของคลัสเตอร์เดิมด้านบน */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{ left: '95%', top: '75%', width: 16, height: 16, background: 'radial-gradient(circle, rgba(255,190,110,.2), transparent 70%)', filter: 'blur(2.5px)' }}
            aria-hidden="true"
          />
          <span
            className="absolute rounded-full pointer-events-none"
            style={{ left: '88%', top: '80%', width: 2, height: 2, background: '#FFF4E0', opacity: 0.5, boxShadow: '0 0 4px 1px rgba(255,184,74,.45)' }}
            aria-hidden="true"
          />
          <span
            className="absolute rounded-full pointer-events-none"
            style={{ left: '78%', top: '85%', width: 1.5, height: 1.5, background: '#FFF4E0', opacity: 0.4, boxShadow: '0 0 3px 1px rgba(255,184,74,.4)' }}
            aria-hidden="true"
          />
        </div>

        {/* v59: ฟีดแบ็ก "Card กับรูปยังแยกกัน เหมือนเอา Card มาวางทับรูป ไม่ได้เชื่อมกัน อยากได้ vignette ให้
            Card รู้สึกลอยอยู่ในฉากเดียวกัน" — เพิ่ม vignette ครอบทั้งการ์ด (ไม่ใช่แค่ครึ่งรูป) มืดขอบ 4 มุม
            เบาๆ เท่ากันทั้งใบ ให้ฝั่งข้อความ (ซ้าย) กับฝั่งรูป (ขวา) ถูกมืดขอบแบบเดียวกัน อ่านเป็นภาพถ่ายเดียว
            ที่มีการ์ด (กระจก) ลอยอยู่ข้างใน แทนที่จะเป็น 2 พื้นผิวแยกกันชัดเจน — วางไว้เหนือทุกเลเยอร์ของภาพ/
            gradient เดิมแต่ใต้ ring/ข้อความ (pointer-events-none, ไม่มี z ระบุ = อยู่ในลำดับ DOM ปกติ ก่อน
            ring/ข้อความที่มี z-10 อยู่แล้ว) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 130% 130% at 50% 45%, transparent 55%, rgba(0,0,0,.30) 100%)' }}
          aria-hidden="true"
        />

        {/* v62: ฟีดแบ็ก "อยากได้ Warm Glow ด้านหลังข้อความแทน ให้ Text เป็น Hero รูปเป็น Supporting" —
            วงรีเรืองแสงอำพันนุ่มๆ วางไว้หลังโซนข้อความ (ซ้าย) โดยเฉพาะ ทะลุผ่านแผ่นกระจกกึ่งโปร่งแสง
            (rgba(18,20,26,.55) ด้านล่าง) ออกมาเป็นไอความอุ่นรอบๆ panel แทนที่จะให้ข้อความลอยอยู่บนพื้นเรียบ
            เฉยๆ — วางไว้ก่อนเลเยอร์ ring/ข้อความ (ต่ำกว่า z-10) ให้กระจกทับอยู่ด้านบนเสมอ */}
        <div
          className="absolute pointer-events-none"
          style={{ top: 0, bottom: 0, left: 0, width: 280, background: 'radial-gradient(ellipse 90% 80% at 20% 45%, rgba(255,170,60,.24), transparent 75%)' }}
          aria-hidden="true"
        />

        {/* v46: "Titanium Reflection" — จุดสว่างจางๆ ตามตำแหน่งเมาส์ (เขียน background ตรงผ่าน ref ใน
            handleHeroMouseMove ด้านบน ไม่ผ่าน React state) วางไว้เหนือชั้นวัสดุพื้นแต่ใต้เนื้อหา (z-10) */}
        <div ref={heroSpotlightRef} className="absolute inset-0 pointer-events-none" aria-hidden="true" />

        {/* v47: "Option A" — Ring ลอย absolute มุมขวาล่าง ซ้อนทับบน Dumbbell background แบบ Apple Fitness
            hero (เดิมอยู่เป็น flex sibling ข้างตัวหนังสือ ดันเลย์เอาต์ให้ Dumbbell เหลือพื้นที่แคบ) —
            glow เดิม (AMBER) คงไว้ผ่าน filter drop-shadow เดียวกับวงอื่นๆ ในหน้า ให้เข้าธีม
            v48: ฟีดแบ็ก "Ring ยังเด่นไปนิด สายตาไปที่ Ring ก่อนแทนที่จะไป DAY 3 / LEGS อยากลดประมาณ
            10-15%" — 100 -> 87 (-13%) strokeWidth ลดตามสัดส่วนเดียวกัน 8 -> 7
            v54: ฟีดแบ็ก "วงกลม 100% ดูลอย อยากให้มี Glow จากพื้นหรือ Reflection จางๆ เหมือน HUD" — ลองทำ
            reflection จริง (ring พลิกกลับแนวตั้งวางใต้ตัวจริง + mask ไล่จาง) ก่อน แต่ GoalRing render
            ตัวเลข "% + label" อยู่กลางวงเสมอ พอพลิกกลับแล้วข้อความอ่านไม่ออกกลายเป็นเงาตัวหนังสือเบลอๆ
            ดูเหมือนจุดบกพร่องมากกว่าลูกเล่น (ตรวจด้วยสกรีนช็อตซูม) — ตัดออก เหลือแค่วงรีเรืองแสงอำพันเบลอ
            กว้างวางอยู่ใต้/หลัง ring จำลองแสงตกกระทบพื้นผิวการ์ดเพียงอย่างเดียว (ไม่มีตัวอักษรให้พลิกผิด
            รูปทรง) ก็ให้ความรู้สึก "วางอยู่บนพื้นผิว" มากขึ้นกว่าเดิมแล้วโดยไม่เสี่ยงเรื่อง readability
            v55: ฟีดแบ็ก "วง 100% สวยแล้ว แต่ถ้าทำให้เหมือน HUD อีกนิด เช่น outer ring หมุนช้าๆ + จุดเล็กๆ
            วิ่งรอบวง จะดู Premium มาก" — เพิ่มอีก 2 เลเยอร์ตกแต่งล้วนๆ (ไม่แตะ GoalRing/ตรรกะคำนวณ %
            เดิมเลย): วงประ (dashed) รัศมีกว้างกว่า ring จริงเล็กน้อยหมุนช้าๆ รอบตัวเอง (8s/รอบ, .hud-outer-
            ring ใน globals.css) จำลองกรอบ HUD + จุดสว่างเล็กดวงเดียวโคจรรอบ ring (4s/รอบ, .hud-bead-orbit)
            ทั้งคู่ pointer-events-none และอยู่ z ต่ำกว่า ring จริง (z-10) ไม่บังคลิก/ไม่ทับตัวเลข %
            v56: ฟีดแบ็ก "Today's Workout Ring ค่อนข้างใหญ่ ลดลงประมาณ 15% จะบาลานซ์กว่า เพราะพระเอกของ
            การ์ดคือ DAY 3 / LEGS ไม่ใช่วงกลม" — 87 -> 74 (-15%, วิธีคิดแบบเดียวกับ v48 ที่เคยลด 100 -> 87
            มาก่อน) strokeWidth ตามสัดส่วนเดียวกัน 7 -> 6 — HUD dashed ring/bead orbit (v55) ปรับขนาดตาม
            ring จริงให้ยังพอดีรอบวงเหมือนเดิม (93 -> 80, คงระยะห่างจาก ring จริง +6px เท่าเดิม)
            v57: ฟีดแบ็ก "ยังรู้สึกใหญ่กว่าที่ควรนิดเดียว ลดอีกประมาณ 10-15%" — 74 -> 64 (-13%, วิธีคิด
            เดียวกันต่อเนื่อง) strokeWidth ตามสัดส่วน 6 -> 5 — HUD outer ring/bead orbit ตามขนาดใหม่ (80 ->
            70, คงระยะห่าง +6px เท่าเดิม) — ที่ 64px ตัว label "ความพร้อม" (ฟอนต์ text-[9px] คงที่ใน GoalRing
            ไม่ผูกกับ size) เริ่มกว้างเกินเส้นผ่านศูนย์กลางวงจริง ล้นทับเส้นวง (ตรวจด้วยสกรีนช็อตซูม) — ใช้
            GoalRing.label แบบ ReactNode (เพิ่งขยายรองรับจาก v56) ส่ง span ฟอนต์เล็กลงเฉพาะจุดนี้แทน string
            เดิม (text-[9px] -> text-[7px]) ไม่กระทบ instance อื่นของ GoalRing ที่ยังพอดีที่ขนาดเดิมอยู่แล้ว
            v58: ฟีดแบ็ก "ตอนนี้เกือบชนขอบล่าง ขยับขึ้นอีกนิดประมาณ 8px จะหายใจมากขึ้น" — ขยับทั้งชุด (glow
            พื้น, HUD outer ring, bead orbit, ring จริง) ขึ้นพร้อมกัน +8px คงระยะห่างสัมพัทธ์ระหว่างกันทุกจุด
            เท่าเดิมทุกประการ (bottom-4 -> bottom-6 ของ ring จริง/bead orbit, -14 -> -6 / -3 -> 5 ของ glow/
            outer ring ตามกัน) ไม่แตะแกน right เลย เพราะฟีดแบ็กพูดถึงแค่แนวตั้ง */}
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: -6,
            right: -10,
            width: 140,
            height: 50,
            background: `radial-gradient(ellipse 55% 100% at 50% 50%, ${withAlpha(COLORS.amber, '4D')}, transparent 72%)`,
            filter: 'blur(3px)',
          }}
          aria-hidden="true"
        />
        <div
          className="absolute rounded-full pointer-events-none hud-outer-ring"
          style={{ bottom: 5, right: -3, width: 70, height: 70, border: `1px dashed ${withAlpha(COLORS.amber, '40')}` }}
          aria-hidden="true"
        />
        <div className="absolute bottom-6 right-4 pointer-events-none hud-bead-orbit" style={{ width: 64, height: 64 }} aria-hidden="true">
          <span
            className="absolute rounded-full"
            style={{ left: '50%', top: -1, width: 4, height: 4, transform: 'translateX(-50%)', background: '#FFF4E0', boxShadow: '0 0 6px 2px rgba(255,184,74,.8)' }}
          />
        </div>
        {/* v60: ฟีดแบ็ก "วงแหวนตอนนี้ดูดีแล้ว แต่ถ้า Glow เบาลงอีก 10% จะดูแพงขึ้น (Apple ชอบทำ Glow บางมาก)"
            — drop-shadow alpha '40' (25.1%) ลด ~10% เชิงสัมพัทธ์ -> '3A' (22.7%) */}
        <div className="absolute bottom-6 right-4 z-10" style={{ filter: `drop-shadow(0 0 6px ${withAlpha(COLORS.amber, '3A')})` }}>
          <GoalRing
            pct={progressPct ?? (totals.entryCount > 0 ? 100 : 0)}
            size={64}
            strokeWidth={5}
            color={COLORS.amber}
            label={<span className="text-[7px]">ความพร้อม</span>}
            ariaLabel="ความพร้อมของวันนี้"
            glow
          />
        </div>

        {/* ฟีดแบ็ก "Today's Workout ใหญ่เกินไปตอนยังไม่มีโปรแกรม — Visual Weight > Information Value"
            — เดิม padding คงที่ py-6 ทุกสถานะ ทั้งที่ State B (ไม่มีโปรแกรม) มีข้อมูลจริงให้แสดงน้อยกว่า
            State A/C มาก ลด padding แนวตั้งลงเฉพาะตอนไม่มีโปรแกรม (py-6 -> py-5) ให้สัดส่วนภาพ/ข้อมูล
            สมดุลขึ้นโดยไม่แตะขนาด/เลย์เอาต์ตอนมีข้อมูลจริงให้แสดง (ซึ่งผ่านการปรับละเอียดมาหลายรอบแล้ว) */}
        <div className={`relative z-10 px-5 ${scheduledDay || todayCompleted ? 'py-6' : 'py-5'}`}>
          {/* ฟีดแบ็ก "Today's Workout ควรเป็นระบบสถานะของวัน ไม่ใช่แค่รูป workout" — State C: เสร็จแล้ว
              วันนี้ เปลี่ยนป้ายหัวการ์ดเป็น "Workout Complete" แทน "Today's Workout" เดิม (ยังโชว์ต่อไป
              ทั้งวันแม้เทรนเสร็จแล้ว ทำให้ดูเหมือนยังไม่ได้เริ่ม) ใช้ todayCompleted ตัวเดียวกับที่คำนวณ
              notification ด้านบนอยู่แล้ว ไม่ derive ซ้ำ */}
          <p className="text-[12px] tracked uppercase text-muted flex items-center gap-1.5">
            {todayCompleted ? (
              <>
                <span aria-hidden="true">✅</span> Workout Complete
              </>
            ) : (
              <>
                <span aria-hidden="true">🔥</span> Today&apos;s Workout
              </>
            )}
          </p>

          <div className="mt-4">
            {/* v46: "Glass Layer" — ฟีดแบ็ก "Card มี Layer 2 ชั้นเหมือน Apple Vision Pro" — เพิ่มแผ่นกระจก
                (backdrop-blur) ลอยอยู่หลังโซนตัวหนังสือเท่านั้น (ไม่ครอบทั้งการ์ด กันไม่ให้เบลอโซน
                Dumbbell/Spark ทางขวาซึ่งควรคมชัด) แยกชั้น "โลหะ" (พื้นการ์ด) ออกจากชั้น "กระจก" (แผงข้อความ)
                ให้เห็นความลึก 2 ชั้นจริง ไม่ใช่พื้นผิวเดียวแบน
                v47: "Option A" — เลิก flex row ร่วมกับ Ring เดิม (ย้ายไปลอย absolute มุมขวาล่างแล้ว ดูด้านบน)
                จำกัด max-width แทน กันตัวหนังสือยาวเกินไปชนโซน Ring/Dumbbell มุมขวาล่าง
                v55: ฟีดแบ็ก "เพิ่ม Depth ระหว่างข้อความกับพื้นหลัง กล่องข้อความเรียบไป ลองทำ Glass เบาๆ" —
                ของเดิม (v46) เบาบางมาก (blur-sm 4px, bg แทบมองไม่เห็นแค่ highlight gradient จาง ๆ) อัปเกรด
                ตามค่าที่ขอเป๊ะ: bg ทึบขึ้น rgba(18,20,26,.55) + backdrop-blur 16px (blur-sm -> ตัวเลขตรง
                ผ่าน style ปกติเพราะ Tailwind ไม่มี blur-16 ในสเกลดีฟอลต์) + border rgba(255,255,255,.06)
                ให้แผงข้อความ "ลอย" เหนือภาพชัดเจนขึ้นตามที่ขอ */}
            <div className="min-w-0 max-w-[230px] relative">
              <div
                className="absolute -inset-3 rounded-xl pointer-events-none"
                style={{
                  background: 'rgba(18,20,26,.55)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,.06)',
                }}
                aria-hidden="true"
              />
              <div className="relative">
              {(() => {
                // ฟีดแบ็ก "'ยังไม่ได้ตั้งโปรแกรม' อ่านยากกว่า 'ยังไม่มี Workout วันนี้'" — เปลี่ยนหัวข้อใหญ่
                // ตรงนี้ ส่วนย่อหน้าอธิบายด้านล่าง ("ยังไม่ได้ตั้งโปรแกรมวันนี้ — เลือกโปรแกรมเพื่อ...")
                // ยังคงคำเดิมไว้ตามจุดประสงค์ของมัน (อธิบายเหตุผล ไม่ใช่หัวข้อ) ไม่ซ้ำคำเป๊ะกันอีกต่อไป
                const title = workoutTitle ?? 'ยังไม่มี Workout วันนี้'
                const splitAt = title.search(/\s[—-]\s/)
                const dayLabel = splitAt >= 0 ? title.slice(0, splitAt) : null
                const restLabel = splitAt >= 0 ? title.slice(splitAt + 3) : title
                return (
                  <>
                    {dayLabel && (
                      <p className="font-display text-lg tracked uppercase text-amber leading-tight">{dayLabel}</p>
                    )}
                    <p className="font-display text-xl tracked uppercase text-ink leading-tight truncate">
                      {restLabel}
                    </p>
                  </>
                )
              })()}

              {plannedMuscleLabel && (
                <p className="text-xs text-amber mt-1.5 truncate">{plannedMuscleLabel}</p>
              )}

              {/* "ทำไมวันนี้?" — ฟีดแบ็ก "อยากให้ Today's Workout เป็นพระเอกของ Dashboard" พร้อม mockup
                  โชว์เหตุผลเป็น bullet (Recovery/Weekly Target/วันที่เทรนล่าสุด) แทนที่จะให้ผู้ใช้ต้องไป
                  หาเหตุผลเองจากการ์ด Recovery ด้านล่าง — ใช้ data.todaysRecommendation ตัวเดียวกับที่การ์ด
                  Recovery ใช้อยู่แล้ว (ไม่คำนวณซ้ำ) โชว์เฉพาะตอน isRecommendationForToday จริงๆ (กันกรณี
                  คำแนะนำเป็นของวันอื่น/กลุ่มอื่นที่ไม่ตรงกับ workoutTitle ด้านบน จะทำให้ bullet พูดคนละเรื่อง
                  กับหัวการ์ด) */}
              {/* ฟีดแบ็ก "ทำไมวันนี้? ค่อนข้างแน่นนิดหนึ่ง — จัดเป็น WHY TODAY แล้วทำ 3 bullet ให้ visual
                  hierarchy ชัดขึ้น" — ไม่ตัดข้อมูลอะไรออก (ทั้ง 3 เหตุผลยังอยู่ครบ) แค่ห่อเป็นกล่องย่อยแยก
                  ออกจากเนื้อหาอื่นในการ์ด (border จางๆ) เพิ่มระยะห่างระหว่างแถวเล็กน้อย และให้หัวข้อเด่นขึ้น
                  (ตัวหนา + tracking กว้างขึ้น) ให้สแกนอ่าน 3 บรรทัดแยกจากกันได้ง่ายกว่าเดิมที่ชิดกันเป็นก้อน */}
              {!isEmptyWorkoutState && data.isRecommendationForToday && data.todaysRecommendation && (() => {
                const rec = data.todaysRecommendation
                const tier = recoveryTier(rec.pct)
                const daysSince = daysSinceLastTrained(data.recoveryDates[rec.muscleGroup] ?? null)
                return (
                  <div className="mt-2.5 rounded-lg border border-white/5 bg-black/10 px-2.5 py-2 space-y-1.5">
                    <p className="text-[12px] font-bold tracked-lg uppercase text-muted">ทำไมวันนี้?</p>
                    <p className="text-[12px] leading-snug" style={{ color: tier.color }}>
                      {recoveryVerdictEmoji(rec.pct)} {rec.muscleGroup} ฟื้นตัวแล้ว {rec.pct}%
                    </p>
                    {rec.setsTarget > 0 && (
                      <p className="text-[12px] leading-snug" style={{ color: rec.setsRemaining > 0 ? COLORS.moss : COLORS.amber }}>
                        {rec.setsRemaining > 0 ? '🟢' : '🟡'} เป้าหมายสัปดาห์นี้ {rec.setsCurrent}/{rec.setsTarget} เซ็ต
                      </p>
                    )}
                    <p className="text-[12px] leading-snug text-muted">
                      🔵{' '}
                      {daysSince === null
                        ? `ยังไม่เคยเทรน${rec.muscleGroup}มาก่อน`
                        : daysSince === 0
                          ? `เทรน${rec.muscleGroup}ไปแล้ววันนี้`
                          : `เทรน${rec.muscleGroup}ล่าสุดเมื่อ ${daysSince} วันก่อน`}
                    </p>
                  </div>
                )
              })()}

              {/* ฟีดแบ็ก "เพิ่มท่า/เพิ่ม Set ระหว่างเซสชัน แต่พอจบ หน้านี้ไม่แสดงตามความจริง" — เดิม Exercises
                  ใช้ data.todayExercises.length (จำนวนแผนล้วนๆ) ตรงๆ ตราบใดที่มีแผนตั้งไว้ (>0 ก็ truthy
                  แล้ว) ไม่เคยเช็ค totals.entryCount (จำนวนที่ log จริงวันนี้) เลย — Sets ก็เช่นกัน
                  plannedTotalSets มาจากผลรวม target sets ของแผนล้วนๆ ไม่บวกรวมเซ็ต/ท่า ad-hoc ที่เพิ่ม
                  เข้าไประหว่างเซสชัน (ดู makeAdhocExercise ใน session/page.tsx) ผลคือ "6 Exercises/20 Sets"
                  ค้างอยู่แบบเดิมแม้ผู้ใช้เพิ่มท่าที่ 7 + เซ็ตรวม 24 จริงไปแล้ว — เปลี่ยนเป็น Math.max(แผน,
                  จริง) แทน: ถ้ายังไม่เริ่ม/ทำได้ไม่ครบแผน ยังโชว์ตัวเลขแผนเหมือนเดิม (ไม่ลดฮวบกลางเซสชัน) แต่
                  ถ้าทำเกินแผน (เพิ่มท่า/เซ็ตเอง) ตัวเลขจะขยับตามจริงทันที ไม่ค้างที่แผนเดิมอีกต่อไป —
                  totals.entryCount/totals.sets มาจาก computeTodayTotals(data.todayWorkouts) ซึ่งนับจาก
                  ข้อมูล log จริงอยู่แล้ว (ใช้ค่าเดียวกับที่ "นาที"/"kcal" สองช่องถัดไปใช้ ไม่ต้องคำนวณซ้ำ)
                  ฟีดแบ็ก "0 Exercises/0 Sets/~10 นาที ตอนยังไม่มี Workout วันนี้เลย เป็น noise ไม่ใช่ข้อมูล
                  มีความหมาย — Hero Message ควรเหลือแค่ ยังไม่มี Workout วันนี้ + CTA เดียว" — ซ่อนแถวนี้ทั้ง
                  แถวตอน isEmptyWorkoutState (ไม่มีทั้งแผนและยังไม่ได้ log อะไรเลยวันนี้) */}
              {/* ฟีดแบ็ก "เริ่มเทรนเลย ควรเป็น Primary Action ที่เด่นที่สุดในการ์ด ลดข้อความรองลง
                  10-15%" — ไม่แตะขนาด/สไตล์ปุ่ม CTA เอง (Button.tsx เตือนไว้แล้วว่าอย่าไปแข่ง class
                  กับ size prop) ลดความเด่นของแถวสถิติรองแทน (text-lg -> text-base) ให้ปุ่มเด่นขึ้นโดย
                  เปรียบเทียบแทน */}
              {!isEmptyWorkoutState && (
              <div className="flex items-center gap-4 mt-3 flex-wrap">
                <div>
                  <p className="font-mono text-base text-ink leading-none">{Math.max(data.todayExercises.length, totals.entryCount)}</p>
                  <p className="text-[12px] text-muted mt-0.5">Exercises</p>
                </div>
                <div>
                  <p className="font-mono text-base text-ink leading-none">{Math.max(plannedTotalSets, totals.sets)}</p>
                  <p className="text-[12px] text-muted mt-0.5">Sets</p>
                </div>
                <div>
                  <p className="font-mono text-base text-ink leading-none">
                    {totals.durationMin !== null ? Math.round(totals.durationMin) : `~${estimatedMinutes}`}
                  </p>
                  <p className="text-[12px] text-muted mt-0.5">นาที</p>
                </div>
                {/* v47: โชว์เฉพาะมีกิจกรรมจริงวันนี้แล้ว (ไม่เหมือน Exercises/Sets/นาทีด้านบนที่โชว์แผนได้แม้
                    ยังไม่เริ่ม) เพราะแคลอรี่คำนวณจาก workout ที่บันทึกจริงเท่านั้น โชว์ "0 kcal" ก่อนเริ่มจะดู
                    เหมือนบัคมากกว่าข้อมูลที่มีความหมาย */}
                {todayCalories > 0 && (
                  <div>
                    <p className="font-mono text-base text-ink leading-none">{todayCalories}</p>
                    <p className="text-[12px] text-muted mt-0.5">kcal</p>
                  </div>
                )}
              </div>
              )}

              {/* State C: "Volume +8% จากครั้งก่อน" — เทียบเซสชันวันนี้กับเซสชันก่อนหน้าของกล้ามเนื้อกลุ่ม
                  เดียวกัน (ดู computeSessionVolumeChange) โชว์เฉพาะตอนเทรนเสร็จแล้ว + มีข้อมูลพอเทียบ
                  (changePct ไม่ null) — ไม่เดา/ไม่โชว์เลขลอยๆ ถ้าเซสชันก่อนหน้ามี volume เป็น 0 */}
              {todayCompleted && data.sessionVolumeChange?.changePct != null && (
                <p className="text-xs mt-1.5" style={{ color: data.sessionVolumeChange.changePct >= 0 ? COLORS.moss : COLORS.amber }}>
                  Volume {data.sessionVolumeChange.changePct >= 0 ? '+' : ''}
                  {data.sessionVolumeChange.changePct}% จากครั้งก่อน
                </p>
              )}

              {/* กล้ามเนื้อที่เทรนวันนี้ — ฝังเป็นชิปเล็กในการ์ดนี้เลย แทนที่จะแยกเป็นการ์ดใหญ่
                  ต่างหาก (เคยซ้ำซ้อนกับการ์ด "สัดส่วนกล้ามเนื้อ (สัปดาห์นี้)" ด้านล่าง) */}
              <TodayMuscleChips todayWorkouts={data.todayWorkouts} />

              {/* v49 (Design System Phase 2): เดิม bg-amber เรียบๆ ไม่มี glow ต่างจากปุ่ม CTA หลักของ
                  AI Coach (AMBER_GRADIENT_CSS+glow) ทั้งที่ทำหน้าที่เดียวกัน (primary action) — เปลี่ยน
                  มาใช้ Button component กลาง (components/ui/Button.tsx) ให้เป็นสไตล์เดียวกันทั้งแอป
                  v56: ฟีดแบ็ก "ปุ่มไปต่อดีมากแล้ว แต่ถ้าจะสุด ทำ Glow วิ่งช้าๆ ทุก 5-6 วินาที จะดูเหมือน App
                  จริง" — เพิ่ม className "cta-sweep" (นิยามใน globals.css) สโคปเฉพาะปุ่มนี้เท่านั้น ไม่แตะ
                  Button.tsx ที่ใช้ร่วมกันทั่วแอป (Program/Session/Coach/ฯลฯ ยังไม่มี sweep นี้ — ฟีดแบ็กพูดถึง
                  ปุ่มนี้ปุ่มเดียวบน Dashboard) ทำผ่าน ::after pseudo-element ล้วนๆ ไม่ต้องแก้ Button component
                  เลย คุมจังหวะด้วย keyframe ที่ sweep ผ่านเร็ว (~1s) แล้วหยุดนิ่งอยู่นอกกรอบที่เหลือของรอบ
                  5.5s ให้ความรู้สึก "แสงวิ่งผ่านเป็นระยะ" ไม่ใช่ sweep วนต่อเนื่องซึ่งจะดูรบกวนเกินไป
                  v61: ฟีดแบ็ก "ปุ่มไปต่อยังเด่นเกินไปนิด Glow เยอะ ลด Glow ลงประมาณ 20% แล้วเพิ่ม Inner
                  Shadow แทน จะ Premium กว่า" + "Hover ยกขึ้น 2px" — เดิมปุ่มใช้ AMBER_GLOW_SHADOW (ค่า
                  กลางใน lib/theme.ts ใช้ร่วมกับ Button ทุกจุดในแอป) override เฉพาะจุดนี้ผ่าน style prop
                  (Button.tsx spread ...style ทับ default อยู่แล้ว) เป็นเวอร์ชัน alpha ทุกสต็อปลด ~20% +
                  inset shadow มืดด้านบน/สว่างจางด้านล่างให้ผิวปุ่มดูนูน ไม่ใช่แบนเรืองแสง — ไม่แตะ
                  AMBER_GLOW_SHADOW เดิมหรือ Button.tsx เลย (ฟีดแบ็กพูดถึงปุ่มนี้ปุ่มเดียว เหมือน cta-sweep
                  ด้านบน) — hover:-translate-y-0.5 (Tailwind, -2px) ยกปุ่มขึ้นตอน hover ใช้ transition
                  ที่ Button.tsx มีอยู่แล้ว (ครอบคลุม transform) ไม่ต้องเพิ่ม utility ใหม่ */}
              {/* ระบบ 3 สถานะของ Hero Card ตามฟีดแบ็ก "Today's Workout ต้องเป็น Hero ที่ฉลาดกว่านี้":
                  State C (todayCompleted) เสร็จแล้ววันนี้ → ปุ่มพาไปดูสรุป ไม่ใช่ "เริ่ม/ไปต่อ" อีกต่อไป
                  State A (มี scheduledDay) → ปุ่มเริ่ม/ไปต่อเหมือนเดิม
                  State B (ไม่มี scheduledDay) → ปุ่มเด่น "ให้ MINT แนะนำ" แทนที่ "เริ่มเทรนเลย" → /log เดิม
                  (เชื่อมกับ AI Coach ตามที่ขอ แทนที่จะพาไปหน้าบันทึกอิสระเฉยๆ) */}
              {todayCompleted ? (
                <Button
                  as={Link}
                  href="/session"
                  size="md"
                  className="mt-4 cta-sweep hover:-translate-y-0.5"
                  style={{
                    boxShadow:
                      '0 0 2px rgba(255,255,255,.48), 0 0 8px rgba(255,210,120,.48), 0 0 22px rgba(255,150,20,.28), 0 0 60px rgba(255,130,0,.10), inset 0 1px 2px rgba(0,0,0,.25), inset 0 -1px 0 rgba(255,255,255,.12)',
                  }}
                >
                  ดูสรุปวันนี้ <span aria-hidden="true">▶</span>
                </Button>
              ) : scheduledDay ? (
                <Button
                  as={Link}
                  href="/session"
                  size="md"
                  className="mt-4 cta-sweep hover:-translate-y-0.5"
                  style={{
                    boxShadow:
                      '0 0 2px rgba(255,255,255,.48), 0 0 8px rgba(255,210,120,.48), 0 0 22px rgba(255,150,20,.28), 0 0 60px rgba(255,130,0,.10), inset 0 1px 2px rgba(0,0,0,.25), inset 0 -1px 0 rgba(255,255,255,.12)',
                  }}
                >
                  {totals.entryCount > 0 ? 'ไปต่อ' : 'เริ่มเทรนเลย'} <span aria-hidden="true">▶</span>
                </Button>
              ) : (
                <Button
                  as={Link}
                  href="/coach"
                  size="md"
                  className="mt-4 cta-sweep hover:-translate-y-0.5"
                  style={{
                    boxShadow:
                      '0 0 2px rgba(255,255,255,.48), 0 0 8px rgba(255,210,120,.48), 0 0 22px rgba(255,150,20,.28), 0 0 60px rgba(255,130,0,.10), inset 0 1px 2px rgba(0,0,0,.25), inset 0 -1px 0 rgba(255,255,255,.12)',
                  }}
                >
                  🤖 ให้ MINT แนะนำ <span aria-hidden="true">▶</span>
                </Button>
              )}

              {/* ฟีดแบ็ก "ก่อนเริ่มเซ็ตแรก เพิ่มปุ่มเล็กๆ [ ดูท่าวอร์มอัป 3 นาที ] แนะนำท่ายืดเหยียดเฉพาะ
                  กล้ามเนื้อมัดที่จะเล่นวันนี้" — โชว์เฉพาะตอนมีแผนวันนี้จริง ยังไม่เสร็จ และยังไม่เริ่ม
                  ล็อกเซ็ตเลย (totals.entryCount === 0 — "ก่อนเริ่มเซ็ตแรก" ตามที่ขอเป๊ะๆ ไม่ใช่ตลอดเซสชัน) */}
              {scheduledDay && !todayCompleted && totals.entryCount === 0 && warmupMoves.length > 0 && (
                <button
                  type="button"
                  onClick={() => setWarmupOpen(true)}
                  className="mt-2 text-[12px] text-amber hover:underline flex items-center gap-1"
                >
                  <span aria-hidden="true">🔥</span> ดูท่าวอร์มอัป 3 นาที
                </button>
              )}
              <WarmupGuideSheet
                open={warmupOpen}
                onClose={() => setWarmupOpen(false)}
                muscleLabel={plannedMuscleLabel}
                moves={warmupMoves}
              />

              {/* ฟีดแบ็ก "ปุ่ม 'เริ่มเทรนเลย' ยังไม่ชัดว่าเริ่มอะไร" — เดิมข้อความบรรทัดเดียว "ยังไม่มี
                  โปรแกรมวันนี้ — ตั้งโปรแกรม หรือ เริ่มจากเทมเพลต" ไม่ได้บอกเหตุผลว่าทำไมควรตั้งโปรแกรม —
                  แยกเป็นหัวข้อ + ประโยคอธิบายสั้นๆ ว่าทำไมควรตั้งโปรแกรม (ให้ FitLog วางแผน/ติดตาม
                  Recovery ให้) + ตัวเลือกรอง "เลือกโปรแกรม"/"เริ่มจาก Template" ใต้ปุ่มเด่น "ให้ MINT
                  แนะนำ" ด้านบน (3 ทางเลือกตามที่ขอ) — ซ่อนถ้าเทรนเสร็จไปแล้ววันนี้ (todayCompleted) กัน
                  ข้อความ "ยังไม่ได้ตั้งโปรแกรม" ค้างอยู่ทั้งที่เพิ่งบันทึกอิสระเสร็จไป */}
              {!scheduledDay && !todayCompleted && (
                <div className="mt-2">
                  {isScheduledRestDay ? (
                    <p className="text-[12px] flex items-center gap-1.5" style={{ color: COLORS.moss }}>
                      <span aria-hidden="true">🛌</span> วันพักผ่อนตามแผน (รักษาสถิติ Streak ✅)
                    </p>
                  ) : (
                    <>
                      <p className="text-[12px] text-ink">ยังไม่ได้ตั้งโปรแกรมวันนี้</p>
                      {/* ฟีดแบ็ก "ข้อความใต้ปุ่ม 'ให้ MINT แนะนำ' อ่านยาก (low contrast) บนพื้นรูป — ควรเข้มขึ้น
                          ตามมาตรฐาน WCAG" — text-muted (#9498A0) เดิมวางอยู่บนพื้นรูป+scrim ของ Hero การ์ดนี้
                          ตรงๆ ต่างจากจุดอื่นในแอปที่ text-muted ใช้บนพื้นการ์ดเรียบทึบธรรมดา ขยับเป็น #CFD4DE
                          (ระดับ contrast เดียวกับที่ปรับจุดอื่นในการ์ดนี้ไปแล้วก่อนหน้า เช่น "/total"/"Exercises"
                          ในการ์ดมือถือ) ให้อ่านง่ายขึ้นจริง */}
                      <p className="text-[12px] mt-0.5" style={{ color: '#CFD4DE' }}>
                        เลือกโปรแกรมเพื่อให้ FitLog วางแผนการฝึกและติดตาม Recovery ให้คุณ
                      </p>
                      <p className="text-[12px] mt-1">
                        <Link href="/program" className="text-amber hover:underline">
                          เลือกโปรแกรม →
                        </Link>{' '}
                        หรือ{' '}
                        <Link href="/templates" className="text-amber hover:underline">
                          เริ่มจาก Template
                        </Link>
                      </p>
                    </>
                  )}
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* quick start actions — วางไว้ใต้ Today's Workout เสมอ กันผู้ใช้ใหม่ที่ยังไม่มีโปรแกรม/ประวัติ
          ไม่รู้จะกดอะไรต่อ ต่างจาก quick actions ชุดล่างที่เป็นทางลัดทั่วไป (บันทึก/เทมเพลต/สถิติ) —
          ชุดนี้เน้น 3 ทางเริ่มต้นที่ใช้บ่อยที่สุดตอนเปิดแอปครั้งแรก */}
      <div
        className={`grid gap-2 animate-rise lg:hidden ${data.hasAnyHistory ? 'grid-cols-2 min-[380px]:grid-cols-3' : 'grid-cols-2'}`}
        style={{ animationDelay: '120ms' }}
      >
        <QuickAction href="/log" label="บันทึกสถิติ" icon="➕" accent="moss" weight="primary" />
        <QuickAction href="/templates" label="เลือกโปรแกรม" icon="📋" accent="steel" />
        {data.hasAnyHistory && <QuickAction href="/coach" label="ถาม AI" icon="🤖" accent="violet" weight="tertiary" />}
      </div>

      </div>

      {/* right column (lg+): recovery, weekly goal, AI coach.
          lg:contents — same trick as the left column above. space-y-3 (not -6) below lg so
          Weekly Goal sits snug under Recovery/against AI Coach instead of floating with a
          gap that reads like a missing card. */}
      <div className="space-y-3 lg:space-y-0 lg:contents">
      {/* card 2: recovery — secondary weight on purpose: quieter border, no shadow, tighter
          padding than the hero card above, so it reads as supporting info, not competing for focus */}
      {prefs.showRecovery && (
        <div
          // v41: "Version 3 (Minimal Dark Titanium)" — เดิมมี border+boxShadow สีฟ้าเรืองแสงถาวรทั้งใบ
          // (Recovery เป็นการ์ดรอง ไม่ใช่ Hero) ตัด glow ระดับการ์ดออก เหลือแค่ border-line กลางเหมือน
          // การ์ดรองอื่นๆ ในแอป — สีฟ้ายังอยู่ที่วงแหวนด้านในเท่านั้น (ดู drop-shadow ของ GoalRing ด้านล่าง)
          // v49: rounded-lg (8px) -> rounded-card (24px, token เดียวกับ PremiumCard) ตามฟีดแบ็ก Radius
          // v53: ฟีดแบ็ก "จอ 14 นิ้ว ตัวเลข % ทะลุกรอบการ์ด แต่จอ 24 นิ้วไม่ต้องแก้" — วัดจริงพบว่าที่ความ
          // กว้างการ์ด ~341-355px (viewport 1280-1366px ซึ่งเป็นช่วง 14" laptop ทั่วไป) แถบ badge สถานะ
          // (Excellent/Good/...) + เลข % รวมกันกว้างเกินพื้นที่ที่เหลือหลังจาก ring หัก min-width ของ bar
          // ไปแล้ว ทะลุกรอบแถวออกมาจริงตามที่แจ้ง — ใช้ CSS container query (ไม่ใช่ viewport breakpoint)
          // ผูกกับความกว้างจริงของการ์ดนี้เอง ให้ซ่อน badge สถานะเฉพาะตอนการ์ดแคบกว่า 360px (ครอบคลุม
          // ช่วง 14" ที่วัดได้พอดี พร้อม margin กันขอบ) เหลือแค่เลข % (สีเดียวกับ badge เดิม ข้อมูลไม่หาย
          // แค่กระชับขึ้น) — จอ 24" (การ์ดกว้าง ~555px+) กว้างกว่า threshold มาก ไม่โดนกฎนี้เลย หน้าตาเดิม
          // 100% ตามที่ขอ ("จอ 24 นิ้วไม่ต้องแก้ไขอะไร")
          className="rounded-card bg-surface2/40 border border-line overflow-hidden animate-rise lg:col-start-6 lg:col-span-4 lg:row-start-1 recovery-card-cq"
          style={{ animationDelay: '240ms', containerType: 'inline-size' }}
        >
          {/* ฟีดแบ็ก "Micro-interaction — hover state ทั่วหน้า Dashboard ยังไม่สม่ำเสมอ" — การ์ดนี้เป็นลิงก์
              เต็มใบ (คลิกได้ทั้งการ์ด) แต่เดิมมีแค่ active: (ตอนกด) ไม่มี hover: เลย บนจอคอมที่ใช้เมาส์ ผู้ใช้
              จะไม่เห็นสัญญาณใดๆ ว่าการ์ดนี้กดได้จนกว่าจะคลิกไปแล้ว — เพิ่ม hover เบากว่า active (60% ของสี
              เดียวกัน) ให้มีสัญญาณ affordance ก่อนคลิกจริง */}
          <Link href="/recovery" className="block px-4 py-4 hover:bg-surface2/60 active:bg-surface2 transition">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] tracked uppercase text-muted">Recovery</p>
            </div>

            {(() => {
              // recoveryPctMap คำนวณไว้แล้วที่ระดับ component (ใช้ร่วมกับ Fitness Score บน header ด้วย)
              // ไม่ต้องคำนวณซ้ำในนี้อีกรอบ
              // ใช้ตัวที่คำนวณไว้แล้วฝั่งบน (ยึดตามตารางโปรแกรมประจำสัปดาห์ก่อน ถ้ามี) แทนที่จะคำนวณใหม่
              // จาก recovery % ล้วนๆ ตรงนี้ กันไม่ให้การ์ดนี้แนะนำสวนทางกับ hero message ด้านบน
              // v: เดิมใช้ data.muscleRecommendation (recovery % ล้วนๆ) — เปลี่ยนมาใช้
              // data.todaysRecommendation แทน ซึ่งมีฟิลด์เดียวกันครบ (muscleGroup/pct) บวก
              // setsRemaining (เซ็ตที่เหลือถึงเป้าหมายรายสัปดาห์ของกลุ่มนั้น จาก Weekly Volume Engine)
              // ให้ป้ายแนะนำตอบทั้ง "พร้อมฝึกไหม" และ "ยังขาดอีกเท่าไหร่" ในข้อความเดียว
              const recommendation = data.todaysRecommendation
              return (
                <>
                  {recommendation &&
                    (() => {
                      // v45: ฟีดแบ็ก "Recovery เป็นสีเขียว แต่ Ring เป็นฟ้า อยากได้ Palette เดียวกัน" —
                      // ป้ายแนะนำ + badge "พร้อมลุย" เดิมใช้ recoveryStatusColor() (เขียว/เหลือง/แดงตาม %)
                      // ขณะที่วงแหวน "ฟื้นตัวรวม" ด้านล่าง fix เป็นฟ้าไซแอนคงที่ตามธีมการ์ดนี้อยู่แล้ว —
                      // เปลี่ยนป้ายให้ใช้สีฟ้าไซแอนเดียวกับวงแหวนแทน ให้ทั้งการ์ดเป็นโทนเดียวกัน (เฉพาะ
                      // 2 จุดนี้ — จุดสีเขียว/เหลือง/แดงในลิสต์รายกลุ่มกล้ามเนื้อด้านล่างยังคงไว้ เพราะเป็น
                      // สัญญาณข้อมูลจริงว่ากลุ่มไหนพร้อม/ไม่พร้อม ไม่ใช่แค่สีตกแต่ง)
                      const recColor = COLORS.cyan
                      const isFullyReady = recommendation.pct >= FULLY_RECOVERED_PCT
                      return (
                        // v49: ฟีดแบ็ก "แถบ Notification สูงเกิน กินพื้นที่เกือบ 20% ทั้งที่ข้อความสั้น
                        // อยากลดความสูงประมาณ 20%" — py-2 (8px) -> py-1.5 (6px) และไอคอน 💪 text-sm (14px)
                        // -> text-xs (12px) ให้ line-height สูงสุดในแถวลดลงด้วย (ไม่ใช่แค่ padding อย่าง
                        // เดียว) รวมกันลดความสูงจริงประมาณ 20% ตามที่ขอ
                        <div
                          className="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 mb-3"
                          style={{ backgroundColor: withAlpha(recColor, '1A') }}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="text-xs shrink-0" aria-hidden="true">💪</span>
                            {/* ฟีดแบ็ก "MINT Coach/Recovery/Insights มี AI recommendation ซ้ำกันเยอะ" — ตัด
                                "— ฟื้นตัวแล้ว {pct}% · เหลืออีก N เซ็ตถึงเป้าหมาย" ท้ายป้ายนี้ออก ตัวเลขชุดนี้
                                ซ้ำถึง 2 ที่อยู่แล้ว: (1) การ์ด MINT Coach ข้างๆ กัน (Muscle Recovery bar +
                                "เหลืออีก N เซ็ต") และ (2) แถวรายกลุ่มกล้ามเนื้อในลิสต์ด้านล่างของการ์ดนี้เอง
                                (ถ้ากลุ่มนี้ยังไม่ฟื้นตัวเต็มที่ ก็จะโผล่ในลิสต์ default อยู่แล้วพร้อม % ของมัน)
                                ป้ายนี้เหลือแค่ "แนะนำกลุ่มไหน" ให้ MINT Coach เป็นเจ้าของ "ทำไม"/ตัวเลขไปเลย
                                ตามการแบ่งหน้าที่ที่ตั้งใจไว้แล้ว (ดู comment v69 ใน TodaysWorkoutCompactCard.tsx) —
                                scheduleOverriddenFrom/lowRecoveryCaution ด้านล่างยังคงไว้ เพราะเป็นข้อมูลที่
                                ไม่มีที่ไหนอื่นพูดถึง ไม่ใช่การซ้ำ */}
                            {/* ฟีดแบ็ก "ข้อความด้านบน Recovery Card ยังแน่น สายตาต้องประมวลผลเยอะ" — เดิม
                                2 บรรทัดของ recoveryRecommendationLabel (🟢 progress / 🎯 แนะนำ) ใช้
                                leading ปกติ ชิดกับ scheduleOverriddenFrom/lowRecoveryCaution ด้านล่าง
                                (mt-0.5) จนอ่านเหมือนก้อนเดียว — เพิ่ม leading-relaxed ให้ 2 บรรทัดใน label
                                เอง ห่างขึ้น และเพิ่มช่องไฟ mt-0.5 -> mt-1 ระหว่างบรรทัดถัดๆ ไป ไม่แตะ
                                recoveryRecommendationLabel() เอง (ใช้ร่วมกับหน้า /recovery ด้วย) แค่ปรับ
                                การแสดงผลตรงจุดนี้เท่านั้น */}
                            <p className="text-xs text-ink whitespace-pre-line leading-relaxed">
                              {recoveryRecommendationLabel(recoveryLabelPct, data.isRecommendationForToday)}{' '}
                              <span className="font-display tracked uppercase" style={{ color: recColor }}>
                                {recommendation.muscleGroup}
                              </span>
                            </p>
                            {/* ฟีดแบ็ก "Recovery ฟื้นตัวแล้ว ≠ ควรฝึก" — บอกเหตุผลตรงๆ เมื่อ suggestMuscleToTrain
                                แนะนำกลุ่มนี้แทนกลุ่มตามตารางเพราะ Volume ของกลุ่มตามตารางเกินเป้าไปแล้ว */}
                            {recommendation.scheduleOverriddenFrom && (
                              <p className="text-[12px] text-muted mt-1">
                                ตามตารางคือ{recommendation.scheduleOverriddenFrom} แต่ Volume สัปดาห์นี้เกินเป้าหมายแล้ว
                              </p>
                            )}
                            {/* ฟีดแบ็ก "Recovery ต่ำ + Volume ยังไม่ถึงเป้า → เตือน" — เคสที่ 3 ใน
                                Recommendation Engine decision table (ยังแนะนำกลุ่มเดิม แต่ร่างกายยังไม่พร้อมเต็มที่) */}
                            {recommendation.lowRecoveryCaution && (
                              <p className="text-[12px] mt-1" style={{ color: COLORS.amber }}>
                                ⚠️ ฟื้นตัวยังไม่เต็มที่ แนะนำลดความหนักหรือเลื่อนออกไปก่อน
                              </p>
                            )}
                          </span>
                          {isFullyReady && (
                            <span
                              className="shrink-0 text-[12px] font-display tracked uppercase rounded-full px-2.5 py-1"
                              style={{ backgroundColor: recColor, color: NEUTRAL.onAmberText }}
                            >
                              พร้อมลุย
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  {/* v49: ฟีดแบ็ก "ย้าย ring มาอยู่ด้านข้างแบบมอคอัพ V1" — เดิม ring กับลิสต์อยู่กันคนละ
                      บล็อก (ring บล็อกเดี่ยวด้านบน, ลิสต์เต็มความกว้างด้านล่าง) ย้ายมาอยู่แถวเดียวกัน
                      (ring ซ้าย, ลิสต์ขวาเต็มที่เหลือ) items-center ให้ ring อยู่กึ่งกลางแนวตั้งของลิสต์
                      4-7 แถว ตามมอคอัพเป๊ะ — ไม่แตะ logic การคำนวณ/hover/สีใดๆ แค่ย้ายเลย์เอาต์ */}
                  <div className="flex items-center gap-4 mt-3">
                    {(() => {
                      // ฟื้นตัวรวม — ค่าเฉลี่ยของกลุ่มกล้ามเนื้อ แสดงเป็นวงแหวนคู่กับลิสต์รายกลุ่ม
                      // (ตามมอคอัพ v3: ring "พื้นตัวรวม" ข้างๆ list แทนที่จะโชว์แค่ list เดี่ยวๆ)
                      // ฟีดแบ็ก "Data Inconsistency — หัวหน้าเว็บบอก Recovery 76% Excellent แต่การ์ดนี้บอก
                      // 81% Good ตัวเลขเดียวกันแต่คนละค่า ทำให้รู้สึกว่า Algorithm ไม่ Sync กัน — ให้มี
                      // Recovery Score ตัวเดียวทั้งระบบ" — เดิมวงแหวนนี้เฉลี่ย RECOVERY_MUSCLES ครบทั้ง 7
                      // กลุ่มเสมอ (กลุ่มที่ไม่เคยเทรนเลยได้ 100% อัตโนมัติจาก computeRecoveryPct(null, mg) —
                      // ดันค่าเฉลี่ยขึ้นสูงกว่าความจริง) ส่วน fitnessScoreRecoveryPct ที่ป้าย Recovery บน
                      // header ใช้ (บรรทัด ~871) เฉลี่ยเฉพาะ trainedRecoveryMuscles (กลุ่มที่เคยเทรนจริง
                      // เท่านั้น) ทำให้สองจุดคำนวณ "Recovery" คนละสูตรจากข้อมูลชุดเดียวกัน — เปลี่ยนวงแหวนนี้
                      // ให้ใช้ trainedRecoveryMuscles สูตรเดียวกับ header เป๊ะ ให้ค่าตรงกันทั้งหน้าเสมอ
                      // (ไม่มีข้อมูลเทรนเลยสักกลุ่ม = fallback 100% เหมือน computeRecoveryPct(null, mg) เดิม)
                      const overallRecoveryPct =
                        trainedRecoveryMuscles.length > 0
                          ? Math.round(
                              trainedRecoveryMuscles.reduce((sum, mg) => sum + recoveryPctMap[mg], 0) /
                                trainedRecoveryMuscles.length
                            )
                          : 100
                      return (
                        // สีฟ้าไซแอน + glow ตามมอคอัพ v3 — เดิมใช้ recoveryStatusColor() ที่เปลี่ยนสีตามเปอร์เซ็นต์
                        // (เขียว/เหลือง/แดง) ตอนนี้ fix เป็นฟ้าให้เข้าธีมเดียวกับวงแหวนอื่นๆ ในมอคอัพ (v45 —
                        // ring คงสีฟ้าคงที่เป็น "ภาพรวม" เสมอ ไม่ผูกกับ tier แบบแท่งรายกลุ่มด้านล่าง)
                        // v47: ฟีดแบ็ก "การ์ดนี้ข้อมูลเยอะแต่ Ring ยังเล็ก ขยายประมาณ 15% จะบาลานซ์กว่า" —
                        // 84 -> 97 (+15%)
                        // v49: ฟีดแบ็ก "Ring ควรเป็น Hero ของการ์ด ตอนนี้ดูเหมือน icon — อยากได้สัดส่วน
                        // Ring 35% / List 65% (เดิม ~20/80)" — 97 -> 128 (+32%) strokeWidth ขยายตามสัดส่วน
                        // เดียวกัน (9 -> 12) — label เปลี่ยนจากข้อความคงที่ "พื้นตัวรวม" (ซ้ำกับหัวการ์ด
                        // "Recovery" ที่มีอยู่แล้วด้านบน) เป็นคำสถานะ (Excellent/Good/...) จาก recoveryTier()
                        // เดียวกับที่ใช้กับแท่งรายกลุ่ม ให้ตรงกับตัวอย่างที่ขอ ("95% Recovery Excellent")
                        //
                        // v50: ฟีดแบ็ก "Ring ยังใหญ่ไปนิด ดึงสายตาเยอะกว่ารายการทั้งหมด ลดประมาณ 70→58-60px
                        // (สัดส่วนเดียวกัน ~-17%), Glow ลดลงประมาณ 30%" — 128 -> 106 (-17%) strokeWidth
                        // ตามสัดส่วน (12 -> 10) — glow: alpha .40 (25%) ลด 30% เหลือ ~18% (.2D) + blur
                        // 4px -> 3px ให้จางลงตามสัดส่วนเดียวกัน
                        //
                        // v51: ฟีดแบ็ก "Ring ยังชิดซ้ายไปนิด ขยับไปทางขวาอีก 12-16px ให้ Card ดูกึ่งกลางขึ้น"
                        // — เพิ่ม ml-3 (12px) ที่ wrapper นี้ ไม่กระทบตำแหน่ง/ความกว้างของลิสต์ด้านขวา
                        // (ยังเป็น flex-1 เท่าเดิม แค่ปรับจุดเริ่มต้นของ ring เข้ามาจากขอบซ้ายของการ์ด)
                        //
                        // v51: ฟีดแบ็ก "คำว่า Recovering ใต้ % สื่อว่า 'กำลังฟื้นตัว' (เหมือนสถานะ) ไม่ใช่
                        // 'คะแนนการฟื้นตัวโดยรวม' อยากได้ Overall/Recovery/ฟื้นตัวรวม แทน" — เดิม label เป็น
                        // recoveryTier(...).labelEn (คำสถานะ 1 ใน 4 คำ เปลี่ยนไปตาม % เช่น Recovering ที่
                        // ทำให้เข้าใจผิดได้) เปลี่ยนกลับเป็นข้อความคงที่ แต่เลือก "Overall" (ไม่ใช่ "Recovery"
                        // ที่จะซ้ำกับหัวการ์ดตรงๆ ตามเหตุผลเดิมของ v49) ให้สื่อว่าเป็น "ภาพรวม" ของตัวเลข ไม่ใช่
                        // สถานะที่เปลี่ยนไปตาม tier
                        //
                        // v56: ฟีดแบ็ก "Ring ดูโล่งไปนิด อยากได้ 'Recovery' ตามด้วยสถานะ (Recovering/...) 2
                        // บรรทัด แทน 'Overall' บรรทัดเดียว" — v51 กังวลว่าโชว์แค่คำสถานะ (Recovering) เดี่ยวๆ
                        // จะเข้าใจผิดว่าเป็นสถานะลอยๆ ไม่ใช่คะแนนภาพรวม — รอบนี้แก้ตรงจุดกังวลนั้นได้จริง โดย
                        // โชว์ทั้งคู่พร้อมกัน "Recovery" (บริบท, มา ก่อน) + "Recovering" (สถานะจาก
                        // recoveryTier() ตัวเดียวกับที่ใช้กับแท่งรายกลุ่มด้านล่าง สีตาม tier) ให้อ่านออกว่า
                        // เป็น "สถานะของ Recovery" ไม่ใช่คำลอยๆ — GoalRing.label เพิ่งขยายรับ ReactNode ได้
                        // (ดู GoalRing.tsx) เลยส่ง 2 บรรทัดสีต่างกันเข้าไปแทน string เดี่ยว
                        //
                        // v57: ฟีดแบ็ก "ด้านซ้าย (ในวง) ยังค่อนข้างโล่ง ลองเพิ่มบรรทัดเล็กๆ เช่น 'Recovered
                        // 4/7' ให้วงดูมีน้ำหนักขึ้นโดยไม่รก" — เพิ่มบรรทัดที่ 3 (เล็กกว่า 2 บรรทัดบน, มืดกว่า)
                        // นับจำนวนกลุ่มกล้ามเนื้อที่ pct >= 65 (เกณฑ์ "Good" เดียวกับ RECOVERY_TIERS ใน
                        // dashboardStats.ts — ต่ำกว่านี้คือ Recovering/Rest แปลว่ายังไม่พร้อมจริง) จาก
                        // ทั้งหมด RECOVERY_MUSCLES.length (7) ให้ตัวเลขสอดคล้องกับสีของแท่ง/badge รายกลุ่ม
                        // ด้านขวาเป๊ะ ไม่ใช่เกณฑ์แยกต่างหาก
                        //
                        // v60: ฟีดแบ็ก "ตอนนี้เหลือเยอะไปนิด (3 บรรทัด) ข้อมูลด้านขวาก็บอกอยู่แล้วว่า 7
                        // กล้ามเนื้อเหลืออะไร ไม่ต้องบอกซ้ำ" — ตัดบรรทัดที่ 3 ("Recovered X/7" จาก v57) ออก
                        // กลับไปเหลือ 2 บรรทัดเหมือน v56 ("Recovery" + สถานะ) — glow ก็เบาลง ~10% ตามฟีดแบ็ก
                        // "วงแหวนดูดีแล้ว แต่ถ้า Glow เบาลงอีก 10% จะดูแพงขึ้น แบบ Apple" alpha '2D' (17.6%)
                        // -> '28' (15.7%)
                        // ฟีดแบ็ก "ข้อมูลซ้ำ — Header บอก Recovery Excellent, Card ก็บอก Recovery Excellent
                        // ซ้ำอีกใน Ring" — หัวการ์ด "Recovery" อยู่เหนือ ring นี้แค่ ~2 บรรทัดอยู่แล้ว (ดู
                        // <p>Recovery</p> ด้านบน) ตัดคำว่า "Recovery" ในป้าย ring ออก เหลือแค่คำสถานะ
                        // (Excellent/Good/...) ไม่ต้องพูดชื่อการ์ดซ้ำสองรอบติดกัน — ไม่แตะ header pill
                        // บนสุดของหน้า (fitnessScoreRecoveryPct) เพราะมีจุดประสงค์ต่างกัน (เห็นได้โดยไม่ต้อง
                        // เลื่อนมาถึงการ์ดนี้) เป็นการตัดสินใจแยกต่างหากที่มีคอมเมนต์ของตัวเองอยู่แล้ว
                        <div className="shrink-0 ml-3" style={{ filter: `drop-shadow(0 0 3px ${withAlpha(COLORS.cyan, '28')})` }}>
                          <GoalRing
                            pct={overallRecoveryPct}
                            size={106}
                            strokeWidth={10}
                            color={COLORS.cyan}
                            label={
                              <span style={{ color: recoveryStatusColor(overallRecoveryPct) }}>
                                {recoveryTier(overallRecoveryPct).labelEn}
                              </span>
                            }
                            ariaLabel="ฟื้นตัวรวมทุกกลุ่มกล้ามเนื้อ"
                            glow
                          />
                        </div>
                      )
                    })()}
                    {/* v48d: ฟีดแบ็ก "ไม่อยากได้รูปกล้ามเนื้อ (ตัวคน) จุดนี้" — ตัด RecoveryBodyDiagram ออก
                        ทั้งหมด เหลือแค่ลิสต์แท่งยาวตาม % hover ยังไฮไลต์แท่งตัวเองได้เหมือนเดิม แค่ไม่มีคู่
                        ตัวคนให้ sync ด้วยแล้ว */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                    {(() => {
                      // ฟีดแบ็ก (Information Hierarchy review) — "หน้า Home ไม่ควรแสดงทุก muscle group
                      // แบบเต็มตั้งแต่แรก อยาก top ~3 พอ + ลิงก์ดูรายละเอียด" — เดิม notReadyMuscles โชว์
                      // ทุกกลุ่มที่ยังไม่ฟื้นตัวเต็มที่ (อาจได้ถึง 5-6 กลุ่ม ถ้าเพิ่งฝึกหนักมาหลายวัน) เรียง
                      // ตามลำดับ RECOVERY_MUSCLES คงที่ ไม่ใช่ตามความเร่งด่วน — เรียงตาม pct น้อยสุดก่อน
                      // (ฟื้นตัวน้อยสุด = เร่งด่วนสุดที่ควรรู้) แล้วตัดเหลือ 3 กลุ่มแรกเป็นค่าเริ่มต้น ปุ่ม
                      // "แสดงทั้งหมด" เดิมด้านล่างยังกดดูครบ 7 กลุ่มได้เหมือนเดิม ไม่เสียข้อมูล แค่ไม่บังคับ
                      // เห็นทุกกลุ่มตั้งแต่แรก (การ์ดทั้งใบเป็นลิงก์ไป /recovery อยู่แล้วด้วยสำหรับรายละเอียดเต็ม)
                      const notReadyMuscles = RECOVERY_MUSCLES.filter((mg) => recoveryPctMap[mg] < FULLY_RECOVERED_PCT)
                        .slice()
                        .sort((a, b) => recoveryPctMap[a] - recoveryPctMap[b])
                      const displayedMuscles = showAllRecovery ? RECOVERY_MUSCLES : notReadyMuscles.slice(0, 3)
                      if (displayedMuscles.length === 0) {
                        // ฟีดแบ็ก "Recovery 100% ไม่ควรแปลว่า 'ทุกกล้ามเนื้อพร้อมฝึก' — ผู้ใช้อาจตีความเป็น
                        // 'พร้อมฝึก = ควรฝึก' ทั้งที่ Weekly Volume บางกลุ่มอาจเกินเป้าไปแล้ว" — เดิมข้อความนี้
                        // ("พร้อมฝึกแล้ว") ฟังดูเหมือนคำแนะนำ (recommendation) ทั้งที่จริงเป็นแค่สถานะร่างกาย
                        // (recovery) ล้วนๆ — ตัดคำว่า "พร้อมฝึก" ออก เหลือแค่สถานะการฟื้นตัวเฉยๆ ไม่ชี้นำว่า
                        // ควรทำอะไรต่อ (ดูคำแนะนำจริงได้จากป้าย "ครั้งหน้าแนะนำ.../วันนี้ควรเล่น..." ด้านบนแทน)
                        return <p className="text-[12px] text-muted text-center py-2">ฟื้นตัวดีทุกกลุ่มกล้ามเนื้อ ✅</p>
                      }
                      return displayedMuscles.map((mg) => {
                      const pct = recoveryPctMap[mg]
                      const color = recoveryStatusColor(pct)
                      const isHovered = mg === hoveredRecoveryGroup
                      return (
                        <div
                          key={mg}
                          onMouseEnter={() => setHoveredRecoveryGroup(mg)}
                          onMouseLeave={() => setHoveredRecoveryGroup(null)}
                          className="rounded-md px-2 py-1.5 flex items-center gap-2 transition"
                          style={{
                            backgroundColor: isHovered ? '#1D2129' : '#171A20',
                            boxShadow: isHovered ? `0 0 8px ${color}80` : undefined,
                          }}
                        >
                          {/* v49: วิเคราะห์มอคอัพ 4 เวอร์ชัน — จุดร่วมที่ดีที่สุดคือแยกสี "กล้ามเนื้อไหน"
                              (จุดนี้ ใช้ MUSCLE_GROUP_COLORS เดียวกับ WeeklyVolume/WorkoutHeatmap) ออกจากสี
                              "ฟื้นตัวแค่ไหน" (แท่ง+% ด้านล่าง ใช้ recoveryStatusColor ตามเดิม) — เดิมทั้งแถว
                              ใช้ recoveryStatusColor เดียวกันหมด (พื้นหลัง/glow/แท่ง/%) ทำให้ไม่มีสัญญาณสีที่
                              บอกกล้ามเนื้อเลย ต้องอ่านจากตัวหนังสือเท่านั้น — พื้นหลัง/glow ของทั้งแถวยังคงเป็น
                              status color เดิม (เอาไว้บอก hover state ทั้งแถว ไม่ใช่จุดประสงค์เดียวกับจุดนี้)
                              v57: ฟีดแบ็ก "พื้นหลังแต่ละแถวสีต่างกันหมด (เขียว/น้ำตาล/แดง/ม่วง) สวยแต่มีโอกาส
                              ดู Premium ขึ้นอีกถ้าพื้นทุกแถวเหมือนกัน (#171A20) แล้วใช้แค่จุดสี/แท่ง/badge
                              บอกสถานะแทน ลดจำนวนสีที่แข่งกันบนจอ" — background พื้นแถว (idle) เปลี่ยนจาก
                              status-color tint (${'{'}color{'}'}14) เป็น #171A20 คงที่ทุกแถวทุกสถานะ hover
                              ก็เปลี่ยนเป็นสีเทาเข้มขึ้นเล็กน้อยคงที่ (#1D2129) แทน status-color tint เดิม
                              เช่นกัน — glow ตอน hover (boxShadow) ยังคงใช้สี status เดิม เพราะเป็น interaction
                              feedback ชั่วคราวตอนโฟกัสแถวเดียว ไม่ใช่สีพื้นถาวรที่แข่งกันบนจอเหมือนที่ฟีดแบ็ก
                              บ่น — สัญญาณสถานะทั้งหมดตอนนี้อยู่ที่จุดสี(กล้ามเนื้อ)/แท่ง(สถานะ)/badge(สถานะ)
                              ล้วนๆ ตามที่ขอ */}
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: MUSCLE_GROUP_COLORS[mg] }}
                            aria-hidden="true"
                          />
                          <span className="text-[12px] text-ink w-11 shrink-0 truncate">{mg}</span>
                          {/* v49: ฟีดแบ็ก "ทุกแท่งหน้าตาเหมือนกันหมด (██████) เลยอ่านยาก อยากใช้ Badge
                              สถานะ (Excellent/Good/Recovering/Rest) แทน Progress Bar ทั้งหมด จะ Premium
                              กว่า" — เดิม AnimatedBarFill (แท่งยาว ∝ %) ตัดออกทั้งหมด แทนที่ด้วย badge
                              ข้อความสถานะจาก recoveryTier() (ตัวเดียวกับที่คุม color ของแถวนี้อยู่แล้ว —
                              ไม่มีทางหลุดซิงค์กัน) — glow เบาๆ ตามฟีดแบ็ก "ใช้ Glow เบาๆ" ข้อ 5
                              v50: ฟีดแบ็ก "อยากได้ทั้ง Bar บางๆ (5-6px) กับ Badge คู่กัน ไม่ใช่แค่อย่างใด
                              อย่างหนึ่ง" — เพิ่ม AnimatedBarFill กลับมาแบบเรียบที่สุด (ไม่มี glow/gradient/
                              inset-shadow เหมือนรอบ v48 ที่ทำให้ "รู้สึกหนัก" — พร็อพดีฟอลต์ทั้งหมด สีเรียบ
                              ล้วนบางๆ h-1 (4px) แบบ Apple/Notion) คั่นกลางระหว่างชื่อกับ badge/%
                              v58: ฟีดแบ็ก "Bar หนาได้อีกนิด ตอนนี้ ~5px ลองใช้ 7-8px จะดู Luxury กว่า แบบ
                              Apple Fitness/Garmin/Oura" — h-1 (4px) -> h-2 (8px, ตรงกับตัวเลือกบนของ 2 ค่า
                              ที่เสนอมาเป๊ะ และเป็น Tailwind step มาตรฐานพอดี ไม่ต้องใช้ arbitrary value
                              v61: ฟีดแบ็ก "Bar ยังดูแบน อยากได้ glow บางๆ/highlight บนแท่ง แบบ Apple
                              Activity" — ย้อนกลับการตัดสินใจ v50 บางส่วน (ตอนนั้นตัด glow ออกเพราะรู้สึก
                              "หนัก" — แต่ตอนนี้ bar หนาขึ้นเป็น h-2 แล้วตั้งแต่ v58 บาลานซ์กับ inset
                              highlight ได้ดีกว่าตอน h-1 บางๆ) — เปิด prop glow ของ AnimatedBarFill (มีอยู่
                              แล้วตั้งแต่ v48 แต่ปิดไว้ default false ไม่กระทบจุดเรียกอื่น) ให้ inset highlight
                              บนแท่ง (rgba(255,255,255,.3)) + inset shadow ล่าง + glow นอกบางๆ สีเดียวกับ
                              badge/สถานะแถวนั้นอยู่แล้ว ไม่ต้องเพิ่ม prop สีใหม่ */}
                          <span className="relative flex-1 min-w-[18px] h-2 rounded-full overflow-hidden bg-black/40">
                            <AnimatedBarFill pct={pct} color={color} glow />
                          </span>
                          {/* v50: ฟีดแบ็ก "% อยู่ห่างจาก Badge เหมือนมีข้อมูล 3 จุด (ชื่อ/Badge/%) สายตา
                              กระโดด อยากให้ Badge กับ % รู้สึกเป็นคู่เดียวกัน" — ห่อ badge+% ไว้ในกลุ่มเดียว
                              gap แคบกว่า (gap-1) แยกจาก gap ของแถวหลัก (gap-2) ให้ 2 ตัวนี้อ่านเป็นหน่วย
                              เดียวกันจริงๆ แทนที่จะเป็น element เรียงเท่าๆ กัน 3 ชิ้น
                              v56: ฟีดแบ็ก "แถวนี้ดูเป็น Table มากกว่า Dashboard อยากได้ ●ชื่อ + แท่ง +
                              สถานะ (Excellent) แทนที่จะมีเลข % แยกอีกคอลัมน์" — ตัดเลข % ตัวเลขดิบออก
                              (สีของแท่ง + badge สถานะ สื่อระดับเดียวกันอยู่แล้ว ตัวเลขดิบเป็นข้อมูลซ้ำที่ทำให้
                              รู้สึกเหมือนตาราง/สเปรดชีต) เหลือ dot+ชื่อ+แท่ง+badge บนแถวเดียวเหมือนเดิม — เลือก
                              ไม่ตัดขึ้นเป็น 3 บรรทัดแยก (ตามมอคอัพทางเลือกที่ 2 ที่เสนอมา) เพราะจะทำให้ลิสต์นี้
                              สูงขึ้น ~3 เท่า ชนกับสัดส่วน ring/list ที่ปรับสมดุลกันมาหลายรอบแล้ว (v49-v51)
                              ยุบ wrapper กลุ่ม badge+% เดิม (v50) ออกด้วยเพราะเหลือ badge ตัวเดียวแล้ว */}
                          <span
                            className="recovery-tier-badge shrink-0 text-[12px] font-display font-semibold tracked uppercase rounded-full px-1.5 py-0.5"
                            style={{
                              backgroundColor: withAlpha(color, '22'),
                              color,
                              boxShadow: `0 0 4px ${withAlpha(color, '55')}`,
                            }}
                          >
                            {recoveryTier(pct).labelEn}
                          </span>
                        </div>
                      )
                      })
                    })()}
                    </div>
                  </div>
                  {/* toggle ระหว่างลิสต์ย่อ (top 3 ที่ยังไม่พร้อม เร่งด่วนสุดก่อน) กับลิสต์เต็ม 7 กลุ่ม —
                      โชว์เฉพาะตอนมีอะไรให้สลับจริง (ตอนนี้ลิสต์ย่อ cap ไว้แค่ 3 เสมอ — ถ้ามีกลุ่มที่ยังไม่
                      พร้อมอย่างน้อย 1 กลุ่ม แปลว่ากดขยายแล้วจะเห็นเพิ่มแน่ๆ ไม่ว่าจะเป็นกลุ่มไม่พร้อมที่เหลือ
                      หรือกลุ่มที่ฟื้นตัวเต็มที่แล้ว) กันปุ่มลอยอยู่เฉยๆ ตอนทุกกลุ่มพร้อมหมดแล้ว (ข้อความ
                      "ฟื้นตัวดีทุกกลุ่มกล้ามเนื้อ ✅" ด้านบนสื่อสารครบอยู่แล้ว ไม่ต้องมีปุ่มขยายเพิ่ม) */}
                  {(() => {
                    const notReadyCount = RECOVERY_MUSCLES.filter((mg) => recoveryPctMap[mg] < FULLY_RECOVERED_PCT).length
                    if (notReadyCount === 0) return null
                    return (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setShowAllRecovery((v) => !v)
                        }}
                        className="mt-2 text-[12px] text-muted hover:text-ink transition"
                      >
                        {showAllRecovery ? 'แสดงเฉพาะที่ยังไม่พร้อม' : `แสดงทั้งหมด (${RECOVERY_MUSCLES.length}) →`}
                      </button>
                    )
                  })()}
                  {/* v49: ฟีดแบ็ก "View Detail เล็กไปนิด ลองทำเป็นเส้นคั่นด้านบน + View Recovery Detail →
                      จะดูเป็น Apple มากกว่า" — เพิ่มเส้นคั่นบาง (border-t) แยกจากลิสต์ด้านบนชัดเจน แล้ว
                      ขยายข้อความจาก "View Detail" เป็น "View Recovery Detail" ตามตัวอย่างแรกที่ให้มา
                      v56: ฟีดแบ็ก "'View Recovery Detail' ยังเป็น Link แต่การ์ดทั้งใบ Premium มากแล้ว
                      ลองเปลี่ยนเป็น 'See Full Recovery'/'Recovery Details'/'View Insights'" — เลือก
                      "Recovery Details" (ตัวเลือกที่ 2 ที่เสนอมา) เพราะสั้นกระชับสุดใน 3 ตัวเลือกแต่ยัง
                      สื่อตรงว่าลิงก์นี้พาไปหน้ารายละเอียด (/recovery) เหมือนเดิมทุกประการ ไม่ใช้ "View
                      Insights" เพราะกว้างเกินไป ฟังดูเหมือนมีบทวิเคราะห์/คำแนะนำเพิ่มที่หน้า /recovery
                      ไม่มีจริง */}
                  <p className="mt-3 pt-3 border-t border-white/5 text-right text-xs text-amber">
                    Recovery Details →
                  </p>
                </>
              )
            })()}
          </Link>
        </div>
      )}

      {/* card 4: weekly goal — secondary weight, matches recovery/AI-coach treatment.
          uses the same ring as the hero card's daily progress so "goal completion" reads
          consistently as a ring throughout the dashboard, instead of a ring in one place
          and a flat percent-bar in another. */}
      <div
        // v41: เหตุผลเดียวกับการ์ด Recovery ด้านบน — ตัด glow ระดับการ์ดออก เหลือ border-line กลาง
        // v49: rounded-lg (8px) -> rounded-card (24px, token เดียวกับ PremiumCard) ตามฟีดแบ็ก Radius
        className="rounded-card bg-surface2/40 border border-line overflow-hidden animate-rise lg:col-start-10 lg:col-span-3 lg:row-start-1"
        style={{ animationDelay: '300ms' }}
      >
        <div className="px-4 py-4">
          {/* ฟีดแบ็ก "Weekly Goal/Volume/Consistency แยกกันมากจนรู้สึกเหมือน 3 ระบบ อยากได้การ์ดเดียวชื่อ
              'TRAINING THIS WEEK'" — เปลี่ยนป้ายหัวการ์ดจาก "Weekly Goal" (เดิมอ่านเหมือนพูดถึงแค่ % เดียว)
              เป็น "Training This Week" ให้ตรงกับบทบาทใหม่ที่ครอบทั้ง 3 ตัวเลข ไม่ใช่รื้อการ์ดย่อยที่เหลือ
              (WeeklyVolume/ConsistencyStrip/Heatmap) ทิ้ง — รายละเอียดเต็มยังอยู่ที่เดิมสำหรับคนที่อยากเจาะลึก
              จุดนี้แค่สรุปเลขให้เห็นภาพรวมเชื่อมกันโดยไม่ต้องเลื่อนไปดูอีก 2 การ์ด */}
          <p className="text-[12px] tracked uppercase text-muted mb-3">Training This Week</p>

          <div className="flex items-center gap-4">
            {/* v45: ฟีดแบ็ก "วงกลมชมพูโดดออกมา ไม่เข้ากับ Dark Titanium — เปลี่ยนเป็น Orange/Titanium
                Gold เข้ากว่า" — สีม่วงชมพูนีออน (#E339A6) เดิมมาจากมอคอัพ v3 ตอนนั้น ไม่ใช่โทนไทเทเนียม/
                อำพันที่เหลือทั้งแอปใช้ — เปลี่ยนเป็น COLORS.amber เดียวกับ Hero Ring/ปุ่ม CTA ทั่วแอป
                v47: ฟีดแบ็ก "อยากให้มี Animation เช่น Ring Glow เวลาครบเป้า" — ครบเป้า (pct >= 100) เดียว
                เท่านั้นที่ขึ้น (ไม่ใช่ ambient ตลอดเวลา ตามงบ motion ที่คุยกันไว้) ยืม .animate-pr-glow
                (ripple 2 ครั้งแล้วหยุด ใช้กับการ์ด PR celebration อยู่แล้ว) มาใช้ซ้ำแทนสร้าง keyframe ใหม่ */}
            <div
              className={data.weeklyGoalPct >= 100 ? 'rounded-full animate-pr-glow' : undefined}
              style={{ filter: `drop-shadow(0 0 4px ${withAlpha(COLORS.amber, '40')})`, ...({ '--pr-glow': 'rgba(232,163,61,.5)' } as React.CSSProperties) }}
            >
              {/* ฟีดแบ็ก "86% Goal ดูไม่สัมพันธ์กับข้อความข้างๆ (3 ครั้ง/อีก 2 ครั้งถึงเป้าหมาย) — 3/5 ครั้ง
                  ควรเป็น 60% ไม่ใช่ 86%" — weeklyGoalPct (lib fetchDashboardData ด้านบน) ไม่ใช่ % จำนวนครั้ง
                  ที่ฝึกจริงๆ แต่เป็นค่าเฉลี่ย % ของเป้าหมายเซ็ต/สัปดาห์ข้ามทุกกล้ามเนื้อ (Volume-based) คนละ
                  metric กับ "3 ครั้งแล้ว/อีก 2 ครั้ง" (นับจำนวนวันที่ฝึก) ที่วางอยู่ข้างๆ กันพอดี — ป้าย "Goal"
                  เดิมกำกวมทำให้ดูเหมือนเป็น metric เดียวกัน แก้ด้วยการเปลี่ยน label ให้ตรงกับสิ่งที่วัดจริง
                  (ไม่แตะสูตรคำนวณ weeklyGoalPct เอง เพราะใช้ร่วมกับ Fitness Score weighting อยู่ด้วย
                  เปลี่ยนความหมายตรงนั้นจะกระทบวงกว้างกว่านี้มาก) */}
              <GoalRing
                pct={data.weeklyGoalPct}
                size={72}
                strokeWidth={7}
                color={COLORS.amber}
                label="Volume"
                ariaLabel="Weekly Volume Progress"
                glow
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2.5">
                <span className="text-xl leading-none shrink-0" aria-hidden="true">🔥</span>
                <div className="min-w-0 flex-1">
                  {/* ฟีดแบ็ก "อยากให้ 'N/เป้า ครั้ง' เป็นตัวเลขหลักที่เห็นทันที + progress bar" — เดิมมีแค่
                      ข้อความ "N ครั้งแล้วในสัปดาห์นี้" ไม่เห็นเป้าหมายแบบภาพ ต้องอ่านป้าย motivation ข้างล่าง
                      ไปตีความเอาเอง — เปลี่ยนเป็นเศษส่วน N/เป้า ตัวหนาใหญ่ขึ้น พร้อม progress bar บางๆ
                      สีมอส (เฉดเดียวกับวันที่ฝึกแล้วใน day-tick row ด้านล่าง) แยกจาก amber ของ Volume ring
                      ข้างๆ เพื่อไม่ให้เข้าใจผิดว่าเป็นตัวเลขเดียวกัน (คนละ metric — ดู comment เดิมด้านบน) */}
                  <p className="text-base font-mono font-bold text-ink leading-none">
                    {data.thisWeekWorkoutDays}
                    <span className="text-muted font-normal">/{data.weeklyWorkoutGoal} ครั้ง</span>
                  </p>
                  <p className="text-[12px] text-muted mt-1">
                    {computeWorkoutMotivationLabel(data.thisWeekWorkoutDays, data.weeklyWorkoutGoal)}
                  </p>
                  <span className="relative block h-1.5 rounded-full bg-bg/60 overflow-hidden mt-1.5">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (data.thisWeekWorkoutDays / data.weeklyWorkoutGoal) * 100)}%`,
                        backgroundColor: COLORS.moss,
                      }}
                    />
                  </span>
                </div>
              </div>
              {/* ฟีดแบ็ก "'0 Day Streak' อ่านแปลกๆ ตอนไม่มี Streak — ควรเป็น 'Streak: 0 วัน' หรือ '0 วัน
                  ต่อเนื่อง'" — สลับลำดับคำให้อ่านเป็นภาษาไทยธรรมชาติแทนแปลตรงตัวจากอังกฤษ */}
              <p className="text-[12px] text-muted mt-2.5">
                <span className="text-ink font-mono">{data.streak}</span> วันต่อเนื่อง
              </p>
              {/* ฟีดแบ็ก "Weekly Goal ดีมากแล้ว แต่ควรเชื่อมกับ Action ทันที เช่น 'Next → Lower Body'" —
                  ใช้ `next` ตัวเดียวกับที่การ์ด "Next up" แยกต่างหากด้านล่างเคยใช้ (ย้ายมารวมที่นี่แทน ตัด
                  การ์ดแยกทิ้ง — ฟีดแบ็กข้อ 17 บอกว่า Weekly Goal/Volume/Consistency "แยกกันมากจนรู้สึกเหมือน
                  3 ระบบ" นี่คือก้าวแรกที่รวมชิ้นที่เกี่ยวข้องกันจริงๆ เข้าด้วยกัน) truncate กัน title ยาว
                  (เช่น "Day 5 — Lower (Hamstring/Glute)") ล้นการ์ดแคบๆ นี้
                  บั๊ก (ฟีดแบ็ก "วันนี้วันอังคารมีตารางฝึกอยู่และยังไม่ได้ฝึก แต่การ์ดขึ้น Next → วันพฤหัส
                  ข้ามวันนี้ไปเลย"): findNextProgramDay เริ่มนับจาก offset=1 เสมอ (ข้ามวันนี้ไม่ว่าจะฝึก
                  ไปแล้วหรือยัง) ทำให้ตอนวันนี้เองมีตารางฝึกอยู่แต่ยังไม่เสร็จ กลับข้ามไปโชว์วันถัดไปแทนที่จะ
                  เตือนวันนี้ก่อน — ใช้ scheduledDay/todayCompleted ตัวเดียวกับที่การ์ด Today's Workout hero
                  ด้านบนใช้อยู่แล้ว: มีตารางวันนี้ + ยังไม่เสร็จ = โชว์ "Today →" แทน ไม่ข้ามไปวันอื่น */}
              {scheduledDay && !todayCompleted ? (
                <p className="text-[12px] mt-1 truncate" style={{ color: COLORS.amber }}>
                  Today → {splitTitleDetail(scheduledDay.title).main}
                </p>
              ) : (
                next && (
                  <p className="text-[12px] mt-1 truncate" style={{ color: COLORS.amber }}>
                    Next → {splitTitleDetail(next.day.title).main}
                  </p>
                )
              )}
            </div>
          </div>

          {/* day-tick row (จ-อา) — เช็คว่าวันไหนของสัปดาห์นี้ออกกำลังกายแล้วบ้าง */}
          <div className="grid grid-cols-7 gap-1.5 mt-4">
            {data.weekDayTicks.map((tick, i) => (
              <div
                key={tick.iso}
                className="flex flex-col items-center gap-1"
                role="img"
                aria-label={`${WEEKDAY_LABELS[i]}: ${tick.trained ? 'ฝึกแล้ว' : tick.isFuture ? 'ยังไม่ถึงวัน' : 'ยังไม่ได้ฝึก'}`}
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] shrink-0"
                  style={
                    tick.trained
                      ? { backgroundColor: COLORS.moss, color: NEUTRAL.onAmberText }
                      : { backgroundColor: NEUTRAL.chipInactive, color: NEUTRAL.mutedIcon }
                  }
                  aria-hidden="true"
                >
                  {tick.trained ? '✓' : ''}
                </span>
                <span className={`text-[12px] ${tick.isFuture ? 'text-muted/50' : 'text-muted'}`} aria-hidden="true">
                  {WEEKDAY_LABELS[i]}
                </span>
              </div>
            ))}
          </div>

          {/* ฟีดแบ็ก "Volume/Consistency อยู่ชิดด้านล่างมาก ดูเหมือนข้อมูลประกอบเล็กๆ — อยากให้เป็น
              Secondary Metrics ที่อ่านง่ายขึ้น: ตัวเลขใหญ่ + label ใต้ตัวเลข แบบเดียวกับ 97 Sets/Weekly
              Volume, 47%/Consistency" — เดิมเป็นบรรทัดเดียวความสูง text-[11px] ("Volume 97 เซ็ต · Consistency
              47%") อ่านเป็น caption ประกอบ ไม่ใช่ metric จริง เปลี่ยนเป็น 2-column stat block (ตัวเลขใหญ่
              font-mono font-bold ด้านบน + label ตัวพิมพ์เล็กจางด้านล่าง) รูปแบบเดียวกับแถว Exercises/Sets/
              นาที ในการ์ด Today's Workout ด้านบน — ตัวเลข/สูตรคำนวณไม่เปลี่ยน (ยังเป็น weeklyTotalSets/
              weeklyConsistencyPct ชุดเดียวกับ WeeklyVolume/ConsistencyStrip เป๊ะ) */}
          <div className="grid grid-cols-2 gap-3 mt-3.5 pt-3 border-t border-white/5">
            <div>
              <p className="font-mono font-bold text-base text-ink leading-none">
                {data.weeklyTotalSets} <span className="text-[12px] font-sans font-normal text-muted">sets</span>
              </p>
              <p className="text-[12px] text-muted mt-1">Weekly Volume</p>
            </div>
            {data.weeklyConsistencyPct != null && (
              <div>
                <p className="font-mono font-bold text-base text-ink leading-none">{data.weeklyConsistencyPct}%</p>
                <p className="text-[12px] text-muted mt-1">Consistency</p>
              </div>
            )}
          </div>

          {/* ฟีดแบ็ก "ทำปุ่ม Share สรุปประจำสัปดาห์ออกมาเป็นภาพสไตล์ Spotify Wrapped แชร์ลง IG Story ได้"
              — วางในการ์ดนี้เพราะมีตัวเลขสรุปสัปดาห์ครบที่สุดอยู่แล้ว (Goal/Training days/Volume/
              Consistency) ไม่ต้องดึงข้อมูลเพิ่ม */}
          <div className="mt-3.5 pt-3 border-t border-white/5 flex justify-center">
            <ShareWeeklySummaryButton
              stats={{
                dateRangeLabel:
                  data.weekDayTicks.length > 0
                    ? `${new Date(data.weekDayTicks[0].iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} - ${new Date(
                        data.weekDayTicks[data.weekDayTicks.length - 1].iso + 'T00:00:00'
                      ).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`
                    : '',
                streak: data.streak,
                workoutDays: data.thisWeekWorkoutDays,
                workoutGoal: data.weeklyWorkoutGoal,
                weeklyTotalSets: data.weeklyTotalSets,
                weeklyConsistencyPct: data.weeklyConsistencyPct,
                weeklyGoalPct: data.weeklyGoalPct,
              }}
            />
          </div>
        </div>
      </div>

      {/* card 5 (optional): AI coach — sits under Weekly Goal in the rightmost column and
          spans down alongside the quick-actions/heatmap rows (lg:row-span-2 — the cluster is
          now only 3 rows tall since the standalone "today muscle" row was folded into the
          hero card above).
          v42: ฟีดแบ็ก "Version 3" มอคอัพมี AI Coach panel เป็นทรง ring-avatar + headline + recovery bar
          + gradient CTA เหมือนกับที่มือถือมี AICoachCompactCard อยู่แล้ว (ไม่ใช่ list InsightCard เฉยๆ
          แบบเดิม) — สลับมาใช้ AICoachCompactCard ตัวเดียวกับมือถือตรงๆ (รับ props message/
          muscleRecommendation ชุดเดียวกับที่ MobileDashboardView ส่งอยู่แล้ว ไม่ต้องเขียนใหม่) เป็นชิ้นบนสุด
          — insight list เดิม (เทรนด์ไขมัน/กล้ามเนื้อ/วอลุ่ม ฯลฯ) ยังเก็บไว้ครบ วางต่อท้ายด้านล่างแทนที่จะ
          ทิ้ง เพราะเป็นข้อมูลที่ AICoachCompactCard เองไม่ได้ครอบคลุม — เอา wrapper กรอบ/พื้นหลังเดิมออก
          (bg-surface2/40 border) เพราะ AICoachCompactCard มีกรอบไทเทเนียม+badge "อัปเดตล่าสุด" ของตัวเอง
          อยู่แล้ว ซ้อนกรอบซ้ำจะกลายเป็นการ์ดในการ์ด ส่วน InsightCard เองก็มีกรอบตัวเองอยู่แล้วเช่นกัน —
          ป้าย "อัปเดต" เดิมตรงนี้ตัดออกด้วย (ซ้ำกับ badge ในตัว AICoachCompactCard) เช่นเดียวกับ fallback
          block เดิม (ไม่มี insight) เพราะ AICoachCompactCard เองมี fallback แสดง message อยู่แล้วในตัว —
          ส่วนบล็อกสรุปสถิติรายสัปดาห์ที่เคยอยู่ใน fallback นั้นตัดออกเพราะซ้ำกับการ์ด Weekly Goal ที่อยู่
          เหนือขึ้นไปแล้ว (ครั้งที่ฝึกสัปดาห์นี้ + weeklyGoalPct) */}
      {prefs.showAICoach && (
        <div
          className="flex flex-col gap-3 animate-rise lg:col-start-10 lg:col-span-3 lg:row-start-2 lg:row-span-2"
          style={{ animationDelay: '360ms' }}
        >
          <AICoachCompactCard
            message={data.aiDailySummary}
            muscleRecommendation={data.todaysRecommendation}
            href="/coach"
            lastUpdatedAt={dataUpdatedAt}
            recoveryDates={data.recoveryDates}
            isRecommendationForToday={data.isRecommendationForToday}
            todayWorkoutTitle={workoutTitle}
          />
          {/* v48: ฟีดแบ็ก "Insight มี 2 ใบ วางซ้อนกันแนวตั้งกินพื้นที่ ทำเป็น Carousel จะดีกว่า" —
              เดิม map วาง InsightCard เรียงต่อกัน space-y-2 (สูงเท่าจำนวนใบรวมกัน) เปลี่ยนเป็น
              InsightCarousel ปัดแนวนอนทีละใบแทน สูงคงที่แค่ 1 ใบเสมอไม่ว่าจะมีกี่ insight */}
          <InsightCarousel insights={combinedInsights} imageFor={(insight) => INSIGHT_IMAGE[`${insight.id}|${insight.kind}`]} />
        </div>
      )}
      </div>

      {/* merged quick actions — lg only. Below lg, the two original quick-action groups
          above/below (quick-start + log/templates/stats) stay as-is; at xl they're both
          hidden and replaced by this single deduplicated row so the 12-col grid doesn't
          show the same "บันทึก"/"เทมเพลต" shortcuts twice. Narrowed to col-span-9 (from 12)
          so it sits beside the AI Coach card instead of running underneath it. */}
      <div className="hidden lg:flex lg:flex-col lg:col-start-1 lg:col-span-9 lg:row-start-2 gap-3">
        <div className={`grid gap-3 ${data.hasAnyHistory ? 'grid-cols-5' : 'grid-cols-4'}`}>
          <QuickAction href="/log" label="บันทึกสถิติ" icon="➕" accent="moss" weight="primary" />
          <QuickAction href="/templates" label="เลือกโปรแกรม" icon="📋" accent="steel" />
          <QuickAction href="/health" label="วิเคราะห์ร่างกาย" icon="🔍" accent="amber" />
          <QuickAction href="/stats" label="สถิติ" icon="📈" accent="rust" weight="tertiary" />
          {data.hasAnyHistory && <QuickAction href="/coach" label="ถาม AI" icon="🤖" accent="violet" weight="tertiary" />}
        </div>
      </div>

      {/* ฟีดแบ็ก (Information Hierarchy review, รอบที่ 3) — จุดจบของ Home คือ Weekly Insights (ดู
          คอมเมนต์ที่ import ด้านบน) เดิมตรงนี้เป็น WeeklyMuscleHeatmap (col-span-6) + WeeklyVolume
          (col-span-3) วางคู่กัน ทั้งคู่ย้ายไปอยู่ /stats แล้ว (รายละเอียดเต็มยังอยู่ครบที่นั่น) แทนที่ด้วย
          WeeklyInsightsCard เต็มความกว้าง (col-span-9 เท่าแถว QuickAction ด้านบน — ไม่ชนคอลัมน์ AI Coach
          ที่ row-span 2 คร่อมแถวนี้อยู่ที่คอลัมน์ 10-12) */}
      <div className="lg:col-start-1 lg:col-span-9 lg:row-start-3">
        <WeeklyInsightsCard streak={data.streak} />
      </div>
      </div>
      {/* end cards cluster sub-grid */}

      {/* quick actions — hidden at xl, superseded by the merged row placed with lg:order-9 above */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:hidden">
        <QuickAction href="/log" label="บันทึกสถิติ" icon="✚" accent="moss" weight="primary" />
        <QuickAction href="/templates" label="เทมเพลต" icon="📋" accent="steel" />
        <QuickAction href="/health" label="วิเคราะห์" icon="🔍" accent="amber" />
        <QuickAction href="/stats" label="สถิติ" icon="📈" accent="rust" weight="tertiary" />
      </div>
      </div>

      {settingsOpen && (
        <DashboardSettings
          open={settingsOpen}
          prefs={prefs}
          onChange={updatePrefs}
          onClose={() => setSettingsOpen(false)}
          displayName={data.profileDisplayName ?? ''}
          displayNamePlaceholder={emailDisplayName(data.email)}
          onSaveDisplayName={handleSaveDisplayName}
        />
      )}
    </>
  )
}

// v49: ฟีดแบ็ก "แต่ละ Card ใช้สีคนละแบบ...ควรมี Design System อิง Token เดียว" — เดิมไฟล์นี้มี object นี้
// ประกาศ hex ซ้ำกับ COLORS ใน lib/theme.ts เป๊ะทั้ง 5 ค่า (amber/steel/moss/violet/rust) แยกเป็นชุด
// ของตัวเอง ถ้าใครเปลี่ยนสีใน lib/theme.ts จะไม่มีผลกับปุ่ม Quick Action เลย — เก็บแค่ type ที่จำกัด 5
// คีย์ไว้ (QuickAction ตั้งใจให้เลือกได้แค่ 5 สีนี้ ไม่ใช่ทุกสีใน COLORS) แต่ดึงค่าจริงจาก COLORS แทน
type QuickActionAccent = 'amber' | 'steel' | 'moss' | 'violet' | 'rust'

function QuickAction({
  href,
  label,
  icon,
  accent = 'amber',
  weight = 'secondary',
}: {
  href: string
  label: string
  icon: string
  accent?: QuickActionAccent
  // ฟีดแบ็ก "Quick Actions ไม่จำเป็นต้องมี visual weight เท่ากันทุกปุ่ม — User Journey ควรเป็น Primary
  // (บันทึก Workout) / Secondary (เลือกโปรแกรม, วิเคราะห์ร่างกาย) / Tertiary (Statistics, AI Coach)" —
  // ต่างจาก glow/gradient/animation ใหม่ (ฟีดแบ็กข้อ 12 บอกให้ "หยุดเพิ่ม Effect แล้ว") ใช้แค่ font-weight/
  // สีตัวหนังสือ/ความเข้มพื้นไอคอนที่มีอยู่แล้วสร้างลำดับความสำคัญ ไม่แตะ layout/ขนาดปุ่ม/เพิ่มเลเยอร์ใหม่เลย
  weight?: 'primary' | 'secondary' | 'tertiary'
}) {
  const hex = COLORS[accent]
  const iconBgAlpha = weight === 'primary' ? '2E' : weight === 'tertiary' ? '16' : '22'
  return (
    <>
      {/* v45: ฟีดแบ็ก "Quick Action ยังเรียบไป อยากได้ Glass Button + Glow ตอน Hover" — เดิมพื้นทึบ
          bg-surface เรียบๆ ไม่มี glow เลย — เปลี่ยนพื้นเป็นกระจกโปร่งแสง (backdrop-blur เดียวกับ
          GlassCard.tsx) พักตอนปกติไม่มี glow เลย (กัน 4-5 ปุ่มเรืองแสงพร้อมกันทั้งแถว ขัดกฎ "Less Glow
          More Material") glow สีตามแอคเซนต์เดิมของแต่ละปุ่มโผล่เฉพาะตอน hover เท่านั้น
          v47: ฟีดแบ็ก "ยังดูเป็น Button ธรรมดา ถ้าทำ Hover Glow + Glass Shadow จะดูเหมือน Apple มาก" —
          เพิ่ม inset rim light บางๆ ขอบบน (มองเห็นได้แม้ตอนปกติ ไม่ต้อง hover ก่อน ให้รู้สึกเป็น "กระจก" ตั้งแต่
          แรกเห็น ไม่ใช่กล่องทึบ) + เงาลอยเบาๆ ตอนปกติ (contact shadow) — ตอน hover ยกขึ้นเล็กน้อย (-1px)
          พร้อม glow สีแอคเซนต์ + เงากว้างขึ้น ให้รู้สึกเป็นปุ่มกระจกยกตัวแบบ Apple จริงๆ ไม่ใช่แค่ขอบเรืองแสง —
          border/boxShadow ย้ายจาก inline style มาไว้ใน <style jsx> ทั้งคู่ (rest + hover) เพราะ inline
          style attribute มี specificity สูงกว่า stylesheet เสมอ (ไม่ว่า pseudo-class จะเจาะจงแค่ไหน) —
          ตอนแรก border/boxShadow ยังอยู่ใน inline style เดิมทำให้กฎ :hover ด้านล่างไม่มีทางชนะ เขียนสอง
          property นี้ไปแล้วแต่ hover ไม่เห็นผลจริงเลย (ตรวจพบจาก computed style ไม่ตรงกับที่คาด) */}
      <Link
        href={href}
        className="quick-action relative rounded-lg backdrop-blur-md flex items-center gap-2.5 px-3 py-3 transition active:scale-[0.99]"
        style={{ backgroundImage: 'linear-gradient(180deg, #1B1D20cc, #0D0E10cc)' }}
      >
        <span
          className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 text-base"
          style={{ backgroundColor: `${hex}${iconBgAlpha}` }}
          aria-hidden="true"
        >
          {icon}
        </span>
        <span
          className={`text-[12px] font-display tracked uppercase truncate ${weight === 'primary' ? 'font-semibold text-ink' : weight === 'tertiary' ? 'text-muted' : 'text-ink'}`}
        >
          {label}
        </span>
      </Link>
      <style jsx>{`
        .quick-action {
          border: 1px solid rgba(255, 255, 255, 0.06);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 2px 8px rgba(0, 0, 0, 0.25);
        }
        @media (hover: hover) {
          .quick-action:hover {
            border-color: ${hex}66;
            transform: translateY(-1px);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 6px 16px rgba(0, 0, 0, 0.3), 0 0 16px ${hex}4d;
          }
        }
      `}</style>
    </>
  )
}
