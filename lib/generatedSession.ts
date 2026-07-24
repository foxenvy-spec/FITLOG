import type { ProgramExercise } from './types'
import type { MuscleGroup } from './muscle-groups'

// เก็บโปรแกรมที่ AI Coach generate ไว้ผ่าน sessionStorage (ฝั่ง client ล้วนๆ ไม่ต้องเขียนลง DB)
// แล้วส่งต่อให้ /session อ่านตอนกด "Start Workout" — ดู CoachPage (เขียน) และ SessionPage (อ่าน)
// ใช้ sessionStorage ไม่ใช่ localStorage เพราะเป็นข้อมูลชั่วคราวของ "รอบนี้" เท่านั้น ไม่ต้องอยู่ข้ามวัน
export const GENERATED_SESSION_STORAGE_KEY = 'fitlog:generatedSession'

export interface StoredGeneratedSession {
  muscleGroup: MuscleGroup
  title: string
  createdAt: string
  exercises: ProgramExercise[]
}
