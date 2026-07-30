-- อายุจริงของผู้ใช้ (ปี) — แยกจาก body_metrics.body_age_years ซึ่งเป็นค่า "อายุร่างกาย" ที่เครื่องชั่ง
-- (InBody/Fitdays ฯลฯ) ประมาณให้ ใช้คำนวณ BMR/TDEE โดยประมาณด้วยสูตร Mifflin-St Jeor
-- (ดู lib/bmr.ts) ร่วมกับ height_cm, sex และน้ำหนักล่าสุด ไม่บังคับกรอก (null ได้)

alter table public.profiles
  add column if not exists age integer check (age is null or (age > 0 and age < 150));
