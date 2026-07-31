// Design tokens สำหรับ Mobile Dashboard (iPhone 15/16 Pro, 393px) — แหล่งความจริงเดียวของขนาด/
// ระยะห่างที่ใช้ซ้ำในหลายไฟล์ (Header, MetricCard, TodaysFocusCard, TodaysWorkoutCompactCard,
// BottomNav) กันไม่ให้แต่ละไฟล์ "เดาสัดส่วน" กันเองแบบที่เคยเกิดปัญหามาหลายรอบ — ห้ามขยาย/ย่อค่า
// พวกนี้เองโดยไม่ตั้งใจ ถ้าต้องปรับให้แก้ที่ไฟล์นี้จุดเดียว แล้วค่าที่ import ไปใช้จะตามมาเองทุกจุด
export const dashboardSpec = {
  screen: {
    width: 393,
    horizontalPadding: 20,
    sectionGap: 20,
  },
  header: {
    height: 220,
    scoreRingSize: 138,
  },
  focusCard: {
    height: 74,
    borderRadius: 24,
    padding: 16,
  },
  metricCard: {
    height: 160,
    borderRadius: 24,
    padding: 16,
    gridGap: 14,
  },
  workoutCard: {
    height: 170,
    borderRadius: 24,
  },
  floatingButton: {
    size: 84,
  },
  bottomNav: {
    height: 80,
  },
} as const
