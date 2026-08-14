-- ฟีดแบ็ก "แสดง 7/8 ทั้งๆที่ประวัติบันทึกไป 8 ท่า" — program_completions เดิมผูก FK กับ
-- program_exercises เท่านั้น (not null) ท่าที่ผู้ใช้กด "เพิ่มท่า" เองระหว่างเซสชัน (ad-hoc — ไม่มีแถว
-- program_exercises ให้ผูก) จึงไม่เคยมีทางบันทึก "จบท่า" ลงตารางนี้ได้เลย แม้จะทำเสร็จจริงก็ตาม
-- (session/page.tsx เดิมข้ามการ insert ไปตรงๆ เพื่อไม่ให้ FK constraint พัง) ทำให้ตัวนับ "completed"
-- บน Dashboard นับท่า ad-hoc ที่เสร็จแล้วไม่ได้
--
-- เพิ่ม workout_id ให้ผูกกับท่า ad-hoc แทนได้ (อ้างอิงแถว workouts ที่ persistSets สร้างไว้อยู่แล้ว)
-- โดยแถวหนึ่งต้องมีค่าใดค่าหนึ่งระหว่าง program_exercise_id/workout_id เท่านั้น (ไม่ใช่ทั้งคู่ ไม่ใช่
-- ไม่มีเลย) บังคับด้วย check constraint — unique index แยกต่างหากสำหรับกรณี workout_id (1 completion
-- ต่อ 1 แถว workout พอ ไม่ต้องมี completed_at ร่วมด้วยเพราะ workout_id เจาะจงอยู่แล้วว่าเป็นของวันไหน)

alter table public.program_completions
  alter column program_exercise_id drop not null,
  add column if not exists workout_id uuid references public.workouts (id) on delete cascade;

alter table public.program_completions
  drop constraint if exists program_completions_exercise_or_workout_check;
alter table public.program_completions
  add constraint program_completions_exercise_or_workout_check
  check ((program_exercise_id is not null) <> (workout_id is not null));

create unique index if not exists program_completions_user_workout_unique
  on public.program_completions (user_id, workout_id)
  where workout_id is not null;
