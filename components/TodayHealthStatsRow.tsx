'use client'

import Link from 'next/link'
import type { HealthSnapshot } from '@/lib/healthIntegration'
import { COLORS } from '@/lib/theme'

interface TodayHealthStatsRowProps {
  health: HealthSnapshot
}

const METRIC_META = {
  calories: { icon: '🔥', label: 'kcal', color: COLORS.amber },
  steps: { icon: '👣', label: 'ก้าว', color: COLORS.moss },
  sleepHours: { icon: '🌙', label: 'นอนหลับ', color: COLORS.purple },
} as const

/**
 * แถว kcal / ก้าว / นอนหลับ ตามมอคอัพ — FITLOG ยังไม่เชื่อมต่อ health app ใดๆ (ดู
 * lib/healthIntegration.ts) จึงโชว์เป็นการ์ด "เชื่อมต่อเพื่อดูข้อมูล" แทนตัวเลขปลอม ตอนที่
 * useHealthSnapshot() เชื่อมต่อจริงในอนาคตแล้ว (connected: true) component นี้จะสลับไป render
 * แถว 3 ช่องพร้อมค่าจริง + progress bar ให้เองทันที ไม่ต้องแก้ตรงนี้เพิ่ม
 */
export default function TodayHealthStatsRow({ health }: TodayHealthStatsRowProps) {
  if (!health.connected) {
    return (
      <Link
        href="/profile"
        className="rounded-[20px] bg-surface border border-line border-dashed px-4 py-4 flex items-center justify-between gap-3 active:bg-surface2 transition"
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
    { key: 'calories' as const, metric: health.calories, valueLabel: health.calories.value != null ? `${Math.round(health.calories.value)}` : '—' },
    { key: 'steps' as const, metric: health.steps, valueLabel: health.steps.value != null ? health.steps.value.toLocaleString() : '—' },
    {
      key: 'sleepHours' as const,
      metric: health.sleepHours,
      valueLabel: health.sleepHours.value != null ? health.sleepHours.value.toFixed(1) : '—',
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(({ key, metric, valueLabel }) => {
        const meta = METRIC_META[key]
        const pct = metric.value != null && metric.goal != null && metric.goal > 0 ? Math.min(100, (metric.value / metric.goal) * 100) : 0
        return (
          <div key={key} className="rounded-[20px] bg-surface border border-line px-3 py-3">
            <span className="text-sm" aria-hidden="true">{meta.icon}</span>
            <p className="font-mono text-base text-ink mt-1 leading-none">
              {valueLabel}
              <span className="text-[10px] text-muted ml-0.5">{meta.label}</span>
            </p>
            <p className="text-[9px] text-muted mt-1 truncate">
              {key === 'sleepHours' ? health.sleepQualityLabel ?? '\u00A0' : metric.goal != null ? `/ ${metric.goal.toLocaleString()}` : '\u00A0'}
            </p>
            <div className="h-1 rounded-full bg-surface2 mt-2 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
