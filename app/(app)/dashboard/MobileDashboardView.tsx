'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useDashboardSettings } from '@/components/DashboardSettingsProvider'
import { todayDayOfWeek, todayStr } from '@/lib/weekdays'
import { computeTodayTotals, computeRecoveryPct } from '@/lib/dashboardStats'
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
import MobileDashboardSkeleton from '@/components/MobileDashboardSkeleton'
import OnboardingBanner from '@/components/OnboardingBanner'
import ErrorState from '@/components/ErrorState'
import BodyMetricsRow from '@/components/BodyMetricsRow'
import Header from '@/components/dashboard/Header'
import WorkoutStreakCard from '@/components/WorkoutStreakCard'
import TodaysFocusCard from '@/components/TodaysFocusCard'
import TodaysWorkoutCompactCard from '@/components/TodaysWorkoutCompactCard'
import TodaysWorkoutEmptyCard from '@/components/TodaysWorkoutEmptyCard'
import TodayHealthStatsRow from '@/components/TodayHealthStatsRow'
import { useHealthSnapshot } from '@/lib/healthIntegration'
import AICoachCompactCard from '@/components/AICoachCompactCard'

const DashboardSettings = dynamic(() => import('@/components/DashboardSettings'), { ssr: false })

// ตัด "สถิติ" (/stats), "ถาม AI" (/coach) และ "บันทึกสถิติ" (/log) ออกจากแถวนี้ — ซ้ำซ้อนกับที่มีอยู่แล้ว
// ในหน้าเดียวกัน: "สถิติ" ซ้ำกับแท็บ "สถิติ" ใน bottom nav ตรงๆ, "ถาม AI" ซ้ำกับการ์ด AICoachCompactCard
// ที่วางอยู่เหนือแถวนี้ทันที (ไปหน้า /coach เหมือนกัน), ส่วน "บันทึกสถิติ" ซ้ำกับ TodaysFocusCard และ
// TodaysWorkoutCompactCard ด้านบน ซึ่งทั้งคู่ลิงก์ไป /log อยู่แล้วเมื่อวันนี้ไม่มีโปรแกรมกำหนดไว้
// (scheduledDay ? '/session' : '/log')
const QUICK_ACTIONS = [
  { href: '/templates', label: 'เลือกโปรแกรม', icon: '📋', accent: '#6C8CA8' },
  { href: '/health', label: 'วิเคราะห์ร่างกาย', icon: '🔍', accent: '#E8A33D' },
  // ฟีดแบ็ก "อยากให้ทำเป็นการ์ดอีกใบอยู่ข้างๆ วิเคราะห์ร่างกาย" — ทางลัดไปฟีเจอร์นำเข้าคาร์ดิโอจากรูป
  // ที่มีอยู่แล้ว (ImportCardioPhotoGemini ในหน้า /log แท็บคาร์ดิโอ) — ?type=cardio ให้หน้า /log ตั้ง
  // แท็บเริ่มต้นเป็นคาร์ดิโอให้เลย ไม่ต้องกดสลับเอง (ดู useState(type) ใน log/page.tsx)
  { href: '/log?type=cardio', label: 'ถ่ายรูปคาร์ดิโอ', icon: '📷', accent: '#7A9B57' },
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

  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
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
  const totals = useMemo(() => computeTodayTotals(data?.todayWorkouts ?? []), [data?.todayWorkouts])

  const workoutTitle = scheduledDay?.title ?? ((data?.todayWorkouts.length ?? 0) > 0 ? 'บันทึกอิสระ' : null)
  const progressPct =
    data && data.todayExercises.length > 0 ? Math.round((data.completedCount / data.todayExercises.length) * 100) : null

  const recoveryPctMap = useMemo(() => {
    const map: Record<string, number> = {}
    RECOVERY_MUSCLES.forEach((mg) => {
      map[mg] = computeRecoveryPct(data?.recoveryDates[mg] ?? null, mg)
    })
    return map
  }, [data])

  // todaysRecommendation คำนวณมาแล้วใน fetchDashboardData (ชุดเดียวกับเดสก์ท็อป) — ใช้ตรงจาก
  // data ได้เลย ไม่ต้องคำนวณซ้ำฝั่ง client — เหมือน muscleRecommendation เดิมทุกฟิลด์ (muscleGroup/pct)
  // บวก setsRemaining (เซ็ตที่เหลือถึงเป้าหมายรายสัปดาห์ จาก Weekly Volume Engine) ให้ AICoachCompactCard
  // ต่อคำแนะนำได้ครบเหมือนฝั่งเดสก์ท็อป
  const muscleRecommendation = data?.todaysRecommendation ?? null

  // MobileDashboardSkeleton (แทน DashboardSkeleton ตัวกลางเดิม) — mirror ความสูง/gap จาก
  // dashboardSpec ตัวเดียวกับที่โครงจริงของหน้านี้ใช้ กันไม่ให้เนื้อหา "กระโดด" ตอนโหลดข้อมูลเสร็จ
  // (DashboardSkeleton เดิมยังใช้อยู่ที่เดสก์ท็อป/page.tsx เหมือนเดิม ไม่กระทบ)
  if (isLoading || !data) {
    return <MobileDashboardSkeleton />
  }

  if (isError) {
    return <ErrorState title="โหลด Dashboard ไม่สำเร็จ" message="ไม่สามารถโหลด Dashboard ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่" onRetry={retry} />
  }

  // ปัจจัย Recovery ของ Fitness Score เท่านั้น — เอาเฉพาะกลุ่มกล้ามเนื้อที่มีประวัติฝึกจริง
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
  // ฟีดแบ็ก "Training Readiness 48 vs AI Coach Recovery 100% ดูขัดกัน — ถ้าเป็นคนละ Metric ต้องอธิบายให้
  // ชัด" — ตัวนี้ (fitnessScoreRecoveryPct) เฉลี่ยจากทุกกลุ่มกล้ามเนื้อที่เคยฝึก ส่วน AI Coach's "Recovery
  // 100%" (AICoachCompactCard.tsx, muscleRecommendation.pct) คือ % ฟื้นตัวของกลุ่มกล้ามเนื้อที่แนะนำวันนี้
  // กลุ่มเดียว — คนละขอบเขตกันจริง ไม่ใช่บั๊ก (ตัวนี้แค่ 1 ใน 5 ปัจจัยถ่วงน้ำหนักที่รวมกันเป็น Training
  // Readiness ด้วย ไม่ใช่ตัวเดียวกับ Readiness) — เปลี่ยน label ตรงนี้เป็น "Recovery (Avg)" ให้ตรงข้ามกับ
  // "Muscle Recovery" ที่ AI Coach ใช้ (เปลี่ยนคู่กัน) ผู้ใช้ที่กด Training Readiness ดู breakdown จะเห็นคำ
  // ที่ต่างจาก AI Coach ชัดเจน ไม่ใช่คำว่า "Recovery" เฉยๆ ซ้ำกันทั้งสองที่โดยไม่มีอะไรบอกว่าคนละตัว
  const fitnessScore = computeFitnessScore([
    { key: 'workout', label: 'Workout Completion', value: Math.round((data.last7DaysTrainedCount / 7) * 100), weight: 30 },
    { key: 'streak', label: 'Streak', value: Math.min(100, Math.round((data.streak / 14) * 100)), weight: 20 },
    { key: 'sleep', label: 'Sleep', value: null, weight: 20 },
    { key: 'recovery', label: 'Recovery (Avg)', value: fitnessScoreRecoveryPct, weight: 15 },
    { key: 'weeklyGoal', label: 'Weekly Goal', value: data.weeklyGoalPct, weight: 10 },
    { key: 'activityToday', label: 'Activity Today', value: progressPct ?? (totals.entryCount > 0 ? 100 : 0), weight: 5 },
  ])

  // ฟีดแบ็ก "Today's Workout ไม่ควรโชว์ 0/0 ตอนไม่มีอะไรให้ฝึก — ควรแยก Rest Day / No Program ออกเป็น
  // state ของตัวเอง" (Section 10) — ลำดับความสำคัญ: มีท่าตั้งไว้จริงวันนี้ (todayExercises) มาก่อนเสมอ,
  // ถ้าไม่มีแต่บันทึกอิสระไว้แล้ว (todayWorkouts) ให้นับว่า "เสร็จแล้ว" (ไม่มีเป้าให้ยังทำไม่ครบ), ถ้าไม่มี
  // ทั้งคู่แต่มีโปรแกรมอยู่ (programDays.length > 0) = วันนี้แค่ไม่มีคิว ไม่ใช่ยังไม่เคยตั้งโปรแกรมเลย
  const hasTodayPlan = data.todayExercises.length > 0
  const hasLoggedToday = data.todayWorkouts.length > 0
  const hasAnyProgram = data.programDays.length > 0
  const workoutCardVariant: 'active' | 'restDay' | 'noProgram' =
    hasTodayPlan || hasLoggedToday ? 'active' : hasAnyProgram ? 'restDay' : 'noProgram'

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
              ของช่วง) — ยังอยู่ในเพดานที่ขอ ไม่ใช่กลับไปเป็น 2% เต็มแบบรอบก่อนๆ ที่เคยหนาไป
              v24: "Titanium Noise ละเอียดมาก แทบมองไม่เห็น แต่ช่วยให้โลหะดูจริง" — ขยับอีกนิดเป็น 0.02 */}
          <div className="absolute inset-0" style={{ backgroundImage: NOISE_BG, opacity: 0.02, mixBlendMode: 'overlay' }} />
          {/* v18: "Radial Shadow" — เงามืดนุ่มเฉพาะโซนล่างสุดของจอ ซ้อนทับ VIGNETTE_CSS (ซึ่งมืดขอบสม่ำเสมอ
              ทุกด้าน) ให้จอมีน้ำหนักกดลงด้านล่างเหมือนวางอยู่บนพื้นผิวจริง ไม่ใช่ลอยแบนเท่ากันทุกด้าน */}
          <div className="absolute inset-0" style={{ backgroundImage: RADIAL_SHADOW_CSS }} />
          {/* v24: "Animated Highlight" — ฟีดแบ็ก "แสงวิ่งช้าๆ ทุก 8-12 วินาที ผ่าน Gauge/Focus/Workout
              จะทำให้ทั้ง Dashboard ดูมีชีวิตโดยไม่รบกวนสายตา" — แทนที่จะซิงก์ animation แยกกัน 3 จุด (ring
              sweep 9s ใน FitnessScore.tsx, banner sweep 20s ใน TodaysWorkoutCompactCard.tsx ซึ่งทำงาน
              อิสระอยู่แล้ว) ใช้แถบแสงแนวนอนบางๆ กวาดจากบนลงล่างทั้งหน้าเดียว (10s/รอบ) พาดผ่านทั้ง 3 โซน
              พร้อมกันแทน — ง่ายกว่าและทนกว่าการพยายามซิงก์เวลาข้าม component/mount cycle จริง — เคารพ
              prefers-reduced-motion */}
          <div className="page-light-sweep absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            <div className="page-light-sweep-band" />
          </div>
          {/* v30: ฟีดแบ็ก "energy-flow-sweep ❌ คนไม่รู้ด้วยซ้ำว่ามันคืออะไร" — ตัด "Orange Energy Flow"
              (v27) ออกทั้งชั้น ไม่ได้เพิ่มความเข้าใจ/UX ที่วัดได้ แค่เพิ่ม animation loop อีกจุดหนึ่งบนพื้น
              หลังทั้งหน้า — AMBIENT_ORANGE_CSS (ไล่เฉดนิ่ง) ที่มันเคยซ้อนทับยังอยู่เหมือนเดิม ไม่กระทบ */}
          <div className="absolute inset-0" style={{ backgroundImage: VIGNETTE_CSS }} />
        </div>

        {/* sectionGap เดียวกันทั้งหมด (dashboardSpec.screen.sectionGap = 20px) รวม Header→Focus ด้วย —
            ตัด marginBottom:40 พิเศษของรอบก่อนออก ตามที่ขอ "reduce vertical whitespace" รอบนี้
            v2: ฟีดแบ็ก "Recovery Day เนื้อหา Header สั้นกว่า Workout Day แต่ระยะห่างเท่าเดิม ดูโล่งเกิน
            ไปนิด — dynamic spacing" — ลดช่องว่างนี้ลงอีกขั้นเฉพาะ Rest Day (ลดเท่าที่ทำได้อย่างปลอดภัย —
            ความสูงหลักของ Header มาจาก marginTop:52 ของคอลัมน์วง Fitness Score ที่ผูกกับตำแหน่งกระดิ่ง
            แจ้งเตือนตายตัว ไม่ใช่ความยาวข้อความ จึงลดได้แค่ช่องว่างท้าย Header ตรงนี้ ไม่ใช่ตัว Header เอง) */}
        <div
          className="relative"
          style={{ marginBottom: workoutCardVariant === 'restDay' ? 4 : dashboardSpec.screen.sectionGap }}
        >
          <Header
            greetingText={greetingText}
            latestPR={data.latestPR}
            topMuscleThisWeek={data.topMuscleThisWeek}
            displayName={data.profileDisplayName || emailDisplayName(data.email)}
            fitnessScore={fitnessScore}
            isRestDay={workoutCardVariant === 'restDay'}
          />
        </div>

        {/* v67: ฟีดแบ็ก "ช่องว่างระหว่าง Header → Today's Focus ยังเยอะไปนิด (~40-50px) ลด vertical gap
            ตรงกลางประมาณ 15-20% โดยไม่ลด BANK/Score/Focus" — ต้นเหตุจริงไม่ใช่ sectionGap (8px อยู่แล้ว)
            แต่เป็นช่องว่างภายในกล่อง Header เอง: แถว items-start ของ Header มีคอลัมน์ขวา (วง Fitness
            Score) สูงกว่าคอลัมน์ซ้าย (ข้อความ greeting) มาก ทำให้เหลือพื้นที่ว่างใต้ข้อความคอลัมน์ซ้ายก่อน
            ถึงขอบล่างจริงของกล่อง Header — ดึง section ถัดไปขึ้นมาทับพื้นที่ว่างนี้ได้อย่างปลอดภัยด้วย
            marginTop ติดลบ แทนที่จะลดขนาด/ตำแหน่งองค์ประกอบใดๆ ใน Header — ลบ 8px ≈ 15-20% ของช่องว่างที่
            สังเกตได้ (~40-50px) ตามสัดส่วนที่ขอ
            v68: ฟีดแบ็ก "ช่องว่างนี้ยังมากเกินไป ลดอีกประมาณ 25-30% (15-25px)" — ลองเพิ่มเป็น -28 แต่ประเมิน
            ความสูงคอลัมน์ขวาผิด (คิดแค่ marginTop:48 + ring 69px ≈ 117px ลืมนับ tier label "MODERATE" +
            aiCoachStatus "Light Training" ที่อยู่ใต้วงในคอลัมน์เดียวกันด้วย ซึ่งทำให้คอลัมน์ขวาสูงกว่าที่
            คิดไว้มาก) ผลคือ Today's Focus ถูกดึงขึ้นไปทับ "MODERATE" จริง (ฟีดแบ็ก regression) — คืนกลับเป็น
            -8 (ค่าที่ยืนยันแล้วว่าไม่ชนอะไร) จนกว่าจะเช็คความสูงคอลัมน์ขวาจริงบนอุปกรณ์จริงก่อนลดต่อ */}
        <div className="relative" style={{ display: 'flex', flexDirection: 'column', gap: dashboardSpec.screen.sectionGap, marginTop: -8 }}>
        <TodaysFocusCard
          workoutTitle={workoutTitle}
          muscleRecommendation={muscleRecommendation}
          isRestDay={workoutCardVariant === 'restDay'}
          href={scheduledDay ? '/session' : '/log'}
          todayExercises={data.todayExercises}
        />

        {!data.hasAnyHistory && !bannerDismissed && <OnboardingBanner onDismiss={handleDismissBanner} />}

        {/* body composition snapshot */}
        {/* v12: ฟีดแบ็ก "Today's Workout ควรเด่นกว่า Body Metrics — Hierarchy ควรเป็น Today's Focus →
            Today's Workout → Body Overview" — สลับ Today's Workout ขึ้นก่อน Body Overview ตอนนั้น
            v59: ฟีดแบ็ก "ปัญหาเปลี่ยนจาก Scale Problem เป็น Hierarchy Problem — เอา Today's Workout กลับไป
            หลัง Body Summary เหมือนเวอร์ชันก่อน เพราะหน้า Home ควรให้ผู้ใช้ scan 'วันนี้ร่างกายเป็นอย่างไร'
            ก่อน 'วันนี้ต้องทำอะไร'" — สลับกลับเป็น Focus → Body Overview → Today's Workout ตามที่ขอ
            (ย้ายตำแหน่งเฉยๆ ไม่ได้แก้เนื้อหา/ดีไซน์การ์ดใดเลย เหมือนตอนสลับรอบก่อน) */}
        <div className="animate-rise" style={{ animationDelay: '15ms', marginTop: 10 }}>
          {/* หัวข้อ section 18px ตาม Typography token ล่าสุด (เคยลองขยับไป 30px รอบก่อน แต่ภาพอ้างอิงจริง
              (Image A) แสดงหัวข้อเล็กกว่านั้นมาก แก้กลับมาที่ 18px ตามสเปค) — ระยะห่างหัวข้อ→กริด 20px
              v68: ฟีดแบ็ก "'ภาพรวมร่างกาย' กับ Card อยู่ห่างกันนิดหนึ่ง ควรรู้สึกเป็นกลุ่มเดียวกันมากกว่านี้
              ลดลงประมาณ 5-8px" — 20 -> 13 (-7px, กลางช่วงที่ขอ) */}
          <div className="flex items-center justify-between px-1" style={{ marginBottom: 13 }}>
            {/* v60: ฟีดแบ็ก "'ภาพรวมร่างกาย' font ใหญ่ไปนิดจนเกือบเท่า Today's Focus ลดแค่ ~5%" —
                18 -> 17 (-5.6%) */}
            <p className="font-display text-ink" style={{ fontSize: 17, fontWeight: 700 }}>ภาพรวมร่างกาย</p>
            <Link href="/health" className="text-[11px] text-amber hover:underline shrink-0">
              ดูทั้งหมด →
            </Link>
          </div>
          {/* v43: prop colorScheme ตัดออกแล้ว (ดู BodyMetricsRow.tsx) — ดีฟอลต์เป็นชุดสีนี้อยู่แล้ว
              เดสก์ท็อปก็ใช้ชุดเดียวกันนี้ตั้งแต่ v41 ไม่ต้องส่ง prop แยกอีกต่อไป */}
          <BodyMetricsRow maxCards={4} compact />
        </div>

        {workoutCardVariant === 'active' ? (
          <TodaysWorkoutCompactCard
            // ฟีดแบ็ก "แสดง 7/8 ทั้งๆที่ประวัติบันทึกไป 8 ท่า" — data.completedCount นับได้เฉพาะท่าตาม
            // แผนเท่านั้น (ดู comment เต็มที่จุดคำนวณ adhocCompletedCount ใน DashboardView.tsx) บวก
            // adhocCompletedCount เพิ่มเข้ามาให้ท่า ad-hoc ที่กดจบแล้วนับรวมด้วย — สาขา else (ไม่มีแผน)
            // ไม่ต้องบวกเพิ่ม เพราะ totals.entryCount นับจาก log จริงทั้งหมดอยู่แล้วไม่แยกแผน/ad-hoc
            completed={data.todayExercises.length > 0 ? data.completedCount + data.adhocCompletedCount : totals.entryCount}
            // ฟีดแบ็ก "เพิ่มท่า/เพิ่ม Set ระหว่างเซสชัน แต่พอจบ หน้านี้ไม่แสดงตามความจริง" — เดิม total
            // เป็น data.todayExercises.length ตรงๆ (จำนวนแผนล้วนๆ) ตราบใดที่มีแผนตั้งไว้ ไม่เคยรวมท่า
            // ad-hoc ที่เพิ่มเข้าไประหว่างเซสชัน (เจอบั๊กเดียวกันนี้ก่อนแล้วในการ์ด Hero ฝั่งเดสก์ท็อป —
            // DashboardView.tsx — แก้ด้วยวิธีเดียวกัน) Math.max(แผน, totals.entryCount) ให้ตัวเลขขยับตาม
            // จริงเมื่อทำเกินแผน แต่ยังไม่ลดฮวบกลางเซสชันถ้ายังทำได้ไม่ครบแผน — completed ไม่แตะ (ยังอิง
            // data.completedCount ซึ่งนับเฉพาะท่าตามแผนที่ "จบท่า" จริง ไม่มีสัญญาณ "จบท่า" ของท่า ad-hoc
            // ให้ใช้ได้อย่างปลอดภัย การเดาจะเสี่ยงโชว์ผิดยิ่งกว่าเดิม เช่น 7/7 ทั้งที่ท่าที่ 7 ทำไปครึ่งเดียว)
            total={Math.max(data.todayExercises.length, totals.entryCount, 1)}
            href={scheduledDay ? '/session' : '/log'}
          />
        ) : (
          <TodaysWorkoutEmptyCard variant={workoutCardVariant} />
        )}

        <TodayHealthStatsRow health={health} />

        {/* streak + weekly goal — สองการ์ดแยกเดี่ยว (ไม่รวมกับแถบปัด Recovery/AI Coach ด้านล่าง)
            เพราะเป็นข้อมูลที่อยากให้เห็นทันทีโดยไม่ต้องปัด ตามดีไซน์ที่เลือก */}
        <WorkoutStreakCard streak={data.streak} bestStreak={data.bestStreak} weekDayTicks={data.weekDayTicks} today={today} />

        <AICoachCompactCard
          message={data.aiDailySummary}
          muscleRecommendation={muscleRecommendation}
          isRestDay={workoutCardVariant === 'restDay'}
          lastUpdatedAt={dataUpdatedAt}
          recoveryDates={data.recoveryDates}
          isRecommendationForToday={data.isRecommendationForToday}
          todayWorkoutTitle={workoutTitle}
        />

        {/* quick actions — แถวเลื่อนแนวนอน ไม่ใช่ grid ตายตัว กันปุ่มเล็กเกินไปเมื่อมีครบ 5 ปุ่ม
            v57: ฟีดแบ็ก "AI Coach กับ Quick Actions ชิดกันนิดหนึ่ง หลัง 'ดู Recovery →' — เพิ่ม 8-12px"
            — sectionGap กลาง (8px หลัง P3) ยังไม่พอเฉพาะคู่นี้ เพิ่ม marginTop เสริม 10px เฉพาะจุดนี้
            (ไม่แตะ sectionGap กลาง ตามรูปแบบเดียวกับที่ใช้กับคู่ Today's Workout→Body Overview) รวมเป็น
            8+10=18px */}
        <div className="flex gap-2 overflow-x-auto animate-rise" style={{ animationDelay: '160ms', scrollbarWidth: 'none', marginTop: 10 }}>
          {QUICK_ACTIONS.map((action) => {
            // v57: ฟีดแบ็ก "'เลือกโปรแกรม' ใน Recovery Day ไม่ใช่สิ่งสำคัญที่สุด — เปลี่ยนเป็น
            // 'ตารางการฝึก' แทน ส่วน 'วิเคราะห์ร่างกาย' เหมาะเดิม" — เฉพาะปุ่มแรก (/templates) เปลี่ยน
            // ป้ายตอน workoutCardVariant==='restDay' เท่านั้น (ปุ่มที่สอง /health ไม่แตะ) href เดิมไม่แตะ
            // (ยังพาไปหน้าเลือกโปรแกรม/เทมเพลตเหมือนเดิม แค่คำพูดเปลี่ยนให้ตรงบริบทวันพัก)
            const label = action.href === '/templates' && workoutCardVariant === 'restDay' ? 'ตารางการฝึก' : action.label
            return (
              <Link
                key={action.href}
                href={action.href}
                className="shrink-0 rounded-lg border border-line bg-surface flex items-center gap-2 px-3.5 py-2.5 transition active:scale-[0.99]"
              >
                <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-sm" style={{ backgroundColor: `${action.accent}22` }} aria-hidden="true">
                  {action.icon}
                </span>
                <span className="text-xs text-ink whitespace-nowrap">{label}</span>
              </Link>
            )
          })}
        </div>
        {/* v12: ฟีดแบ็ก "ช่วงท้ายหน้ามี 5 Section ต่อกัน (Health App/Streak/AI Coach/Quick Actions/
            ดูสถิติเพิ่มเติม) ทั้งหมดเป็น Secondary Content — เอา ดูสถิติเพิ่มเติม ออกไปเลย เพราะมี
            Statistics อยู่ใน Bottom Navigation แล้ว" — ตัดปุ่ม toggle + ส่วนที่ซ่อนอยู่หลังมัน
            (WeeklyGoalMuscleCard/WeeklyVolumeRecoveryCard/recoveryDetailCard/WeeklyMuscleHeatmap/
            WeeklyVolume/ConsistencyStrip/"Next up"/WeeklyCardioVolume) ออกทั้งหมด — ข้อมูลเหล่านี้ยัง
            เข้าถึงได้ที่แท็บ "สถิติ" ใน Bottom Nav ตามที่ผู้ใช้ระบุ ไม่ได้ลบข้อมูลออกจากแอป แค่ไม่ซ้ำซ้อน
            ในหน้า Home อีกต่อไป */}

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
      <style jsx>{`
        /* v31: ฟีดแบ็ก "เหลือแค่ 7 Animation — Background: page-light-sweep 20s" — ช้าลงจาก 10s เป็น 20s
           v: เดิม animate ด้วย background-position ตรงๆ บน div ที่สูงเท่าคอนเทนต์ทั้งหน้า (ไม่ใช่แค่
           viewport) — background-position ไม่ใช่ property ที่ compositor เร่งด้วย GPU ได้ ต้อง repaint
           จริงทุกเฟรม ตลอดเวลาที่หน้าเปิดอยู่ (infinite) แถมอยู่ในสแต็กเดียวกับพื้นหลังลายอีกหลายชั้น
           (บาง layer ใช้ mix-blend-mode/mask-image) ทำให้ต้อง recomposite ทั้งสแต็กพร้อมกันทุกเฟรม —
           เปลี่ยนมาใช้ transform บนเลเยอร์ลูกแยกต่างหาก (.page-light-sweep-band สูงเท่า parent พอดี
           translateY(-100%→200%) ระยะทางเทียบเท่า background-position เดิมเป๊ะ) ซึ่ง GPU compositor รับ
           ภาระได้ ภาพที่เห็นเหมือนเดิมทุกอย่าง แค่ implementation คนละวิธี */
        .page-light-sweep-band {
          position: absolute;
          inset: 0;
          height: 100%;
          background: linear-gradient(180deg, transparent 45%, rgba(255, 255, 255, 0.035) 50%, transparent 55%);
          transform: translateY(-100%);
          animation: page-light-sweep-move 20s ease-in-out infinite;
          will-change: transform;
        }
        @keyframes page-light-sweep-move {
          0% {
            transform: translateY(-100%);
          }
          45%,
          100% {
            transform: translateY(200%);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .page-light-sweep-band {
            animation: none;
            opacity: 0;
          }
        }
      `}</style>
    </>
  )
}
