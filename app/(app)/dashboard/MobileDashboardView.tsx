'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useDashboardSettings } from '@/components/DashboardSettingsProvider'
import { todayDayOfWeek, todayStr } from '@/lib/weekdays'
import {
  computeTodayTotals,
  computeRecoveryPct,
  recoveryStatusColor,
  findNextProgramDay,
  recoveryRecommendationLabel,
} from '@/lib/dashboardStats'
import { saveDisplayName } from '@/lib/profile'
import { RECOVERY_MUSCLES } from '@/lib/muscle-groups'
import { DEFAULT_DASHBOARD_PREFS, loadDashboardPrefs, saveDashboardPrefs, type DashboardPrefs } from '@/lib/dashboardPrefs'
import { isOnboardingBannerDismissed, dismissOnboardingBanner } from '@/lib/onboarding'
import {
  fetchDashboardData,
  greeting,
  emailDisplayName,
  type DashboardData,
} from './DashboardView'
import { computeFitnessScore } from '@/lib/fitnessScore'
import { dashboardSpec } from '@/lib/dashboardSpec'
import {
  NOISE_BG,
  DASHBOARD_BG_CSS,
  VIGNETTE_CSS,
  DIAGONAL_TITANIUM_CSS,
  DIAGONAL_TITANIUM_FADE_MASK,
  DIAGONAL_TITANIUM_MICRO_REFLECTION_CSS,
  AMBIENT_ORANGE_CSS,
  BLUE_AMBIENT_CSS,
  RADIAL_SHADOW_CSS,
  PAGE_REFLECTION_CSS,
  HAIRLINE_SCRATCH_BG,
} from '@/lib/theme'
import GoalRing from '@/components/GoalRing'
import MobileDashboardSkeleton from '@/components/MobileDashboardSkeleton'
import OnboardingBanner from '@/components/OnboardingBanner'
import ErrorState from '@/components/ErrorState'
import Skeleton from '@/components/Skeleton'
import BodyMetricsRow from '@/components/BodyMetricsRow'
import ConsistencyStrip from '@/components/ConsistencyStrip'
import Header from '@/components/dashboard/Header'
import WorkoutStreakCard from '@/components/WorkoutStreakCard'
import WeeklyGoalMuscleCard from '@/components/WeeklyGoalMuscleCard'
import WeeklyVolumeRecoveryCard from '@/components/WeeklyVolumeRecoveryCard'
import RecommendedProgramCard from '@/components/RecommendedProgramCard'
import TodaysFocusCard from '@/components/TodaysFocusCard'
import TodaysWorkoutCompactCard from '@/components/TodaysWorkoutCompactCard'
import TodayHealthStatsRow from '@/components/TodayHealthStatsRow'
import { useHealthSnapshot } from '@/lib/healthIntegration'
import AICoachCompactCard from '@/components/AICoachCompactCard'

// การ์ดหนักๆ ที่ไม่จำเป็นต้องเห็นทันทีตอนเปิดหน้า — โหลดแยก bundle เหมือนฝั่งเดสก์ท็อป
const WeeklyMuscleHeatmap = dynamic(() => import('@/components/WeeklyMuscleHeatmap'), {
  loading: () => <Skeleton className="h-80 w-full rounded-lg" />,
})
const WeeklyVolume = dynamic(() => import('@/components/WeeklyVolume'), {
  loading: () => <Skeleton className="h-56 w-full rounded-lg" />,
})
const WeeklyCardioVolume = dynamic(() => import('@/components/WeeklyCardioVolume'), {
  loading: () => <Skeleton className="h-56 w-full rounded-lg" />,
})
const DashboardSettings = dynamic(() => import('@/components/DashboardSettings'), { ssr: false })

// ตัด "สถิติ" (/stats), "ถาม AI" (/coach) และ "บันทึกสถิติ" (/log) ออกจากแถวนี้ — ซ้ำซ้อนกับที่มีอยู่แล้ว
// ในหน้าเดียวกัน: "สถิติ" ซ้ำกับแท็บ "สถิติ" ใน bottom nav ตรงๆ, "ถาม AI" ซ้ำกับการ์ด AICoachCompactCard
// ที่วางอยู่เหนือแถวนี้ทันที (ไปหน้า /coach เหมือนกัน), ส่วน "บันทึกสถิติ" ซ้ำกับ TodaysFocusCard และ
// TodaysWorkoutCompactCard ด้านบน ซึ่งทั้งคู่ลิงก์ไป /log อยู่แล้วเมื่อวันนี้ไม่มีโปรแกรมกำหนดไว้
// (scheduledDay ? '/session' : '/log')
const QUICK_ACTIONS = [
  { href: '/templates', label: 'เลือกโปรแกรม', icon: '📋', accent: '#6C8CA8' },
  { href: '/health', label: 'วิเคราะห์ร่างกาย', icon: '🔍', accent: '#E8A33D' },
] as const

/**
 * ดีไซน์เฉพาะมือถือ — ต่างจาก DashboardView (เดสก์ท็อป) ตรงที่:
 * - การ์ดหลักเรียงแนวตั้งเป็นแถบเดียว ไม่มี multi-column grid
 * - Recovery / Weekly Goal / AI Coach ถูกรวมเป็น "การ์ดปัดได้" (horizontal scroll-snap)
 *   แทนที่จะเป็นการ์ดแยกวางเคียงกัน — เหมาะกับนิ้วโป้งปัดบนจอแคบมากกว่า
 * - Quick actions เป็นแถวเลื่อนแนวนอน ไม่ใช่ grid ตายตัว กันไม่ให้ปุ่มเล็กเกินไปเมื่อมีเยอะ
 *
 * ใช้ fetchDashboardData/DashboardData ชุดเดียวกับเดสก์ท็อป (import จาก DashboardView) —
 * ข้อมูลและ business logic เป็นแหล่งเดียว มีแค่การจัดวาง/ดีไซน์ที่ต่างกัน
 */
export default function MobileDashboardView() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const today = todayStr()

  const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_DASHBOARD_PREFS)
  const { open: settingsOpen, setOpen: setSettingsOpen } = useDashboardSettings()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [greetingText, setGreetingText] = useState('สวัสดี')
  const [bannerDismissed, setBannerDismissed] = useState(true)
  const [showMore, setShowMore] = useState(false)

  useEffect(() => {
    setPrefs(loadDashboardPrefs())
    setGreetingText(greeting())
    setBannerDismissed(isOnboardingBannerDismissed())
  }, [])

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

  const { data, isLoading, isError } = useQuery({
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

  const health = useHealthSnapshot()
  const dow = todayDayOfWeek()

  const scheduledDay = useMemo(
    () => data?.programDays.find((d) => d.day_of_week === dow) ?? null,
    [data?.programDays, dow]
  )
  const next = useMemo(() => (data ? findNextProgramDay(data.programDays, dow) : null), [data, dow])
  const totals = useMemo(() => computeTodayTotals(data?.todayWorkouts ?? []), [data?.todayWorkouts])
  // กลุ่มกล้ามเนื้อของโปรแกรมวันนี้ (จาก ProgramExercise.muscle_group จริง ไม่ใช่พาร์สจากชื่อโปรแกรม
  // ที่ผู้ใช้พิมพ์เอง) — ใช้กับบรรทัด "Chest • Triceps" ใน TodaysWorkoutCompactCard
  const todayMuscleGroups = useMemo(
    () => Array.from(new Set(data?.todayExercises.map((e) => e.muscle_group).filter((m): m is string => !!m) ?? [])),
    [data?.todayExercises]
  )

  const workoutTitle = scheduledDay?.title ?? ((data?.todayWorkouts.length ?? 0) > 0 ? 'บันทึกอิสระ' : null)
  const progressPct =
    data && data.todayExercises.length > 0 ? Math.round((data.completedCount / data.todayExercises.length) * 100) : null
  const progressPctForLabel =
    data && data.todayExercises.length > 0
      ? Math.round((data.completedCount / data.todayExercises.length) * 100)
      : (data?.todayWorkouts.length ?? 0) > 0
        ? 100
        : null
  const recoveryLabelPct = progressPctForLabel

  const recoveryPctMap = useMemo(() => {
    const map: Record<string, number> = {}
    RECOVERY_MUSCLES.forEach((mg) => {
      map[mg] = computeRecoveryPct(data?.recoveryDates[mg] ?? null, mg)
    })
    return map
  }, [data])

  // muscleRecommendation คำนวณมาแล้วใน fetchDashboardData (ชุดเดียวกับเดสก์ท็อป) — ใช้ตรงจาก
  // data ได้เลย ไม่ต้องคำนวณซ้ำฝั่ง client
  const muscleRecommendation = data?.muscleRecommendation ?? null

  // MobileDashboardSkeleton (แทน DashboardSkeleton ตัวกลางเดิม) — mirror ความสูง/gap จาก
  // dashboardSpec ตัวเดียวกับที่โครงจริงของหน้านี้ใช้ กันไม่ให้เนื้อหา "กระโดด" ตอนโหลดข้อมูลเสร็จ
  // (DashboardSkeleton เดิมยังใช้อยู่ที่เดสก์ท็อป/page.tsx เหมือนเดิม ไม่กระทบ)
  if (isLoading || !data) {
    return <MobileDashboardSkeleton />
  }

  if (isError) {
    return <ErrorState title="โหลด Dashboard ไม่สำเร็จ" message="ไม่สามารถโหลด Dashboard ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่" onRetry={retry} />
  }

  const overallRecoveryPct = Math.round(
    RECOVERY_MUSCLES.reduce((sum, mg) => sum + recoveryPctMap[mg], 0) / RECOVERY_MUSCLES.length
  )

  // ปัจจัย Recovery ของ Fitness Score เท่านั้น (ไม่ใช่ overallRecoveryPct ด้านบน ซึ่งการ์ด "ฟื้นตัวรวม"
  // (GoalRing) กับตารางรายละเอียดยังใช้ตามปกติ ไม่แตะ) — เอาเฉพาะกลุ่มกล้ามเนื้อที่มีประวัติฝึกจริง
  // (recoveryDates[mg] ไม่ null) มาเฉลี่ย ไม่นับกลุ่มที่ยังไม่เคยฝึกเลยว่า "ฟื้นตัวเต็มที่" (100%) แบบที่
  // computeRecoveryPct คืนค่าไว้ เพราะนั่นจะ reward คนไม่ออกกำลังกายเลยด้วยแต้ม Recovery เต็ม — ถ้ายังไม่
  // เคยฝึกกลุ่มไหนเลยสักกลุ่ม ปัจจัยนี้เป็น null (ไม่มีข้อมูลให้วัด) ให้ computeFitnessScore ตัดออกแล้ว
  // กระจายน้ำหนักให้ปัจจัยอื่นแทน เหมือนที่ Sleep ทำอยู่แล้ว — ตาม pattern แอปแทร็กกล้ามเนื้อจริงๆ (Hevy,
  // Strong ฯลฯ) ที่ไม่โชว์ recovery indicator จนกว่าจะฝึกครั้งแรก
  const trainedRecoveryMuscles = RECOVERY_MUSCLES.filter((mg) => data?.recoveryDates[mg])
  const fitnessScoreRecoveryPct =
    trainedRecoveryMuscles.length > 0
      ? Math.round(trainedRecoveryMuscles.reduce((sum, mg) => sum + recoveryPctMap[mg], 0) / trainedRecoveryMuscles.length)
      : null

  // Fitness Score — สูตรตามที่กำหนด: Workout Completion 30% / Streak 20% / Sleep 20% /
  // Recovery 15% / Weekly Goal 10% / Activity วันนี้ 5% — FITLOG ไม่มีข้อมูลการนอนเลย (ไม่ได้
  // เชื่อมต่อ Apple Health/Google Fit) จึง Sleep เป็น null เสมอ แล้วให้ computeFitnessScore
  // กระจายน้ำหนัก 20% นั้นไปให้ปัจจัยอื่นตามสัดส่วนเดิมแทน (ดู lib/fitnessScore.ts)
  // - Workout Completion: ฝึกกี่วันใน 7 วันล่าสุด (data.last7DaysTrainedCount) แปลงเป็น 0-100
  // - Streak: จำกัดเพดานที่ 14 วัน = เต็ม 100% (ยาวกว่านั้นก็ยังนับเต็ม)
  // - Activity วันนี้: ใช้ตัวเดียวกับ ring ในการ์ด Today's Workout (progressPct)
  const fitnessScore = computeFitnessScore([
    { key: 'workout', value: Math.round((data.last7DaysTrainedCount / 7) * 100), weight: 30 },
    { key: 'streak', value: Math.min(100, Math.round((data.streak / 14) * 100)), weight: 20 },
    { key: 'sleep', value: null, weight: 20 },
    { key: 'recovery', value: fitnessScoreRecoveryPct, weight: 15 },
    { key: 'weeklyGoal', value: data.weeklyGoalPct, weight: 10 },
    { key: 'activityToday', value: progressPct ?? (totals.entryCount > 0 ? 100 : 0), weight: 5 },
  ])

  // การ์ด Recovery แบบละเอียด (ต่อกล้ามเนื้อ) — ย้ายไปไว้ในส่วน "ดูสถิติเพิ่มเติม" ด้านล่างแทน
  // เพราะมีวงแหวน Recovery แบบย่อ (ภาพรวมเฉลี่ย) อยู่ใน WeeklyVolumeRecoveryCard ด้านบนแล้ว
  // อันนี้คือ "รายละเอียดเต็ม" สำหรับคนที่อยากดูเจาะจงเป็นกล้ามเนื้อ ไม่ต้องโชว์ตลอดเวลา
  // (เดิมเคยอยู่ในแถบปัด (carousel) คู่กับ AI Coach — แต่ AI Coach มี AICoachCompactCard
  // แสดงอยู่แล้วด้านบน โชว์ซ้ำสองที่จึงตัดออกจากแถบปัดไปเลย ไม่ย้ายไปไว้ที่ไหนอีก)
  const recoveryDetailCard = prefs.showRecovery ? (
    <Link href="/recovery" className="block rounded-lg bg-surface2/40 border overflow-hidden px-5 py-4 active:bg-surface2 transition" style={{ borderColor: '#60A5FA4D', boxShadow: '0 0 10px #60A5FA33' }}>
          <p className="text-[10px] tracked uppercase text-muted mb-3">Recovery</p>
          {muscleRecommendation &&
            (() => {
              const recColor = recoveryStatusColor(muscleRecommendation.pct)
              const isFullyReady = muscleRecommendation.pct >= 90
              return (
                <div className="flex items-center justify-between gap-2 rounded-md px-2.5 py-2 mb-3" style={{ backgroundColor: recColor + '1A' }}>
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-sm shrink-0" aria-hidden="true">💪</span>
                    <p className="text-xs text-ink whitespace-pre-line">
                      {recoveryRecommendationLabel(recoveryLabelPct)}{' '}
                      <span className="font-display tracked uppercase" style={{ color: recColor }}>
                        {muscleRecommendation.muscleGroup}
                      </span>{' '}
                      <span className="text-muted">— ฟื้นตัวแล้ว {muscleRecommendation.pct}%</span>
                    </p>
                  </span>
                  {isFullyReady && (
                    <span className="shrink-0 text-[10px] font-display tracked uppercase rounded-full px-2.5 py-1" style={{ backgroundColor: recColor, color: '#14161A' }}>
                      พร้อมลุย
                    </span>
                  )}
                </div>
              )
            })()}
          <div className="flex items-center gap-4">
            <div style={{ filter: 'drop-shadow(0 0 8px #22D3EE88)' }}>
              <GoalRing pct={overallRecoveryPct} size={72} strokeWidth={7} color="#22D3EE" label="ฟื้นตัวรวม" ariaLabel="ฟื้นตัวรวมทุกกลุ่มกล้ามเนื้อ" />
            </div>
            <div className="grid grid-cols-2 gap-2 flex-1 min-w-0">
              {RECOVERY_MUSCLES.map((mg) => {
                const pct = recoveryPctMap[mg]
                const color = recoveryStatusColor(pct)
                return (
                  <div key={mg} className="flex items-center justify-between gap-2 rounded-md bg-surface2 px-2 py-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] text-ink truncate">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      {mg}
                    </span>
                    <span className="font-mono text-[11px] shrink-0" style={{ color }}>{pct}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </Link>
  ) : null

  return (
    <>
      {/* พื้นหลังหน้า — v3: ตัดจุดแสงสีอุ่นฟุ้งใหญ่ (amber/rust/moss blur blob) ที่เคยกระจายเกือบเต็ม
          ความสูงหน้าออกทั้งหมด (รอบก่อนทำให้ทั้งหน้าดูอมส้ม/น้ำตาล กลืนกับการ์ด กลืนกับ Header จนความ
          รู้สึก "โลหะเย็น" หายไป) เหลือแค่ไล่สีเทาเย็นล้วนๆ (DASHBOARD_BG_CSS, ตอนนี้มี micro-gradient
          เกรย์สเกลจางๆ ซ้อนอยู่ในตัวแล้ว) + เกรนผิวโลหะ + vignette — แสงสีส้มยังอยู่ครบ แต่ย้ายไปประจำ
          ที่จุด Interactive เฉพาะ (Fitness Score bloom, ปุ่ม Start Workout, กระดิ่งแจ้งเตือน) แทนที่จะเป็น
          ambient เต็มจอแบบเดิม ให้สายตาโฟกัสเฉพาะจุดที่ควรสนใจ — noise กลับขึ้นจาก 0.01 เป็น 0.02
          (deferred item จากรอบก่อนๆ ที่บอกว่า "เพิ่มทีหลังได้" — ตอนนี้ถึงคิวแล้ว) ตาม micro noise ~2%
          ที่ขอ ยังคงเบากว่า micro-gradient ในการสร้างความต่างของพื้นผิวหลัก
          v12: กลับมาเพิ่มลายเฉียงไทเทเนียม (DIAGONAL_TITANIUM_CSS) + แสงส้ม ambient จางมาก
          (AMBIENT_ORANGE_CSS) ทั่วทั้งหน้าอีกครั้ง ตามคำขอ "Dark Titanium Material System" ที่ตั้งใจย้อน
          ทิศทาง v3 ข้างบนบางส่วนแบบมีเหตุผล — ครั้งนี้บางกว่าของเดิมที่เคยตัดออกมาก (2.5%/3.5% ไม่ใช่จุด
          แสงส้มฟุ้งเข้มแบบเดิม) ให้แค่ "รู้สึกได้" ว่าการ์ดทุกใบอยู่ในห้อง/วัสดุเดียวกัน ไม่ใช่กลืนกันจนสูญเสีย
          ความรู้สึกโลหะเย็นแบบที่เคยเป็นปัญหา */}
      {/* animate-fade-scale-in (Phase 5 Motion "Card Fade + Scale เมื่อโหลดข้อมูล") — div นี้ (root
          ของเนื้อหาจริง) render ได้ก็ต่อเมื่อผ่าน isLoading||!data check ด้านบนไปแล้วเท่านั้น จึงเป็น
          จุดเดียวที่ trigger พอดีตอนสลับจาก MobileDashboardSkeleton มาเป็นเนื้อหาจริง ไม่ต้องแก้การ์ด
          แต่ละใบทีละตัว */}
      <div className="relative animate-fade-scale-in" style={{ backgroundImage: DASHBOARD_BG_CSS }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          {/* v13: ลายเฉียงไทเทเนียมไล่จางจากบน (ชัด ~4%) ลงล่าง (แทบมองไม่เห็น) แทนที่จะสม่ำเสมอทั้งหน้า
              เหมือน v12 (ฟีดแบ็ก: "สม่ำเสมอเกินไป เหมือน Overlay วางทับทั้งหน้า") — ใช้ mask-image แนวตั้ง
              ควบคุมความเข้มตาม Y แทนการลด opacity เฉยๆ */}
          {/* v15: "Soft Reflection" — แถบสว่างจางๆ แนวนอนใกล้ขอบบน จำลองแสงตกกระทบผิวไทเทเนียม (เส้น/แถบ
              ไม่ใช่วงกลม ตามฟีดแบ็ก) วางไว้ชั้นล่างสุด (ใต้ลายเฉียง/แสงส้ม) ให้เป็นชั้นฐานของ "ผิวโลหะ" */}
          <div className="absolute inset-0" style={{ backgroundImage: PAGE_REFLECTION_CSS }} />
          {/* v18: "Blue Ambient" — แสงฟ้าเย็นจาง เข้มสุดใกล้ Header สวนทางกับแสงส้มด้านล่าง (AMBIENT_
              ORANGE_CSS) ให้พื้นหลังมีแหล่งแสง 2 โทนตัดกัน แทนที่จะเป็นไล่เฉดสีเดียว วางไว้ก่อนลายเฉียง/
              noise ให้เป็นชั้นแสงพื้นฐาน ไม่ใช่ชั้นบนสุด */}
          <div className="absolute inset-0" style={{ backgroundImage: BLUE_AMBIENT_CSS }} />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: DIAGONAL_TITANIUM_CSS,
              WebkitMaskImage: DIAGONAL_TITANIUM_FADE_MASK,
              maskImage: DIAGONAL_TITANIUM_FADE_MASK,
            }}
          />
          {/* v16: "Micro Reflection" — แถบสว่างจางมาก (2%) พาดคาดกลางลายเฉียง ให้ลายดูมีจุดโดนแสงจับ
              ไม่สม่ำเสมอทุกเส้นเท่ากันหมดแบบเดิม (ฟีดแบ็ก: "Titanium ยังเรียบไปนิด") ใช้ fade mask เดียวกับ
              ลายเฉียงเพื่อให้จางลงล่างพร้อมกัน */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: DIAGONAL_TITANIUM_MICRO_REFLECTION_CSS,
              WebkitMaskImage: DIAGONAL_TITANIUM_FADE_MASK,
              maskImage: DIAGONAL_TITANIUM_FADE_MASK,
            }}
          />
          {/* v19: ฟีดแบ็ก "Background ยังสะอาดเกินไป ไม่ต้องเห็นชัด แต่ซูมแล้วต้องรู้ว่าเป็นโลหะ" —
              HAIRLINE_SCRATCH_BG (feTurbulence แบบ anisotropic ให้ริ้วเส้นบางไม่สม่ำเสมอ ต่างจาก
              DIAGONAL_TITANIUM_CSS ที่เป็นเส้นเรขาคณิตห่างเท่ากันเป๊ะ) — ครอบ wrapper ที่ไม่หมุน (มี mask
              เดียวกับลายเฉียงอื่นๆ ให้จางลงล่างพร้อมกัน) แล้วซ้อนชั้นในที่หมุน 115deg (ทิศเดียวกับลายเฉียง)
              + ขยายเกินขอบจอ (inset -50%) กันมุมโล่งตอนหมุน ไม่งั้น mask จะหมุนตามไปด้วยแล้วจางผิดทิศ */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ WebkitMaskImage: DIAGONAL_TITANIUM_FADE_MASK, maskImage: DIAGONAL_TITANIUM_FADE_MASK }}
          >
            <div
              className="absolute"
              style={{
                inset: '-50%',
                backgroundImage: HAIRLINE_SCRATCH_BG,
                backgroundSize: '160px 160px',
                transform: 'rotate(115deg)',
                opacity: 0.02,
                mixBlendMode: 'overlay',
              }}
            />
          </div>
          <div className="absolute inset-0" style={{ backgroundImage: AMBIENT_ORANGE_CSS }} />
          {/* v18: noise ขยับจาก 0.01 (1%) เป็น 0.015 (1.5%) ตามที่ขอ "Noise 1-2%" (เดิมอยู่ปลายล่างสุด
              ของช่วง) — ยังอยู่ในเพดานที่ขอ ไม่ใช่กลับไปเป็น 2% เต็มแบบรอบก่อนๆ ที่เคยหนาไป */}
          <div className="absolute inset-0" style={{ backgroundImage: NOISE_BG, opacity: 0.015, mixBlendMode: 'overlay' }} />
          {/* v18: "Radial Shadow" — เงามืดนุ่มเฉพาะโซนล่างสุดของจอ ซ้อนทับ VIGNETTE_CSS (ซึ่งมืดขอบสม่ำเสมอ
              ทุกด้าน) ให้จอมีน้ำหนักกดลงด้านล่างเหมือนวางอยู่บนพื้นผิวจริง ไม่ใช่ลอยแบนเท่ากันทุกด้าน */}
          <div className="absolute inset-0" style={{ backgroundImage: RADIAL_SHADOW_CSS }} />
          <div className="absolute inset-0" style={{ backgroundImage: VIGNETTE_CSS }} />
        </div>

        {/* sectionGap เดียวกันทั้งหมด (dashboardSpec.screen.sectionGap = 20px) รวม Header→Focus ด้วย —
            ตัด marginBottom:40 พิเศษของรอบก่อนออก ตามที่ขอ "reduce vertical whitespace" รอบนี้ */}
        <div className="relative" style={{ marginBottom: dashboardSpec.screen.sectionGap }}>
          <Header
            greetingText={greetingText}
            latestPR={data.latestPR}
            topMuscleThisWeek={data.topMuscleThisWeek}
            displayName={data.profileDisplayName || emailDisplayName(data.email)}
            fitnessScore={fitnessScore}
          />
        </div>

        <div className="relative" style={{ display: 'flex', flexDirection: 'column', gap: dashboardSpec.screen.sectionGap }}>
        <TodaysFocusCard
          label={workoutTitle ?? data.muscleRecommendation?.muscleGroup ?? null}
          href={scheduledDay ? '/session' : '/log'}
        />

        {!data.hasAnyHistory && !bannerDismissed && <OnboardingBanner onDismiss={handleDismissBanner} />}

        {/* body composition snapshot */}
        <div className="animate-rise" style={{ animationDelay: '15ms' }}>
          {/* หัวข้อ section 18px ตาม Typography token ล่าสุด (เคยลองขยับไป 30px รอบก่อน แต่ภาพอ้างอิงจริง
              (Image A) แสดงหัวข้อเล็กกว่านั้นมาก แก้กลับมาที่ 18px ตามสเปค) — ระยะห่างหัวข้อ→กริด 20px */}
          <div className="flex items-center justify-between px-1" style={{ marginBottom: 20 }}>
            <p className="font-display text-ink" style={{ fontSize: 18, fontWeight: 700 }}>ภาพรวมร่างกาย</p>
            <Link href="/health" className="text-[11px] text-amber hover:underline shrink-0">
              ดูทั้งหมด →
            </Link>
          </div>
          <BodyMetricsRow colorScheme="vibrant" maxCards={4} compact />
        </div>

        {/* Today's Workout (แบบย่อ) + สถิติย่อวันนี้ — ใช้ข้อมูลจริงที่คำนวณได้ (เซ็ต/นาที/recovery)
            แทนที่ kcal/ก้าว/นอนหลับ ในมอคอัพต้นแบบ ซึ่ง FITLOG ไม่มีข้อมูลจริงรองรับ (ไม่ได้เชื่อมต่อ
            Apple Health/Google Fit เลย) */}
        <TodaysWorkoutCompactCard
          completed={data.todayExercises.length > 0 ? data.completedCount : totals.entryCount}
          total={data.todayExercises.length > 0 ? data.todayExercises.length : Math.max(totals.entryCount, 1)}
          href={scheduledDay ? '/session' : '/log'}
          muscleGroups={todayMuscleGroups}
        />

        <TodayHealthStatsRow health={health} />

        {/* streak + weekly goal — สองการ์ดแยกเดี่ยว (ไม่รวมกับแถบปัด Recovery/AI Coach ด้านล่าง)
            เพราะเป็นข้อมูลที่อยากให้เห็นทันทีโดยไม่ต้องปัด ตามดีไซน์ที่เลือก */}
        <WorkoutStreakCard streak={data.streak} weekDayTicks={data.weekDayTicks} today={today} />

        <AICoachCompactCard message={data.aiDailySummary} />

        {/* quick actions — แถวเลื่อนแนวนอน ไม่ใช่ grid ตายตัว กันปุ่มเล็กเกินไปเมื่อมีครบ 5 ปุ่ม */}
        <div className="flex gap-2 overflow-x-auto animate-rise" style={{ animationDelay: '160ms', scrollbarWidth: 'none' }}>
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="shrink-0 rounded-lg border border-line bg-surface flex items-center gap-2 px-3.5 py-2.5 transition active:scale-[0.99]"
            >
              <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-sm" style={{ backgroundColor: `${action.accent}22` }} aria-hidden="true">
                {action.icon}
              </span>
              <span className="text-xs text-ink whitespace-nowrap">{action.label}</span>
            </Link>
          ))}
        </div>

        {/* สถิติเชิงลึก — พับซ่อนไว้เป็นค่าเริ่มต้น เพราะข้อมูลซ้ำซ้อนกับการ์ดสรุปด้านบน
            (Weekly Goal/Volume/Recovery) อยู่แล้วในระดับ "ภาพรวม" ส่วนนี้คือ "รายละเอียดเต็ม"
            สำหรับคนที่อยากเจาะลึกจริงๆ เท่านั้น — กดดูทีหลังได้ ไม่ต้องเลื่อนผ่านทุกครั้งที่เปิดแอป */}
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="flex items-center justify-center gap-1.5 text-xs text-muted border border-line rounded-lg py-2.5 active:bg-surface2 transition"
        >
          {showMore ? 'ซ่อนสถิติเพิ่มเติม' : 'ดูสถิติเพิ่มเติม'}
          <span aria-hidden="true" style={{ transform: showMore ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 150ms' }}>
            ⌄
          </span>
        </button>

        {showMore && (
          <div className="space-y-4">
            {/* Mobile Dashboard v2: ย้าย Weekly Goal + Weekly Volume/Recovery Score มาไว้ในนี้
                (เดิมอยู่เป็น grid แสดงตลอดในหน้าแรก) ให้หน้าแรกสั้นลงตามสเปค */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <WeeklyGoalMuscleCard />
              <WeeklyVolumeRecoveryCard recoveryPct={overallRecoveryPct} />
            </div>
            {recoveryDetailCard}
            <WeeklyMuscleHeatmap />
            <WeeklyVolume />
            <ConsistencyStrip />

            {next && (
              <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between">
                  <p className="text-[11px] text-muted">
                    Next up: <span className="text-ink">{next.day.title}</span>
                  </p>
                  <span className="text-[11px] font-mono text-muted">{next.daysAway === 1 ? 'พรุ่งนี้' : `อีก ${next.daysAway} วัน`}</span>
                </div>
              </div>
            )}

            <WeeklyCardioVolume />
          </div>
        )}

        <RecommendedProgramCard recommendedMuscle={data.muscleRecommendation?.muscleGroup ?? null} />
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
