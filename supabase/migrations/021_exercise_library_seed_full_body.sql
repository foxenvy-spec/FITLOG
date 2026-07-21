-- 021_exercise_library_seed_full_body.sql
-- เพิ่มท่ากลุ่ม "ทั้งตัว" อีก 14 ท่า (ของเดิมมี 6 ท่าอยู่แล้ว: burpee, clean-and-jerk,
-- farmers-carry, kettlebell-swing, snatch, thruster — เช็คแล้วไม่ชนกับชุดนี้)
-- ครอบคลุม บาร์เบล(3) ดัมเบล(4) คีทเทิลเบล(4) น้ำหนักตัว(3)
-- ON CONFLICT (id) DO NOTHING — รันซ้ำได้ปลอดภัย

insert into public.exercise_library
  (id, name, name_th, aliases, primary_muscle, secondary_muscles, equipment, icon, instructions, is_custom, image_url, highlighter_muscles)
values
  -- ===== บาร์เบล (3) =====
  ('power-clean', 'Power Clean', 'พาวเวอร์คลีน',
    array['power clean'], 'ทั้งตัว', array['ขา','หลัง','ไหล่'], 'บาร์เบล', '🏋️',
    array['ดึงบาร์จากพื้นระเบิดขึ้นรับที่หน้าไหล่แบบ squat ตื้น', 'ท่ายกน้ำหนักโอลิมปิกที่ต้องการเทคนิคสูง ควรมีโค้ชสอนก่อน'],
    false, null, array['quadriceps','trapezius','hamstring','front-deltoids']),
  ('hang-clean', 'Hang Clean', 'แฮงคลีน',
    array['hang clean'], 'ทั้งตัว', array['ขา','หลัง','ไหล่'], 'บาร์เบล', '🏋️',
    array['เริ่มจากบาร์ค้างระดับเข่า/ต้นขาแทนเริ่มจากพื้น ดึงระเบิดขึ้นรับที่ไหล่', 'ตัด ROM ส่วนดึงจากพื้นออก เน้นความไวและเทคนิครับบาร์'],
    false, null, array['quadriceps','trapezius','hamstring','front-deltoids']),
  ('clean-and-press', 'Clean and Press', 'คลีนแอนด์เพรส',
    array['clean and press'], 'ทั้งตัว', array['ขา','หลัง','ไหล่','แขน'], 'บาร์เบล', '🏋️',
    array['ดึงบาร์ขึ้นรับที่ไหล่แล้วดันต่อขึ้นเหนือศีรษะทันที', 'รวมสองท่าโอลิมปิกลิฟต์เป็นจังหวะเดียว'],
    false, null, array['quadriceps','trapezius','front-deltoids','triceps']),

  -- ===== ดัมเบล (4) =====
  ('dumbbell-clean-and-press', 'Dumbbell Clean and Press', 'ดัมเบลคลีนแอนด์เพรส',
    array['db clean and press'], 'ทั้งตัว', array['ขา','ไหล่'], 'ดัมเบล', '💪',
    array['ดึงดัมเบลขึ้นรับที่ไหล่แล้วดันต่อขึ้นเหนือศีรษะ', 'ทางเลือกที่เข้าถึงง่ายกว่าบาร์เบลคลีน'],
    false, null, array['quadriceps','front-deltoids','triceps']),
  ('man-maker', 'Man Maker', 'แมนเมกเกอร์',
    array['man maker'], 'ทั้งตัว', array['อก','หลัง','ไหล่','แกนกลางลำตัว'], 'ดัมเบล', '💪',
    array['พุชอัพพร้อมถือดัมเบล ตามด้วยโรว์สลับข้าง แล้วลุกขึ้นคลีนแอนด์เพรส', 'ท่าผสมรวมแทบทุกกล้ามเนื้อในเซ็ตเดียว'],
    false, null, array['chest','upper-back','front-deltoids','abs']),
  ('dumbbell-snatch', 'Dumbbell Snatch', 'ดัมเบลสแนตช์',
    array['dumbbell snatch'], 'ทั้งตัว', array['ขา','ไหล่'], 'ดัมเบล', '💪',
    array['ดึงดัมเบลจากพื้นระเบิดขึ้นเหนือศีรษะในจังหวะเดียวข้างเดียว', 'ฝึกพลังระเบิดทั้งตัวและความมั่นคงของไหล่'],
    false, null, array['quadriceps','front-deltoids','hamstring','trapezius']),
  ('devils-press', "Devil's Press", 'เดวิลส์เพรส',
    array['devils press'], 'ทั้งตัว', array['อก','ไหล่','ขา','แกนกลางลำตัว'], 'ดัมเบล', '💪',
    array['เบอร์พีพร้อมถือดัมเบล แล้วลุกขึ้นสแนตช์ดัมเบลทั้งสองข้างเหนือศีรษะ', 'ท่าคาร์ดิโอผสมยกน้ำหนักที่หนักที่สุดท่าหนึ่ง'],
    false, null, array['chest','front-deltoids','quadriceps','abs']),

  -- ===== คีทเทิลเบล (4) =====
  ('kettlebell-clean', 'Kettlebell Clean', 'เคทเทิลเบลคลีน',
    array['kettlebell clean'], 'ทั้งตัว', array['ขา','ไหล่'], 'คีทเทิลเบล', '🔔',
    array['ดึงเคทเทิลเบลขึ้นรับที่ข้อพับแขนหน้าไหล่', 'เทคนิครับสำคัญกว่าบาร์เบลเพราะรูปทรงเคทเทิลเบลแตกต่างกัน'],
    false, null, array['quadriceps','front-deltoids','hamstring']),
  ('kettlebell-clean-and-press', 'Kettlebell Clean and Press', 'เคทเทิลเบลคลีนแอนด์เพรส',
    array['kettlebell clean and press'], 'ทั้งตัว', array['ขา','ไหล่','แขน'], 'คีทเทิลเบล', '🔔',
    array['คลีนเคทเทิลเบลขึ้นรับแล้วดันต่อขึ้นเหนือศีรษะ', 'ฝึกทั้งพลังขาและความแข็งแรงไหล่ในท่าเดียว'],
    false, null, array['quadriceps','front-deltoids','triceps']),
  ('kettlebell-snatch', 'Kettlebell Snatch', 'เคทเทิลเบลสแนตช์',
    array['kettlebell snatch'], 'ทั้งตัว', array['ขา','ไหล่','หลัง'], 'คีทเทิลเบล', '🔔',
    array['แกว่งเคทเทิลเบลจากระหว่างขาขึ้นเหนือศีรษะในจังหวะเดียว', 'นิยมใช้แข่งขันในกีฬา kettlebell sport'],
    false, null, array['quadriceps','front-deltoids','hamstring','trapezius']),
  ('kettlebell-thruster', 'Kettlebell Thruster', 'เคทเทิลเบลทรัสเตอร์',
    array['kettlebell thruster'], 'ทั้งตัว', array['ขา','ไหล่'], 'คีทเทิลเบล', '🔔',
    array['สควอทลงพร้อมถือเคทเทิลเบลที่ไหล่ แล้วยืนขึ้นพร้อมดันขึ้นเหนือศีรษะ', 'ทางเลือกที่เบากว่าบาร์เบลทรัสเตอร์'],
    false, null, array['quadriceps','gluteal','front-deltoids']),

  -- ===== น้ำหนักตัว (3) =====
  ('bear-crawl', 'Bear Crawl', 'แบร์คลอว์',
    array['bear crawl'], 'ทั้งตัว', array['แกนกลางลำตัว','ไหล่'], 'น้ำหนักตัว', '🤸',
    array['คุกเข่ายกลอยเล็กน้อย คลานไปข้างหน้าสลับมือ-เท้าตรงข้าม', 'ฝึกความมั่นคงของแกนกลางไปพร้อมกล้ามเนื้อทั้งตัว'],
    false, null, array['abs','front-deltoids','quadriceps']),
  ('burpee-box-jump', 'Burpee Box Jump', 'เบอร์พีบ๊อกซ์จั๊มพ์',
    array['burpee box jump'], 'ทั้งตัว', array['ขา','อก'], 'น้ำหนักตัว', '🤸',
    array['ทำเบอร์พีปกติแล้วกระโดดขึ้นกล่องแทนกระโดดขึ้นอยู่กับที่', 'เพิ่มความหนักและพลังระเบิดของขา'],
    false, null, array['quadriceps','chest','calves']),
  ('sprawl', 'Sprawl', 'สปรอว์ล',
    array['sprawl'], 'ทั้งตัว', array['แกนกลางลำตัว'], 'น้ำหนักตัว', '🤸',
    array['คล้ายเบอร์พีแต่ไม่มีจังหวะกระโดดขึ้น เน้นทิ้งตัวลงพื้นแล้วดันกลับยืนเร็วๆ', 'นิยมใช้ในกีฬาต่อสู้และฝึกความไว'],
    false, null, array['abs','chest'])
on conflict (id) do nothing;
