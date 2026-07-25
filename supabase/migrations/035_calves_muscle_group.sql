-- แยก "น่อง" (Calves) ออกมาเป็นกลุ่มกล้ามเนื้อของตัวเอง แทนที่จะถูกนับรวมอยู่ใน "ขา" เหมือนเดิม
-- (ดู VOLUME_MUSCLES / RECOVERY_MUSCLES ใน lib/muscle-groups.ts ที่เพิ่ม 'น่อง' เข้าไปคู่กัน)
--
-- 1) เพิ่มคอลัมน์ calves ในตาราง weekly_volume_targets (migration 005) ให้ผู้ใช้ตั้งเป้าหมาย
--    เซ็ต/สัปดาห์แยกจากขาได้เหมือนกลุ่มอื่น
-- 2) เปลี่ยน primary_muscle ของท่าที่เป็นท่าน่องล้วนๆ ในคลังท่า (exercise_library) จาก 'ขา' เป็น
--    'น่อง' ให้ท่าที่ log ใหม่นับเข้ากลุ่มน่องอัตโนมัติ
--
-- หมายเหตุ: ตั้งใจไม่แตะ workouts ที่ผู้ใช้บันทึกไปแล้วในอดีต (ยัง muscle_group = 'ขา' เหมือนเดิม)
-- เพื่อไม่ให้ประวัติการเทรนเก่าเปลี่ยนไปย้อนหลังโดยที่ผู้ใช้ไม่ได้ขอ — มีผลกับท่าที่ log ใหม่หลังจากนี้เท่านั้น

alter table public.weekly_volume_targets add column if not exists calves numeric;

update public.exercise_library
set primary_muscle = 'น่อง'
where primary_muscle = 'ขา'
  and (
    id ilike '%calf%'
    or name ilike '%calf%'
    or name_th ilike '%น่อง%'
  );
