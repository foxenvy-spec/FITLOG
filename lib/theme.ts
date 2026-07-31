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

// สีของ FitnessRing/HeroEnergyWave/glow บน header — เดิมตั้งใจให้คงที่เป็นธีมไฟเสมอ (ส้ม/เหลือง)
// ไม่ผูกกับ tier แต่เปลี่ยนมาผูกกับ tier ของ Fitness Score จริงๆ แล้ว ตามฟีดแบ็กที่อยากให้สี Ring/
// Wave/Glow/ข้อความ AI Coach สัมพันธ์กันทั้งหมด ให้มองแวบเดียวเข้าใจทั้งสภาพร่างกายและคำแนะนำ — ชุดสี
// ต่อ tier (Excellent/Very Good/Good/Moderate/Recovery/Rest Today) ประกาศอยู่ที่ lib/fitnessScore.ts
// (FitnessScoreResult.gradientStops/color) ไม่ใช่ไฟล์นี้ เพราะผูกกับความหมายของคะแนนโดยตรง
// FIRE_GRADIENT_STOPS ด้านล่างยังเป็นสี "ตกแต่ง/แบรนด์" คงที่เหมือนเดิม ใช้กับจุดที่ไม่เกี่ยวกับ tier
// (FAB "Start Workout", แถบ progress ของวันนี้ ฯลฯ)

export type ThemeColorKey = keyof typeof COLORS

// สีกลาง/พื้นหลัง — ใช้กับ SVG stroke/fill หรือ inline style ที่ใช้ Tailwind class ตรงๆ ไม่ได้
export const NEUTRAL = {
  ringTrack: '#23272D', // พื้นหลังวงแหวนส่วนที่ยังไม่ถึงเป้า (ใช้ทั่วไป — GoalRing, WorkoutHeatmap ฯลฯ)
  ringTrackWarm: '#202126', // พื้นหลังวงแหวนโทนอุ่นกว่า ใช้เฉพาะ FitnessScore ring (ธีมไฟ) ให้ตัดกับ
  // วงสีส้ม/ทองชัดกว่า ringTrack ปกติซึ่งเป็นโทนเทาเย็น
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

// ===================================================================================
// "Fire" gradient — ชุดสีเดียวที่ใช้ร่วมกันทั่วทั้งแอปสำหรับจุดที่ต้องการความรู้สึก "พลังงาน/ไฟลุก"
// (Fitness Score Ring, Wave ตกแต่งบน header, FAB "Start Workout", แถบ progress หลักของวันนี้)
// ตั้งใจให้เป็นตัวแปรเดียว ไม่กระจาย hex ซ้ำคนละที่ — เปลี่ยนโทนธีมทั้งชุดในอนาคตแก้ที่นี่ที่เดียวพอ
// (แยกจาก COLORS ด้านบนซึ่งเป็นสีความหมายเชิงข้อมูล เช่น tier ของ Fitness Score, กลุ่มกล้ามเนื้อ ฯลฯ —
// FIRE_GRADIENT เป็นสี "ตกแต่ง/แบรนด์" ล้วนๆ ไม่ผูกความหมายอะไร)
//
// ตั้งใจไม่ทาแทนที่สีความหมาย (เช่น tier ของ Fitness Score, สีกลุ่มกล้ามเนื้อ, สีของแต่ละ timer type)
// เพราะจุดเหล่านั้นสีสื่อความหมายจริง (ดี/แย่, กลุ่มกล้ามเนื้อไหน ฯลฯ) เปลี่ยนไปใช้สีไฟเดียวกันหมด
// จะทำให้ข้อมูลสับสน — ใช้เฉพาะจุดที่เป็น "ของตกแต่ง/แบรนด์" ล้วนๆ เท่านั้น
export const FIRE_GRADIENT_STOPS = [
  { offset: '0%', color: '#D96A00' },
  { offset: '25%', color: '#FF8A00' },
  { offset: '45%', color: '#FFD166' },
  { offset: '50%', color: '#FFF4CC' },
  { offset: '55%', color: '#FFD166' },
  { offset: '75%', color: '#FF8A00' },
  { offset: '100%', color: '#D96A00' },
] as const

export const FIRE_GRADIENT_CSS = `linear-gradient(90deg, ${FIRE_GRADIENT_STOPS.map((s) => `${s.color} ${s.offset}`).join(', ')})`

// สีเดี่ยวสำหรับจุดที่ต้องการแค่ hex เดียว (เช่น glow shadow, ไอคอนที่ recolor ไม่ได้แบบ gradient)
export const FIRE_ACCENT = '#FF8A00'

// ===================================================================================
// เท็กซ์เจอร์ noise บางๆ ปูทับพื้นหลัง — สร้างจาก SVG feTurbulence แทนไฟล์รูป กันไม่ต้องมี asset เพิ่ม
// ใช้คู่กับ opacity ต่ำ (~0.04) + mixBlendMode: 'overlay' เท่านั้น — ให้ผิวพื้นหลังดูเป็น "แผ่นโลหะ
// เกรนละเอียด" (Dark Titanium) แทนสีทึบเรียบๆ ย้ายมาจาก templates/page.tsx เดิม (ที่นั่นประกาศ local
// const ซ้ำ) ให้เป็นตัวแปรกลางใช้ร่วมกันได้ทุกหน้าที่อยากได้ผิวโลหะแบบเดียวกัน (templates, dashboard)
export const NOISE_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`

// ===================================================================================
// ชุดโทเคนเพิ่มเติมสำหรับ "Dark Titanium" รอบละเอียด — พื้นหลังหลายเลเยอร์ (ไม่ใช่สีทึบเดียว),
// ไล่สีการ์ด, ไล่สีส้มแบรนด์ (ไม่แบนสีเดียว), glow หลายสต็อป, ระดับสีตัวหนังสือ — รวมไว้ที่นี่ให้ทุก
// component ที่อยากได้ผิวโลหะพรีเมียมชุดเดียวกันดึงไปใช้ ไม่ต้อง copy ค่าซ้ำคนละไฟล์

// พื้นหลังหน้า Dashboard — v2: เปลี่ยนจาก "เทาอุ่น + จุดแสงส้มฟุ้งทั้งหน้า" (รอบก่อน) มาเป็น
// "เทาเย็น (Cool Gray/Titanium) ล้วนๆ" ตามฟีดแบ็ก — เดิมมี radial-gradient สีส้ม 3 ชั้นซ้อนแทบเต็มจอ
// (บนสุด/บนซ้าย/บนขวา) ทำให้ Header/การ์ด/พื้นหลังทั้งหมด "อมน้ำตาล" กลืนกันไปหมด ไม่เหลือความรู้สึก
// โลหะเย็นแบบไทเทเนียมจริง — ตัดแสงส้มออกจากพื้นหลังทั้งหมด เหลือแค่ไล่สีเทาเย็น 3 สต็อป (ไม่มี R>G>B
// แบบโทนน้ำตาล — ทุกสต็อปนี้ B ≥ R ให้เป็นเทาเย็นจริง) ส่วนแสงส้มยังอยู่ แต่ย้ายไปเฉพาะจุด "Interactive"
// เท่านั้น (Fitness Score bloom ใน FitnessScore.tsx, ปุ่ม Start Workout ใน BottomNav.tsx, กระดิ่งแจ้งเตือน
// ใน NotificationButton.tsx ผ่าน glowColor) ไม่ใช่พื้นหลังทั้งหน้าอีกต่อไป
export const DASHBOARD_BG_CSS = 'linear-gradient(180deg, #16181C, #101214, #090A0B)'

// Vignette — ขอบจอมืดกว่ากลางจอเล็กน้อย กันไม่ให้พื้นหลังดำสนิทเป็นแผ่นเดียวเรียบๆ ทั้งขอบจอ
export const VIGNETTE_CSS = 'radial-gradient(circle, transparent 45%, rgba(0,0,0,.28) 100%)'

// ไล่สีการ์ด — v2: เปลี่ยนจากเทากลาง (#242424/#171717/#101010, R=G=B เป๊ะ) เป็นเทาเย็นจริง (B สูงกว่า
// R เล็กน้อยทุกสต็อป) ตามค่าที่ขอ เพื่อให้ผิวการ์ดเป็น "โลหะเย็น" ไม่ใช่เทาดิบเฉยๆ — สว่างกว่าเดิมตรงกลาง
// บนแล้วค่อยจางลงล่าง ให้ผิวการ์ดดูมีมิติแบบแผ่นโลหะจริง ใช้คู่กับ CARD_INSET_SHADOW เสมอ (highlight
// ขอบบน + เงาจมขอบล่าง)
export const CARD_GRADIENT_CSS = 'linear-gradient(180deg, #26282C 0%, #1B1D20 35%, #141518 70%, #0D0E10 100%)'
export const CARD_INSET_SHADOW = 'inset 0 1px 0 rgba(255,255,255,.08), inset 0 -4px 10px rgba(0,0,0,.6)'

// ขอบการ์ดกลาง (แทน rgba(255,180,70,.12) สีส้มเดิม) — ขอบเทาเย็นจางๆ แบบโลหะจริง ไม่ทำให้การ์ดอมส้ม
// ทั้งใบตั้งแต่เส้นขอบ — สีส้ม/glow ยังคงอยู่ได้เฉพาะตอน :active (แตะการ์ด) เท่านั้น ไม่ใช่สถานะปกติ
export const CARD_BORDER_CSS = 'rgba(255,255,255,.06)'

// ไล่สีส้มแบรนด์ (แทน #FF9800 สีเดียว) — สว่าง(บน)→กลาง→เข้ม(ล่าง) ให้พื้นผิวสีส้ม (ปุ่ม Start,
// badge ฯลฯ) ดูมีมิติแทนสีแบนราบ
export const AMBER_GRADIENT_CSS = 'linear-gradient(180deg, #FFC84A, #FFAA1A, #FF8500)'

// Glow หลายสต็อป (ขาว→เหลือง→ส้ม→โปร่งใส) แทน glow สีส้มเดียวแบนๆ — ให้ความรู้สึกแสงจริงที่มี
// hot-spot ขาวจ้าตรงกลางแล้วค่อยไล่โทนอุ่นออกไป ใช้กับปุ่ม/badge ที่มี glow อำพัน
export const AMBER_GLOW_SHADOW =
  '0 0 2px rgba(255,255,255,.6), 0 0 8px rgba(255,210,120,.6), 0 0 22px rgba(255,150,20,.35), 0 0 60px rgba(255,130,0,.12)'

// ระดับสีตัวหนังสือ — แทนขาวล้วน (#FFFFFF) ที่แบน/จ้าเกินไปบนพื้นเข้ม ไล่ทึบมากไปน้อยตามลำดับ
// ความสำคัญ (Title > Body > Secondary > Caption) แบบเดียวกับที่ Apple ใช้
export const TEXT = {
  title: '#F8F8F8',
  body: '#CFCFCF',
  secondary: '#8D8D8D',
  caption: '#676767',
} as const
