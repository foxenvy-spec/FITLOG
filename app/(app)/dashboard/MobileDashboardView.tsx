'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { bodyFatTrendInsight, muscleMassTrendInsight, workoutFrequencyInsight } from '@/lib/aiCoach'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { RECOVERY_MUSCLES } from '@/lib/muscle-groups'
import { DEFAULT_DASHBOARD_PREFS, loadDashboardPrefs, saveDashboardPrefs, type DashboardPrefs } from '@/lib/dashboardPrefs'
import { isOnboardingBannerDismissed, dismissOnboardingBanner } from '@/lib/onboarding'
import {
  fetchDashboardData,
  greeting,
  emailDisplayName,
  INSIGHT_IMAGE,
  type DashboardData,
} from './DashboardView'
import { computeFitnessScore } from '@/lib/fitnessScore'
import GoalRing from '@/components/GoalRing'
import DashboardSkeleton from '@/components/DashboardSkeleton'
import InsightCard from '@/components/InsightCard'
import OnboardingBanner from '@/components/OnboardingBanner'
import ErrorState from '@/components/ErrorState'
import Skeleton from '@/components/Skeleton'
import BodyMetricsRow from '@/components/BodyMetricsRow'
import ConsistencyStrip from '@/components/ConsistencyStrip'
import NotificationBell from '@/components/NotificationBell'
import WorkoutStreakCard from '@/components/WorkoutStreakCard'
import WeeklyGoalMuscleCard from '@/components/WeeklyGoalMuscleCard'
import WeeklyVolumeRecoveryCard from '@/components/WeeklyVolumeRecoveryCard'
import RecommendedProgramCard from '@/components/RecommendedProgramCard'
import FitnessScoreRing from '@/components/FitnessScoreRing'
import FitnessWaveDecoration from '@/components/FitnessWaveDecoration'
import TodaysFocusCard from '@/components/TodaysFocusCard'
import TodaysWorkoutCompactCard from '@/components/TodaysWorkoutCompactCard'
import TodayHealthStatsRow from '@/components/TodayHealthStatsRow'
import { useHealthSnapshot } from '@/lib/healthIntegration'
import AICoachCompactCard from '@/components/AICoachCompactCard'
import type { Insight } from '@/lib/dashboardStats'

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

const QUICK_ACTIONS = [
  { href: '/log', label: 'บันทึกสถิติ', icon: '➕', accent: '#7A9B57' },
  { href: '/templates', label: 'เลือกโปรแกรม', icon: '📋', accent: '#6C8CA8' },
  { href: '/health', label: 'วิเคราะห์ร่างกาย', icon: '🔍', accent: '#E8A33D' },
  { href: '/stats', label: 'สถิติ', icon: '📈', accent: '#C1503A' },
  { href: '/coach', label: 'ถาม AI', icon: '🤖', accent: '#9C7CC4' },
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
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [showMore, setShowMore] = useState(false)
  const carouselRef = useRef<HTMLDivElement>(null)

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

  const { toDisplay, unit } = useWeightUnit()
  const health = useHealthSnapshot()
  const dow = todayDayOfWeek()

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
  const next = useMemo(() => (data ? findNextProgramDay(data.programDays, dow) : null), [data, dow])
  const totals = useMemo(() => computeTodayTotals(data?.todayWorkouts ?? []), [data?.todayWorkouts])

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

  // muscleRecommendation และ aiDailySummary คำนวณมาแล้วใน fetchDashboardData (ชุดเดียวกับ
  // เดสก์ท็อป) — ใช้ตรงจาก data ได้เลย ไม่ต้องคำนวณซ้ำฝั่ง client
  const muscleRecommendation = data?.muscleRecommendation ?? null
  const aiDailySummary = data?.aiDailySummary ?? ''

  function handleCarouselScroll() {
    const el = carouselRef.current
    if (!el) return
    const idx = Math.round(el.scrollLeft / el.clientWidth)
    setCarouselIndex(idx)
  }

  function scrollToCarouselIndex(idx: number) {
    const el = carouselRef.current
    if (!el) return
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' })
  }

  if (isLoading || !data) {
    return <DashboardSkeleton />
  }

  if (isError) {
    return <ErrorState title="โหลด Dashboard ไม่สำเร็จ" message="ไม่สามารถโหลด Dashboard ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่" onRetry={retry} />
  }

  const overallRecoveryPct = Math.round(
    RECOVERY_MUSCLES.reduce((sum, mg) => sum + recoveryPctMap[mg], 0) / RECOVERY_MUSCLES.length
  )

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
    { key: 'recovery', value: overallRecoveryPct, weight: 15 },
    { key: 'weeklyGoal', value: data.weeklyGoalPct, weight: 10 },
    { key: 'activityToday', value: progressPct ?? (totals.entryCount > 0 ? 100 : 0), weight: 5 },
  ])

  // ลำดับการ์ดในแถบปัด — ซ่อนการ์ดที่ผู้ใช้ปิดไว้ใน DashboardSettings เหมือนเดสก์ท็อป
  const carouselCards: { key: string; node: React.ReactNode }[] = []
  if (prefs.showRecovery) {
    carouselCards.push({
      key: 'recovery',
      node: (
        <Link href="/recovery" className="block h-full px-5 py-4 active:bg-surface2 transition">
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
      ),
    })
  }
  if (prefs.showAICoach) {
    carouselCards.push({
      key: 'ai-coach',
      node: (
        <div className="h-full px-5 py-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] tracked uppercase text-muted">✨ AI Coach</p>
            {combinedInsights.length > 0 && (
              <span className="text-[10px] tracked uppercase text-amber bg-amber/10 rounded-full px-2 py-0.5">อัปเดต</span>
            )}
          </div>
          {combinedInsights.length > 0 ? (
            <div className="space-y-2">
              {combinedInsights.slice(0, 2).map((insight) => (
                <InsightCard key={insight.id} insight={insight} imageSrc={INSIGHT_IMAGE[`${insight.id}|${insight.kind}`]} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-surface border border-line shadow-elevated border-l-[3px] border-l-amber px-4 py-3 flex items-start gap-3">
              <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-base" style={{ backgroundColor: '#E8A33D22' }} aria-hidden="true">🤖</span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm tracked uppercase text-amber">แนะนำวันนี้</p>
                <p className="text-xs text-muted mt-0.5 whitespace-pre-line">{aiDailySummary}</p>
              </div>
            </div>
          )}
        </div>
      ),
    })
  }

  return (
    <>
      <div className="space-y-5">
        {/* greeting + Fitness Score + settings */}
        <div className="relative z-20 px-1 animate-rise">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted">👋 {greetingText}</p>
                <div className="shrink-0">
                  <NotificationBell latestPR={data.latestPR} topMuscleThisWeek={data.topMuscleThisWeek} />
                </div>
              </div>
              <p
                className="uppercase mt-1"
                style={{
                  fontFamily: 'var(--font-oswald), var(--font-kanit)',
                  fontSize: 34,
                  fontWeight: 800,
                  letterSpacing: '1.5px',
                  lineHeight: 1,
                  backgroundImage: 'linear-gradient(180deg, #FFFFFF, #C7CBD1)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                {data.profileDisplayName || emailDisplayName(data.email)}
              </p>
              <p className="text-xs text-muted mt-1">Personalized Fitness</p>
            </div>
            <FitnessScoreRing score={fitnessScore} />
          </div>

          <FitnessWaveDecoration color={fitnessScore.color} />

          <p className="text-xs text-ink">วันนี้พร้อมสำหรับการออกกำลังกาย 💪</p>

          <div className="mt-3">
            <TodaysFocusCard
              label={workoutTitle ?? data.muscleRecommendation?.muscleGroup ?? null}
              href={scheduledDay ? '/session' : '/log'}
            />
          </div>
        </div>

        {!data.hasAnyHistory && !bannerDismissed && <OnboardingBanner onDismiss={handleDismissBanner} />}

        {/* body composition snapshot */}
        <div className="animate-rise" style={{ animationDelay: '15ms' }}>
          <div className="flex items-center justify-between px-1 mb-2">
            <p className="font-display text-sm tracked uppercase text-ink">ภาพรวมร่างกาย</p>
            <Link href="/health" className="text-[11px] text-amber hover:underline shrink-0">
              ดูทั้งหมด →
            </Link>
          </div>
          <BodyMetricsRow showLastMeasuredDate colorScheme="vibrant" />
        </div>

        {/* Today's Workout (แบบย่อ) + สถิติย่อวันนี้ — ใช้ข้อมูลจริงที่คำนวณได้ (เซ็ต/นาที/recovery)
            แทนที่ kcal/ก้าว/นอนหลับ ในมอคอัพต้นแบบ ซึ่ง FITLOG ไม่มีข้อมูลจริงรองรับ (ไม่ได้เชื่อมต่อ
            Apple Health/Google Fit เลย) */}
        <TodaysWorkoutCompactCard
          completed={data.todayExercises.length > 0 ? data.completedCount : totals.entryCount}
          total={data.todayExercises.length > 0 ? data.todayExercises.length : Math.max(totals.entryCount, 1)}
          href={scheduledDay ? '/session' : '/log'}
        />

        <TodayHealthStatsRow health={health} />

        {/* streak + weekly goal — สองการ์ดแยกเดี่ยว (ไม่รวมกับแถบปัด Recovery/AI Coach ด้านล่าง)
            เพราะเป็นข้อมูลที่อยากให้เห็นทันทีโดยไม่ต้องปัด ตามดีไซน์ที่เลือก */}
        <WorkoutStreakCard streak={data.streak} weekDayTicks={data.weekDayTicks} today={today} />

        <AICoachCompactCard message={data.aiDailySummary} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <WeeklyGoalMuscleCard />
          <WeeklyVolumeRecoveryCard recoveryPct={overallRecoveryPct} />
        </div>

        {/* การ์ดปัดได้ (scroll-snap) — Recovery / Weekly Goal / AI Coach ในพื้นที่เดียว ปัดซ้ายขวา
            แทนที่จะเรียงเป็นการ์ดแยกยาวๆ ลงมา ประหยัดพื้นที่แนวตั้งบนจอมือถือ */}
        {carouselCards.length > 0 && (
          <div className="animate-rise" style={{ animationDelay: '120ms' }}>
            <div
              ref={carouselRef}
              onScroll={handleCarouselScroll}
              className="flex overflow-x-auto snap-x snap-mandatory rounded-lg bg-surface2/40 border"
              style={{ borderColor: '#60A5FA4D', boxShadow: '0 0 10px #60A5FA33', scrollbarWidth: 'none' }}
            >
              {carouselCards.map((card) => (
                <div key={card.key} className="snap-start shrink-0 w-full min-w-full">
                  {card.node}
                </div>
              ))}
            </div>
            {carouselCards.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 mt-2">
                {carouselCards.map((card, i) => (
                  <button
                    key={card.key}
                    type="button"
                    aria-label={`การ์ด ${i + 1}`}
                    onClick={() => scrollToCarouselIndex(i)}
                    className="rounded-full transition"
                    style={{
                      width: i === carouselIndex ? 16 : 6,
                      height: 6,
                      backgroundColor: i === carouselIndex ? '#E8A33D' : '#3A3F47',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* quick actions — แถวเลื่อนแนวนอน ไม่ใช่ grid ตายตัว กันปุ่มเล็กเกินไปเมื่อมีครบ 5 ปุ่ม */}
        <div className="flex gap-2 overflow-x-auto animate-rise" style={{ animationDelay: '160ms', scrollbarWidth: 'none' }}>
          {QUICK_ACTIONS.filter((a) => a.href !== '/coach' || data.hasAnyHistory).map((action) => (
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
          <div className="space-y-5">
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
