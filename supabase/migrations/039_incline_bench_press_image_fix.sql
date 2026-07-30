-- 038 เผลอผูกรูปผิด (ไฟล์ที่ก็อปมาจริงๆ เป็นรูป mockup อื่นที่ค้างอยู่ในเครื่อง ไม่ใช่รูปที่ผู้ใช้ตั้งใจส่ง)
-- ล้าง image_url กลับเป็นค่าว่างไปก่อน รอผู้ใช้อัปโหลดรูปจริงเองผ่านปุ่ม "+ เพิ่มรูป" ในแอปแทน
-- รันซ้ำได้ปลอดภัย

update public.exercise_library
set image_url = null
where id = 'incline-bench-press' and image_url = '/images/exercises/incline-bench-press.png';
