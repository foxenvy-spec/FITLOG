'use client'

import { dashboardSpec } from '@/lib/dashboardSpec'
import AnimatedBarFill from '../AnimatedBarFill'
import { HOME_COLORS } from '@/lib/homeColors'

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
    <div
      style={{
        background: HOME_COLORS.cardGlass,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        // v2: ฟีดแบ็ก (design review, 8.7/10, P2) "ลด border contrast นิดเดียว — ให้ Goals รู้สึกเป็น
        // supporting info รองจาก Body Overview/Today's Focus" — override เฉพาะการ์ดนี้ (ไม่แตะ
        // HOME_COLORS.cardBorder ซึ่งเป็น token กลางที่การ์ดอื่นทั้งหน้าอ้างอิงร่วมกัน)
        border: '1px solid rgba(255,255,255,.06)',
        borderRadius,
        padding,
        boxShadow: '0 8px 20px rgba(0,0,0,.35)',
      }}
    >
      {/* ฟีดแบ็ก "ทำสี/font/ตำแหน่งให้เหมือน 100%" (poster "Version 2 — 9.3/10") — mockup มีเลข % ความ
          คืบหน้าเล็กๆ ชิดขวาแถวเดียวกับป้ายชื่อเป้าหมาย (คนละจุดกับตัวเลขในแถบ progress ที่มีอยู่แล้ว) เพิ่ม
          เข้ามาเฉยๆ ไม่กระทบ pct ที่ใช้ fill แถบอยู่แล้ว */}
      {/* ฟีดแบ็ก "'Body Fat Goal — 40%' อ่านแล้วเข้าใจผิดว่า 40% คือตัวเป้าหมาย Body Fat เอง เพราะ % อยู่ติด
          กับหัวข้อ Goal" — เติมคำว่า "complete" ต่อท้ายให้ชัดว่าเป็นความคืบหน้า ไม่ใช่ค่าเป้าหมาย */}
      {/* v2: ฟีดแบ็ก (design review, 8.7/10, P2) "ทำ percentage เป็น focal point มากขึ้น + ลด prominence
          ของ label (Weight Goal/Body Fat Goal) — ไม่แตะ structure/ข้อมูล" — label เล็กลง (11->10), %
          ใหญ่/หนาขึ้น (11->13, font-semibold->font-bold) ให้เป็นตัวเลขที่สายตาไปหาก่อน */}
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <p className="font-homeTh" style={{ color: HOME_COLORS.textSecondary, fontSize: 10 }}>
          {label}
        </p>
        <p className="font-homeNum font-bold" style={{ color, fontSize: 13 }}>
          {Math.round(pct)}% complete
        </p>
      </div>
      <p className="font-homeNum font-bold" style={{ fontSize: 14, marginBottom: 8, color: HOME_COLORS.textPrimary }}>
        {fromValue.toFixed(decimals)} → {toValue.toFixed(decimals)} {unit}
      </p>
      <div style={{ height: barHeight, borderRadius: 999, background: 'rgba(255,255,255,.06)', overflow: 'hidden', marginBottom: 6 }}>
        <AnimatedBarFill pct={pct} color={color} />
      </div>
      <p className="font-homeTh" style={{ color: HOME_COLORS.textSecondary, fontSize: 10.5 }}>
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
