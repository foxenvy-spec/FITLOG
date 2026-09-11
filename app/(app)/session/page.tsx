'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import type { ProgramDay, ProgramExercise, Workout } from '@/lib/types'
import { todayDayOfWeek, todayStr, WEEKDAYS } from '@/lib/weekdays'
import { setActiveMakeupDayId, clearActiveMakeupDayId, getActiveMakeupDayId } from '@/lib/activeMakeupSession'
import { MUSCLE_GROUP_COLORS, RECOVERY_MUSCLES, type MuscleGroup } from '@/lib/muscle-groups'
import { useExerciseLibrary } from '@/lib/useExerciseLibrary'
import { findExerciseByName } from '@/lib/exercises'
import { getErrorMessage } from '@/lib/errors'
import {
  COLORS,
  NEUTRAL,
  withAlpha,
  CARD_BORDER_CSS,
  CARD_AMBIENT_SHADOW_CSS,
  CARD_FLOAT_SHADOW,
  CNC_CORNER_CLIP_PATH_DEFAULT,
} from '@/lib/theme'
import PremiumCard from '@/components/ui/PremiumCard'
import Button from '@/components/ui/Button'
import ProgressRing from '@/components/ui/ProgressRing'
import { useQueryClient } from '@tanstack/react-query'
import {
  parseRestSeconds,
  initSessionSet,
  initSessionStates,
  firstUnfinishedIndex,
  nextUnvisitedIndex,
  computeSessionSummary,
  aggregateMuscleLoads,
  getSkippedExercises,
  findExtraLoggedExercises,
  makeAdhocExercise,
  isAdhocExercise,
  computeSessionAvgRpe,
  computeWorkoutScore,
  type SessionSetState,
  type LoggedWorkoutRow,
  type LoggedSetRow,
  type LastPerformance,
  type SkippedExercise,
} from '@/lib/workoutSession'
import ExercisePicker from '@/components/ExercisePicker'
import type { ExerciseDef } from '@/lib/exerciseLibrary'
import {
  estimateCaloriesToday,
  getWeekRange,
  getPreviousWeekRange,
  computeBestVolumeIncrease,
  computeRecoveryPct,
  recoveryTier,
  findMissedProgramDays,
  type VolumeIncrease,
} from '@/lib/dashboardStats'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { dropSetWeightKg } from '@/lib/weightUnit'
import { suggestNextLoad } from '@/lib/progressiveOverload'
import { calculatePlates, BAR_WEIGHT } from '@/lib/plateCalculator'
import { useToast } from '@/components/Toast'
import WeightUnitToggle from '@/components/WeightUnitToggle'
import { computeSessionMuscleRecovery, tierForPct, type MuscleRecoveryScore } from '@/lib/recoveryScore'
import { useStopwatch, formatClock } from '@/lib/useStopwatch'
import { beepFinish, beepTick } from '@/lib/beep'
import { useWakeLock } from '@/lib/useWakeLock'
import { useVoiceEnabled } from '@/lib/useVoiceEnabled'
import { speak } from '@/lib/speech'
import { NumberStepper } from '@/components/timers/TimerShell'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'
import { splitTitleDetail } from '@/components/TodaysFocusCard'

type Phase = 'loading' | 'error' | 'empty' | 'makeupCheckpoint' | 'smartStart' | 'active' | 'done'

// ตั้งแต่ persistSets เขียนลง DB ทันทีทีละเซ็ต (ไม่รอจนกดจบท่า) แถว workouts ของท่านึงอาจมีอยู่แล้ว
// ทั้งที่ผู้ใช้ยังไม่ได้กด "บันทึก & ท่าถัดไป" จริงๆ — initSessionStates (lib/workoutSession.ts) เดา
// logged=true แค่จากการมีแถว workouts อยู่ ซึ่งใช้ไม่ได้แล้ว เก็บ id ท่าที่ "กดจบท่าจริง" แยกไว้ใน
// localStorage ต่างหาก เพื่อตัดสิน logged ให้ถูกต้องตอนโหลดหน้าใหม่ (เช่น สลับไปหน้าอื่นแล้วกลับมา)
function finishedExerciseIdsKey(): string {
  return `fitlog:session-finished:${todayStr()}`
}

function readFinishedExerciseIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(finishedExerciseIdsKey())
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function markExerciseFinished(id: string) {
  if (typeof window === 'undefined') return
  const ids = readFinishedExerciseIds()
  ids.add(id)
  window.localStorage.setItem(finishedExerciseIdsKey(), JSON.stringify(Array.from(ids)))
}

// เวลาที่กด "เซ็ตนี้เสร็จแล้ว" ล่าสุดของแต่ละท่า (สำหรับนับพักอัตโนมัติต่อ) — เก็บใน localStorage
// ด้วยเหตุผลเดียวกับด้านบน: RestTimerButton มี useStopwatch ของตัวเองซึ่งอยู่ในหน่วยความจำล้วนๆ
// รีเซ็ตเป็น 0 ทุกครั้งที่ remount ทำให้นาฬิกาพักหายไปเฉยๆ ถ้าสลับหน้าไปมาระหว่างพัก
function restStartedAtKey(exerciseId: string): string {
  return `fitlog:rest-started-at:${todayStr()}:${exerciseId}`
}

function readRestStartedAt(exerciseId: string): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(restStartedAtKey(exerciseId))
  return raw ? Number(raw) : null
}

function writeRestStartedAt(exerciseId: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(restStartedAtKey(exerciseId), String(Date.now()))
}


interface PRHit {
  exerciseName: string
  weightKg: number
  deltaKg: number
}

interface SummaryExtras {
  calories: number
  prs: PRHit[]
  recovery: { overall: number | null; byMuscle: MuscleRecoveryScore[] }
  // Priority 5 — เดิม "หน้า Complete" ไม่มีคะแนนสรุปเซสชันหรือบรรทัด insight เทียบกับสัปดาห์ที่แล้วเลย
  workoutScore: number
  volumeIncrease: VolumeIncrease | null
}

export default function SessionPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { unit, toDisplay, toKg, format } = useWeightUnit()
  const { showToast } = useToast()
  const { data: exerciseLibrary = [] } = useExerciseLibrary()

  const [phase, setPhase] = useState<Phase>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [day, setDay] = useState<ProgramDay | null>(null)
  // true เมื่อเข้ามาทำแผนของวันอื่น (ผ่าน ?day=<id> จาก /program) แทนวันจริงตามปฏิทินวันนี้ — "เซสชันชดเชย"
  const [isMakeupSession, setIsMakeupSession] = useState(false)
  // ฟีดแบ็ก (live-test, product decision) "กด START WORKOUT (BottomNav) หลังจากทำเซสชันชดเชยจบไปแล้ว
  // (Day 1) แต่แผนวันนี้ (Day 2) ยังไม่เริ่มเลย — ถูกพาเข้าเล่นท่าแรกของ Day 2 ทันทีแบบเงียบๆ ทำให้รู้สึกว่า
  // 'เพิ่งฝึกเสร็จ ทำไมแอปพาเริ่มอีก workout?'" — ตัดสินใจ semantic ใหม่ของปุ่ม START WORKOUT: ปุ่มนี้แปลว่า
  // "เข้าสู่ workout flow ของวันนี้" ไม่ใช่ "ต้องเริ่มฝึกทันที" — /session เป็นคนตัดสินใจเองว่าจะเข้า active
  // ตรงๆ หรือหยุดถาม (ดู phase 'makeupCheckpoint' ด้านล่าง) ไม่แตะ BottomNav/label "START WORKOUT" เลย
  // เก็บ "แผนอื่นที่ฝึกไปแล้ว" ไว้แสดงในหน้า checkpoint (ชื่อวัน) แยกจาก `day` (ซึ่งคือ Day 2 — แผนที่กำลัง
  // จะเริ่ม ไม่ใช่แผนที่ฝึกไปแล้ว)
  const [makeupCheckpointOtherDay, setMakeupCheckpointOtherDay] = useState<ProgramDay | null>(null)
  // ฟีดแบ็ก (product decision — "Smart Start") ดู comment เต็มที่จุดตรวจใน load() — เก็บแผนที่พลาดตัวแรก
  // (findMissedProgramDays คืนมาหลายตัวได้ถ้าพลาดหลายวัน เอาแค่ตัวแรก/ใกล้วันนี้ที่สุดมาเสนอ ไม่ยัดทุกตัว
  // มาให้เลือกในหน้านี้ — เหมือน MobileDashboardView.tsx's missedDays[0])
  const [smartStartMissedDay, setSmartStartMissedDay] = useState<ProgramDay | null>(null)
  const [exercises, setExercises] = useState<ProgramExercise[]>([])
  const [states, setStates] = useState<Record<string, SessionSetState>>({})
  const [index, setIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loggingSet, setLoggingSet] = useState(false)
  const [summaryExtras, setSummaryExtras] = useState<SummaryExtras | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  // ฟีดแบ็ก (design review) "หน้า Session Complete โชว์ '00:00 เวลาที่ใช้' กับ '0 kcal' ทั้งที่ทำครบ 8/8
  // ท่า 27 เซ็ตจริง — bug หรือแค่ไม่มีข้อมูล?" — ตรวจแล้วพบว่าไม่ใช่บั๊กการคำนวณ แต่เป็นเพราะ totalElapsedMs
  // มาจาก stopwatch ที่เริ่มนับเฉพาะตอน phase เข้าสถานะ 'active' เท่านั้น (ดู useEffect ด้านล่าง) — ถ้า
  // workout วันนี้ถูกบันทึกผ่านช่องทางอื่นที่ไม่ใช่ live session ในหน้านี้ (MINT Coach quick-start ที่
  // insert ตรงเข้า DB, /log, import) แล้ว allFinished เช็คแล้วข้ามตรงไปหน้า 'done' เลย (ไม่เคยผ่าน 'active'
  // เลยสักครั้ง) stopwatch จึงไม่เคยเริ่มนับจริงๆ เวลา/แคลอรี่ที่ประมาณจากเวลาจึงไม่มีข้อมูลจริงให้แสดง —
  // ธงนี้ true เฉพาะเคสนั้น ใช้โชว์ "—" แทน "00:00"/"0 kcal" ที่สื่อความหมายผิดว่า "ใช้เวลา 0 นาทีจริงๆ"
  const [noLiveDuration, setNoLiveDuration] = useState(false)
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  // ฟีดแบ็ก "บาร์บางที่หนักไม่เท่ากัน อยากปรับน้ำหนักบาร์ในหน้าเซสชันได้เลย" — ปรับได้ทันทีต่อเซสชัน ไม่
  // persist ข้ามเซสชัน/อุปกรณ์ (ต่างจากส่วนสูง/เพศในโปรไฟล์ที่เป็นค่าประจำตัว บาร์ที่ใช้จริงเปลี่ยนไปตามยิม
  // ได้) หน่วยเดียวกับ unit ที่กำลังแสดงอยู่ตอนนั้น — สลับหน่วย kg/lb ระหว่างเซสชันแล้วรีเซ็ตกลับค่ามาตรฐาน
  // เพราะเลขที่ตั้งไว้ในหน่วยเดิมไม่ใช่ค่าเดียวกันพอดีในอีกหน่วย (20kg ปัดเป็น 45lb พอดี แต่บาร์ custom เช่น
  // 15kg ไม่มีเลข lb ที่ตรงกันเป๊ะ) ไม่กระทบ weightKg ที่กรอกซึ่งยังหมายถึงน้ำหนักรวมเหมือนเดิม (1RM/Volume/
  // PR ไม่กระทบ) แค่เปลี่ยนตัวเลขที่ใช้ลบออกก่อนคำนวณแผ่น
  const [barWeightOverride, setBarWeightOverride] = useState<number | null>(null)
  const [editingBarWeight, setEditingBarWeight] = useState(false)
  useEffect(() => {
    setBarWeightOverride(null)
    setEditingBarWeight(false)
  }, [unit])
  // ผลงาน "ครั้งก่อน" ต่อชื่อท่า — เดิมเป็นแค่ตัวแปร local ใน load() ใช้ตั้งค่าเริ่มต้น reps/น้ำหนักเฉยๆ
  // แล้วทิ้ง ตอนนี้เก็บไว้ใน state ด้วยเพื่อใช้คำนวณคำแนะนำ Progressive Overload (ดู suggestNextLoad)
  // ในหน้าจอด้วย — addExercise/swapCurrentExercise อัปเดตเข้า map นี้เพิ่มตอนดึงท่าที่ไม่อยู่ในแผนด้วย
  const [lastPerformanceByName, setLastPerformanceByName] = useState<Record<string, LastPerformance>>({})

  // ฟีดแบ็ก "Live Coach — โชว์ Recovery ของกล้ามเนื้อที่กำลังเล่นอยู่ตอนนี้เลย" (mockup "Pro Workout
  // Experience") — เดิม recovery มีคำนวณอยู่แล้วจริง (computeSessionMuscleRecovery) แต่ถูก gate ไว้แค่
  // phase==='done' เท่านั้น (loadSummaryExtras) ไม่เคยโชว์ระหว่างเล่นจริงเลย — ดึง "วันที่ฝึกล่าสุดต่อ
  // กลุ่มกล้ามเนื้อ (ก่อนวันนี้)" มาเก็บไว้ตั้งแต่โหลดหน้า (query เดียวกับที่ loadSummaryExtras ใช้อยู่
  // แล้วสำหรับ recentMuscleRows) แล้วคำนวณ % ฟื้นตัวสดๆ ต่อท่าปัจจุบันด้วย computeRecoveryPct/recoveryTier
  // ตัวเดียวกับ Dashboard/AI Coach ทุกจุดในแอป (ไม่คิดสูตรใหม่แยก กันขัดกันเองแบบที่เคยเจอมาก่อน)
  const [priorLastTrainedDate, setPriorLastTrainedDate] = useState<Record<string, string | null>>({})

  // "เพิ่มท่า" เอง ระหว่างเซสชัน — ไว้สำหรับท่านอกแผนที่อยากแทรกเข้ามาเล่นเพิ่ม
  const [showAddExercise, setShowAddExercise] = useState(false)
  const [newExerciseName, setNewExerciseName] = useState('')
  const [newExerciseDef, setNewExerciseDef] = useState<ExerciseDef | null>(null)
  const [addExerciseError, setAddExerciseError] = useState<string | null>(null)

  // "เปลี่ยนท่า" ท่าปัจจุบัน — เผื่ออุปกรณ์ไม่ว่างกลางเซสชัน สลับเป็นท่าอื่นแทนตรงตำแหน่งเดิมได้เลย
  // ไม่ต้องข้ามทั้งท่าทิ้งแล้วไปเพิ่มท่าใหม่แยกต่างหากแบบเดิม (ดู swapCurrentExercise)
  const [showSwapExercise, setShowSwapExercise] = useState(false)
  const [swapName, setSwapName] = useState('')
  const [swapDef, setSwapDef] = useState<ExerciseDef | null>(null)
  const [swapError, setSwapError] = useState<string | null>(null)
  const [swapping, setSwapping] = useState(false)

  // นาฬิกาเซสชันรวม — เดินตั้งแต่เปิดหน้า ใช้บอกเวลาที่ใช้ไปในสรุปตอนจบ
  const session = useStopwatch()
  const sessionStartedRef = useRef(false)
  // ผลรวมเวลาที่ผ่านไปแล้ว "ก่อน" ที่ stopwatch รอบนี้จะเริ่มนับ (ms) — เก็บเป็น timestamp เริ่มเซสชัน
  // ไว้ใน localStorage กันเวลารีเซ็ตเป็น 0 ทุกครั้งที่ component unmount/remount (เช่นสลับไปหน้าอื่นแล้ว
  // กลับมาหน้านี้) เพราะ useStopwatch เองเป็น state ในหน่วยความจำล้วนๆ ไม่รอดจาก remount
  const sessionOffsetRef = useRef(0)
  const sessionStorageKey = `fitlog:session-started-at:${todayStr()}`

  // กันหน้าจอดับตลอดเซสชัน ไม่ต้องรอให้ rest timer ทำงานก่อน
  useWakeLock(phase === 'active')

  const load = useCallback(async () => {
    setPhase('loading')
    setErrorMsg(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setPhase('empty')
      return
    }

    const dow = todayDayOfWeek()
    // ฟีดแบ็ก "ป่วยวันจันทร์ หายป่วยวันพุธ อยากทำแผนจันทร์ชดเชย" — เดิม /session ล็อกกับ todayDayOfWeek()
    // เท่านั้น ไม่มีทางเริ่มแผนวันอื่นได้เลย — เพิ่ม query param ?day=<program_day_id> ให้เลือกแผนวันไหนก็ได้
    // มาทำ "ชดเชย" วันนี้แทน (entry point จริงอยู่ที่ /program ดูจุดที่ลิงก์มาที่นี่) อ่านจาก
    // window.location ตรงๆ แทน useSearchParams (หน้านี้เป็น client component ล้วนอยู่แล้ว ทุก query/state
    // รันหลัง mount เสมอ — เลี่ยง Suspense boundary requirement ของ useSearchParams ที่ไม่จำเป็นตรงนี้)
    const makeupDayId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('day') : null
    const { data: dayRow, error: dayErr } = await (makeupDayId
      ? supabase.from('program_days').select('*').eq('id', makeupDayId).maybeSingle()
      : supabase.from('program_days').select('*').eq('day_of_week', dow).maybeSingle())

    if (dayErr) {
      setErrorMsg(dayErr.message)
      setPhase('error')
      return
    }

    if (!dayRow) {
      setPhase('empty')
      return
    }

    // true เฉพาะตอนเลือกแผนของวันอื่น (ไม่ใช่วันจริงตามปฏิทินวันนี้) มาทำ — ใช้โชว์ banner "โหมดชดเชย"
    // กันสับสนกับแผนจริงของวันนี้ ไม่ใช่ธงที่ persist ลง DB (แค่ derive จาก day_of_week ที่โหลดมาเทียบ dow)
    const isMakeup = makeupDayId != null && (dayRow as ProgramDay).day_of_week !== dow
    setIsMakeupSession(isMakeup)
    // จำไว้ว่ากำลังทำเซสชันชดเชยของแผนไหนอยู่ (ดู lib/activeMakeupSession.ts) ให้ทุกจุดที่ลิงก์ไป
    // '/session' เฉยๆ ทั่วแอป (BottomNav, การ์ด Today's Workout ฯลฯ) อ่านไปสร้าง href กลับเข้าเซสชันเดิม
    // ได้ถูกต้องแม้สลับหน้าไปมา — เซสชันปกติ (ไม่มี makeupDayId) เคลียร์ค่าทิ้ง เผื่อมี pointer ค้างจาก
    // เซสชันชดเชยก่อนหน้าที่ยังไม่จบ
    if (isMakeup) setActiveMakeupDayId(makeupDayId as string)
    else clearActiveMakeupDayId()

    const { data: exRows, error: exErr } = await supabase
      .from('program_exercises')
      .select('*')
      .eq('program_day_id', (dayRow as ProgramDay).id)
      .order('position')

    if (exErr) {
      setErrorMsg(exErr.message)
      setPhase('error')
      return
    }

    const typedExercises = (exRows as ProgramExercise[]) ?? []
    if (typedExercises.length === 0) {
      setPhase('empty')
      return
    }

    // สำหรับ Live Coach ระหว่างเล่น (ดู comment ที่ priorLastTrainedDate state ด้านบน) — query เดียวกับ
    // recentMuscleRows ใน loadSummaryExtras() เป๊ะ แค่ดึงตั้งแต่ตอนโหลดหน้าแทนที่จะรอถึง phase==='done'
    // บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจครอบใหม่): query นี้ขาด .eq('user_id', user.id) เหมือนกับที่เคยแก้ใน
    // recentMuscleRows ตัวใน loadSummaryExtras() ด้านล่าง (บรรทัด ~823) — เป็น query คนละจุดแต่ทำหน้าที่
    // เดียวกัน ตอนแก้ครั้งก่อนแก้ไม่ครบ พลาดจุดนี้ไป — ถ้ากลุ่มกล้ามเนื้อเดียวกันมีคนอื่นเพิ่งฝึกไปเมื่อไม่นาน
    // priorTrained อาจไปดึงวันที่ของคนอื่นมาคำนวณ % ฟื้นตัวสดๆ ระหว่างเล่นผิดพลาดได้
    const { data: recentMuscleRows } = await supabase
      .from('workouts')
      .select('muscle_group, performed_at')
      .eq('user_id', user.id)
      .eq('type', 'strength')
      .lt('performed_at', todayStr())
      .order('performed_at', { ascending: false })
      .limit(500)
    const priorTrained: Record<string, string | null> = {}
    const muscleRows = (recentMuscleRows as { muscle_group: string | null; performed_at: string }[]) ?? []
    RECOVERY_MUSCLES.forEach((mgKey) => {
      priorTrained[mgKey] = muscleRows.find((r) => r.muscle_group === mgKey)?.performed_at ?? null
    })
    setPriorLastTrainedDate(priorTrained)

    // ดึงท่าที่บันทึกไปแล้ว "วันนี้" กลับมาทั้งหมด (เผื่อกดออกจากหน้านี้/รีเฟรชระหว่างเล่น) — ไม่กรองแค่
    // ท่าที่อยู่ในแผน เพราะท่าที่กด "เพิ่มท่า" เองระหว่างเซสชันก็ต้องรอดจากการรีเฟรชด้วยเหมือนกัน
    const { data: workoutRows } = await supabase
      .from('workouts')
      .select('id, exercise_name, muscle_group, rpe, program_day_id')
      .eq('user_id', user.id)
      .eq('type', 'strength')
      .eq('performed_at', todayStr())

    // บั๊ก (ฟีดแบ็ก "ทำแผนวันจันทร์ชดเชยวันพุธ แต่ /session ของวันพุธจริงกลับเห็นท่าจันทร์ปนมาเป็น ad-hoc
    // 19 ท่า") — เดิมกรองแค่ performed_at วันนี้ ไม่สนใจว่า workout แถวนั้นทำเพื่อแผนวันไหน ทำให้เซสชัน
    // ชดเชยของแผนอื่น (program_day_id ไม่ตรงกับแผนที่กำลังเปิดอยู่ตอนนี้) ถูกดึงมาปนเป็นท่า ad-hoc ของ
    // แผนนี้ไปด้วย — กรองออกเฉพาะแถวที่ระบุ program_day_id ไว้ชัดเจนแล้วว่าเป็นของแผน "อื่น" (ไม่ใช่แผนที่
    // กำลังเปิดอยู่) เหลือไว้แค่ null (workout อิสระแท้ๆ ไม่ผูกแผนไหนเลย ยังต้องรอดจากการรีเฟรชเหมือนเดิม)
    // กับที่ตรงกับแผนนี้พอดี (ทำแผนเดียวกันซ้ำ/resume เซสชันชดเชยเดิมที่ยังไม่จบ)
    const typedWorkoutRows = (
      (workoutRows as (LoggedWorkoutRow & { muscle_group: string | null; program_day_id: string | null })[]) ?? []
    ).filter((w) => w.program_day_id == null || w.program_day_id === (dayRow as ProgramDay).id)

    // ท่าที่ log ไปแล้ววันนี้แต่ไม่ได้อยู่ในแผน = ท่าที่เคย "เพิ่มท่า" เองมาก่อน — สร้างเป็นท่า ad-hoc
    // ต่อท้ายรายการท่าตามแผน ไม่งั้นรีเฟรชแล้วท่านี้จะหายไปทั้งที่บันทึกจริงอยู่แล้ว
    const planNames = new Set(typedExercises.map((ex) => ex.exercise_name))
    const extraLogged = findExtraLoggedExercises(typedWorkoutRows, planNames)
    const adhocExercises = extraLogged.map((w, i) =>
      makeAdhocExercise({
        id: w.id,
        exerciseName: w.exercise_name,
        muscleGroup: w.muscle_group,
        position: typedExercises.length + i,
      })
    )
    const combinedExercises = [...typedExercises, ...adhocExercises]

    const workoutIds = typedWorkoutRows.map((w) => w.id)
    const { data: setRows } =
      workoutIds.length > 0
        ? await supabase
            .from('workout_sets')
            .select('workout_id, set_number, reps, weight_kg')
            .in('workout_id', workoutIds)
        : { data: [] as LoggedSetRow[] }

    // ผลงานล่าสุด "ครั้งก่อน" (ไม่ใช่วันนี้) ของแต่ละท่าในแผน — เอาไว้ตั้งค่าเริ่มต้น reps/น้ำหนัก
    // ให้ท่าที่ยังไม่ได้ log วันนี้ แทนที่จะเริ่มจาก 0/ค่าเป้าหมายเฉยๆ (เดิมมีแค่ log วันนี้เท่านั้นที่จำได้)
    const planExerciseNames = typedExercises.map((ex) => ex.exercise_name)
    const lastPerformanceByName: Record<string, LastPerformance> = {}
    if (planExerciseNames.length > 0) {
      // ดึงกว้างๆ ไม่กรองชื่อท่าด้วย .in() ตรงๆ เพราะ exercise_name ระหว่างแผน (program_exercises)
      // กับที่เคย log จริง (workouts) อาจตัวพิมพ์เล็ก/ใหญ่หรือช่องว่างหัวท้ายไม่ตรงกันเป๊ะ ทำให้ exact
      // match แบบ .eq()/.in() หลุดเงียบๆ — เทียบแบบ trim+lowercase เอาเองแทน เหมือนที่หน้า /log
      // ใช้ .ilike() กันเคสนี้อยู่แล้ว
      const { data: priorWorkouts } = await supabase
        .from('workouts')
        .select('id, exercise_name, reps, weight_kg')
        .eq('user_id', user.id)
        .eq('type', 'strength')
        .lt('performed_at', todayStr())
        .order('performed_at', { ascending: false })
        .order('created_at', { ascending: false })

      const typedPriorWorkouts =
        (priorWorkouts as { id: string; exercise_name: string | null; reps: number | null; weight_kg: number | null }[]) ??
        []

      const normalize = (s: string) => s.trim().toLowerCase()
      const planNamesNormalized = new Set(planExerciseNames.map(normalize))

      // เก็บแค่ครั้งล่าสุดสุดต่อชื่อท่า (normalize แล้ว) เพราะ query เรียง performed_at ล่าสุดก่อนแล้ว
      const latestWorkoutByNormalizedName = new Map<string, (typeof typedPriorWorkouts)[number]>()
      typedPriorWorkouts.forEach((w) => {
        if (!w.exercise_name) return
        const key = normalize(w.exercise_name)
        if (planNamesNormalized.has(key) && !latestWorkoutByNormalizedName.has(key)) {
          latestWorkoutByNormalizedName.set(key, w)
        }
      })

      const priorWorkoutIds = Array.from(latestWorkoutByNormalizedName.values()).map((w) => w.id)
      const { data: priorSets } =
        priorWorkoutIds.length > 0
          ? await supabase
              .from('workout_sets')
              .select('workout_id, set_number, reps, weight_kg')
              .in('workout_id', priorWorkoutIds)
              .eq('set_number', 1)
          : { data: [] as LoggedSetRow[] }
      const firstSetByWorkoutId = new Map(
        ((priorSets as LoggedSetRow[]) ?? []).map((s) => [s.workout_id, s])
      )

      planExerciseNames.forEach((name) => {
        const w = latestWorkoutByNormalizedName.get(normalize(name))
        if (!w) return
        // มี workout_sets (เซ็ตแรก) ให้ใช้ก่อน — แม่นกว่า เพราะเก็บทีละเซ็ตจริง ไม่ใช่ top set เดียว
        // ถ้าเป็นแถวเก่าก่อนมี workout_sets ค่อย fallback ไปใช้ reps/weight_kg บนแถว workouts เอง
        const firstSet = firstSetByWorkoutId.get(w.id)
        if (firstSet) {
          lastPerformanceByName[name] = { reps: firstSet.reps, weightKg: firstSet.weight_kg }
        } else if (w.reps !== null && w.weight_kg !== null) {
          lastPerformanceByName[name] = { reps: w.reps, weightKg: w.weight_kg }
        }
      })
    }

    const initialStates = initSessionStates(
      combinedExercises,
      typedWorkoutRows,
      (setRows as LoggedSetRow[]) ?? [],
      lastPerformanceByName
    )

    // initSessionStates เดา logged=true จากการมีแถว workouts อยู่เฉยๆ ซึ่งตอนนี้ไม่จริงเสมอไปแล้ว
    // (persistSets เขียนทุกเซ็ตทันที ไม่รอจบท่า) — เชื่อ logged=true เฉพาะท่าที่กดจบท่าจริงเท่านั้น
    // (อยู่ใน finishedIds) ท่าที่ยังทำไม่ครบจะถูกดึงกลับมาเปิดต่อที่เดิมพร้อม setsLog เดิมที่บันทึกไว้แล้ว
    // บั๊ก (ฟีดแบ็ก "กด 'ดูสรุปวันนี้' ตอนเทรนเสร็จแล้ว แต่กลับไปหน้าทำท่าปกติ (ท่าที่ 1) แทนหน้าสรุป") —
    // finishedIds อยู่ใน localStorage ของเบราว์เซอร์ล้วนๆ ผูกกับปุ่ม "จบท่า" ในหน้านี้เท่านั้น ถ้า workout
    // วันนี้ถูกบันทึกผ่านช่องทางอื่น (ปุ่ม "เริ่ม [กล้ามเนื้อ]" ใน MINT Coach ที่ insert ตรงเข้า DB, หน้า
    // /log, import ฯลฯ) โดยไม่เคยกดปุ่ม "จบท่า" ในหน้านี้เลยสักครั้ง finishedIds จะว่างเปล่า ทำให้ทุกท่า
    // ถูกบังคับเป็น logged=false หมด ทั้งที่ log ครบทุกเซ็ตจริงแล้ว — เพิ่มเงื่อนไขที่สอง: ถือว่าเชื่อถือได้
    // ด้วยถ้าจำนวนเซ็ตที่ log ไว้ (setsLog.length) ถึงเป้าหมายจำนวนเซ็ตของท่านั้น (ex.sets) แล้ว ไม่ต้องพึ่ง
    // finishedIds อย่างเดียว — เคสเดิมที่ตั้งใจแก้ (log ไปครึ่งทางแล้วออกจากหน้า) ยังทำงานถูกต้องเหมือนเดิม
    // เพราะ setsLog.length < ex.sets ในเคสนั้น
    const finishedIds = readFinishedExerciseIds()
    const targetSetsById = new Map(combinedExercises.map((ex) => [ex.id, ex.sets]))
    const exercisesById = new Map(combinedExercises.map((ex) => [ex.id, ex]))
    // บั๊ก (ไล่ตรวจทั้งโปรเจครอบใหม่) "log ครบทุกเซ็ตของท่าสุดท้ายแล้วปิดแท็บโดยไม่กด 'จบท่า' — พอเปิดหน้า
    // นี้กลับมาใหม่ meetsTargetSets ด้านบนเชื่อว่า logged แล้ว ถ้าทุกท่าอื่น finished ครบพอดี allFinished
    // จะข้ามตรงไปหน้า 'done' เลยโดยไม่มีทางกลับมากดปุ่ม 'จบท่า' ของท่านั้นได้อีก" — recordProgramCompletion
    // (เขียนแถว program_completions) ถูกเรียกจากปุ่ม 'จบท่า' เท่านั้น (logCurrentExercise) ไม่เคยถูกเรียก
    // ตอน trust มาจาก meetsTargetSets เลย แถว completion เลยหายถาวร (บั๊ก class เดียวกับ "7/8" ที่เคยแก้ผ่าน
    // migration 042/043 มาก่อน) — backfill ให้เองตรงนี้เฉพาะท่าที่ trust มาจาก meetsTargetSets ล้วนๆ (ยังไม่
    // เคยกดปุ่ม "จบท่า" จริง) และมี workoutId ให้ผูกแล้วเท่านั้น
    const completionBackfills: { ex: ProgramExercise; workoutId: string }[] = []
    const adjustedStates = Object.fromEntries(
      Object.entries(initialStates).map(([id, state]) => {
        const targetSets = targetSetsById.get(id)
        const meetsTargetSets = targetSets != null && targetSets > 0 && state.setsLog.length >= targetSets
        const trustLogged = finishedIds.has(id) || meetsTargetSets
        if (meetsTargetSets && !finishedIds.has(id) && state.workoutId) {
          const ex = exercisesById.get(id)
          if (ex) completionBackfills.push({ ex, workoutId: state.workoutId })
        }
        return [id, state.logged && !trustLogged ? { ...state, logged: false } : state]
      })
    )
    if (completionBackfills.length > 0) {
      await Promise.all(
        completionBackfills.map(({ ex, workoutId }) => recordProgramCompletion(user.id, ex, workoutId).catch(() => {}))
      )
    }

    setDay(dayRow as ProgramDay)
    setExercises(combinedExercises)
    setStates(adjustedStates)
    setLastPerformanceByName(lastPerformanceByName)
    setIndex(firstUnfinishedIndex(combinedExercises, adjustedStates))

    // ฟีดแบ็ก "กดเข้าการ์ด Today's Workout ตอนทำครบแล้ว ควรเห็นหน้าสรุปผล ไม่ใช่กลับไปหน้าทำท่า" — เดิม
    // set 'active' เสมอไม่ว่าจะทำครบหรือยัง ทำให้กลับเข้ามาที่ท่าสุดท้าย (firstUnfinishedIndex fallback)
    // แทนที่จะเห็นสรุปผล — ถ้าทุกท่า (รวม ad-hoc) ถูกบันทึกจบแล้วจริง ให้ข้ามตรงไปหน้า 'done' เลย (ใช้
    // states/exercises ที่เพิ่ง set ไปด้านบน — คำนวณสรุปได้ทันทีเหมือนตอนกดจบเซสชันปกติ) เคลียร์ timestamp
    // เซสชันทิ้งด้วยเหตุผลเดียวกับ endSession() — ไม่มีเซสชันที่กำลังนับเวลาอยู่จริงให้ resume ต่อ
    const allFinished = combinedExercises.length > 0 && combinedExercises.every((ex) => adjustedStates[ex.id]?.logged)
    if (allFinished) {
      if (typeof window !== 'undefined') window.localStorage.removeItem(sessionStorageKey)
      clearActiveMakeupDayId()
      // ดู comment ที่ noLiveDuration state ด้านบน — ไปหน้า 'done' ตรงนี้โดยไม่เคยผ่าน 'active' เลย
      // stopwatch เลยไม่มีทางเริ่มนับจริง เวลา/แคลอรี่ที่จะโชว์ในหน้าสรุปจึงไม่มีข้อมูลจริงให้อ้างอิง
      setNoLiveDuration(true)
      setPhase('done')
      return
    }

    // ฟีดแบ็ก (live-test, product decision — ดู comment เต็มที่ makeupCheckpointOtherDay state ด้านบน)
    // "START WORKOUT หลัง Makeup จบไปแล้ว ไม่ควรพาเข้า Day 2 ทันทีแบบเงียบๆ" — ตรวจเฉพาะตอนเข้ามาแบบ
    // ไม่มี ?day= (ไม่ใช่ resume เซสชันชดเชย, !makeupDayId) และยังไม่แตะแผนวันนี้เองเลย (typedWorkoutRows
    // ว่างเปล่า — ตัวเดียวกับที่ Dashboard ใช้ตัดสิน "เริ่มแผนวันนี้หรือยัง") — หา workout วันนี้ที่ผูกกับ
    // แผน "อื่น" จาก workoutRows ดิบ (ก่อนกรอง ต่างจาก typedWorkoutRows ที่กรองแผนอื่นทิ้งไปแล้ว)
    //
    // v2 (live-test จริง — บั๊ก) "เซสชันชดเชยที่เคย 'เปลี่ยนท่า' (swap) ก่อน log เซ็ตแรกของท่านั้น ทำให้ท่า
    // เดิมในแผน (program_exercises) ไม่เคยมีทาง log ได้เลย (ท่าที่สลับเข้ามาไปนับ completion แยกทาง
    // workout_id แทน — ดู comment ที่ swapCurrentExercise) ตัวนับ 'program_exercises ทั้งหมดของวันนั้น
    // vs program_completions' รอบแรกเลยไม่มีทางเท่ากันได้อีกเลย (ค้าง N-1/N ถาวร) ทำให้ checkpoint ไม่โผล่
    // แม้ผู้ใช้ทำเซสชันนั้นจบไปแล้วจริง — เปลี่ยนมาเชื่อ pointer แทน (lib/activeMakeupSession.ts) ตัวเดียว
    // กับที่ Dashboard ใช้จริง (makeupSessionActive ของ Dashboard ก็เชื่อ "pointer หายไปแล้ว = จบแล้ว"
    // เหมือนกันทุกประการ ไม่เคย query completion ซ้ำเมื่อ pointer ว่างอยู่แล้ว) — pointer ถูกเคลียร์เสมอทั้ง
    // ตอนจบตามธรรมชาติ (allFinished ด้านบน) และกด "จบก่อน" (endSession) จึงเป็นสัญญาณที่เชื่อถือได้ว่า
    // "ไม่มีเซสชันของแผนนั้นค้างอยู่แล้ว" โดยไม่ต้อง query DB ซ้ำเลย (ถูกต้องตามที่คุยกันไว้ — reuse
    // completion state ที่มีอยู่แล้ว ไม่สร้างเกณฑ์ตรวจใหม่)
    if (!makeupDayId && typedWorkoutRows.length === 0) {
      const rawWorkoutRows =
        (workoutRows as (LoggedWorkoutRow & { muscle_group: string | null; program_day_id: string | null })[]) ?? []
      const otherPlanWorkout = rawWorkoutRows.find(
        (w) => w.program_day_id && w.program_day_id !== (dayRow as ProgramDay).id
      )
      // pointer ยังชี้ไปที่แผนนี้อยู่ไหม — ถ้าใช่ แปลว่ายังมีเซสชันของแผนนั้นค้างไม่จบจริง (เช่น เข้า
      // /session ตรงๆ โดยไม่ผ่าน BottomNav/Dashboard ระหว่างเซสชันชดเชยยังไม่จบ) ปล่อยผ่านไป Day 2 ตามปกติ
      // ไม่ยุ่ง ให้ผู้ใช้กลับไปกดปุ่ม resume ที่ถูกต้องเอง
      if (otherPlanWorkout && getActiveMakeupDayId() !== otherPlanWorkout.program_day_id) {
        const { data: otherDayRow } = await supabase
          .from('program_days')
          .select('*')
          .eq('id', otherPlanWorkout.program_day_id as string)
          .maybeSingle()
        if (otherDayRow) {
          setMakeupCheckpointOtherDay(otherDayRow as ProgramDay)
          setPhase('makeupCheckpoint')
          return
        }
      }
    }

    // ฟีดแบ็ก (product decision, live-test — "Smart Start") "กด START WORKOUT (BottomNav) ตรงๆ พาเข้า
    // Day 2 ทันทีแบบเงียบๆ ทั้งที่มีแผนจากวันจันทร์พลาดอยู่ (ยังไม่เคยแตะเลยทั้งสัปดาห์ ไม่ใช่แค่วันนี้ —
    // คนละเคสกับ makeupCheckpoint ด้านบนซึ่งเช็คเฉพาะแผนที่ทำ 'วันนี้' ไปแล้ว) — ผู้ใช้ที่ลืมว่ามี workout
    // ค้างจะไม่มีทางรู้เลยถ้าไม่ได้สังเกตการ์ด 'แผนที่พลาด' บน Dashboard เอง" — ตรวจเฉพาะตอนเข้ามาแบบไม่มี
    // ?day= และยังไม่แตะแผนวันนี้เองเลยเหมือนกัน (เงื่อนไขเดียวกับ makeupCheckpoint ด้านบน แต่ไปถึงจุดนี้ได้
    // ก็ต่อเมื่อเช็คด้านบนไม่ trigger แล้วเท่านั้น — ไม่ทับซ้อนกัน) ใช้ findMissedProgramDays() ตัวเดียวกับ
    // การ์ด "แผนที่พลาด" ใน MobileDashboardView.tsx เป๊ะ (lib/dashboardStats.ts) กันสองจุด deriveตรรกะ
    // เดียวกันแยกกันจนหลุด sync — ไม่ block ("ไม่ encourage ≠ ไม่ allow"): Day 2 (แผนวันนี้) ยังเป็นตัวเลือก
    // primary เสมอ เพราะผู้ใช้ที่กด START มี intent ชัดว่า "จะฝึกตอนนี้" MINT Coach ต่างหากที่ทำหน้าที่
    //แนะนำว่าควรทำอันไหนก่อน (ดู AICoachCompactCard.tsx) — หน้านี้แค่ "แจ้งตัวเลือกอย่างรวดเร็ว" เท่านั้น
    // ไม่ใช่ gate ที่ต้องเลือกก่อนถึงจะฝึกได้
    if (!makeupDayId && typedWorkoutRows.length === 0) {
      const { start } = getWeekRange()
      const { data: weekWorkoutRows } = await supabase
        .from('workouts')
        .select('program_day_id')
        .eq('user_id', user.id)
        .gte('performed_at', start)
        .not('program_day_id', 'is', null)
      const doneDayIds = new Set(((weekWorkoutRows as { program_day_id: string }[]) ?? []).map((w) => w.program_day_id))
      const { data: allProgramDayRows } = await supabase.from('program_days').select('*').order('day_of_week')
      const missed = findMissedProgramDays((allProgramDayRows as ProgramDay[]) ?? [], doneDayIds, dow)
      if (missed.length > 0) {
        setSmartStartMissedDay(missed[0])
        setPhase('smartStart')
        return
      }
    }

    setPhase('active')
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (phase === 'active' && !sessionStartedRef.current) {
      sessionStartedRef.current = true
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(sessionStorageKey) : null
      if (stored) {
        sessionOffsetRef.current = Date.now() - Number(stored)
      } else if (typeof window !== 'undefined') {
        window.localStorage.setItem(sessionStorageKey, String(Date.now()))
      }
      session.start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // เวลารวมจริงตั้งแต่เริ่มเซสชันวันนี้ (รวม offset จากรอบก่อนหน้า remount ด้วย) — ใช้แทน
  // session.elapsedMs ตรงๆ ทุกจุดที่ต้องโชว์/คำนวณเวลาเซสชัน
  const totalElapsedMs = session.elapsedMs + sessionOffsetRef.current

  // เรียกตอนจบเซสชัน (ทั้งทำครบทุกท่า และกด "จบก่อน") — ล้าง timestamp เริ่มเซสชันทิ้ง ไม่งั้น
  // เซสชันถัดไปในวันเดียวกัน (ถ้ามี) จะเห็น timestamp เก่าแล้วคำนวณ offset ผิด
  function endSession() {
    session.pause()
    if (typeof window !== 'undefined') window.localStorage.removeItem(sessionStorageKey)
    clearActiveMakeupDayId()
    setPhase('done')
  }

  const current = exercises[index] ?? null
  const currentState = current ? states[current.id] : null
  const targetSets = current?.sets ?? 3

  // คำแนะนำ Progressive Overload ของท่าปัจจุบัน — โชว์เฉพาะ "ก่อน" กดเซ็ตแรกของเซสชันนี้ (setsLog ว่าง)
  // เพราะหลังจากนั้นค่า reps/weightKg ใน currentState คือ draft ที่ผู้ใช้กำลังกรอกอยู่จริงแล้ว ไม่ใช่จุดที่
  // ควรมาแนะนำค่าเริ่มต้นซ้ำอีก — ต้องมีผลงานครั้งก่อนของท่านี้ด้วย ไม่งั้นไม่มีฐานให้เทียบ
  const currentLastPerf = current ? lastPerformanceByName[current.exercise_name] ?? null : null
  const overloadSuggestion =
    currentLastPerf && currentState?.setsLog.length === 0
      ? suggestNextLoad(currentLastPerf, current?.target_reps ?? null, unit)
      : null

  // Plate Calculator เฉพาะท่าอุปกรณ์บาร์เบล — ดัมเบล/เครื่อง/เคเบิล/น้ำหนักตัว/คีทเทิลเบลไม่ได้ใส่แผ่น
  // แบบ 2 ข้างบาร์แบบนี้ (ยกเว้นบางเครื่อง แต่แยกไม่ออกจากข้อมูลที่มีอยู่ เลยไม่รวมด้วยกันความชัวร์)
  const currentEquipment = current ? findExerciseByName(exerciseLibrary, current.exercise_name)?.equipment : undefined
  const plateBreakdown =
    currentEquipment === 'บาร์เบล' && (currentState?.weightKg ?? 0) > 0
      ? calculatePlates(toDisplay(currentState!.weightKg!), unit, barWeightOverride ?? undefined)
      : null

  function updateCurrent(patch: Partial<SessionSetState>) {
    if (!current) return
    setStates((prev) => ({ ...prev, [current.id]: { ...prev[current.id], ...patch } }))
  }

  // ผลงานล่าสุด "ครั้งก่อน" ของท่าที่ไม่ได้อยู่ในแผน (เพิ่มเอง/เปลี่ยนท่า) — ท่าพวกนี้ไม่ผ่าน
  // initSessionStates ตอนโหลดหน้า (ซึ่งดึงผลงานล่าสุดให้ทุกท่าในแผนไปแล้ว) ต้องดึงเองแยกตรงนี้
  // ไม่งั้นจะขึ้น 0/0 เสมอแม้เคยเล่นท่านี้มาก่อน — ใช้ร่วมกันทั้ง addExercise และ swapCurrentExercise
  async function fetchLastPerformance(name: string): Promise<LastPerformance | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data: priorWorkout } = await supabase
      .from('workouts')
      .select('id, reps, weight_kg')
      .eq('user_id', user.id)
      .eq('type', 'strength')
      .ilike('exercise_name', name)
      .lt('performed_at', todayStr())
      .order('performed_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const typedPriorWorkout = priorWorkout as { id: string; reps: number | null; weight_kg: number | null } | null
    if (!typedPriorWorkout) return null

    const { data: firstSet } = await supabase
      .from('workout_sets')
      .select('reps, weight_kg')
      .eq('workout_id', typedPriorWorkout.id)
      .eq('set_number', 1)
      .maybeSingle()

    const typedFirstSet = firstSet as { reps: number; weight_kg: number } | null
    if (typedFirstSet) return { reps: typedFirstSet.reps, weightKg: typedFirstSet.weight_kg }
    if (typedPriorWorkout.reps !== null && typedPriorWorkout.weight_kg !== null) {
      return { reps: typedPriorWorkout.reps, weightKg: typedPriorWorkout.weight_kg }
    }
    return null
  }

  // "เพิ่มท่า" เอง ระหว่างเซสชัน — รับได้ทั้งเลือกจากคลังท่า (ExercisePicker) และพิมพ์ชื่อเองอิสระ
  // ไม่ผูกกับ program_exercises จริง (ดู makeAdhocExercise) แต่เข้า flow เดียวกับท่าอื่นทุกอย่าง
  async function addExercise() {
    const name = newExerciseName.trim()
    if (!name) {
      setAddExerciseError('กรุณาพิมพ์หรือเลือกชื่อท่าก่อน')
      return
    }
    setAddExerciseError(null)
    const newEx = makeAdhocExercise({
      id: crypto.randomUUID(),
      exerciseName: name,
      muscleGroup: newExerciseDef?.muscleGroup ?? null,
      position: exercises.length,
    })

    const last = await fetchLastPerformance(name)
    if (last) setLastPerformanceByName((prev) => ({ ...prev, [name]: last }))

    setExercises((prev) => [...prev, newEx])
    setStates((prev) => ({ ...prev, [newEx.id]: initSessionSet(newEx, last) }))
    setIndex(exercises.length)
    setNewExerciseName('')
    setNewExerciseDef(null)
    setShowAddExercise(false)
  }

  // เขียน setsLog ปัจจุบันของท่านี้ลง DB จริง (workouts + workout_sets) — เรียกทันทีทุกครั้งที่กด
  // "เซ็ตนี้เสร็จแล้ว" ไม่ใช่รอจนกดจบท่า เพราะ state ของหน้านี้อยู่ในหน่วยความจำล้วนๆ ถ้าออกจากหน้า
  // ระหว่างทำท่าอยู่ (เช่น สลับไปดูหน้าอื่นแล้วกลับมา) ข้อมูลที่ยังไม่ได้เขียนลง DB จะหายหมด
  async function persistSets(
    ex: ProgramExercise,
    state: SessionSetState,
    userId: string
  ): Promise<{ workoutId: string | null; setsError: string | null }> {
    if (state.setsLog.length === 0) return { workoutId: state.workoutId ?? null, setsError: null }

    // top set = เซ็ตที่หนักที่สุด (ถ้าเท่ากันเทียบ reps) — เก็บลง workouts.reps/weight_kg
    // เพื่อให้ยังใช้เป็นค่าเดี่ยวสำหรับ PR / ประมาณ 1RM ได้เหมือนหน้า /log
    const topSet = state.setsLog.reduce((best, s) => {
      if (s.weightKg > best.weightKg) return s
      if (s.weightKg === best.weightKg && s.reps > best.reps) return s
      return best
    }, state.setsLog[0])
    // total_volume_kg: รวมจาก reps x น้ำหนัก จริงทีละเซ็ต (ไม่ใช่ setsDone * ค่าเดียวเหมือนเดิม)
    const totalVolumeKg = state.setsLog.reduce((sum, s) => sum + s.reps * s.weightKg, 0)
    const payload = {
      user_id: userId,
      type: 'strength' as const,
      performed_at: todayStr(),
      exercise_name: ex.exercise_name,
      muscle_group: ex.muscle_group,
      sets: state.setsLog.length,
      reps: topSet.reps,
      weight_kg: topSet.weightKg,
      rpe: state.rpe,
      notes: ex.rationale,
      total_volume_kg: totalVolumeKg,
      // บั๊ก (ฟีดแบ็ก "ทำเซสชันชดเชย Day 1 Push แล้วสลับท่าเป็น Assisted Dip Machine กลางเซสชัน —
      // พอเปิด /session ปกติของวันนี้ (Day 2 Pull) กลับเห็นท่านั้นโผล่มาเป็น ad-hoc ที่เสร็จแล้วด้วย")
      // เดิมใช้ ex.program_day_id ซึ่งเป็น '' (sentinel ว่าง) เสมอสำหรับท่า ad-hoc/สลับ (ดู
      // makeAdhocExercise) แปลงเป็น null แล้วตีความว่า "อิสระ ไม่ผูกแผนไหนเลย" — แต่ที่จริงท่าที่เพิ่ม/
      // สลับกลางเซสชัน "ผูกอยู่กับเซสชันนี้" อยู่แล้ว (ไม่ว่าเซสชันนั้นจะเป็นวันปกติหรือชดเชย) ควรได้
      // program_day_id เดียวกับแผนที่กำลังเปิดอยู่ตอนนี้ (state `day`) เหมือนท่าตามแผนทุกประการ ไม่ใช่
      // null ลอยๆ — null ควรเหลือไว้เฉพาะ workout จาก /log ที่ไม่มีบริบทเซสชันเลยจริงๆ เท่านั้น
      program_day_id: day?.id ?? null,
    }

    // ถ้าเคยบันทึกท่านี้ไปแล้ว (เซ็ตก่อนหน้าในท่าเดียวกัน หรือกลับมาแก้ผ่าน progress chips)
    // ต้องอัปเดตแถวเดิมแทนการ insert ใหม่ ไม่งั้นจะได้รายการซ้ำซ้อนในประวัติ/สถิติ
    const { data: upserted, error: wErr } = state.workoutId
      ? await supabase.from('workouts').update(payload).eq('id', state.workoutId).select('id').single()
      : await supabase.from('workouts').insert(payload).select('id').single()

    if (wErr) throw wErr

    const workoutId = (upserted as { id: string } | null)?.id ?? state.workoutId
    if (!workoutId) return { workoutId: null, setsError: null }

    // ลบเซ็ตเก่าทั้งหมดแล้วเขียนชุดใหม่ทับ — ง่ายกว่า diff ทีละเซ็ต และจำนวน/ลำดับเซ็ตอาจเปลี่ยนไปจากเดิม
    if (state.workoutId) {
      await supabase.from('workout_sets').delete().eq('workout_id', workoutId)
    }
    const setsPayload = state.setsLog.map((s, i) => ({
      workout_id: workoutId,
      user_id: userId,
      set_number: i + 1,
      reps: s.reps,
      weight_kg: s.weightKg,
      completed: true,
    }))
    const { error: setsError } = await supabase.from('workout_sets').insert(setsPayload)

    return { workoutId, setsError: setsError ? setsError.message : null }
  }

  // ฟีดแบ็ก "Dashboard แสดง 7/8 ทั้งๆที่ประวัติบันทึกไป 8 ท่า" — root cause: program_completions เดิม
  // ผูก FK กับ program_exercises เท่านั้น (not null) ท่า ad-hoc ("เพิ่มท่า" ระหว่างเซสชัน — ไม่มีแถว
  // program_exercises ให้ผูก) เลยข้ามการบันทึก completion ไปตรงๆ ทุกครั้ง แม้จะทำเสร็จจริง — migration 042
  // เพิ่ม workout_id ให้ผูกกับท่า ad-hoc แทนได้ (program_exercise_id เป็น null ในกรณีนั้น) ฟังก์ชันนี้เลือก
  // คอลัมน์ที่ถูกต้องให้เอง กันไม่ให้ทั้ง 2 จุดที่เรียก (logCurrentExercise/swapCurrentExercise) ต้อง
  // เขียนตรรกะแยกกัน 2 ที่เหมือนเดิม
  // v2: ฟีดแบ็ก "ยังแสดง 7/8" หลัง deploy migration 042 แล้ว — เจอว่า upsert onConflict:'user_id,workout_id'
  // เดิมพังเงียบๆ ทุกครั้ง (unique index รอบแรกเป็น partial index ที่ ON CONFLICT เปล่าๆ จับคู่ไม่ได้ — ดู
  // migration 043) เพราะฟังก์ชันนี้ไม่เคยเช็ค error จาก upsert เลย เพิ่มการเช็ค+โยน error ให้ผู้เรียกจับได้
  // (เหมือน pattern persistSets ด้านบนที่ throw wErr ตอน insert/update workouts พลาด) กันความเงียบซ้ำอีก
  async function recordProgramCompletion(userId: string, ex: ProgramExercise, workoutId: string) {
    if (isAdhocExercise(ex)) {
      const { error } = await supabase
        .from('program_completions')
        .upsert({ user_id: userId, workout_id: workoutId, completed_at: todayStr() }, { onConflict: 'user_id,workout_id' })
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('program_completions')
        .upsert(
          { user_id: userId, program_exercise_id: ex.id, completed_at: todayStr() },
          { onConflict: 'user_id,program_exercise_id,completed_at' }
        )
      if (error) throw error
    }
  }

  // กด "เซ็ตนี้เสร็จแล้ว" — จำ reps/น้ำหนักที่กรอกอยู่ ณ ตอนนี้เป็นเซ็ตจริงเซ็ตหนึ่ง (ไม่ใช่แค่นับจำนวน)
  // ทำให้ drop set หรือเซ็ตท้ายๆ ที่ reps ตกลง ถูกเก็บค่าจริงแยกทีละเซ็ต ไม่ถูกปัดเป็นค่าเดียวซ้ำทุกเซ็ต
  async function logSet() {
    // กันดับเบิลแท็บ/ดับเบิลคลิก: currentState.setsLog ด้านล่างอ่านจาก closure ของ render
    // นี้ ถ้าไม่กันไว้ การกดรัวสองครั้งก่อน re-render จะคำนวณ newSetsLog จากฐานเดียวกันทั้งคู่
    // ผลคือเซ็ตที่สองหายไปเงียบๆ (บันทึกได้แค่ 1 เซ็ตทั้งที่กด 2 ครั้ง)
    if (loggingSet) return
    if (!current || !currentState) return
    if (!currentState.reps || currentState.reps <= 0) {
      setErrorMsg('กรุณาใส่จำนวน reps ที่ทำได้ก่อนกดเซ็ตเสร็จ')
      return
    }
    setErrorMsg(null)
    setLoggingSet(true)
    const newSetsLog = [...currentState.setsLog, { reps: currentState.reps, weightKg: currentState.weightKg ?? 0 }]
    updateCurrent({ setsLog: newSetsLog })
    writeRestStartedAt(current.id)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { workoutId, setsError } = await persistSets(current, { ...currentState, setsLog: newSetsLog }, user.id)
      if (workoutId && workoutId !== currentState.workoutId) updateCurrent({ workoutId })
      if (setsError) setErrorMsg('บันทึกสำเร็จ แต่รายละเอียดทีละเซ็ตบันทึกไม่ครบ')
    } catch (err) {
      setErrorMsg(`บันทึกเซ็ตไม่สำเร็จ: ${getErrorMessage(err)}`)
    } finally {
      setLoggingSet(false)
    }
  }

  // "ลบเซ็ตล่าสุด" — เอาเซ็ตท้ายสุดออก แล้วดึงค่า reps/น้ำหนักของเซ็ตนั้นกลับมาเป็น draft
  // ให้แก้ไขแล้วกดเสร็จใหม่ได้ทันที แทนที่จะแค่ลดตัวนับ
  function removeLastSet() {
    if (!current || !currentState || currentState.setsLog.length === 0) return
    const popped = currentState.setsLog[currentState.setsLog.length - 1]
    updateCurrent({
      setsLog: currentState.setsLog.slice(0, -1),
      reps: popped.reps,
      weightKg: popped.weightKg,
    })
  }

  async function logCurrentExercise() {
    if (!current || !currentState) return
    setSaving(true)
    setErrorMsg(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setErrorMsg('กรุณาเข้าสู่ระบบใหม่')
        return
      }

      if (currentState.setsLog.length > 0) {
        // ปกติเซ็ตทั้งหมดถูกเขียนลง DB ไปแล้วทีละเซ็ตตั้งแต่ตอนกด "เซ็ตนี้เสร็จแล้ว" (ดู persistSets
        // ใน logSet) เรียกซ้ำอีกทีตรงนี้เพื่อความชัวร์ (idempotent) เผื่อครั้งก่อนๆ เขียนไม่สำเร็จ
        let workoutId: string | null
        try {
          const result = await persistSets(current, currentState, user.id)
          workoutId = result.workoutId
          if (result.setsError) setErrorMsg('บันทึกสำเร็จ แต่รายละเอียดทีละเซ็ตบันทึกไม่ครบ')
        } catch (err) {
          setErrorMsg(`บันทึกไม่สำเร็จ: ${getErrorMessage(err)}`)
          return
        }

        if (workoutId) await recordProgramCompletion(user.id, current, workoutId)

        markExerciseFinished(current.id)

        // ใช้ states ที่เพิ่งอัปเดตนี้ (ไม่ใช่ตัวแปร states เดิมจาก closure ที่ยังไม่ทันอัปเดต)
        // ไปคำนวณท่าถัดไปทันที กัน goNext เห็นค่า logged เก่าที่ยังเป็น false อยู่
        const merged = {
          ...states,
          [current.id]: { ...currentState, logged: true, workoutId },
        }
        setStates(merged)
        showToast('บันทึกแล้ว ✓')
        goNext(merged)
        return
      }

      goNext()
    } catch (err) {
      setErrorMsg(`เกิดข้อผิดพลาด: ${getErrorMessage(err)}`)
    } finally {
      setSaving(false)
    }
  }

  // "เปลี่ยนท่า" ท่าปัจจุบันกลางเซสชัน — เผื่ออุปกรณ์ไม่ว่าง ถ้ายังไม่ได้ทำเซ็ตไหนเลยของท่านี้ แทนที่
  // ท่าเดิมในตำแหน่งเดิมไปเลย แต่ถ้าทำไปแล้วบางเซ็ต จะบันทึกเท่าที่ทำจริงของท่าเดิมไว้ก่อน (เหมือนกด
  // "บันทึก & ท่าถัดไป") แล้วแทรกท่าใหม่เข้ามาต่อจากตำแหน่งเดิมให้ทำต่อ ไม่ทิ้งข้อมูลที่ทำไปแล้ว
  async function swapCurrentExercise() {
    if (!current || !currentState) return
    const name = swapName.trim()
    if (!name) {
      setSwapError('กรุณาพิมพ์หรือเลือกชื่อท่าก่อน')
      return
    }
    setSwapError(null)
    setSwapping(true)
    try {
      const last = await fetchLastPerformance(name)
      if (last) setLastPerformanceByName((prev) => ({ ...prev, [name]: last }))
      const newEx = makeAdhocExercise({
        id: crypto.randomUUID(),
        exerciseName: name,
        muscleGroup: swapDef?.muscleGroup ?? current.muscle_group,
        position: current.position,
        sets: current.sets ?? undefined,
        targetReps: current.target_reps,
        targetRir: current.target_rir,
        rest: current.rest,
      })
      const newState = initSessionSet(newEx, last)

      if (currentState.setsLog.length > 0) {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          setSwapError('กรุณาเข้าสู่ระบบใหม่')
          return
        }
        const result = await persistSets(current, currentState, user.id)
        if (result.setsError) {
          setSwapError('บันทึกท่าเดิมสำเร็จ แต่รายละเอียดทีละเซ็ตบันทึกไม่ครบ')
        }
        if (result.workoutId) await recordProgramCompletion(user.id, current, result.workoutId)
        markExerciseFinished(current.id)

        setStates((prev) => ({
          ...prev,
          [current.id]: { ...currentState, logged: true, workoutId: result.workoutId },
          [newEx.id]: newState,
        }))
        setExercises((prev) => {
          const next = [...prev]
          next.splice(index + 1, 0, newEx)
          return next
        })
        setIndex(index + 1)
      } else {
        // ยังไม่ได้ทำเซ็ตไหนเลย — ไม่มีอะไรต้องเก็บของท่าเดิม แทนที่ตรงตำแหน่งเดิมไปเลย
        setExercises((prev) => prev.map((ex, i) => (i === index ? newEx : ex)))
        setStates((prev) => {
          const next = { ...prev }
          delete next[current.id]
          next[newEx.id] = newState
          return next
        })
      }

      setSwapName('')
      setSwapDef(null)
      setShowSwapExercise(false)
    } catch (err) {
      setSwapError(`เปลี่ยนท่าไม่สำเร็จ: ${getErrorMessage(err)}`)
    } finally {
      setSwapping(false)
    }
  }

  // กด "ข้ามท่านี้" — ทำเครื่องหมายว่าท่านี้ถูกดูรอบนี้แล้ว (skipped) แยกจาก logged=false เฉยๆ
  // ที่แปลว่า "ยังไม่ถึงคิว" เพื่อไม่ให้ nextUnvisitedIndex วนกลับมาที่ท่านี้ซ้ำ
  function skipCurrent() {
    if (!current) return
    const merged = { ...states, [current.id]: { ...states[current.id], skipped: true } }
    setStates(merged)
    goNext(merged)
  }

  // หาท่าถัดไปที่ยังไม่ถูกบันทึก/ข้าม โดยวนรอบทั้ง array (ไม่ใช่แค่ +1 ตามตำแหน่งเดิม)
  // เพราะผู้ใช้อาจกด progress chips ข้ามไปทำท่าท้ายๆ ก่อน — ตำแหน่งใน array จึงไม่ได้แปลว่า
  // เป็นท่าสุดท้ายที่เหลือจริงๆ เซสชันจะจบก็ต่อเมื่อทุกท่าถูกบันทึกหรือข้ามไปหมดแล้วเท่านั้น
  function goNext(latestStates: Record<string, SessionSetState> = states) {
    const next = nextUnvisitedIndex(exercises, latestStates, index)
    if (next === null) {
      endSession()
    } else {
      setIndex(next)
    }
  }

  const loadSummaryExtras = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const loggedList = exercises
        .map((ex) => ({ ex, state: states[ex.id] }))
        .filter((e) => e.state?.logged)

      const durationMin = Math.round(totalElapsedMs / 60000)
      const { start: thisWeekStart, end: thisWeekEnd } = getWeekRange()
      const { start: lastWeekStart } = getPreviousWeekRange()

      const [{ data: latestMetric }, { data: priorRows }, { data: recentMuscleRows }, { data: twoWeeksRows }, { data: todayCardioRows }] =
        await Promise.all([
          supabase.from('body_metrics').select('weight_kg').order('measured_at', { ascending: false }).limit(1).maybeSingle(),
          // บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจค): เดิม query นี้ขาด .eq('user_id', user.id) ต่างจาก query อื่นที่
          // ทำหน้าที่คล้ายกันในไฟล์เดียวกัน (workoutRows บรรทัด ~257, priorWorkouts ~298, fetchLastPerformance
          // ~455 — ทุกจุดกรอง user_id หมด) — ถ้าชื่อท่าตรงกับผู้ใช้คนอื่นพอดี (ชื่อทั่วไปเช่น "Bench Press")
          // priorBest อาจไปดึงน้ำหนักของคนอื่นมาเทียบ ทำให้ตรวจ PR ของผู้ใช้นี้ผิดพลาดได้ — เพิ่ม filter ให้
          // ตรงกับ convention เดิมของไฟล์นี้
          loggedList.length > 0
            ? supabase
                .from('workouts')
                .select('exercise_name, weight_kg')
                .eq('user_id', user.id)
                .eq('type', 'strength')
                .lt('performed_at', todayStr())
                .in(
                  'exercise_name',
                  loggedList.map((e) => e.ex.exercise_name)
                )
            : Promise.resolve({ data: [] as { exercise_name: string; weight_kg: number | null }[] }),
          // บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจครอบใหม่): query นี้ก็ขาด .eq('user_id', user.id) เหมือนกับ priorRows
          // ด้านบน (แก้ไปแล้วครั้งก่อน แต่พลาดจุดนี้ — คนละ query แต่ทำหน้าที่คล้ายกันในไฟล์เดียวกัน) — ถ้า
          // กลุ่มกล้ามเนื้อเดียวกันมีคนอื่นเพิ่งฝึกไปเมื่อไม่นาน priorLastTrainedDate อาจไปดึงวันที่ของคนอื่น
          // มาคำนวณ % ฟื้นตัวในสรุปท้ายเซสชันผิดพลาดได้
          supabase
            .from('workouts')
            .select('muscle_group, performed_at')
            .eq('user_id', user.id)
            .eq('type', 'strength')
            .lt('performed_at', todayStr())
            .order('performed_at', { ascending: false })
            .limit(500),
          // สัปดาห์นี้เทียบสัปดาห์ที่แล้ว ต่อกลุ่มกล้ามเนื้อ — รูปแบบเดียวกับ fetchDashboardData ใน
          // DashboardView.tsx ทุกประการ (query เดียว ช่วง lastWeekStart..thisWeekEnd แล้วแยกด้วย
          // performed_at >= thisWeekStart) ให้ผลลัพธ์ volumeIncrease ตรงกับที่ Dashboard คำนวณเป๊ะ
          supabase
            .from('workouts')
            .select('muscle_group, sets, performed_at')
            .eq('type', 'strength')
            .gte('performed_at', lastWeekStart)
            .lte('performed_at', thisWeekEnd),
          // บั๊ก (เจอตอนไล่เช็คทั้งโปรเจค): estimateCaloriesToday เดิมได้ [] แทนคาร์ดิโอวันนี้เสมอ ทำให้
          // แคลอรี่สรุปท้ายเซสชันไม่นับคาร์ดิโอที่ log ไปก่อนหน้าในวันเดียวกันเลย (Dashboard ส่ง
          // data.todayWorkouts ซึ่งรวมคาร์ดิโอด้วยอยู่แล้ว) — เพิ่ม query คาร์ดิโอวันนี้แยกมาให้ครบ
          supabase.from('workouts').select('*').eq('type', 'cardio').eq('performed_at', todayStr()),
        ])

      const bodyWeightKg = (latestMetric as { weight_kg: number | null } | null)?.weight_kg ?? null
      const calories = estimateCaloriesToday((todayCardioRows as Workout[]) ?? [], durationMin, bodyWeightKg)

      const priorBest: Record<string, number> = {}
      ;((priorRows as { exercise_name: string; weight_kg: number | null }[]) ?? []).forEach((r) => {
        if (r.weight_kg === null) return
        priorBest[r.exercise_name] = Math.max(priorBest[r.exercise_name] ?? 0, r.weight_kg)
      })
      const prs: PRHit[] = loggedList
        .filter((e) => e.state.weightKg !== null && priorBest[e.ex.exercise_name] !== undefined)
        .filter((e) => (e.state.weightKg as number) > priorBest[e.ex.exercise_name])
        .map((e) => ({
          exerciseName: e.ex.exercise_name,
          weightKg: e.state.weightKg as number,
          deltaKg: Math.round(((e.state.weightKg as number) - priorBest[e.ex.exercise_name]) * 10) / 10,
        }))
        .sort((a, b) => b.deltaKg - a.deltaKg)

      const trainedToday = aggregateMuscleLoads(
        loggedList.map((e) => ({ muscleGroup: e.ex.muscle_group, sets: e.state.setsLog.length, rpe: e.state.rpe }))
      )
      const priorLastTrainedDate: Record<string, string | null> = {}
      const muscleRows = (recentMuscleRows as { muscle_group: string | null; performed_at: string }[]) ?? []
      RECOVERY_MUSCLES.forEach((mg) => {
        if (trainedToday[mg]) return
        priorLastTrainedDate[mg] = muscleRows.find((r) => r.muscle_group === mg)?.performed_at ?? null
      })
      const recovery = computeSessionMuscleRecovery(trainedToday, priorLastTrainedDate)

      const thisWeekSets: Record<string, number> = {}
      const lastWeekSets: Record<string, number> = {}
      ;((twoWeeksRows as { muscle_group: string | null; sets: number | null; performed_at: string }[]) ?? []).forEach((r) => {
        if (!r.muscle_group) return
        const bucket = r.performed_at >= thisWeekStart ? thisWeekSets : lastWeekSets
        bucket[r.muscle_group] = (bucket[r.muscle_group] ?? 0) + (r.sets ?? 0)
      })
      const volumeIncrease = computeBestVolumeIncrease(thisWeekSets, lastWeekSets)

      const avgRpe = computeSessionAvgRpe(loggedList.map((e) => ({ sets: e.state.setsLog.length, rpe: e.state.rpe })))
      const workoutScore = computeWorkoutScore({
        exerciseCount: loggedList.length,
        totalExercises: exercises.length,
        avgRpe,
        prCount: prs.length,
      })

      setSummaryExtras({ calories, prs, recovery, workoutScore, volumeIncrease })
    } catch {
      // สรุปเสริมพวกนี้เป็นของแถม — ถ้าโหลดไม่สำเร็จก็ยังโชว์ตัวเลขหลัก (เวลา/วอลุ่ม/เซ็ต) ได้ตามปกติ
    } finally {
      setSummaryLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, exercises, states, totalElapsedMs])

  useEffect(() => {
    if (phase === 'done' && !summaryExtras && !summaryLoading) {
      loadSummaryExtras()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Priority 5 — "Update Analytics": เดิม Dashboard เห็นเซสชันที่เพิ่งจบเป็นเพราะปุ่ม "กลับหน้าแรก" ใช้
  // <a href> ธรรมดา (hard reload บังเอิญล้าง QueryClient ทั้งก้อน) ไม่ใช่ความตั้งใจ — ถ้าผู้ใช้กด "แชร์"
  // แล้วย้อนกลับ หรือกดลิงก์ "ดูประวัติทั้งหมด" แทน ก็จะไม่มีอะไรสั่ง refetch เลย ทำให้ Dashboard
  // ค้างข้อมูลเก่าถ้ากลับไปดูใน 30s (staleTime) โดยไม่รีเฟรชเต็มหน้า — invalidate ตรงๆ ทันทีที่เซสชันจบ
  //
  // ฟีดแบ็ก (design review) "Recovery การ์ดบอก 'ตามตารางคือขา แต่ Volume สัปดาห์นี้เกินเป้าหมายแล้ว' ทั้งที่
  // Weekly Sets ยังโชว์ '16/18 89%'" — ตรวจแล้วไม่ใช่บั๊ก threshold/สูตร (isOverTarget กับ volumeStatus ตัด
  // "ถึงเป้า" ที่จุดเดียวกันเป๊ะ) แต่เป็นเพราะ WeeklyVolume.tsx ยิง query ของตัวเองแยกต่างหาก
  // (['weekly-volume', start, end], staleTime 60s) ไม่ใช่ query เดียวกับ ['dashboard'] ที่ใช้คำนวณ
  // Recovery/MINT Coach/Insight — เดิม invalidate แค่ ['dashboard'] ตอนจบ session ทำให้ Recovery เห็นเลข
  // ใหม่ทันทีแต่ Weekly Sets ยังค้างเลขเก่าได้นานถึง 60 วินาที เกิดภาพขัดแย้งกันชั่วคราว — เพิ่ม
  // ['weekly-volume'] เข้าไป invalidate คู่กันตรงนี้ด้วย ให้ทั้งสองการ์ดรีเฟรชพร้อมกันเสมอ
  useEffect(() => {
    if (phase === 'done') {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['weekly-volume'] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  async function shareSession() {
    const summary = computeSessionSummary(
      Object.values(states)
        .filter((s) => s.logged)
        .map((s) => ({ setsLog: s.setsLog }))
    )
    const skipped = getSkippedExercises(exercises, states)
    const lines = [
      `🏋️ ${day?.title ?? 'Workout'} เสร็จแล้ว!`,
      noLiveDuration
        ? `${summary.exerciseCount}/${exercises.length} ท่า · ${summary.totalSets} เซ็ต`
        : `⏱ ${formatClock(totalElapsedMs)} · ${summary.exerciseCount}/${exercises.length} ท่า · ${summary.totalSets} เซ็ต`,
    ]
    if (summary.totalVolumeKg > 0) lines.push(`💪 วอลุ่มรวม ${Math.round(toDisplay(summary.totalVolumeKg)).toLocaleString()} ${unit}`)
    if (skipped.length > 0) lines.push(`⏭️ ข้ามไป: ${skipped.map((s) => s.exerciseName).join(', ')}`)
    if (summaryExtras?.prs.length) {
      lines.push(`🏆 PR ใหม่: ${summaryExtras.prs[0].exerciseName} +${format(summaryExtras.prs[0].deltaKg)}`)
    }
    const text = lines.join('\n')

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text })
      } catch {
        // ผู้ใช้กดยกเลิก share sheet — ไม่ต้องแจ้งอะไร
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      setShareMsg('คัดลอกสรุปแล้ว')
      setTimeout(() => setShareMsg(null), 2000)
    }
  }

  if (phase === 'loading') {
    return <LoadingState message="กำลังเตรียมเซสชัน..." />
  }

  if (phase === 'error') {
    return <ErrorState title="เปิดเซสชันไม่สำเร็จ" message={errorMsg ?? undefined} onRetry={load} />
  }

  if (phase === 'empty') {
    return (
      // เดิม border-dashed สื่อความหมาย "ว่างเปล่า/ยังไม่ตั้งค่า" — PremiumCard ตัด border ทึบออกแล้ว
      // (v48: ใช้ contact shadow บอกขอบแทน) ส่ง border ทับผ่าน style (ชนะ default ของ PremiumCard เพราะ
      // ...style วางท้ายสุดเสมอ) แทนที่จะพึ่ง className ซึ่งชนะ inline style ของ PremiumCard ไม่ได้
      <PremiumCard className="px-4 py-10 text-center space-y-3" style={{ border: `1px dashed ${CARD_BORDER_CSS}` }}>
        <p className="text-sm text-muted">ยังไม่มีโปรแกรมตั้งไว้สำหรับวันนี้ เลยเริ่มเซสชันไม่ได้</p>
        <div className="flex gap-2 justify-center">
          <a href="/program" className="text-xs font-display tracked uppercase text-bg bg-amber rounded-lg px-4 py-2 inline-block">
            ไปตั้งโปรแกรม
          </a>
          <a href="/log" className="text-xs font-display tracked uppercase text-ink border border-line rounded-lg px-4 py-2 inline-block">
            บันทึกอิสระแทน
          </a>
        </div>
      </PremiumCard>
    )
  }

  if (phase === 'makeupCheckpoint') {
    // ฟีดแบ็ก (live-test, product decision — ดู comment เต็มที่ makeupCheckpointOtherDay state และจุด
    // ตรวจใน load() ด้านบน) — semantic contract: START WORKOUT (BottomNav) แปลว่า "เข้าสู่ workout flow
    // ของวันนี้" ไม่ใช่ "ต้องเริ่มฝึกทันที" หน้านี้คือจุดที่ /session หยุดถามยืนยันก่อนเข้า active จริง
    // เฉพาะเคสเดียว: ฝึกแผนอื่นจบไปแล้ววันนี้ + แผนวันนี้เองยังไม่เริ่มเลย — คำที่ใช้ต้องเป็นข้อเท็จจริงล้วนๆ
    // ("Day 2 — Pull ยังไม่ได้เริ่ม") ไม่ใช่คำถามชวน ("ต้องการฝึกอีกครั้งไหม?") เพราะจะฟังเหมือนระบบชวนฝึกซ้ำ
    // — ให้ผู้ใช้ตัดสินใจเองด้วยปุ่ม "เริ่ม Day 2" (ไม่ encourage ≠ ไม่ allow)
    return (
      <div className="space-y-5 text-center py-6">
        <div>
          <p className="text-4xl" aria-hidden="true">
            ✓
          </p>
          <p className="font-display text-lg tracked uppercase text-ink mt-2">วันนี้ฝึกแล้ว</p>
          {makeupCheckpointOtherDay && (
            <p className="text-sm text-muted mt-1">
              {splitTitleDetail(makeupCheckpointOtherDay.title).main} · แผนชดเชย
            </p>
          )}
        </div>
        <div className="border-t border-line" />
        {day && (
          <div>
            <p className="font-display text-lg tracked uppercase text-ink">{splitTitleDetail(day.title).main}</p>
            <p className="text-sm text-muted mt-1">ยังไม่ได้เริ่ม</p>
          </div>
        )}
        <div className="flex gap-2 justify-center pt-2">
          <Button type="button" onClick={() => setPhase('active')} size="md">
            เริ่ม {day ? splitTitleDetail(day.title).main : 'แผนวันนี้'}
          </Button>
          <Button as="a" href="/dashboard" variant="secondary" size="md">
            กลับหน้าแรก
          </Button>
        </div>
      </div>
    )
  }

  if (phase === 'smartStart') {
    // ฟีดแบ็ก (product decision — "Smart Start") ดู comment เต็มที่จุดตรวจใน load() — คนละเคสกับ
    // makeupCheckpoint (นั่นคือ "ฝึกแผนอื่นจบไปแล้ววันนี้" ส่วนนี้คือ "มีแผนจากวันก่อนในสัปดาห์นี้ที่ยังไม่
    // เคยแตะเลย ไม่ใช่แค่วันนี้") — Day 2 (แผนวันนี้) เป็นตัวเลือก primary เสมอ เพราะผู้ใช้ที่กด START
    // WORKOUT มี intent ชัดว่า "จะฝึกตอนนี้" ไม่ใช่ MINT Coach/ระบบมาตัดสินแทนว่าควรทำแผนไหนก่อน (นั่นเป็น
    // หน้าที่ของคำแนะนำใน AICoachCompactCard.tsx ต่างหาก ซึ่งเป็น suggestion ไม่ใช่ gate) — แผนที่พลาดเป็น
    // ปุ่มรอง (secondary link ไม่ใช่ปุ่มเด่นเท่ากัน) กดแล้ว navigate ไป /session?day=<id> ของแผนนั้นตรงๆ
    //
    // v2: ฟีดแบ็ก (live-test screenshot, P0) "ปุ่ม 'เริ่มวันนี้' glow แรงเกินไป (ดูเป็น Gaming UI มากกว่า
    // Fitness App) — ลดเหลือ ~60-70% ของ glow ปัจจุบัน ให้เป็น gradient+soft shadow แทน gradient+strong
    // glow" — ลด alpha ของทุกชั้นใน AMBER_GLOW_SHADOW ลง ~35% เฉพาะปุ่มนี้ (ไม่แตะ token กลาง — เหตุผล
    // เดียวกับ BOTTOM_NAV_GLOW_SHADOW ใน BottomNav.tsx: AMBER_GLOW_SHADOW ใช้ร่วมหลายจุด (Button.tsx
    // ทุกปุ่ม primary, DashboardView.tsx, SidebarNav.tsx) แก้ตรงนั้นจะกระทบทุกจุดที่ไม่ได้ถูกร้องขอ) เสริม
    // soft drop shadow เบาๆ ให้ปุ่มดู "ลอย" แบบพรีเมียมแทนดู "เรืองแสง"
    const smartStartCtaShadow =
      '0 4px 14px rgba(0,0,0,.28), 0 0 2px rgba(255,255,255,.4), 0 0 8px rgba(255,210,120,.4), 0 0 22px rgba(255,150,20,.23), 0 0 60px rgba(255,130,0,.08)'
    // v2 (P0): ฟีดแบ็ก "ปุ่มใหญ่ แต่ผู้ใช้ยังไม่รู้ว่าวันนี้ต้องทำอะไร — เพิ่มบรรทัด Exercises · Sets ใต้ปุ่ม"
    // — exercises/day ถูก set ไว้ก่อนหน้าจุดตรวจ smartStart ใน load() แล้ว (ดู setDay/setExercises ด้านบน)
    // จึงเป็นข้อมูลของแผนวันนี้ล้วนๆ ไม่ใช่ของแผนที่พลาด
    // v5 (Final Polish): ฟีดแบ็ก "หน้านี้เป้าหมายหลักคือให้ตัดสินใจเริ่ม ไม่ใช่วางแผนเวลา — ตัด ~นาที ออก
    // เพราะไม่แม่น (เวลาพักแต่ละคนต่างกัน) เหลือแค่ 6 ท่า · 18 เซ็ต ก็บอกขนาดของ workout ได้ตรงกว่าแล้ว
    // ลด visual noise ใต้ CTA" — เอา estimatedMinutes ออก ไม่ใช้สูตรนี้อีกที่นี่ (ยังคงอยู่ใน
    // DashboardView.tsx ตามเดิม จุดนั้นไม่ได้ถูกร้องขอให้แก้)
    const smartStartTotalSets = exercises.reduce((sum, ex) => sum + (ex.sets ?? 0), 0)
    // v4 (Final Polish): ฟีดแบ็ก "เพิ่ม subtle information เช่น 'Pull • Back / Biceps' ใต้ชื่อ Day 2 ให้
    // ผู้ใช้เข้าใจ workout โดยไม่ต้องกดเข้าไป" — reuse splitTitleDetail (ตัวเดียวกับ TodaysFocusCard.tsx)
    // แกะรายละเอียดในวงเล็บของ day.title ตรงๆ ไม่คิด parser ใหม่แยก — ถ้า title ไม่มีวงเล็บ (ไม่มี detail)
    // แค่ไม่โชว์บรรทัดนี้เฉยๆ ไม่กระทบอะไร
    const { main: smartStartDayTitle, detail: smartStartDayDetail } = splitTitleDetail(day?.title ?? '')
    return (
      // v2 (P1): ฟีดแบ็ก "หัวข้อ DAY 2 ชิด status bar ไป เพิ่ม padding บนอีก 8-12px" — pt-3 เพิ่มเฉพาะจอนี้
      // (ไม่แตะ pt-5 ที่ app/(app)/layout.tsx ให้ทุกหน้าอยู่แล้ว เพราะจะกระทบทุกหน้าทั่วแอป ไม่ใช่แค่จอนี้)
      <div className="space-y-5 text-center py-6 pt-3 max-w-xs mx-auto">
        {day && (
          <div>
            {/* v4 (Final Polish): ฟีดแบ็ก "เพิ่ม label เล็กๆ TODAY เหนือ Day 2 ช่วยให้ scan ได้เร็วขึ้น" */}
            <p className="text-[10px] font-display tracked uppercase text-muted">TODAY</p>
            <p className="font-display text-lg tracked uppercase text-ink mt-1">{smartStartDayTitle}</p>
            {/* v6 (Final Polish): ฟีดแบ็ก "'แผนวันนี้' กับ 'Back-focused' ซ้ำหน้าที่กันเล็กน้อย ตอนนี้ TODAY
                (eyebrow ด้านบน) ทำหน้าที่บอก 'นี่คือวันนี้' ไปแล้ว ตัด 'แผนวันนี้' ออกไปเลย ดู premium/
                confident กว่า" — ลบ subtitle "แผนวันนี้" ทิ้ง เหลือแค่ TODAY -> ชื่อวัน -> muscle detail */}
            {smartStartDayDetail && <p className="text-xs text-muted mt-1">{smartStartDayDetail}</p>}
            <Button
              type="button"
              onClick={() => setPhase('active')}
              size="md"
              className="mt-3 w-full"
              style={{ boxShadow: smartStartCtaShadow }}
            >
              เริ่มวันนี้ <span aria-hidden="true">→</span>
            </Button>
            {/* v3 (Final Polish): ฟีดแบ็ก "ระยะห่างระหว่าง CTA กับ Metadata ดูค่อนข้างน้อย อยากให้แยกกลุ่ม
                ชัดขึ้น +4-6px" — mt-2 (8px) -> mt-3.5 (14px, +6px) */}
            <p className="text-xs text-muted mt-3.5">
              {exercises.length} ท่า · {smartStartTotalSets} เซ็ต
            </p>
          </div>
        )}
        {smartStartMissedDay && (
          <>
            <div className="border-t border-line" />
            {/* v2 (P1): ฟีดแบ็ก "ทำ 'มีแผนที่พลาด' เป็น subtle card แทนลอยบนพื้นดำตรงๆ — พื้นหลังเข้ม
                (~#151515) + border บางมาก ไม่ต้องใหญ่/เส้นขอบชัด"
                v3 (Final Polish): "Card อาจสูงไปนิด มีแค่ 3 บรรทัด ลดความสูงลง ~8-12px ให้รู้สึกเป็น
                secondary information มากขึ้น" — py-3.5 (14px) -> py-2.5 (10px), ลด 8px รวม (4px ต่อด้าน)
                v4 (Final Polish): "ยังใหญ่เกินความสำคัญของ secondary action — ลดความสูงอีก ~20-25%" —
                padding py-2.5 -> py-2, ป้ายหัวข้อ/ลิงก์ลดจาก text-sm -> text-xs (เหลือแค่ชื่อแผนที่พลาด
                ที่ยังเป็น text-sm เพราะเป็นข้อมูลจำเป็นต่อการตัดสินใจ), ระยะห่างภายในบีบลง (mt-1 -> mt-0.5,
                mt-2 -> mt-1)
                v6 (Final Polish): "ยังมีพื้นที่ว่างบน/ล่างค่อนข้างเยอะ ลดอีก ~10-15%" — padding py-2 ->
                py-1.5, leading-tight ทุกบรรทัดกันบรรทัดสูงเกินจำเป็น, ระยะห่างภายในบีบอีก (mt-0.5 -> mt-0,
                mt-1 -> mt-0.5) */}
            <div
              className="rounded-2xl px-4 py-1.5"
              style={{ background: '#151515', border: `1px solid ${CARD_BORDER_CSS}` }}
            >
              <p className="text-xs text-muted leading-tight flex items-center justify-center gap-1.5">
                <span aria-hidden="true">↩</span> มีแผนที่พลาด
              </p>
              <p className="text-sm text-ink leading-tight mt-0">
                {splitTitleDetail(smartStartMissedDay.title).main} · {WEEKDAYS[smartStartMissedDay.day_of_week]}
              </p>
              <a href={`/session?day=${smartStartMissedDay.id}`} className="text-xs leading-tight mt-0.5 inline-block hover:underline" style={{ color: COLORS.amber }}>
                ชดเชยแทน <span aria-hidden="true">→</span>
              </a>
            </div>
          </>
        )}
      </div>
    )
  }

  if (phase === 'done') {
    const summary = computeSessionSummary(
      Object.values(states).filter((s) => s.logged).map((s) => ({ setsLog: s.setsLog }))
    )
    const skipped = getSkippedExercises(exercises, states)
    return (
      // lg:max-w-md lg:mx-auto — เดิมหน้านี้ไม่มี cap เลย (ต่างจาก branch เล่นเซสชันจริงด้านล่างที่มี
      // lg:max-w-5xl ของตัวเอง) ปล่อยให้ยืดเต็มความกว้าง desktop จะดูแปลกเพราะเนื้อหาเป็น "การ์ดสรุปจบ
      // เซสชัน" ทรง mobile ไม่ใช่หน้า analytics ที่ควรใช้พื้นที่กว้าง
      <div className="space-y-5 text-center py-4 lg:max-w-md lg:mx-auto">
        {/* Hero — reuse login-hero.png/mobile (นักกีฬาถือดัมเบล + เส้นแสงอำพัน) ตัวเดียวกับหน้า login แทน
            การหารูปสต็อกใหม่ อยู่ในธีม Dark Titanium + Amber ของแอปอยู่แล้ว — gradient มืดทับให้ตัวหนังสือ
            อ่านง่าย เหมือน pattern เดียวกับ hero ของ /stats/report */}
        <div className="relative overflow-hidden rounded-card -mx-4 -mt-4 sm:mx-0 sm:mt-0">
          <div className="absolute inset-0" aria-hidden="true">
            <Image
              src="/images/login-hero-mobile.png"
              alt=""
              fill
              className="object-cover sm:hidden"
              style={{ objectPosition: '50% 30%', filter: 'brightness(0.75)' }}
            />
            <Image
              src="/images/login-hero.png"
              alt=""
              fill
              className="object-cover hidden sm:block"
              style={{ objectPosition: '50% 35%', filter: 'brightness(0.75)' }}
            />
            <div
              className="absolute inset-0"
              style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 30%, transparent 0%, rgba(11,11,11,.55) 55%, #0B0B0B 100%)' }}
            />
          </div>
          <div className="relative px-4 py-8">
            <p className="text-5xl" style={{ filter: 'drop-shadow(0 0 18px rgba(255,138,0,.45))' }}>
              🎉
            </p>
            <p className="font-display text-2xl tracked uppercase text-ink mt-2">เซสชันเสร็จแล้ว</p>
            <p className="text-xs text-muted mt-1">{day?.title}</p>
            {/* แท็กไลน์ — ฟีดแบ็ก "อยากได้ภาษาอังกฤษสไตล์เดียวกับรูปที่ให้ Manus ทำ" เปลี่ยนจากภาษาไทยเดิม
                (แข็งแกร่งกว่าเมื่อวาน) เป็นภาษาอังกฤษตรงตามคำขอรอบนี้ — font-serif italic + สีขาวครีม
                (text-ink) แทน uppercase amber เดิม ให้ดูเป็นคำโปรยสไตล์ภาพถ่าย ไม่ใช่ label ข้อมูล */}
            <p className="font-serif italic text-sm text-ink mt-3">Stronger Than Yesterday</p>
          </div>
        </div>

        {/* Version 4 (Motivational/Premium) — รวม 5 สถิติเข้าการ์ดใบเดียว คั่นด้วยเส้นบางๆ แทนที่จะเป็น
            การ์ดแยก 5 ใบเรียงกัน (ของเดิม) เส้นขอบ+glow อำพันบางๆ ให้เข้าธีมเดียวกับ hero ด้านบน */}
        <PremiumCard className="p-4 space-y-4" style={{ border: `1px solid ${withAlpha(COLORS.amber, '25')}`, boxShadow: `0 0 24px ${withAlpha(COLORS.amber, '0d')}` }}>
          <div className="grid grid-cols-3 gap-2.5">
            {/* ดู comment ที่ noLiveDuration state ด้านบนของไฟล์ — "00:00" สื่อว่าใช้เวลาศูนย์นาทีจริง ทั้งที่
                จริงๆ คือไม่เคยมี stopwatch ให้นับเลย ใช้ "–" (เครื่องหมายเดียวกับที่วอลุ่มรวม/แคลอรี่ข้างล่าง
                ใช้อยู่แล้วเวลาไม่มีข้อมูล) แทนให้สื่อความหมายตรงกับความจริง */}
            <GlowStatCell
              bare
              icon={<ClockIcon />}
              color={COLORS.amber}
              value={noLiveDuration ? '–' : formatClock(totalElapsedMs)}
              label="เวลาที่ใช้"
            />
            {/* hero — ฟีดแบ็ก "7/39 ควรเป็นพระเอกเพราะอธิบาย session นี้ได้ดีที่สุด" — caption ใช้
                skipped.length ที่มีอยู่แล้ว (ประกาศไว้ที่ต้นฟังก์ชัน) ไม่ใช่ตัวเลขใหม่ */}
            <GlowStatCell
              bare
              emphasis="hero"
              icon={<DumbbellIcon />}
              color={COLORS.steel}
              value={`${summary.exerciseCount}/${exercises.length}`}
              label="ท่าที่ทำ"
              caption={skipped.length > 0 ? `${skipped.length} ท่าข้าม` : undefined}
            />
            <GlowStatCell bare icon={<CheckIcon />} color={COLORS.moss} value={String(summary.totalSets)} label="เซ็ตรวม" />
          </div>

          <div className="border-t" style={{ borderColor: NEUTRAL.chipInactive }} />

          <div className="grid grid-cols-2 gap-2.5">
            <GlowStatRow
              bare
              icon={<FlameIcon />}
              color={COLORS.cyan}
              value={summary.totalVolumeKg > 0 ? Math.round(toDisplay(summary.totalVolumeKg)).toLocaleString() : '–'}
              label={`วอลุ่มรวม (${unit})`}
            />
            {/* ฟีดแบ็ก (design review) "0 kcal ดูเหมือนระบบคำนวณแล้วพบว่าเผาผลาญ 0 จริง ทั้งที่ไม่น่าเป็นไปได้
                สำหรับ workout 66 นาที" — estimateCaloriesToday() (lib/dashboardStats.ts) รวม cardioKcal
                (จากข้อมูลคาร์ดิโอจริงถ้ามี) + strengthKcal (0 ถ้าไม่มี duration ให้อ้างอิง — ดู noLiveDuration
                ด้านบน) ผลรวมเป็น 0 จริงๆ เฉพาะตอนไม่มีทั้งคาร์ดิโอและ duration ที่เชื่อถือได้เลย ไม่ใช่บั๊ก
                การคำนวณ แต่ "0 kcal" สื่อความหมายผิด — โชว์ "–" แทนเฉพาะตอนผลลัพธ์เป็น 0 เป๊ะ (ไม่กระทบตอนมี
                คาร์ดิโอจริงที่ทำให้ผลรวม > 0) */}
            {/* muted — ฟีดแบ็ก "6 kcal ควรลดความสำคัญลง เพราะเป็นค่าประมาณและ session สั้นมาก" */}
            <GlowStatRow
              bare
              emphasis="muted"
              icon={<BoltIcon />}
              color={COLORS.green}
              value={summaryLoading ? '…' : summaryExtras && summaryExtras.calories > 0 ? `${summaryExtras.calories} kcal` : '–'}
              label="แคลอรี่ (ประมาณ)"
            />
          </div>
        </PremiumCard>

        {/* Priority 5 — เดิมหน้านี้ไม่มีคะแนนสรุปเซสชันหรือบรรทัดเทียบกับสัปดาห์ที่แล้วเลย มีแค่ตัวเลขดิบ
            (เวลา/ท่า/เซ็ต/วอลุ่ม/แคลอรี่) — เพิ่ม Workout Score (lib/workoutSession.ts) และ volume-trend
            ของกลุ่มกล้ามเนื้อที่เพิ่มขึ้นเด่นสุดสัปดาห์นี้ (เอนจินเดิม computeBestVolumeIncrease ที่ใช้ทำ
            greeting บน Dashboard อยู่แล้ว ไม่ได้สร้างสูตรใหม่) */}
        {summaryExtras && (
          // Version 4 — เปลี่ยนจากกรอบเทาเรียบๆ (bg-surface2 border-line) เป็นกรอบ+glow อำพันแบบเดียวกับ
          // การ์ด "สถิติใหม่"/hero ด้านบน ให้การ์ดนี้อ่านเป็น "ความสำเร็จ" ไม่ใช่แค่กล่องข้อมูลรอง — เปลี่ยน
          // ไอคอน ⭐ เป็น 🏆 ให้เข้าธีมเดียวกับการ์ด PR ด้านล่างที่ใช้ 🏆 อยู่แล้ว (ทั้งคู่เป็น "ความสำเร็จ")
          <div
            className="rounded-lg px-4 py-3 text-left space-y-1"
            style={{ background: withAlpha(COLORS.amber, '0a'), border: `1px solid ${withAlpha(COLORS.amber, '30')}` }}
          >
            <p className="text-[12px] tracked uppercase text-muted">ไฮไลท์เซสชันนี้</p>
            {(() => {
              const tier = workoutScoreTier(summaryExtras.workoutScore)
              return (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs">🏆</span>
                    <span className="font-mono text-lg text-ink">{summaryExtras.workoutScore}</span>
                    <span className="text-[12px]" style={{ color: tier.color }}>
                      {tier.label}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${summaryExtras.workoutScore}%`, background: tier.color }} />
                  </div>
                  {/* เหตุผลสั้นๆ ว่า "ทำไมได้คะแนนนี้" — ประกอบจากตัวเลขที่มีอยู่แล้วบนหน้านี้ (skipped.length,
                      summary.exerciseCount/exercises.length) ไม่ใช่สูตรคำนวณใหม่ แค่แปลตัวเลขเป็นประโยค
                      (ฟีดแบ็ก "35 ดูเหมือนคะแนนต่ำที่โยนมาเฉยๆ ต้องเล่าเรื่องว่าทำไม") */}
                  {skipped.length > 0 && (
                    <p className="text-[12px] text-muted mt-1">
                      ข้ามท่าไป {skipped.length} ท่า · ทำได้ {summary.exerciseCount}/{exercises.length} ท่าตามแผน
                    </p>
                  )}
                </>
              )
            })()}
            {/* ฟีดแบ็ก (จากรอบตรวจบั๊กทั้งโปรเจครอบใหม่, "Terminology") "Volume ทั้งที่ engine
                (computeBestVolumeIncrease) คำนวณจากจำนวนเซ็ต ไม่ใช่ kg-volume จริง" — HighlightsRow.tsx
                (Dashboard) ใช้ engine เดียวกันนี้แล้วเลี่ยงคำว่า Volume ไปแล้ว ("X เพิ่มขึ้นจากสัปดาห์ก่อน")
                ปรับข้อความจุดนี้ให้ตรงกัน */}
            {summaryExtras.volumeIncrease && (
              <p className="text-xs text-ink">
                🔥 {summaryExtras.volumeIncrease.muscleGroup} เพิ่มขึ้นจากสัปดาห์ก่อน{' '}
                <span className="font-mono text-moss">+{summaryExtras.volumeIncrease.pct}%</span>
              </p>
            )}
          </div>
        )}

        {skipped.length > 0 && <SkippedExercisesCard skipped={skipped} />}

        {summaryExtras && summaryExtras.prs.length > 0 && (
          <div className="rounded-lg bg-surface2 border border-amber/30 px-4 py-3 text-left space-y-1">
            <p className="text-[12px] tracked uppercase text-amber">🏆 สถิติใหม่</p>
            {summaryExtras.prs.slice(0, 2).map((pr) => (
              <p key={pr.exerciseName} className="text-xs text-ink">
                {pr.exerciseName} <span className="text-amber font-mono">+{format(pr.deltaKg)}</span>
              </p>
            ))}
            {summaryExtras.prs.length > 2 && (
              <p className="text-[12px] text-muted">และอีก {summaryExtras.prs.length - 2} ท่า</p>
            )}
          </div>
        )}

        {summaryLoading && !summaryExtras && (
          <p className="text-xs text-muted">กำลังประเมินความพร้อมสำหรับครั้งถัดไป...</p>
        )}

        {summaryExtras && (
          // Version 4 — ฟีดแบ็ก "section นี้ 'มีของ' ที่สุด ควรยกระดับเป็นพระเอกของหน้า" ยก glow border
          // เดียวกับการ์ด Highlight/hero ด้านบนมาใช้ + เปลี่ยนจาก icon chip รายกล้ามเนื้อเป็นจุดสีตาม tier
          // (🟢🟡🟠🔴) อ่านเร็วกว่าต้องไล่อ่าน % ทีละแถว + เรียงจากพร้อมมากไปน้อยแทนลำดับ enum เดิม
          <PremiumCard
            className="px-4 py-4 text-left space-y-3"
            style={{ border: `1px solid ${withAlpha(COLORS.amber, '20')}`, boxShadow: `0 0 20px ${withAlpha(COLORS.amber, '08')}` }}
          >
            <div className="flex items-center justify-between">
              <p className="text-[12px] tracked uppercase text-muted">ความพร้อมกล้ามเนื้อโดยรวม</p>
              {summaryExtras.recovery.overall !== null ? (
                <div className="flex flex-col items-center">
                  <ProgressRing value={summaryExtras.recovery.overall} size={46} strokeWidth={5} gradientStops={ringStopsForPct(summaryExtras.recovery.overall)}>
                    <span className="font-mono text-xs text-ink">{summaryExtras.recovery.overall}%</span>
                  </ProgressRing>
                  <p className="text-[10px] tracked uppercase text-muted mt-0.5">พร้อม</p>
                </div>
              ) : (
                <span className="text-xs text-muted">ยังไม่มีข้อมูล</span>
              )}
            </div>
            <div className="space-y-2.5">
              {[...summaryExtras.recovery.byMuscle]
                .sort((a, b) => b.pct - a.pct)
                .map((m) => (
                  <MuscleReadinessRow key={m.muscleGroup} muscleGroup={m.muscleGroup} pct={m.pct} tier={m.tier} />
                ))}
            </div>
            {/* คำแนะนำสั้นๆ — เลือกกล้ามเนื้อที่ยังไม่พร้อม (tier red/orange) สูงสุด 2 กลุ่มจาก byMuscle ที่มี
                อยู่แล้ว ไม่ใช่ query/สูตรใหม่ — ไม่มีเลยไม่โชว์เลย (ไม่เดาคำแนะนำเชิงบวกให้เพิ่ม) */}
            {(() => {
              const notReady = summaryExtras.recovery.byMuscle
                .filter((m) => m.tier === 'red' || m.tier === 'orange')
                .sort((a, b) => a.pct - b.pct)
                .slice(0, 2)
                .map((m) => m.muscleGroup)
              if (notReady.length === 0) return null
              return (
                <p className="text-xs text-ink">
                  💡 วันนี้ควรเลี่ยง{notReady.join('และ')} เพราะยังฟื้นตัวไม่เต็มที่
                </p>
              )
            })()}
            <p className="text-[12px] text-muted/70">
              ประเมินจากการฝึกและการฟื้นตัวล่าสุด
              <br />
              ยังไม่รวมข้อมูลการนอน
            </p>
          </PremiumCard>
        )}

        {shareMsg && <p className="text-xs text-amber">{shareMsg}</p>}
        {errorMsg && <p className="text-xs text-rusttext">{errorMsg}</p>}

        <div className="flex gap-2 pt-2">
          {/* v52: ฟีดแบ็ก "หน้าอื่นควรอิงภาษาเดียวกับ Dashboard" — เดิม bg-amber เรียบๆ ไม่มี glow
              เปลี่ยนมาใช้ Button component กลาง (Phase 2) ให้ตรงกับปุ่ม CTA หลักทั่วแอปแล้ว */}
          <Button as="a" href="/dashboard" size="md" className="flex-1">
            กลับหน้าแรก
          </Button>
          <button
            type="button"
            onClick={shareSession}
            className="flex-1 rounded-lg border border-line text-ink font-display tracked uppercase py-3 text-sm active:scale-[0.99] transition"
          >
            แชร์
          </button>
        </div>
        <a href="/history" className="block text-[12px] text-muted hover:text-amber transition">
          ดูประวัติทั้งหมด
        </a>
      </div>
    )
  }

  if (!current || !currentState) return null

  const mg = (current.muscle_group as MuscleGroup) ?? null
  const mgColor = mg ? MUSCLE_GROUP_COLORS[mg] : undefined
  // Live Coach — % ฟื้นตัวของกล้ามเนื้อที่กำลังเล่นอยู่ตอนนี้ (ดู comment ที่ priorLastTrainedDate state)
  const currentRecoveryPct = mg ? computeRecoveryPct(priorLastTrainedDate[mg] ?? null, mg) : null
  const currentRecoveryTier = currentRecoveryPct !== null ? recoveryTier(currentRecoveryPct) : null
  const setsRemaining = Math.max(0, targetSets - currentState.setsLog.length)
  const knownExercise = findExerciseByName(exerciseLibrary, current.exercise_name)
  // ฟีดแบ็ก "Session Volume รวม (X/Y sets) โชว์สดข้าง timer ระหว่างเล่น ไม่ใช่แค่ตอนจบ" — เดิม
  // totalSets (computeSessionSummary) คำนวณแค่ตอน done summary เท่านั้น ที่นี่รวมเองสดๆ จาก exercises/
  // states ที่มีอยู่แล้วในหน้านี้ (ไม่ query เพิ่ม) — เป้าหมายรวมใช้ ex.sets ?? 3 ตัวเดียวกับ targetSets
  // ของท่าปัจจุบันด้านบน (และ makeAdhocExercise ที่ default 3 เหมือนกัน) ไม่คิดค่า default แยกใหม่
  const sessionTargetSets = exercises.reduce((sum, ex) => sum + (ex.sets ?? 3), 0)
  const sessionLoggedSets = exercises.reduce((sum, ex) => sum + (states[ex.id]?.setsLog.length ?? 0), 0)

  return (
    <div className="lg:max-w-5xl lg:mx-auto lg:grid lg:grid-cols-[1fr_280px] lg:gap-6 lg:items-start">
      <div className="space-y-4">
      {/* ฟีดแบ็ก "ป่วยวันจันทร์ หายป่วยวันพุธ อยากทำแผนจันทร์ชดเชย" — เซสชันชดเชย (เข้ามาผ่าน ?day=<id> ที่
          ไม่ตรงกับวันจริงตามปฏิทินวันนี้) ต้องบอกผู้ใช้ตรงๆ ว่ากำลังทำแผนของวันไหนอยู่ กันสับสนกับแผนจริง
          ของวันนี้ (ซึ่งยังคงอยู่ครบ ไม่ได้ถูกแทนที่ — ดูรายละเอียดที่ program_day_id ใน persistSets) */}
      {isMakeupSession && day && (
        <div
          className="rounded-md px-3 py-2 flex items-center gap-2"
          style={{ backgroundColor: withAlpha(COLORS.amber, '14'), border: `1px solid ${withAlpha(COLORS.amber, '33')}` }}
        >
          <span className="text-xs shrink-0" aria-hidden="true">🔁</span>
          <p className="text-[12px] text-muted">
            <span className="text-amber font-medium">โหมดชดเชย</span> — กำลังทำแผน &quot;{day.title}&quot; (ปกติตรงกับวัน
            {' '}{WEEKDAYS[day.day_of_week]}) บันทึกด้วยวันที่จริงวันนี้
          </p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-[12px] tracked uppercase text-muted">
          ท่าที่ <span className="text-ink font-mono">{index + 1}</span>/{exercises.length}
          {/* ฟีดแบ็ก "Session Volume รวม โชว์สดระหว่างเล่น" — ต่อท้ายบรรทัดเดิมด้วย " · " คั่น ไม่เพิ่ม
              บรรทัดใหม่ กันดันความสูงแถบบนที่ tune มาแล้ว */}
          <span className="text-muted"> · </span>
          <span className="font-mono">
            {sessionLoggedSets}/{sessionTargetSets}
          </span>{' '}
          เซ็ต
        </p>
        <div className="flex items-center gap-3">
          {/* Product Audit /session — ฟีดแบ็ก "WeightUnitToggle เดิมอยู่คั่นกลาง core input flow (ระหว่าง
              รายการเซ็ตที่ทำแล้วกับช่อง reps/น้ำหนัก) ทั้งที่เป็นแค่ session-level setting ไม่เกี่ยวกับท่า
              ปัจจุบันตรงหน้าเลย" — ย้ายมาไว้แถว meta บนสุดคู่กับนาฬิกา/"จบก่อน" ซึ่งเป็น session-level
              controls อยู่แล้ว ไม่กระทบขนาดการ์ดหลัก/behavior ใดๆ */}
          <WeightUnitToggle />
          <p className="text-[12px] font-mono text-muted tabular">{formatClock(totalElapsedMs)}</p>
          <button
            type="button"
            onClick={endSession}
            className="text-[12px] text-muted hover:text-rusttext transition"
          >
            จบก่อน
          </button>
        </div>
      </div>

      {/* progress chips (มือถือ) — บนจอกว้างใช้ sidebar รายชื่อท่าแทน (ดูด้านล่าง) */}
      <div className="flex gap-1 lg:hidden">
        {exercises.map((ex, i) => (
          <button
            key={ex.id}
            type="button"
            onClick={() => setIndex(i)}
            className={`h-1.5 flex-1 rounded-full transition ${
              i === index ? 'bg-amber' : states[ex.id]?.logged ? 'bg-steel' : 'bg-surface2'
            }`}
            aria-label={ex.exercise_name}
          />
        ))}
      </div>

      {showAddExercise ? (
        <PremiumCard className="px-4 py-3.5 space-y-2.5">
          <p className="text-[12px] tracked uppercase text-muted">เพิ่มท่านอกแผน</p>
          <ExercisePicker
            value={newExerciseName}
            onChange={(name) => {
              setNewExerciseName(name)
              setNewExerciseDef(null)
            }}
            onSelect={(ex) => setNewExerciseDef(ex)}
            placeholder="พิมพ์ชื่อท่า หรือเลือกจากคลัง เช่น bench หรือ สควอท"
          />
          {addExerciseError && <p className="text-xs text-rusttext">{addExerciseError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAddExercise(false)
                setNewExerciseName('')
                setNewExerciseDef(null)
                setAddExerciseError(null)
              }}
              className="flex-1 rounded-lg border border-line text-muted font-display tracked uppercase py-2.5 text-xs transition"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={addExercise}
              className="flex-[2] rounded-lg bg-steel text-bg font-display tracked uppercase py-2.5 text-xs active:scale-[0.99] transition"
            >
              เพิ่มท่านี้
            </button>
          </div>
        </PremiumCard>
      ) : (
        <button
          type="button"
          onClick={() => {
            setShowAddExercise(true)
            setShowSwapExercise(false)
          }}
          className="w-full rounded-lg border border-dashed border-line text-muted hover:text-amber hover:border-amber/50 font-display tracked uppercase py-2.5 text-xs transition"
        >
          + เพิ่มท่า
        </button>
      )}

      {/* บั๊ก: เดิม panel นี้เรนเดอร์เป็น sibling หลังปิดการ์ดหลักทั้งใบ (รูป+เซ็ต+reps/น้ำหนัก+drop
          set+ปุ่มเสร็จเซ็ต) ซึ่งกินพื้นที่สูงมากบนมือถือ — ปุ่ม "🔁 เปลี่ยนท่า" อยู่บนสุดของการ์ด (ทับรูป)
          กดแล้ว panel เปิดจริงแต่โผล่ไกลเกินจอ ผู้ใช้เห็นแค่ viewport เดิมไม่ขยับเลยดูเหมือนกดไม่ติด —
          ย้ายมาไว้ตรงนี้แทน (เหนือการ์ดหลัก) ให้ตำแหน่งเดียวกับ panel "เพิ่มท่านอกแผน" ด้านบนซึ่งทำงานถูกอยู่แล้ว
          (โผล่ทันทีในตำแหน่งเดิมที่กดไม่ต้องเลื่อนจอ) — showAddExercise/showSwapExercise เป็นสอง state
          อิสระต่อกัน ถ้าไม่บังคับ mutual-exclusive ตรงนี้ เปิดทั้งคู่พร้อมกันได้ (เช่น เปิด "+เพิ่มท่า" ค้างไว้
          แล้วกด "🔁 เปลี่ยนท่า" ต่อ) จะกลับไปเจอปัญหาการ์ดสูงเกินจอแบบเดิมอีกรอบ เพราะสอง panel ซ้อนกัน */}
      {showSwapExercise && (
        <PremiumCard className="px-4 py-3.5 space-y-2.5">
          <p className="text-[12px] tracked uppercase text-muted">
            เปลี่ยนท่า &quot;{current.exercise_name}&quot; เป็นท่าอื่น
            {currentState.setsLog.length > 0 && ` (บันทึก ${currentState.setsLog.length} เซ็ตที่ทำไปแล้วไว้ก่อน)`}
          </p>
          <ExercisePicker
            value={swapName}
            onChange={(name) => {
              setSwapName(name)
              setSwapDef(null)
            }}
            onSelect={(ex) => setSwapDef(ex)}
            placeholder="พิมพ์ชื่อท่าใหม่ หรือเลือกจากคลัง"
          />
          {swapError && <p className="text-xs text-rusttext">{swapError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowSwapExercise(false)
                setSwapName('')
                setSwapDef(null)
                setSwapError(null)
              }}
              className="flex-1 rounded-lg border border-line text-muted font-display tracked uppercase py-2.5 text-xs transition"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={swapCurrentExercise}
              disabled={swapping}
              className="flex-[2] rounded-lg bg-steel text-bg font-display tracked uppercase py-2.5 text-xs active:scale-[0.99] disabled:opacity-50 transition"
            >
              {swapping ? 'กำลังเปลี่ยน...' : 'เปลี่ยนเป็นท่านี้'}
            </button>
          </div>
        </PremiumCard>
      )}

      {/* v48: การ์ดหลักนี้มีพื้นหลัง radial-gradient เฉพาะตัว (ไม่ใช่ CARD_GRADIENT_CSS ไทเทเนียมทั่วไป) —
          ไม่ห่อด้วย PremiumCard เพราะจะไปแทนที่พื้นหลังนี้ (backgroundImage ของ PremiumCard ชนะทับ) แค่ตัด
          border-line เส้นกรอบทึบออก ให้ contact shadow ตัวเดียวกับ PremiumCard บอกขอบแทน + มุมตัด CNC
          เดียวกับการ์ดอื่นทั่วแอป ให้ยังอยู่ในตระกูลภาพเดียวกันแม้ไม่ได้ใช้ wrapper */}
      <div
        className="overflow-hidden"
        style={{
          background:
            'radial-gradient(circle at 88% 15%, rgba(255,138,0,0.20), transparent 55%), #1C1F24',
          boxShadow: `${CARD_AMBIENT_SHADOW_CSS}, ${CARD_FLOAT_SHADOW}, 0 0 0 1px rgba(0,0,0,.3)`,
          clipPath: CNC_CORNER_CLIP_PATH_DEFAULT,
        }}
      >
        <div className="relative overflow-hidden border-b border-white/5 min-h-[190px]">
          {/* รูปท่าออกกำลังกายแบบเต็มมุมขวา — ไม่ mask เนื้อรูปแล้ว (เห็นเต็มภาพตามที่อยากได้) แต่ต้องมี
              ฉากมืดจางๆ (scrim) แยกอีกชั้นทับอยู่บนรูป (ไม่ใช่ตัวรูปเอง) เฉพาะโซนที่วางตัวหนังสือของแอป
              (ชื่อท่า/เป้าหมาย/RIR/พัก) ไม่งั้นตัวหนังสือของแอปจะไปทับกับตัวหนังสือที่ฝังอยู่ในรูปเอง
              (ชื่อท่าที่ AI สร้างมาให้) อ่านไม่ออกทั้งคู่ — ต่างจาก mask เดิมตรงที่นี่แค่หรี่แสง ไม่ได้ทำให้
              เนื้อรูปหายไปจริง — สูง 190px (ไม่ใช่ 132px แบบแรก) เพราะ aspect ratio ของกล่องที่เตี้ยเกินไป
              เทียบกับรูปต้นฉบับ (แนวนอนกว้าง) ทำให้ object-cover ต้อง crop ด้านข้างจนเห็นแค่ริมขวาสุดของรูป
              ไม่เห็นคนเล่นท่าเลย — เพิ่มความสูงให้ใกล้ aspect ต้นฉบับมากขึ้นและใช้ object-position กำหนดเอง
              แทน object-right */}
          {knownExercise?.imageUrl && (
            <>
              <div className="absolute inset-0">
                <Image
                  src={knownExercise.imageUrl}
                  alt=""
                  fill
                  sizes="600px"
                  loading="lazy"
                  className="object-cover"
                  style={{ objectPosition: '62% 50%' }}
                />
              </div>
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(90deg, rgba(20,22,26,0.9) 0%, rgba(20,22,26,0.55) 35%, transparent 60%)',
                }}
              />
            </>
          )}
          <div className="relative px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {mg && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: mgColor }} />}
                <p
                  className="font-display text-xl tracked uppercase text-ink truncate"
                  style={knownExercise?.imageUrl ? { textShadow: '0 1px 4px rgba(0,0,0,0.9)' } : undefined}
                >
                  {current.exercise_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSwapExercise((v) => !v)
                  setShowAddExercise(false)
                }}
                className="shrink-0 text-[12px] tracked uppercase text-muted hover:text-amber transition"
                style={knownExercise?.imageUrl ? { textShadow: '0 1px 3px rgba(0,0,0,0.9)' } : undefined}
              >
                🔁 เปลี่ยนท่า
              </button>
            </div>
            <p
              className="text-[12px] text-muted mt-1"
              style={knownExercise?.imageUrl ? { textShadow: '0 1px 3px rgba(0,0,0,0.9)' } : undefined}
            >
              เป้าหมาย {targetSets} เซ็ต × {current.target_reps ?? '–'} reps
              {current.target_rir && ` · RIR ${current.target_rir}`}
              {current.rest && ` · พัก ${current.rest}`}
            </p>
            {current.rationale && <p className="text-[12px] text-muted/70 mt-1 italic">{current.rationale}</p>}
          </div>
        </div>

        <div className="px-4 py-4 space-y-3">
          {/* ฟีดแบ็ก "Live Coach — โชว์ Recovery ของกล้ามเนื้อที่กำลังเล่นอยู่ตอนนี้เลย ไม่ใช่แค่ตอนจบ
              เซสชัน" — เกณฑ์/สี/adviceTh ตัวเดียวกับ Dashboard/AI Coach ทุกจุด (recoveryTier) ไม่คิดเกณฑ์
              ใหม่แยก ไม่โชว์ถ้าท่านี้ไม่มีกลุ่มกล้ามเนื้อกำกับ (ad-hoc บางท่า) */}
          {mg && currentRecoveryTier && (
            <div className="rounded-lg border border-white/5 bg-black/10 px-3 py-2.5">
              <p className="text-[12px] tracked uppercase text-muted mb-1">🤖 Live Coach</p>
              <p className="text-[12px] leading-snug font-medium" style={{ color: currentRecoveryTier.color }}>
                {mg} ฟื้นตัวแล้ว {currentRecoveryPct}%
              </p>
              <p className="text-[12px] text-muted mt-0.5 leading-snug">{currentRecoveryTier.adviceTh}</p>
            </div>
          )}

          <div className="flex items-center justify-between bg-surface2 rounded-lg px-4 py-2.5">
            <div>
              <p className="text-[12px] tracked uppercase text-muted">เซ็ตที่ทำแล้ว</p>
              <p className="font-mono text-xl text-ink mt-0.5">
                {currentState.setsLog.length}
                <span className="text-sm text-muted">/{targetSets}</span>
              </p>
            </div>
            <RestTimerButton
              key={current.id}
              restSeconds={parseRestSeconds(current.rest)}
              onSetLogged={currentState.setsLog.length}
              startedAt={currentState.setsLog.length > 0 ? readRestStartedAt(current.id) : null}
            />
          </div>

          {currentState.setsLog.length > 0 && (
            <ul className="space-y-1">
              {currentState.setsLog.map((s, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-[12px] font-mono text-muted bg-surface2 rounded px-2.5 py-1"
                >
                  <span>เซ็ต {i + 1}</span>
                  <span className="text-ink">
                    {format(s.weightKg)} × {s.reps} reps
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Progressive Overload — โชว์เฉพาะก่อนกดเซ็ตแรกของท่านี้ในเซสชันนี้ (ดู overloadSuggestion
              ด้านบน) เทียบผลงานครั้งก่อนกับช่วง reps เป้าหมาย แล้วแนะนำน้ำหนัก/reps ของวันนี้ตามหลัก
              double progression (เต็มขอบบนของช่วง reps แล้ว = เพิ่มน้ำหนัก, ยังไม่เต็ม = เพิ่ม rep) —
              ปุ่ม "ใช้เลย" กรอกค่าที่แนะนำเข้า draft ให้ทันที ผู้ใช้ยังปรับเองต่อได้ตามปกติ */}
          {overloadSuggestion && currentLastPerf && (
            <div
              className="rounded-xl px-3 py-2 flex items-center justify-between gap-2"
              style={{ background: withAlpha(COLORS.amber, '14'), border: `1px solid ${withAlpha(COLORS.amber, '2A')}` }}
            >
              <div className="min-w-0">
                <p className="text-[12px] tracked uppercase truncate" style={{ color: '#CFD4DE' }}>
                  ครั้งก่อน {format(currentLastPerf.weightKg)} × {currentLastPerf.reps} ·{' '}
                  {overloadSuggestion.increasedWeight ? 'พร้อมเพิ่มน้ำหนักแล้ว' : 'ลองเพิ่มอีก 1 rep'}
                </p>
                <p className="font-display text-sm tracked" style={{ color: COLORS.amber }}>
                  แนะนำวันนี้ {format(overloadSuggestion.weightKg)} × {overloadSuggestion.reps}
                </p>
              </div>
              <button
                type="button"
                onClick={() => updateCurrent({ weightKg: overloadSuggestion.weightKg, reps: overloadSuggestion.reps })}
                className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-display tracked uppercase active:scale-[0.98] transition"
                style={{ background: COLORS.amber, color: NEUTRAL.onAmberText }}
              >
                ใช้เลย
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <NumberStepper
              label="Reps ที่ทำได้"
              value={currentState.reps ?? 0}
              onChange={(v) => updateCurrent({ reps: v })}
              step={1}
              min={0}
            />
            <NumberStepper
              label="น้ำหนัก"
              unit={unit}
              value={toDisplay(currentState.weightKg ?? 0)}
              onChange={(v) => updateCurrent({ weightKg: toKg(v) })}
              step={unit === 'lb' ? 5 : 2.5}
              min={0}
            />
          </div>

          {/* Plate Calculator — เฉพาะท่าอุปกรณ์บาร์เบล (ดู plateBreakdown ด้านบน) บอกว่าต้องใส่แผ่น
              อะไรต่อข้างบ้างถึงจะได้น้ำหนักรวมตามที่กรอกไว้ ไม่ต้องคำนวณเลขในหัวเองระหว่างเทรน —
              น้ำหนักบาร์ปรับได้ทันที (ดู barWeightOverride ด้านบนของไฟล์ — ค่าเริ่มต้น 20kg/45lb
              มาตรฐาน กดที่ label เพื่อแก้เมื่อบาร์จริงไม่เท่ากับมาตรฐาน) */}
          {plateBreakdown && (
            <div className="rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap" style={{ background: 'rgba(255,255,255,.04)' }}>
              <button
                type="button"
                onClick={() => setEditingBarWeight((v) => !v)}
                className="text-[12px] tracked uppercase text-muted hover:text-amber transition shrink-0"
              >
                แผ่น/ข้าง (บาร์ {plateBreakdown.barWeight}{unit}) ✎
              </button>
              {editingBarWeight ? (
                <div className="flex items-center gap-2 basis-full">
                  <button
                    type="button"
                    onClick={() =>
                      setBarWeightOverride(Math.max(0, (barWeightOverride ?? BAR_WEIGHT[unit]) - (unit === 'lb' ? 5 : 2.5)))
                    }
                    className="w-7 h-7 rounded-full bg-surface2 border border-line text-ink text-sm active:scale-[0.98]"
                  >
                    −
                  </button>
                  <span className="font-mono text-[12px] text-ink w-14 text-center">
                    {plateBreakdown.barWeight}{unit}
                  </span>
                  <button
                    type="button"
                    onClick={() => setBarWeightOverride((barWeightOverride ?? BAR_WEIGHT[unit]) + (unit === 'lb' ? 5 : 2.5))}
                    className="w-7 h-7 rounded-full bg-surface2 border border-line text-ink text-sm active:scale-[0.98]"
                  >
                    +
                  </button>
                  {barWeightOverride !== null && (
                    <button
                      type="button"
                      onClick={() => setBarWeightOverride(null)}
                      className="text-[12px] text-muted hover:text-amber transition"
                    >
                      รีเซ็ต
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingBarWeight(false)}
                    className="text-[12px] text-muted hover:text-ink transition ml-auto"
                  >
                    เสร็จ
                  </button>
                </div>
              ) : plateBreakdown.perSide.length === 0 ? (
                <span className="text-[12px] font-mono" style={{ color: '#CFD4DE' }}>บาร์เปล่า</span>
              ) : (
                plateBreakdown.perSide.map((p) => (
                  <span
                    key={p.plate}
                    className="rounded-md px-1.5 py-0.5 text-[12px] font-mono"
                    style={{ background: withAlpha(COLORS.steel, '26'), color: COLORS.steel }}
                  >
                    {p.plate}×{p.count}
                  </span>
                ))
              )}
              {!editingBarWeight && plateBreakdown.leftoverPerSide > 0 && (
                <span className="text-[12px] tracked text-muted">
                  (แบ่งแผ่นไม่ลงตัว เหลือ {plateBreakdown.leftoverPerSide}{unit}/ข้าง)
                </span>
              )}
            </div>
          )}

          {/* Drop Set — ลดน้ำหนักด่วนสำหรับเซ็ตถัดไปโดยไม่ต้องกด stepper ทีละครั้ง ปัดเข้า step
              เดียวกับ NumberStepper น้ำหนักด้านบน (2.5kg / 5lb) กันได้ตัวเลขแปลกๆ เช่น 63.75kg
              ไม่ลดต่ำกว่า 0 — ใช้ currentState.weightKg (หน่วย kg เสมอ) เป็นฐานคำนวณเพื่อไม่ให้
              ปัดเศษผิดพลาดจากการแปลงหน่วยไปมาซ้ำๆ ระหว่างเซ็ต */}
          {(currentState.weightKg ?? 0) > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[12px] tracked uppercase text-muted shrink-0">Drop Set</span>
              {[10, 20].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => updateCurrent({ weightKg: dropSetWeightKg(currentState.weightKg ?? 0, pct, unit) })}
                  className="flex-1 rounded-lg border border-line text-muted hover:text-amber hover:border-amber/50 transition py-1.5 text-[12px] font-display tracked uppercase active:scale-[0.98]"
                >
                  −{pct}%
                </button>
              ))}
            </div>
          )}

          {/* ไล่สีเขียว (#4ADE80 → #22C55E) ตัวเดียวกับการ์ด "มวลไขมัน" ใน BodyMetricsRow
              (colorScheme="vibrant" ที่การ์ดภาพรวมร่างกาย) + จุดไฮไลต์มุมบนซ้ายให้ดูมีมิติ
              แทนแบบ ghost/โปร่งใสก่อนหน้า */}
          <button
            type="button"
            onClick={logSet}
            disabled={loggingSet}
            style={{
              backgroundImage:
                'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.35), transparent 50%), linear-gradient(135deg, #4ADE80, #22C55E)',
              color: NEUTRAL.onAmberText,
              boxShadow: '0 0 24px rgba(74,222,128,0.4)',
            }}
            className="w-full rounded-full font-display tracked uppercase py-3.5 text-sm active:scale-[0.98] transition flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-[12px] shrink-0"
              style={{ backgroundColor: NEUTRAL.onAmberText, color: COLORS.green }}
            >
              ✓
            </span>
            เซ็ตนี้เสร็จแล้ว{setsRemaining > 0 ? ` (เหลืออีก ${setsRemaining})` : ''}
          </button>

          {currentState.setsLog.length > 0 && (
            <button
              type="button"
              onClick={removeLastSet}
              className="w-full text-[12px] text-muted hover:text-amber transition"
            >
              แก้ไข — ลบเซ็ตล่าสุด
            </button>
          )}
        </div>
      </div>

      {errorMsg && <p className="text-xs text-rusttext text-center">{errorMsg}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={skipCurrent}
          disabled={saving}
          className="flex-1 rounded-full border border-line text-muted font-display tracked uppercase py-3 text-xs disabled:opacity-50 transition"
        >
          ข้ามท่านี้
        </button>
        {/* v52: ฟีดแบ็ก "หน้าอื่นควรอิงภาษาเดียวกับ Dashboard" — เดิม bg-amber เรียบๆ ไม่มี glow เปลี่ยนมาใช้
            Button component กลาง variant="primary" (glow) — size="md" (ไม่ใช่ดีฟอลต์ sm) เพื่อรักษาพื้นที่
            แตะใกล้เคียงของเดิม (py-3 เดิม vs md py-2.5)
            v53: Product Audit /session — ฟีดแบ็ก "หน้า Active Workout มี glow-CTA แข่งกัน 2 ปุ่มพร้อมกัน
            (ปุ่มเขียว 'เซ็ตนี้เสร็จแล้ว' ด้านบน + ปุ่มนี้) ขัดกับกฎที่ Button.tsx เขียนไว้เองว่า variant
            primary ควรเป็น glow-CTA เดียวของหน้า" — เทียบ interaction frequency แล้วปุ่ม "เซ็ตนี้เสร็จแล้ว"
            ถูกกดถี่กว่ามาก (ทุกเซ็ต) ส่วนปุ่มนี้กดแค่ตอนจบท่าเท่านั้น (ครั้งเดียวต่อท่า) — ให้ glow อยู่กับ
            ปุ่มเขียวแทน เปลี่ยนปุ่มนี้เป็น variant="secondary" (กรอบอำพัน ไม่มี glow) คง size="md" เดิมไว้
            (ไม่กระทบ touch target/behavior ใดๆ) */}
        <Button
          type="button"
          onClick={logCurrentExercise}
          disabled={saving || currentState.setsLog.length === 0}
          variant="secondary"
          size="md"
          className="flex-[2]"
        >
          {saving
            ? 'กำลังบันทึก...'
            : index >= exercises.length - 1
              ? 'บันทึก & จบเซสชัน'
              : 'บันทึก & ท่าถัดไป ▶'}
        </Button>
      </div>
      </div>

      {/* sidebar รายชื่อท่าทั้งหมด — โชว์เฉพาะจอกว้าง (lg+) แทน progress chips เพื่อใช้พื้นที่ว่างข้างการ์ด */}
      <div className="hidden lg:block">
        {/* position: sticky ผ่าน style ตรงๆ แทนคลาส Tailwind `sticky` — PremiumCard ใส่คลาส `relative`
            มาเป็นฐานอยู่แล้ว (className ของ component เอง) การชนกันของ 2 คลาสที่ตั้งค่า position คนละค่า
            ขึ้นกับลำดับใน stylesheet ที่คอมไพล์ ไม่ใช่ลำดับใน className string — ใช้ style ให้ชนะแน่นอน
            (inline style ชนะทุกคลาสเสมอตามสเปก CSS specificity) กันสถานะเมนูข้างไม่ sticky จริงเงียบๆ */}
        <PremiumCard className="p-3 space-y-0.5" style={{ position: 'sticky', top: 16 }}>
          <p className="text-[12px] tracked uppercase text-muted px-1.5 pb-1.5">ท่าในเซสชันนี้</p>
          <ul className="space-y-0.5">
            {exercises.map((ex, i) => {
              const st = states[ex.id]
              const done = st?.logged
              const skipped = st?.skipped
              const activeItem = i === index
              return (
                <li key={ex.id}>
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition flex items-center gap-2 ${
                      activeItem ? 'bg-amber/10 text-amber' : 'text-ink hover:bg-surface2'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[12px] ${
                        done ? 'bg-steel text-bg' : activeItem ? 'bg-amber text-bg' : 'bg-surface2 text-muted'
                      }`}
                    >
                      {done ? '✓' : skipped ? '–' : i + 1}
                    </span>
                    <span className={`truncate ${done ? 'text-muted line-through' : ''}`}>{ex.exercise_name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </PremiumCard>
      </div>
    </div>
  )
}

// การ์ดสรุปตัวเลขแบบมีไอคอนวงกลมเรืองแสง (glow) — ใช้ withAlpha ทำพื้นหลังจางๆ สีเดียวกับไอคอน
// แล้วใส่ boxShadow สีเดียวกันแบบโปร่งแสงให้ดูเหมือนไอคอนเปล่งแสงออกมา (โทนเดียวกับปุ่ม "เซ็ตนี้เสร็จแล้ว")
function GlowIconChip({ icon, color, size = 36 }: { icon: React.ReactNode; color: string; size?: number }) {
  return (
    <span
      className="shrink-0 rounded-full flex items-center justify-center"
      style={{ width: size, height: size, background: withAlpha(color, '26'), boxShadow: `0 0 14px ${withAlpha(color, '55')}`, color }}
    >
      {icon}
    </span>
  )
}

// ฟีดแบ็ก "รายชื่อ 32 ท่ายาวเกินไป ดูเหมือนรายงาน debug" — โชว์แค่ 3 ชื่อแรก + "+N ท่า" ปุ่มเดียวขยาย/ย่อ
// รายชื่อทั้งหมด (useState เฉยๆ ไม่ต้องทำ Bottom Sheet แยก) ข้อมูลเหมือนเดิมทุกตัว แค่เปลี่ยนการนำเสนอ
function SkippedExercisesCard({ skipped }: { skipped: SkippedExercise[] }) {
  const [expanded, setExpanded] = useState(false)
  const preview = skipped.slice(0, 3).map((s) => s.exerciseName)
  const remaining = skipped.length - preview.length
  return (
    <div className="rounded-lg bg-surface2 border border-line px-4 py-3 text-left space-y-1">
      <p className="text-[12px] tracked uppercase text-muted">⏭️ ข้าม {skipped.length} ท่า</p>
      {expanded ? (
        <p className="text-xs text-ink">{skipped.map((s) => s.exerciseName).join(' · ')}</p>
      ) : (
        <p className="text-xs text-ink">
          {preview.join(' · ')}
          {remaining > 0 && <span className="text-muted"> · +{remaining} ท่า</span>}
        </p>
      )}
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-muted">ลองแทรกในเซสชันหน้าดูนะ</p>
        {skipped.length > 3 && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-[12px] text-amber shrink-0">
            {expanded ? 'ย่อ' : 'ดูทั้งหมด →'}
          </button>
        )}
      </div>
    </div>
  )
}

// bare — Version 4 (Motivational/Premium) รวม 5 สถิติเข้าการ์ดเดียวกัน (แทนที่จะเป็นการ์ดแยก 5 ใบ) ต้อง
// วางเนื้อหาไว้ในการ์ดนอกเอง ไม่ให้แต่ละ cell ห่อ PremiumCard ซ้อนอีกชั้น — ดีฟอลต์ false รักษาพฤติกรรมเดิม
// เผื่อจุดอื่นเรียกใช้ต่อในอนาคต
function GlowStatCell({
  icon,
  color,
  value,
  label,
  bare = false,
  emphasis = 'normal',
  caption,
}: {
  icon: React.ReactNode
  color: string
  value: string
  label: string
  bare?: boolean
  // ฟีดแบ็ก "5 ตัวเลขน้ำหนักเท่ากันหมด อยากให้ 'ท่าที่ทำ' เป็นพระเอกเพราะอธิบาย session ได้ดีที่สุด" —
  // hero แค่ขยาย font ของค่าตัวเลข ไม่แตะ layout/grid เดิม ('muted' ใช้กับแคลอรี่ที่อยากลดความสำคัญลง)
  emphasis?: 'normal' | 'hero' | 'muted'
  // แคปชันเสริมเล็กๆ ใต้ label (เช่น "32 ท่าข้าม") — ใช้ตัวเลขที่มีอยู่แล้วบนหน้านี้ ไม่ใช่ข้อมูลใหม่
  caption?: string
}) {
  const valueClass = emphasis === 'hero' ? 'font-mono text-2xl text-ink tabular' : emphasis === 'muted' ? 'font-mono text-base text-muted tabular' : 'font-mono text-lg text-ink tabular'
  const content = (
    <>
      <GlowIconChip icon={icon} color={color} size={34} />
      <p className={valueClass}>{value}</p>
      <p className="text-[12px] tracked uppercase text-muted">{label}</p>
      {caption && <p className="text-[11px] text-muted/70 -mt-1">{caption}</p>}
    </>
  )
  if (bare) return <div className="flex flex-col items-center gap-1.5">{content}</div>
  return <PremiumCard className="py-3.5 px-2 flex flex-col items-center gap-1.5">{content}</PremiumCard>
}

function GlowStatRow({
  icon,
  color,
  value,
  label,
  bare = false,
  emphasis = 'normal',
}: {
  icon: React.ReactNode
  color: string
  value: string
  label: string
  bare?: boolean
  emphasis?: 'normal' | 'muted'
}) {
  const valueClass = emphasis === 'muted' ? 'font-mono text-sm text-muted tabular truncate' : 'font-mono text-lg text-ink tabular truncate'
  const content = (
    <>
      <GlowIconChip icon={icon} color={color} size={emphasis === 'muted' ? 32 : 40} />
      <div className="min-w-0 text-left">
        <p className={valueClass}>{value}</p>
        <p className="text-[12px] tracked uppercase text-muted">{label}</p>
      </div>
    </>
  )
  if (bare) return <div className="flex items-center gap-3">{content}</div>
  return <PremiumCard className="px-3.5 py-3.5 flex items-center gap-3">{content}</PremiumCard>
}

// สีวงแหวน ProgressRing ของ "ความพร้อมกล้ามเนื้อโดยรวม" — ผูกกับ tier เดียวกับแถบสีรายกลุ่ม
// (recoveryBarColor) ไม่ใช้ fire gradient เริ่มต้นของ ProgressRing เพราะที่นี่สื่อความหมาย
// ระดับความพร้อม ไม่ใช่แค่ของตกแต่ง
function ringStopsForPct(pct: number) {
  const tier = tierForPct(pct)
  const c = tier === 'green' ? COLORS.steel : tier === 'yellow' ? COLORS.amber : COLORS.rust
  return [
    { offset: '0%', color: c },
    { offset: '100%', color: c },
  ]
}

function recoveryBarColor(tier: 'green' | 'yellow' | 'orange' | 'red') {
  if (tier === 'green') return 'bg-steel'
  if (tier === 'yellow') return 'bg-amber'
  return 'bg-rust'
}

// ป้าย/สี Workout Score — ใช้ตัวเลขเดียวกับ computeWorkoutScore (lib/workoutSession.ts) เป๊ะ แค่แปลเป็น
// คำอธิบายสั้นๆ ให้ผู้ใช้เข้าใจทันทีว่า 35 "แปลว่าอะไร" แทนที่จะเห็นตัวเลขลอยๆ (ฟีดแบ็ก design review)
function workoutScoreTier(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'ยอดเยี่ยม', color: COLORS.moss }
  if (score >= 60) return { label: 'ดี', color: COLORS.amber }
  if (score >= 40) return { label: 'พอใช้', color: COLORS.amber }
  return { label: 'ต้องปรับปรุง', color: COLORS.rust }
}

// วงกลมสีตามระดับฟื้นตัว (เดียวกับ recoveryBarColor แค่คืน emoji แทน class) — mockup ขอ "Recovery Map"
// ที่อ่านเร็วด้วยสีจุด ไม่ต้องอ่านตัวเลข % ทุกแถวเพื่อรู้ว่ากล้ามเนื้อไหนพร้อม/ไม่พร้อม
function recoveryDot(tier: 'green' | 'yellow' | 'orange' | 'red') {
  if (tier === 'green') return '🟢'
  if (tier === 'yellow') return '🟡'
  if (tier === 'orange') return '🟠'
  return '🔴'
}

// แถบความพร้อมของกล้ามเนื้อ 1 กลุ่ม — แยกเป็น component เดี่ยวเพื่อไม่ให้แถวซ้ำ 7 ครั้งใน .map()
// ต้องแก้หน้าตาแถวที่เดียว (จุดสี/แถบ/เปอร์เซ็นต์) ไม่ต้องไล่แก้ทุกจุดที่ก็อปวางไว้
function MuscleReadinessRow({ muscleGroup, pct, tier }: { muscleGroup: string; pct: number; tier: 'green' | 'yellow' | 'orange' | 'red' }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-sm shrink-0" aria-hidden="true">
        {recoveryDot(tier)}
      </span>
      <span className="text-[12px] text-muted w-14 shrink-0">{muscleGroup}</span>
      <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden">
        <div className={`h-full rounded-full ${recoveryBarColor(tier)}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[12px] font-mono text-ink w-9 text-right">{pct}%</span>
    </div>
  )
}

function ClockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

function DumbbellIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6M2 10v4M20 9v6M22 10v4M7 12h10" />
      <rect x="5" y="8" width="4" height="8" rx="1" />
      <rect x="15" y="8" width="4" height="8" rx="1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l5 5L20 6" />
    </svg>
  )
}

function FlameIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2c1 3-2 4-2 7a4 4 0 008 0c0-1-.5-2-1-3 1 0 3 2 3 6a6 6 0 11-12 0c0-4 2-7 4-10z" />
    </svg>
  )
}

function BoltIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  )
}

// ตัวจับเวลาพักแบบย่อ ฝังอยู่ในการ์ดของท่าปัจจุบัน — เริ่มนับอัตโนมัติทุกครั้งที่กด
// "เซ็ตนี้เสร็จแล้ว" (ติดตามผ่าน onSetLogged ที่เปลี่ยนค่าทุกครั้งที่เซ็ตเพิ่มขึ้น)
function RestTimerButton({
  restSeconds,
  onSetLogged,
  startedAt,
}: {
  restSeconds: number
  onSetLogged: number
  // เวลา (timestamp) ที่กดเซ็ตล่าสุดจริงๆ จาก localStorage — ใช้นับพักต่อให้ถูกต้องตอน remount
  // (เช่นสลับหน้าไปมาระหว่างพัก) แทนที่จะรีเซ็ตเป็น 0 ทุกครั้งเพราะ useStopwatch เป็น state ในหน่วยความจำ
  startedAt: number | null
}) {
  const { enabled: voiceEnabled } = useVoiceEnabled()
  const { elapsedMs, running, start, pause, reset } = useStopwatch()
  const finishedRef = useRef(false)
  const tickedRef = useRef(-1)
  const prevCountRef = useRef(onSetLogged)
  const restOffsetRef = useRef(0)
  const resumedRef = useRef(false)

  useWakeLock(running)

  const totalMs = restSeconds * 1000

  // นับต่อจาก startedAt ทันทีตอน mount ครั้งแรก (ถ้ามี) — ถ้าเวลาพักผ่านไปครบแล้วตั้งแต่ก่อน mount
  // ก็ยังปล่อยให้ effect ด้านล่างตรวจพบ remainingMs<=0 แล้วเปลี่ยนเป็นสถานะ "พักครบแล้ว" ให้เองตามปกติ
  useEffect(() => {
    if (resumedRef.current) return
    resumedRef.current = true
    if (startedAt) {
      restOffsetRef.current = Date.now() - startedAt
      start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const displayElapsedMs = elapsedMs + restOffsetRef.current
  const remainingMs = Math.max(0, totalMs - displayElapsedMs)
  const remainingSec = Math.ceil(remainingMs / 1000)

  // เซ็ตเพิ่มขึ้น (กดปุ่ม "เซ็ตนี้เสร็จแล้ว") -> เริ่มพักอัตโนมัติ
  useEffect(() => {
    if (onSetLogged > prevCountRef.current) {
      prevCountRef.current = onSetLogged
      finishedRef.current = false
      tickedRef.current = -1
      restOffsetRef.current = 0
      reset()
      start()
    } else {
      prevCountRef.current = onSetLogged
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSetLogged])

  useEffect(() => {
    if (!running) return
    if (remainingMs <= 0 && !finishedRef.current) {
      finishedRef.current = true
      beepFinish()
      if (voiceEnabled) speak('พักครบแล้ว ไปต่อ')
      pause()
      return
    }
    if (remainingSec <= 3 && remainingSec >= 1 && tickedRef.current !== remainingSec) {
      tickedRef.current = remainingSec
      beepTick()
    }
  }, [remainingMs, remainingSec, running, pause, voiceEnabled])

  if (!running && displayElapsedMs === 0) {
    return <p className="text-[12px] text-muted text-right">พัก {restSeconds}s หลังกดเซ็ต</p>
  }

  const done = !running && finishedRef.current

  return (
    <div className="text-right">
      <p className={`font-mono text-xl tabular ${done ? 'text-amber' : 'text-steel'}`}>{formatClock(remainingMs)}</p>
      <button
        type="button"
        onClick={() => {
          finishedRef.current = true
          pause()
        }}
        className="text-[12px] text-muted hover:text-amber transition"
      >
        {done ? 'พักครบแล้ว' : 'ข้ามพัก'}
      </button>
    </div>
  )
}
