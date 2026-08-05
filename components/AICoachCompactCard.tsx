'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { todayStr } from '@/lib/weekdays'
import { parseRangeToNumber, rirToRpe } from '@/lib/importWorkoutExcel'
import type { WorkoutTemplate, WorkoutTemplateExercise } from '@/lib/types'
import {
  COLORS,
  NEUTRAL,
  withAlpha,
  CARD_GRADIENT_CSS,
  TITANIUM_MESH_CSS,
  CARD_BORDER_CSS,
  CARD_INSET_SHADOW,
  AMBER_GRADIENT_CSS,
  AMBER_GLOW_SHADOW,
} from '@/lib/theme'
import { recoveryStatusColor } from '@/lib/dashboardStats'
import { MUSCLE_GROUP_BODY_REGION, DEFAULT_SECONDARY_BY_PRIMARY, type MuscleGroup } from '@/lib/muscle-groups'
import PremiumCard from './ui/PremiumCard'
import AnimatedBarFill from './AnimatedBarFill'

interface AICoachCompactCardProps {
  message: string
  /** กลุ่มกล้ามเนื้อที่แนะนำวันนี้ + % ฟื้นตัว (ชุดเดียวกับที่ TodaysFocusCard ใช้อยู่แล้ว จาก
   * data.muscleRecommendation) — มีแล้วโชว์ headline + recovery bar + stat chip + จับคู่เทมเพลตให้เริ่ม
   * ได้เลย ไม่มี (ยังไม่เคยฝึกกลุ่มไหนเลย) fallback กลับไปโชว์ message เฉยๆ แบบเดิม */
  muscleRecommendation: { muscleGroup: string; pct: number } | null
  href?: string
  /** รูป AI Coach จริง (public/icons/ai-coach-avatar.png ที่ผู้ใช้ให้มา — 1024x1024 โปร่งใสอยู่แล้ว
   * ไม่ต้อง crop/แก้พื้นหลังเพิ่ม) ดีฟอลต์เป็นไฟล์นี้เสมอ — ส่ง avatarSrc={undefined} เพื่อกลับไปใช้
   * ไอคอนเรขาคณิต fallback ใน AiRingAvatar แทนได้ถ้าต้องการจุดอื่นที่ยังไม่มีรูป */
  avatarSrc?: string
}

async function fetchTemplatesWithExercises(supabase: ReturnType<typeof createClient>) {
  const { data: templates } = await supabase
    .from('workout_templates')
    .select('*')
    .order('created_at', { ascending: false })
  const typedTemplates = (templates as WorkoutTemplate[]) ?? []
  if (typedTemplates.length === 0) return { templates: [], exercisesByTemplate: {} as Record<string, WorkoutTemplateExercise[]> }

  const { data: exRows } = await supabase
    .from('workout_template_exercises')
    .select('*')
    .in(
      'template_id',
      typedTemplates.map((t) => t.id)
    )
    .order('position')

  const grouped: Record<string, WorkoutTemplateExercise[]> = {}
  ;((exRows as WorkoutTemplateExercise[]) ?? []).forEach((ex) => {
    grouped[ex.template_id] = grouped[ex.template_id] ?? []
    grouped[ex.template_id].push(ex)
  })
  return { templates: typedTemplates, exercisesByTemplate: grouped }
}

// v34-v37: ดู comment ประวัติเดิมด้านล่างของไฟล์ก่อนหน้า (git log) — สรุปสั้นๆ avatar วงแหวนจริง +
// headline หมวดร่างกาย/กลุ่มกล้ามเนื้อที่ฝึกด้วยกัน + recovery bar พร้อมคำบรรยาย + chip "ความพร้อม" เด่น +
// 2 chip locked (พลังงาน/การนอน ยังไม่มี Health App) + ปุ่ม gradient
// v38: ฟีดแบ็ก "แนะนำสำหรับคุณ (RecommendedProgramCard) ซ้ำซ้อนกับ AI Coach ไหม" — ยืนยันแล้วว่าซ้ำจริง
// (ทั้งคู่พูดเรื่อง "กล้ามเนื้อที่แนะนำวันนี้" ตัวเดียวกัน) ต่างกันแค่ RecommendedProgramCard มีปุ่ม
// "เริ่มโปรแกรม" ที่ทำงานได้จริง (จับคู่เทมเพลตที่มีท่าตรงกลุ่มกล้ามที่แนะนำ + insert workouts ทันที) —
// ย้าย logic ทั้งหมดของ RecommendedProgramCard มาไว้ในนี้ (data fetching + จับคู่เทมเพลต + ปุ่มเริ่ม) แล้ว
// ลบ RecommendedProgramCard.tsx ทิ้งทั้งไฟล์ — เหลือ Focus Card (สรุปเร็ว) + AI Coach (รายละเอียด + action)
// แทน 3 การ์ดที่พูดเรื่องเดียวกัน — การ์ดนี้เลยไม่ใช่ whole-card Link อีกต่อไป (มีปุ่ม "เริ่มโปรแกรม" ซึ่งเป็น
// <button> ซ้อนใน <a> ไม่ได้ตามหลัก HTML) เปลี่ยนเป็น 2 ปุ่มแยกที่ท้ายการ์ดแทน (ไอคอนไปหน้า /coach +
// ปุ่มหลักเริ่มโปรแกรม) — ไม่ได้พอร์ตสถิติละเอียด (จำนวนท่า/เซ็ต/จุดสีกล้ามเนื้อ) ของการ์ดเดิมมาด้วย เพราะ
// การ์ดนี้แน่นอยู่แล้ว (avatar+headline+recovery+chip) เพิ่มอีกแถวจะรกเกินไป เหลือแค่ชื่อเทมเพลต+ปุ่มเริ่ม
export default function AICoachCompactCard({
  message,
  muscleRecommendation,
  href = '/coach',
  avatarSrc = '/icons/ai-coach-avatar.png',
}: AICoachCompactCardProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [starting, setStarting] = useState(false)
  const [startedMessage, setStartedMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: templateData, isLoading: templatesLoading } = useQuery({
    queryKey: ['recommended-template'],
    queryFn: () => fetchTemplatesWithExercises(supabase),
    staleTime: 60_000,
  })

  const barColor = muscleRecommendation ? recoveryStatusColor(muscleRecommendation.pct) : COLORS.amber
  const mg = muscleRecommendation?.muscleGroup as MuscleGroup | undefined
  const region = mg ? MUSCLE_GROUP_BODY_REGION[mg] : null
  const relatedGroups = mg ? [mg, ...(DEFAULT_SECONDARY_BY_PRIMARY[mg] ?? [])] : []

  // จับคู่เทมเพลตที่มีท่าตรงกับกล้ามเนื้อที่แนะนำวันนี้ (ถ้ามี) ไม่งั้นใช้เทมเพลตล่าสุด — ตรรกะเดียวกับ
  // RecommendedProgramCard เดิมเป๊ะๆ
  const templates = templateData?.templates ?? []
  const exercisesByTemplate = templateData?.exercisesByTemplate ?? {}
  const matched = mg ? templates.find((t) => (exercisesByTemplate[t.id] ?? []).some((ex) => ex.muscle_group === mg)) : undefined
  const chosen = matched ?? templates[0]
  const chosenExercises = chosen ? exercisesByTemplate[chosen.id] ?? [] : []

  async function handleStart() {
    if (!chosen || chosenExercises.length === 0) return
    setStarting(true)
    setErrorMessage(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setErrorMessage('กรุณาเข้าสู่ระบบใหม่')
        return
      }
      const payload = chosenExercises.map((ex) => ({
        user_id: user.id,
        type: 'strength' as const,
        performed_at: todayStr(),
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group,
        secondary_muscles: ex.secondary_muscles,
        exercise_library_id: ex.exercise_library_id,
        sets: ex.sets,
        reps: parseRangeToNumber(ex.target_reps),
        weight_kg: ex.default_weight_kg,
        rpe: rirToRpe(parseRangeToNumber(ex.target_rir)),
        notes: ex.notes,
      }))
      const { error } = await supabase.from('workouts').insert(payload)
      if (error) {
        setErrorMessage(`เริ่ม "${chosen.title}" ไม่สำเร็จ: ${error.message}`)
        return
      }
      setStartedMessage(`บันทึก "${chosen.title}" (${payload.length} ท่า) เข้า Log วันนี้แล้ว`)
      queryClient.invalidateQueries()
    } catch (err) {
      setErrorMessage(`เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setStarting(false)
    }
  }

  return (
    <PremiumCard className="flex flex-col gap-3 px-4 py-4">
      <span className="absolute top-3 right-3 flex items-center gap-1 text-[8px] tracked uppercase text-muted" aria-hidden="true">
        <span className="w-1 h-1 rounded-full shrink-0" style={{ background: COLORS.moss }} />
        อัปเดตล่าสุด
      </span>

      <Link href={href} className="flex items-center gap-3 active:opacity-80 transition">
        <AiRingAvatar src={avatarSrc} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[10px] tracked uppercase text-amber flex items-center gap-1">
            <span aria-hidden="true">✨</span> AI Coach
          </p>
          {muscleRecommendation ? (
            <>
              <p className="text-[10px] tracked uppercase text-muted mt-1">วันนี้เหมาะกับ</p>
              <p className="font-display tracked uppercase text-amber truncate" style={{ fontSize: 17, lineHeight: 1.15 }}>
                {region}
              </p>
              <p className="text-[10px] text-muted truncate mt-0.5">{relatedGroups.join(' • ')}</p>

              <div className="flex items-center gap-2 mt-2.5">
                <p className="text-[9px] tracked uppercase text-muted shrink-0">Recovery</p>
                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }}>
                  <AnimatedBarFill pct={muscleRecommendation.pct} color={barColor} />
                </div>
                <p className="text-[10px] font-mono shrink-0" style={{ color: barColor }}>
                  {muscleRecommendation.pct}%
                </p>
              </div>
              <p className="text-[10px] font-display tracked uppercase mt-0.5" style={{ color: barColor }}>
                {readinessLabelEn(muscleRecommendation.pct)}
              </p>
            </>
          ) : (
            <p className="text-xs text-ink mt-1 truncate">{message}</p>
          )}
        </div>
      </Link>

      {muscleRecommendation && (
        <div className="grid grid-cols-3 gap-1.5">
          <StatChip icon="💪" label="ความพร้อม" value={readinessLabel(muscleRecommendation.pct)} pct={muscleRecommendation.pct} color={barColor} />
          <LockedChip icon="⚡" label="พลังงาน" />
          <LockedChip icon="🌙" label="การนอน" />
        </div>
      )}

      {errorMessage && <p className="text-[11px] text-rusttext">{errorMessage}</p>}

      {startedMessage ? (
        <p className="text-xs text-moss flex items-center gap-1.5">✓ {startedMessage}</p>
      ) : (
        <div className="flex items-center gap-2">
          <Link
            href={href}
            aria-label="ดูคำแนะนำจาก AI Coach"
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ border: `1px solid ${withAlpha(COLORS.amber, '40')}` }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 4h16v11H8l-4 4V4z"
                stroke={COLORS.amber}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>

          {templatesLoading ? (
            <div className="flex-1 h-9 rounded-full skeleton-shimmer bg-surface2" />
          ) : chosen && chosenExercises.length > 0 ? (
            <button
              type="button"
              onClick={handleStart}
              disabled={starting}
              className="flex-1 min-w-0 flex items-center justify-center gap-1.5 text-[11px] font-display tracked uppercase rounded-full px-4 py-2 active:scale-[0.99] transition disabled:opacity-50"
              style={{ background: AMBER_GRADIENT_CSS, boxShadow: AMBER_GLOW_SHADOW, color: NEUTRAL.onAmberText }}
            >
              <span className="truncate">{starting ? '...' : `เริ่ม ${chosen.title}`}</span>
              {!starting && <span aria-hidden="true">▶</span>}
            </button>
          ) : (
            <Link
              href="/templates"
              className="flex-1 min-w-0 flex items-center justify-center gap-1.5 text-[11px] font-display tracked uppercase rounded-full px-4 py-2 active:scale-[0.99] transition"
              style={{ background: AMBER_GRADIENT_CSS, boxShadow: AMBER_GLOW_SHADOW, color: NEUTRAL.onAmberText }}
            >
              สร้างโปรแกรมแรก
            </Link>
          )}
        </div>
      )}
    </PremiumCard>
  )
}

// เกณฑ์เดียวกับ recoveryStatusColor (lib/dashboardStats.ts) — 0-40% แดง/41-75% เหลือง/76-100% เขียว —
// แปลงเป็นข้อความแทนสีเฉยๆ ให้ chip "ความพร้อม" อ่านออกว่าคืออะไร ไม่ใช่แค่แถบสี
function readinessLabel(pct: number): string {
  if (pct >= 76) return 'ดีมาก'
  if (pct >= 41) return 'ปานกลาง'
  return 'ยังไม่พร้อม'
}

// เวอร์ชันอังกฤษตัวพิมพ์ใหญ่ — ใช้กับบรรทัด Recovery โดยตรง (แยกจาก readinessLabel ภาษาไทยที่ใช้ใน
// chip "ความพร้อม" อยู่แล้ว) ให้เข้าชุดกับ label ภาษาอังกฤษตัวพิมพ์ใหญ่อื่นในการ์ดนี้ (AI COACH, RECOVERY)
function readinessLabelEn(pct: number): string {
  if (pct >= 76) return 'Excellent'
  if (pct >= 41) return 'Good'
  return 'Needs Rest'
}

// chip "ความพร้อม" ต้องเด่นกว่า 2 chip ที่เหลือ — พื้น/ขอบใช้สีของค่าจริง (barColor) แทนสีเทากลางเดิม +
// เพิ่ม mini bar ใต้ค่า (pct จริงตัวเดียวกับ Recovery bar ด้านบน ไม่ใช่แถบตกแต่งลอยๆ)
function StatChip({ icon, label, value, pct, color }: { icon: string; label: string; value: string; pct: number; color: string }) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 rounded-xl py-2 px-1"
      style={{ background: withAlpha(color, '14'), border: `1px solid ${withAlpha(color, '40')}` }}
    >
      <span className="text-xs" aria-hidden="true">
        {icon}
      </span>
      <span className="text-[7.5px] tracked uppercase text-muted text-center leading-tight">{label}</span>
      <span className="text-[9.5px] font-display tracked" style={{ color }}>
        {value}
      </span>
      <div className="w-full h-[3px] rounded-full overflow-hidden mt-0.5" style={{ background: 'rgba(255,255,255,.1)' }}>
        <AnimatedBarFill pct={pct} color={color} />
      </div>
    </div>
  )
}

// chip "เร็วๆ นี้" — พลังงาน/การนอน ต้องเชื่อมต่อ Health App ก่อนถึงจะมีข้อมูลจริง (เหตุผล
// เดียวกับ TodayHealthStatsRow) โชว์ไอคอนกุญแจแทนตัวเลข ไม่ใช้ค่า hardcode ที่ไม่มีอะไรรองรับจริง
function LockedChip({ icon, label }: { icon: string; label: string }) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 rounded-xl py-2 px-1"
      style={{ background: 'rgba(255,255,255,.008)', border: '1px solid rgba(255,255,255,.03)' }}
    >
      <span className="text-xs opacity-30" aria-hidden="true">
        {icon}
      </span>
      <span className="text-[7.5px] tracked uppercase text-muted text-center leading-tight opacity-40">{label}</span>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true" opacity={0.7}>
        <rect x="5" y="11" width="14" height="9" rx="2" stroke={NEUTRAL.mutedIcon} strokeWidth="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={NEUTRAL.mutedIcon} strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  )
}

// Avatar วงแหวน — ใช้ภาษา "donut ring" เดียวกับ FitnessRing/GoalRing ที่ใช้ทั่วแอป (ไม่ใช่กรอบสี่เหลี่ยม
// แยกวัสดุ) ให้ AI Coach avatar อยู่ในตระกูลเดียวกับวง progress อื่นๆ — นิ่งสนิท ไม่มี pulse/rotate ตามกฎ
// "Hero มีแค่ใบเดียว" — รับ src ไว้เผื่อไม่มีรูป (fallback ไอคอนเรขาคณิต)
function AiRingAvatar({ src }: { src?: string }) {
  const size = 88
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <div
        className="absolute inset-0 rounded-full"
        style={{ border: `1.5px solid ${withAlpha(COLORS.amber, '45')}`, boxShadow: `0 0 10px ${withAlpha(COLORS.amber, '25')}` }}
      />
      <div
        className="absolute rounded-full overflow-hidden flex items-center justify-center"
        style={{
          inset: 5,
          backgroundImage: [TITANIUM_MESH_CSS, CARD_GRADIENT_CSS].join(', '),
          border: `1px solid ${CARD_BORDER_CSS}`,
          boxShadow: CARD_INSET_SHADOW,
        }}
      >
        {src ? (
          <Image src={src} alt="" width={size} height={size} className="w-full h-full object-cover" style={{ transform: 'scale(1.55)' }} />
        ) : (
          <span className="relative block" style={{ width: '58%' }}>
            <span
              className="absolute rounded-full"
              style={{
                left: 0,
                right: 0,
                top: '46%',
                height: 3,
                background: COLORS.amber,
                boxShadow: `0 0 6px ${COLORS.amber}, 0 0 14px ${withAlpha(COLORS.amber, '88')}`,
              }}
            />
          </span>
        )}
      </div>
    </div>
  )
}
