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
  CNC_CORNER_CLIP_PATH_DEFAULT,
} from '@/lib/theme'
import { recoveryStatusColor } from '@/lib/dashboardStats'
import { MUSCLE_GROUP_BODY_REGION, DEFAULT_SECONDARY_BY_PRIMARY, type MuscleGroup } from '@/lib/muscle-groups'
import PremiumCard from './ui/PremiumCard'
import Button from './ui/Button'
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
  /** เวลาที่ดึงข้อมูล dashboard สำเร็จล่าสุดจริง (React Query `dataUpdatedAt` ของ query ['dashboard', ...]
   * ในหน้า Dashboard) — ใช้แสดง "อัปเดตล่าสุด Xนาทีที่แล้ว" แบบมีข้อมูลจริงรองรับ ไม่ใช่ป้ายลอยๆ ที่ไม่มี
   * ความหมาย ไม่ระบุ = ยังโชว์ป้าย "อัปเดตล่าสุด" เฉยๆ แบบเดิม (เผื่อจุดอื่นเรียกใช้การ์ดนี้โดยไม่มีค่านี้ส่งมา) */
  lastUpdatedAt?: number
}

// v47: ฟีดแบ็ก "เพิ่ม Confidence 98% หรือ Updated 2 min ago" — Confidence % เป็นตัวเลขที่ไม่มีระบบไหนใน
// แอปคำนวณจริง (เคยถูกปฏิเสธไปแล้วรอบก่อนหน้าด้วยเหตุผลเดียวกัน — ไม่ใช้ข้อมูลสมมติ) เลือกทำแค่ "Updated
// X min ago" ซึ่งมีข้อมูลจริงรองรับ (lastUpdatedAt จาก React Query) แทน — ปัดเป็นหน่วยที่หยาบพอจะไม่ต้อง
// re-render ทุกวินาที (นาที/ชั่วโมง/วัน) พอสำหรับความหมาย "เพิ่งอัปเดต" ไม่ต้องเป๊ะระดับวินาที
function relativeUpdatedLabel(lastUpdatedAt: number): string {
  const diffMs = Date.now() - lastUpdatedAt
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'เมื่อสักครู่'
  if (mins < 60) return `${mins} นาทีที่แล้ว`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ชม.ที่แล้ว`
  const days = Math.floor(hours / 24)
  return `${days} วันที่แล้ว`
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
  lastUpdatedAt,
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
      {/* v48b: ฟีดแบ็ก "AI Coach ยังไม่ Wow — เพิ่ม Background Particle" — จุดกระพริบเล็กๆ กระจายห่างๆ
          (เทคนิคเดียวกับที่การ์ด Hero Workout ใช้อยู่แล้วรอบก่อน) วางเฉพาะโซนขวา/ล่างของการ์ด หลีกเลี่ยง
          โซน avatar+ข้อความฝั่งซ้ายที่ยังต้องอ่านออกชัดเจน */}
      {[
        { left: '78%', top: '8%', size: 2, opacity: 0.5 },
        { left: '92%', top: '28%', size: 1.5, opacity: 0.4 },
        { left: '85%', top: '55%', size: 1.5, opacity: 0.35 },
        { left: '95%', top: '75%', size: 1, opacity: 0.3 },
      ].map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{ left: p.left, top: p.top, width: p.size, height: p.size, background: '#FFF4E0', opacity: p.opacity, boxShadow: '0 0 3px 1px rgba(255,244,224,.5)' }}
          aria-hidden="true"
        />
      ))}
      <span className="absolute top-3 right-3 flex items-center gap-1 text-[8px] tracked uppercase text-muted" aria-hidden="true">
        <span className="w-1 h-1 rounded-full shrink-0" style={{ background: COLORS.moss }} />
        {lastUpdatedAt ? `อัปเดต ${relativeUpdatedLabel(lastUpdatedAt)}` : 'อัปเดตล่าสุด'}
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
          <Button as={Link} href={href} variant="icon" aria-label="ดูคำแนะนำจาก AI Coach">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 4h16v11H8l-4 4V4z"
                stroke={COLORS.amber}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Button>

          {templatesLoading ? (
            <div className="flex-1 h-9 rounded-full skeleton-shimmer bg-surface2" />
          ) : chosen && chosenExercises.length > 0 ? (
            <Button type="button" onClick={handleStart} disabled={starting} className="flex-1 min-w-0">
              <span className="truncate">{starting ? '...' : `เริ่ม ${chosen.title}`}</span>
              {!starting && <span aria-hidden="true">▶</span>}
            </Button>
          ) : (
            <Button as={Link} href="/templates" className="flex-1 min-w-0">
              สร้างโปรแกรมแรก
            </Button>
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
  // v45: ฟีดแบ็ก "Robot ยังเล็ก อยากให้ใหญ่ขึ้นอีกประมาณ 25%" (ราว 88 -> 110px) — รอบก่อนหน้าทำแค่ scale
  // รูปข้างในให้เต็มวงเดิม (88px คงที่) ตามที่ขอตอนนั้น "ไม่ต้องเพิ่มขนาดวงแหวน" — รอบนี้ขอเพิ่มสัดส่วน
  // Robot ต่อการ์ดจริง (40/60) ซึ่งต้องขยายวงเองด้วย ไม่ใช่แค่ scale รูปในวงเดิม — scale(1.55) ของรูปข้างใน
  // (ดูด้านล่าง) เป็นค่าสัมพัทธ์กับ container นี้อยู่แล้ว จึงขยายตามไปเองโดยไม่ต้องปรับเลขนั้นซ้ำ
  // v47: ฟีดแบ็ก "จะดี Hero มาก ถ้า Robot ใหญ่ขึ้นอีกนิด ~15%" — 110 -> 127 (110*1.15 ปัดเศษ) เหตุผลเดียวกับ
  // ด้านบน: scale(1.55)/inset:5 ไม่ต้องแก้ตาม ขยายตาม size โดยอัตโนมัติเพียงพอ
  // v48: "Poster Crop" — ฟีดแบ็ก "Robot ใหญ่ขึ้นอีก ~15% แล้ว Crop แบบ Apple จะดูเหมือน Poster" —
  // (1) ขนาด 127 -> 146 (127*1.15 ปัดเศษ) เหตุผลเดียวกับรอบก่อน (2) เปลี่ยนกรอบจากวงกลมสมบูรณ์
  // (rounded-full) เป็นมุมตัด CNC เดียวกับการ์ดอื่นทั่วแอป (CNC_CORNER_CLIP_PATH_DEFAULT) — สี่เหลี่ยม
  // มุมตัด อ่านเป็น "ภาพโปสเตอร์ที่ถูกจัดกรอบ" มากกว่าวงเหรียญ/badge (3) scale 1.55 -> 1.72 ครอปเข้าไป
  // อีกนิด ให้ตัวโรบอทเต็มเฟรมแบบภาพสินค้า ไม่เหลือพื้นหลังว่างรอบขอบเยอะแบบก่อนหน้า
  // v48b: ฟีดแบ็ก "AI Coach ยังไม่ Wow — Robot ใหญ่ขึ้นอีก 20%, Crop แบบ Cinematic" — 146 -> 175
  // (146*1.2 ปัดเศษ) scale 1.72 -> 1.85 (ครอปเข้าไปอีกนิด ให้เป็น close-up มากกว่า "เห็นทั้งหัว+ไหล่"
  // แบบเดิม สมชื่อ cinematic) — inset:5 ไม่ต้องแก้ตาม ขยายตาม size โดยอัตโนมัติเพียงพอเหมือนรอบก่อนๆ
  const size = 175
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          border: `1.5px solid ${withAlpha(COLORS.amber, '45')}`,
          boxShadow: `0 0 10px ${withAlpha(COLORS.amber, '25')}`,
          clipPath: CNC_CORNER_CLIP_PATH_DEFAULT,
        }}
      />
      <div
        className="absolute overflow-hidden flex items-center justify-center"
        style={{
          inset: 5,
          backgroundImage: [TITANIUM_MESH_CSS, CARD_GRADIENT_CSS].join(', '),
          border: `1px solid ${CARD_BORDER_CSS}`,
          boxShadow: CARD_INSET_SHADOW,
          clipPath: CNC_CORNER_CLIP_PATH_DEFAULT,
        }}
      >
        {src ? (
          <>
            <Image src={src} alt="" width={size} height={size} className="w-full h-full object-cover" style={{ transform: 'scale(1.85)' }} />
            {/* v48b: ฟีดแบ็ก "เพิ่ม Eye Glow เบาๆ" — รูปต้นฉบับ (ai-coach-avatar.png) มีตาเรืองแสงอำพันอยู่
                แล้วในตัวรูป แต่ที่ crop/scale ปัจจุบัน (scale 1.85 จากจุดกึ่งกลาง) ตาอยู่ที่ประมาณ (36%,
                33%) ของกรอบที่เห็นจริง (คำนวณจากตำแหน่งตาในรูปต้นฉบับ ~42%,40% ผ่านสูตร zoom เดียวกับที่
                transform ใช้) — วาง radial glow บางๆ ทับตำแหน่งนั้นแบบ mix-blend-mode:screen (เติมแสง
                เข้าไปตรงๆ ไม่ทับสีเดิม) แทนที่จะเดาตำแหน่งมั่วๆ — นิ่งสนิทไม่มี pulse (งบ animation ทั้งแอป
                เต็มแล้ว ตามที่คุยกันไว้หลายรอบ "เหลือแค่ 7 Animation ทั้งแอป") */}
            <div
              className="absolute pointer-events-none"
              style={{
                left: '36%',
                top: '33%',
                width: '30%',
                height: '18%',
                transform: 'translate(-50%, -50%)',
                background: 'radial-gradient(ellipse, rgba(255,180,70,.4), transparent 70%)',
                mixBlendMode: 'screen',
              }}
              aria-hidden="true"
            />
          </>
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
