-- รูปที่ผู้ใช้ทำเองสำหรับ Incline Bench Press (ทดสอบระบบรูป custom แทนรูปจาก free-exercise-db)
-- ไฟล์อยู่ที่ public/images/exercises/incline-bench-press.png (static asset ในแอปเอง ไม่ผ่าน
-- Supabase Storage เพราะไม่ต้องพึ่ง auth/RLS สำหรับรูปที่มากับตัวโค้ดแบบนี้)
-- รันซ้ำได้ปลอดภัย

update public.exercise_library
set image_url = '/images/exercises/incline-bench-press.png'
where id = 'incline-bench-press';
