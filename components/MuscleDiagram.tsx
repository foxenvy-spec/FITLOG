'use client'

// ไดอะแกรมคนไฮไลต์กล้ามเนื้อ — ห่อ react-body-highlighter (โอเพนซอร์ส MIT, npmjs.com/package/react-body-highlighter)
// รับ highlighterMuscles ของท่าจาก ExerciseDef (lib/exerciseLibrary.ts) มา render ตรงๆ
// ถ้าท่านั้นยังไม่มีค่า highlighterMuscles (ท่า custom เก่า หรือยังไม่ได้ไล่ทำ) จะไม่ render อะไรเลย
// เพื่อไม่ให้เห็นโครงคนเปล่าๆ ที่ไม่มีการไฮไลต์
import Model, { type IExerciseData } from 'react-body-highlighter'

interface MuscleDiagramProps {
  exerciseName: string
  highlighterMuscles: string[]
  side?: 'front' | 'back'
}

export default function MuscleDiagram({ exerciseName, highlighterMuscles, side = 'front' }: MuscleDiagramProps) {
  if (highlighterMuscles.length === 0) return null

  const data: IExerciseData[] = [{ name: exerciseName, muscles: highlighterMuscles as IExerciseData['muscles'] }]

  return (
    <div className="flex justify-center">
      <Model data={data} side={side} colors={['#E8A33D', '#C1503A']} style={{ width: '10rem' }} />
    </div>
  )
}
