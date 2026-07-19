import { useQuery } from '@tanstack/react-query'
import { fetchExerciseLibrary } from './exerciseLibrary'

// ท่าออกกำลังกายมาตรฐานแทบไม่เปลี่ยน — ตั้ง staleTime ยาวเป็นชั่วโมงเพื่อลดการยิง query ซ้ำ
// ทุกครั้งที่เปิดหน้า log/import/exercises ในเซสชันเดียวกัน
export function useExerciseLibrary() {
  return useQuery({
    queryKey: ['exercise-library'],
    queryFn: fetchExerciseLibrary,
    staleTime: 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
  })
}
