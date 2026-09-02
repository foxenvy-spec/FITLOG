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
  // pink: เดิมใช้กับ Weekly Goal ring แต่เปลี่ยนไปใช้ amber แล้ว (ฟีดแบ็ก "สีม่วงชมพูนีออนไม่เข้ากับ
  // Dark Titanium") ตอนนี้ไม่มีจุดไหนในแอปที่ยัง render จริงใช้สีนี้แล้ว (เหลือแค่ component เก่าที่ไม่ได้
  // import ใช้งานที่ไหน) เก็บ token ไว้เผื่ออนาคต ไม่ลบเพราะไม่กระทบอะไรที่เห็นจริง
  pink: '#E339A6',
  purple: '#8B7FC7', // ตรงกับสีกลุ่มกล้ามเนื้อ "ไหล่" ใน muscle-groups.ts — ใช้เฉพาะจุด visualization
  // (เช่น MUSCLE_GROUP_COLORS) ตามฟีดแบ็ก "Pink/Purple/Blue ให้ลดลงเหลือเฉพาะ visualization" — เดิมยังใช้
  // เป็นสี "การ์ด/ไอคอน" แยกต่างหากด้วย (เช่น Sleep icon ใน TodayHealthStatsRow) ย้ายจุดนั้นไปใช้ steel แทน
  // ไม่ให้เป็นสี "signature" คู่ที่ 8 ที่แข่งความสนใจบนหน้า Dashboard
  //
  // ฟีดแบ็ก "Dark Titanium + Minimal Luxury ไม่ใช่สี 7 สี + Glow + Neon พร้อมกัน — ลด saturation ของ Cyan
  // ลงประมาณ 20-30% ให้เป็น Premium Accent แทนที่จะเป็น Neon" — ลดจาก #22D3EE (HSL S 85.7%) ลง 25%
  // (คำนวณผ่าน colorsys ให้ Hue/Lightness เดิมเป๊ะ เปลี่ยนแค่ความจัดจ้าน) เหลือ S ~64.3%
  cyan: '#3BC0D4', // Recovery ring — เดิม #22D3EE (neon), ลด saturation ~25%
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

// v12: "Dark Titanium Material System" — ผู้ใช้ยืนยันให้ย้อนทิศทาง v2 ข้างบน (ที่เคยตัดแสงส้ม/ลายเฉียง
// ออกจากพื้นหลังทั้งหน้า) กลับมาบางส่วน โดยตั้งใจ เพื่อให้ Metric Card/Focus Card/Workout Card รู้สึก
// "อยู่ในห้องเดียวกัน" แทนที่จะเป็นวัสดุคนละชุด — ทั้งสองตัวนี้บางมาก (2.5%/3%) ตามที่ขอ "แทบมองไม่เห็น
// แต่เวลาเลื่อนจะรู้สึกแพงขึ้น" ไม่ใช่การนำ v2 เดิมกลับมาเต็มรูปแบบ

// ลายเฉียงไทเทเนียม (brushed metal) จางๆ ทั่วทั้งหน้า — เส้นทแยง 115deg ห่างกัน 40px คล้ายลายที่ฝังอยู่ใน
// รูปพื้นหลัง Today's Workout แต่วาดด้วย CSS ล้วน (ไม่ต้องมี asset เพิ่ม)
// v13: เพิ่ม alpha จาก .025 (2.5%) เป็น .04 (4%) เพราะรอบนี้ให้จางลงตามความสูงหน้า (ดู
// DIAGONAL_TITANIUM_FADE_MASK) — ค่า .04 นี้คือความเข้ม "สูงสุด" ที่หัวหน้าเท่านั้น ไม่ใช่ค่าคงที่ทั้งหน้า
// เหมือนรอบก่อน (ฟีดแบ็ก: "สม่ำเสมอเกินไป เหมือน overlay วางทับทั้งหน้า" อยากให้ชัดใกล้ Header แล้วจางลง
// เรื่อยๆ จนแทบมองไม่เห็นตอนล่างสุด)
export const DIAGONAL_TITANIUM_CSS =
  'repeating-linear-gradient(115deg, rgba(255,255,255,.04) 0px, rgba(255,255,255,.04) 1px, transparent 1px, transparent 40px)'

// v16: "Micro Reflection" — เส้นลายเฉียงเดิม (DIAGONAL_TITANIUM_CSS) สม่ำเสมอทุกเส้นเท่ากันหมด (ฟีดแบ็ก:
// "ยังเรียบไปนิด") ไม่มีจุดที่ดู "โดนแสงจับ" ต่างจากเส้นอื่น — เพิ่มแถบสว่างจางมาก (2%) ทิศทางเดียวกับลาย
// (115deg) พาดคาดกลางๆ ให้เกิดจุดที่ "แสงสะท้อนกระทบพอดี" ต่างจากส่วนอื่นของลาย เหมือนผิวไทเทเนียมจริงที่
// ไม่ได้สะท้อนแสงสม่ำเสมอทุกจุด — ใช้ร่วมกับ DIAGONAL_TITANIUM_FADE_MASK เดิมเพื่อให้จางลงล่างเหมือนกัน
export const DIAGONAL_TITANIUM_MICRO_REFLECTION_CSS =
  'linear-gradient(115deg, transparent 42%, rgba(255,255,255,.02) 50%, transparent 58%)'

// mask-image แนวตั้ง ใช้คู่กับ DIAGONAL_TITANIUM_CSS เพื่อไล่จาง (fade) ลายเฉียงจากบนลงล่าง — ทึบเต็มที่
// (100%) แถว Header ค่อยๆ จางลงเหลือ ~50% กลางหน้า แล้วเกือบหายไปหมด (~5%) ตอนล่างสุด แทนที่จะสม่ำเสมอ
// ทั้งหน้าแบบเดิม (v12) — ใช้ mask (ไม่ใช่ opacity เฉยๆ) เพราะต้องการควบคุมความเข้มไล่ระดับตามตำแหน่ง Y
// จริง ไม่ใช่ทึบ/จางทั้งชั้นเท่ากันหมด
export const DIAGONAL_TITANIUM_FADE_MASK =
  'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,.5) 45%, rgba(0,0,0,.12) 75%, rgba(0,0,0,.03) 100%)'

// v14: เปลี่ยนจาก radial-gradient (แสงกระจายทุกทิศทางเท่ากัน) เป็น linear-gradient แนวตั้งเฉียงเล็กน้อย
// (195deg — เกือบตรงจากบนลงล่าง เอียงซ้ายนิดเดียว) ตามฟีดแบ็ก "แสงส้มควรมี Direction แบบ Apple ไม่ใช่ออก
// ทุกทิศ" — ครอบคลุมทั้งความสูงหน้า (ไม่ใช่แค่โซน ~65% แคบๆ แบบเดิม) ให้ความอุ่นไล่ระดับขึ้นมาตั้งแต่ใกล้
// Header/Score Ring ด้านบน (แทบไม่มี) ไปจนเข้มสุดแถว Workout Card (~88-92% ของความสูง) แล้วจางลงนิดหน่อย
// ต่อจากนั้น (เนื้อหาที่อยู่ใต้ Workout Card ไม่ควรสว่างค้างตลอดไป) — จุดประสงค์คือให้ Fitness Score/
// Workout Card "เชื่อมกัน" ด้วยแสงเส้นเดียวทั่วทั้งหน้า แทนที่จะเป็นแสงกระจุกตัวจุดเดียวแบบเดิม
// v24: ฟีดแบ็ก "Orange Ambient Fog ไม่ใช่ Glow แสงส้มบางๆ อยู่หลัง Card ประมาณ 5%" — สต็อปเข้มสุด (88%,
// โซนที่การ์ดต่างๆ อยู่) ขยับจาก .04 (4%) เป็น .05 (5%) ตามตัวเลขที่ขอเป๊ะ สต็อปอื่นคงสัดส่วนเดิมไม่แตะ
export const AMBIENT_ORANGE_CSS =
  'linear-gradient(195deg, transparent 0%, transparent 30%, rgba(255,138,0,.01) 50%, rgba(255,142,20,.025) 70%, rgba(255,150,30,.05) 88%, rgba(255,150,30,.02) 100%)'

// v15: "Soft Reflection" ของพื้นหลังทั้งหน้า — เดิมมีแค่ไล่สีเทาเย็น + ลายเฉียง + noise + vignette
// (ฟีดแบ็ก: "ยังสะอาดเกินไป") เพิ่มแถบสว่างจางๆ แนวนอนใกล้ขอบบนสุด (เหมือนแสงตกกระทบผิวไทเทเนียมจากด้านบน
// แบบเดียวกับ CARD_REFLECTION_CSS ที่การ์ดใช้กันอยู่แล้ว แต่สเกลใหญ่ขึ้นสำหรับทั้งหน้า) — ตั้งใจให้เป็น
// เส้น/แถบ ไม่ใช่วงกลม (ตามฟีดแบ็ก "Glow ไม่ควรเป็นวงกลม") จางมาก (~3% สูงสุด) จางหมดก่อนถึง 45% ของความสูง
export const PAGE_REFLECTION_CSS =
  'linear-gradient(180deg, rgba(255,255,255,.03) 0%, rgba(255,255,255,.012) 20%, transparent 45%)'

// เดิม (v13, radial แคบ) เก็บไว้เป็นคอมเมนต์อ้างอิง เผื่อย้อนกลับ:
// 'radial-gradient(80% 55% at 65% 68%, rgba(255,138,0,.05), transparent 55%)'

// v18: ฟีดแบ็ก "Background ยังเรียบไป เหมือน Theme สำเร็จรูป" — เดิมมีแสงส้มทิศทางเดียว (จากบนไล่เข้มลง
// ล่างแถว Workout Card) จุดเดียว ไม่มีแหล่งแสงตัดกัน เพิ่มแสงฟ้าเย็นจาง (Blue Ambient) ตรงข้ามกัน —
// เข้มสุดใกล้ Header ด้านบน (สวนทางกับส้มที่เข้มสุดด้านล่าง) จำลองแสงฟ้า/เย็นจากด้านบน ตัดกับแสงอุ่นจาก
// Workout Card ด้านล่าง ให้พื้นหลังมีมิติของแหล่งแสง 2 โทนแทนที่จะเป็นสีเดียวไล่เฉดธรรมดา — จางมากๆ
// (peak 2.5%) ไม่ให้แย่งซีนจากส้มซึ่งยังเป็นสีหลักของแบรนด์
export const BLUE_AMBIENT_CSS =
  'linear-gradient(200deg, rgba(90,150,210,.025) 0%, rgba(80,140,200,.012) 20%, transparent 45%, transparent 100%)'

// v18: "Radial Shadow" — เดิมมีแค่ VIGNETTE_CSS (มืดขอบจอสม่ำเสมอทุกด้านเท่ากัน) เพิ่มเงามืดนุ่มๆ
// เฉพาะโซนล่างสุดของจอ (ทรงรี กว้างเกือบเต็มจอ) ให้ความรู้สึกหน้าจอ "วางอยู่บนพื้นผิว" มีน้ำหนักกดลงด้านล่าง
// จริง ไม่ใช่ลอยแบนๆ เท่ากันทุกด้าน — ซ้อนทับ VIGNETTE_CSS เดิม ไม่ได้แทนที่
export const RADIAL_SHADOW_CSS = 'radial-gradient(ellipse 90% 45% at 50% 100%, rgba(0,0,0,.32), transparent 60%)'

// v19: ฟีดแบ็ก "Background ยังสะอาดเกินไป เหมือนสีเรียบ ไม่ต้องเห็นชัด แต่ซูมแล้วต้องรู้ว่าเป็นโลหะ" —
// DIAGONAL_TITANIUM_CSS เดิมเป็นเส้นทแยงห่างเท่ากันเป๊ะทุกเส้น (repeating-linear-gradient) อ่านเป็น
// "ลายกราฟิก" มากกว่าผิวโลหะจริงที่รอยขัดแต่ละเส้นความยาว/ความเข้มไม่เท่ากัน — ใช้ feTurbulence แบบ
// anisotropic (baseFrequency แกน x/y ต่างกันมาก: 0.012 แนวนอน ทำให้ลายยืดยาวในทิศนั้น, 0.9 แนวตั้ง ทำให้
// สลับเข้ม/จางถี่ในทิศตั้งฉาก) ได้ลายเส้นริ้วบางไม่สม่ำเสมอแบบรอยขัดโลหะจริง (ไม่ใช่จุดกลมๆ แบบ NOISE_BG
// เดิมซึ่งเป็น isotropic) ผสม feColorMatrix เพิ่ม contrast/threshold ให้เป็นเส้นริ้วชัดขึ้นแทนที่จะเป็น
// grayscale noise นุ่มๆ — ใช้คู่กับ CSS transform: rotate ให้ทิศเดียวกับ DIAGONAL_TITANIUM_CSS (115deg)
export const HAIRLINE_SCRATCH_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='hs'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012 0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1.6 -0.55'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23hs)'/%3E%3C/svg%3E")`

// v26: ฟีดแบ็ก "BANK อยากให้เป็น Apple Watch Stainless Steel - Hairline Reflection -> Vertical Brushed
// -> Micro Grain" - DIAGONAL_TITANIUM_CSS/NOISE_BG เดิมที่ตัวหนังสือ BANK ใช้อยู่แล้วเป็นลาย 115deg
// (ทิศเดียวกับพื้นหลัง/การ์ดทั้งแอป) ซึ่งเหมาะกับ "แผ่นโลหะแบน" มากกว่า "ตัวโลหะที่กลึงขึ้นรูป" แบบเคส
// Apple Watch Stainless Steel ที่เส้นแปรง (brush) วิ่งแนวตั้งชิดกันถี่ๆ ตามทิศทางการกลึง - โทเคนใหม่นี้
// เส้นถี่กว่า DIAGONAL_TITANIUM_CSS มาก (ระยะห่าง 3px ไม่ใช่ 40px) และเป็นแนวตั้งแท้ (90deg ไม่ใช่ 115deg)
// ให้ต่างจากลายทแยงที่ใช้ทั่วแอปอย่างจงใจ เฉพาะจุดที่อยากได้ความรู้สึก "แท่งโลหะกลึง" อย่าง wordmark เท่านั้น
export const VERTICAL_BRUSHED_CSS =
  'repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0px, rgba(255,255,255,.05) 1px, transparent 1px, transparent 3px)'

// v26: "Micro Grain" - NOISE_BG เดิม (baseFrequency 0.9) คือเกรนระดับ "แผ่นการ์ด" ที่ใช้ทั่วแอปอยู่แล้ว
// อันนี้ถี่กว่ามาก (1.8 = ละเอียดกว่าประมาณเท่าตัว) จำลองผิวเคสสแตนเลสที่ขัดละเอียดจนเกรนแทบเป็นฝุ่น ไม่ใช่
// เกรนหยาบแบบแผ่นโลหะทั่วไป - ลด alpha ของ noise ลงเหลือ 35% ของค่าดิบด้วย feComponentTransfer (แทนที่จะ
// พึ่ง opacity ของ CSS layer ข้างนอกอย่างเดียว) กัน "Micro" ไม่ให้แรงเกินจนกลืนกับ NOISE_BG เดิมที่ซ้อนอยู่
export const MICRO_GRAIN_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='mg'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.8' numOctaves='2' stitchTiles='stitch' result='n'/%3E%3CfeComponentTransfer in='n'%3E%3CfeFuncA type='linear' slope='0.35' intercept='0'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23mg)'/%3E%3C/svg%3E")`

// v26: "Hairline Reflection" - ต่างจากแถบนุ่มเดิมที่ Header ใช้อยู่แล้ว (soft band กว้าง 16% ของความสูง
// ตัวอักษร, alpha แค่ .02) ซึ่งอ่านเป็น "แสงฟุ้ง" - อันนี้เป็นเส้นคมชัดจริงๆ แคบกว่ามาก (~2.5%) แต่ alpha
// สูงกว่ามาก (.38) จำลองเส้นสะท้อนแสงคมแบบขอบเคสสแตนเลสขัดเงาที่แสงจับเป็น "เส้น" ไม่ใช่ "แถบฟุ้ง"
export const HAIRLINE_REFLECTION_CSS =
  'linear-gradient(180deg, transparent 0%, transparent 47%, rgba(255,255,255,.38) 49.5%, transparent 52%, transparent 100%)'

// ไล่สีการ์ด — v2: เปลี่ยนจากเทากลาง (#242424/#171717/#101010, R=G=B เป๊ะ) เป็นเทาเย็นจริง (B สูงกว่า
// R เล็กน้อยทุกสต็อป) ตามค่าที่ขอ เพื่อให้ผิวการ์ดเป็น "โลหะเย็น" ไม่ใช่เทาดิบเฉยๆ — สว่างกว่าเดิมตรงกลาง
// บนแล้วค่อยจางลงล่าง ให้ผิวการ์ดดูมีมิติแบบแผ่นโลหะจริง ใช้คู่กับ CARD_INSET_SHADOW/CARD_REFLECTION_CSS
// เสมอ (highlight ขอบบน + เงาจมขอบล่าง + แถบสะท้อนแสงด้านบน)
// v49: ฟีดแบ็ก "การ์ดมืดเกินไป — ดำ+เทาเข้ม+เส้นทแยง+border+shadow+glow พร้อมกันหมด ดูเป็น Dashboard สำหรับดู
// ข้อมูลมากกว่า Fitness app ที่อยากดูความก้าวหน้าตัวเอง อยากเพิ่มความสว่างพื้นการ์ด 5-10% โดยไม่เปลี่ยนธีม" —
// ยกทุกสต็อปขึ้น ~6% (ผสมขาว 6%, ใช้ฟังก์ชัน lighten() ในไฟล์นี้) ยังคงสัดส่วนไล่เฉด/เปอร์เซ็นต์เดิมทั้งหมด
// ไม่แตะโครงสร้าง 4 สต็อป แค่ให้ตัวหนังสือบนพื้นการ์ดอ่านง่ายขึ้นโดยไม่ต้องเพิ่มสี/ขนาดตัวอักษรเพิ่ม
export const CARD_GRADIENT_CSS = 'linear-gradient(180deg, #333539 0%, #292B2D 35%, #222326 70%, #1C1C1E 100%)'
// v2: highlight ขอบบนเดิม (inset 0 1px 0, กว้างเต็มขอบบนทั้งเส้น) รวมกับ border สีเทา ทำให้ขอบบนดูสว่าง
// "ทั้งเส้น" แทนที่จะสว่างเฉพาะมุมแบบวัสดุโลหะจริง — เปลี่ยนเป็น inset แนวทแยง (offset ทั้ง x และ y พร้อม
// กัน) ให้ความสว่างกระจุกอยู่แถวมุมบนซ้ายเป็นหลัก (จางหายไปทางขวา/ล่าง) แทนเส้นสว่างสม่ำเสมอเต็มความกว้าง
// v3: เพิ่มเงาจมขอบล่างอีกนิด (.6 -> .65 alpha) ตามที่ขอ "Bottom Shadow อีกนิด" — ยังคงระยะ blur เดิม
// (10px) ไว้ ไม่ใช่เงาหนักใหม่ แค่เข้มขึ้นเล็กน้อยให้รู้สึกจมลงในผิวโลหะชัดขึ้น
export const CARD_INSET_SHADOW = 'inset 1px 1px 0 0 rgba(255,255,255,.09), inset 0 -4px 10px rgba(0,0,0,.65)'

// v5: การ์ดยัง "ด้าน" (soft plastic) เกินไป — ลด stop บนสุดจาก .05 เหลือ .04 ตามที่ขอ "Top Reflection
// แค่ 4%" เป๊ะๆ (ค่าก่อนหน้ายังโปร่งใสเร็วไปนิดที่ .05) สต็อปกลาง/ท้ายคงเดิมไว้
// v6: การ์ดยัง "Matte" มากกว่า "Titanium" — เพิ่ม reflection อีก ~3 จุด (.04 -> .07, สต็อปกลาง .02 ->
// .035 ตามสัดส่วนเดียวกัน) เฉพาะจุดเดียวที่ขอรอบนี้ ไม่แตะ border/glow/สี/พื้นหลังเลย
//
// v18: ฟีดแบ็ก "Titanium Reflection ตอนนี้ยังเป็น Gray/Gray/Gray" — เดิม 2 สต็อปเป็นสีขาวล้วน (rgba(255,
// 255,255,..)) ไล่จางแค่ค่า alpha ไม่มีการเปลี่ยนโทนสีเลย ไม่ต่างจากเทาซ้อนเทา — เปลี่ยนเป็น 4 สต็อปไล่
// โทน (ยังโปร่งใสสูง alpha ต่ำเท่าเดิม ไม่ใช่แถบสีทึบ) จำลองผิวโลหะจริงที่แสงสะท้อนแล้วโทนสีขยับตามมุม:
// Cold Silver (ฟ้าขาว) -> Warm Silver (ครีมขาว) -> Titanium Blue (ฟ้าเทา) -> จางหายเข้าเนื้อการ์ดเข้ม
// (Dark Steel = สีพื้นการ์ดเดิมที่เผยออกมาเมื่อโปร่งใสเต็มที่ ไม่ต้องมีสต็อปสีทึบแยก) — โทเคนนี้ใช้ร่วมกัน
// ทั้งผิวการ์ดทุกใบผ่าน PremiumCard และตัวอักษร BANK ใน Header ให้เปลี่ยนพร้อมกันทั้งแอปในจุดเดียว
export const CARD_REFLECTION_CSS =
  'linear-gradient(180deg, rgba(214,228,242,.075) 0%, rgba(255,244,224,.045) 16%, rgba(148,176,204,.028) 32%, transparent 42%)'

// v18: "Card ยังดูเป็นการ์ด ไม่ใช่ Surface" — CARD_REFLECTION_CSS ข้างบนเป็นแถบสะท้อนแสงแนวนอน (แสงจาก
// ทิศทางเดียว, จำลองพื้นผิวเรียบ) เพิ่มไฮไลต์วงรีจางๆ ตรงกลางขอบบน (กว้าง สั้น) ซ้อนอีกชั้น จำลองความโค้ง
// เล็กน้อยของผิวโลหะที่แสงจับเป็น "จุด" ตรงกลางขอบบนแทนที่จะเป็นเส้นสะท้อนแสงตรงยาวทั้งเส้น (ผิวเรียบสนิท
// จะสะท้อนเป็นเส้นตรง ผิวโค้งจะสะท้อนเป็นจุด/วงรีแคบ) เบามาก ไม่ให้แย่งซีน reflection หลัก
export const CARD_CURVATURE_HIGHLIGHT_CSS =
  'radial-gradient(ellipse 65% 40% at 50% 0%, rgba(255,255,255,.05), transparent 60%)'

// v48: "Corner Gleam" — ฟีดแบ็ก "Card ตอนนี้ Matte 100% อยากเพิ่ม Reflection ~2% ตรงมุมบน เหมือนโลหะจริง"
// — CARD_CURVATURE_HIGHLIGHT_CSS ด้านบนเป็นไฮไลต์ตรงกลางขอบบน (50% 0%) ไม่ใช่ "มุม" — โทเคนนี้แยกต่างหาก
// เป็นจุดสว่างแคบๆ ชิดมุมบนซ้ายจริงๆ (8% 8%) จำลองแสงตกกระทบเป็น "ประกาย" ที่ขอบโค้งของมุม ไม่ใช่แถบ
// สะท้อนกว้างกลางขอบแบบชั้นข้างบน — alpha .02 ตามที่ขอเป๊ะ (แทบมองไม่เห็น แต่ทำให้ผิวรู้สึกเป็นโลหะขัดเงา)
export const CARD_CORNER_GLEAM_CSS = 'radial-gradient(circle at 8% 8%, rgba(255,255,255,.02), transparent 22%)'

// v19: ฟีดแบ็ก "Metric Card ยังเหมือน Dark Card + Glow อยากได้ Titanium Surface -> Reflection ->
// Micro Bevel -> Soft Bloom" — CARD_REFLECTION_CSS/CARD_CURVATURE_HIGHLIGHT_CSS ทำ Reflection ไปแล้ว,
// glow มุมทำ Soft Bloom ไปแล้ว แต่ยังไม่มี "Micro Bevel" จริง (ขอบที่ดูเหมือนถูกกัดเป็นร่อง/สลักลงในผิว
// โลหะ) — ก่อนหน้านี้ขอบใช้แค่ไล่สีธีม (สี, ไม่ใช่กลาง) เป็นแค่ "ขอบเรืองแสง" ไม่ใช่ "ขอบที่มีมิติ" —
// โทเคนนี้เป็นไล่สีกลาง (ไม่ผูกสีธีม) มุมบนซ้ายสว่าง (สะท้อนแสง) ไล่ไปมุมล่างขวามืด (เงาจม) วาดถึง
// border-box ซ้อนกับขอบไล่สีธีมเดิม (ไม่ได้แทนที่) ให้ขอบมีทั้งมิติจริง + สีธีมพร้อมกัน
// v26: ฟีดแบ็ก "Metric Card ยัง Flat กว่า Workout ~15% - เพิ่ม Micro Bevel" - ขอบ 2 จุดหัว-ท้าย
// (มุมบนซ้ายสว่าง/มุมล่างขวามืด) ที่เป็นตัวให้ความรู้สึก "ร่องสลัก" จริง ขยับขึ้นอีก ~15% ตามสัดส่วนเดียว
// กับที่เคยทำรอบ v23 (.16->.18, .22->.25) จุดกลาง (.02) คงเดิมไม่แตะ (เป็นแค่จุดเปลี่ยนผ่านนุ่มๆ ไม่ใช่
// ตัวบอกมิติ) โทเคนนี้ใช้เฉพาะ MetricCard จุดเดียวในทั้งแอป จึงปรับตรงนี้โดยไม่กระทบการ์ดอื่น
export const CARD_BEVEL_CSS = 'linear-gradient(135deg, rgba(255,255,255,.18) 0%, rgba(255,255,255,.02) 30%, transparent 55%, rgba(0,0,0,.25) 100%)'

// v20: "Titanium Reflection" — ฟีดแบ็ก "เพิ่ม Reflection บางๆ บน Card แบบเส้นสั้นๆ หลายเส้น ไม่เท่ากัน
// opacity 2-3% แทบมองไม่เห็น แต่ทำให้การ์ดดูเป็นโลหะ" — CARD_REFLECTION_CSS/CARD_CURVATURE_HIGHLIGHT_CSS
// เดิมเป็นแถบสะท้อนแสงต่อเนื่องเส้นเดียว (จำลองพื้นผิวโค้งเดียว) โทเคนนี้คือ 3 เส้นทแยงสั้นๆ ยาวไม่เท่ากัน
// ตำแหน่ง/มุมเดียวกับ DIAGONAL_TITANIUM_CSS (115deg) แยกจากกัน จำลองรอยขัดเงาหลายจุดที่แสงกระทบไม่พร้อมกัน
// ต่างจากรอยขัดเดียวยาวต่อเนื่อง — ใช้ร่วมกับการ์ดทุกใบผ่าน PremiumCard และ MetricCard (compact)
// v49: ฟีดแบ็ก "ลดความเข้มของ diagonal pattern ลง" — ลด alpha ทั้ง 3 เส้นลงประมาณ 1/3 (.03/.025/.02 ->
// .02/.018/.014) ยังเห็นรอยขัดเงาอยู่ (ไม่ตัดออกทั้งหมด) แค่เบาลงให้ตัวหนังสือบนการ์ดเด่นกว่าลายพื้นผิว
export const CARD_MULTI_REFLECTION_CSS = [
  'linear-gradient(115deg, transparent 12%, rgba(255,255,255,.02) 18%, transparent 26%)',
  'linear-gradient(115deg, transparent 42%, rgba(255,255,255,.018) 47%, transparent 53%)',
  'linear-gradient(115deg, transparent 66%, rgba(255,255,255,.014) 70%, transparent 76%)',
].join(', ')

// v21: ฟีดแบ็ก "Card ยังเป็น Dark + Glow อยากได้ Titanium -> Reflection -> Micro Bevel -> Ambient
// Shadow" — 3 อย่างแรกมีแล้ว (CARD_GRADIENT_CSS+grain, CARD_REFLECTION_CSS/CURVATURE/MULTI_REFLECTION,
// CARD_BEVEL_CSS) มีแค่ "เงา" ที่ยังเป็นแค่ contact shadow ชิดขอบเดียว (CARD_FLOAT_SHADOW) ไม่มีมิติของ
// "แสงแวดล้อม" กว้างๆ นุ่มๆ แบบที่การ์ดวางอยู่ในห้องจริง — เพิ่มชั้นเงาที่สองนี้ กว้างกว่า/นุ่มกว่า/จางกว่า
// ซ้อนกับ CARD_FLOAT_SHADOW เดิม (เทคนิคเดียวกับ Material Design elevation: umbra ชิด + penumbra กว้าง)
export const CARD_AMBIENT_SHADOW_CSS = '0 24px 48px -12px rgba(0,0,0,.38)'

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
// v3: ฟีดแบ็ก "Secondary text (label การ์ด/timestamp/คำอธิบายใต้การ์ดใน Detail Sheet) จมกับพื้นหลังมืด —
// อยากขยับสว่างขึ้นแบบ token เดียว ไม่ต้องขาว" — secondary/caption เป็น 2 เฉดที่มืดสุดในชุดนี้ (ใช้กับ
// เนื้อหา Detail Sheet เป็นหลัก เช่น WorkoutStreakDetailSheet/FitnessScoreDetailSheet/MetricDetailSheet)
// ขยับขึ้นตามเลขที่ผู้ใช้ระบุเป๊ะ (secondary #818181->#9A9DA3, caption #676767->#70757D) — title/body ไม่แตะ
// (ผู้ใช้ยืนยันว่าสว่างพอแล้ว ไม่ต้องการเพิ่ม brightness ทั้งระบบ เฉพาะจุดที่จมจริงๆ เท่านั้น)
// v4 (P0, Typography/Contrast review): ตารางฟีดแบ็กรอบใหม่ระบุ Main value/Heading "ดีแล้ว คงไว้" (title/
// body ไม่แตะ ตรงกับ v3) แต่ Secondary ต้องการ "+10-15% contrast" และ Caption ต้องการ "+contrast" ชัดเจน
// กว่า Secondary (เพราะเป็นเฉดมืดสุด) — bump ด้วยสูตร lighten() เดียวกับ v3 เดิม: secondary +12%
// (#9A9DA3->#A6A9AE ตรงกลางช่วง 10-15% ที่ขอ), caption +18% (#70757D->#8A8E94 มากกว่า secondary ตาม
// สัดส่วนที่มืดกว่าเดิม) — คำนวณ WCAG contrast บนพื้นการ์ด surface2 (#23272D) ยืนยันตัวเลข: caption จาก
// 3.23:1 (ไม่ผ่าน AA 4.5:1) ขยับเป็น 4.55:1 (ผ่านพอดี), secondary จาก 5.51:1 ขยับเป็น 6.36:1 (ผ่านสบายอยู่
// แล้ว ขยับแค่พอให้สังเกตความต่างได้ ไม่ทำให้จ้าเกิน tier ที่เข้มกว่า) — title/body ไม่แตะเหมือนเดิม
export const TEXT = {
  title: '#F4F4F4',
  body: '#BDBDBD',
  secondary: '#A6A9AE',
  caption: '#8A8E94',
} as const

// ===================================================================================
// v27: "Titanium Geometry" — ฟีดแบ็ก "Card ยังเป็น Rounded Rectangle ธรรมดา อยากได้มุมตัดแบบ CNC/Micro
// Cut เหมือน Apple Vision Pro / Alienware ทุก Card คนจะจำได้เลย" — TodaysFocusCard.tsx มีมุมตัด
// (clip-path) เฉพาะใบเดียวอยู่ก่อนแล้ว (มุมบนซ้าย 18px, มุมที่เหลือ 4px) แต่เป็นค่า hardcode เฉพาะไฟล์
// นั้น — ดึงออกมาเป็นฟังก์ชันกลางตรงนี้ ให้ "ทุกการ์ด" ใช้สูตรเดียวกัน มุมเดียวกัน (บนซ้าย) เป็นลายเซ็น
// เดียวกันทั้งแอปจริงๆ (ไม่ใช่แค่โทนสี/พื้นผิวคล้ายกันแบบเดิม) — ทุกจุดคำนวณด้วย calc() ทั้งหมด ใช้ได้กับ
// การ์ดทุกขนาดโดยไม่ต้องรู้ width/height จริงล่วงหน้า
export function cncCornerClipPath(primary: 'tl' | 'tr' | 'bl' | 'br' = 'tl', primaryCut = 18, minorCut = 4): string {
  const cutTL = primary === 'tl' ? primaryCut : minorCut
  const cutTR = primary === 'tr' ? primaryCut : minorCut
  const cutBR = primary === 'br' ? primaryCut : minorCut
  const cutBL = primary === 'bl' ? primaryCut : minorCut
  return `polygon(${cutTL}px 0, calc(100% - ${cutTR}px) 0, 100% ${cutTR}px, 100% calc(100% - ${cutBR}px), calc(100% - ${cutBR}px) 100%, ${cutBL}px 100%, 0 calc(100% - ${cutBL}px), 0 ${cutTL}px)`
}

// ค่าดีฟอลต์ที่ใช้ร่วมกันทั้งแอป (มุมบนซ้าย 18px/มุมอื่น 4px) — เท่ากับที่ TodaysFocusCard ใช้อยู่แล้วเป๊ะ
// เอ็กซ์พอร์ตแยกไว้เผื่อ component อื่นอยากอ้างอิงค่าตัวเลขตรงๆ (เช่น ทำเส้นไฮไลต์ตามแนวมุมตัด)
export const CNC_CORNER_PRIMARY_CUT = 18
export const CNC_CORNER_MINOR_CUT = 4
export const CNC_CORNER_CLIP_PATH_DEFAULT = cncCornerClipPath('tl', CNC_CORNER_PRIMARY_CUT, CNC_CORNER_MINOR_CUT)

// v27: "Titanium Mesh" — ฟีดแบ็ก "มีเส้นเฉียงแล้ว แต่จะเพิ่ม Mesh ไขว้ 2 ทิศ ละเอียดมาก Opacity 2%
// แทบมองไม่เห็น แต่ scroll แล้วดูแพงขึ้น" — TodaysFocusCard.tsx มีลายไขว้แบบนี้อยู่ก่อนแล้วเฉพาะใบเดียว
// (ระยะห่าง 22px) ดึงออกมาเป็นโทเคนกลาง + ถี่ขึ้น (12px แทน 22px ตามคำขอ "ละเอียดมาก") ให้ทุกการ์ดใช้
// ร่วมกันได้ — แยกจาก DIAGONAL_TITANIUM_CSS เดิม (ทิศทางเดียว 115deg) เพราะ mesh คือไขว้ 2 ทิศ (115deg +
// 25deg) จำลองผิวโลหะกัด CNC เป็นตาราง ไม่ใช่แค่รอยขัดทิศทางเดียว
//
// v48: ฟีดแบ็ก "Texture ยังเป็น Diagonal ไขว้ 2 ทิศเหมือน Carbon แต่ Titanium จริงเป็น Brushed (เส้นขนาน
// ทิศทางเดียว) มากกว่า" — ตัดชั้น 25deg (ไขว้) ออก เหลือแค่ชั้น 115deg เดียว (ทิศทางเดียวกับ
// DIAGONAL_TITANIUM_CSS ที่ใช้ทั่วแอปอยู่แล้ว) เปลี่ยนจากลายตาข่ายไขว้ (อ่านเป็นลายคาร์บอนไฟเบอร์ทอกัน)
// เป็นเส้นขนานทิศทางเดียว (อ่านเป็นรอยขัดโลหะจริง/Brushed Titanium) — alpha/ระยะห่างเดิมไม่แตะ
// v49: ลด alpha ลายเส้นขนานลงเล็กน้อยพร้อมกับ CARD_MULTI_REFLECTION_CSS ข้างบน (เหตุผลเดียวกัน — "ลดความ
// เข้มของ diagonal pattern") จาก .02 เหลือ .014
export const TITANIUM_MESH_CSS =
  'repeating-linear-gradient(115deg, rgba(255,255,255,.014) 0px, rgba(255,255,255,.014) 1px, transparent 1px, transparent 12px)'

// ===================================================================================
// v27: "Hero Card Product Shot" — ฟีดแบ็ก "Workout Card 9.5/10 อยากได้ดัมเบล Rim Light/Dust/Spark/
// Reflection เหมือนภาพโฆษณา Nike ไม่ใช่แค่ Render" — DUST_PARTICLES_BG จำลองฝุ่นละเอียดฟุ้งในอากาศที่
// โดนแสงสตูดิโอส่องผ่าน (เทคนิคเดียวกับ HAIRLINE_SCRATCH_BG/MICRO_GRAIN_BG คือ feTurbulence + threshold
// ทาง alpha) แต่ตั้ง threshold สูงกว่ามาก (สูตร alpha*9-8.3 แทน *1.6-0.55) ให้เหลือรอดแค่จุดที่สว่างสุด
// ของ noise เป็นจุดกระจายห่างๆ แบบฝุ่นจริง ไม่ใช่เกรนทึบเหมือน grain ทั่วไป
export const DUST_PARTICLES_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='dust'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.55' numOctaves='2' stitchTiles='stitch' result='n'/%3E%3CfeColorMatrix in='n' type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 9 -8.3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23dust)'/%3E%3C/svg%3E")`
