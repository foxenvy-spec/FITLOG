// Design tokens สำหรับ Mobile Dashboard (iPhone 15/16 Pro, 393px) — แหล่งความจริงเดียวของขนาด/
// ระยะห่างที่ใช้ซ้ำในหลายไฟล์ (Header, MetricCard, TodaysFocusCard, TodaysWorkoutCompactCard,
// TodayHealthStatsRow, BottomNav) กันไม่ให้แต่ละไฟล์ "เดาสัดส่วน" กันเองแบบที่เคยเกิดปัญหามาหลายรอบ —
// ห้ามขยาย/ย่อค่าพวกนี้เองโดยไม่ตั้งใจ ถ้าต้องปรับให้แก้ที่ไฟล์นี้จุดเดียว แล้วค่าที่ import ไปใช้จะ
// ตามมาเองทุกจุด — v4: รอบที่ 3 ของการลดสัดส่วน ตามฟีดแบ็ก "hero section ยังกิน 35-38% ของจอ (ควร
// 28-30%), การ์ดสรุปยังใหญ่สุด, padding การ์ดเยอะ, รูป Today's Workout กินพื้นที่เกินข้อมูล"
export const dashboardSpec = {
  screen: {
    width: 393,
    horizontalPadding: 20,
    sectionGap: 20,
  },
  header: {
    height: 158, // -12% จาก 180
    scoreRingSize: 109, // -10% จาก 121
  },
  focusCard: {
    height: 67,
    borderRadius: 24,
    padding: 11, // -15% จาก 13 (Card Padding rule)
  },
  metricCard: {
    height: 115, // -15% จาก 136 (~21px, ตรงตามที่ขอ "เตี้ยลง 20-25px")
    borderRadius: 24,
    padding: 11, // -15% จาก 13
    gridGap: 14,
    valueFontSize: 22,
    sparklineHeight: 20,
    labelFontSize: 15, // -1pt จาก 16 (กันชื่อยาวตัดบรรทัดเพิ่มความสูงการ์ดโดยไม่จำเป็น)
  },
  workoutCard: {
    height: 128, // -12% จาก 145
    borderRadius: 24,
    padding: 11, // -15% จาก 13
    imageWidthPct: 35, // เดิม 36% — ใกล้เคียงเป้าหมาย "รูป 35% ข้อมูล 65%" ที่ขอ
  },
  healthBanner: {
    height: 74,
  },
  floatingButton: {
    size: 73, // -5% จาก 77
  },
  bottomNav: {
    height: 74,
  },
} as const
