// สีหลักที่ใช้ซ้ำในดีไซน์มือถือ (Body Overview, Streak, Weekly Goal, Recovery, Fitness Score,
// Health Stats ฯลฯ) รวมไว้ที่เดียวแทนที่จะกระจาย hex string เดิมๆ ไว้คนละไฟล์ — อยากเปลี่ยน
// โทนสีทั้งชุดในอนาคต (เช่น สลับเป็น Green Theme/Blue Theme) แก้ที่นี่ที่เดียวพอ
//
// ไม่เกี่ยวกับ MUSCLE_GROUP_COLORS ใน lib/muscle-groups.ts ซึ่งเป็นสีเฉพาะกลุ่มกล้ามเนื้อ
// (คนละชุดความหมายกัน คนละจุดประสงค์) จึงแยกไฟล์กัน ไม่รวมเข้าด้วยกัน
export const COLORS = {
  amber: '#E8A33D', // สีหลักของแอป — CTA, ไฟ streak, badge, accent ทั่วไป
  moss: '#7A9B57', // ดี/สำเร็จ/ฟื้นตัวเต็มที่
  rust: '#C1503A', // แย่/เตือน/ยังไม่ฟื้นตัว
  steel: '#6C8CA8', // ข้อมูลทั่วไป (เช่น กราฟแท่งวอลุ่ม)
  violet: '#9C7CC4', // AI Coach / ฟีเจอร์ผู้ช่วยอัจฉริยะ
  pink: '#E339A6', // Weekly Goal ring
  purple: '#8B7FC7', // นอนหลับ (ตรงกับสีกลุ่มกล้ามเนื้อ "ไหล่" ใน muscle-groups.ts พอดี)
  cyan: '#22D3EE', // Recovery ring
  green: '#4ADE80', // Fitness Score ระดับ Elite (เข้มกว่า/สว่างกว่า moss ให้ต่างจากระดับ Excellent)
  yellow: '#EAB308', // Fitness Score ระดับ Good
  deltaGood: '#8CB264', // ตัวหนังสือเดลต้าที่ดีขึ้น (เฉดเขียวอ่อนกว่า moss เล็กน้อย ใช้ specifically กับข้อความ เช่น "↓2.1kg")
} as const

export type ThemeColorKey = keyof typeof COLORS

// สีกลาง/พื้นหลัง — ใช้กับ SVG stroke/fill หรือ inline style ที่ใช้ Tailwind class ตรงๆ ไม่ได้
export const NEUTRAL = {
  ringTrack: '#23272D', // พื้นหลังวงแหวนส่วนที่ยังไม่ถึงเป้า
  chipInactive: '#2E333A', // ชิป/วงกลมที่ยังไม่ active (เช่น วันที่ยังไม่ได้ฝึก)
  chipInactiveAlt: '#3A3F47', // เฉดใกล้เคียง ใช้ตอนต้องการคอนทราสต์ต่างจาก chipInactive เล็กน้อย
  mutedIcon: '#9498A0', // ไอคอน/ตัวอักษรจางๆ บนพื้นเข้ม
  onAmberText: '#14161A', // ตัวอักษร/ไอคอนสีเข้ม วางบนพื้นหลังสีอำพัน (อ่านง่ายกว่าตัวขาว)
} as const

// เติม alpha (โปร่งใส) ท้าย hex — เช่น withAlpha(COLORS.amber, '22') = '#E8A33D22'
// (ใช้บ่อยสำหรับพื้นหลังไอคอนวงกลมจางๆ ทั่วทั้งชุดการ์ดมือถือ)
export function withAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`
}

// ผสมสีเข้ากับสีขาว ให้ได้เฉด "สว่างกว่าเดิม" ของสีเดียวกัน (ไม่ใช่แทนที่ด้วยสีอื่น) — ใช้ทำจุด
// hot-spot/highlight บน gradient หรือ glow ที่ต้อง "ดูสว่างจ้าขึ้น" แต่ยังคงโทนสีเดิมไว้ เช่น
// วงแหวน Fitness Score หรือเส้นคลื่นตกแต่งที่สีเปลี่ยนตาม tier — ให้เอฟเฟกต์ไฟ/glow ทำงานถูกต้อง
// ไม่ว่า tier สีจะเป็นเขียว (Elite) เหลือง (Good) หรือส้ม/แดง (Fair/Recovery) ก็ตาม
// amount: 0 = สีเดิม, 1 = ขาวล้วน
export function lighten(hex: string, amount: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`
}
