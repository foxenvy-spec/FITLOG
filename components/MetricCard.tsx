'use client'

import { dashboardSpec } from '@/lib/dashboardSpec'
import {
  NOISE_BG,
  TEXT,
  CARD_GRADIENT_CSS,
  CARD_REFLECTION_CSS,
  CARD_CURVATURE_HIGHLIGHT_CSS,
  CARD_MULTI_REFLECTION_CSS,
  CARD_BEVEL_CSS,
  CARD_AMBIENT_SHADOW_CSS,
  CARD_FLOAT_SHADOW,
  DIAGONAL_TITANIUM_CSS,
  CNC_CORNER_CLIP_PATH_DEFAULT,
  TITANIUM_MESH_CSS,
  glowAlphaHex,
} from '@/lib/theme'
import Sparkline from './dashboard/Sparkline'

export type MetricIconImageKey = 'weight' | 'bodyFat' | 'muscle' | 'fatMass' | 'bmi'

// ไอคอนรูปจริงชุดเดียวกับหน้าสุขภาพ (health/page.tsx: STAT_ICON_IMAGES) แทนไอคอนเส้น SVG เดิม
// เพื่อให้การ์ดสรุปด้านบนสุดของหน้า Dashboard ใช้ภาษาภาพเดียวกับหน้าสุขภาพ
export const METRIC_ICON_IMAGES: Record<MetricIconImageKey, string> = {
  weight: '/icons/weight.png',
  bodyFat: '/icons/body-fat.png',
  muscle: '/icons/skeletal-muscle.png',
  fatMass: '/icons/fat-mass.png',
  bmi: '/icons/bmi.png',
}

export interface MetricCardTheme {
  main: string
  second: string
  // ความเข้ม glow มุมการ์ด (0-100) — ไม่ใส่ = ใช้ดีฟอลต์ 20 (พฤติกรรมเดิมก่อนมีฟิลด์นี้) เฉพาะมือถือ
  // (compact) เท่านั้นที่อ่านค่านี้จริง — เดสก์ท็อปยัง hardcode alpha คงที่เหมือนเดิมทุกประการ ไม่กระทบ
  // ให้แต่ละการ์ด glow เข้ม/อ่อนไม่เท่ากัน (เช่น น้ำหนัก 18% เข้มกว่ามวลไขมัน 10%) ดูเป็นธรรมชาติกว่า
  // glow เท่ากันหมดทุกใบแบบเดิม
  glow?: number
}

export interface MetricCardProps {
  icon: MetricIconImageKey
  label: string
  valueText: string
  deltaText: string | null
  deltaColor: string
  deltaDir: 'up' | 'down' | null
  series: number[]
  theme: MetricCardTheme
  // ข้อความ "ล่าสุด ..." บรรทัดเสริมใต้เดลต้า (ใช้เฉพาะตอนมือถือเปิด showLastMeasuredDate)
  lastMeasuredText?: string | null
  // การ์ดสูงขึ้นอีกนิด เผื่อพื้นที่บรรทัด lastMeasuredText ไม่ให้ชนกับแถวไอคอน/ป้ายชื่อด้านบน
  tall?: boolean
  // มุมโค้งการ์ด — default 'lg' (8px, เดิม) สำหรับเดสก์ท็อป, มือถือใช้ 'xl20' (20px, ดูพรีเมียมกว่า
  // ตาม design-system ที่กำหนด "Card Radius 20px") ผ่าน colorScheme="vibrant" ใน BodyMetricsRow
  radius?: 'lg' | 'xl20'
  // เฉพาะ Mobile Dashboard v2 (BodyMetricsRow colorScheme="vibrant" ส่ง compact=true ลงมา) —
  // ลด padding ลงจากเดิม ให้การ์ด "ภาพรวมร่างกาย" ดูกระชับขึ้นใน grid 2x2 บนมือถือ โดยไม่กระทบ
  // เดสก์ท็อป (DashboardView ไม่ได้ส่ง prop นี้ จึง default เป็น false เหมือนเดิมทุกประการ)
  compact?: boolean
}

function splitValueUnit(text: string): { num: string; unit: string } {
  const spaceIdx = text.indexOf(' ')
  if (spaceIdx === -1) return { num: text, unit: '' }
  return { num: text.slice(0, spaceIdx), unit: text.slice(spaceIdx + 1) }
}

// เฉพาะมือถือ (compact): แยกข้อความเดลต้าที่ BodyMetricsRow รวม "ตัวเลข + ช่วงเวลา" มาในสตริงเดียว
// (เช่น "-2.1 kg จาก 2 เดือนก่อน") ออกเป็น trend ("-2.1 kg") กับ caption ("จาก 2 เดือนก่อน") เพื่อโชว์
// คนละบรรทัด/คนละน้ำหนักตามดีไซน์ — ถ้าข้อความไม่มีคำว่า "จาก" (เช่น การ์ด BMI ที่โชว์แค่หมวดหมู่
// ไม่มีช่วงเวลาเทียบ) ให้ caption เป็น null แล้วโชว์ข้อความเดิมทั้งหมดเป็น trend บรรทัดเดียวเหมือนเดิม
function splitDeltaCaption(text: string): { trend: string; caption: string | null } {
  const idx = text.indexOf(' จาก')
  if (idx === -1) return { trend: text, caption: null }
  return { trend: text.slice(0, idx), caption: text.slice(idx + 1) }
}

// ฟีดแบ็ก "'lb' หลุดไปขึ้นบรรทัดใหม่ — ไม่เรียบร้อย" — สาเหตุจริงคือหน่วยซ้ำสองรอบในแถวเดียวกัน (ค่า
// "179.7 lb" + เดลต้า "↓ -1.1 lb") กว้างเกินพื้นที่การ์ดแคบๆ (grid 2 คอลัมน์) พอดีตัดคำสุดท้าย ("lb")
// ไปขึ้นบรรทัดใหม่ — ตัดหน่วยที่ซ้ำกับค่าออกจากเดลต้า (ค่าซ้ายมือบอกหน่วยชัดอยู่แล้ว ไม่ต้องพูดซ้ำ) แทน
// การลดขนาดตัวอักษร/บังคับ nowrap ซึ่งจะทำให้ล้นการ์ดแทน — เฉพาะกรณีจบด้วย " {unit}" เป๊ะ (เช่น "-1.1 lb"
// -> "-1.1") ไม่กระทบการ์ดที่หน่วยติดกับตัวเลขไม่มีช่องว่าง (เช่น "%" ของ Body Fat/BMI ซึ่งไม่เคยล้นอยู่แล้ว)
function stripRedundantUnit(trend: string, unit: string): string {
  const suffix = ` ${unit}`
  return unit && trend.endsWith(suffix) ? trend.slice(0, -suffix.length) : trend
}

// การ์ดเมตริกเดี่ยว (น้ำหนัก/ไขมัน/กล้ามเนื้อ/มวลไขมัน/BMI ฯลฯ) — สกัดออกมาจาก BodyMetricsRow
// เดิม ให้เป็น component แยกที่ reuse ได้ ต่อไปถ้าอยากมีการ์ดสไตล์เดียวกันในหน้าอื่น
// (เช่น หน้า /health) แค่เปลี่ยน props ไม่ต้องเขียน JSX/gradient/glow ใหม่ทั้งหมด
export default function MetricCard({
  icon,
  label,
  valueText,
  deltaText,
  deltaColor,
  deltaDir,
  series,
  theme,
  lastMeasuredText,
  tall = false,
  radius = 'lg',
  compact = false,
}: MetricCardProps) {
  // Mobile Dashboard v2.2: compact (มือถือ) ใช้ border-radius 24px ตาม Design Token ล่าสุด (เดิม
  // 18px) — เดสก์ท็อป (compact=false) ยังได้ 20px เหมือนเดิมทุกประการ ไม่กระทบ
  const radiusClass = radius === 'xl20' ? (compact ? 'rounded-card' : 'rounded-[20px]') : 'rounded-lg'
  // ความเข้ม glow ต่อการ์ด (compact เท่านั้น) — ดีฟอลต์ 20 = พฤติกรรมเดิมก่อนมีฟิลด์ theme.glow
  // (เทียบเท่า alpha hex "33" เดิมที่ hardcode คงที่ทุกใบ)
  const glowAlpha = glowAlphaHex(theme.glow ?? 20)
  // v20: "Orange Core" — ฟีดแบ็ก "Metric Card อยากทำเป็น Core -> Reflection -> Bevel -> Shadow" คู่กับ
  // glow มุมเดิม (รัศมีกว้าง 120%, alpha ตาม glowAlpha ต่อการ์ด — ทำหน้าที่เป็น "Bloom") เพิ่มจุดแกนแสง
  // แคบ/เข้มกว่าซ้อนตรงมุมเดียวกัน (รัศมี 45% เท่านั้น, alpha สูงกว่าเดิม ~2 เท่าแต่ไม่เกิน 100) จำลอง
  // แกนแสงจริงที่มุมเป็นจุดแหล่งกำเนิด ไม่ใช่แค่แสงฟุ้งกว้างอย่างเดียวเหมือน Ring ที่ทำ Core/Bloom/Fog
  // แยกชั้นกันไปแล้วก่อนหน้านี้
  const coreAlpha = glowAlphaHex(Math.min(100, (theme.glow ?? 20) * 2.2))
  return (
    <>
      <div
        className={`metric-card relative overflow-hidden ${radiusClass} flex flex-col justify-between ${compact ? 'metric-card-compact' : tall ? 'h-[138px] 2xl:h-[142px]' : 'h-[124px] 2xl:h-[128px]'}`}
        style={{
          // duration 180-220ms ตามที่ขอ — มือถือ (compact) เพิ่ม background-position เข้าไปด้วย (ให้
          // Reflection ขยับตอนแตะทำงานนุ่มๆ ไม่กระตุก) เดสก์ท็อปไม่มี transition ส่วนนี้เหมือนเดิม
          transition: `transform 200ms ease, filter 200ms ease, box-shadow 200ms ease${compact ? ', background-position 200ms ease' : ''}`,
          // ความสูง/padding มือถือ (compact) มาจาก dashboardSpec.metricCard (160px / 16px) — ค่าคงที่
          // (ไม่ใช่ min-height เหมือนรอบก่อน) ตาม Tailwind class แบบไดนามิกใช้ JIT ไม่ได้ (ตรวจจับตอน build
          // ไม่เจอค่าที่มาจากตัวแปร) จึงกำหนดผ่าน style ตรงๆ แทน — เดสก์ท็อป (compact=false) ไม่กระทบ
          height: compact ? dashboardSpec.metricCard.height : undefined,
          padding: compact ? dashboardSpec.metricCard.padding : '16px 18px 12px',
          border: '1.5px solid transparent',
          // v27: "Titanium Geometry" — ฟีดแบ็ก "ทุก Card อยากได้มุมตัดแบบ CNC เป็นลายเซ็นเดียวกันทั้งแอป"
          // ค่าเดียวกับ CNC_CORNER_CLIP_PATH_DEFAULT ที่ PremiumCard ใช้เป็นดีฟอลต์แล้ว (มุมบนซ้ายตัด 18px
          // มุมอื่นตัดเบา 4px) — MetricCard ไม่ได้ใช้ PremiumCard เป็น wrapper (มีดีไซน์ผูกสีธีมของตัวเอง
          // ซับซ้อนกว่า) จึงต้องใส่ตรงนี้แยกต่างหาก แทน radiusClass เดิม (compact/มือถือเท่านั้น —
          // เดสก์ท็อปยังคงมุมโค้งปกติทุกประการ ไม่กระทบ)
          clipPath: compact ? CNC_CORNER_CLIP_PATH_DEFAULT : undefined,
          // 5 background ซ้อนกัน วาดถึง border-box (เพื่อทำ "ขอบไล่สี"), เรียงจากบนสุด(วาดทับ)ไปล่างสุด:
          // 1) CARD_REFLECTION_CSS แถบสะท้อนแสงตรงจากขอบบน (มือถือ (compact) เท่านั้น — ให้วัสดุการ์ด
          //    สอดคล้องกับ PremiumCard, แทน rim light เฉียง 135deg เดิมซึ่งไม่ใช่ทิศทางแสงแบบโลหะขัดเงา
          //    จริงที่สะท้อนจากด้านบนตรงๆ) 2) ไล่สีเข้มพรีเมียมด้านใน + จุดสว่างจางๆ กลางการ์ด กันไม่ให้
          //    กลางการ์ดดำตันเกินไป วาดถึงแค่ padding-box (คือพื้นการ์ดจริง ทับซ่อนกลางของ 3-5 ไว้) —
          //    มือถือ (compact) ใช้ CARD_GRADIENT_CSS เทาเย็น (โทนเดียวกับ PremiumCard ทั้งแอป) แทนเทากลาง
          //    #242424/#171717/#101010 เดิม (R=G=B เป๊ะ ไม่เย็นจริง) — เดสก์ท็อป (compact=false) ยังคง
          //    โทนกรมท่าเดิมทุกประการ ไม่กระทบ
          // 3) radial glow ที่มุมซ้ายบน (สี main) 4) radial glow ที่มุมขวาล่าง (สี second) — มือถือ
          //    (compact) ใช้ glowAlpha (จาก theme.glow ต่อการ์ด) แทน alpha เต็มค่าคงที่เดิม ให้แต่ละการ์ด
          //    glow เข้ม/อ่อนไม่เท่ากันจริง (เช่น น้ำหนัก 18% เข้มกว่ามวลไขมัน 10%) — เดสก์ท็อปยังใช้สีเต็ม
          //    ไม่มี alpha เหมือนเดิมทุกประการ ไม่กระทบ
          // 5) เข้ม→อ่อน→เข้ม แนวทแยง (แทนสีพื้นจางๆ เรียบๆ เดิม) กันไม่ให้ช่วงกลางขอบ/มุมอื่นดูเป็นเส้นแข็งทื่อ
          // ผลคือขอบเรืองแสงชัดเฉพาะ 2 มุมตรงข้ามกัน ส่วนช่วงกลางขอบก็ยังไล่เฉดนุ่มๆ ไม่ใช่เส้นตรงแข็งๆ
          // v12: ขอบไล่สี (ชั้นสุดท้าย) มือถือ (compact) ลดจาก 14/40/14 เหลือ 0a/22/0a (~ครึ่งเดียว) ตามคำขอ
          // "ลดความเข้มข้นสีธีมลง ให้ titanium โชว์ชัดขึ้น" — เดสก์ท็อปคงค่าเดิม 14/40/14 ทุกประการ ไม่กระทบ
          // (ไม่ได้ตั้งใจให้เป็น titanium อยู่แล้ว) glow มุม (radial 3-4) ยังใช้ glowAlpha ต่อการ์ดเดิม
          // ไม่แตะ เพราะเป็นอัตลักษณ์สีที่ปรับทีละใบมาหลายรอบแล้ว (weight 14/bodyFat 11/muscle 9/ฯลฯ)
          // v18: ฟีดแบ็ก "Card ยังดูเป็นการ์ด ไม่ใช่ Surface" — เพิ่ม CARD_CURVATURE_HIGHLIGHT_CSS (วงรี
          // ไฮไลต์แคบตรงกลางขอบบน) เป็นชั้นบนสุด (compact เท่านั้น) จำลองผิวโค้งเล็กน้อยที่แสงจับเป็นจุด
          // แทนที่จะเป็นแค่เส้นสะท้อนแสงตรงยาวทั้งเส้นแบบ CARD_REFLECTION_CSS เดิมอย่างเดียว
          // v19: ฟีดแบ็ก "อยากได้ Micro Bevel ไม่ใช่แค่ Dark Card + Glow" — เดิมขอบ (border-box) มีแค่
          // ไล่สีธีม (เรืองแสงสี ไม่ใช่มิติ) เพิ่ม CARD_BEVEL_CSS (ไล่สีกลาง มุมบนซ้ายสว่าง/มุมล่างขวามืด)
          // ซ้อนบนไล่สีธีมเดิม (border-box เหมือนกัน) ให้ขอบมีทั้งมิติจริงแบบร่องสลักโลหะ + สีธีมพร้อมกัน
          // v20: "Orange Core -> Reflection -> Bevel -> Shadow" — เพิ่ม CARD_MULTI_REFLECTION_CSS (เส้น
          // ทแยงสั้นๆ) เป็นชั้นบนสุด + จุด "Core" แคบ/เข้มกว่าซ้อนตรงมุมเดียวกับ glow เดิม (ซึ่งทำหน้าที่
          // เป็น Bloom กว้างอยู่แล้ว) — coreAlpha คำนวณจาก glow ต่อการ์ดเดิมคูณ 2.2 (ไม่แตะ glowAlpha/
          // theme.glow ต่อการ์ดที่ tuned มาหลายรอบ แค่เพิ่มชั้นใหม่ซ้อน ไม่แก้ค่าเดิม)
          // v41: ฟีดแบ็ก "ทำเป็น Version 3 (Minimal Dark Titanium)" — เดสก์ท็อป (!compact) เดิมพื้นเป็น
          // กระจกกรมท่า (#13233A -> #08121F, ธีมเดียวกับ GlassCard.tsx เก่า) + glow มุมสีเต็มความอิ่มตัว
          // (ไม่มี alpha เลย) คนละวัสดุกับ Dark Titanium ที่มือถือใช้ทั้งแอปมาหลายสิบรอบ — เปลี่ยนพื้นเป็น
          // CARD_GRADIENT_CSS (โทเคนเดียวกับทุกการ์ดในแอป) + glow มุมใส่ glowAlpha ต่อการ์ด (จาก theme.glow
          // เดียวกับที่มือถือใช้ ผ่าน colorScheme="vibrant" ที่ DashboardView ส่งมาแล้ว) แทนสีเต็มความอิ่มตัว
          // v48: ฟีดแบ็ก "Glow ตอนนี้อยู่รอบ Card อยากย้ายไปอยู่ Icon แทน การ์ดจะสะอาดขึ้น" — เดสก์ท็อป
          // (!compact) เดิมมี glow มุมกว้าง (120%/120% radial 2 มุมตรงข้าม) ซ้อนบนพื้นการ์ดด้วย ตัดออก
          // เหลือแค่พื้นเข้ม + เส้นขอบไล่สีบางๆ (linear-gradient 135deg ท้ายสุด ยังอยู่ — เป็น "ขอบ" ไม่ใช่
          // "แสงฟุ้ง") — glow ยกไปอยู่ที่ไอคอนสี่เหลี่ยมมุมโค้งด้านล่างแทน (ดู boxShadow ของ span ไอคอน)
          // มือถือ (compact) ไม่แตะ เพราะ tune มาแล้วหลายสิบรอบแยกต่างหาก ไม่ใช่จุดที่ฟีดแบ็กรอบนี้พูดถึง
          backgroundImage: compact
            ? `${CARD_MULTI_REFLECTION_CSS}, ${CARD_CURVATURE_HIGHLIGHT_CSS}, ${CARD_REFLECTION_CSS}, radial-gradient(45% 45% at 0% 0%, ${theme.main}${coreAlpha}, transparent 70%), radial-gradient(45% 45% at 100% 100%, ${theme.second}${coreAlpha}, transparent 70%), radial-gradient(circle at 50% 55%, #2C2E33, transparent 60%), ${CARD_GRADIENT_CSS}, radial-gradient(120% 120% at 0% 0%, ${theme.main}${glowAlpha}, transparent 55%), radial-gradient(120% 120% at 100% 100%, ${theme.second}${glowAlpha}, transparent 55%), ${CARD_BEVEL_CSS}, linear-gradient(135deg, ${theme.main}0a, ${theme.main}22, ${theme.main}0a)`
            : `radial-gradient(circle at 50% 55%, #2C2E33, transparent 60%), ${CARD_GRADIENT_CSS}, linear-gradient(135deg, ${theme.main}0a, ${theme.main}22, ${theme.main}0a)`,
          backgroundOrigin: 'border-box',
          // หมายเหตุ: CARD_MULTI_REFLECTION_CSS รวม 3 เกรเดียนต์ไว้ในตัวเอง (คั่น comma) นับเป็น 3 layer
          // ไม่ใช่ 1 — clip/size/position ด้านล่างต้องมี 3 ค่าแรกตรงกับ 3 layer นั้นเสมอ (ไม่งั้น CSS จะ
          // วนค่าซ้ำผิดตำแหน่งไปให้ layer อื่นแทนเงียบๆ ไม่ error) รวมทั้งหมด compact = 13 layer:
          // multi-reflection(3) + curvature(1) + reflection(1) + core x2(2) + dark-center(1) +
          // gradient(1) = 9 padding-box, ตามด้วย glow x2(2) + bevel(1) + border(1) = 4 border-box
          backgroundClip: compact
            ? 'padding-box, padding-box, padding-box, padding-box, padding-box, padding-box, padding-box, padding-box, padding-box, border-box, border-box, border-box, border-box'
            : 'padding-box, padding-box, border-box',
          // มือถือ (compact) เท่านั้น: ขยายชั้นที่ 5 (CARD_REFLECTION_CSS, หลัง multi-reflection 3 +
          // curvature 1) สูงกว่ากล่องจริง (150%) ให้ .metric-card-compact:active เลื่อนตำแหน่งชั้นนี้ลงมา
          // ได้ (ดู style jsx) จำลอง "แถบสะท้อนแสงขยับ" ตอนแตะ เหมือน PremiumCard — เดสก์ท็อปไม่ตั้งค่านี้
          // เลย (undefined) ใช้ auto/0 0 ปกติทุกประการ ไม่กระทบ
          backgroundSize: compact
            ? 'auto, auto, auto, auto, 100% 150%, auto, auto, auto, auto, auto, auto, auto, auto'
            : undefined,
          backgroundPosition: compact
            ? '0 0, 0 0, 0 0, 0 0, 0% 0%, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0'
            : undefined,
          // ชั้นซ้อนกัน: ambient shadow (มือถือ (compact) ใช้ CARD_FLOAT_SHADOW เบาบางกว่าเดิมให้การ์ด
          // ดูลอย เดสก์ท็อปยังใช้ contact+ambient shadow คู่เดิมทุกประการ) + inset highlight (มือถือ
          // (compact) ใช้ inset แนวทแยงมุมบนซ้ายแบบเดียวกับ CARD_INSET_SHADOW ของ PremiumCard ให้ความสว่าง
          // กระจุกที่มุม ไม่ใช่เต็มเส้นขอบบนแบบเดิม — เดสก์ท็อปคงค่าเดิม inset 0 1px ทุกประการ) + inset
          // เงาเข้มขอบล่างแบบจม (compact/มือถือเท่านั้น เดสก์ท็อปไม่กระทบ) + glow สีธีมเยื้อง offset ไปมุม
          // ซ้ายบน/ขวาล่าง (แทนที่จะเป็น 0 0 แผ่เท่ากันทุกด้าน) ให้ธีมสีเรืองแสงเฉพาะ 2 มุมตรงข้ามให้เข้ากับขอบ
          // — มือถือ (compact) ใช้ glowAlpha ต่อการ์ดแทน alpha "33" คงที่เดิม
          // v21: เพิ่ม CARD_AMBIENT_SHADOW_CSS (เงากว้าง/นุ่ม/จางกว่า CARD_FLOAT_SHADOW) นำหน้า compact
          // เท่านั้น ให้การ์ดมีทั้งเงาชิดขอบ + เงาแวดล้อมกว้างๆ เหมือน PremiumCard — เดสก์ท็อปไม่กระทบ
          // v23: ฟีดแบ็ก "Card Metrics ยัง Flat อยากให้ดูหนากว่าเดิมประมาณ 15%" — เพิ่ม Top Highlight
          // (.09->.105 alpha) และ Bottom Shadow (10px->11.5px blur, .6->.68 alpha) ขึ้นราว 15% ตามที่ขอ
          // เป๊ะ — glow มุม (theme.main/second) ไม่แตะ (อัตลักษณ์สีต่อการ์ดที่ปรับมาหลายรอบแล้ว)
          // v25: "Rim Light" — ฟีดแบ็ก "Card จบแค่ Glow -> Shadow อยากได้ Top Hairline 0.5px ขาว 6% ->
          // Bottom Shadow (มีแล้ว) -> Orange Ambient เพิ่ม ให้การ์ดหนาขึ้นโดยไม่ต้องเพิ่ม Glow" — เพิ่ม 2
          // box-shadow ใหม่ต่อท้าย: (1) เส้นขอบบนสุดจริงๆ (offset -0.5px ไม่ใช่ inset ให้เป็นเส้นที่ขอบ
          // จริง ไม่ใช่ในเนื้อผิว ต่างจาก "Hairline Highlight" เดิม v24 ซึ่งเป็น div คาดกลางความกว้างและ
          // จางที่ปลายทั้งสองข้าง อันนี้เต็มความกว้าง คมชัดที่ขอบจริง) (2) วงแหวนอำพันจางมากรอบนอกการ์ด
          // จำลอง "Orange Ambient" ที่ขอบ ไม่ใช่ glow มุมแบบเดิม (ซึ่งเป็นสีธีมต่อการ์ด ไม่ใช่อำพันเสมอ)
          // v26: ฟีดแบ็ก "Card ยัง Flat กว่า Workout ~15%" อีกรอบ - Top Reflection (inset highlight
          // .105 -> .12) และ Bottom Shadow (offset 4.6px -> 5.3px, blur 11.5px -> 13.2px, alpha
          // .68 -> .78) ขยับขึ้นอีก ~15% ตามสัดส่วนเดียวกับรอบ v23 ก่อนหน้า
          // v41: glow มุม box-shadow เดิม (-6px/-6px, 6px/6px) hardcode alpha "33" (~20%) คงที่ทุกใบ
          // เท่ากันหมด — เปลี่ยนเป็น glowAlpha ต่อการ์ด (เดียวกับที่ backgroundImage ใช้ และเดียวกับที่
          // มือถือ tune มาแล้วผ่าน theme.glow) ให้ลดหลั่นตามความสำคัญเหมือนกันทั้งสองแพลตฟอร์ม
          // v48: ฟีดแบ็ก "Glow ย้ายจาก Card ไป Icon" — เดสก์ท็อป (!compact) ตัด glow มุม box-shadow นี้
          // ออกทั้งคู่ (การ์ดสะอาดขึ้น) เหลือแค่เงาจริง (contact/inset) — glowAlpha ยังคำนวณไว้เหมือนเดิม
          // เพราะไอคอนด้านล่าง (span.rounded-[10px]) ใช้ theme.main33 ของตัวเองอยู่แล้วแยกต่างหาก มือถือ
          // (compact) ไม่แตะ ยังมี glow มุมเหมือนเดิมทุกประการ (tune มาแล้วหลายสิบรอบ ไม่ใช่จุดที่พูดถึงรอบนี้)
          // v49: ฟีดแบ็ก "ลด Glow/Shadow/Border highlight ลง 10-15% ให้ดู Premium มากกว่า Gaming" (Body
          // Overview การ์ดมือถือ) — inset top highlight .12 -> .105 (-12.5%) และ inset bottom shadow
          // .78 -> .68 (-13%) เฉพาะ compact (มือถือ) เดสก์ท็อปไม่กระทบ — glow มุม (theme.main/second ผ่าน
          // glowAlpha) ไม่แตะตรงนี้ตรงๆ แต่ค่า theme.glow ต่อการ์ดใน BodyMetricsRow.tsx ลดแล้วแยกต่างหาก
          // (glowAlpha คำนวณจากค่านั้น จึงลดตามไปเองโดยไม่ต้องแก้สูตรตรงนี้)
          // v50: ฟีดแบ็ก "ลดความเข้มของ Glow นิดหนึ่ง" (รอบถัดมา) — ลดต่ออีกขั้นเบาๆ .105 -> .095, .68 -> .60
          // v51: ฟีดแบ็ก "ลด Glow/Shadow ของ Metric Cards ประมาณ 5-10%" (รอบ polish สุดท้าย) — ลดอีกขั้น
          // เบาๆ .095 -> .088, .60 -> .55
          // v52: ฟีดแบ็ก "Less decoration, more hierarchy — บางจุดมี border+glow+gradient+shadow+accent
          // พร้อมกัน เลือกแค่ 2-3 อย่างต่อการ์ดพอ" — การ์ด compact นี้มี box-shadow ซ้อนกันถึง 8 เลเยอร์
          // (ambient/float/inset highlight/inset shadow/glow มุม x2/hairline/ambient orange accent)
          // ตัด 2 เลเยอร์ท้ายสุดที่เบาบาง/ซ้ำซ้อนที่สุดออก (hairline ขาว .06 alpha 0.5px กับ ambient
          // orange accent .035 alpha ซึ่งเป็น "accent" ชั้นที่ 8 ที่ไม่มีใครสังเกตเห็นจริงอยู่แล้ว) เหลือ
          // 6 เลเยอร์ (ambient/float/inset highlight/inset shadow/glow มุม x2) — ยังคงวัสดุไทเทเนียมไว้
          // ครบ ไม่ใช่ตัดทิ้งทั้งระบบ แค่ตัดชั้นส่วนเกินที่ไม่มีผลต่อการรับรู้จริง
          boxShadow: `${compact ? `${CARD_AMBIENT_SHADOW_CSS}, ${CARD_FLOAT_SHADOW}` : '0 2px 6px rgba(0,0,0,.35), 0 8px 24px 2px rgba(0,0,0,.4)'}, ${compact ? 'inset 1px 1px 0 0 rgba(255,255,255,.088)' : 'inset 0 1px rgba(255,255,255,.05)'}${compact ? `, inset 0 -5.3px 13.2px rgba(0,0,0,.55), -6px -6px 20px ${theme.main}${glowAlpha}, 6px 6px 20px ${theme.second}${glowAlpha}` : ''}`,
        }}
      >
        {/* เกรนผิวโลหะบางๆ (Dark Titanium เดียวกับหน้าเทมเพลต/PremiumCard)
            v22: ฟีดแบ็ก "Tiny Noise เบามาก แทบมองไม่เห็น แต่ถือแล้วรู้สึกว่าเป็นวัสดุจริง" — ขยับจาก 0.02
            เป็น 0.03 เหมือน PremiumCard ให้สองจุดสอดคล้องกัน
            v24: ให้คะแนน 9.2/10 "ยังขาด Titanium Noise" — ขยับอีกนิดจาก 0.03 เป็น 0.035 */}
        {/* v26: ฟีดแบ็ก "Card ยัง Flat กว่า Workout ~15% - Soft Noise" - ขยับ Soft Noise ขึ้นอีกรอบตาม
            สัดส่วนเดียวกับ v23/v24 (0.035 -> 0.04, +15%) */}
        {/* v41: เดิมชั้นนี้ compact (มือถือ) เท่านั้น เดสก์ท็อปใช้พื้นกรมท่าของตัวเองไม่ใช่ titanium —
            ตอนนี้เดสก์ท็อปเปลี่ยนไปใช้ CARD_GRADIENT_CSS เดียวกันแล้ว (ดู backgroundImage ด้านบน) เกรนนี้
            จึงควรมีทั้งสองแพลตฟอร์มเพื่อให้ผิวการ์ดสอดคล้องกัน */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 ${radiusClass}`}
          style={{ backgroundImage: NOISE_BG, opacity: 0.04, mixBlendMode: 'overlay' }}
        />
        {/* v24: "Hairline Highlight" — ฟีดแบ็ก "ยังขาด Hairline Highlight" ต่างจาก CARD_REFLECTION_CSS
            เดิม (แถบไล่สีนุ่มกว้าง ~40% ของความสูงการ์ด) อันนี้คือเส้นคมชัด 1px เส้นเดียวแนบขอบบนสุดจริงๆ
            จำลองขอบโลหะที่ถูกเจียรเรียบจนสะท้อนแสงเป็นเส้นคมแทนแถบนุ่ม (ทั้งสองอย่างอยู่ร่วมกันได้ คนละ
            layer คนละจุดประสงค์: แถบนุ่ม = ผิวโค้งสะท้อนกว้าง, เส้นคม = ขอบเจียรจริง) */}
        {/* v26: "Top Reflection" - ฟีดแบ็ก "Card ยัง Flat กว่า Workout ~15%" - เส้น Hairline Highlight
            คมชัดขอบบนขยับขึ้นอีกรอบ (.22 -> .25, +15%) ตามสัดส่วนเดียวกับ Micro Bevel/Bottom Shadow ด้านล่าง */}
        {compact && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 top-0 ${radiusClass}`}
            style={{ height: 1, backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,.25) 25%, rgba(255,255,255,.25) 75%, transparent)' }}
          />
        )}
        {/* v29: ฟีดแบ็ก "การ์ดภาพรวมร่างกาย ขอแบบเดิมได้ไหม" — ย้อนกลับ v28 (Purple Smoke/Blue Energy/
            Green Crystal แยกวัสดุตาม icon) กลับไปเป็นไทเทเนียมชุดเดียวกันทุกใบเหมือนเดิม (มุมตัด CNC/
            ลายตาข่ายจาก v27 ยังอยู่ครบ ไม่แตะ)
            v45: ฟีดแบ็ก "Metric Card ยังแบน อยากได้ Brushed Metal เบาๆ 5%" — ชั้นลายเฉียง+ตาข่ายนี้เดิมมี
            แค่ compact (มือถือ) เท่านั้น เดสก์ท็อป (!compact) ไม่เคยมีเลยตั้งแต่แรก (มีแค่ NOISE_BG grain
            สุ่มแบบจุด ไม่ใช่ลายเส้นบรัชเมทัลทิศทางเดียวแบบนี้) — ตัดเงื่อนไข compact ออก ให้ทั้งสองแพลตฟอร์ม
            ได้ลายเดียวกัน
            v47: ฟีดแบ็ก "ลายเยอะไปนิด เหลือประมาณ 30% ของตอนนี้ เพราะ Titanium จริงๆ จะเห็น Texture น้อยมาก
            จะดูแพงกว่า" — ลดจาก 0.65 เหลือ 0.65*0.3 ≈ 0.2 ตามสัดส่วนที่ขอเป๊ะ ไม่แตะ TITANIUM_MESH_CSS
            ด้านล่าง (ลายตาข่าย คนละชั้นกับลายเฉียงนี้ ไม่ได้ถูกพูดถึง) */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 ${radiusClass}`}
          style={{ backgroundImage: DIAGONAL_TITANIUM_CSS, opacity: 0.2 }}
        />
        {/* v27: "Titanium Mesh" — ลายไขว้ 2 ทิศละเอียด (โทเคนเดียวกับ PremiumCard ใช้) ซ้อนแยกจากลายเฉียง
            ทิศทางเดียวด้านบน ให้การ์ดนี้มีลายตารางแบบเดียวกับการ์ดอื่นทั่วแอปด้วย ไม่ใช่แค่ลายเฉียงเดิม */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 ${radiusClass}`}
          style={{ backgroundImage: TITANIUM_MESH_CSS }}
        />
        {/* v15: การ์ดยังดู "Matte" — เพิ่มแถบสะท้อนแสงเฉียง (diagonal reflection) มุมบนซ้ายไล่ไปขวาล่าง
            แยกจาก CARD_REFLECTION_CSS เดิม (ซึ่งเป็นแถบแนวนอนบนสุดล้วนๆ) อันนี้เอียงตามทิศทางเดียวกับ
            DIAGONAL_TITANIUM_CSS ให้ความรู้สึกผิวโลหะสะท้อนแสงจริง ไม่ใช่พื้นเรียบทึบ (~4% ตามที่ขอ) */}
        {/* v26: "Top Reflection" ต่อ - แถบสะท้อนแสงเฉียงขยับขึ้นอีกรอบ (.04 -> .046, +15%) ชุดเดียวกับ
            Hairline Highlight ด้านบน */}
        {compact && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${radiusClass}`}
            style={{ backgroundImage: 'linear-gradient(115deg, rgba(255,255,255,.046) 0%, transparent 35%)' }}
          />
        )}
        {/* ไล่เฉด radial สีธีมจางๆ กลางค่อนไปทางบน ซ้อนอยู่หลังเนื้อหา ให้พื้นหลังดูลึกมีมิติแทนที่จะเป็น dark navy เรียบๆ —
            v12: มือถือ (compact) ลดจาก 14 (~8%) เหลือ 0a (~4%) ตามคำขอลดสีธีมให้ titanium โชว์ชัดขึ้น
            เดสก์ท็อปคงเดิม 14 ทุกประการ */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 ${radiusClass}`}
          style={{ backgroundImage: `radial-gradient(circle at top left, ${theme.main}${compact ? '0a' : '14'}, transparent 45%)` }}
        />
        {/* ชั้นเพิ่มเติมบางเบามาก (opacity 4%) สีขาวล้วน (ไม่ใช่สีธีม) จากมุมซ้ายบน — เพิ่มมิติแบบผู้ใช้แทบไม่รู้ตัว
            แยกจากชั้นสีธีมด้านบน เพราะอันนี้ให้ความรู้สึก "แสงทั่วไป" ไม่ใช่ "แสงจากไอคอน" */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 ${radiusClass}`}
          style={{ backgroundImage: `radial-gradient(circle at top left, rgba(255,255,255,.03), transparent 50%)` }}
        />
        {/* v16: "Center Highlight" — เดิมการ์ดทั้ง 4 ใบสีดำเท่ากันหมดตรงกลาง (แสง/glow ทุกจุดกระจุกอยู่แค่
            มุมซ้ายบน) ฟีดแบ็ก: อยากได้ไฮไลต์เบามากตรงกลางการ์ดแบบผิวโลหะที่โค้งเล็กน้อยสะท้อนแสงตรงกลาง —
            radial ขาวล้วนจางมาก ไม่ใช่สีธีม (compact/มือถือเท่านั้น) */}
        {compact && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${radiusClass}`}
            style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,.025), transparent 55%)' }}
          />
        )}
        {/* v23: "Inner Glass" — ฟีดแบ็ก "Card Metrics ยัง Flat อยากได้ Inner Glass" — ต่างจาก Center
            Highlight ด้านบน (วงกลมจางกลางการ์ด) อันนี้เป็นวงรีกว้างเอียงไปทางขอบบน จำลองแผ่นกระจก/เลนส์
            โค้งวางทับผิวโลหะ (แสงจับเป็นแถบกว้างใกล้ขอบบน ไม่ใช่จุดกลมกลางการ์ด) */}
        {compact && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${radiusClass}`}
            style={{ backgroundImage: 'radial-gradient(ellipse 80% 45% at 50% 8%, rgba(255,255,255,.05), transparent 65%)' }}
          />
        )}
        {/* จุดแสงฟุ้ง (glow blob) มุมซ้ายบน ให้ความรู้สึกมีแสงจากไอคอนกระจายเข้าไปในการ์ด — เดสก์ท็อปคงเป็น
            วงกลมเบลอเดิมทุกประการ (opacity 0.08) ไม่กระทบ */}
        {!compact && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full"
            style={{ width: 160, height: 160, left: -60, top: -60, background: theme.main, filter: 'blur(60px)', opacity: 0.08 }}
          />
        )}
        {/* v15: มือถือ (compact) เปลี่ยนจากวงกลมเบลอ (glow blob) เป็นแถบสะท้อนแสงเฉียงสีธีม (linear
            reflection) แทน ตามฟีดแบ็ก "Glow ยังเป็นวงกลม ควรเป็นเส้น/แถบสะท้อนแสงบนโลหะ ไม่ใช่ glow แบบเกม"
            — ทิศทางเดียวกับลายเฉียง 115deg ให้ดูเหมือนแสงสะท้อนผิวไทเทเนียมจริงๆ ไม่ใช่แสงฟุ้งจากไอคอน
            (opacity คงเดิม 0.045 เท่าของ v12 ไม่เปลี่ยนความเข้มโดยรวม แค่เปลี่ยนรูปทรง) */}
        {compact && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${radiusClass}`}
            style={{ backgroundImage: `linear-gradient(115deg, ${theme.main} 0%, transparent 30%)`, opacity: 0.045 }}
          />
        )}

        <div className={compact ? 'relative h-full flex flex-col justify-between' : 'relative h-full'}>
          <p
            className="flex items-center gap-2"
            style={{
              // ฟีดแบ็ก "Label ของ Card ควร Contrast ต่ำกว่าตัวเลขประมาณ 1 ระดับ — ตอนนี้บาง Card มี
              // Label ที่เด่นใกล้เคียงกับ Value" — เดสก์ท็อปเดิม rgba(255,255,255,.94) (ขาวเกือบเต็ม) +
              // fontWeight 700 (ตัวหนา) สว่าง/หนักพอๆ กับตัวเลขหลัก (TEXT.title, fontWeight 800) ทั้งที่
              // ควรเป็นชั้น Secondary — เปลี่ยนเป็น TEXT.secondary (โทเคนเดียวกับที่ปรับสว่างขึ้นแล้วรอบ
              // ก่อนหน้า) + fontWeight ปกติ (500) ให้สายตาไหล Label(เบา) -> Value(หนัก) ชัดเจนขึ้น มือถือ
              // (compact) ใช้ TEXT.body/500 อยู่แล้วซึ่งตรงกับ hierarchy นี้พอดี ไม่ต้องแตะ
              color: compact ? TEXT.body : TEXT.secondary,
              // ป้ายชื่อ Metric: มือถือ (compact) จาก dashboardSpec.metricCard.labelFontSize (15px,
              // เดิม 16px) — ลด 1pt กันชื่อยาว ("ไขมันในร่างกาย", "กล้ามเนื้อโครงร่าง") ตัดบรรทัดเพิ่ม
              // ความสูงการ์ดโดยไม่จำเป็น (ดู BodyMetricsRow.tsx ที่ย่อชื่อสองอันนี้ให้สั้นลงด้วยแล้ว)
              // เดสก์ท็อป (compact=false) ยังคง 11px เดิม (ไม่แตะขนาด กันกระทบ layout ที่ tune มาหลายรอบ)
              fontWeight: compact ? 500 : 500,
              fontSize: compact ? dashboardSpec.metricCard.labelFontSize : 11,
            }}
          >
            <span
              className={`relative shrink-0 inline-flex items-center justify-center rounded-[10px] overflow-hidden ${compact ? 'w-[22px] h-[22px]' : 'w-[42px] h-[42px]'}`}
              style={{
                // ฐานเป็นกระจกเข้มเป็นกลาง ไล่จาก "มุมบนสว่างกว่า" ไป "มุมล่างเข้มกว่า" ชัดเจนขึ้น (180deg ตรงๆ
                // แทน 145deg เดิมที่ contrast น้อยไป) ให้ความรู้สึกกระจกโค้งแบบ Apple Vision Pro
                // + จุดสีธีมจางๆ ที่มุมบนซ้าย เป็นการ "แต้ม" สี ไม่ใช่ "ย้อม" ทั้งกล่อง
                // v43: ฐานกรมท่า (#232C40/#0A0E18) เปลี่ยนเป็น CARD_GRADIENT_CSS (โทนไทเทเนียมเดียวกับ
                // พื้นการ์ดหลัก) ตามที่พบใน audit รอบสุดท้าย — จุดสีธีมด้านบนไม่แตะ ยังแต้มทับเหมือนเดิม
                background: CARD_GRADIENT_CSS,
                backgroundImage: `radial-gradient(circle at 30% 25%, ${theme.main}55, transparent 65%), ${CARD_GRADIENT_CSS}`,
                // border บาง 1px สีธีม (คมชัด แทนเส้นหนาๆ) + inset highlight ลดความสว่างลง (.35→.15) ให้เป็น
                // แค่ "ผิวมัน" บางๆ ไม่ใช่เส้นขอบขาวหนา ปล่อยให้ glow ด้านนอกทำหน้าที่เน้นความเด่นแทน
                border: `1px solid ${theme.main}55`,
                // v48: ฟีดแบ็ก "Glow ย้ายจาก Card ไป Icon" — เดสก์ท็อป (!compact) ตัด glow มุมระดับการ์ด
                // ออกแล้ว (ดู boxShadow การ์ดด้านบน) ชดเชยด้วยการเพิ่มรัศมี/ความเข้ม glow ของไอคอนนี้ขึ้น
                // (15px/33 alpha -> 22px/4d alpha เฉพาะเดสก์ท็อป) มือถือ (compact) คงค่าเดิมทุกประการ
                boxShadow: `inset 0 1px rgba(255,255,255,.15), inset 0 -3px 6px rgba(0,0,0,.5), 0 0 ${compact ? '15px' : '22px'} ${theme.main}${compact ? '33' : '4d'}`,
              }}
              aria-hidden="true"
            >
              {/* glass reflection: ย้ายจากแถบเต็มความกว้างด้านบน มาเป็นจุดไฮไลต์เล็กๆ แค่มุมซ้ายบน (~15-20% ของพื้นที่)
                  จำลองแสงตกกระทบจากมุมเดียวแบบของจริง แทนที่จะสว่างเท่ากันทั้งแถบบน */}
              <span
                className="pointer-events-none absolute top-0 left-0"
                style={{
                  width: '65%',
                  height: '45%',
                  background: 'radial-gradient(circle at 15% 15%, rgba(255,255,255,.3), transparent 80%)',
                }}
              />
              {/* ไอคอนเดิมเป็น PNG สีเดียวล้วน — recolor ด้วย CSS mask ให้เป็น gradient สว่าง(บน)→เข้ม(ล่าง)
                  ตามสีธีมของการ์ดนั้นๆ (ไม่ได้เพิ่ม glow ใดๆ ตามที่ขอ แค่ไล่สีในตัวไอคอนเอง) */}
              <span
                className="relative block"
                style={{
                  width: compact ? 17 : 38,
                  height: compact ? 17 : 38,
                  backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${theme.main} 65%, white), color-mix(in srgb, ${theme.main} 85%, black))`,
                  WebkitMaskImage: `url(${METRIC_ICON_IMAGES[icon]})`,
                  maskImage: `url(${METRIC_ICON_IMAGES[icon]})`,
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))',
                }}
              />
            </span>
            {label}
          </p>

          {compact ? (
            // มือถือ (compact): ตรงตามภาพอ้างอิงจริง (Image A) — value+unit+delta อยู่แถวเดียวกัน (delta
            // ชิดขวา) ต่อด้วย sparkline เต็มความกว้างเป็นแถวแยกด้านล่าง — ขนาดตัวเลข/กราฟมาจาก
            // dashboardSpec.metricCard (valueFontSize 22px, sparklineHeight 20px) แหล่งความจริงเดียว
            <>
              <div className="flex items-center justify-between gap-2">
                <p
                  className="font-mono leading-none"
                  style={{
                    // TEXT.title (แทน text-ink #F3F0E8 เดิม) — ตัวเลขหลักของการ์ด ควรเป็นสีเด่นสุด
                    color: TEXT.title,
                    fontSize: dashboardSpec.metricCard.valueFontSize,
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {splitValueUnit(valueText).num}
                  {splitValueUnit(valueText).unit && (
                    <span style={{ fontWeight: 500, fontSize: '0.5em' }}> {splitValueUnit(valueText).unit}</span>
                  )}
                </p>
                {deltaText && (
                  <p
                    className="font-semibold whitespace-nowrap flex items-center gap-1 leading-none shrink-0"
                    style={{ color: deltaColor, fontSize: 12 }}
                  >
                    {deltaDir && <span aria-hidden="true">{deltaDir === 'up' ? '↑' : '↓'}</span>}
                    {stripRedundantUnit(splitDeltaCaption(deltaText).trend, splitValueUnit(valueText).unit)}
                  </p>
                )}
              </div>
              {series.length >= 2 && (
                <div className="mt-1 w-full">
                  {/* v49: ฟีดแบ็ก "ลดความหนาเส้นกราฟลง 10-15%" (Body Overview การ์ดมือถือโดยเฉพาะ) —
                      2px -> 1.7px (-15%) เฉพาะจุดนี้ (compact/มือถือ) เดสก์ท็อปและหน้าสุขภาพยังใช้ค่า
                      ดีฟอลต์ 2px เดิมทุกประการ
                      v50: ฟีดแบ็ก "ลดเส้นกราฟนิดหนึ่ง" (รอบถัดมา) — บางลงอีกขั้น 1.7px -> 1.5px */}
                  {/* ฟีดแบ็ก "ใส่ Glowing Dot ที่จุดปลายสุด + Gradient Area Fill จางๆ ใต้เส้น ให้ดู
                      พรีเมียมแบบ Apple Health/TradingView" — เปิดเฉพาะการ์ดสถิติ 4 ใบหลักนี้ (opt-in
                      props ใหม่ใน Sparkline.tsx เอง ไม่กระทบจุดอื่นที่ใช้ component เดียวกัน) */}
                  <Sparkline
                    series={series}
                    color={theme.main}
                    height={dashboardSpec.metricCard.sparklineHeight}
                    width={200}
                    stretch
                    strokeWidth={1.5}
                    endpointColor={theme.main}
                    glowEndpoint
                    areaFill
                  />
                </div>
              )}
            </>
          ) : (
            // เดสก์ท็อป — ไม่กระทบ เหมือนเดิมทุกประการ (position:absolute ชิดขอบล่าง, ตัวเลข+กราฟข้างกัน,
            // เดลต้าบรรทัดเดียวรวม caption ด้านล่าง)
            <div className="absolute left-0 right-0 bottom-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono leading-none text-ink" style={{ fontSize: 20, letterSpacing: '-0.025em' }}>
                  <span style={{ fontWeight: 800 }}>{splitValueUnit(valueText).num}</span>
                  {splitValueUnit(valueText).unit && (
                    <span style={{ fontWeight: 500, fontSize: '0.82em' }}> {splitValueUnit(valueText).unit}</span>
                  )}
                </p>
                {/* v48: เคยเพิ่มลูกศร+ช่วงเวลาสั้นๆ ("Mini Trend") ใต้ Sparkline ตรงนี้ โดยตั้งใจให้เป็นแค่
                    จุดสรุปเร็วๆ เสริมจากบรรทัดเดลต้าเต็มด้านล่าง ไม่ใช่แทนที่ — แต่บนการ์ดแคบ (5 ใบต่อแถว บน
                    จอเล็ก) สองบรรทัดนี้อยู่ใกล้กันจนอ่านเหมือนตัวหนังสือซ้อน/ทับกัน (ฟีดแบ็ก "ตัวเลขบางช่อง
                    มันทับ") ทั้งที่เป็นข้อมูลเดียวกันเป๊ะ (ลูกศร+ช่วงเวลา ซ้ำกับบรรทัดเดลต้าเต็มด้านล่างที่มี
                    ทั้งค่า+ช่วงเวลาอยู่แล้ว) — ตัดออก เหลือแค่ Sparkline เดี่ยวๆ ฝั่งขวา บรรทัดเดลต้าเต็ม
                    ด้านล่างการ์ดยังอยู่เหมือนเดิมทุกประการ ไม่กระทบ */}
                <div className="shrink-0">
                  <Sparkline series={series} color={theme.main} height={30} width={64} endpointColor={theme.main} glowEndpoint areaFill />
                </div>
              </div>
              {deltaText && (
                <>
                  <p
                    className="font-semibold whitespace-nowrap flex items-center gap-1"
                    style={{ color: deltaColor, marginTop: 6, fontSize: 11 }}
                  >
                    {deltaDir && <span aria-hidden="true">{deltaDir === 'up' ? '↑' : '↓'}</span>}
                    {deltaText}
                  </p>
                  {lastMeasuredText && (
                    <p className="text-[12px] text-muted/70 truncate" style={{ marginTop: 2 }}>
                      {lastMeasuredText}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Hover effect เฉพาะเว็บ/เดสก์ท็อป (@media hover:hover กันไม่ให้ค้างบนมือถือที่ไม่มี hover จริง)
          scale 1.00→1.015 + translateY -2px ตามสเปคที่ขอ, ส่วน "shadow/glow เพิ่ม 10%" ใช้ brightness+contrast
          แทนการคำนวณ alpha สีธีมทีละใบ (ง่ายกว่า/เสถียรกว่า แต่ให้ความรู้สึกใกล้เคียงกัน คือการ์ดดู "เด่นขึ้น" เมื่อชี้เมาส์)
          .metric-card-compact:active — ใช้ class แยกจาก .metric-card เดิม (ผูกเฉพาะตอน compact=true
          เท่านั้น) เลื่อน background-position ของชั้น CARD_REFLECTION_CSS ลงมา 8% ตอนแตะการ์ด (Material
          Animation เดียวกับ PremiumCard) เดสก์ท็อปไม่มี class นี้เลยจึง selector ไม่ match ไม่กระทบแน่นอน */}
      <style jsx>{`
        @media (hover: hover) {
          .metric-card:hover {
            transform: translateY(-2px) scale(1.015);
            filter: brightness(1.06) contrast(1.04);
          }
        }
        .metric-card-compact:active {
          background-position: 0 0, 0 0, 0 0, 0 0, 0% 8%, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0;
          /* Card Press Effect v2 — เดิมกดจมลง (translateY(1px)) ตามที่ขอตอนนั้น ตอนนี้เปลี่ยนเป็น
             "ยกขึ้น 2px" ตาม Phase 5 Motion spec ใหม่เจาะจง MetricCard (คนละพฤติกรรมจาก
             TodaysFocusCard/TodaysWorkoutCompactCard ที่ยังกดจมลงเหมือนเดิม ไม่แตะ) */
          transform: translateY(-2px);
        }
      `}</style>
    </>
  )
}
