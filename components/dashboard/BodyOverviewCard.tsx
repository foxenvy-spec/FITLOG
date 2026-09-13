'use client'

import Link from 'next/link'
import { dashboardSpec } from '@/lib/dashboardSpec'
import { METRIC_ICON_IMAGES } from '@/components/MetricCard'
import { HOME_COLORS } from '@/lib/homeColors'

interface MetricDelta {
  value: number | null
  delta: number | null
  isGood: boolean | null
}

interface BodyOverviewCardProps {
  weight: MetricDelta
  weightUnit: string
  bodyFatPct: MetricDelta
  muscleKg: MetricDelta
  /** measured_at ของเอนทรีล่าสุดจริง (data.bodyMetricsSummary.latestMeasuredAt) — ไม่ระบุ/null = ไม่มี
   * ข้อมูลเลย ไม่โชว์บรรทัด "Updated..." */
  latestMeasuredAt?: string | null
}

// ฟีดแบ็ก "เพิ่ม 'Last Updated' แบบ subtle — user อยากรู้ว่าวัดเมื่อไหร่" — ใช้ latestMeasuredAt จริง
// (ไม่ใช่ periodLabel ที่มีอยู่แล้วซึ่งบอกระยะห่างจากเอนทรีก่อนหน้า คนละความหมาย) เทียบกับเวลาปัจจุบัน
// ตรงๆ ให้ข้อความสั้นๆ ระดับความหยาบใกล้เคียงกับ periodLabelOf (lib/bodyMetricsSummary.ts) แต่เป็น
// ภาษาอังกฤษ (การ์ดนี้ทั้งใบใช้อังกฤษแล้วตามฟีดแบ็กรอบก่อน)
// v2: ฟีดแบ็ก (design review, P4) "'Updated 6 weeks ago' ทำให้เข้าใจผิดว่า FITLOG เพิ่ง 'อัปเดต' ข้อมูล
// (การกระทำของระบบ) ทั้งที่จริงคือ 'เอนทรีล่าสุดที่ผู้ใช้บันทึกเอง' เก่าแค่ไหน (ข้อเท็จจริงเกี่ยวกับข้อมูล
// ไม่ใช่การกระทำของแอป) — ผู้ใช้ใหม่เห็นแล้วอาจสงสัยว่า FITLOG เอาข้อมูลเก่ามาคำนวณหรือเปล่า — เปลี่ยนคำ
// นำจาก 'Updated' เป็น 'Latest body data ·' ให้ชัดว่าเป็น timestamp ของข้อมูลดิบ ไม่ใช่คำมั่นสัญญาความสด
// ใหม่ — ไม่ซ่อนตัวเลขวันที่เก่าเลย (ถ้าจริง 6 สัปดาห์ก็บอกตรงๆ ตามที่ตกลง ไม่ fake freshness)
// v3: ฟีดแบ็ก (Product/UI review, 8.7/10, §3.1) "'Latest body data' ยังกำกวมว่าเป็น 'ข้อมูลล่าสุดที่มี'
// (อาจตีความว่าคำนวณจากข้อมูลตอนนี้) หรือ 'ค่าที่วัดครั้งล่าสุด' — เปลี่ยนเป็น 'Last measured ·' ชัดกว่าว่า
// เป็นเหตุการณ์ 'ผู้ใช้วัด/บันทึกเมื่อไหร่' ไม่ใช่คุณสมบัติของข้อมูลปัจจุบัน" — คำนวณ/threshold เดิมทุกจุด
// เปลี่ยนแค่คำนำ
function lastMeasuredLabel(measuredAt: string | null | undefined): string | null {
  if (!measuredAt) return null
  const days = Math.floor((Date.now() - new Date(measuredAt).getTime()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'Last measured · today'
  if (days === 1) return 'Last measured · yesterday'
  if (days <= 6) return `Last measured · ${days} days ago`
  if (days <= 13) return 'Last measured · last week'
  if (days <= 44) return `Last measured · ${Math.round(days / 7)} weeks ago`
  return `Last measured · ${Math.round(days / 30)} months ago`
}

// การ์ด "Body Overview" ใหม่ตาม "New_mobile_app.zip" (ผู้ใช้เลือก "ทำเฉพาะหน้า Home" ให้ใช้ทิศทางนี้
// แทน "brief 2" เดิม) — แทนที่ TriStatRow.tsx (Recovery/Body Fat/Weight, มี Fitness Score/recovery tier
// เป็นแกนหลัก) ด้วยตัวชี้วัดร่างกายดิบ 3 ตัว (น้ำหนัก/ไขมัน/กล้ามเนื้อ) ตรงตามสเปกใหม่เป๊ะ — ข้อมูลใช้
// data.bodyMetricsSummary ชุดเดียวกับที่เดสก์ท็อป/หน้า /health ใช้อยู่แล้ว (weight/bodyFatPct/
// skeletalMuscleKg/bmi ทุกฟิลด์มีอยู่แล้วใน lib/bodyMetricsSummary.ts ไม่ต้องคำนวณซ้ำ)
//
// "ดูรายละเอียด" ขยาย/ยุบแถว BMI ด้านล่าง (state ในไฟล์นี้เอง ไม่ต้องยกขึ้นไปที่ MobileDashboardView.tsx
// เพราะไม่มี component อื่นต้องรู้สถานะนี้) — สีเดลต้า: brief ใช้เขียวคงที่ (#35d488) เพราะ mock data
// เป็นค่าที่ดีทั้งหมด แต่จริงจะสลับ rust เมื่อ isGood===false / เทากลางเมื่อไม่รู้ทิศทาง (isGood===null)
// เหมือน pattern เดิมที่ TriStatRow.tsx ใช้อยู่แล้วทั่วแอป ไม่ใช้สีตายตัวแบบ mockup ตรงๆ
// ฟีดแบ็ก "ใช้ไอคอน/อีโมจิให้เหมือนครับ" (จุด "icon ตรง 3 การ์ดบน" — 3 สต็อกน้ำหนัก/ไขมัน/กล้ามเนื้อ) —
// เดิมวาด SVG เส้นเองเดา 3 อัน (วงกลม/หัวใจ/ลูกศรไขว้) ตรงตาม .dc.html เป๊ะ แต่ไม่ได้ดูเป็นมืออาชีพเท่า
// ชุดไอคอนจริง "FITLOG – Metric Icons" (PNG, METRIC_ICON_IMAGES) ที่แอปมีอยู่แล้ว และเคยใช้แก้ปัญหา
// เดียวกันนี้มาแล้วรอบก่อนกับการ์ด Recovery/Body Fat/Weight (TriStatRow.tsx เดิม ก่อนจะถูกแทนที่ด้วย
// การ์ดนี้) — ใช้ MaskIcon เทคนิคเดียวกัน (PNG สีเดียวล้วน + CSS mask ระบายสีทับ) ให้ไอคอนดูสอดคล้อง/
// เป็นมืออาชีพขึ้น แทนเส้นเรขาคณิตพื้นฐานที่วาดเดาเอง
function MaskIcon({ src, color, size = 13 }: { src: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'block',
        width: size,
        height: size,
        backgroundColor: color,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  )
}

function ChevronRightIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={HOME_COLORS.textSecondary} strokeWidth="2.5" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

// ฟีดแบ็ก (Product/UI review, "Semantic Delta System") "'Body Fat 24.6% / 0' อ่านแล้วกำกวม — เดิม
// delta===0 (วัดจริง เทียบกับเอนทรีก่อนหน้าแล้วไม่ต่างกัน คนละเคสกับ delta==null ที่ไม่มีเอนทรีก่อนหน้าให้
// เทียบเลย) render ออกมาเป็นแค่ตัวเลข '0' ลอยๆ ไม่มีลูกศร/หน่วย ดูเหมือนเลขพัง ไม่ใช่ 'ไม่เปลี่ยนแปลง' —
// เปลี่ยนเป็นข้อความ 'No change' ชัดเจนแทน (deltaColor เดิมให้ isGood===null -> เทากลาง อยู่แล้ว ถูกต้อง
// สำหรับเคสนี้ ไม่ต้องแก้สี แก้แค่ข้อความ)
function deltaText(delta: number | null, digits = 1): string {
  if (delta == null) return '–'
  const rounded = Math.round(delta * 10 ** digits) / 10 ** digits
  if (rounded === 0) return 'No change'
  return `${rounded > 0 ? '↑' : '↓'} ${Math.abs(rounded)}`
}

// v2: ฟีดแบ็ก (design review, 9.2/10, P4) "Trend value (↓0.5, ↓2.8) ควรเด่นขึ้นอีกนิด — ไม่ต้องเพิ่ม font
// size แต่เพิ่ม font weight + brightness เล็กน้อย ให้ scan ได้ว่าน้ำหนัก/ไขมันลดลงโดยไม่ต้องอ่านตัวเลข
// ละเอียด" — ปรับ hex ให้สว่าง/อิ่มตัวขึ้นเล็กน้อย (font-weight ปรับที่จุดเรียกใช้ใน StatCell แทน เพราะ
// เป็น Tailwind className ไม่ใช่ค่าที่ฟังก์ชันนี้ควบคุม)
function deltaColor(isGood: boolean | null): string {
  if (isGood === true) return '#3fe092'
  if (isGood === false) return '#ff6b80'
  return 'rgba(255,255,255,.5)'
}

function StatCell({
  icon,
  iconTint,
  iconGlow,
  label,
  value,
  delta,
  isGood,
}: {
  icon: React.ReactNode
  iconTint: string
  /** ฟีดแบ็ก (mockup "Version 1 — Premium Glassmorphism + Gradient Accent") "polish ไอคอน badge ให้เป็น
   * gradient accent + inner glow แทนสีทึบล้วนเดิม — ห้ามเปลี่ยนขนาด/เลย์เอาต์/สีพื้นฐาน" — เพิ่ม
   * box-shadow ไล่โทนเดียวกับ iconTint (inner highlight บนขอบ + soft glow รอบนอก) เท่านั้น ไม่แตะ
   * iconSize/iconRadius/margin ใดๆ (dashboardSpec เดิมทุกค่า) */
  iconGlow: string
  label: string
  value: string
  delta: number | null
  isGood: boolean | null
}) {
  const { iconSize, iconRadius } = dashboardSpec.bodyOverviewCard
  return (
    <div
      className="rounded-xl"
      style={{
        // v2: ฟีดแบ็ก (design review, 9.2/10, P2/P3) "Metric cards ยังดู flat — เพิ่ม inner highlight บาง
        // มากๆ ที่ขอบบน (ไม่ใช่ border สีจัด) ให้ความรู้สึก titanium hardware" + "เพิ่ม layer separation
        // ระหว่าง outer container กับ metric card อีก 5-8% — inner = slightly lifted titanium" — พื้นเดิม
        // rgba(255,255,255,.03) จาง เกือบเป็นชั้นเดียวกับพื้นหลังการ์ดนอก ยกขึ้นอีกนิด (.03 -> .045) +
        // เพิ่ม inset highlight บางๆ ที่ขอบบน (1px translucent, ไม่ใช่สี accent) แยกชั้นให้ชัดขึ้นโดยไม่ทำ
        // ให้สว่างขึ้นทั้งกล่อง (ไม่แตะพื้นหลัง/เงาของการ์ดนอกซึ่งเป็น token กลาง HOME_COLORS.cardGlass)
        background: 'rgba(255,255,255,.045)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07)',
        borderRadius: dashboardSpec.bodyOverviewCard.statBorderRadius,
        padding: '7px 6px',
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: iconRadius,
          background: iconTint,
          // v2: ฟีดแบ็ก (design review, 9.2/10, P1) "Icon glow แรงไปนิด โดยเฉพาะสีเขียว — ลดลงประมาณ
          // 15-20% ให้เป็น soft illuminated icon แทน glowing icon" — ลด alpha ของ outer glow (caller ส่ง
          // iconGlow มาแล้วลด .35 -> .28 ที่จุดเรียกใช้, -20%) + ลด blur/spread เล็กน้อย (8px -> 7px) ที่นี่
          // ไม่แตะ inset highlight/inset shadow (ให้ความรู้สึก "แสงสะท้อนผิว" อยู่แล้ว ไม่ใช่ glow)
          boxShadow: `inset 0 1px 0 rgba(255,255,255,.35), inset 0 -5px 7px rgba(0,0,0,.12), 0 2px 7px ${iconGlow}`,
          marginBottom: 5,
        }}
        aria-hidden="true"
      >
        {icon}
      </div>
      {/* ฟีดแบ็ก "Weight/Body Fat/Muscle เทาเกินไป อ่านยาก — Secondary tier ควรเป็นโทเคนกลาง ไม่ใช่ rgba
          จางแบบเดิม โดยเฉพาะข้อมูลที่ user อ่านบ่อย ไม่ควรใช้โทน muted" */}
      <p className="font-homeTh" style={{ color: HOME_COLORS.textSecondary, fontSize: 10.5, marginBottom: 2 }}>
        {label}
      </p>
      <p className="font-homeNum font-bold" style={{ fontSize: 15, marginBottom: 2, color: HOME_COLORS.textPrimary }}>
        {value}
      </p>
      {/* v2: ฟีดแบ็ก (design review, 9.2/10, P4) "Trend value เด่นขึ้นอีกนิด — ไม่เพิ่ม font size แต่เพิ่ม
          font weight + brightness" — font-semibold -> font-bold (deltaColor() เองสว่างขึ้นเล็กน้อยแล้ว) */}
      <p className="font-homeNum font-bold" style={{ fontSize: 10.5, color: deltaColor(isGood) }}>
        {deltaText(delta)}
      </p>
    </div>
  )
}

export default function BodyOverviewCard({ weight, weightUnit, bodyFatPct, muscleKg, latestMeasuredAt }: BodyOverviewCardProps) {
  const { borderRadius, padding, statGap } = dashboardSpec.bodyOverviewCard
  const updatedLabel = lastMeasuredLabel(latestMeasuredAt)
  // ฟีดแบ็ก "เพิ่ม Empty State ที่ดี — user ใหม่ไม่มีข้อมูลไม่ควรเห็นแค่ '--' ทุกช่อง ให้รู้สึกเป็น
  // product ที่สมบูรณ์" — ไม่มีข้อมูลเลยสักตัว (ไม่ใช่แค่บางตัว) ถึงจะสลับไปโชว์ empty state แทนกริด 3 ช่อง
  const hasNoData = weight.value == null && bodyFatPct.value == null && muscleKg.value == null

  return (
    <div
      style={{
        // ฟีดแบ็ก "FITLOG Premium Home Design System — เปลี่ยนจาก Solid Card เป็น Glass Card, อย่าใช้
        // #000000 เยอะเกินไป" — พื้นเดิม (#12161d ทึบ/ไล่สีเทาดำ) เปลี่ยนเป็น HOME_COLORS.cardGlass
        // (กรมท่าโปร่งแสง ให้ผิวการ์ดดูมีมิติ+เห็นพื้นหลังลอดนิดหน่อยโดยเฉพาะจุดที่ทับภาพ Header อยู่แล้ว)
        // ไม่ใช้ backdrop-blur หนัก (ผู้ใช้ระบุชัดว่าไม่ต้องการ glassmorphism แบบเบลอจัด) แค่โปร่งแสงพอ
        // v2: ฟีดแบ็ก (mockup "Version 1 — Premium Glassmorphism + Gradient Accent", "80%") "เพิ่ม subtle
        // blue ambient lighting + edge highlight + depth — ห้ามเพิ่ม DOM node ใหม่ ห้ามเพิ่มความสูง/
        // spacing" — ทำทั้งหมดผ่าน CSS background/box-shadow ล้วนๆ บน div เดิม (ไม่มี element ใหม่เลย):
        // เติม radial-gradient ฟ้าจางๆ มุมบนซ้ายเป็น background layer แรก (ต่อจาก cardGlass เดิม, ซ้อนกัน
        // แบบ CSS multi-background ไม่ใช่แทนที่) + inset highlight บางๆ ที่ขอบบน (แสงสะท้อนผิวกระจก) ต่อท้าย
        // boxShadow เดิม — ไม่แตะ backdropFilter/border/borderRadius/padding/boxShadow เงาหลักเดิมเลย
        // v3: ฟีดแบ็ก (design review, 9.2/10, P3) "Outer card กับ metric card ยัง contrast น้อยไปนิด —
        // เพิ่ม separation ~5-8% แต่ไม่ใช่เพิ่ม brightness ทั้งหมด: outer = deeper titanium, inner =
        // slightly lifted titanium" — เติมขอบมืดจางๆ (vignette) เป็น background layer เพิ่ม (ระหว่างแสง
        // ambient ฟ้ากับ cardGlass เดิม) ให้พื้นผิวนอกดู "ลึก" ขึ้นเฉพาะจุดนี้ ไม่แตะ HOME_COLORS.cardGlass
        // (token กลางที่การ์ดอื่นทั้งหน้าอ้างอิงร่วมกัน) — ฝั่ง inner (StatCell) ยกพื้นขึ้นแยกที่จุดนั้นแล้ว
        background: `radial-gradient(130% 70% at 18% -12%, rgba(64,158,255,.12), transparent 55%), radial-gradient(120% 90% at 50% 110%, rgba(0,0,0,.14), transparent 60%), ${HOME_COLORS.cardGlass}`,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: `1px solid ${HOME_COLORS.cardBorder}`,
        borderRadius,
        padding,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06), 0 8px 20px rgba(0,0,0,.35)',
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: updatedLabel && !hasNoData ? 2 : 10 }}>
        {/* ฟีดแบ็ก (Accessibility audit) "ชื่อการ์ดทั้งหน้า Home เป็น <span> ล้วน ไม่มี heading เลยสักจุด —
            screen reader ที่ navigate ด้วยปุ่ม 'jump to next heading' จะหาไม่เจอเลย" — เปลี่ยนเป็น <h2>
            เฉพาะจุดที่ชัดเจนว่าเป็นชื่อการ์ดจริง 1:1 (Body Overview/Weekly Progress/Weight Goal/Body Fat
            Goal) — Tailwind preflight (เปิดอยู่ในโปรเจกต์นี้) reset h1-h6 เป็น font/margin inherit จาก
            className/style เดิมอยู่แล้ว จึงไม่มีผลต่อหน้าตาเลยแม้แต่พิกเซลเดียว (ตรวจแล้ว) */}
        <h2 className="font-bold" style={{ fontSize: 14.5, color: HOME_COLORS.textPrimary }}>
          Body Overview
        </h2>
        {/* ฟีดแบ็ก "BMI ไม่ควรอยู่ตรงนี้ ให้ไปอยู่หน้า Stats/Body Details แทน" — เดิม "Details" เป็นปุ่ม
            ขยาย/ยุบแสดง BMI ในการ์ดนี้เอง เปลี่ยนเป็นลิงก์จริงไปหน้า /health (มี BMI + รายละเอียดร่างกาย
            ครบอยู่แล้ว) แทนที่จะทำ toggle ในการ์ดนี้ */}
        {/* ฟีดแบ็ก (Micro-interaction/Interaction Quality audit) "'Details →' ไม่มี press feedback เลย
            ทั้งที่ลิงก์ empty-state ('Start tracking your body') ของการ์ดเดียวกันมี active:opacity-80
            transition อยู่แล้ว — สองลิงก์เดียวกัน (ไป /health) ควรให้ feedback แบบเดียวกัน" */}
        {!hasNoData && (
          <Link
            href="/health"
            className="flex items-center active:opacity-80 transition"
            style={{ color: HOME_COLORS.textSecondary, fontSize: 12, gap: 2 }}
          >
            Details
            <ChevronRightIcon />
          </Link>
        )}
      </div>
      {updatedLabel && !hasNoData && (
        // บั๊ก (self-review, contrast audit) "'Latest body data · X ago' ใช้ rgba(255,255,255,.35) เดิม
        // (ตั้งไว้ตั้งแต่ก่อนย้ายมาใช้ HOME_COLORS) วัดคอนทราสต์จริงบนพื้นหลังการ์ดได้ ~3.2:1 ต่ำกว่าเกณฑ์
        // WCAG AA (4.5:1 สำหรับตัวอักษร 10px) ทั้งที่ข้อความบรรทัดนี้เพิ่งแก้คำในรอบนี้เอง — เพิ่ม alpha
        // เป็น .55 (~4.6:1 ผ่านเกณฑ์) ไม่แตะ fontSize/ตำแหน่ง/เนื้อหาข้อความ
        <p className="font-homeTh" style={{ color: 'rgba(255,255,255,.55)', fontSize: 10, marginBottom: 8 }}>
          {updatedLabel}
        </p>
      )}

      {hasNoData ? (
        // ฟีดแบ็ก "Empty State ที่ดี — อย่าให้รู้สึกเหมือนระบบไม่มีข้อมูล" — ลิงก์เดียวกับ "Details"
        // ปกติ (/health มีฟอร์มบันทึกน้ำหนัก/ไขมัน/กล้ามเนื้ออยู่แล้ว ไม่ต้องสร้างหน้าใหม่)
        <Link href="/health" className="flex flex-col items-start active:opacity-80 transition">
          <span className="font-bold" style={{ fontSize: 13, marginBottom: 3, color: HOME_COLORS.textPrimary }}>
            Start tracking your body
          </span>
          <span className="font-homeTh" style={{ color: HOME_COLORS.textSecondary, fontSize: 11, marginBottom: 10 }}>
            Add your first measurement to see your progress.
          </span>
          <span
            className="font-homeNum font-semibold"
            style={{ color: HOME_COLORS.orange, fontSize: 12, border: '1px solid rgba(255,138,61,.35)', borderRadius: 999, padding: '6px 14px' }}
          >
            + Add Measurement
          </span>
        </Link>
      ) : (
        <div className="grid grid-cols-3" style={{ gap: statGap }}>
          {/* ฟีดแบ็ก "ทำสี/font/ตำแหน่งให้เหมือน 100%" (poster "Version 2 — 9.3/10") — badge ไอคอนใน
              mockup เป็นสีทึบอิ่มตัว (ไอคอนขาวทับพื้นสี) ไม่ใช่พื้นจางๆ+ไอคอนสี — สลับ iconTint จาก
              rgba(...,.15) เป็นสีทึบ และไอคอนเป็นสีขาวแทน */}
          <StatCell
            icon={<MaskIcon src={METRIC_ICON_IMAGES.weight} color="#fff" />}
            iconTint="linear-gradient(135deg,#63b6ff,#2f74e0)"
            iconGlow="rgba(77,168,255,.28)"
            label="Weight"
            value={weight.value != null ? `${weight.value.toFixed(1)} ${weightUnit}` : '–'}
            delta={weight.delta}
            isGood={weight.isGood}
          />
          <StatCell
            icon={<MaskIcon src={METRIC_ICON_IMAGES.bodyFat} color="#fff" />}
            iconTint="linear-gradient(135deg,#ff7fb0,#d94f86)"
            iconGlow="rgba(255,92,147,.28)"
            label="Body Fat"
            value={bodyFatPct.value != null ? `${bodyFatPct.value.toFixed(1)}%` : '–'}
            delta={bodyFatPct.delta}
            isGood={bodyFatPct.isGood}
          />
          <StatCell
            icon={<MaskIcon src={METRIC_ICON_IMAGES.muscle} color="#fff" />}
            iconTint="linear-gradient(135deg,#57e0cd,#1fae94)"
            iconGlow="rgba(52,214,196,.28)"
            label="Muscle"
            value={muscleKg.value != null ? `${muscleKg.value.toFixed(1)} kg` : '–'}
            delta={muscleKg.delta}
            isGood={muscleKg.isGood}
          />
        </div>
      )}
    </div>
  )
}
