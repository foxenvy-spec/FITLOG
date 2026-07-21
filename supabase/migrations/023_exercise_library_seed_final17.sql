-- 023_exercise_library_seed_final17.sql
-- ปิดท้ายให้ครบเป๊ะ 300 ท่า (53 เดิม + 230 จาก 012/016-022 + 17 ไฟล์นี้ = 300)
-- กระจาย: อก(2) หลัง(2) ขา(2) ไหล่(2) แขน(2) core(2) ทั้งตัว(3) อื่นๆ(2)
-- ON CONFLICT (id) DO NOTHING — รันซ้ำได้ปลอดภัย

insert into public.exercise_library
  (id, name, name_th, aliases, primary_muscle, secondary_muscles, equipment, icon, instructions, is_custom, image_url, highlighter_muscles)
values
  -- ===== อก (2) =====
  ('converging-chest-press', 'Converging Chest Press', 'คอนเวอร์จิ้งเชสต์เพรส',
    array['converging chest press machine'], 'อก', array['ไหล่','แขน'], 'เครื่อง', '⚙️',
    array['ด้ามจับโค้งเข้าหากันตอนดันสุด ROM เลียนแบบการเคลื่อนไหวธรรมชาติของกล้ามอก', 'ต่างจาก plate-loaded ทั่วไปที่ดันเป็นเส้นตรง'],
    false, null, array['chest','triceps','front-deltoids']),
  ('single-arm-cable-chest-press', 'Single-Arm Cable Chest Press', 'เคเบิลเชสต์เพรสข้างเดียว',
    array['single arm cable press'], 'อก', array['แกนกลางลำตัว','ไหล่'], 'เคเบิล', '🔗',
    array['ยืนหันหลังให้รอก ดันออกทีละข้าง อีกข้างล็อกลำตัวไม่ให้บิด', 'ฝึกความมั่นคงของแกนกลางไปพร้อมอก'],
    false, null, array['chest','triceps','abs']),

  -- ===== หลัง (2) =====
  ('seal-row', 'Seal Row', 'ซีลโรว์',
    array['seal row'], 'หลัง', array['แขน'], 'ดัมเบล', '💪',
    array['นอนคว่ำราบบนม้านั่งสูง ตัวลอยพ้นพื้นทั้งตัว ดึงดัมเบลขึ้น', 'ตัดแรงเหวี่ยงจากขาและหลังล่างได้หมดจดกว่า chest-supported row'],
    false, null, array['upper-back','biceps']),
  ('batwing-row', 'Batwing Row', 'แบทวิงโรว์',
    array['batwing row'], 'หลัง', array['แขน'], 'ดัมเบล', '💪',
    array['นอนคว่ำบนม้านั่งเอียงชัน ดึงดัมเบลขึ้นค้างบนสุด 2-3 วิก่อนปล่อยลง', 'เน้นการบีบสะบักค้างมากกว่าจังหวะเร็ว'],
    false, null, array['upper-back','biceps','back-deltoids']),

  -- ===== ขา (2) =====
  ('belt-squat', 'Belt Squat', 'เบลท์สควอท',
    array['belt squat'], 'ขา', array[]::text[], 'เครื่อง', '⚙️',
    array['คาดเข็มขัดถ่วงน้ำหนักที่สะโพก สควอทลงโดยไม่มีแรงกดที่กระดูกสันหลัง', 'ปลอดภัยกับหลังกว่าสควอทแบกบาร์'],
    false, null, array['quadriceps','gluteal']),
  ('sissy-squat', 'Sissy Squat', 'ซิสซี่สควอท',
    array['sissy squat'], 'ขา', array[]::text[], 'น้ำหนักตัว', '🤸',
    array['จับที่ยึดพยุงตัว เขย่งปลายเท้าเอนลำตัวไปข้างหลังพร้อมงอเข่า', 'แยกกล้ามต้นขาหน้าได้ชัดมาก ROM ไม่เยอะแต่หนักมาก'],
    false, null, array['quadriceps']),

  -- ===== ไหล่ (2) =====
  ('z-press', 'Z Press', 'ซีเพรส',
    array['z press'], 'ไหล่', array['แกนกลางลำตัว','แขน'], 'บาร์เบล', '🏋️',
    array['นั่งกับพื้นขาเหยียดตรง ดันบาร์ขึ้นเหนือศีรษะโดยไม่มีพนักพิง', 'บังคับให้ใช้แกนกลางคุมสมดุลทั้งหมด'],
    false, null, array['front-deltoids','triceps','abs']),
  ('bus-driver', 'Bus Driver', 'บัสไดรเวอร์',
    array['bus driver'], 'ไหล่', array['แกนกลางลำตัว'], 'ดัมเบล', '💪',
    array['ถือแผ่นน้ำหนัก/ดัมเบลสองมือยกตรงหน้าระดับไหล่ หมุนซ้าย-ขวาเหมือนหมุนพวงมาลัย', 'เน้นไหล่หน้าและการควบคุมแบบไอโซเมตริก'],
    false, null, array['front-deltoids']),

  -- ===== แขน (2) =====
  ('waiter-curl', "Waiter's Curl", 'เวเทอร์เคิร์ล',
    array['waiter curl'], 'แขน', array[]::text[], 'ดัมเบล', '💪',
    array['ถือดัมเบลแนวนอนด้วยฝ่ามือรองก้นดัมเบลเหมือนถือถาด งอศอกยกขึ้น', 'มุมจับต่างช่วยกระตุ้นไบเซ็ปหัวสั้นเป็นพิเศษ'],
    false, null, array['biceps']),
  ('cable-skull-crusher', 'Cable Skull Crusher', 'เคเบิลสกัลครัชเชอร์',
    array['cable skull crusher'], 'แขน', array[]::text[], 'เคเบิล', '🔗',
    array['นอนหงายใต้รอกต่ำ งอศอกลดบาร์ลงหาหน้าผากแล้วเหยียดกลับ', 'แรงตึงจากเคเบิลคงที่กว่าดัมเบล/บาร์เบลตลอดจังหวะ'],
    false, null, array['triceps']),

  -- ===== core (2) =====
  ('ab-rollout-machine', 'Ab Rollout Machine', 'แมชชีนแอบโรลเอาท์',
    array['ab rollout machine'], 'แกนกลางลำตัว', array['ไหล่'], 'เครื่อง', '⚙️',
    array['คุกเข่าจับด้ามจับเครื่องที่มีรางเลื่อน กลิ้งออก-ดึงกลับคล้าย ab wheel', 'เครื่องช่วยคุมแนวการเคลื่อนที่ให้นิ่งกว่าทำอิสระ'],
    false, null, array['abs','front-deltoids']),
  ('copenhagen-plank', 'Copenhagen Plank', 'โคเปนเฮเกนแพลงก์',
    array['copenhagen plank'], 'แกนกลางลำตัว', array['ขา'], 'น้ำหนักตัว', '🤸',
    array['นอนตะแคงยันศอก วางขาบนอยู่บนม้านั่ง/ที่สูง ยกสะโพกลอย', 'เน้นกล้ามเอียงข้างลำตัวและต้นขาด้านในไปพร้อมกัน'],
    false, null, array['obliques','adductor']),

  -- ===== ทั้งตัว (3) =====
  ('single-arm-kettlebell-swing', 'Single-Arm Kettlebell Swing', 'เคทเทิลเบลสวิงข้างเดียว',
    array['single arm swing'], 'ทั้งตัว', array['หลัง','แกนกลางลำตัว'], 'คีทเทิลเบล', '🔔',
    array['แกว่งเคทเทิลเบลด้วยมือเดียวจากระหว่างขาขึ้นระดับอก สลับมือได้ระหว่างเซ็ต', 'เพิ่มความท้าทายด้านการต้านการหมุนตัวจาก swing ปกติ'],
    false, null, array['gluteal','hamstring','obliques']),
  ('sled-push', 'Sled Push', 'สเลดพุช',
    array['sled push'], 'ทั้งตัว', array['ขา'], 'เครื่อง', '⚙️',
    array['ดันเลื่อนบรรทุกน้ำหนักไปข้างหน้าด้วยแขนเหยียดตรง ก้าวเท้าลงพื้นเต็มฝ่าเท้า', 'ฝึกพลังขาแบบไม่มีแรงกระแทกที่ข้อเข่า'],
    false, null, array['quadriceps','gluteal','calves']),
  ('battle-ropes', 'Battle Ropes', 'แบทเทิลโรป',
    array['battle ropes'], 'ทั้งตัว', array['แขน','ไหล่'], 'น้ำหนักตัว', '🤸',
    array['ยืนย่อเข่าเล็กน้อยถือปลายเชือกหนักสองข้าง ตีคลื่นสลับมือหรือพร้อมกัน', 'ฝึกคาร์ดิโอควบคู่ความแข็งแรงแขน ไหล่ และแกนกลาง'],
    false, null, array['front-deltoids','abs','forearm']),

  -- ===== อื่นๆ (2) =====
  ('ninety-ninety-hip-stretch', '90/90 Hip Stretch', 'สเตรทช์สะโพก 90/90',
    array['90 90 stretch'], 'อื่นๆ', array['ขา'], 'น้ำหนักตัว', '🧘',
    array['นั่งพื้นงอเข่าหน้า-หลังทำมุม 90 องศาทั้งคู่คนละทิศทาง โน้มตัวไปทางขาหน้า', 'เพิ่มความยืดหยุ่นการหมุนสะโพกได้รอบด้าน'],
    false, null, array['gluteal','adductor']),
  ('seated-forward-fold', 'Seated Forward Fold', 'ยืดหลังต้นขานั่งก้ม',
    array['seated forward fold'], 'อื่นๆ', array['หลัง'], 'น้ำหนักตัว', '🧘',
    array['นั่งเหยียดขาตรงสองข้าง ก้มตัวโน้มไปข้างหน้าเอื้อมมือแตะปลายเท้า', 'ยืดหลังต้นขาและหลังส่วนล่างพร้อมกัน'],
    false, null, array['hamstring','lower-back'])
on conflict (id) do nothing;
