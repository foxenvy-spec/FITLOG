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
// v3: พื้นสีเรียบ 3 สต็อปเดิมยัง "แบน" เกินไป (ไม่มีไล่เฉดที่สังเกตได้จริงในพื้นที่กว้าง) เพิ่มเป็น 4
// สต็อปที่ไล่ถี่ขึ้นตรงกลาง (25%/55%) ให้เห็นการไล่เฉดเทาเย็นเป็นชั้นๆ แบบผิวโลหะจริง ไม่ใช่บล็อกสีเดียว
// v4: ยังแบนอยู่แม้มี noise+vignette — เพิ่ม "micro gradient" 2 จุด (สีขาวล้วน อัลฟาต่ำมาก 1.2-1.5%
// ไม่ใช่สีส้ม ไม่ใช่ glow) จำลองความไม่สม่ำเสมอเล็กๆ ของผิวโลหะจริง (ไม่ใช่พื้นเรียบเนียนทางเดียวแบบ
// linear-gradient เดียว) ตามคำขอ "เพิ่มความต่างของเฉดสีเทา" แทนการเพิ่มแสง/glow
// v5: ปรับ 4 สต็อปหลักให้ตรงกับ palette ที่ขอเป๊ะ (#181A1C/#131416/#0E0F10/#090909) — ค่าเดิมใกล้เคียง
// อยู่แล้วแต่ไม่ตรงเป๊ะทีละ digit เปลี่ยนแค่ hex ไม่แตะโครงสร้าง (ยังเป็น 4 สต็อป + micro-gradient
// เดิมทุกอย่าง)
export const DASHBOARD_BG_CSS = [
  'radial-gradient(circle at 30% 20%, rgba(255,255,255,.015), transparent 50%)',
  'radial-gradient(circle at 75% 65%, rgba(255,255,255,.012), transparent 55%)',
  'linear-gradient(180deg, #181A1C 0%, #131416 25%, #0E0F10 55%, #090909 100%)',
].join(', ')

// Vignette — ขอบจอมืดกว่ากลางจอเล็กน้อย กันไม่ให้พื้นหลังดำสนิทเป็นแผ่นเดียวเรียบๆ ทั้งขอบจอ
export const VIGNETTE_CSS = 'radial-gradient(circle, transparent 45%, rgba(0,0,0,.28) 100%)'

// ไล่สีการ์ด — v2: เปลี่ยนจากเทากลาง (#242424/#171717/#101010, R=G=B เป๊ะ) เป็นเทาเย็นจริง (B สูงกว่า
// R เล็กน้อยทุกสต็อป) ตามค่าที่ขอ เพื่อให้ผิวการ์ดเป็น "โลหะเย็น" ไม่ใช่เทาดิบเฉยๆ — สว่างกว่าเดิมตรงกลาง
// บนแล้วค่อยจางลงล่าง ให้ผิวการ์ดดูมีมิติแบบแผ่นโลหะจริง ใช้คู่กับ CARD_INSET_SHADOW/CARD_REFLECTION_CSS
// เสมอ (highlight ขอบบน + เงาจมขอบล่าง + แถบสะท้อนแสงด้านบน)
export const CARD_GRADIENT_CSS = 'linear-gradient(180deg, #26282C 0%, #1B1D20 35%, #141518 70%, #0D0E10 100%)'
// v2: highlight ขอบบนเดิม (inset 0 1px 0, กว้างเต็มขอบบนทั้งเส้น) รวมกับ border สีเทา ทำให้ขอบบนดูสว่าง
// "ทั้งเส้น" แทนที่จะสว่างเฉพาะมุมแบบวัสดุโลหะจริง — เปลี่ยนเป็น inset แนวทแยง (offset ทั้ง x และ y พร้อม
// กัน) ให้ความสว่างกระจุกอยู่แถวมุมบนซ้ายเป็นหลัก (จางหายไปทางขวา/ล่าง) แทนเส้นสว่างสม่ำเสมอเต็มความกว้าง
// v3: เพิ่มเงาจมขอบล่างอีกนิด (.6 -> .65 alpha) ตามที่ขอ "Bottom Shadow อีกนิด" — ยังคงระยะ blur เดิม
// (10px) ไว้ ไม่ใช่เงาหนักใหม่ แค่เข้มขึ้นเล็กน้อยให้รู้สึกจมลงในผิวโลหะชัดขึ้น
export const CARD_INSET_SHADOW = 'inset 1px 1px 0 0 rgba(255,255,255,.09), inset 0 -4px 10px rgba(0,0,0,.65)'

// v5: การ์ดยัง "ด้าน" (soft plastic) เกินไป — ลด stop บนสุดจาก .05 เหลือ .04 ตามที่ขอ "Top Reflection
// แค่ 4%" เป๊ะๆ (ค่าก่อนหน้ายังโปร่งใสเร็วไปนิดที่ .05) สต็อปกลาง/ท้ายคงเดิมไว้
export const CARD_REFLECTION_CSS = 'linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02) 18%, transparent 40%)'

// v2: shadow เดิม (0 10px 30px rgba(0,0,0,.45)) หนัก/มืดเกินไป ทำให้การ์ดดู "ติดพื้น" แทนที่จะลอยเบาๆ
// เหนือพื้นหลัง — ลด blur/opacity ลงให้เป็นเงาลอยแบบเบาบาง (float) จริง
export const CARD_FLOAT_SHADOW = '0 8px 18px rgba(0,0,0,.32)'

// ขอบการ์ดกลาง (แทน rgba(255,180,70,.12) สีส้มเดิม) — ขอบเทาเย็นจางๆ แบบโลหะจริง ไม่ทำให้การ์ดอมส้ม
// ทั้งใบตั้งแต่เส้นขอบ — สีส้ม/glow ยังคงอยู่ได้เฉพาะตอน :active (แตะการ์ด) เท่านั้น ไม่ใช่สถานะปกติ
// v2: ยัง "เห็นชัดทุกด้าน" เกินไป (.06) — Reference แทบมองไม่เห็น border เลย ให้ CARD_REFLECTION_CSS/
// CARD_INSET_SHADOW ทำหน้าที่บอกขอบการ์ดแทน ลดลงเหลือ .04
export const CARD_BORDER_CSS = 'rgba(255,255,255,.04)'

// ไล่สีส้มแบรนด์ — v2: สต็อปเดิม (#FFC84A/#FFAA1A/#FF8500) ยังสดเกินไป (โทนส้มล้วน) เปลี่ยนเป็นโทน
// "อมทอง" ตามที่ขอ (มี R สูง G กลาง B ต่ำแต่ไม่จัดจ้านเท่าส้มสด) ใช้กับปุ่ม Start Workout เป็นหลัก
export const AMBER_GRADIENT_CSS = 'linear-gradient(180deg, #FFB84A, #FF9A16, #E77A00)'

// Glow หลายสต็อป (ขาว→เหลือง→ส้ม→โปร่งใส) แทน glow สีส้มเดียวแบนๆ — ให้ความรู้สึกแสงจริงที่มี
// hot-spot ขาวจ้าตรงกลางแล้วค่อยไล่โทนอุ่นออกไป ใช้กับปุ่ม/badge ที่มี glow อำพัน
export const AMBER_GLOW_SHADOW =
  '0 0 2px rgba(255,255,255,.6), 0 0 8px rgba(255,210,120,.6), 0 0 22px rgba(255,150,20,.35), 0 0 60px rgba(255,130,0,.12)'

// แปลง % (0-100) เป็น 2 หลัก hex alpha — ใช้ทำ glow เข้ม/อ่อนต่างกันต่อการ์ด (เช่น น้ำหนัก 18% เข้มกว่า
// มวลไขมัน 10%) แทนที่จะ hardcode alpha เดียวกันทุกใบเหมือนเดิม (ทำให้ glow ทุกใบสว่างเท่ากันหมด ดูไม่
// เป็นธรรมชาติ)
export function glowAlphaHex(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct))
  return Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, '0')
}

// ระดับสีตัวหนังสือ — แทนขาวล้วน (#FFFFFF) ที่แบน/จ้าเกินไปบนพื้นเข้ม ไล่ทึบมากไปน้อยตามลำดับ
// ความสำคัญ (Title > Body > Secondary > Caption) แบบเดียวกับที่ Apple ใช้
// v2: ปรับตาม palette "metallic silver, avoid pure white" ที่ขอเป๊ะ — Primary #F4F4F4 (เดิม #F8F8F8
// ยังจ้าเกิน), Secondary รวม body/secondary เดิมเข้าใกล้กับ #BDBDBD/#818181 ที่ขอมากขึ้น — caption
// (เฉดเงียบสุด ไม่มีในสเปคใหม่ที่ให้มาแค่ 3 ระดับ) คงไว้เป็นชั้นที่ 4 เหมือนเดิม ไม่ตัดออก
export const TEXT = {
  title: '#F4F4F4',
  body: '#BDBDBD',
  secondary: '#818181',
  caption: '#676767',
} as const
