-- เพศ ใช้คำนวณเกณฑ์มาตรฐาน "สัดส่วนน้ำในร่างกาย (%)" ที่แยกช่วงมาตรฐานตามเพศ
-- (ผู้ชาย 55-65%, ผู้หญิง 45-60%) — ดู lib/bodyComposition.ts และการ์ด BODY WATER
-- ในหน้า Health ไม่บังคับกรอก (null ได้) ถ้ายังไม่ตั้งค่า การ์ดน้ำในร่างกายจะยังไม่ขึ้นป้ายสถานะ

alter table public.profiles
  add column if not exists sex text check (sex is null or sex in ('male', 'female'));
