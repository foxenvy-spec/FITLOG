// Design tokens สำหรับ Mobile Dashboard (iPhone 15/16 Pro, 393px) — แหล่งความจริงเดียวของขนาด/
// ระยะห่างที่ใช้ซ้ำในหลายไฟล์ (Header, MetricCard, TodaysFocusCard, TodaysWorkoutCompactCard,
// TodayHealthStatsRow, BottomNav) กันไม่ให้แต่ละไฟล์ "เดาสัดส่วน" กันเองแบบที่เคยเกิดปัญหามาหลายรอบ —
// ห้ามขยาย/ย่อค่าพวกนี้เองโดยไม่ตั้งใจ ถ้าต้องปรับให้แก้ที่ไฟล์นี้จุดเดียว แล้วค่าที่ import ไปใช้จะ
// ตามมาเองทุกจุด — v6: รอบที่ 5 ของการลดสัดส่วน — ผู้ใช้ให้ตัดสินใจเองรอบนี้ ("อยากลดอีกครับ" ไม่ระบุ %)
// ยังคงหลักการเดิม (ไม่ลด value/label font เพิ่ม) ยกเว้น sparkline (เป็นกราฟตกแต่ง ไม่ใช่ตัวหนังสือ) —
// ทุกจุดเข้าใกล้ physical floor แล้ว (ดูคอมเมนต์ต่อ field) ควรเช็คบนจอจริงก่อนลดต่อจากรอบนี้
export const dashboardSpec = {
  // v7: ฟีดแบ็ก "ทุกอย่างพยายามเป็น Hero — ลดความแน่นของหน้า Home, ลดขนาด Hero ลง 15-20%" — 6 รอบก่อนหน้า
  // (v1-v6) ไล่ลดสัดส่วนลงเรื่อยๆ เพื่อยัดเนื้อหาให้พอดีจอ แต่ผลคือทุกการ์ดถูกบีบจนมีระยะหายใจเท่ากันหมด
  // (ไม่มีจุดไหน "เด่นจริง" เพราะทุกจุดถูกบีบเท่ากัน) — รอบนี้ทำสวนทาง 2 อย่างพร้อมกัน: (1) เพิ่ม sectionGap
  // กลับขึ้นเล็กน้อยให้การ์ดมีที่หายใจ ไม่ใช่ยัดชิดกันสุดๆ (2) ลดขนาด "Hero" จริง (Fitness Score ring บน
  // Header ซึ่งเป็นองค์ประกอบที่มี glow/layer หนาแน่นที่สุดในหน้า) ลง ~17.5% ให้เหลือ "จุดสนใจหลักจุดเดียว"
  // ชัดเจนขึ้น แทนที่จะแข่งกับ AI Coach/Today's Workout ที่ก็มี glow ของตัวเองเช่นกัน
  screen: {
    width: 393,
    horizontalPadding: 20,
    // v56: ฟีดแบ็ก "P3 — ลดระยะห่างระหว่าง Section ~6-10px (ไม่ใช่ย่อการ์ด)" — 16 -> 8 (-8px, กลางช่วง
    // ที่ขอ) กระทบทุกคู่ที่ใช้ token นี้ (Header→Focus, Focus→Workout, Workout→Body Overview,
    // Health App→Streak→AI Coach ฯลฯ — ดูคอมเมนต์ "sectionGap เดียวกันทั้งหมด" ใน MobileDashboardView.tsx)
    // marginTop:10 เสริมเฉพาะคู่ Today's Workout→Body Overview (v13, ไม่ได้แก้ที่นี่) รวมเป็น 8+10=18px
    // (เดิม 16+10=26px) ยังคงมากกว่าคู่อื่นเล็กน้อยตามที่ฟีดแบ็กรอบนั้นขอไว้ — ไม่แตะ metricCard.gridGap
    // (ระยะในการ์ด Body Overview เอง) ตามที่ระบุชัดว่า "ไม่ต้องเพิ่ม/ลดขนาด 4 การ์ดนั้น"
    // v: ฟีดแบ็ก (เทียบ poster "Version 2" รอบละเอียด) "การ์ดในรูปจริงใหญ่/หนาเกินไป ~15-20% เทียบกับ
    // mockup — ลด vertical spacing ลงด้วย ไม่ใช่แค่ขนาดการ์ด" — 8 -> 7 (-12.5%, ระมัดระวังกว่าเกณฑ์
    // 15-20% เพราะ token นี้กระทบทุกคู่การ์ดพร้อมกันทีเดียว)
    sectionGap: 7,
  },
  // v3: "New_mobile_app.zip" — ทิศทางดีไซน์ Home ใหม่ทั้งชุด (ผู้ใช้เลือก "ทำเฉพาะหน้า Home" หลัง
  // อัปโหลด brief ที่ 3 ซึ่งคนละทิศทางจาก brief ที่ 2 เดิม: ไม่มี hero photo/Fitness Score ring ใน
  // Header อีกต่อไป, ไม่มี Recovery card, แทนที่ด้วย Body Overview (น้ำหนัก/ไขมัน/กล้ามเนื้อดิบ),
  // Today card รวม Focus+Workout เป็นการ์ด hero ไล่สีส้มใบเดียว, Weekly Progress แบบเรียบ (ไม่มีแถว
  // วงกลม 7 วัน), เพิ่ม Goal Cards (เนื้อหาใหม่ที่ mobile ไม่เคยมีมาก่อน) — token เดิมของ header/
  // miniStatCard/focusCard/workoutCard (บรีฟที่ 2) ถูกแทนที่ทั้งหมดด้วยชุดนี้ตาม README/markup จริงใน
  // "FITLOG.dc.html" ของแพ็กเกจใหม่
  // v: ฟีดแบ็ก (เทียบ poster "Version 2" รอบละเอียด, live screenshot) "การ์ดในรูปจริงใหญ่/หนาเกินไป
  // ~15-20% เทียบกับ mockup — โดยเฉพาะ padding/ไอคอน ไม่ใช่แค่ font ตัวเลข" — ลด padding/iconSize/
  // barHeight ของ 4 การ์ดชุดนี้ลง ~15-20% ทุกจุด (ไม่แตะ font size ของ "ข้อมูลจริง" เช่นตัวเลข value/
  // ชื่อเวิร์กเอาต์ ตามที่ผู้ใช้ระบุว่าข้อมูลควรยังอ่านง่าย แค่ระยะ/กรอบรอบๆ ควรแน่นขึ้น)
  bodyOverviewCard: {
    borderRadius: 18,
    padding: 13, // -19% จาก 16
    statBorderRadius: 10, // -17% จาก 12
    statGap: 7, // -12.5% จาก 8
    iconSize: 20, // -17% จาก 24
    iconRadius: 6,
  },
  todayCard: {
    borderRadius: 18,
    padding: 13, // -19% จาก 16
    photoSize: 56,
    photoRadius: 12,
  },
  weeklyProgressCard: {
    borderRadius: 18,
    padding: 13, // -19% จาก 16
    barHeight: 7, // -12.5% จาก 8
  },
  goalCard: {
    borderRadius: 16,
    padding: 11, // -15% จาก 13
    barHeight: 5, // -17% จาก 6
    gridGap: 9, // -10% จาก 10
  },
  aiCoachCardV3: {
    borderRadius: 18,
    padding: 14,
    iconSize: 38,
    iconRadius: 12,
  },
  metricCard: {
    // v59: ฟีดแบ็ก "Body Cards ตอนนี้เล็กไปนิด ข้อมูลภายในเริ่มถูกบีบ เพิ่มความสูงกลับมาแค่ 5-8% ไม่ใช่
    // กลับไปขนาดเดิม (94)" — 86 -> 91 (+5.8%, กลางช่วงที่ขอ) ยังต่ำกว่า 94 เดิมพอสมควร ไม่ใช่ revert เต็ม
    height: 91,
    borderRadius: 24,
    padding: 8, // -11% จาก 9
    gridGap: 12, // -14% จาก 14
    valueFontSize: 22, // คงเดิม
    sparklineHeight: 16, // -20% จาก 20 (กราฟตกแต่ง ไม่ใช่ตัวหนังสือ ลดได้โดยไม่กระทบการอ่าน)
    labelFontSize: 15, // คงเดิม
  },
  healthBanner: {
    // v8: ฟีดแบ็ก "Health App Card ไม่ใช่ Core Action ของ FITLOG ไม่ควรเด่น ลดความสูงลง 15-20%" —
    // 66 -> 54 (-18%) ใช้กับสถานะ "ยังไม่เชื่อมต่อ" (health.connected เป็น false เสมอตอนนี้ — ดู
    // lib/healthIntegration.ts — เป็นสถานะเดียวที่ผู้ใช้เห็นจริงในโปรดักชันปัจจุบัน) สถานะ "เชื่อมต่อแล้ว"
    // (3-คอลัมน์ kcal/ก้าว/นอน ใน TodayHealthStatsRow.tsx) ยังไม่มีทาง reachable จริงในตอนนี้ — ถ้าเปิด
    // ใช้ฟีเจอร์นั้นในอนาคตต้องเช็ค/re-tune ระยะภายในให้พอดีกับความสูงใหม่นี้ด้วย
    // v2 (design review, P5): ฟีดแบ็ก "utility card (Health App) ยัง visual weight เยอะไปเทียบกับความสำคัญ
    // ใน daily flow — ลดอีก 10-15%" — 54 -> 46 (-14.8%, กลางช่วงที่ขอ) — ปรับขนาดวงไอคอนใน
    // TodayHealthStatsRow.tsx ให้เล็กลงตาม (w-7->w-6) ไม่งั้นแค่บีบความสูง container โดยไม่ลดไอคอนจะดูอัดแน่น
    // ขึ้นแทนที่จะดูเบาลง
    height: 46,
  },
  // v: ฟีดแบ็ก (live-test, Smart Start screenshot) "Bottom Nav ยังกินพื้นที่เยอะ ปุ่ม START WORKOUT
  // เด่นจนเกือบแย่งความสนใจจากเนื้อหาหลัก — ลดความสูง Bottom Nav ~10-15%, ลดขนาดวงกลม Start ลงเล็กน้อย
  // (ไม่ต้องลดเยอะเท่า Bottom Nav — ปุ่มนี้ยังเป็นจุดเด่นของ FITLOG ได้)" — floatingButton.size 62 -> 57
  // (-8%, เล็กน้อยตามที่ขอ) bottomNav.height 68 -> 58 (-14.7%, กลางช่วง 10-15% ที่ขอ) — coreSize/glow
  // span ใน BottomNav.tsx อิง btnSize เป็นสัดส่วนอยู่แล้ว ไม่ต้อง re-tune แยก
  // ฟีดแบ็ก (เทียบ mockup ตรงๆ) "ขนาด/รูปแบบยังไม่เหมือนเลย" — mockup ปุ่มลอยเด่นกว่านี้ชัดเจน (สัดส่วน
  // เส้นผ่านศูนย์กลางต่อความสูง Bottom Nav มากกว่า 57px ที่ลดไว้จากฟีดแบ็กคนละรอบ/คนละประเด็น (v57
  // ด้านบน ลดเพราะ "แย่งความสนใจจากเนื้อหาหลัก" ไม่ใช่เพราะเทียบกับ mockup นี้) — ปรับขึ้นเฉพาะจุดนี้ตาม
  // การเทียบ mockup รอบนี้ ไม่กระทบตัวแปรอื่น (bottomNav.height คงเดิม 58 — ปุ่มแค่ลอยสูงขึ้น/ใหญ่ขึ้น
  // ไม่ได้ทำให้ตัวแผ่น nav สูงขึ้นตาม เพราะ top offset คำนวณจาก btnSize เองอยู่แล้วใน BottomNav.tsx)
  floatingButton: {
    size: 66,
  },
  bottomNav: {
    height: 58, // -14.7% จาก 68
  },
} as const
