'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { todayStr } from '@/lib/weekdays'
import { parseRangeToNumber, rirToRpe } from '@/lib/importWorkoutExcel'
import type { WorkoutTemplate, WorkoutTemplateExercise } from '@/lib/types'
import { getErrorMessage } from '@/lib/errors'
import {
  COLORS,
  TEXT,
  CARD_GRADIENT_CSS,
  TITANIUM_MESH_CSS,
  CARD_BORDER_CSS,
  CARD_INSET_SHADOW,
  CNC_CORNER_CLIP_PATH_DEFAULT,
} from '@/lib/theme'
import { recoveryTier, recoveryVerdictEmoji, type TodaysRecommendation } from '@/lib/dashboardStats'
import { describeMuscleFocus, formatRelatedGroups, type MuscleGroup } from '@/lib/muscle-groups'
import { resolveRecommendationDisplay } from '@/lib/recommendationDisplay'
import { splitTitleDetail } from './TodaysFocusCard'
import PremiumCard from './ui/PremiumCard'
import Button from './ui/Button'

interface AICoachCompactCardProps {
  message: string
  /** กลุ่มกล้ามเนื้อที่แนะนำวันนี้ + % ฟื้นตัว (ชุดเดียวกับที่ TodaysFocusCard ใช้อยู่แล้ว จาก
   * data.muscleRecommendation) — มีแล้วโชว์ headline + recovery bar + stat chip + จับคู่เทมเพลตให้เริ่ม
   * ได้เลย ไม่มี (ยังไม่เคยฝึกกลุ่มไหนเลย) fallback กลับไปโชว์ message เฉยๆ แบบเดิม */
  /** setsRemaining: เซ็ตที่เหลือถึงเป้าหมายรายสัปดาห์ของ muscleGroup นี้ (จาก Weekly Volume Engine,
   * computeTodaysRecommendation ใน lib/dashboardStats.ts) — ติดลบได้ถ้าเกินเป้าแล้ว ใช้ต่อท้าย
   * advice line ด้านล่างเมื่อยังเหลือโควตาจริง (ดู comment ที่จุดโชว์ adviceTh) */
  muscleRecommendation: TodaysRecommendation | null
  /** true เมื่อวันนี้เป็น Rest Day จริง (workoutCardVariant==='restDay' ใน MobileDashboardView.tsx —
   * ค่าเดียวกับที่ TodaysWorkoutEmptyCard/TodaysFocusCard ใช้) — muscleRecommendation คำนวณจาก recovery %
   * ล้วนๆ ไม่รู้จัก concept "วันนี้พัก" เลย เดิมการ์ดนี้เลยยังโชว์ "UPPER BODY" + ปุ่ม "เริ่ม DAY 4" ต่อไป
   * แม้ Today's Workout จะบอก REST DAY แล้ว (ฟีดแบ็ก "REST DAY กับ UPPER BODY + ปุ่มเริ่ม ไม่ควรเกิด
   * พร้อมกัน") — true แล้วสลับ headline เป็น "Recovery Day" และตัดปุ่มเริ่มเวิร์กเอาต์ออก */
  isRestDay?: boolean
  href?: string
  /** เวลาที่ดึงข้อมูล dashboard สำเร็จล่าสุดจริง (React Query `dataUpdatedAt` ของ query ['dashboard', ...]
   * ในหน้า Dashboard) — ใช้แสดง "อัปเดตล่าสุด Xนาทีที่แล้ว" แบบมีข้อมูลจริงรองรับ ไม่ใช่ป้ายลอยๆ ที่ไม่มี
   * ความหมาย ไม่ระบุ = ยังโชว์ป้าย "อัปเดตล่าสุด" เฉยๆ แบบเดิม (เผื่อจุดอื่นเรียกใช้การ์ดนี้โดยไม่มีค่านี้ส่งมา) */
  lastUpdatedAt?: number
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
  /** กล้ามเนื้อของ "Next →" ตัวจริงตามตารางโปรแกรม (findNextProgramDay + program_exercises ของวันนั้น จาก
   * DashboardView.tsx) — คนละ lookup กับที่การ์ดนี้ใช้แนะนำ (getNextScheduledMuscle/suggestMuscleToTrain,
   * ตั้งใจแยกโดเมนกัน ดู "Recommendation Consistency" ใน lib/dashboardStats.test.ts) ใช้เทียบอย่างเดียว
   * เพื่อกันปุ่ม "เริ่ม X" ชวนเริ่มเซสชันที่ดูเหมือนเป็น Next Session แต่จริงๆ ไม่ตรงกับ "Next →" ของการ์ด
   * Training This Week เลย (ฟีดแบ็ก "Training This Week บอกจันทร์-Lower Body แต่ Coach แนะนำอก+ไหล่+แขน
   * พร้อมปุ่มเริ่มพฤหัส-Core/Abs คนละวันคนละกล้ามเนื้อ") — ไม่ใช้เปลี่ยน headline/recovery%/recommendation
   * logic ใดๆ เลย แค่ตัดสินใจว่าจะโชว์ปุ่ม "เริ่ม X" หรือ "ดูคำแนะนำเพิ่มเติม" เท่านั้น ไม่ระบุ = ไม่เช็ค
   * (พฤติกรรมเดิมทุกประการ เผื่อจุดเรียกใช้อื่นที่ไม่มีข้อมูลนี้ส่งมา เช่น MobileDashboardView.tsx) */
  nextScheduledMuscleGroup?: string | null
}

// v47: ฟีดแบ็ก "เพิ่ม Confidence 98% หรือ Updated 2 min ago" — Confidence % เป็นตัวเลขที่ไม่มีระบบไหนใน
// แอปคำนวณจริง (เคยถูกปฏิเสธไปแล้วรอบก่อนหน้าด้วยเหตุผลเดียวกัน — ไม่ใช้ข้อมูลสมมติ) เลือกทำแค่ "Updated
// X min ago" ซึ่งมีข้อมูลจริงรองรับ (lastUpdatedAt จาก React Query) แทน — ปัดเป็นหน่วยที่หยาบพอจะไม่ต้อง
// re-render ทุกวินาที (นาที/ชั่วโมง/วัน) พอสำหรับความหมาย "เพิ่งอัปเดต" ไม่ต้องเป๊ะระดับวินาที
// ฟีดแบ็ก "อยากเห็นแพทเทิร์น 'วันนี้: X / 🟢 เหมาะสำหรับฝึก / เหตุผล / CTA' — ตอนนี้มีแค่ % + ประโยคแนะนำ
// ยาวๆ ต้องอ่านเองว่าควรฝึกไหม" — ไม่คิดเกณฑ์ใหม่ ใช้รอยต่อ tier เดียวกับ recoveryTier() เป๊ะ (Excellent/
// Good = พร้อม, Recovering = เบาลง, Rest = พัก) แค่แปลงเป็น verdict สั้นๆ 1 บรรทัดแยกจาก adviceTh
// (ซึ่งยังอยู่ต่อเป็นเหตุผลบรรทัดถัดไป ไม่ได้ตัดออก)
// ฟีดแบ็ก (ตรวจสัญลักษณ์สีทั้งแอป) — emoji ใช้ recoveryVerdictEmoji() ตัวกลางแทน inline ternary เดิม
// (เจอ logic เดียวกันเป๊ะเขียนซ้ำอิสระ 3 จุดทั่วแอป — DashboardView.tsx/coach/page.tsx/ที่นี่ — รวมเป็น
// ฟังก์ชันเดียวใน lib/dashboardStats.ts กันกลับมาขัดกันเองแบบเดียวกับบั๊ก Recovery label ที่เคยเจอ)
function readinessVerdict(pct: number): { emoji: string; text: string } {
  const tier = recoveryTier(pct).labelEn
  const emoji = recoveryVerdictEmoji(pct)
  if (tier === 'Excellent' || tier === 'Good') return { emoji, text: 'เหมาะสำหรับฝึกวันนี้' }
  if (tier === 'Recovering') return { emoji, text: 'ฝึกได้ แต่ควรลดความหนักลง' }
  return { emoji, text: 'ควรพักหรือฝึกเบามากๆ' }
}

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
  lastUpdatedAt,
  isRecommendationForToday = false,
  todayWorkoutTitle = null,
  nextScheduledMuscleGroup = null,
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

  // ฟีดแบ็ก (design review — "Recommendation Consistency") "displayMg เดิมตอบ 2 คำถามปนกัน: ระบบแนะนำ
  // กล้ามเนื้ออะไร vs กดปุ่มนี้แล้วจะ insert ท่าของกล้ามเนื้อไหนจริง — เคยเอา dominant muscle ของเทมเพลตไป
  // ทับ headline/recovery% ของคำแนะนำเอง ทำให้ Coach กับ Insight (ซึ่งอ่าน TodaysRecommendation ตรงๆ)
  // พูดคนละกล้ามเนื้อกันได้ ร้ายกว่านั้นคือปุ่ม 'เริ่ม X' เคยใช้ชื่อเดียวกับ headline ทั้งที่ exercises ที่
  // insert จริงมาจากเทมเพลต ไม่ใช่กล้ามเนื้อที่ headline บอก (correctness bug จริง ไม่ใช่แค่ UX — ข้อความ
  // สำเร็จเคยอธิบายผิดว่าบันทึกอะไรลง log)" — resolveRecommendationDisplay() (lib/recommendationDisplay.ts)
  // แยก 2 คำตอบออกจากกันเป็น field คนละตัวชัดเจน: muscleGroup/recoveryPct/... (Recommendation Identity —
  // คัดลอกจาก TodaysRecommendation ตรงๆ ไม่คำนวณซ้ำ ใช้กับ headline/recovery bar/reason — Insight ก็อ่าน
  // จากค่าเดียวกันนี้ผ่าน TodaysRecommendation ตรงๆ เช่นกัน การันตีว่า Coach กับ Insight พูดกล้ามเนื้อ
  // เดียวกันเสมอ) กับ template/exercises/actionLabel (Action Identity — ตอบ "กดปุ่มนี้แล้วจะเกิดอะไรขึ้น
  // จริง" ใช้กับปุ่ม/ข้อความสำเร็จ/handleStart เท่านั้น อาจเป็นกล้ามเนื้อคนละกลุ่มกับ muscleGroup ได้ถ้าไม่มี
  // เทมเพลตไหนโฟกัสกลุ่มนั้นเป๊ะๆ — legitimate ถ้า UI สื่อสารตรงไปตรงมาว่ากำลังจะเริ่มอะไร ไม่ใช่บั๊ก)
  const templates = templateData?.templates ?? []
  const exercisesByTemplate = templateData?.exercisesByTemplate ?? {}
  const resolved = resolveRecommendationDisplay(muscleRecommendation, templates, exercisesByTemplate)
  const mg = resolved.muscleGroup as MuscleGroup | null
  const chosen = resolved.template
  const chosenExercises = resolved.exercises

  const focus = mg ? describeMuscleFocus(mg) : null
  const region = focus?.region ?? null
  const relatedGroups = focus?.relatedGroups ?? []
  // ฟีดแบ็ก "Training This Week บอกจันทร์-Lower Body แต่ Coach แนะนำอก+ไหล่+แขน พร้อมปุ่มเริ่มพฤหัส-
  // Core/Abs — คนละวันคนละกล้ามเนื้อกันเลย" — isRecommendationForToday=true รับประกันอยู่แล้วว่า mg ตรงกับ
  // ตารางวันนี้เป๊ะ (ดู comment ที่ isRecommendationForToday ใน DashboardView.tsx) จึงเช็คเฉพาะกรณี "Next
  // session" (isRecommendationForToday=false) ที่ไม่มีการันตีแบบนั้น — mismatch ก็ต่อเมื่อมีข้อมูลทั้งสอง
  // ฝั่งจริง (ไม่ใช่แค่หาไม่เจอฝั่งใดฝั่งหนึ่ง) และต่างกันจริง ไม่ใช่แค่ไม่แน่ใจ
  const nextRecommendationMismatch =
    !isRecommendationForToday && !!mg && !!nextScheduledMuscleGroup && mg !== nextScheduledMuscleGroup
  // ใช้ชื่อโปรแกรมจริงของวันนี้แทนตาราง generic ด้านบน เมื่อมีชื่อโปรแกรมจริงและเป็นคำแนะนำของวันนี้
  // จริง (ไม่ใช่ Next session ของวันอื่นที่ todayWorkoutTitle ไม่ได้อธิบายอยู่แล้ว) — ดู comment ที่
  // todayWorkoutTitle prop ด้านบน
  const specificDetail =
    isRecommendationForToday && todayWorkoutTitle ? splitTitleDetail(todayWorkoutTitle).detail : null
  const relatedGroupsText = specificDetail ?? formatRelatedGroups(relatedGroups)
  // startLabel ตอนนี้คือ Action Identity (resolved.actionLabel: ชื่อเทมเพลตจริง > กล้ามเนื้อหลักของท่าที่
  // จะ insert > muscleGroup ของคำแนะนำเป็นทางเลือกสุดท้าย) ไม่ใช่กล้ามเนื้อที่ headline บอกอีกต่อไป — ปุ่ม
  // "เริ่ม X" กับข้อความสำเร็จ "บันทึก X เข้า Log" ต้องอธิบายสิ่งที่ handleStart() insert จริง ไม่ใช่สิ่งที่
  // ระบบ "แนะนำ" (สองอย่างนี้ต่างกันได้ตามที่อธิบายไว้ข้างบน)
  const startLabel = resolved.actionLabel
  // recoveryPct มาจาก TodaysRecommendation ตรงๆ (Recommendation Identity) ไม่คำนวณ computeRecoveryPct
  // ซ้ำใน component นี้อีกแล้ว — ตัวเลขเดียวกับที่ Insight ใช้เป๊ะ ไม่มีโอกาสเพี้ยนจาก recoveryDates ที่อาจ
  // ไม่ sync กับตอนที่ recommendation engine คำนวณ pct ไว้
  const displayPct = resolved.recoveryPct ?? 0

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
      setErrorMessage(`เกิดข้อผิดพลาด: ${getErrorMessage(err)}`)
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
      {/* v51: gap ระหว่าง Robot กับข้อมูลด้านขวา 12px -> 10px ตามฟีดแบ็ก "ลดช่องว่างระหว่าง Robot กับ
          ข้อมูลด้านขวา" — เล็กน้อยพอไม่ให้ดูอึดอัด แต่ช่วยเก็บพื้นที่แนวนอนกลับมาให้คอลัมน์ข้อความ
          v52: ลดอีกขั้น 10px -> 8px ตามรอบต่อมา */}
      <Link href={href} className="flex items-center gap-2 active:opacity-80 transition">
        {/* v56: ฟีดแบ็ก "P4 — Robot ยังหนักกว่าข้อความข้างๆ อีก 5-8% (ไม่เปลี่ยน Layout)" — ลดต่อจาก
            112/96 (v54) อีก ~7% (112->104, 96->89) สัดส่วน isRestDay ต่อวันฝึกปกติเดิมยังคงไว้ (~0.857)
            ไม่แตะ layout/gap รอบๆ (flex items-center gap-2 เดิม ปรับตัวตาม avatar อัตโนมัติอยู่แล้ว) */}
        <AiRingAvatar size={isRestDay ? 89 : 104} />
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
          {/* ฟีดแบ็ก "AI Coach ยังดูเหมือนโฆษณา — ลด Visual Dominance เปลี่ยนเป็น MINT COACH" — เปลี่ยน
              label เฉยๆ (avatar ตอนนั้นยังเป็น Robot photo — ตอนนี้เปลี่ยนเป็น abstract gem แล้ว ดู
              AiRingAvatar ด้านล่างของไฟล์) */}
          {/* ฟีดแบ็ก "ป้าย MINT COACH กับ timestamp ทับกัน" — เดิม timestamp เป็น absolute top-3 right-3
              ลอยอยู่บนสุดของการ์ดทั้งใบ แยกขาดจาก layout ของป้ายชื่อข้างล่างนี้ (อยู่ในคอลัมน์ข้อความหลัง
              avatar) ทำให้ทับกันได้เมื่อคอลัมน์ข้อความแคบ (การ์ดแคบ/avatar ใหญ่) — ย้าย timestamp มาอยู่ใน
              flex row เดียวกับป้ายชื่อแทน (justify-between + shrink-0) ให้ทั้งคู่แบ่งพื้นที่กันจริง ไม่ทับ */}
          {/* ฟีดแบ็ก "AI Coach ควรมี Typography Hierarchy ชัดที่สุด — MINT COACH · TODAY ควรเป็น
              11px/uppercase/muted" — เดิม 10px/8px (ป้ายชื่อ/timestamp) เล็กกว่าที่ขอ ขยับขึ้นตามสเปค */}
          {/* ฟีดแบ็ก (design review, crop screenshot จริง) "หัวป้ายเหลือแค่ 'M' ไม่ใช่ 'MINT Coach' —
              truncation จริง ไม่ใช่ screenshot บีบอัด" — ตรวจแล้วพบสาเหตุจริง: แถวนี้เป็น justify-between,
              ฝั่งป้าย MINT Coach เดิมมี min-w-0+truncate (ยอมหดได้) ส่วนฝั่ง timestamp มี shrink-0 (ห้ามหด
              เด็ดขาด) — พอพื้นที่แคบ (การ์ดคอลัมน์ col-span-3) การหดทั้งหมดเลยตกไปที่ฝั่งป้ายแบรนด์ล้วนๆ จนเหลือ
              แค่ "M" — รอบแรกลองสลับ priority (MINT Coach shrink-0, timestamp min-w-0+truncate) แต่ crop
              screenshot ยืนยันว่า timestamp หดจนเหลือ 0 (แค่จุดสีมอสลอย ไม่มีตัวอักษร "อัปเดต..." เหลือเลย) —
              ขัดกับที่ขอไว้ชัดเจนว่า "อย่าเอา 'อัปเดต...' ออก" ปัญหาจริงคือ single-row justify-between
              คำนวณไม่ลงตัวเลยไม่ว่าจะสลับ priority ยังไง (พื้นที่รวมไม่พอทั้งคู่จริงๆ ไม่ใช่แค่ลำดับความสำคัญผิด)
              — เปลี่ยนเป็น flex-wrap แทน: กว้างพอ (การ์ดกว้าง/จอใหญ่) สองฝั่งยังอยู่บรรทัดเดียวกันเหมือนเดิม
              ทุกประการ แคบไม่พอ timestamp ตกไปบรรทัดใหม่แทนที่จะถูกบีบจนหาย — ทั้งคู่เห็นเต็มเสมอ ไม่มีฝั่งไหน
              ถูกตัดคำเลย (ตัด min-w-0/truncate ออกทั้งคู่ ไม่จำเป็นอีกต่อไปเมื่อใช้ wrap แทน) */}
          {/* ฟีดแบ็ก (design review) "'· Next' ลอยๆ ไม่ชัดว่าเป็น badge ตกแต่งหรือมีความหมาย — ถ้าตั้งใจสื่อ
              'Next Session' ควรใช้คำที่ชัดกว่านี้" — ตรวจ comment ประวัติ (v61/v69 ด้านบน) ยืนยันว่ามีความหมาย
              จริง ไม่ใช่ metadata ตกแต่ง: สลับตาม isRecommendationForToday บอกว่าคำแนะนำนี้เป็นของ "วันนี้ที่
              ยังไม่เริ่ม" (Today) หรือ "เซสชันถัดไป" (เดิม Next เฉยๆ) — เปลี่ยนเป็น "Next Session" ให้อ่านชัด
              ว่าหมายถึงอะไรโดยไม่ต้องเดา (Today ไม่แตะ อ่านชัดอยู่แล้วในบริบท) */}
          <div className="flex items-center justify-between gap-x-2 gap-y-0.5 flex-wrap">
            <p className="font-display text-[12px] tracked uppercase flex items-center gap-1 shrink-0" style={{ color: TEXT.body }}>
              <span aria-hidden="true" className="shrink-0">✨</span>
              <span className="whitespace-nowrap">MINT Coach · {isRecommendationForToday && !isRestDay ? 'Today' : 'Next Session'}</span>
            </p>
            <span className="flex items-center gap-1 text-[12px] tracked uppercase shrink-0" style={{ color: TEXT.body }} aria-hidden="true">
              <span className="w-1 h-1 rounded-full shrink-0" style={{ background: COLORS.moss }} />
              <span className="whitespace-nowrap">{lastUpdatedAt ? `อัปเดต ${relativeUpdatedLabel(lastUpdatedAt)}` : 'อัปเดตล่าสุด'}</span>
            </span>
          </div>
          {muscleRecommendation ? (
            <>
              {/* v25: ฟีดแบ็ก "④ ลดความแน่นของ AI Coach — ตัดข้อความรองบางส่วน" — ตัด "วันนี้เหมาะกับ"
                  ออก (บรรทัดนำเฉยๆ ไม่มีข้อมูลใหม่ — ป้าย "AI Coach" ด้านบน + ตัว region เองบอกความหมาย
                  ได้ครบอยู่แล้ว) และตัดบรรทัด readinessLabelEn (EXCELLENT ฯลฯ) ด้านล่าง Recovery bar ออก
                  ด้วย (ซ้ำความหมายกับตัวเลข % ที่อยู่ติดกันอยู่แล้ว สีเดียวกันด้วย) เหลือแค่ region +
                  relatedGroups + Recovery bar/% ตามที่ขอ */}
              {/* ฟีดแบ็ก "'LOWER BODY' ตัวใหญ่สีส้มมาก ดึงสายตาไปทันที แย่งความสนใจจาก Dashboard" — เดิม
                  text-amber (สีเน้น Action/Energy) + 21px — ตัวเดียวในการ์ดนี้ที่ใช้สีส้มกับข้อความหลัก
                  ทั้งที่การ์ดนี้ไม่ใช่ปุ่ม action เปลี่ยนเป็น text-ink (ขาว/ไทเทเนียม เหมือนป้ายชื่อการ์ดอื่น
                  ที่ไม่ใช่ CTA) + ลดขนาดลง ~15% (21 -> 18) ให้สีส้มเหลือแค่ตรง CTA ปุ่มจริงด้านล่างเท่านั้น */}
              {/* ฟีดแบ็ก "UPPER BODY ควรเป็น 18-20px/700/white" — เดิม font-semibold (600) ขยับเป็น
                  font-bold (700) ตามสเปค ขนาด/สี (text-ink, ไม่ใช่ #FFFFFF ล้วน) คงเดิมตามที่ขอ */}
              <p className="font-display font-bold tracked uppercase text-ink truncate mt-1" style={{ fontSize: 18, lineHeight: 1.15 }}>
                {isRestDay ? 'Recovery Day' : region}
              </p>
              {/* ฟีดแบ็ก "อยากลดข้อความลงประมาณ 20-30% — Coach ควรพูดสั้นๆ เหมือนคนพูด ไม่ใช่ย่อหน้ายาว" —
                  เดิม subtitle ("Today • Lower • Hamstring") กับ verdict ("🟢 เหมาะสำหรับฝึกวันนี้") เป็น
                  2 บรรทัดแยกที่พูดคนละมุมของเรื่องเดียวกัน (ควรฝึกไหม + ฝึกกลุ่มไหน) — รวมเป็นบรรทัดเดียว
                  ไม่ตัดข้อมูลอะไรออก (v61: "Next session • " นำหน้า relatedGroups, v69: สลับคำนำหน้าตรง
                  กับป้าย "· Today"/"· Next" ด้านบน — ทั้งสองเหตุผลยังใช้ได้เหมือนเดิม แค่รวมบรรทัด) Rest
                  Day ไม่มี verdict ให้รวมด้วยอยู่แล้ว (ข้อความอธิบายวันพักของตัวเองยังแยกบรรทัดเดิม) */}
              {isRestDay ? (
                <p className="truncate mt-0.5" style={{ fontSize: 11, color: TEXT.body }}>
                  วันนี้เหมาะกับการพักและฟื้นตัว
                </p>
              ) : (
                <p className="truncate mt-1 font-medium" style={{ fontSize: 11, color: recoveryTier(displayPct).color }}>
                  {readinessVerdict(displayPct).emoji} {readinessVerdict(displayPct).text} ·{' '}
                  {isRecommendationForToday ? 'Today' : 'Next session'} • {relatedGroupsText}
                </p>
              )}

              {/* ฟีดแบ็ก (design review — "MINT Coach ยังมีข้อมูล Recovery ซ้ำอยู่ภายในตัวเอง") "Recovery
                  card ด้านบนบอกสถานะแล้ว (29% Rest + รายชื่อกล้ามเนื้อ) MINT Coach ควรตอบแค่ 'วันนี้ควรทำ
                  อะไร' ไม่ใช่ตอบซ้ำว่า 'ทำไมถึงควรทำแบบนั้น'" — ตัด "Muscle Recovery {pct}%" bar (v58/v65)
                  และ bullet list ทั้งก้อน (adviceTh + เหลืออีก N เซ็ต + avoidCaution "X ยัง Recovery ต่ำ")
                  ออกทั้งหมด — verdict บรรทัดเดียวด้านบน (readinessVerdict) ยังคงบอก "ควรทำอะไร" ครบอยู่แล้ว
                  รายละเอียดเหตุผล/ตัวเลขละเอียดยกให้ Recovery card (สถานะรายกลุ่ม) และ /coach (รายละเอียดเต็ม)
                  แทน — barColor/worstOtherRecovery/avoidCaution ไม่มีจุดใช้อื่นเหลือแล้ว ลบทิ้งทั้งหมด (ดู
                  comment ที่จุดประกาศตัวแปรเดิม) recoveryDates prop ก็เลยไม่มีจุดใช้เหลือ ลบออกจาก interface/
                  จุดเรียกใช้ทั้งสองที่ด้วย (DashboardView.tsx/MobileDashboardView.tsx) แทนที่จะปล่อยเป็น
                  prop ที่ไม่มีใครอ่านค้างไว้ */}
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

      {errorMessage && <p className="text-[12px] text-rusttext">{errorMessage}</p>}

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
            <Button as={Link} href={href} variant="secondary" className="flex-1 min-w-0">
              ดู Recovery →
            </Button>
          ) : muscleRecommendation?.lowRecoveryCaution ? (
            // ฟีดแบ็ก (design review — "MINT Coach บอกควรพัก แต่ปุ่มก็ให้เริ่มเล่น ขัดกันเอง") "ผู้ใช้ตีความ
            // ได้ว่า 'ระบบบอกให้พัก แต่ปุ่มก็ให้เริ่มเล่น'" — readinessVerdict tier "Rest" (recovery <35% ของ
            // กล้ามเนื้อที่แนะนำเอง ดู lowRecoveryCaution ใน suggestMuscleToTrain, lib/dashboardStats.ts) กับ
            // ปุ่ม "เริ่ม X" เดิมไม่เคยเช็คเงื่อนไขนี้เลย (เช็คแค่ isRestDay/templatesLoading/มีเทมเพลตไหม) —
            // ใช้ pattern เดียวกับ isRestDay ด้านบน (secondary link ไปดูรายละเอียดแทน CTA เด่น) กัน headline
            // กับปุ่มขัดกันเอง — chosen/handleStart ยังคำนวณอยู่เบื้องหลังเหมือนเดิม เผื่อ recovery ขยับข้าม
            // เกณฑ์ระหว่างเซสชัน ไม่ได้ถูกเสนอเป็น action หลักแค่ตอนยังอยู่ tier "Rest" เท่านั้น
            //
            // ฟีดแบ็ก "หัวการ์ดบอก MINT Coach แต่ปุ่มเขียน 'ดูคำแนะนำ Recovery' ทำให้รู้สึกว่าปุ่มพาไปหน้า
            // Recovery มากกว่า Coach" — เปลี่ยนเป็น "ดูคำแนะนำเพิ่มเติม →" (สั้น ไม่ซ้ำคำว่า MINT Coach ที่
            // อยู่ในหัวการ์ดอยู่แล้ว) — href ยังพาไปหน้าเดิม (/coach) ไม่เปลี่ยน แค่คำที่ปุ่มพูด
            <Button as={Link} href={href} variant="secondary" className="flex-1 min-w-0">
              ดูคำแนะนำเพิ่มเติม →
            </Button>
          ) : nextRecommendationMismatch ? (
            // ฟีดแบ็ก (design review — "Training This Week บอกจันทร์-Lower Body แต่ Coach แนะนำอก+ไหล่+แขน
            // พร้อมปุ่มเริ่มพฤหัส-Core/Abs — คนละวันคนละกล้ามเนื้อกันเลย ผู้ใช้จะสงสัยว่าอะไรคือ Next Session
            // จริง") — ตั้งใจคง 2 โดเมนแยกกันตามเดิม (Schedule ตาราง vs Recommendation จากร่างกาย/volume —
            // ดู "Recommendation Consistency" ใน lib/dashboardStats.test.ts ยืนยันว่าทั้งคู่ถูกพร้อมกันได้)
            // ไม่แตะ suggestMuscleToTrain/getNextScheduledMuscle/findNextProgramDay เลย — แก้เฉพาะปุ่มเดียว:
            // ไม่เสนอปุ่ม "เริ่ม X" (จาก workout_templates ซึ่งเป็นคนละระบบกับ program_days อีกชั้น) ให้กด
            // เริ่มเซสชันที่ดูเหมือนเป็น "Next Session" แต่จริงๆ ไม่ตรงกับ "Next →" ของการ์ด Training This
            // Week เลย — สลับไปดูรายละเอียดที่ /coach แทน (เหมือน pattern isRestDay/lowRecoveryCaution ด้านบน)
            <Button as={Link} href={href} variant="secondary" className="flex-1 min-w-0">
              ดูคำแนะนำเพิ่มเติม →
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
            // ฟีดแบ็ก "ปุ่มส้มเรืองแสงหลายจุด — ควรมี Primary CTA เดียวในหน้า ที่เหลือเป็น Secondary" —
            // Today's Workout hero (DashboardView.tsx) เป็น glow-CTA หลักของหน้าอยู่แล้ว ปุ่มนี้ (การ์ด
            // MINT Coach ซึ่งตั้งใจให้เป็น "Assistant Layer" ไม่แข่งกับ Dashboard ตามฟีดแบ็กรอบก่อนๆ)
            // เปลี่ยนเป็น variant="secondary" (กรอบอำพัน ไม่มี glow) แทน
            <Button type="button" onClick={handleStart} disabled={starting} variant="secondary" className="flex-1 min-w-0">
              <span className="truncate">{starting ? '...' : `เริ่ม ${startLabel}`}</span>
              {!starting && <span aria-hidden="true">→</span>}
            </Button>
          ) : templates.length > 0 ? (
            // ฟีดแบ็ก "CORE กับ DAY 5 — LOWER" — กรณีมีเทมเพลตอยู่แล้วแต่ไม่มีตัวไหนมีท่าตรงกับ mg เลย
            // (bestTemplateFor คืน undefined) เดิมจะหลุดไปโชว์ "สร้างโปรแกรมแรก" ซึ่งผิด (มีเทมเพลตอยู่แล้ว)
            // และก่อนหน้านั้นยิ่งแย่กว่าคือแอบใช้เทมเพลตที่ไม่เกี่ยวข้องแทน — แยกเป็นข้อความที่ตรงความจริง
            <Button as={Link} href="/templates" variant="secondary" className="flex-1 min-w-0">
              ดูเทมเพลตทั้งหมด →
            </Button>
          ) : (
            <Button as={Link} href="/templates" variant="secondary" className="flex-1 min-w-0">
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
// ฟีดแบ็ก "AI Coach ด้านขวา 'Gaming' ไปนิด — Robot/Helmet + Glow ไปทาง Gaming/Cyberpunk มากกว่า Premium
// Fitness ถ้าต้องการ Minimal Luxury จริงๆ ควรลดความ Sci-Fi ลง ใช้ภาพ/Avatar เล็กๆ หรือ abstract metallic
// object แทน Robot ที่เด่นมาก" — ผู้ใช้ยืนยันชัดเจนให้เอารูป Robot จริงออก (ai-coach-avatar.png, เคย
// confirm ไว้หลายรอบก่อนหน้าว่าเป็น "Brand Identity ห้ามเอาออก" — รอบนี้กลับคำยืนยันหลังเห็น Dashboard
// เต็มหน้าจริง) แทนที่ด้วยไอคอนเรขาคณิตนามธรรม (faceted gem — 4 เหลี่ยมมุมตัดไล่เฉดไทเทเนียม + เหลี่ยม
// เดียวย้อมอำพันเป็นจุดเน้นแบรนด์) เล็กกว่ารูปเดิมมาก (56% ของกรอบ vs รูปเดิมที่ scale 1.85 เกือบเต็มเฟรม
// แบบภาพสินค้า) กรอบไทเทเนียม+มุมตัด CNC รอบนอกเดิมไม่แตะ (ยังเข้าธีมเดียวกับการ์ดอื่นทั่วแอป)
function AiRingAvatar({ size = 112 }: { size?: number }) {
  const gradId = useId()
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
        <svg viewBox="0 0 100 100" style={{ width: '56%', height: '56%' }}>
          <defs>
            <linearGradient id={`${gradId}-light`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#EEF0F2" />
              <stop offset="100%" stopColor="#9BA0A8" />
            </linearGradient>
            <linearGradient id={`${gradId}-mid`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7A7F87" />
              <stop offset="100%" stopColor="#4A4E56" />
            </linearGradient>
            <linearGradient id={`${gradId}-dark`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3E4148" />
              <stop offset="100%" stopColor="#25272C" />
            </linearGradient>
            <linearGradient id={`${gradId}-accent`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={COLORS.amber} />
              <stop offset="100%" stopColor="#B97A28" />
            </linearGradient>
          </defs>
          {/* faceted gem — มงกุฎ 2 เหลี่ยมด้านบน (ซ้ายไทเทเนียมสว่าง รับแสง / ขวาย้อมอำพัน จุดเน้นแบรนด์)
              + pavilion 2 เหลี่ยมด้านล่าง (กลาง/เข้ม ให้มิติความลึก) */}
          <polygon points="50,8 15,36 50,36" fill={`url(#${gradId}-light)`} />
          <polygon points="50,8 85,36 50,36" fill={`url(#${gradId}-accent)`} />
          <polygon points="15,36 50,36 50,92" fill={`url(#${gradId}-mid)`} />
          <polygon points="50,36 85,36 50,92" fill={`url(#${gradId}-dark)`} />
          <polygon
            points="50,8 15,36 85,36"
            fill="none"
            stroke="rgba(255,255,255,.35)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <polygon
            points="15,36 85,36 50,92"
            fill="none"
            stroke="rgba(255,255,255,.18)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  )
}
