'use client'

import Link from 'next/link'
import { useId } from 'react'
import type { HealthSnapshot } from '@/lib/healthIntegration'
import { COLORS } from '@/lib/theme'

interface TodayHealthStatsRowProps {
  health: HealthSnapshot
}

const METRIC_META = {
  calories: { icon: '🔥', title: 'Calories', unit: 'kcal', color: COLORS.amber },
  steps: { icon: '👣', title: 'Steps', unit: 'ก้าว', color: COLORS.moss },
  sleepHours: { icon: '🌙', title: 'Sleep', unit: 'ชม.', color: COLORS.purple },
} as const

// เส้นคลื่นจิ๋วตกแต่ง (decorative only, ไม่มีความหมายเชิงข้อมูล — เหมือน FitnessWaveDecoration)
// เพราะ HealthMetric ไม่มี series ย้อนหลังให้พล็อตจริง (FITLOG ยังไม่เชื่อมต่อ health app ใดๆ)
// รูปทรงคงที่ทุกครั้ง แค่เปลี่ยนสีตามธีมของแต่ละเมตริก ให้ความรู้สึก "มีกราฟ" ตามมอคอัพ
function MiniHealthWave({ color }: { color: string }) {
  const gradId = useId()
  return (
    <svg viewBox="0 0 64 20" className="w-full h-[14px]" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <path
        d="M0,14 C6,4 12,18 18,10 C24,2 30,16 36,9 C42,3 48,13 54,7 C58,4 61,6 64,3"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * แถว kcal / ก้าว / นอนหลับ ตามมอคอัพ — 3 คอลัมน์เรียงข้างกันในการ์ดเดียว (ไอคอน/ตัวเลข/กราฟจิ๋ว
 * เรียงแนวตั้งต่อคอลัมน์) แทนที่เวอร์ชันก่อนหน้าที่เรียง 3 แถวซ้อนกัน — ให้ความสูงรวมอยู่ที่ ~82px
 * ตาม Design Token ใหม่ (component height budget: Health Card 82px)
 *
 * FITLOG ยังไม่เชื่อมต่อ health app ใดๆ (ดู lib/healthIntegration.ts) จึงโชว์เป็นการ์ด
 * "เชื่อมต่อเพื่อดูข้อมูล" แทนตัวเลขปลอม ตอนที่ useHealthSnapshot() เชื่อมต่อจริงในอนาคตแล้ว
 * (connected: true) component นี้จะสลับไป render 3 คอลัมน์พร้อมค่าจริงให้เองทันที ไม่ต้องแก้ตรงนี้เพิ่ม
 */
export default function TodayHealthStatsRow({ health }: TodayHealthStatsRowProps) {
  if (!health.connected) {
    return (
      <Link
        href="/profile"
        className="rounded-[20px] bg-surface border border-line border-dashed px-4 h-[82px] flex items-center justify-between gap-3 active:bg-surface2 transition"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-base shrink-0" aria-hidden="true">🔥👣🌙</span>
          <p className="text-xs text-muted truncate">เชื่อมต่อ Health App เพื่อดู kcal / ก้าว / นอนหลับ</p>
        </div>
        <span className="text-[11px] text-amber shrink-0 whitespace-nowrap">เชื่อมต่อ →</span>
      </Link>
    )
  }

  const items = [
    { key: 'calories' as const, valueLabel: health.calories.value != null ? `${Math.round(health.calories.value).toLocaleString()}` : '—' },
    { key: 'steps' as const, valueLabel: health.steps.value != null ? health.steps.value.toLocaleString() : '—' },
    { key: 'sleepHours' as const, valueLabel: health.sleepHours.value != null ? health.sleepHours.value.toFixed(1) : '—' },
  ]

  return (
    <div className="rounded-[20px] bg-surface border border-line h-[82px] grid grid-cols-3 divide-x divide-line overflow-hidden">
      {items.map(({ key, valueLabel }) => {
        const meta = METRIC_META[key]
        return (
          <div key={key} className="flex flex-col items-center justify-center gap-1 px-1.5 min-w-0">
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs"
              style={{ backgroundColor: `${meta.color}22` }}
              aria-hidden="true"
            >
              {meta.icon}
            </span>
            <p className="font-mono text-ink leading-none whitespace-nowrap" style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 700 }}>{valueLabel}</span>{' '}
              <span className="text-[9px] text-muted">{meta.unit}</span>
            </p>
            <div className="w-full max-w-[52px]">
              <MiniHealthWave color={meta.color} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
