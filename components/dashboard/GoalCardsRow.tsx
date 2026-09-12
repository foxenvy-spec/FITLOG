'use client'

import { dashboardSpec } from '@/lib/dashboardSpec'
import AnimatedBarFill from '../AnimatedBarFill'

interface GoalCardProps {
  label: string
  fromValue: number
  toValue: number
  unit: string
  decimals: number
  pct: number
  color: string
  statusText: string
}

interface GoalCardsRowProps {
  weight: Omit<GoalCardProps, 'label' | 'color'> | null
  bodyFat: Omit<GoalCardProps, 'label' | 'color'> | null
}

// การ์ดคู่ "เป้าหมาย" ใหม่ตาม "New_mobile_app.zip" — เนื้อหาที่ไม่เคยมีในหน้า Home มือถือมาก่อนเลย (บรีฟ
// ก่อนหน้าไม่มีส่วนนี้) แต่ตัวข้อมูล/สูตรคำนวณมีอยู่แล้วในแอป (goalProgressPct ใน lib/goalProgress.ts,
// weightGoalTarget/bodyFatGoalTarget ที่ MobileDashboardView.tsx คำนวณไว้แล้วสำหรับ notifications อยู่ก่อน
// แล้ว) ไม่ต้องเพิ่ม query/คำนวณใหม่ แค่ส่งเข้ามาที่นี่ — ไม่แสดงการ์ดฝั่งไหนเลยถ้าไม่มีเป้าหมายตั้งไว้จริง
// (ไม่ใช่โชว์เป้าหมายสมมติแบบใน mockup)
function GoalCard({ label, fromValue, toValue, unit, decimals, pct, color, statusText }: GoalCardProps) {
  const { borderRadius, padding, barHeight } = dashboardSpec.goalCard
  return (
    <div style={{ background: '#12161d', border: '1px solid rgba(255,255,255,.06)', borderRadius, padding, boxShadow: '0 8px 20px rgba(0,0,0,.35)' }}>
      <p className="font-homeTh" style={{ color: 'rgba(255,255,255,.5)', fontSize: 11, marginBottom: 6 }}>
        {label}
      </p>
      <p className="font-homeNum font-bold text-white" style={{ fontSize: 14, marginBottom: 8 }}>
        {fromValue.toFixed(decimals)} → {toValue.toFixed(decimals)} {unit}
      </p>
      <div style={{ height: barHeight, borderRadius: 999, background: 'rgba(255,255,255,.06)', overflow: 'hidden', marginBottom: 6 }}>
        <AnimatedBarFill pct={pct} color={color} />
      </div>
      <p className="font-homeTh" style={{ color: 'rgba(255,255,255,.4)', fontSize: 10.5 }}>
        {statusText}
      </p>
    </div>
  )
}

export default function GoalCardsRow({ weight, bodyFat }: GoalCardsRowProps) {
  if (!weight && !bodyFat) return null
  const { gridGap } = dashboardSpec.goalCard
  return (
    <div className="grid grid-cols-2" style={{ gap: gridGap }}>
      {weight && <GoalCard label="Weight Goal" color="#4da8ff" {...weight} />}
      {bodyFat && <GoalCard label="Body Fat Goal" color="#ff5c93" {...bodyFat} />}
    </div>
  )
}
