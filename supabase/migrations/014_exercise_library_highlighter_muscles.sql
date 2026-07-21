-- 014_exercise_library_highlighter_muscles.sql
-- ใส่ค่า highlighter_muscles (slug ของ react-body-highlighter) ให้ท่าที่มีอยู่แล้วทั้งหมด ณ ตอนนี้
-- (53 ท่าเดิมของระบบ + 37 ท่ากลุ่มอกที่เพิ่งเพิ่มใน 012_exercise_library_seed_chest.sql)
-- ท่าที่เพิ่มเข้ามาใหม่ในอนาคต (ชุดหลัง/ขา/ไหล่/แขน/core ฯลฯ) ให้ใส่ค่านี้มาพร้อมกับ INSERT เลย
-- ไม่ต้องมาไล่ update ทีหลังแบบไฟล์นี้อีก — ไฟล์นี้มีไว้เพราะ 53 ท่าเดิมถูกสร้างไว้ก่อนคอลัมน์นี้จะเกิดขึ้น
-- รันซ้ำได้ปลอดภัย (update เฉยๆ ไม่ใช่ insert)

update public.exercise_library as e
set highlighter_muscles = v.muscles
from (values
  -- ===== แกนกลางลำตัว (6) =====
  ('ab-wheel-rollout', array['abs','obliques']),
  ('cable-crunch', array['abs']),
  ('hanging-leg-raise', array['abs']),
  ('plank', array['abs','obliques']),
  ('russian-twist', array['obliques','abs']),
  ('sit-up', array['abs']),

  -- ===== ขา (10) =====
  ('bulgarian-split-squat', array['quadriceps','gluteal','hamstring']),
  ('calf-raise', array['calves']),
  ('front-squat', array['quadriceps','gluteal']),
  ('hip-thrust', array['gluteal','hamstring']),
  ('leg-curl', array['hamstring']),
  ('leg-extension', array['quadriceps']),
  ('leg-press', array['quadriceps','gluteal','hamstring']),
  ('romanian-deadlift', array['hamstring','gluteal','lower-back']),
  ('squat', array['quadriceps','gluteal','hamstring']),
  ('walking-lunge', array['quadriceps','gluteal','hamstring']),

  -- ===== แขน (8) =====
  ('barbell-curl', array['biceps']),
  ('close-grip-bench-press', array['triceps','chest']),
  ('dumbbell-curl', array['biceps']),
  ('hammer-curl', array['biceps','forearm']),
  ('overhead-triceps-extension', array['triceps']),
  ('preacher-curl', array['biceps']),
  ('skull-crusher', array['triceps']),
  ('triceps-pushdown', array['triceps']),

  -- ===== ทั้งตัว (6) =====
  ('burpee', array['chest','quadriceps','abs']),
  ('clean-and-jerk', array['quadriceps','trapezius','front-deltoids','hamstring']),
  ('farmers-carry', array['forearm','trapezius','abs']),
  ('kettlebell-swing', array['gluteal','hamstring','lower-back']),
  ('snatch', array['quadriceps','trapezius','front-deltoids','hamstring']),
  ('thruster', array['quadriceps','front-deltoids','gluteal']),

  -- ===== หลัง (8) =====
  ('barbell-row', array['upper-back','lower-back','biceps']),
  ('deadlift', array['lower-back','hamstring','gluteal','trapezius']),
  ('dumbbell-row', array['upper-back','biceps']),
  ('face-pull', array['back-deltoids','trapezius']),
  ('lat-pulldown', array['upper-back','biceps']),
  ('pull-up', array['upper-back','biceps']),
  ('seated-cable-row', array['upper-back','biceps']),
  ('t-bar-row', array['upper-back','lower-back','biceps']),

  -- ===== ไหล่ (7) =====
  ('arnold-press', array['front-deltoids','triceps']),
  ('dumbbell-shoulder-press', array['front-deltoids','triceps']),
  ('front-raise', array['front-deltoids']),
  ('lateral-raise', array['front-deltoids']),
  ('rear-delt-fly', array['back-deltoids']),
  ('shoulder-press', array['front-deltoids','triceps']),
  ('upright-row', array['front-deltoids','trapezius']),

  -- ===== อก เดิม (8) =====
  ('bench-press', array['chest','triceps','front-deltoids']),
  ('cable-crossover', array['chest']),
  ('chest-dip', array['chest','triceps']),
  ('decline-bench-press', array['chest','triceps']),
  ('dumbbell-bench-press', array['chest','triceps','front-deltoids']),
  ('dumbbell-fly', array['chest']),
  ('incline-bench-press', array['chest','front-deltoids','triceps']),
  ('push-up', array['chest','triceps','front-deltoids']),

  -- ===== อก ใหม่ (37) =====
  ('floor-press-barbell', array['chest','triceps','front-deltoids']),
  ('guillotine-press', array['chest','front-deltoids']),
  ('spoto-press', array['chest','triceps','front-deltoids']),
  ('larsen-press', array['chest','abs']),
  ('wide-grip-bench-press', array['chest','front-deltoids']),
  ('reverse-grip-bench-press', array['chest','biceps']),
  ('pin-press-barbell', array['chest','triceps','front-deltoids']),
  ('incline-dumbbell-press', array['chest','front-deltoids','triceps']),
  ('decline-dumbbell-press', array['chest','triceps']),
  ('incline-dumbbell-fly', array['chest','front-deltoids']),
  ('decline-dumbbell-fly', array['chest']),
  ('single-arm-dumbbell-bench-press', array['chest','triceps','abs']),
  ('dumbbell-floor-press', array['chest','triceps']),
  ('dumbbell-pullover', array['chest','upper-back']),
  ('svend-press', array['chest','front-deltoids']),
  ('neutral-grip-dumbbell-press', array['chest','front-deltoids','triceps']),
  ('machine-chest-press', array['chest','triceps','front-deltoids']),
  ('pec-deck-fly', array['chest','front-deltoids']),
  ('incline-machine-chest-press', array['chest','front-deltoids','triceps']),
  ('decline-machine-chest-press', array['chest','triceps']),
  ('smith-machine-bench-press', array['chest','triceps','front-deltoids']),
  ('smith-machine-incline-press', array['chest','front-deltoids','triceps']),
  ('hammer-strength-chest-press', array['chest','triceps','front-deltoids']),
  ('low-to-high-cable-fly', array['chest','front-deltoids']),
  ('high-to-low-cable-fly', array['chest']),
  ('single-arm-cable-crossover', array['chest','abs']),
  ('standing-cable-chest-press', array['chest','triceps','abs']),
  ('cable-fly-flat', array['chest','front-deltoids']),
  ('single-arm-cable-fly', array['chest']),
  ('incline-push-up', array['chest','triceps','front-deltoids']),
  ('decline-push-up', array['chest','front-deltoids','triceps']),
  ('diamond-push-up', array['triceps','chest']),
  ('wide-grip-push-up', array['chest','front-deltoids']),
  ('archer-push-up', array['chest','triceps','abs']),
  ('weighted-dip', array['chest','triceps','front-deltoids']),
  ('plyometric-push-up', array['chest','triceps','front-deltoids']),
  ('deficit-push-up', array['chest','front-deltoids','triceps'])
) as v(id, muscles)
where e.id = v.id;
