// Design tokens สำหรับ Mobile Dashboard (iPhone 15/16 Pro, 393px) — แหล่งความจริงเดียวของขนาด/
// ระยะห่างที่ใช้ซ้ำในหลายไฟล์ (Header, MetricCard, TodaysFocusCard, TodaysWorkoutCompactCard,
// TodayHealthStatsRow, BottomNav) กันไม่ให้แต่ละไฟล์ "เดาสัดส่วน" กันเองแบบที่เคยเกิดปัญหามาหลายรอบ —
// ห้ามขยาย/ย่อค่าพวกนี้เองโดยไม่ตั้งใจ ถ้าต้องปรับให้แก้ที่ไฟล์นี้จุดเดียว แล้วค่าที่ import ไปใช้จะ
// ตามมาเองทุกจุด — v5: รอบที่ 4 ของการลดสัดส่วน — รอบนี้ผู้ใช้ระบุชัดเจนว่า "ไม่ลด font ทุกอย่าง เพราะ
// จะอ่านยาก เน้นลดความสูง+padding+gap แทน" จึงตัด valueFontSize/labelFontSize/sparklineHeight/ชื่อ
// header ออกจากรอบนี้ (คงค่าจาก v4 ไว้ทุกจุด) ปรับเฉพาะมิติ height/padding/gap/ขนาดวงกลม
export const dashboardSpec = {
  screen: {
    width: 393,
    horizontalPadding: 20,
    sectionGap: 16, // -22% จาก 20
  },
  header: {
    height: 131, // -17% จาก 158
    scoreRingSize: 90, // -17% จาก 109
  },
  focusCard: {
    height: 67,
    borderRadius: 24,
    padding: 9, // -20% จาก 11 (Card Padding rule)
  },
  metricCard: {
    height: 94, // -18% จาก 115 (Summary Card rule)
    borderRadius: 24,
    padding: 9, // -20% จาก 11
    gridGap: 14,
    valueFontSize: 22, // คงเดิม — ไม่ลด font รอบนี้ตามที่ขอ
    sparklineHeight: 20, // คงเดิม
    labelFontSize: 15, // คงเดิม
  },
  workoutCard: {
    height: 102, // -20% จาก 128
    borderRadius: 24,
    padding: 9, // -20% จาก 11
    imageWidthPct: 27, // -23% จาก 35 (Workout Image rule)
  },
  healthBanner: {
    height: 74,
  },
  floatingButton: {
    size: 68, // -7% จาก 73
  },
  bottomNav: {
    height: 74,
  },
} as const
