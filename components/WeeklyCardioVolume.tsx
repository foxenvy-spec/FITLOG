'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange, volumeStatus, type VolumeStatus } from '@/lib/dashboardStats'
import { computeWeeklyCardioVolume } from '@/lib/weeklyCardioVolume'
import { fetchWeeklyCardioTargets } from '@/lib/weeklyCardioTargets'
import { HR_ZONES, DEFAULT_MAX_HEART_RATE, classifyCardioLoad, CARDIO_LOAD_LABEL } from '@/lib/heartRate'
import { computeVO2Max, classifyVO2Max } from '@/lib/vo2max'
import type { Workout, Profile } from '@/lib/types'
import { todayDayOfWeek } from '@/lib/weekdays'
import { COLORS, withAlpha } from '@/lib/theme'
import AnimatedBarFill from './AnimatedBarFill'
import Skeleton from './Skeleton'
import HeartRateSettings from './HeartRateSettings'
import CardioTargetsSettings from './CardioTargetsSettings'
import ErrorState from './ErrorState'

// ฟีดแบ็ก "อยากได้แค่ 3 สี (steel/moss/rust) ใช้ความเข้มสื่อระดับความรุนแรง" — ใช้ชุดสีเดียวกับ
// WeeklyVolume.tsx ให้สองการ์ดนี้อ่านสอดคล้องกัน (steel = ยังไม่ถึงเป้า, moss = ในช่วงเหมาะสม, rust = สูงเกินไป)
const STATUS_COLOR: Record<VolumeStatus, string> = {
  behind: withAlpha(COLORS.steel, '99'), // steel จาง — ยังห่างเป้าอยู่มาก
  onTrack: COLORS.steel, // steel เต็ม — ใกล้ถึงเป้าแล้ว
  met: withAlpha(COLORS.moss, 'BF'), // moss จาง — เข้าช่วงเหมาะสมพอดี
  high: COLORS.moss, // moss เต็ม — อยู่ในช่วงเหมาะสมแต่เริ่มเยอะ (100-200%)
  veryHigh: COLORS.rust, // rust — เกินช่วงเหมาะสม (>200%)
}

function MetricTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-md bg-surface2 px-3 py-2.5">
      <p className="text-[10px] tracked uppercase text-muted">{label}</p>
      <p className="font-mono text-lg text-ink mt-0.5">
        {value}
        {unit && <span className="text-xs text-muted ml-1">{unit}</span>}
      </p>
    </div>
  )
}

function TargetProgressRow({ label, done, target, unit }: { label: string; done: number; target: number; unit: string }) {
  const dayOfWeek1to7 = ((todayDayOfWeek() + 6) % 7) + 1
  const status = volumeStatus(done, target, dayOfWeek1to7)
  const color = STATUS_COLOR[status]
  const pct = Math.min(100, target > 0 ? (done / target) * 100 : 0)
  const diff = done - target

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-ink">{label}</span>
        <span className="text-[11px] font-mono text-muted">
          {done}
          <span className="text-muted/60">
            /{target} {unit}
          </span>
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-surface2 overflow-hidden">
        <AnimatedBarFill pct={pct} color={color} />
      </div>
      <p className="mt-1 text-[11px] font-mono" style={{ color }}>
        {status === 'met'
          ? 'ถึงเป้าหมายพอดี'
          : status === 'high' || status === 'veryHigh'
            ? `+${diff} ${unit}`
            : `อีก ${target - done} ${unit} ถึงเป้าหมาย`}
      </p>
    </div>
  )
}

export default function WeeklyCardioVolume() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { start, end } = getWeekRange()
  const [hrSettingsOpen, setHrSettingsOpen] = useState(false)
  const [targetsOpen, setTargetsOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['weekly-cardio-volume', start, end],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const [{ data: workouts }, { data: metric }, { data: profileRow }] = await Promise.all([
        supabase
          .from('workouts')
          .select('duration_min, distance_km, cardio_type, avg_heart_rate, calories_kcal, cadence')
          .eq('type', 'cardio')
          .gte('performed_at', start)
          .lte('performed_at', end),
        supabase.from('body_metrics').select('weight_kg').order('measured_at', { ascending: false }).limit(1).maybeSingle(),
        user
          ? supabase
              .from('profiles')
              .select('max_heart_rate, resting_heart_rate')
              .eq('user_id', user.id)
              .maybeSingle()
          : Promise.resolve({ data: null as Pick<Profile, 'max_heart_rate' | 'resting_heart_rate'> | null }),
      ])

      const maxHeartRate = profileRow?.max_heart_rate ?? DEFAULT_MAX_HEART_RATE
      const restingHeartRate = profileRow?.resting_heart_rate ?? null
      const bodyWeightKg = (metric as { weight_kg: number | null } | null)?.weight_kg ?? null
      const cardioWorkouts = (workouts as Workout[]) ?? []
      return {
        volume: computeWeeklyCardioVolume(cardioWorkouts, bodyWeightKg, maxHeartRate),
        maxHeartRate,
        restingHeartRate,
      }
    },
    staleTime: 60_000,
  })

  // เป้าหมายของผู้ใช้เอง (ตั้งได้ต่อคนใน weekly_volume_targets) — ถ้ายังไม่เคยตั้ง จะได้ค่า
  // default กลับมาแทน (ดู lib/weeklyCardioTargets.ts)
  const { data: targets, isLoading: loadingTargets, isError: targetsError } = useQuery({
    queryKey: ['weekly-cardio-targets'],
    queryFn: () => fetchWeeklyCardioTargets(supabase),
    staleTime: 60_000,
  })

  function retry() {
    queryClient.invalidateQueries({ queryKey: ['weekly-cardio-volume'] })
    queryClient.invalidateQueries({ queryKey: ['weekly-cardio-targets'] })
  }

  const volume = data?.volume
  const vo2max = data ? computeVO2Max(data.maxHeartRate, data.restingHeartRate) : null
  const vo2maxCategory = vo2max !== null ? classifyVO2Max(vo2max) : null

  return (
    // v49: rounded-lg (8px) -> rounded-card (24px, token เดียวกับ PremiumCard) ตามฟีดแบ็ก Radius
    <div className="rounded-card bg-surface border border-line shadow-elevated overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] tracked uppercase text-muted">Weekly Cardio Volume</p>
          <p className="font-display text-sm uppercase text-ink mt-0.5">คาร์ดิโอสัปดาห์นี้</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <button
            type="button"
            onClick={() => setTargetsOpen(true)}
            className="text-[11px] text-muted hover:text-ink border border-line rounded px-2 py-1"
          >
            ตั้งเป้าหมาย
          </button>
          <button
            type="button"
            onClick={() => setHrSettingsOpen(true)}
            className="text-[11px] text-muted hover:text-ink border border-line rounded px-2 py-1"
          >
            ชีพจร & VO2Max
          </button>
        </div>
      </div>

      <div className="px-4 pb-4">
        {isError ? (
          <ErrorState title="โหลดข้อมูลคาร์ดิโอไม่สำเร็จ" message="ไม่สามารถโหลดข้อมูลคาร์ดิโอสัปดาห์นี้ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่" onRetry={retry} />
        ) : isLoading || !volume ? (
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : volume.sessions === 0 ? (
          // ฟีดแบ็ก "Card ยังใหญ่เกินไปสำหรับข้อมูล 0 — ทำเป็น Compact Empty State" — เดิมยังโชว์กริด 4
          // ช่องเต็ม (0 นาที/0 ครั้ง/0 kcal/0 กม.) บวกแถบเป้าหมายรายสัปดาห์เต็มรูปแบบแม้ไม่มีข้อมูลคาร์ดิโอ
          // เลยสักครั้งในสัปดาห์นี้ — ยุบเหลือข้อความสั้นๆ พร้อมลิงก์ ให้พื้นที่การ์ดสมส่วนกับข้อมูลที่มี
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <span className="text-2xl" aria-hidden="true">🫀</span>
            <p className="text-xs text-muted">ยังไม่มีข้อมูลคาร์ดิโอสัปดาห์นี้</p>
            {/* ฟีดแบ็ก "Empty State ทำให้มีประโยชน์ขึ้นได้ — บอกว่าเพิ่ม Cardio แล้วจะเห็นอะไร" — บรรทัดเดียว
                กะทัดรัด (ไม่ใช่ bullet 3 บรรทัดแยก) รักษาความ compact ของ empty state นี้ไว้ตามที่เคยตั้งใจ
                ทำไว้ก่อนหน้า (ฟีดแบ็กเดิม "Card ยังใหญ่เกินไปสำหรับข้อมูล 0") แค่เพิ่มเหตุผลสั้นๆ ว่าทำไมควรเพิ่ม */}
            <p className="text-[10px] text-muted/70">เพิ่ม Cardio เพื่อดู Volume · VO₂ Max · Training Load</p>
            <Link href="/log" className="text-[11px] font-display tracked uppercase text-amber hover:underline">
              เพิ่ม Cardio →
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <MetricTile label="Total Minutes" value={volume.totalMinutes.toLocaleString('th-TH')} unit="นาที" />
              <MetricTile label="Sessions" value={String(volume.sessions)} unit="ครั้ง" />
              <MetricTile label="Calories" value={volume.totalCalories.toLocaleString('th-TH')} unit="kcal" />
              <MetricTile label="Distance" value={volume.totalDistanceKm.toLocaleString('th-TH')} unit="กม." />
            </div>

            {(volume.avgHeartRate !== null || volume.avgCadenceSpm !== null || volume.avgCadenceRpm !== null || vo2max !== null) && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {/* Priority 12 (Cardio Dashboard) — mockup ขอ "Heart Rate: Avg 138 bpm" เป็น tile
                    สรุปเดียวกัน ระดับเดียวกับ Total Minutes/Sessions/Calories/Distance — เดิมมีแค่
                    VO2Max ซึ่งคำนวณจาก HR สูงสุด/พัก ไม่ใช่ค่าเฉลี่ยจริงที่วัดได้ระหว่างเซสชัน */}
                {volume.avgHeartRate !== null && <MetricTile label="Avg Heart Rate" value={String(volume.avgHeartRate)} unit="bpm" />}
                {volume.avgCadenceSpm !== null && (
                  <MetricTile label="Avg Cadence" value={String(volume.avgCadenceSpm)} unit="spm" />
                )}
                {volume.avgCadenceRpm !== null && (
                  <MetricTile label="Avg Cadence" value={String(volume.avgCadenceRpm)} unit="rpm" />
                )}
                {vo2max !== null && (
                  <MetricTile
                    label="VO2Max"
                    value={String(vo2max)}
                    unit={vo2maxCategory ? `ml/kg/min · ${vo2maxCategory.label}` : 'ml/kg/min'}
                  />
                )}
              </div>
            )}

            <div className="mt-3 space-y-2.5">
              <p className="text-[10px] tracked uppercase text-muted">เป้าหมายสัปดาห์นี้</p>
              {targetsError ? (
                <p className="text-[11px] text-rustdim">
                  โหลดเป้าหมายไม่สำเร็จ —{' '}
                  <button type="button" onClick={retry} className="underline hover:text-ink">
                    ลองอีกครั้ง
                  </button>
                </p>
              ) : loadingTargets || !targets ? (
                <>
                  <Skeleton className="h-9 w-full rounded-md" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </>
              ) : (
                <>
                  <TargetProgressRow label="นาที" done={volume.totalMinutes} target={targets.minutes} unit="นาที" />
                  <TargetProgressRow label="ครั้ง" done={volume.sessions} target={targets.sessions} unit="ครั้ง" />
                </>
              )}
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] tracked uppercase text-muted">Heart Rate Zone Time</p>
                {volume.hrZones.sessionsWithHR < volume.hrZones.totalCardioSessions && (
                  <p className="text-[10px] text-muted">
                    มี HR {volume.hrZones.sessionsWithHR}/{volume.hrZones.totalCardioSessions} ครั้ง
                  </p>
                )}
              </div>

              {volume.hrZones.sessionsWithHR === 0 ? (
                <p className="text-[11px] text-muted">
                  ยังไม่มีข้อมูลชีพจร — กรอกชีพจรเฉลี่ยตอนบันทึกคาร์ดิโอ (หรือนำเข้าจากรูป) เพื่อดูเวลาในแต่ละโซน
                </p>
              ) : (
                <>
                  {/* ฟีดแบ็ก "ไม่ควรดูแค่เวลาอย่างเดียว — สรุปเป็น Cardio Load: Moderate" — สรุปการกระจาย
                      เวลาต่อโซนเป็นค่าเดียว (ดู classifyCardioLoad, ถ่วงน้ำหนักตามอันดับความหนักของโซน) */}
                  {(() => {
                    const load = classifyCardioLoad(volume.hrZones.minutesByZone)
                    if (!load) return null
                    const loadColor = load === 'light' ? '#7A9B57' : load === 'moderate' ? '#E8A33D' : '#C1503A'
                    return (
                      <p className="text-[11px] mb-2" style={{ color: loadColor }}>
                        Cardio Load: <span className="font-medium">{CARDIO_LOAD_LABEL[load]}</span>
                      </p>
                    )
                  })()}
                  {/* v: mockup ขอแท่งแยกตามโซน (Zone 1 ███ / Zone 2 ███████████ / ...) ให้เทียบความยาว
                      สัปดาห์นี้เห็นภาพชัดกว่าแท่งเดียวไล่สี — เปลี่ยนจาก stacked bar เดิมเป็น 5 แถวแยก
                      เทียบกับโซนที่ใช้เวลามากสุด (ไม่ใช่ totalMinutes) ให้แท่งที่ยาวสุดเต็มความกว้างจริง */}
                  {(() => {
                    const maxZoneMinutes = Math.max(1, ...HR_ZONES.map((z) => volume.hrZones.minutesByZone[z.key] ?? 0))
                    return (
                      <div className="space-y-1.5">
                        {HR_ZONES.map((z) => {
                          const mins = volume.hrZones.minutesByZone[z.key] ?? 0
                          const pct = (mins / maxZoneMinutes) * 100
                          return (
                            <div key={z.key} className="flex items-center gap-2">
                              <span className="text-[10px] text-muted w-24 shrink-0 truncate">{z.label}</span>
                              <span className="relative flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
                                {mins > 0 && (
                                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, backgroundColor: z.color }} />
                                )}
                              </span>
                              <span className="text-[10px] font-mono text-muted w-14 text-right shrink-0">{mins} นาที</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                  <p className="text-[10px] text-muted/70 mt-1.5">
                    * ประมาณจากชีพจรเฉลี่ยต่อเซสชัน ไม่ใช่ค่าต่อเนื่องระหว่างออกกำลังกาย
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <HeartRateSettings
        open={hrSettingsOpen}
        maxHeartRate={data?.maxHeartRate ?? DEFAULT_MAX_HEART_RATE}
        restingHeartRate={data?.restingHeartRate ?? null}
        onClose={() => setHrSettingsOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['weekly-cardio-volume'] })
          setHrSettingsOpen(false)
        }}
      />

      {targets && (
        <CardioTargetsSettings
          open={targetsOpen}
          targets={targets}
          onClose={() => setTargetsOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['weekly-cardio-targets'] })
            setTargetsOpen(false)
          }}
        />
      )}
    </div>
  )
}
