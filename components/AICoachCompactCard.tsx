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
  TEXT,
  withAlpha,
  CARD_GRADIENT_CSS,
  TITANIUM_MESH_CSS,
  CARD_BORDER_CSS,
  CARD_INSET_SHADOW,
  CNC_CORNER_CLIP_PATH_DEFAULT,
} from '@/lib/theme'
import { recoveryStatusColor, recoveryTier, computeRecoveryPct } from '@/lib/dashboardStats'
import { describeMuscleFocus, dominantMuscleGroup, type MuscleGroup } from '@/lib/muscle-groups'
import { splitTitleDetail } from './TodaysFocusCard'
import PremiumCard from './ui/PremiumCard'
import Button from './ui/Button'
import AnimatedBarFill from './AnimatedBarFill'

interface AICoachCompactCardProps {
  message: string
  /** กลุ่มกล้ามเนื้อที่แนะนำวันนี้ + % ฟื้นตัว (ชุดเดียวกับที่ TodaysFocusCard ใช้อยู่แล้ว จาก
   * data.muscleRecommendation) — มีแล้วโชว์ headline + recovery bar + stat chip + จับคู่เทมเพลตให้เริ่ม
   * ได้เลย ไม่มี (ยังไม่เคยฝึกกลุ่มไหนเลย) fallback กลับไปโชว์ message เฉยๆ แบบเดิม */
  muscleRecommendation: { muscleGroup: string; pct: number } | null
  /** true เมื่อวันนี้เป็น Rest Day จริง (workoutCardVariant==='restDay' ใน MobileDashboardView.tsx —
   * ค่าเดียวกับที่ TodaysWorkoutEmptyCard/TodaysFocusCard ใช้) — muscleRecommendation คำนวณจาก recovery %
   * ล้วนๆ ไม่รู้จัก concept "วันนี้พัก" เลย เดิมการ์ดนี้เลยยังโชว์ "UPPER BODY" + ปุ่ม "เริ่ม DAY 4" ต่อไป
   * แม้ Today's Workout จะบอก REST DAY แล้ว (ฟีดแบ็ก "REST DAY กับ UPPER BODY + ปุ่มเริ่ม ไม่ควรเกิด
   * พร้อมกัน") — true แล้วสลับ headline เป็น "Recovery Day" และตัดปุ่มเริ่มเวิร์กเอาต์ออก */
  isRestDay?: boolean
  href?: string
  /** รูป AI Coach จริง (public/icons/ai-coach-avatar.png ที่ผู้ใช้ให้มา — 1024x1024 โปร่งใสอยู่แล้ว
   * ไม่ต้อง crop/แก้พื้นหลังเพิ่ม) ดีฟอลต์เป็นไฟล์นี้เสมอ — ส่ง avatarSrc={undefined} เพื่อกลับไปใช้
   * ไอคอนเรขาคณิต fallback ใน AiRingAvatar แทนได้ถ้าต้องการจุดอื่นที่ยังไม่มีรูป */
  avatarSrc?: string
  /** เวลาที่ดึงข้อมูล dashboard สำเร็จล่าสุดจริง (React Query `dataUpdatedAt` ของ query ['dashboard', ...]
   * ในหน้า Dashboard) — ใช้แสดง "อัปเดตล่าสุด Xนาทีที่แล้ว" แบบมีข้อมูลจริงรองรับ ไม่ใช่ป้ายลอยๆ ที่ไม่มี
   * ความหมาย ไม่ระบุ = ยังโชว์ป้าย "อัปเดตล่าสุด" เฉยๆ แบบเดิม (เผื่อจุดอื่นเรียกใช้การ์ดนี้โดยไม่มีค่านี้ส่งมา) */
  lastUpdatedAt?: number
  /** วันที่ฝึกล่าสุดของแต่ละกลุ่มกล้ามเนื้อ (data.recoveryDates จาก DashboardView.tsx — คำนวณ
   * recoveryPctForSummary/muscleRecommendation.pct มาจากชุดนี้อยู่แล้วฝั่ง server) ส่งมาด้วยเพื่อให้การ์ด
   * นี้คำนวณ % ฟื้นตัวของ "กลุ่มกล้ามเนื้อหลักของเทมเพลตที่จะเริ่มจริง" เองได้ (ดู comment ที่ displayMg
   * ด้านล่าง — แก้ฟีดแบ็ก "CORE กับ DAY 5 — LOWER ต้องเป็นเรื่องเดียวกัน") ไม่ระบุ = ใช้
   * muscleRecommendation.pct เดิมตรงๆ เหมือนก่อนหน้า (เผื่อจุดอื่นเรียกใช้การ์ดนี้โดยไม่มีค่านี้ส่งมา) */
  recoveryDates?: Record<string, string | null>
  /** true เมื่อ muscleRecommendation คือกล้ามเนื้อของ "วันนี้" จริงๆ (data.isRecommendationForToday จาก
   * DashboardView.tsx) — ฟีดแบ็ก "Today's Focus บอก DAY 5 — LOWER, AI Coach ก็บอก DAY 5 — LOWER แล้วทำไม
   * ป้ายเขียน '· Next'? ถ้ายังไม่เริ่ม Workout วันนี้ ควรเป็น '· Today'" — เดิมป้าย "· Next" hardcode
   * ตายตัวทุกกรณี ทั้งที่ข้อมูลเบื้องหลัง (muscleRecommendation) แยกอยู่แล้วว่าเป็นคำแนะนำของวันนี้เองหรือ
   * ของเซสชันถัดไป (วันนี้ทำครบแล้ว/วันพัก) — เปลี่ยนป้ายให้ตรงกับความจริงแทน ไม่ระบุ = "· Next" เดิม
   * เหมือนก่อนหน้า (เผื่อจุดอื่นเรียกใช้การ์ดนี้โดยไม่มีค่านี้ส่งมา) */
  isRecommendationForToday?: boolean
  /** ชื่อโปรแกรมจริงของวันนี้ (scheduledDay.title เดียวกับที่ TodaysFocusCard ใช้) — ฟีดแบ็ก "Today's
   * Focus บอก 'Lower Body • Hamstring • Glute' (จากชื่อโปรแกรมที่ผู้ใช้พิมพ์เอง) แต่ AI Coach บอก 'ขา •
   * แกนกลางลำตัว' (จากตาราง DEFAULT_SECONDARY_BY_PRIMARY ที่ hardcode ไว้ ไม่ได้ดูท่าจริงของวันนี้เลย) —
   * สองการ์ดควรพูดกลุ่มกล้ามเนื้อเดียวกันด้วยคำเดียวกัน ไม่ใช่บังเอิญคล้ายกัน" — มีชื่อโปรแกรมจริงและเป็น
   * คำแนะนำของ "วันนี้" จริง (ไม่ใช่ Next session ของวันอื่น) ใช้ข้อความในวงเล็บของชื่อโปรแกรมแทนตาราง
   * generic เดิม ไม่ระบุ/ไม่มีวงเล็บ = fallback กลับไปใช้ relatedGroups เดิมทุกประการ */
  todayWorkoutTitle?: string | null
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
  isRestDay = false,
  href = '/coach',
  avatarSrc = '/icons/ai-coach-avatar.png',
  lastUpdatedAt,
  recoveryDates,
  isRecommendationForToday = false,
  todayWorkoutTitle = null,
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

  const mg = muscleRecommendation?.muscleGroup as MuscleGroup | undefined

  // จับคู่เทมเพลตที่มีท่าตรงกับกล้ามเนื้อที่แนะนำวันนี้ — ตรรกะเดิม (RecommendedProgramCard เก่า) หา
  // เทมเพลต "ตัวแรก" ที่มีท่าใดท่าหนึ่งตรงกับ mg เท่านั้น ไม่สนสัดส่วน — ทำให้เทมเพลตที่โฟกัสกล้ามเนื้ออื่น
  // แต่มีท่า mg ปนอยู่แค่ท่าเดียวก็ถูกจับคู่ได้ (เช่น mg=Core ไปจับคู่กับ "Day 5 — Lower" เพราะมีท่า core
  // ปนอยู่ 1 ท่า) และถ้าไม่มีเทมเพลตไหนตรงเลย เดิม fallback ไปที่เทมเพลต "ล่าสุดที่สร้าง" (templates[0])
  // ซึ่งไม่เกี่ยวอะไรกับ mg เลย — ผลคือ headline/tag ด้านบน ("CORE", มาจาก program_days/recovery) กับ
  // ปุ่ม CTA ด้านล่าง ("เริ่ม Day 5 — Lower", มาจาก workout_templates คนละตาราง) ขัดกันได้จริง (ฟีดแบ็ก
  // "CORE กับ DAY 5 — LOWER ต้องแน่ใจว่า Next Session จริงๆ คืออะไร") — แก้โดย (1) เลือกเทมเพลตที่มี
  // "จำนวนท่า" ตรงกับ mg มากที่สุด แทนตัวแรกที่เจอ ลดโอกาสจับคู่กับเทมเพลตที่ mg แค่ปนอยู่ท่าเดียว (2) ตัด
  // fallback ไปเทมเพลตล่าสุดที่ไม่เกี่ยวข้องออก — ไม่มีเทมเพลตไหนมีท่าตรงกับ mg เลยจริงๆ ให้ chosen เป็น
  // undefined แล้วปุ่มด้านล่างเปลี่ยนไปโชว์ "ดูเทมเพลตทั้งหมด" แทนที่จะแอบใช้ชื่อเทมเพลตที่ไม่เกี่ยวข้อง
  const templates = templateData?.templates ?? []
  const exercisesByTemplate = templateData?.exercisesByTemplate ?? {}
  const bestTemplateFor = (targetMg: MuscleGroup) =>
    templates.reduce<WorkoutTemplate | undefined>((best, t) => {
      const count = (exercisesByTemplate[t.id] ?? []).filter((ex) => ex.muscle_group === targetMg).length
      if (count === 0) return best
      const bestCount = best ? (exercisesByTemplate[best.id] ?? []).filter((ex) => ex.muscle_group === targetMg).length : 0
      return count > bestCount ? t : best
    }, undefined)
  const chosen = mg ? bestTemplateFor(mg) : templates[0]
  const chosenExercises = chosen ? exercisesByTemplate[chosen.id] ?? [] : []

  // ฟีดแบ็ก "CORE กับ DAY 5 — LOWER ยังขัดกัน" — การจับคู่เทมเพลตที่แม่นขึ้นด้านบน (bestTemplateFor)
  // แก้แค่ "เลือกเทมเพลตผิด" แต่หัวข้อ/แท็กด้านบน (region/relatedGroups) ยังคำนวณจาก mg ตรงๆ อยู่ดี ซึ่ง
  // เป็นกล้ามเนื้อ "เดี่ยว" ที่ recovery สูงสุด/ตารางกำหนด ไม่ใช่กล้ามเนื้อหลักของเทมเพลตที่ปุ่มจะเริ่มจริง —
  // ถ้าเทมเพลตที่จับคู่ได้ (chosen) โฟกัสกล้ามเนื้อกลุ่มอื่นเป็นหลัก (เช่น เทมเพลต "Day 5 — Lower" ที่มีท่า
  // ขา 5 ท่า + ท่า core ปนอยู่ 1 ท่าที่ทำให้จับคู่ได้) หัวข้อก็ยังจะขึ้น "CORE" ต่อไปทั้งที่ปุ่มพาไปเริ่ม
  // เซสชันขา — แก้โดยหากล้ามเนื้อที่มีท่ามากที่สุดในเทมเพลตที่เลือกจริง (dominantMg) แล้วใช้ตัวนั้นแทน mg
  // ในการคำนวณ headline/subtitle/recovery % ทั้งหมด รับประกันว่าสิ่งที่เห็นบนการ์ดตรงกับสิ่งที่ปุ่มจะทำเป๊ะ
  // เสมอ — ไม่มีเทมเพลตที่เลือกได้ (Rest Day/ไม่มีเทมเพลตตรงเลย) ไม่มีปุ่มให้ต้องสอดคล้องด้วย จึงกลับไปใช้ mg
  // เดิมตามปกติ (คำแนะนำล้วนๆ ไม่ผูกกับ action ไหน)
  const displayMg = dominantMuscleGroup(chosenExercises) ?? mg
  const focus = displayMg ? describeMuscleFocus(displayMg) : null
  const region = focus?.region ?? null
  const relatedGroups = focus?.relatedGroups ?? []
  // ใช้ชื่อโปรแกรมจริงของวันนี้แทนตาราง generic ด้านบน เมื่อมีชื่อโปรแกรมจริงและเป็นคำแนะนำของวันนี้
  // จริง (ไม่ใช่ Next session ของวันอื่นที่ todayWorkoutTitle ไม่ได้อธิบายอยู่แล้ว) — ดู comment ที่
  // todayWorkoutTitle prop ด้านบน
  const specificDetail =
    isRecommendationForToday && todayWorkoutTitle ? splitTitleDetail(todayWorkoutTitle).detail : null
  const relatedGroupsText = specificDetail ?? relatedGroups.join(' • ')
  // ฟีดแบ็ก "ทำไม AI บอกว่าเป็น Day 2 ทั้งที่ตารางจริงเป็น Day 4 แล้ว" — chosen.title มาจาก
  // workout_templates (คลังเทมเพลตแยกต่างหาก ไม่ผูกกับ program_days ที่หน้าโปรแกรมใช้เลย) บังเอิญตั้งชื่อ
  // เทมเพลตด้วยคำนำหน้า "Day N" แบบเดียวกับเลขวันในตารางโปรแกรมจริง ทำให้ผู้ใช้เข้าใจผิดว่าเป็นเลขวัน
  // เดียวกัน — ใช้ชื่อกล้ามเนื้อหลัก (displayMg) แทน chosen.title ทั้งปุ่มเริ่ม/ข้อความสำเร็จ/ข้อผิดพลาด
  // ตัดคำว่า "Day N" ที่ไม่มีความหมายอะไรกับผู้ใช้ออกไปเลย
  const startLabel = displayMg ?? 'ท่านี้'
  const displayPct = displayMg
    ? recoveryDates
      ? computeRecoveryPct(recoveryDates[displayMg] ?? null, displayMg)
      : (displayMg === mg ? muscleRecommendation?.pct : undefined) ?? 0
    : 0
  const barColor = muscleRecommendation ? recoveryStatusColor(displayPct) : COLORS.amber

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
        setErrorMessage(`เริ่ม "${startLabel}" ไม่สำเร็จ: ${error.message}`)
        return
      }
      setStartedMessage(`บันทึก "${startLabel}" (${payload.length} ท่า) เข้า Log วันนี้แล้ว`)
      queryClient.invalidateQueries()
    } catch (err) {
      setErrorMessage(`เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setStarting(false)
    }
  }

  return (
    // v30: ฟีดแบ็ก "AI Coach Card ใหญ่ไปนิด...เกือบกลายเป็น Dashboard ใน Dashboard ผมจะลดประมาณ 15-20%" —
    // padding เดิม px-4 py-4 (16px) ลดเหลือ px-3.5 py-3.5 (14px, -12.5%) ร่วมกับ avatar ที่เล็กลงและ
    // gap ที่แคบลงด้านล่าง รวมกันแล้วการ์ดทั้งใบเตี้ย/แคบลงตามสัดส่วนที่ขอ โดยไม่ตัดข้อมูลออก
    // v51: ฟีดแบ็ก "ยังใหญ่ไปอีก ~10-15% โดยเฉพาะช่องว่างระหว่าง Robot กับข้อมูลด้านขวา" — ไม่ตัด Robot
    // ออกตามที่ขอ (เป็น Brand Identity ไปแล้ว) แต่ลด padding อีกขั้น (14px -> 12px) + gap ระหว่างแถว
    // (10px -> 8px) รวมกับ avatar ที่เล็กลง (ดู AiRingAvatar) ให้ความสูงรวมลดลงจริงตามเป้า
    // v52: ฟีดแบ็ก "AI Coach คือพระเอก แต่ยังใหญ่ไปนิดหนึ่ง ลดอีก 10-15%" (รอบถัดมาหลัง v51) — padding
    // แนวตั้งลดอีกขั้น (12px -> 10px) gap ลดอีกขั้น (8px -> 6px) ต่อจาก avatar ที่เล็กลงอีก (ดู AiRingAvatar)
    <PremiumCard className="flex flex-col gap-1.5 px-3 py-2.5">
      {/* v48b: ฟีดแบ็ก "AI Coach ยังไม่ Wow — เพิ่ม Background Particle" — จุดกระพริบเล็กๆ กระจายห่างๆ
          (เทคนิคเดียวกับที่การ์ด Hero Workout ใช้อยู่แล้วรอบก่อน) วางเฉพาะโซนขวา/ล่างของการ์ด หลีกเลี่ยง
          โซน avatar+ข้อความฝั่งซ้ายที่ยังต้องอ่านออกชัดเจน */}
      {/* v54: ฟีดแบ็ก "AI Coach ยังใหญ่ไปนิดใน Rest Day — เบาลงหน่อย" — particle ตกแต่งล้วนๆ (ไม่มีข้อมูล)
          ตัดออกตอน isRestDay ให้การ์ดดูนิ่ง/เบาขึ้นสมกับเป็นวันพัก ไม่ตัดตอนวันฝึกปกติ */}
      {!isRestDay && [
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
      {/* v16: ฟีดแบ็ก "Typography บางจุดยังบางและเล็ก โดยเฉพาะ AI Coach description" — ป้าย timestamp
          นี้ (meta text เล็กสุดในการ์ด) ยังเป็น text-muted (#9498A0) เดิม ไม่เคยถูกแตะเลยตลอดหลายรอบก่อน
          ขยับเป็น #CFD4DE ตามระดับเดียวกับ caption อื่นในการ์ดนี้ */}
      <span className="absolute top-3 right-3 flex items-center gap-1 text-[8px] tracked uppercase" style={{ color: '#CFD4DE' }} aria-hidden="true">
        <span className="w-1 h-1 rounded-full shrink-0" style={{ background: COLORS.moss }} />
        {lastUpdatedAt ? `อัปเดต ${relativeUpdatedLabel(lastUpdatedAt)}` : 'อัปเดตล่าสุด'}
      </span>

      {/* v51: gap ระหว่าง Robot กับข้อมูลด้านขวา 12px -> 10px ตามฟีดแบ็ก "ลดช่องว่างระหว่าง Robot กับ
          ข้อมูลด้านขวา" — เล็กน้อยพอไม่ให้ดูอึดอัด แต่ช่วยเก็บพื้นที่แนวนอนกลับมาให้คอลัมน์ข้อความ
          v52: ลดอีกขั้น 10px -> 8px ตามรอบต่อมา */}
      <Link href={href} className="flex items-center gap-2 active:opacity-80 transition">
        {/* v56: ฟีดแบ็ก "P4 — Robot ยังหนักกว่าข้อความข้างๆ อีก 5-8% (ไม่เปลี่ยน Layout)" — ลดต่อจาก
            112/96 (v54) อีก ~7% (112->104, 96->89) สัดส่วน isRestDay ต่อวันฝึกปกติเดิมยังคงไว้ (~0.857)
            ไม่แตะ layout/gap รอบๆ (flex items-center gap-2 เดิม ปรับตัวตาม avatar อัตโนมัติอยู่แล้ว) */}
        <AiRingAvatar src={avatarSrc} size={isRestDay ? 89 : 104} />
        <div className="min-w-0 flex-1">
          {/* v30: ฟีดแบ็ก "Orange = Action/Energy เท่านั้น" — ป้ายชื่อการ์ด "AI Coach" เอง ไม่ใช่ action/
              คำแนะนำ (ตัว region ด้านล่างต่างหากที่เป็นคำแนะนำจริง) เปลี่ยนจาก text-amber เป็น TEXT.body
              (เทาสว่าง) เก็บ sparkle emoji ไว้เป็นตัวบ่งชี้ AI เพียงพอโดยไม่ต้องย้อมสีข้อความทั้งบรรทัด
              v61: ฟีดแบ็ก "Today's Workout บอก LOWER BODY เสร็จแล้ว แต่ AI Coach บอก UPPER BODY — ผู้ใช้
              อาจสงสัยว่าทำไมขัดกัน ทั้งที่จริงๆ AI Coach ตั้งใจแนะนำ 'ครั้งถัดไป' ควรสื่อให้ชัดกว่านี้" —
              เพิ่ม '· Next' ต่อท้ายป้าย ให้รู้ทันทีว่าการ์ดนี้พูดถึงเซสชันถัดไป ไม่ใช่สรุปสิ่งที่ทำไปวันนี้
              v69: ฟีดแบ็ก "Today's Focus บอก DAY 5 — LOWER, AI Coach ก็บอก DAY 5 — LOWER แล้วทำไมป้าย
              ยังเขียน '· Next'? ถ้ายังไม่เริ่ม Workout วันนี้ ควรเป็น '· Today'" — เดิม '· Next' ตายตัว
              ทุกกรณี ทั้งที่ muscleRecommendation แยกอยู่แล้วว่าเป็นคำแนะนำของวันนี้เองหรือของเซสชันถัดไป
              (isRecommendationForToday จาก DashboardView.tsx) — สลับป้ายตามจริง: วันนี้ยังไม่เริ่ม/ทำไม่
              ครบ = '· Today', ทำครบแล้ว/วันพัก = '· Next' เดิม */}
          <p className="font-display text-[10px] tracked uppercase flex items-center gap-1" style={{ color: TEXT.body }}>
            <span aria-hidden="true">✨</span> AI Coach · {isRecommendationForToday && !isRestDay ? 'Today' : 'Next'}
          </p>
          {muscleRecommendation ? (
            <>
              {/* v25: ฟีดแบ็ก "④ ลดความแน่นของ AI Coach — ตัดข้อความรองบางส่วน" — ตัด "วันนี้เหมาะกับ"
                  ออก (บรรทัดนำเฉยๆ ไม่มีข้อมูลใหม่ — ป้าย "AI Coach" ด้านบน + ตัว region เองบอกความหมาย
                  ได้ครบอยู่แล้ว) และตัดบรรทัด readinessLabelEn (EXCELLENT ฯลฯ) ด้านล่าง Recovery bar ออก
                  ด้วย (ซ้ำความหมายกับตัวเลข % ที่อยู่ติดกันอยู่แล้ว สีเดียวกันด้วย) เหลือแค่ region +
                  relatedGroups + Recovery bar/% ตามที่ขอ */}
              <p className="font-display font-semibold tracked uppercase text-amber truncate mt-1" style={{ fontSize: 21, lineHeight: 1.15 }}>
                {isRestDay ? 'Recovery Day' : region}
              </p>
              {/* v61: ฟีดแบ็ก "'UPPER BODY' อ่านเดี่ยวๆ เหมือนสรุปวันนี้ ไม่ใช่คำแนะนำครั้งถัดไป" — เติม
                  "Next session • " นำหน้า relatedGroups เฉพาะกรณีมีกลุ่มกล้ามเนื้อแนะนำจริง (ไม่ใช่ Rest
                  Day ซึ่งมีข้อความอธิบายของตัวเองอยู่แล้วว่าเป็นวันพัก ไม่ใช่ "ครั้งถัดไป" แบบมีกลุ่มกล้ามเนื้อ)
                  v69: บรรทัดนี้ต้องสลับคำนำหน้าให้ตรงกับป้าย "· Today"/"· Next" ด้านบนด้วย ไม่งั้นหัวข้อ
                  บอก "Today" แต่บรรทัดรองยังพูดว่า "Next session" ขัดกันเอง */}
              <p className="truncate mt-0.5" style={{ fontSize: 10, color: '#CFD4DE' }}>
                {isRestDay
                  ? 'วันนี้เหมาะกับการพักและฟื้นตัว'
                  : `${isRecommendationForToday ? 'Today' : 'Next session'} • ${relatedGroupsText}`}
              </p>

              {/* v58: ฟีดแบ็ก "Training Readiness 48 vs Recovery 100% ดูขัดกัน — ถ้าเป็นคนละ Metric ต้อง
                  อธิบายให้ชัด" — ป้าย "Recovery" เดิมสั้นเกินจนอ่านเหมือนจะเป็นตัวเดียวกับ Training Readiness
                  ที่อยู่บน Header (คนละการ์ด แต่ใช้คำเดียวกัน) — เปลี่ยนเป็น "Muscle Recovery" ให้ชัดว่าเป็น
                  % ฟื้นตัวของกลุ่มกล้ามเนื้อที่แนะนำวันนี้กลุ่มเดียว ไม่ใช่คะแนนรวมวันนี้ — จับคู่กับ
                  "Recovery (Avg)" ที่เปลี่ยนชื่อคู่กันใน breakdown ของ Training Readiness
                  (MobileDashboardView.tsx/FitnessScoreDetailSheet.tsx)
                  v65: ฟีดแบ็ก "CORE กับ DAY 5 — LOWER ยังขัดกัน" — เปลี่ยนจาก muscleRecommendation.pct
                  (กล้ามเนื้อเดี่ยวที่แนะนำ) เป็น displayPct (กล้ามเนื้อหลักของเทมเพลตที่ปุ่มจะเริ่มจริง —
                  ดู comment ที่ displayMg ด้านบน) ให้ % นี้สอดคล้องกับ headline/subtitle ด้านบนเสมอ */}
              <div className="flex items-center gap-2 mt-1.5">
                <p className="text-[9px] tracked uppercase shrink-0" style={{ color: '#CFD4DE' }}>Muscle Recovery</p>
                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }}>
                  <AnimatedBarFill pct={displayPct} color={barColor} />
                </div>
                <p className="text-[10px] font-mono shrink-0" style={{ color: barColor }}>
                  {displayPct}%
                </p>
              </div>
              {/* v70: ฟีดแบ็ก "AI Coach ควรอธิบายเหตุผลสั้นๆ 1-2 บรรทัด เช่น 'เหมาะกับการฝึกระดับปานกลาง
                  วันนี้' แทนที่จะโชว์แค่ % เฉยๆ" — ดึงจาก recoveryTier().adviceTh (เกณฑ์/รอยต่อเดียวกับสี
                  ของแท่ง Recovery ด้านบนเป๊ะ ไม่คิดเกณฑ์ใหม่แยกต่างหาก กันข้อความกับสีขัดกันเอง) ไม่โชว์ตอน
                  Rest Day (มีข้อความอธิบายของตัวเองอยู่แล้วว่าเป็นวันพัก ไม่ใช่คำแนะนำระดับความหนัก) */}
              {!isRestDay && (
                <p className="truncate mt-1" style={{ fontSize: 10, color: barColor }}>
                  {recoveryTier(displayPct).adviceTh}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-ink mt-1 truncate">{message}</p>
          )}
        </div>
      </Link>

      {/* v53: ฟีดแบ็ก "ตัดข้อมูลที่ไม่จำเป็นออก เช่น พลังงาน🔒/การนอน🔒 — ถ้ายังไม่เปิดใช้งานจริง ไม่ควร
          กินพื้นที่มาก ทำให้ AI Coach เตี้ยลง 10-15%" — เดิมที่นี่มี StatChip "ความพร้อม" + LockedChip
          "พลังงาน"/"การนอน" 3 ช่อง (2 ใน 3 เป็นแค่ไอคอนกุญแจ ไม่มีข้อมูลจริงให้ดู เพราะยังไม่เชื่อมต่อ
          Health App) — ตัดทั้งแถวออกตามที่ขอ ("ความพร้อม" ยังอ่านได้ครบจาก Recovery bar + %/EXCELLENT
          ด้านบนอยู่แล้ว ไม่เสียข้อมูลจริง) เหลือแค่ region/recovery/CTA ตามที่ขอให้เป็น "จุดสำคัญที่สุด" —
          StatChip/LockedChip/readinessLabel (ไทย, ใช้แค่ใน StatChip) ไม่มีจุดเรียกใช้แล้ว ลบทิ้งทั้งหมด
          (ดูท้ายไฟล์) */}

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

          {isRestDay ? (
            // ฟีดแบ็ก "REST DAY ไม่ควรมีปุ่มเริ่ม DAY 4 — UPPER" — ตัดปุ่ม "เริ่ม [เทมเพลต]" ออกทั้งชุด
            // (chosen/handleStart ยังคำนวณอยู่เบื้องหลังเหมือนเดิม เผื่อ isRestDay สลับเป็น false ระหว่าง
            // เซสชัน แต่จะไม่ถูกเสนอเป็น action หลักตอนวันนี้เป็นวันพัก) เปลี่ยนเป็นลิงก์เบาๆ ไปดู
            // Recovery/AI Coach แทน ไม่ใช่ CTA เด่นแบบ "เริ่ม" เพราะ Rest Day ไม่ควรมี action ที่เด่นกว่า "พัก"
            <Button as={Link} href={href} className="flex-1 min-w-0">
              ดู Recovery →
            </Button>
          ) : templatesLoading ? (
            <div className="flex-1 h-9 rounded-full skeleton-shimmer bg-surface2" />
          ) : chosen && chosenExercises.length > 0 ? (
            // v50: ฟีดแบ็ก "CTA ยาวเกินไป — เริ่ม DAY 5 — LOWER (HAMSTRING/GL... ถูกตัด บนมือถือ" — เดิมใช้
            // chosen.title (ชื่อเทมเพลตเต็ม) ตัดแค่ส่วนในวงเล็บออกด้วย splitTitleDetail
            // v72: ฟีดแบ็ก "ทำไม AI บอกว่าเป็น Day 2 ทั้งที่ตารางจริงเป็น Day 4 แล้ว" — chosen.title มาจาก
            // workout_templates (คนละตารางกับ program_days ที่หน้าโปรแกรมใช้) บังเอิญตั้งชื่อด้วยคำนำหน้า
            // "Day N" ชนกับเลขวันในตารางโปรแกรมจริงของผู้ใช้ ทำให้เข้าใจผิดว่าเป็นเลขเดียวกัน — เปลี่ยนไปใช้
            // startLabel (ชื่อกล้ามเนื้อหลัก) แทนทั้งหมด ตัดคำว่า "Day N" ที่ไม่มีความหมายออกไปเลย
            <Button type="button" onClick={handleStart} disabled={starting} className="flex-1 min-w-0">
              <span className="truncate">{starting ? '...' : `เริ่ม ${startLabel}`}</span>
              {!starting && <span aria-hidden="true">→</span>}
            </Button>
          ) : templates.length > 0 ? (
            // ฟีดแบ็ก "CORE กับ DAY 5 — LOWER" — กรณีมีเทมเพลตอยู่แล้วแต่ไม่มีตัวไหนมีท่าตรงกับ mg เลย
            // (bestTemplateFor คืน undefined) เดิมจะหลุดไปโชว์ "สร้างโปรแกรมแรก" ซึ่งผิด (มีเทมเพลตอยู่แล้ว)
            // และก่อนหน้านั้นยิ่งแย่กว่าคือแอบใช้เทมเพลตที่ไม่เกี่ยวข้องแทน — แยกเป็นข้อความที่ตรงความจริง
            <Button as={Link} href="/templates" className="flex-1 min-w-0">
              ดูเทมเพลตทั้งหมด →
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

// Avatar วงแหวน — ใช้ภาษา "donut ring" เดียวกับ FitnessRing/GoalRing ที่ใช้ทั่วแอป (ไม่ใช่กรอบสี่เหลี่ยม
// แยกวัสดุ) ให้ AI Coach avatar อยู่ในตระกูลเดียวกับวง progress อื่นๆ — นิ่งสนิท ไม่มี pulse/rotate ตามกฎ
// "Hero มีแค่ใบเดียว" — รับ src ไว้เผื่อไม่มีรูป (fallback ไอคอนเรขาคณิต)
function AiRingAvatar({ src, size = 112 }: { src?: string; size?: number }) {
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
  // v30: ฟีดแบ็ก "AI Coach Card ใหญ่ไปนิด...เกือบกลายเป็น Dashboard ใน Dashboard ผมจะลดประมาณ 15-20%" —
  // ย้อนทิศทาง 5 รอบก่อนหน้า (88→110→127→146→175 ไล่ใหญ่ขึ้นทุกรอบ) เป็นครั้งแรก ลดลง ~17% (175→145)
  // scale/inset ไม่ต้องแก้ตาม (สัมพัทธ์กับ size โดยอัตโนมัติเหมือนทุกรอบที่ผ่านมา)
  // v51: ฟีดแบ็ก "ลดความสูง Card อีก 10-15%" — avatar (145px) เป็นตัวกำหนดความสูงแถวบนของการ์ดอยู่แล้ว
  // (สูงกว่าคอลัมน์ข้อความข้างๆ) ลดต่ออีกขั้น 145 -> 128 (-12%) ยังคง Robot ไว้เต็มรูปแบบตามที่ขอ (ไม่ตัด
  // ออก) แค่เล็กลงพอให้การ์ดโดยรวมเตี้ยลงจริงตามเป้า — scale/inset ไม่ต้องแก้ตามเหตุผลเดิม
  // v52: ฟีดแบ็ก "AI Coach คือพระเอก แต่ยังใหญ่ไปนิดหนึ่ง (Robot/3 กล่อง/ปุ่ม Start รวมกันอยู่ในการ์ด
  // เดียว) ลดความสูงอีก 10-15%" — 128 -> 112 (-12.5%) ยังไม่ตัด Robot ออกตามที่ยืนยันซ้ำอีกครั้ง
  // v54: ฟีดแบ็ก "AI Coach ยังใหญ่ไปนิดใน Rest Day — Card ควรเบาลง ~15-20%" — size กลายเป็น prop (ดีฟอลต์
  // 112 เดิม ไม่กระทบวันฝึกปกติ) — ผู้เรียก (ด้านล่าง) ส่ง 96 ตอน isRestDay (-14%, ใกล้เคียงที่ขอ) แทนที่
  // จะแก้ค่าคงที่ตรงนี้ตรงๆ ซึ่งจะกระทบวันฝึกปกติไปด้วย
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      {/* v30: ฟีดแบ็ก "Orange = Action/Energy เท่านั้น" — กรอบ+glow รอบ avatar เดิมสีอำพัน เป็นแค่กรอบ
          ตกแต่ง ไม่ใช่ action เปลี่ยนเป็นสีขาวกลาง (Titanium) แทน */}
      <div
        className="absolute inset-0"
        style={{
          border: '1.5px solid rgba(255,255,255,.28)',
          boxShadow: '0 0 10px rgba(255,255,255,.12)',
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
