-- Finish-for-Today State Contract v1 — เก็บ "วันที่ล่าสุด" ที่ผู้ใช้กด "จบก่อน" ใน /session แทน boolean
-- ตรงๆ เพื่อให้ cross-day expiry เกิดขึ้นเองโดยไม่ต้องมี cleanup job: เทียบ finished_workout_for_date กับ
-- today() ตอน read ก็พอ (ดู lib/finishForToday.ts's isFinishedToday()) วันถัดไปค่าเก่าที่ค้างอยู่ก็ไม่ตรง
-- กับ today อีกต่อไป กลายเป็น false เองโดยไม่ต้องเขียนอะไรเพิ่ม
--
-- แยกจาก program_completions/program_completion_overrides โดยเจตนา — คนละ semantic domain (training
-- fact vs user intent, ดู Finish-for-Today State Contract v1 ที่ล็อกไว้) ไม่ผูกกับ session_id เพราะ
-- session_id ถูกเคลียร์ทิ้งพร้อมกันทั้งกรณี "จบก่อน" และจบครบปกติ (ดู endSession() ใน session/page.tsx)
alter table public.profiles
  add column if not exists finished_workout_for_date date;
