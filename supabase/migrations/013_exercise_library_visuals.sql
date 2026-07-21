-- 013_exercise_library_visuals.sql
-- เพิ่ม 2 คอลัมน์สำหรับฟีเจอร์รูปภาพ + ไดอะแกรมกล้ามเนื้อ (ดู README ส่วน "คลังท่าออกกำลังกาย — รูป/ไดอะแกรม"):
--   image_url            — ลิงก์รูปสาธิตท่า (จาก free-exercise-db หรือรูปที่อัปโหลดเอง), null ได้ถ้ายังไม่มี
--   highlighter_muscles  — ชื่อมัดกล้ามเนื้อตาม slug ของไลบรารี react-body-highlighter (เช่น 'chest','triceps')
--                          ใช้ render ไดอะแกรมคนไฮไลต์กล้ามเนื้อ แยกจาก primary_muscle/secondary_muscles
--                          ที่เป็นภาษาไทยระดับกลุ่มใหญ่ (ใช้กับ dashboard/recovery เดิม) — อันนี้ละเอียดกว่า
--                          เพราะ react-body-highlighter แยกมัดย่อย เช่น หน้าอกไม่มีแยก แต่ไหล่แยก
--                          front-deltoids/back-deltoids, หลังแยก trapezius/upper-back/lower-back เป็นต้น
-- รันซ้ำได้ปลอดภัย

alter table public.exercise_library add column if not exists image_url text;
alter table public.exercise_library add column if not exists highlighter_muscles text[] not null default '{}';
