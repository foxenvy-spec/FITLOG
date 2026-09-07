-- ฟีดแบ็ก "ป่วยวันจันทร์ หายป่วยวันพุธ อยากทำแผนจันทร์ชดเชย" — /session เดิมล็อกกับ todayDayOfWeek()
-- เท่านั้น ไม่มีทางเริ่มแผนของวันอื่นได้เลย ทางเลือกเดิม (Template/log ด้วยวันที่จริง) เขียนแถว workouts
-- ที่ไม่มีร่องรอยว่า "นี่คือแผนของวันไหน" เลย ทำให้กลไก ad-hoc merge ใน session/page.tsx (จับคู่แค่
-- exercise_name ที่ log วันเดียวกัน) ดึงท่าของแผนอื่นมาปนกับท่าของวันจริงเป็นก้อนเดียว (19 ท่าที่ดูสับสน)
--
-- เพิ่ม program_day_id ให้ workouts บันทึกได้ตรงๆ ว่า "เซ็ตนี้ทำเพื่อแผนวันไหน" แยกจาก performed_at
-- (วันที่ฝึกจริง) — nullable เพราะ workouts ที่มาจาก /log แบบอิสระ (ไม่ผูกแผนเลย) ยังต้องมีอยู่ได้เหมือนเดิม
-- on delete set null (ไม่ลบประวัติการฝึกถ้าแผนวันนั้นถูกลบทิ้งภายหลัง)

alter table public.workouts
  add column if not exists program_day_id uuid references public.program_days (id) on delete set null;

create index if not exists workouts_program_day_id_idx on public.workouts (program_day_id);
