import type { MuscleGroup } from './muscle-groups'

export interface WarmupMove {
  name: string
  duration: string
}

// ฟีดแบ็ก "Dynamic Warm-up & Stretch Guide — ก่อนเริ่มเซ็ตแรก แนะนำท่ายืดเหยียดเฉพาะกล้ามเนื้อมัดที่จะ
// เล่นวันนี้" — ท่าเหล่านี้เป็นท่าวอร์มอัป/ยืดเหยียดทั่วไปที่รู้จักกันแพร่หลาย (หลายท่าตรงกับชื่อท่าที่มี
// อยู่แล้วในคลังท่าของแอป เช่น Cat-Cow Stretch, Arm Circles, Leg Swings, Ankle Circles, Shoulder
// Dislocates, Jumping Jacks — ดู supabase/migrations/022_exercise_library_seed_other.sql) ไม่ใช่
// คำแนะนำทางการแพทย์เฉพาะบุคคล — เป็นข้อมูลคงที่ ไม่ได้ดึงจาก DB เพราะคลังท่าไม่มีคอลัมน์แยกประเภท
// "ท่าวอร์มอัป" ออกจากท่าฝึกหลักเลย
export const WARMUP_GUIDE: Record<MuscleGroup, WarmupMove[]> = {
  'อก': [
    { name: 'Arm Circles (หมุนแขนเป็นวงกลม)', duration: '30 วินาที' },
    { name: "World's Greatest Stretch", duration: '5 ครั้ง/ข้าง' },
    { name: 'Push-up เบาๆ ไม่ลงน้ำหนักเต็ม', duration: '10 ครั้ง' },
  ],
  'หลัง': [
    { name: 'Cat-Cow Stretch (แมว-วัว)', duration: '10 ครั้ง' },
    { name: "World's Greatest Stretch", duration: '5 ครั้ง/ข้าง' },
    { name: 'Thoracic Spine Rotation (หมุนกระดูกสันหลังช่วงอก)', duration: '8 ครั้ง/ข้าง' },
  ],
  'ขา': [
    { name: 'Leg Swings (แกว่งขา)', duration: '10 ครั้ง/ข้าง' },
    { name: 'Bodyweight Squat เบาๆ', duration: '10 ครั้ง' },
    { name: 'Standing Quad Stretch (ยืนยืดต้นขาหน้า)', duration: '20 วินาที/ข้าง' },
  ],
  'น่อง': [
    { name: 'Ankle Circles (หมุนข้อเท้า)', duration: '10 ครั้ง/ข้าง' },
    { name: 'Calf Raise เบาๆ', duration: '15 ครั้ง' },
    { name: 'High Knees', duration: '20 วินาที' },
  ],
  'ไหล่': [
    { name: 'Shoulder Dislocates (โชลเดอร์ดิสโลเคต)', duration: '10 ครั้ง' },
    { name: 'Arm Circles (หมุนแขนเป็นวงกลม)', duration: '30 วินาที' },
  ],
  'แขน': [
    { name: 'Arm Circles (หมุนแขนเป็นวงกลม)', duration: '30 วินาที' },
    { name: "Waiter's Curl เบาๆ ไม่ใส่น้ำหนัก", duration: '10 ครั้ง' },
  ],
  'แกนกลางลำตัว': [
    { name: 'Cat-Cow Stretch (แมว-วัว)', duration: '10 ครั้ง' },
    { name: 'Thoracic Spine Rotation (หมุนกระดูกสันหลังช่วงอก)', duration: '8 ครั้ง/ข้าง' },
  ],
  'ทั้งตัว': [
    { name: 'Jumping Jacks (จั๊มพ์ปิ้งแจ็ค)', duration: '30 วินาที' },
    { name: 'High Knees (ไฮนีส์)', duration: '20 วินาที' },
    { name: 'Bear Crawl (แบร์คลอว์)', duration: '20 วินาที' },
  ],
  'อื่นๆ': [
    { name: 'Jumping Jacks (จั๊มพ์ปิ้งแจ็ค)', duration: '30 วินาที' },
    { name: 'Arm Circles (หมุนแขนเป็นวงกลม)', duration: '30 วินาที' },
    { name: 'Leg Swings (แกว่งขา)', duration: '10 ครั้ง/ข้าง' },
  ],
}

const MAX_MOVES = 5

// รวมท่าวอร์มอัปของหลายกลุ่มกล้ามเนื้อเข้าด้วยกัน (วันฝึกส่วนใหญ่คลุมหลายกลุ่ม เช่น "อก • ไหล่ • แขน •
// แกนกลางลำตัว") ตัดซ้ำตามชื่อท่า และจำกัดจำนวนรวมไม่ให้ยาวเกินไปสำหรับ "วอร์มอัป 3 นาที" — เรียงตาม
// ลำดับกลุ่มกล้ามเนื้อที่ส่งเข้ามา (กลุ่มแรก = กลุ่มหลักของวันนั้น ได้ท่าก่อน)
export function getWarmupMoves(muscleGroups: string[]): WarmupMove[] {
  const seen = new Set<string>()
  const result: WarmupMove[] = []
  for (const mg of muscleGroups) {
    const moves = WARMUP_GUIDE[mg as MuscleGroup] ?? []
    for (const move of moves) {
      if (seen.has(move.name)) continue
      seen.add(move.name)
      result.push(move)
      if (result.length >= MAX_MOVES) return result
    }
  }
  return result
}
