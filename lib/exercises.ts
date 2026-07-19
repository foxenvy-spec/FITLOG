// Exercise matching utilities — ฟังก์ชันล้วน (pure) ที่ทำงานบนรายการ ExerciseDef ที่ส่งเข้ามา
// ข้อมูลจริงดึงจากตาราง exercise_library ผ่าน useExerciseLibrary() hook (ดู lib/useExerciseLibrary.ts)
// ไฟล์นี้ไม่มี network call เอง เพื่อให้เทสและ reuse ได้ง่ายโดยไม่ต้องพึ่ง Supabase
export type { ExerciseDef, Equipment } from './exerciseLibrary'
import type { ExerciseDef } from './exerciseLibrary'

function normalize(s: string) {
  return s.toLowerCase().trim()
}

export function searchExercises(exercises: ExerciseDef[], query: string, limit = 8): ExerciseDef[] {
  const q = normalize(query)
  if (!q) return []
  const scored = exercises.map((ex) => {
    const name = normalize(ex.name)
    const nameTh = normalize(ex.nameTh)
    const aliases = ex.aliases.map(normalize)
    let score = -1
    if (name === q || nameTh === q) score = 100
    else if (name.startsWith(q) || nameTh.startsWith(q)) score = 80
    else if (name.includes(q) || nameTh.includes(q)) score = 60
    else if (aliases.some((a) => a.includes(q))) score = 50
    return { ex, score }
  })
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.ex)
}

export function exercisesByMuscle(exercises: ExerciseDef[], muscleGroup: string): ExerciseDef[] {
  return exercises.filter((ex) => ex.muscleGroup === muscleGroup)
}

// เดา primary/secondary muscle จากชื่อที่ "พิมพ์เอง" (ไม่ได้เลือกจาก dropdown)
// รองรับหลายชื่อเรียกของท่าเดียวกัน (เช่น "Bench Press", "Barbell Bench Press", "Flat BB Bench"
// ล้วน map ไปที่ท่าเดียวกัน) โดยเทียบแบบ exact match กับ name / nameTh / aliases ทั้งหมด
// (case-insensitive, ตัดช่องว่างหัวท้าย) — ต่างจาก searchExercises ที่ใช้ partial match สำหรับ dropdown
export function findExerciseByName(exercises: ExerciseDef[], query: string): ExerciseDef | undefined {
  const q = normalize(query)
  if (!q) return undefined
  return exercises.find((ex) => {
    if (normalize(ex.name) === q || normalize(ex.nameTh) === q) return true
    return ex.aliases.some((a) => normalize(a) === q)
  })
}

// ============================================================
// Smart import matching — ใช้ตอน import Excel เพื่อจับคู่ชื่อท่าที่ผู้ใช้พิมพ์เอง
// (สะกดต่างกันเล็กน้อย มีขีดกลาง ขาดคำ ฯลฯ) เข้ากับท่าใน Library
// ============================================================

export type ExerciseMatchType = 'exact' | 'loose' | 'fuzzy'

export interface ExerciseMatch {
  exercise: ExerciseDef
  matchType: ExerciseMatchType
  // ข้อความ (ชื่อ/alias) ใน Library ที่จับคู่ได้ — ใช้โชว์ผู้ใช้ว่าทำไมถึง match
  matchedText: string
}

// ตัดขีดกลาง จุด วงเล็บ ออก แล้วยุบช่องว่างซ้ำ เพื่อเทียบชื่อที่เขียนต่างรูปแบบกัน
// เช่น "EZ-Bar Curl" กับ "EZ Bar Curl" กับ "EZ.Bar.Curl" ให้กลายเป็นข้อความเดียวกัน
function normalizeLoose(s: string): string {
  return normalize(s)
    .replace(/[-_.]/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(s: string): string[] {
  return s.split(' ').filter(Boolean)
}

// edit distance มาตรฐาน — ใช้เทียบคำต่อคำเวลาสะกดผิดเล็กน้อย
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[] = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = tmp
    }
  }
  return dp[n]
}

// สองคำถือว่า "เหมือนกัน" ถ้าตรงเป๊ะ หรือสะกดต่างกันแค่ 1 ตัวอักษร (พิมพ์ผิด/ตกหล่น)
function tokensSimilar(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length >= 4 && b.length >= 4 && levenshtein(a, b) <= 1) return true
  return false
}

// คะแนนความคล้ายแบบนับคำที่ตรงกัน (คล้าย Jaccard) — ทนต่อการขาด/เกินคำได้บางคำ
// เช่น "ez curl" (2 คำ) เทียบกับ "ez bar curl" (3 คำ) ตรงกัน 2 คำ จาก union 3 คำ = 0.67
function tokenOverlapScore(queryTokens: string[], candTokens: string[]): number {
  if (queryTokens.length === 0 || candTokens.length === 0) return 0
  let matched = 0
  const usedCand = new Set<number>()
  for (const qt of queryTokens) {
    for (let i = 0; i < candTokens.length; i++) {
      if (usedCand.has(i)) continue
      if (tokensSimilar(qt, candTokens[i])) {
        matched++
        usedCand.add(i)
        break
      }
    }
  }
  const unionSize = queryTokens.length + candTokens.length - matched
  return matched / unionSize
}

const FUZZY_SCORE_THRESHOLD = 0.5

// จับคู่ชื่อท่าที่ import เข้ามากับ Library แบบมีลำดับขั้น ไล่จากเข้มงวดไปหลวม:
// 1) exact   — เหมือน findExerciseByName เดิม (ตรงเป๊ะกับ name/nameTh/alias)
// 2) loose   — ตรงกันหลังตัดขีดกลาง/จุด/วงเล็บออก เช่น "EZ-Bar Curl" == "EZ Bar Curl"
// 3) fuzzy   — คะแนนคำที่ตรงกัน (token overlap) เกิน 50% เผื่อพิมพ์ขาดคำ/สะกดผิดเล็กน้อย
//              เช่น "EZ Curl" จะ fuzzy-match กับ alias "EZ Bar Curl" ได้ (ตรง 2 ใน 3 คำ)
// คืนค่า undefined ถ้าไม่พบท่าที่น่าจะใช่เลย
export function matchExercise(exercises: ExerciseDef[], query: string): ExerciseMatch | undefined {
  const raw = query.trim()
  if (!raw) return undefined

  // 1) exact
  const exact = findExerciseByName(exercises, raw)
  if (exact) return { exercise: exact, matchType: 'exact', matchedText: exact.name }

  const looseQuery = normalizeLoose(raw)
  if (!looseQuery) return undefined

  // 2) loose
  for (const ex of exercises) {
    const candidates = [ex.name, ex.nameTh, ...ex.aliases]
    for (const c of candidates) {
      if (normalizeLoose(c) === looseQuery) {
        return { exercise: ex, matchType: 'loose', matchedText: c }
      }
    }
  }

  // 3) fuzzy
  const queryTokens = tokenize(looseQuery)
  let best: { ex: ExerciseDef; text: string; score: number } | null = null
  for (const ex of exercises) {
    const candidates = [ex.name, ex.nameTh, ...ex.aliases]
    for (const c of candidates) {
      const candNorm = normalizeLoose(c)
      if (candNorm.length < 2) continue // กันข้อความว่าง/สั้นจนไม่มีความหมาย
      const score = tokenOverlapScore(queryTokens, tokenize(candNorm))
      if (score >= FUZZY_SCORE_THRESHOLD && (!best || score > best.score)) {
        best = { ex, text: c, score }
      }
    }
  }
  if (best) return { exercise: best.ex, matchType: 'fuzzy', matchedText: best.text }

  return undefined
}
