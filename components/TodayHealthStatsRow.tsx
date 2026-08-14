'use client'

import Link from 'next/link'
import { useId } from 'react'
import type { HealthSnapshot } from '@/lib/healthIntegration'
import { COLORS, withAlpha } from '@/lib/theme'
import { dashboardSpec } from '@/lib/dashboardSpec'

interface TodayHealthStatsRowProps {
  health: HealthSnapshot
}

const METRIC_META = {
  calories: { icon: '🔥', title: 'Calories', unit: 'kcal', color: COLORS.amber },
  steps: { icon: '👣', title: 'Steps', unit: 'ก้าว', color: COLORS.moss },
  sleepHours: { icon: '🌙', title: 'Sleep', unit: 'ชม.', color: COLORS.purple },
} as const

// เส้นคลื่นจิ๋วตกแต่ง (decorative only, ไม่มีความหมายเชิงข้อมูล — เหมือน AnimatedWave)
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
  // v33: "Health App Card ยังไม่เข้าธีม ควรเป็น Glass Card" — เดิม bg-surface + border-dashed (กล่องขอบ
  // ประ ธรรมดา) ไม่ใช่วัสดุชุดไหนในแอปเลย (ไม่ใช่ titanium ทึบแบบการ์ดข้อมูลจริง ไม่ใช่อะไรทั้งนั้น) —
  // การ์ดนี้ต่างจากการ์ดอื่น ตรงที่เป็น "ยังไม่เชื่อมต่อ" (ไม่มีข้อมูลจริงให้โชว์) จึงตั้งใจใช้วัสดุคนละ
  // ชุดกับ titanium ทึบ (CARD_GRADIENT_CSS) ของการ์ดข้อมูลจริงอื่นๆ โดยเจตนา — "Glass" โปร่งแสง/บาง เบา
  // กว่า ให้ความรู้สึก "ช่องว่างรอเติม" ไม่ใช่ "แผ่นโลหะเหมือนของจริง" (ต่างจาก GlassCard.tsx เดิมที่ใช้
  // โทนน้ำเงินกรมท่า — ปรับโทนให้เป็นเทาไทเทเนียม/อำพัน ให้ยังอยู่ในธีม Dark Titanium เดียวกับทั้งแอป)
  if (!health.connected) {
    return (
      // v67: ฟีดแบ็ก "AI Coach ควรเป็น visual weight สูงสุดของหน้าโดยตั้งใจ — ลดความเด่นของ Weekly
      // Activity และ Health App แทนที่จะลด AI Coach" — การ์ดนี้ (สถานะยังไม่เชื่อมต่อ ซึ่งเป็นสถานะ default
      // ของผู้ใช้เกือบทุกคน) มีจุดเรืองแสง 3 จุด + border/shadow ชัดเจน แข่งความสนใจกับ AI Coach ด้านล่าง
      // โดยไม่ตั้งใจ — ลด alpha ของ glow/border/background ทุกชั้นลง ~20-30% (ไม่แตะขนาด/ตำแหน่ง/ข้อความ)
      <Link
        href="/profile"
        className="relative overflow-hidden rounded-[20px] flex items-center justify-between gap-3 px-4 backdrop-blur-md active:scale-[0.99] transition"
        style={{
          height: dashboardSpec.healthBanner.height,
          background: 'linear-gradient(180deg, rgba(255,255,255,.04) 0%, rgba(255,255,255,.015) 40%, rgba(255,255,255,.01) 100%), rgba(22,23,26,.5)',
          border: '1px solid rgba(255,255,255,.09)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,.10), 0 8px 20px rgba(0,0,0,.3)',
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center -space-x-2 shrink-0">
            {(['calories', 'steps', 'sleepHours'] as const).map((key) => {
              const meta = METRIC_META[key]
              return (
                <span
                  key={key}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px]"
                  style={{
                    backgroundColor: withAlpha(meta.color, '1c'),
                    border: `1px solid ${withAlpha(meta.color, '40')}`,
                    boxShadow: `0 0 8px ${withAlpha(meta.color, '20')}`,
                  }}
                  aria-hidden="true"
                >
                  {meta.icon}
                </span>
              )
            })}
          </div>
          <div className="min-w-0">
            <p className="font-display text-[11px] tracked uppercase text-ink truncate">เชื่อมต่อ Health App</p>
            {/* v31: ฟีดแบ็ก "เพิ่ม contrast ข้อความรองบนพื้น Titanium" — text-muted (#9498A0) เดิมจางไป
                บนพื้นกระจก (glass) ของแบนเนอร์นี้ ขยับเป็น #A8ACB4 ตามแพทเทิร์นเดียวกับการ์ดอื่นๆ ในรอบนี้
                v15: ฟีดแบ็ก "เพิ่ม Contrast ของ Secondary Text อีก 10-15% โดยเฉพาะ ติดตามสุขภาพ..." (ยกมา
                ตรงบรรทัดนี้เป๊ะ) — #A8ACB4 -> #BCC1CA
                v17: ฟีดแบ็ก "ยังบางอยู่ เพิ่ม contrast ก่อน ไม่ต้องขยายขนาดเยอะ" — บวกอีกขั้น
                #BCC1CA -> #CFD4DE */}
            <p className="text-[9.5px] truncate" style={{ color: '#CFD4DE' }}>ติดตามสุขภาพได้ครบในที่เดียว</p>
          </div>
        </div>
        <span
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.04)' }}
          aria-hidden="true"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M13 6l6 6-6 6" stroke={COLORS.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </Link>
    )
  }

  const items = [
    { key: 'calories' as const, valueLabel: health.calories.value != null ? `${Math.round(health.calories.value).toLocaleString()}` : '—' },
    { key: 'steps' as const, valueLabel: health.steps.value != null ? health.steps.value.toLocaleString() : '—' },
    { key: 'sleepHours' as const, valueLabel: health.sleepHours.value != null ? health.sleepHours.value.toFixed(1) : '—' },
  ]

  return (
    <div
      className="rounded-[20px] bg-surface border border-line grid grid-cols-3 divide-x divide-line overflow-hidden"
      style={{ height: dashboardSpec.healthBanner.height }}
    >
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
