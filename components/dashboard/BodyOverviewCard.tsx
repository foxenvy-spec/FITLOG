'use client'

import { useState } from 'react'
import { dashboardSpec } from '@/lib/dashboardSpec'
import { bmiCategory } from '@/lib/bodyMetricsSummary'

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
  bmi: number | null
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
function WeightIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4da8ff" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
    </svg>
  )
}

function BodyFatIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ff5c93" strokeWidth="2" aria-hidden="true">
      <path d="M12 21s-7-4.6-7-10.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 7 4.5C19 16.4 12 21 12 21z" />
    </svg>
  )
}

function MuscleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d6c4" strokeWidth="2" aria-hidden="true">
      <path d="M6.5 6.5 4 9l2.5 2.5M17.5 6.5 20 9l-2.5 2.5M9 4l1 16M15 4l-1 16" />
    </svg>
  )
}

function ChevronRightIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(255,255,255,.4)"
      strokeWidth="2.5"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .2s' }}
    >
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
      style={{ background: 'rgba(255,255,255,.03)', borderRadius: dashboardSpec.bodyOverviewCard.statBorderRadius, padding: '10px 8px' }}
    >
      <div
        className="flex items-center justify-center"
        style={{ width: iconSize, height: iconSize, borderRadius: iconRadius, background: iconTint, marginBottom: 8 }}
        aria-hidden="true"
      >
        {icon}
      </div>
      <p className="font-homeTh" style={{ color: 'rgba(255,255,255,.45)', fontSize: 10.5, marginBottom: 2 }}>
        {label}
      </p>
      <p className="font-homeNum font-bold text-white" style={{ fontSize: 15, marginBottom: 3 }}>
        {value}
      </p>
      <p className="font-homeNum font-semibold" style={{ fontSize: 10.5, color: deltaColor(isGood) }}>
        {deltaText(delta)}
      </p>
    </div>
  )
}

export default function BodyOverviewCard({ weight, weightUnit, bodyFatPct, muscleKg, bmi }: BodyOverviewCardProps) {
  const [open, setOpen] = useState(false)
  const { borderRadius, padding, statGap } = dashboardSpec.bodyOverviewCard

  return (
    <div
      style={{
        background: '#12161d',
        border: '1px solid rgba(255,255,255,.06)',
        borderRadius,
        padding,
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <span className="text-white font-bold" style={{ fontSize: 14.5 }}>
          Body Overview
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center"
          style={{ color: 'rgba(255,255,255,.4)', fontSize: 12, gap: 2 }}
        >
          ดูรายละเอียด
          <ChevronRightIcon open={open} />
        </button>
      </div>

      <div className="grid grid-cols-3" style={{ gap: statGap }}>
        <StatCell
          icon={<WeightIcon />}
          iconTint="rgba(77,168,255,.15)"
          label="น้ำหนัก"
          value={weight.value != null ? `${weight.value.toFixed(1)} ${weightUnit}` : '–'}
          delta={weight.delta}
          isGood={weight.isGood}
        />
        <StatCell
          icon={<BodyFatIcon />}
          iconTint="rgba(255,92,147,.15)"
          label="ไขมันในร่างกาย"
          value={bodyFatPct.value != null ? `${bodyFatPct.value.toFixed(1)}%` : '–'}
          delta={bodyFatPct.delta}
          isGood={bodyFatPct.isGood}
        />
        <StatCell
          icon={<MuscleIcon />}
          iconTint="rgba(52,214,196,.15)"
          label="กล้ามเนื้อ"
          value={muscleKg.value != null ? `${muscleKg.value.toFixed(1)} kg` : '–'}
          delta={muscleKg.delta}
          isGood={muscleKg.isGood}
        />
      </div>

      {open && (
        <div
          className="flex justify-between"
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid rgba(255,255,255,.06)',
            color: 'rgba(255,255,255,.5)',
            fontSize: 11.5,
          }}
        >
          <span className="font-homeTh">BMI</span>
          <span className="font-homeNum font-semibold text-white">
            {bmi != null ? `${bmi.toFixed(1)} · ${bmiCategory(bmi)}` : 'ยังไม่มีข้อมูล'}
          </span>
        </div>
      )}
    </div>
  )
}
