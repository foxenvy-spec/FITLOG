-- 040_exercise_library_images_custom.sql
-- สร้างอัตโนมัติจาก scripts/match-exercise-images-custom.mjs — จับคู่ชื่อไฟล์ใน public/images/exercises/
-- (ชุดรูปที่ทำเอง) กับท่าในตาราง exercise_library
-- จับคู่ได้ 32/300 ท่า (ที่เหลือดู scripts/match-exercise-images-custom.unmatched.json)
-- รันซ้ำได้ปลอดภัย

update public.exercise_library as e
set image_url = v.url
from (values
  ('bench-press', '/images/exercises/Bench%20Press.png'),
  ('decline-bench-press', '/images/exercises/Decline%20Bench%20Press.png'),
  ('dumbbell-bench-press', '/images/exercises/Dumbbell%20Bench%20Press.png'),
  ('incline-bench-press', '/images/exercises/Incline%20Bench%20Press.png'),
  ('dumbbell-pullover', '/images/exercises/Dumbbell%20Pullover.png'),
  ('hanging-leg-raise', '/images/exercises/Hanging%20Leg%20Raise.png'),
  ('plank', '/images/exercises/Plank.png'),
  ('bulgarian-split-squat', '/images/exercises/Bulgarian%20Split%20Squat.png'),
  ('hip-thrust', '/images/exercises/Hip%20Thrust.png'),
  ('leg-curl', '/images/exercises/Leg%20Curl.png'),
  ('leg-extension', '/images/exercises/Leg%20Extension.png'),
  ('leg-press', '/images/exercises/Leg%20Press.png'),
  ('romanian-deadlift', '/images/exercises/Romanian%20Deadlift.png'),
  ('squat', '/images/exercises/Squat.png'),
  ('overhead-triceps-extension', '/images/exercises/Overhead%20Triceps%20Extension.png'),
  ('deadlift', '/images/exercises/Deadlift.png'),
  ('dumbbell-row', '/images/exercises/Dumbbell%20Row.png'),
  ('pull-up', '/images/exercises/Pull%20Up.png'),
  ('dumbbell-shoulder-press', '/images/exercises/Dumbbell%20Shoulder%20Press.png'),
  ('lateral-raise', '/images/exercises/Lateral%20Raise.png'),
  ('plate-loaded-row-machine', '/images/exercises/Seated%20Row%20Machine.png'),
  ('lat-pulldown-machine', '/images/exercises/Lat%20Pulldown%20Machine.png'),
  ('goblet-squat', '/images/exercises/Goblet%20Squat.png'),
  ('dumbbell-calf-raise', '/images/exercises/Dumbbell%20Calf%20Raise.png'),
  ('standing-calf-raise-machine', '/images/exercises/Standing%20Calf%20Raise%20Machine.png'),
  ('machine-shoulder-press', '/images/exercises/Machine%20Shoulder%20Press.png'),
  ('machine-lateral-raise', '/images/exercises/Machine%20Lateral%20Raise.png'),
  ('machine-rear-delt-fly', '/images/exercises/Machine%20Rear%20Delt%20Fly.png'),
  ('ez-bar-curl', '/images/exercises/EZ-Bar%20Curl.png'),
  ('incline-dumbbell-curl', '/images/exercises/Incline%20Dumbbell%20Curl.png'),
  ('dumbbell-kickback', '/images/exercises/Dumbbell%20Triceps%20Kickback.png'),
  ('ab-crunch-machine', '/images/exercises/Ab%20Crunch%20Machine.png')
) as v(id, url)
where e.id = v.id;
