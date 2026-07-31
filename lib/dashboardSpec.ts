// Design tokens สำหรับ Mobile Dashboard (iPhone 15/16 Pro, 393px) — แหล่งความจริงเดียวของขนาด/
// ระยะห่างที่ใช้ซ้ำในหลายไฟล์ (Header, MetricCard, TodaysFocusCard, TodaysWorkoutCompactCard,
// TodayHealthStatsRow, BottomNav) กันไม่ให้แต่ละไฟล์ "เดาสัดส่วน" กันเองแบบที่เคยเกิดปัญหามาหลายรอบ —
// ห้ามขยาย/ย่อค่าพวกนี้เองโดยไม่ตั้งใจ ถ้าต้องปรับให้แก้ที่ไฟล์นี้จุดเดียว แล้วค่าที่ import ไปใช้จะ
// ตามมาเองทุกจุด — รอบนี้ (v3) ลดสัดส่วนลงอีกรอบตามฟีดแบ็ก % ที่ให้มาเจาะจงต่อ element
export const dashboardSpec = {
  screen: {
    width: 393,
    horizontalPadding: 20,
    sectionGap: 20,
  },
  header: {
    height: 180, // -18% จาก 220
    scoreRingSize: 121, // -12% จาก 138
  },
  focusCard: {
    height: 67, // -10% จาก 74
    borderRadius: 24,
    padding: 13, // -20% จาก 16 (Card Padding rule)
  },
  metricCard: {
    height: 136, // -15% จาก 160
    borderRadius: 24,
    padding: 13, // -20% จาก 16
    gridGap: 14,
    valueFontSize: 22, // -9% จาก 24
    sparklineHeight: 20, // -15% จาก 24 (Graph rule)
  },
  workoutCard: {
    height: 145, // -15% จาก 170
    borderRadius: 24,
    padding: 13, // -20% จาก 16
  },
  healthBanner: {
    height: 74, // -10% จาก 82
  },
  floatingButton: {
    size: 77, // -8% จาก 84
  },
  bottomNav: {
    height: 74, // -8% จาก 80
  },
} as const
