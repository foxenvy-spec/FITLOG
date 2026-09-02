import type { Workout } from './types'
import type { ExerciseDef } from './exerciseLibrary'
import type { Insight, MuscleRecommendation, TrainingBalance } from './dashboardStats'
import { recoveryRecommendationLabel, relativeDayLabel } from './dashboardStats'
import type { MetricDelta } from './bodyMetricsSummary'

// ==================================================================
// AI Coach — วิเคราะห์สมดุลกล้ามเนื้อ + แนะนำ Progressive Overload
// ทั้งหมดเป็น rule-based บนข้อมูลที่ผู้ใช้บันทึกเอง (ไม่ได้เรียก AI ภายนอก)
// ตั้งชื่อ "AI Coach" เพราะให้คำแนะนำเชิงสรุป/ตัดสินใจแทนการโชว์ตัวเลขดิบ
// ==================================================================

// ==================== Push / Pull Balance ====================
// จัดกลุ่มกล้ามเนื้อ อก+ไหล่ เป็นฝั่ง "ดัน" (Push) และ หลัง เป็นฝั่ง "ดึง" (Pull)
// เพื่อประเมินสมดุลระหว่างกล้ามเนื้อฝั่งหน้า/หลังลำตัว — ไม่สมดุลเรื้อรัง
// (ดันเยอะกว่าดึงมาก) สัมพันธ์กับท่าทางไหล่ห่อและความเสี่ยงบาดเจ็บไหล่ในวงการเวทเทรนนิ่ง
export const PUSH_MUSCLES = ['อก', 'ไหล่'] as const
export const PULL_MUSCLES = ['หลัง'] as const

export type BalanceStatus = 'balanced' | 'push_dominant' | 'pull_dominant' | 'insufficient_data'

export interface PushPullBalance {
  pushSets: number
  pullSets: number
  ratio: number | null // pushSets ÷ pullSets ปัดสองตำแหน่ง — null ถ้าข้อมูลยังไม่พอ
  status: BalanceStatus
}

const BALANCE_TOLERANCE = 0.15 // ยอมรับส่วนต่าง ±15% ว่ายัง "สมดุล"
const MIN_SETS_FOR_BALANCE = 6 // ต้องมีอย่างน้อยฝั่งละกี่เซ็ตต่อสัปดาห์ถึงจะฟันธงได้ ไม่งั้นข้อมูลน้อยเกินจะสรุป

export function computePushPullBalance(setsByMuscle: Record<string, number>): PushPullBalance {
  const pushSets = PUSH_MUSCLES.reduce((sum, mg) => sum + (setsByMuscle[mg] ?? 0), 0)
  const pullSets = PULL_MUSCLES.reduce((sum, mg) => sum + (setsByMuscle[mg] ?? 0), 0)

  if (pushSets < MIN_SETS_FOR_BALANCE || pullSets < MIN_SETS_FOR_BALANCE) {
    return { pushSets, pullSets, ratio: null, status: 'insufficient_data' }
  }

  const ratio = Math.round((pushSets / pullSets) * 100) / 100
  let status: BalanceStatus = 'balanced'
  if (ratio > 1 + BALANCE_TOLERANCE) status = 'push_dominant'
  else if (ratio < 1 - BALANCE_TOLERANCE) status = 'pull_dominant'

  return { pushSets, pullSets, ratio, status }
}

// แปลง PushPullBalance เป็น Insight การ์ดเดียวกับที่ dashboard ใช้อยู่แล้ว
// คืนค่า null เมื่อสมดุลดีอยู่แล้ว หรือข้อมูลยังไม่พอฟันธง (ไม่ต้องเตือนเปล่าๆ)
export function pushPullInsight(balance: PushPullBalance): Insight | null {
  if (balance.status === 'insufficient_data' || balance.status === 'balanced') return null

  const diffPct = Math.round(
    (Math.abs(balance.pushSets - balance.pullSets) / Math.max(balance.pushSets, balance.pullSets)) * 100
  )

  if (balance.status === 'push_dominant') {
    return {
      id: 'balance-push-pull',
      kind: 'warning',
      icon: '⚖️',
      title: 'Push มากกว่า Pull',
      detail: `เซ็ตดัน (อก/ไหล่) ${balance.pushSets} เทียบดึง (หลัง) ${balance.pullSets} ต่างกัน ${diffPct}% — เพิ่มท่าดึงเพื่อสมดุลไหล่/ท่าทาง`,
    }
  }

  return {
    id: 'balance-push-pull',
    kind: 'warning',
    icon: '⚖️',
    title: 'Pull มากกว่า Push',
    detail: `เซ็ตดึง (หลัง) ${balance.pullSets} เทียบดัน (อก/ไหล่) ${balance.pushSets} ต่างกัน ${diffPct}% — เพิ่มท่าดันเพื่อสมดุล`,
  }
}

// ==================== Progressive Overload แนะนำ (ใช้ RPE) ====================
// ต่างจาก suggestNextPR เดิม (เพิ่มน้ำหนักตายตัวทุกครั้ง) — ฟังก์ชันนี้ดู RPE ของเซสชันล่าสุด
// ถ้ามีบันทึกไว้ เพื่อตัดสินใจว่าควรเพิ่มน้ำหนัก / เพิ่ม reps ก่อน / หรือพัก (deload)
// แนวคิด: RPE ต่ำ = ยังมีแรงเหลือเยอะ ควรเพิ่มน้ำหนัก, RPE กลางๆ = เพิ่ม reps ก่อนค่อยขึ้นน้ำหนัก,
// RPE สูงต่อเนื่องหลายครั้ง = สัญญาณเหนื่อยสะสม ควรลดน้ำหนักลงเล็กน้อยกันบาดเจ็บ
export type OverloadAction = 'increase_weight' | 'increase_reps' | 'deload'

export interface OverloadPlan {
  exerciseName: string
  action: OverloadAction
  currentWeight: number
  currentReps: number
  targetWeight: number
  targetReps: number
  avgRpe: number | null
  rationale: string
}

const RPE_LOW_THRESHOLD = 7
const RPE_HIGH_THRESHOLD = 9
const RECENT_SESSION_COUNT = 3

// allEntries ควรเป็น workouts ทั้งหมดของ exerciseName นั้น (type='strength') — เรียงลำดับใหม่ในฟังก์ชันนี้เอง
export function computeProgressiveOverload(exerciseName: string, allEntries: Workout[], exercises: ExerciseDef[] = []): OverloadPlan | null {
  const sorted = allEntries
    .filter((w) => w.type === 'strength' && w.exercise_name === exerciseName && w.weight_kg !== null && w.reps !== null)
    .sort((a, b) =>
      a.performed_at === b.performed_at ? a.created_at.localeCompare(b.created_at) : a.performed_at < b.performed_at ? -1 : 1
    )

  if (sorted.length === 0) return null

  const last = sorted[sorted.length - 1]
  const currentWeight = last.weight_kg ?? 0
  const currentReps = last.reps ?? 0

  const recent = sorted.slice(-RECENT_SESSION_COUNT)
  const rpeValues = recent.map((w) => w.rpe).filter((r): r is number => r !== null && r !== undefined)
  const avgRpe = rpeValues.length > 0 ? Math.round((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10) / 10 : null

  const known = exercises.find((ex) => ex.name === exerciseName || ex.nameTh === exerciseName)
  const weightIncrement = known?.equipment === 'ดัมเบล' ? 1 : 2.5

  if (avgRpe === null) {
    return {
      exerciseName,
      action: 'increase_weight',
      currentWeight,
      currentReps,
      targetWeight: Math.round((currentWeight + weightIncrement) * 10) / 10,
      targetReps: currentReps,
      avgRpe: null,
      rationale: 'ยังไม่มีบันทึก RPE — แนะนำเพิ่มน้ำหนักทีละขั้นแบบมาตรฐาน ลองใส่ RPE ครั้งหน้าเพื่อคำแนะนำที่แม่นขึ้น',
    }
  }

  if (avgRpe <= RPE_LOW_THRESHOLD) {
    return {
      exerciseName,
      action: 'increase_weight',
      currentWeight,
      currentReps,
      targetWeight: Math.round((currentWeight + weightIncrement) * 10) / 10,
      targetReps: currentReps,
      avgRpe,
      rationale: `RPE เฉลี่ย ${avgRpe} จาก ${recent.length} ครั้งล่าสุด ยังเบา — เพิ่มน้ำหนักได้`,
    }
  }

  if (avgRpe >= RPE_HIGH_THRESHOLD) {
    return {
      exerciseName,
      action: 'deload',
      currentWeight,
      currentReps,
      targetWeight: Math.round(currentWeight * 0.9 * 10) / 10,
      targetReps: currentReps,
      avgRpe,
      rationale: `RPE เฉลี่ย ${avgRpe} จาก ${recent.length} ครั้งล่าสุด หนักต่อเนื่อง — ลดน้ำหนักลงเล็กน้อยเพื่อพักฟื้นและกันบาดเจ็บ`,
    }
  }

  return {
    exerciseName,
    action: 'increase_reps',
    currentWeight,
    currentReps,
    targetWeight: currentWeight,
    targetReps: currentReps + 1,
    avgRpe,
    rationale: `RPE เฉลี่ย ${avgRpe} จาก ${recent.length} ครั้งล่าสุด กำลังดี — ลองเพิ่ม reps ก่อนขึ้นน้ำหนัก`,
  }
}

// ==================== สรุปคำแนะนำประจำวันแบบประโยคเดียว ====================
// รวม recovery recommendation (จาก dashboardStats) เข้ากับสถานะ push/pull balance
// ให้ออกมาเป็นประโยคเดียวอ่านง่าย ใช้เป็น hero message ของหน้า AI Coach
// trainingBalance: ผลจาก computeTrainingBalance (lib/dashboardStats.ts, Priority 2 Training Balance
// Engine) — เดิม AI Coach เห็นแค่ recovery + push/pull ไม่รู้เรื่องสัดส่วนบน/ล่างลำตัวเทียบเป้าหมายเลย
// ทั้งที่ engine คำนวณไว้พร้อมใช้แล้ว (ใช้สร้าง Insight card แยกอยู่แล้วผ่าน trainingBalanceInsight —
// ตรงนี้แค่ให้ AI Coach "อ่าน" ข้อมูลเดียวกันมาพูดเป็นคำแนะนำของตัวเองด้วย ไม่ใช่คำนวณซ้ำ) optional +
// default null กันไม่กระทบจุดเรียกเดิมที่ยังไม่ได้ส่งค่านี้มา
export function computeAIDailySummary(
  muscleRecommendation: MuscleRecommendation | null,
  balance: PushPullBalance,
  progressPct: number | null = null,
  trainingBalance: TrainingBalance | null = null,
  // true เมื่อ muscleRecommendation คือกล้ามเนื้อของ "วันนี้" จริงๆ (ไม่ใช่ตกกลับไปแนะนำวันถัดไป/
  // recovery สูงสุดเฉยๆ) — ส่งต่อให้ recoveryRecommendationLabel เพื่อไม่ให้ประโยคพูดว่า "วันนี้ควรเล่น"
  // ทั้งที่จริงๆ กำลังแนะนำของครั้งถัดไป (ดู comment เต็มที่ recoveryRecommendationLabel)
  isForToday = true
): string {
  if (!muscleRecommendation) {
    return 'ยังไม่มีข้อมูลพอให้วิเคราะห์ — ลองบันทึกการฝึกสัก 2-3 ครั้งก่อน'
  }

  let msg = `${recoveryRecommendationLabel(progressPct, isForToday)} ${muscleRecommendation.muscleGroup} (ฟื้นตัวแล้ว ${muscleRecommendation.pct}%)`

  // ฟีดแบ็ก "Recovery ฟื้นตัวแล้ว ≠ ควรฝึก" — ถ้า suggestMuscleToTrain แนะนำกลุ่มนี้แทนกลุ่มตามตารางเพราะ
  // เซ็ตของกลุ่มตามตารางเกินเป้าหมายไปแล้ว (scheduleOverriddenFrom) ต้องบอกเหตุผลตรงๆ ไม่ใช่แนะนำเงียบๆ
  // เดี๋ยวผู้ใช้จะงงว่าทำไมจู่ๆ ไม่แนะนำกลุ่มตามตารางที่คุ้นเคยแล้ว
  // ฟีดแบ็ก (จากรอบตรวจ Dashboard, "Terminology") "Volume ทั้งที่ metric จริงคือจำนวนเซ็ต ควรใช้ภาษาที่ user
  // ไม่ต้องรู้ศัพท์ระบบ" — thisWeekSets/weeklyVolumeTargets ที่ suggestMuscleToTrain ใช้ตัดสินตรงนี้วัดเป็น
  // "เซ็ต" ทั้งระบบ ไม่ใช่ kg-volume จริง (ต่างจาก "Volume สูงต่อเนื่อง" ใน detectDeloadSignal/deloadInsight
  // ด้านล่างของไฟล์นี้ ซึ่งอ้างอิง weeklyVolumeKg จริงๆ — จุดนั้นใช้คำว่า Volume ถูกต้องแล้ว ไม่แตะ)
  if (muscleRecommendation.scheduleOverriddenFrom) {
    msg += ` — ตามตารางคือ${muscleRecommendation.scheduleOverriddenFrom} แต่ฝึกเกินเป้าหมายสัปดาห์นี้แล้ว จึงแนะนำเน้น${muscleRecommendation.muscleGroup}แทน`
  }

  // ฟีดแบ็ก "Recovery ต่ำ + Volume ยังไม่ถึงเป้า → เตือน" (เคสที่ 3 ใน Recommendation Engine decision
  // table) — ต่างจาก scheduleOverriddenFrom (ซึ่งสลับกลุ่มไปเลย) เคสนี้ยังแนะนำกลุ่มเดิมอยู่ แต่ร่างกาย
  // ยังไม่พร้อมเต็มที่ ต้องเตือนให้ลดความหนักแทนที่จะพูดเหมือนแนะนำปกติ
  if (muscleRecommendation.lowRecoveryCaution) {
    msg += ` — แต่ยังฟื้นตัวไม่เต็มที่ (ต่ำกว่า 65%) แนะนำลดความหนักหรือเลื่อนออกไปก่อน`
  }

  if (balance.status === 'push_dominant') {
    msg += ' — และควรแทรกท่าดึง (หลัง) เพิ่ม เพราะสัปดาห์นี้ฝั่งดันเยอะกว่า'
  } else if (balance.status === 'pull_dominant') {
    msg += ' — และควรแทรกท่าดัน (อก/ไหล่) เพิ่ม เพราะสัปดาห์นี้ฝั่งดึงเยอะกว่า'
  }

  if (trainingBalance?.regionWarning && trainingBalance.recommendedMuscles.length > 0) {
    msg += ` — ${trainingBalance.regionWarning} ลองเพิ่ม ${trainingBalance.recommendedMuscles.join(' + ')} ในเซสชันถัดไป`
  }

  return msg
}

// ==================== Smart Deload Detector ====================
// ตรวจจับสัญญาณ "ควร Deload" จาก 2 มิติ: (1) Volume สูงต่อเนื่องหลายสัปดาห์โดยไม่มีสัปดาห์ไหนลดโหลดลง
// เลย (สัญญาณสะสมความเหนื่อยจากปริมาณ) และ (2) RPE เฉลี่ยของสัปดาห์ล่าสุดสูงต่อเนื่อง (สัญญาณสะสม
// ความเหนื่อยจากความหนัก) — ทั้งสองมิติเป็นหลักการ periodization มาตรฐานที่ใช้กันทั่วไปในโปรแกรมฝึก
// ความแข็งแรง: ฝึกหนักต่อเนื่อง 3-4 สัปดาห์แล้วค่อยลดโหลดลง (deload) 40-50% เพื่อให้ร่างกายฟื้นตัวเต็มที่
// ป้องกัน overtraining/บาดเจ็บสะสม
export interface DeloadSignal {
  // จำนวนสัปดาห์ติดต่อกัน (นับจากล่าสุดย้อนกลับ) ที่ volume ยังไม่มีสัปดาห์ไหนลดลงมากพอจะนับเป็นการพัก
  weeksElevated: number
  avgRecentRpe: number | null
  shouldDeload: boolean
  rationale: string
}

const DELOAD_MIN_CONSECUTIVE_WEEKS = 3
// สัปดาห์ที่ volume ลดลง >=30% จากสัปดาห์ก่อนหน้า นับว่าเป็นสัปดาห์พักไปแล้ว ตัดสายไม่นับต่อ
const DELOAD_REST_DROP_RATIO = 0.3
const DELOAD_RPE_THRESHOLD = 8.5

// weeklyVolumeKg เรียงจากเก่าไปใหม่ (สัปดาห์ล่าสุดอยู่ท้าย array) — ดู computeRecentWeeklyVolumes
// ใน lib/dashboardStats.ts สำหรับตัวสร้าง input นี้จาก workouts ดิบ
export function detectDeloadSignal(weeklyVolumeKg: number[], avgRecentRpe: number | null): DeloadSignal {
  if (weeklyVolumeKg.length === 0) {
    return { weeksElevated: 0, avgRecentRpe, shouldDeload: false, rationale: '' }
  }

  // บั๊ก (เจอตอนไล่ตรวจทั้งโปรเจครอบใหม่): เดิมเช็คแค่ทิศทางเดียว (curr ลดลงมากกว่า prev = curr คือ
  // สัปดาห์พัก) แต่ไม่เช็คทิศตรงข้าม (prev ต่ำกว่า curr มาก = prev คือสัปดาห์พักที่ curr เพิ่งฟื้นตัวขึ้นมา
  // จาก) ทำให้สัปดาห์พักจริงๆ ที่อยู่ตรงกลาง (ไม่ใช่ปลายสุดของ array) ถูกนับรวมเข้า weeksElevated ผิดๆ เช่น
  // [1000,1000,1000,1000,200,1000,1000] (สัปดาห์ที่ 5 พัก 80% แล้วสัปดาห์ 6-7 กลับมาปกติ) — เดิมนับ
  // weeksElevated=3 (ข้ามสัปดาห์พักไปเงียบๆ) ทำให้ระบบแนะนำ Deload ซ้ำทันทีหลังจากผู้ใช้เพิ่งพักไปเอง —
  // เพิ่มเช็คทิศตรงข้ามด้วย (prev < curr * (1 - RATIO) = prev เป็นสัปดาห์พัก) ให้หยุดนับตรงนั้นเหมือนกัน
  let weeksElevated = 1
  for (let i = weeklyVolumeKg.length - 1; i > 0; i--) {
    const curr = weeklyVolumeKg[i]
    const prev = weeklyVolumeKg[i - 1]
    if (prev <= 0) break
    const currIsRestWeek = curr < prev * (1 - DELOAD_REST_DROP_RATIO)
    const prevIsRestWeek = prev < curr * (1 - DELOAD_REST_DROP_RATIO)
    if (currIsRestWeek || prevIsRestWeek) break
    weeksElevated++
  }

  const volumeSignal = weeklyVolumeKg.length >= DELOAD_MIN_CONSECUTIVE_WEEKS && weeksElevated >= DELOAD_MIN_CONSECUTIVE_WEEKS
  const rpeSignal = avgRecentRpe !== null && avgRecentRpe >= DELOAD_RPE_THRESHOLD
  const shouldDeload = volumeSignal || rpeSignal

  let rationale = ''
  if (volumeSignal && rpeSignal) {
    rationale = `Volume สูงต่อเนื่อง ${weeksElevated} สัปดาห์ และ RPE เฉลี่ยล่าสุด ${avgRecentRpe} — สัญญาณเหนื่อยสะสมชัดเจนทั้งสองด้าน`
  } else if (volumeSignal) {
    rationale = `Volume สูงต่อเนื่อง ${weeksElevated} สัปดาห์ โดยไม่มีสัปดาห์ไหนลดโหลดลงเลย`
  } else if (rpeSignal) {
    rationale = `RPE เฉลี่ยสัปดาห์ล่าสุด ${avgRecentRpe} หนักต่อเนื่อง`
  }

  return { weeksElevated, avgRecentRpe, shouldDeload, rationale }
}

// แปลง DeloadSignal เป็น Insight การ์ดเดียวกับที่หน้า Coach ใช้อยู่แล้ว — คืนค่า null ถ้ายังไม่ถึง
// เกณฑ์ (ไม่ต้องเตือนเปล่าๆ เหมือน Insight ตัวอื่นในไฟล์นี้)
export function deloadInsight(signal: DeloadSignal): Insight | null {
  if (!signal.shouldDeload) return null
  return {
    id: 'deload-recommendation',
    kind: 'warning',
    icon: '🪫',
    title: 'แนะนำ Deload Week',
    detail: `${signal.rationale} — ลอง Deload สัปดาห์นี้: ลด volume ลง 40-50% (ลดเซ็ต หรือลดน้ำหนัก ~10-20%) เพื่อให้ร่างกายฟื้นตัวเต็มที่ก่อนกลับไปหนักต่อ`,
  }
}

// ==================== เตือนท่าที่ข้ามไปในเซสชันโปรแกรมล่าสุด ====================
// เทียบท่าทั้งหมดที่ตั้งไว้ในแผนของวันนั้น กับท่าที่ติ๊กว่าทำแล้วจริง (program_completions)
// เจตนาใช้กับ "เซสชันล่าสุดที่ผ่านโปรแกรม" เท่านั้น (ไม่ย้อนดูทุกวันในอดีต) กันไม่ให้เตือนซ้ำซ้อนท่วมท้น
export interface PlanExercise {
  id: string
  exercise_name: string
  muscle_group: string | null
}

export function buildSkippedExerciseInsight(
  dayTitle: string,
  dayDate: string,
  planExercises: PlanExercise[],
  completedExerciseIds: Set<string>
): Insight | null {
  const skipped = planExercises.filter((ex) => !completedExerciseIds.has(ex.id))
  if (skipped.length === 0) return null

  const names = skipped.map((ex) => ex.exercise_name).join(', ')
  return {
    id: 'skipped-exercises',
    kind: 'warning',
    icon: '⏭️',
    title: `ข้ามไป ${skipped.length} ท่าจาก "${dayTitle}"`,
    detail: `${names} — ลองแทรกในเซสชันหน้า (${relativeDayLabel(dayDate)})`,
  }
}

// ==================== สัดส่วนร่างกาย -> Insight ====================
// เดิม AI Coach card มีแค่ประโยคสรุปเดียว (computeAIDailySummary) ไม่ได้ดึงเทรนด์น้ำหนัก/
// ไขมัน/กล้ามเนื้อจากหน้า Health มาแสดงเลย — สามฟังก์ชันนี้แปลง MetricDelta (จาก
// lib/bodyMetricsSummary) เป็น Insight การ์ดเดียวกับที่ dashboard ใช้อยู่แล้ว เพื่อให้ AI Coach
// วิเคราะห์ "แนวโน้มร่างกาย" ได้เหมือนกับตัวเลขที่ BodyMetricsRow โชว์อยู่ด้านบนสุดของหน้า
// คืนค่า null เมื่อยังไม่มี delta ให้เทียบ (ข้อมูลจุดเดียว) กันไม่ให้เตือนเปล่าๆ

// ไขมันในร่างกาย: ลดลง = แนวโน้มดีขึ้น, เพิ่มขึ้น = เตือนให้จับตา
export function bodyFatTrendInsight(bodyFatPct: MetricDelta, periodLabel: string | null): Insight | null {
  if (bodyFatPct.delta == null || bodyFatPct.isGood == null) return null
  const period = periodLabel ?? 'จากครั้งก่อน'
  const absDelta = Math.abs(bodyFatPct.delta).toFixed(1)

  if (bodyFatPct.isGood) {
    return {
      id: 'trend-body-fat',
      kind: 'positive',
      icon: '📉',
      title: 'แนวโน้มดีขึ้น',
      detail: `ไขมันในร่างกายลดลง ${absDelta}% ${period}`,
    }
  }
  return {
    id: 'trend-body-fat',
    kind: 'warning',
    icon: '📈',
    title: 'ไขมันในร่างกายเพิ่มขึ้น',
    detail: `เพิ่มขึ้น ${absDelta}% ${period} — ลองทบทวนอาหาร/คาร์ดิโอ`,
  }
}

// กล้ามเนื้อโครงร่าง: เพิ่มขึ้น = ดี (ชม + ให้กำลังใจทำต่อ), ลดลง = เตือน
export function muscleMassTrendInsight(
  skeletalMuscleKg: MetricDelta,
  periodLabel: string | null,
  displayDelta: number,
  unit: string
): Insight | null {
  if (skeletalMuscleKg.delta == null || skeletalMuscleKg.isGood == null) return null
  const period = periodLabel ?? 'จากครั้งก่อน'
  const absDelta = Math.abs(displayDelta).toFixed(1)

  if (skeletalMuscleKg.isGood) {
    return {
      id: 'trend-muscle-mass',
      kind: 'positive',
      icon: '💪',
      title: 'กล้ามเนื้อเพิ่มขึ้น',
      detail: `กล้ามเนื้อโครงร่างเพิ่มขึ้น ${absDelta} ${unit} ${period} — รักษาโปรแกรมแบบนี้ต่อเนื่อง`,
    }
  }
  return {
    id: 'trend-muscle-mass',
    kind: 'warning',
    icon: '💪',
    title: 'กล้ามเนื้อลดลง',
    detail: `กล้ามเนื้อโครงร่างลดลง ${absDelta} ${unit} ${period} — เช็คว่ากินโปรตีน/เทรนพอไหม`,
  }
}

// ==================== ความถี่การฝึกรายสัปดาห์ -> Insight ====================
// เทียบจำนวนวันที่ฝึกแล้วสัปดาห์นี้กับเป้าหมายรายสัปดาห์ — เตือนเฉพาะตอนที่ยังตามหลังเป้าจริงๆ
// (เผื่อสัดส่วนวันที่ผ่านไปแล้วของสัปดาห์ ไม่เตือนทันทีตั้งแต่ต้นสัปดาห์)
export function workoutFrequencyInsight(
  thisWeekWorkoutDays: number,
  weeklyWorkoutGoal: number,
  dayOfWeek1to7: number
): Insight | null {
  if (weeklyWorkoutGoal <= 0 || thisWeekWorkoutDays >= weeklyWorkoutGoal) return null

  const proratedGoal = (weeklyWorkoutGoal * dayOfWeek1to7) / 7
  if (thisWeekWorkoutDays >= proratedGoal * 0.8) return null // ยังตามเป้าอยู่ ไม่ต้องเตือน

  const remaining = weeklyWorkoutGoal - thisWeekWorkoutDays
  return {
    id: 'workout-frequency',
    kind: 'warning',
    icon: '🏋️',
    title: 'ควรเพิ่มการฝึก',
    detail: `ออกกำลังกายเพิ่มอีก ${remaining} ครั้ง/สัปดาห์ เพื่อให้ถึงเป้าหมายรายสัปดาห์`,
  }
}
