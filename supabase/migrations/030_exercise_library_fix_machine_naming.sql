-- 030_exercise_library_fix_machine_naming.sql
-- แก้ปัญหา: ท่า "Plate-Loaded Row Machine" และ "Plate-Loaded Lat Pulldown" (จาก 016) ตั้งชื่อ
-- โดยสมมติว่าเครื่องเป็นแบบ "ใส่แผ่นน้ำหนักเอง" (เช่น Hammer Strength) แต่เครื่องส่วนใหญ่ตามฟิตเนส
-- ทั่วไปจริงๆ เป็นแบบ "เสียบหมุดเลือกน้ำหนัก" (selectorized/weight-stack) ต่างกัน ทำให้ผู้ใช้ที่มีเครื่อง
-- แบบเสียบหมุดหาไม่เจอ/รู้สึกว่าชื่อไม่ตรงกับเครื่องจริงที่ใช้ — เปลี่ยนชื่อให้กลางๆ ไม่ระบุกลไกน้ำหนัก
-- (จับ id เดิมไว้ ไม่กระทบ exercise_library_id ที่ผูกอยู่กับ program_exercises/workouts ของผู้ใช้เดิม)
--
-- และเพิ่ม alias คำค้นที่คนมักพิมพ์แต่สลับคำ (เช่น "machine rear" vs alias เดิม "rear delt machine")
-- ซึ่งค้นหาไม่เจอเพราะ searchExercises เช็คแบบ substring ตรงลำดับคำเป๊ะเท่านั้น (ดู lib/exercises.ts)
-- ON CONFLICT ไม่เกี่ยวกับ update ตรงนี้ — ใช้ update ...where id = ... ตรงๆ ปลอดภัย รันซ้ำได้

update public.exercise_library
set
  name = 'Seated Row Machine',
  name_th = 'แมชชีนโรว์ (นั่งดึง)',
  aliases = array['machine row', 'row machine', 'selectorized row', 'pin loaded row', 'hammer strength row']
where id = 'plate-loaded-row-machine';

update public.exercise_library
set
  name = 'Lat Pulldown Machine',
  name_th = 'แมชชีนแลตพูลดาวน์',
  aliases = array['lat pulldown machine', 'machine lat pulldown', 'selectorized lat pulldown', 'plate loaded lat pulldown']
where id = 'lat-pulldown-machine';

update public.exercise_library
set
  aliases = array['rear delt machine', 'machine rear', 'machine rear delt', 'rear delt']
where id = 'reverse-pec-deck-row';
