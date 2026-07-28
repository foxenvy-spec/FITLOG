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
  computeGreetingContext,
} from '@/lib/dashboardStats'
import { saveDisplayName } from '@/lib/profile'
import { bodyFatTrendInsight, muscleMassTrendInsight, workoutFrequencyInsight } from '@/lib/aiCoach'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { VOLUME_MUSCLES, RECOVERY_MUSCLES } from '@/lib/muscle-groups'
import { DEFAULT_DASHBOARD_PREFS, loadDashboardPrefs, saveDashboardPrefs, type DashboardPrefs } from '@/lib/dashboardPrefs'
import { isOnboardingBannerDismissed, dismissOnboardingBanner } from '@/lib/onboarding'
import {
  fetchDashboardData,
  greeting,
  emailDisplayName,
  INSIGHT_IMAGE,
  type DashboardData,
} from './DashboardView'
import GoalRing from '@/components/GoalRing'
import DashboardSkeleton from '@/components/DashboardSkeleton'
import InsightCard from '@/components/InsightCard'
import TodayMuscleChips from '@/components/TodayMuscleChips'
import OnboardingBanner from '@/components/OnboardingBanner'
import ErrorState from '@/components/ErrorState'
import Skeleton from '@/components/Skeleton'
import BodyMetricsRow from '@/components/BodyMetricsRow'
import ConsistencyStrip from '@/components/ConsistencyStrip'
import NotificationBell from '@/components/NotificationBell'
import WorkoutStreakCard from '@/components/WorkoutStreakCard'
import WeeklyGoalMuscleCard from '@/components/WeeklyGoalMuscleCard'
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
  const greetingContext = useMemo(
    () =>
      data
        ? computeGreetingContext(scheduledDay?.title ?? null, data.muscleRecommendation, data.bestVolumeIncrease)
        : { headline: null, detail: null },
    [data, scheduledDay]
  )
  const totals = useMemo(() => computeTodayTotals(data?.todayWorkouts ?? []), [data?.todayWorkouts])

  const plannedMuscleLabel = useMemo(() => {
    if (!data) return null
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const e of data.todayExercises) {
      if (e.muscle_group && (VOLUME_MUSCLES as readonly string[]).includes(e.muscle_group) && !seen.has(e.muscle_group)) {
        seen.add(e.muscle_group)
        ordered.push(e.muscle_group)
      }
    }
    if (ordered.length > 0) return ordered.join(' • ')
    for (const w of data.todayWorkouts) {
      if (w.muscle_group && (VOLUME_MUSCLES as readonly string[]).includes(w.muscle_group) && !seen.has(w.muscle_group)) {
        seen.add(w.muscle_group)
        ordered.push(w.muscle_group)
      }
    }
    return ordered.length > 0 ? ordered.join(' • ') : null
  }, [data])

  const plannedTotalSets = useMemo(() => {
    if (!data) return 0
    if (data.todayExercises.length > 0) return data.todayExercises.reduce((s, e) => s + (e.sets ?? 0), 0)
    return data.todayWorkouts.reduce((s, w) => s + (w.sets ?? 0), 0)
  }, [data])
  const estimatedMinutes = Math.max(10, Math.round((plannedTotalSets * 1.5) / 5) * 5)
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
        {/* greeting + settings */}
        <div className="relative z-20 flex items-start justify-between gap-3 px-1 animate-rise">
          <div>
            <p className="text-xs text-muted">👋 {greetingText}</p>
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
            <div className="mt-2">
              {(() => {
                const bf = data.bodyMetricsSummary.bodyFatPct
                if (bf.delta != null && bf.isGood) {
                  return (
                    <p className="text-xs">
                      <span style={{ color: '#8CB264' }}>📉 ↓{Math.abs(bf.delta).toFixed(1)}% Body Fat — ยอดเยี่ยม! 🎉</span>
                    </p>
                  )
                }
                if (data.streak > 0) {
                  return (
                    <p className="text-xs">
                      🔥 <span className="font-mono font-semibold" style={{ color: '#8CB264' }}>{data.streak} วัน</span> streak ต่อเนื่อง
                    </p>
                  )
                }
                return greetingContext.headline ? (
                  <p className="text-xs font-display tracked uppercase text-amber">{greetingContext.headline}</p>
                ) : null
              })()}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-1">
            <NotificationBell latestPR={data.latestPR} topMuscleThisWeek={data.topMuscleThisWeek} />
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
          <BodyMetricsRow />
        </div>

        {/* streak + weekly goal — สองการ์ดแยกเดี่ยว (ไม่รวมกับแถบปัด Recovery/AI Coach ด้านล่าง)
            เพราะเป็นข้อมูลที่อยากให้เห็นทันทีโดยไม่ต้องปัด ตามดีไซน์ที่เลือก */}
        <WorkoutStreakCard streak={data.streak} weekDayTicks={data.weekDayTicks} today={today} />
        <WeeklyGoalMuscleCard />

        {/* hero — today's workout, ตัวชี้นำหลักของหน้า วางแนวตั้ง (ring อยู่บนสุด) ต่างจาก
            เดสก์ท็อปที่วาง ring ข้างข้อความ เพื่อให้อ่านง่ายบนจอแคบ */}
        <div
          className={`relative rounded-lg border border-amber/60 shadow-hero overflow-hidden ${totals.entryCount === 0 ? 'animate-hero-enter' : 'animate-rise'}`}
          style={{ boxShadow: '0 0 14px #E8A33D40, 0 0 1px #E8A33D', ...(totals.entryCount === 0 ? undefined : { animationDelay: '60ms' }) }}
        >
          <div className="absolute inset-0 bg-surface">
            <div
              className="absolute inset-0 opacity-70"
              style={{
                backgroundImage:
                  "linear-gradient(180deg, rgba(28,31,36,0.55) 0%, rgba(28,31,36,0.9) 75%), url('/images/workout-hero.jpg')",
                backgroundSize: 'cover',
                backgroundPosition: 'top center',
              }}
            />
          </div>
          <div className="relative z-10 px-5 py-5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] tracked uppercase text-muted flex items-center gap-1.5">
                <span aria-hidden="true">🔥</span> Today&apos;s Workout
              </p>
              <GoalRing pct={progressPct ?? (totals.entryCount > 0 ? 100 : 0)} size={56} strokeWidth={6} color="#E8A33D" ariaLabel="ความพร้อมของวันนี้" />
            </div>

            <div className="mt-3">
              {(() => {
                const title = workoutTitle ?? 'ยังไม่ได้ตั้งโปรแกรม'
                const splitAt = title.search(/\s[—-]\s/)
                const dayLabel = splitAt >= 0 ? title.slice(0, splitAt) : null
                const restLabel = splitAt >= 0 ? title.slice(splitAt + 3) : title
                return (
                  <>
                    {dayLabel && <p className="font-display text-base tracked uppercase text-amber leading-tight">{dayLabel}</p>}
                    <p className="font-display text-xl tracked uppercase text-ink leading-tight truncate">{restLabel}</p>
                  </>
                )
              })()}
              {plannedMuscleLabel && <p className="text-xs text-amber mt-1.5 truncate">{plannedMuscleLabel}</p>}

              <div className="flex items-center gap-4 mt-3 flex-wrap">
                <div>
                  <p className="font-mono text-lg text-ink leading-none">{data.todayExercises.length || totals.entryCount}</p>
                  <p className="text-[10px] text-muted mt-0.5">Exercises</p>
                </div>
                <div>
                  <p className="font-mono text-lg text-ink leading-none">{plannedTotalSets}</p>
                  <p className="text-[10px] text-muted mt-0.5">Sets</p>
                </div>
                <div>
                  <p className="font-mono text-lg text-ink leading-none">
                    {totals.durationMin !== null ? Math.round(totals.durationMin) : `~${estimatedMinutes}`}
                  </p>
                  <p className="text-[10px] text-muted mt-0.5">นาที</p>
                </div>
              </div>

              <TodayMuscleChips todayWorkouts={data.todayWorkouts} />

              {scheduledDay ? (
                <Link href="/session" className="inline-flex items-center gap-1.5 mt-4 text-sm font-display tracked uppercase text-bg bg-amber rounded-full px-5 py-2.5 active:scale-[0.99] transition w-full justify-center">
                  {totals.entryCount > 0 ? 'ไปต่อ' : 'เริ่มเทรนเลย'} <span aria-hidden="true">▶</span>
                </Link>
              ) : (
                <Link href="/log" className="inline-flex items-center gap-1.5 mt-4 text-sm font-display tracked uppercase text-bg bg-amber rounded-full px-5 py-2.5 active:scale-[0.99] transition w-full justify-center">
                  เริ่มเทรนเลย <span aria-hidden="true">▶</span>
                </Link>
              )}
              {!scheduledDay && (
                <p className="text-[11px] text-muted mt-2 text-center">
                  ยังไม่มีโปรแกรมวันนี้ —{' '}
                  <Link href="/program" className="text-amber hover:underline">ตั้งโปรแกรม</Link>{' '}
                  หรือ <Link href="/templates" className="text-amber hover:underline">เริ่มจากเทมเพลต</Link>
                </p>
              )}
            </div>
          </div>
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
