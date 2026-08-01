// Design tokens สำหรับ Mobile Dashboard (iPhone 15/16 Pro, 393px) — แหล่งความจริงเดียวของขนาด/
// ระยะห่างที่ใช้ซ้ำในหลายไฟล์ (Header, MetricCard, TodaysFocusCard, TodaysWorkoutCompactCard,
// TodayHealthStatsRow, BottomNav) กันไม่ให้แต่ละไฟล์ "เดาสัดส่วน" กันเองแบบที่เคยเกิดปัญหามาหลายรอบ —
// ห้ามขยาย/ย่อค่าพวกนี้เองโดยไม่ตั้งใจ ถ้าต้องปรับให้แก้ที่ไฟล์นี้จุดเดียว แล้วค่าที่ import ไปใช้จะ
// ตามมาเองทุกจุด — v6: รอบที่ 5 ของการลดสัดส่วน — ผู้ใช้ให้ตัดสินใจเองรอบนี้ ("อยากลดอีกครับ" ไม่ระบุ %)
// ยังคงหลักการเดิม (ไม่ลด value/label font เพิ่ม) ยกเว้น sparkline (เป็นกราฟตกแต่ง ไม่ใช่ตัวหนังสือ) —
// ทุกจุดเข้าใกล้ physical floor แล้ว (ดูคอมเมนต์ต่อ field) ควรเช็คบนจอจริงก่อนลดต่อจากรอบนี้
export const dashboardSpec = {
  screen: {
    width: 393,
    horizontalPadding: 20,
    sectionGap: 14, // -12.5% จาก 16
  },
  header: {
    height: 118, // -10% จาก 131 — ร่วมกับตัดบรรทัด "FITNESS SCORE" micro-label ออก (ดู FitnessScore.tsx)
    scoreRingSize: 80, // -11% จาก 90
  },
  focusCard: {
    height: 60, // -10% จาก 67
    borderRadius: 24,
    padding: 8, // -11% จาก 9
  },
  metricCard: {
    height: 86, // -8.5% จาก 94 — ใกล้ physical floor แล้วที่ font ปัจจุบัน (22/15px)
    borderRadius: 24,
    padding: 8, // -11% จาก 9
    gridGap: 12, // -14% จาก 14
    valueFontSize: 22, // คงเดิม
    sparklineHeight: 16, // -20% จาก 20 (กราฟตกแต่ง ไม่ใช่ตัวหนังสือ ลดได้โดยไม่กระทบการอ่าน)
    labelFontSize: 15, // คงเดิม
  },
  workoutCard: {
    // v7: กลับมาสูงขึ้น (92 -> 112) ตามคำขอ "ใช้ไฟล์นี้เลยทำออกมาให้เหมือนนี้" (มอคอัพมีบรรทัดกลุ่ม
    // กล้ามเนื้อ "Chest • Triceps" ที่เคยตัดออกไปตอน v6 เพราะพื้นที่ไม่พอ) — ยืนยันแล้วว่ายอมให้การ์ด
    // สูงขึ้นเพื่อใส่บรรทัดนี้กลับมา แทนที่จะพยายามยัดใส่ความสูงเดิม
    height: 112,
    borderRadius: 24,
    padding: 10,
    imageWidthPct: 27,
    // badge วงกลม+arc progress รอบไอคอนดัมเบล (ใช้ FitnessRing) — แทนที่ไอคอนแบนเดิม ให้ตรงกับ mockup
    ringSize: 46,
  },
  healthBanner: {
    height: 66, // -11% จาก 74
  },
  floatingButton: {
    size: 62, // -9% จาก 68
  },
  bottomNav: {
    height: 68, // -8% จาก 74
  },
} as const
