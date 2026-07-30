-- 040_exercise_library_images_custom.sql
-- สร้างอัตโนมัติจาก scripts/match-exercise-images-custom.mjs — จับคู่ชื่อไฟล์ใน public/images/exercises/
-- (ชุดรูปที่ทำเอง) กับท่าในตาราง exercise_library
-- จับคู่ได้ 1/300 ท่า (ที่เหลือดู scripts/match-exercise-images-custom.unmatched.json)
-- รันซ้ำได้ปลอดภัย

update public.exercise_library as e
set image_url = v.url
from (values
  ('incline-bench-press', '/images/exercises/Incline%20Bench%20Press.png')
) as v(id, url)
where e.id = v.id;
