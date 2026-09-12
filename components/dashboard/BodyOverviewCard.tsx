'use client'

import Link from 'next/link'
import { dashboardSpec } from '@/lib/dashboardSpec'
import { METRIC_ICON_IMAGES } from '@/components/MetricCard'

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
function lastMeasuredLabel(measuredAt: string | null | undefined): string | null {
  if (!measuredAt) return null
  const days = Math.floor((Date.now() - new Date(measuredAt).getTime()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'Updated today'
  if (days === 1) return 'Updated yesterday'
  if (days <= 6) return `Updated ${days} days ago`
  if (days <= 13) return 'Updated last week'
  if (days <= 44) return `Updated ${Math.round(days / 7)} weeks ago`
  return `Updated ${Math.round(days / 30)} months ago`
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
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#A7ADB7" strokeWidth="2.5" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function deltaText(delta: number | null, digits = 1): string {
  if (delta == null) return '–'
  const rounded = Math.round(delta * 10 ** digits) / 10 ** digits
  return `${rounded > 0 ? '↑' : rounded < 0 ? '↓' : ''} ${Math.abs(rounded)}`
}

function deltaColor(isGood: boolean | null): string {
  if (isGood === true) return '#35d488'
  if (isGood === false) return '#ff5c76'
  return 'rgba(255,255,255,.4)'
}

function StatCell({
  icon,
  iconTint,
  label,
  value,
  delta,
  isGood,
}: {
  icon: React.ReactNode
  iconTint: string
  label: string
  value: string
  delta: number | null
  isGood: boolean | null
}) {
  const { iconSize, iconRadius } = dashboardSpec.bodyOverviewCard
  return (
    <div
      className="rounded-xl"
      style={{ background: 'rgba(255,255,255,.03)', borderRadius: dashboardSpec.bodyOverviewCard.statBorderRadius, padding: '7px 6px' }}
    >
      <div
        className="flex items-center justify-center"
        style={{ width: iconSize, height: iconSize, borderRadius: iconRadius, background: iconTint, marginBottom: 5 }}
        aria-hidden="true"
      >
        {icon}
      </div>
      {/* ฟีดแบ็ก "Weight/Body Fat/Muscle เทาเกินไป อ่านยาก — Secondary tier ควรเป็น #A7ADB7 ไม่ใช่ rgba
          จางแบบเดิม โดยเฉพาะข้อมูลที่ user อ่านบ่อย ไม่ควรใช้โทน muted" */}
      <p className="font-homeTh" style={{ color: '#A7ADB7', fontSize: 10.5, marginBottom: 2 }}>
        {label}
      </p>
      <p className="font-homeNum font-bold text-white" style={{ fontSize: 15, marginBottom: 2 }}>
        {value}
      </p>
      <p className="font-homeNum font-semibold" style={{ fontSize: 10.5, color: deltaColor(isGood) }}>
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
        // ฟีดแบ็ก "รูป 3 มี depth ดีกว่า — Background → Card → inner panel → gradient accent"
        // — พื้นเรียบทึบเดิม (#12161d) เปลี่ยนเป็นไล่สีแนวตั้งจาง ๆ (ไม่ใช่ glow) ให้ผิวการ์ดดูมีมิติขึ้น
        // นิดเดียว โทนเดียวกับที่ใช้ซ้ำในการ์ดอื่นของ Home รอบนี้ทั้งหมด
        background: 'linear-gradient(180deg, #171c25 0%, #12161d 100%)',
        border: '1px solid rgba(255,255,255,.06)',
        borderRadius,
        padding,
        boxShadow: '0 8px 20px rgba(0,0,0,.35)',
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: updatedLabel && !hasNoData ? 2 : 10 }}>
        <span className="text-white font-bold" style={{ fontSize: 14.5 }}>
          Body Overview
        </span>
        {/* ฟีดแบ็ก "BMI ไม่ควรอยู่ตรงนี้ ให้ไปอยู่หน้า Stats/Body Details แทน" — เดิม "Details" เป็นปุ่ม
            ขยาย/ยุบแสดง BMI ในการ์ดนี้เอง เปลี่ยนเป็นลิงก์จริงไปหน้า /health (มี BMI + รายละเอียดร่างกาย
            ครบอยู่แล้ว) แทนที่จะทำ toggle ในการ์ดนี้ — สีเดิม (rgba(255,255,255,.4)) จางเกินไป เปลี่ยนเป็น
            Secondary tier (#A7ADB7) ตามที่ผู้ใช้ระบุ */}
        {!hasNoData && (
          <Link href="/health" className="flex items-center" style={{ color: '#A7ADB7', fontSize: 12, gap: 2 }}>
            Details
            <ChevronRightIcon />
          </Link>
        )}
      </div>
      {updatedLabel && !hasNoData && (
        <p className="font-homeTh" style={{ color: 'rgba(255,255,255,.35)', fontSize: 10, marginBottom: 8 }}>
          {updatedLabel}
        </p>
      )}

      {hasNoData ? (
        // ฟีดแบ็ก "Empty State ที่ดี — อย่าให้รู้สึกเหมือนระบบไม่มีข้อมูล" — ลิงก์เดียวกับ "Details"
        // ปกติ (/health มีฟอร์มบันทึกน้ำหนัก/ไขมัน/กล้ามเนื้ออยู่แล้ว ไม่ต้องสร้างหน้าใหม่)
        <Link href="/health" className="flex flex-col items-start active:opacity-80 transition">
          <span className="text-white font-bold" style={{ fontSize: 13, marginBottom: 3 }}>
            Start tracking your body
          </span>
          <span className="font-homeTh" style={{ color: '#A7ADB7', fontSize: 11, marginBottom: 10 }}>
            Add your first measurement to see your progress.
          </span>
          <span
            className="font-homeNum font-semibold"
            style={{ color: '#ff8a3d', fontSize: 12, border: '1px solid rgba(255,138,61,.35)', borderRadius: 999, padding: '6px 14px' }}
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
            iconTint="#4da8ff"
            label="Weight"
            value={weight.value != null ? `${weight.value.toFixed(1)} ${weightUnit}` : '–'}
            delta={weight.delta}
            isGood={weight.isGood}
          />
          <StatCell
            icon={<MaskIcon src={METRIC_ICON_IMAGES.bodyFat} color="#fff" />}
            iconTint="#ff5c93"
            label="Body Fat"
            value={bodyFatPct.value != null ? `${bodyFatPct.value.toFixed(1)}%` : '–'}
            delta={bodyFatPct.delta}
            isGood={bodyFatPct.isGood}
          />
          <StatCell
            icon={<MaskIcon src={METRIC_ICON_IMAGES.muscle} color="#fff" />}
            iconTint="#34d6c4"
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
