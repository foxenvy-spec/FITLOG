'use client'

import { dashboardSpec } from '@/lib/dashboardSpec'
import { COLORS, withAlpha } from '@/lib/theme'
import { recoveryTier } from '@/lib/dashboardStats'

// ใหม่สำหรับ Version 5 rebuild — แถว 3 การ์ดเล็ก Recovery/Body Fat/Weight แทนกริด 2x2 Body Overview
// เดิม (BodyMetricsRow.tsx, มี 4 การ์ด: น้ำหนัก/ไขมันในร่างกาย/มวลกล้ามเนื้อ/มวลไขมัน — mockup มีแค่ 3
// การ์ดตามที่ "Version 5" แสดงเป๊ะ ไม่ใส่มวลกล้ามเนื้อ/มวลไขมันเพิ่มเพราะไม่มีใน mockup)
//
// Recovery ใช้ recoveryTier() ตัวเดียวกับที่ AI Coach/Recovery card อื่นทั้งแอปใช้ (ไม่คิดเกณฑ์สี/ป้าย
// ใหม่แยกต่างหาก — เคยมีบั๊กจริงจากการมีหลาย tier function กระจายคนละไฟล์คำนวณจากข้อมูลเดียวกันแล้วให้
// ผลไม่ตรงกัน ดู comment ที่ recoveryVerdictEmoji ใน lib/dashboardStats.ts)

interface MetricValue {
  value: number | null
  delta: number | null
  isGood: boolean | null
}

function MiniStatCard({
  icon,
  iconColor,
  label,
  value,
  sublabel,
  sublabelColor,
}: {
  icon: string
  iconColor: string
  label: string
  value: string
  sublabel: string
  sublabelColor: string
}) {
  return (
    <div
      className="rounded-card bg-surface border border-line px-3 py-2.5 flex flex-col justify-between"
      style={{ height: dashboardSpec.miniStatCard.height, borderRadius: dashboardSpec.miniStatCard.borderRadius }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px]"
          style={{ backgroundColor: withAlpha(iconColor, '18') }}
          aria-hidden="true"
        >
          {icon}
        </span>
        {/* min-w-0 จำเป็น — flex item ปกติไม่ยอมหดเกินความกว้างเนื้อหาตัวเอง (min-width:auto ดีฟอลต์)
            ทำให้ truncate ไม่ทำงานจริง (แถวทั้งแถวล้นการ์ดแทน) ต้องใส่ min-w-0 ให้ยอมหดก่อน ellipsis
            ถึงจะตัดคำที่ความกว้างจริงของคอลัมน์ (~58px) แทนที่จะกินพื้นที่เกินจนดูเหมือนตัดสั้นผิดปกติ */}
        <p className="text-[11px] text-muted truncate min-w-0 flex-1">{label}</p>
      </div>
      <div>
        <p className="font-mono font-bold text-ink leading-none" style={{ fontSize: 17 }}>
          {value}
        </p>
        <p className="text-[11px] mt-1 leading-none" style={{ color: sublabelColor }}>
          {sublabel}
        </p>
      </div>
    </div>
  )
}

function deltaText(delta: number | null, digits = 1): string {
  if (delta == null) return '–'
  const rounded = Math.round(delta * 10 ** digits) / 10 ** digits
  return `${rounded > 0 ? '↑' : rounded < 0 ? '↓' : ''} ${Math.abs(rounded)}`
}

// isGood=null (ไม่มีข้อมูลเทียบ/delta เป็น 0) ใช้สีเทากลาง ไม่ใช่เขียว/แดง เพราะยังไม่รู้ทิศทางจริง
function deltaColor(isGood: boolean | null): string {
  if (isGood === true) return COLORS.moss
  if (isGood === false) return COLORS.rust
  return '#9498A0'
}

export default function TriStatRow({
  recoveryPct,
  bodyFat,
  weight,
  weightUnit,
}: {
  recoveryPct: number | null
  bodyFat: MetricValue
  weight: MetricValue
  weightUnit: string
}) {
  const recovery = recoveryPct != null ? recoveryTier(recoveryPct) : null
  return (
    <div className="grid grid-cols-3 animate-rise" style={{ gap: dashboardSpec.miniStatCard.gridGap }}>
      <MiniStatCard
        icon="💚"
        iconColor={recovery?.color ?? '#9498A0'}
        label="ฟื้นตัว"
        value={recoveryPct != null ? `${recoveryPct}%` : '–'}
        sublabel={recovery?.labelTh ?? 'ยังไม่มีข้อมูล'}
        sublabelColor={recovery?.color ?? '#9498A0'}
      />
      <MiniStatCard
        icon="🔻"
        iconColor={COLORS.rust}
        label="ไขมัน"
        value={bodyFat.value != null ? `${bodyFat.value.toFixed(1)}%` : '–'}
        sublabel={deltaText(bodyFat.delta)}
        sublabelColor={deltaColor(bodyFat.isGood)}
      />
      <MiniStatCard
        icon="⚖️"
        iconColor={COLORS.amber}
        label="น้ำหนัก"
        value={weight.value != null ? `${weight.value.toFixed(1)}${weightUnit}` : '–'}
        sublabel={deltaText(weight.delta)}
        sublabelColor={deltaColor(weight.isGood)}
      />
    </div>
  )
}
