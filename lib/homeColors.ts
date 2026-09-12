// FITLOG Premium Home Design System — โทเคนสีชุดเดียวสำหรับหน้า Home ใหม่ทั้งหมด (Header/Body
// Overview/Today's Focus/Weekly Progress/Goal Cards/MINT Coach/Bottom Nav) ให้ทุกไฟล์อ้างอิงค่าเดียวกัน
// แทนการ inline hex ซ้ำๆ คนละไฟล์ — ฟีดแบ็ก "เปลี่ยนจาก Black ล้วนเป็น Deep Navy + Glass Card ให้ดู
// Premium ขึ้น อย่าใช้ #000000 เยอะเกินไป" (เทียบ poster "Version 2" อีกรอบ, ผู้ใช้ยืนยันสโคป "ทำเฉพาะ
// Home ก่อน" — ไม่แตะ Workout/Exercise Detail/Progress/Profile รอบนี้ แต่ตั้งใจให้ไฟล์นี้เป็นต้นแบบ
// (foundation) สำหรับขยายไปหน้าอื่นในงานรอบถัดไป)
export const HOME_COLORS = {
  bg: '#050B12',
  surface: '#0B1520',
  card: '#101D29',
  // การ์ด "แก้ว" — พื้นทึบเดิม (#12161d) เปลี่ยนเป็นโปร่งแสงบางส่วน ให้เห็นพื้นหลังหน้า/ภาพด้านหลังลอด
  // เข้ามานิดหน่อย (ชัดสุดตรง Body Overview ที่ทับภาพ Header อยู่แล้ว) — ไม่ใช้ blur หนักแบบ
  // glassmorphism ทั่วไป (ผู้ใช้ระบุ "ไม่ควรทำ glassmorphism แบบ blur หนักๆ")
  cardGlass: 'rgba(16,29,41,.8)',
  cardBorder: 'rgba(255,255,255,.1)',
  orange: '#FF8A00',
  orangeGlow: '#FF6500',
  cyan: '#20C8FF',
  textPrimary: '#F5F7FA',
  textSecondary: '#8C9AA8',
} as const
