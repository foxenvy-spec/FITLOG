'use client'

import { useState } from 'react'
import Button from './ui/Button'
import { COLORS } from '@/lib/theme'

// ฟีดแบ็ก "Weekly Summary Modal/Shareable Card — ทำปุ่ม Share สรุปประจำสัปดาห์ออกมาเป็นภาพสวยๆ สไตล์
// Spotify Wrapped ให้แชร์ลง IG Story/Facebook ได้" — วาดด้วย Canvas API ตรงๆ ในเบราว์เซอร์ (ไม่เพิ่ม
// dependency ใหม่ เช่น html2canvas — แอปนี้ตั้งใจพึ่ง dependency น้อยมาโดยตลอด) ใช้ฟอนต์ระบบ (ไม่ใช่
// font-display ของแอปเอง) เพราะชื่อฟอนต์จริงที่ next/font สร้างเป็นชื่อ obfuscated ไม่เสถียรพอจะอ้างใน
// ctx.font ตรงๆ ได้ปลอดภัย — สีธีมยังคงใช้ COLORS ตัวจริงของแอป ให้ยังดูเป็น FITLOG ได้ชัดจากจานสี
interface WeeklySummaryStats {
  dateRangeLabel: string
  streak: number
  workoutDays: number
  workoutGoal: number
  weeklyTotalSets: number
  weeklyConsistencyPct: number | null
  weeklyGoalPct: number
}

const CANVAS_SIZE = 1080

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawCard(ctx: CanvasRenderingContext2D, stats: WeeklySummaryStats) {
  const S = CANVAS_SIZE
  // พื้นหลัง — ไล่สีไทเทเนียมเข้มเหมือนธีมหลักของแอป (ไม่ใช่ดำสนิทเรียบๆ ให้มีมิติ)
  const bg = ctx.createLinearGradient(0, 0, 0, S)
  bg.addColorStop(0, '#14161A')
  bg.addColorStop(1, '#08090B')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, S, S)

  // glow อำพันมุมบนซ้ายจางๆ ให้มีจุดเน้นสไตล์เดียวกับการ์ดอื่นในแอป
  const glow = ctx.createRadialGradient(S * 0.15, S * 0.1, 0, S * 0.15, S * 0.1, S * 0.6)
  glow.addColorStop(0, 'rgba(232,163,61,.12)')
  glow.addColorStop(1, 'rgba(232,163,61,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, S, S)

  // wordmark
  ctx.fillStyle = COLORS.amber
  ctx.font = '700 40px system-ui, -apple-system, sans-serif'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('FITLOG', 72, 120)
  ctx.fillStyle = '#9498A0'
  ctx.font = '400 26px system-ui, -apple-system, sans-serif'
  ctx.fillText('WEEKLY SUMMARY', 72, 158)
  ctx.fillText(stats.dateRangeLabel, 72, 192)

  // hero: streak
  ctx.fillStyle = '#F2F3F4'
  ctx.font = '800 220px system-ui, -apple-system, sans-serif'
  ctx.fillText(`${stats.streak}`, 72, 480)
  ctx.font = '600 44px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = COLORS.amber
  ctx.fillText('🔥 วันติดต่อกัน', 72, 540)

  // stat chips — 2x2 grid
  const chips: { label: string; value: string }[] = [
    { label: 'Workout Days', value: `${stats.workoutDays}/${stats.workoutGoal}` },
    { label: 'Weekly Volume', value: `${stats.weeklyTotalSets} sets` },
    { label: 'Consistency', value: stats.weeklyConsistencyPct != null ? `${stats.weeklyConsistencyPct}%` : '—' },
    { label: 'Goal Progress', value: `${stats.weeklyGoalPct}%` },
  ]
  const chipW = (S - 72 * 2 - 24) / 2
  const chipH = 168
  const startY = 620
  chips.forEach((chip, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = 72 + col * (chipW + 24)
    const y = startY + row * (chipH + 24)
    ctx.fillStyle = 'rgba(255,255,255,.04)'
    roundRect(ctx, x, y, chipW, chipH, 24)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,.08)'
    ctx.lineWidth = 1
    roundRect(ctx, x, y, chipW, chipH, 24)
    ctx.stroke()

    ctx.fillStyle = '#F2F3F4'
    ctx.font = '700 56px system-ui, -apple-system, sans-serif'
    ctx.fillText(chip.value, x + 32, y + 88)
    ctx.fillStyle = '#8A9098'
    ctx.font = '400 24px system-ui, -apple-system, sans-serif'
    ctx.fillText(chip.label.toUpperCase(), x + 32, y + 128)
  })

  // footer
  ctx.fillStyle = '#5A5E66'
  ctx.font = '400 22px system-ui, -apple-system, sans-serif'
  ctx.fillText('Made with FITLOG', 72, S - 56)
}

export default function ShareWeeklySummaryButton({ stats }: { stats: WeeklySummaryStats }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleShare() {
    setBusy(true)
    setError(null)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = CANVAS_SIZE
      canvas.height = CANVAS_SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas unsupported')
      drawCard(ctx, stats)

      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('สร้างภาพไม่สำเร็จ')

      const file = new File([blob], 'fitlog-weekly-summary.png', { type: 'image/png' })
      // มือถือ/เบราว์เซอร์ที่รองรับ Web Share API + ไฟล์ — เปิด share sheet ของระบบตรงๆ (IG Story/
      // Facebook/LINE ฯลฯ) — เดสก์ท็อปส่วนใหญ่ยังไม่รองรับ files ใน share สลับไปดาวน์โหลดแทน
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'FITLOG Weekly Summary' })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'fitlog-weekly-summary.png'
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }
    } catch (e) {
      // AbortError = ผู้ใช้กดยกเลิก share sheet เอง ไม่ใช่ error จริง ไม่ต้องโชว์ข้อความ
      if (e instanceof Error && e.name === 'AbortError') return
      setError('สร้างภาพสรุปไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <Button type="button" variant="secondary" size="sm" onClick={handleShare} disabled={busy}>
        {busy ? '...' : '📤 แชร์สรุปสัปดาห์'}
      </Button>
      {error && <p className="text-[10px]" style={{ color: COLORS.rust }}>{error}</p>}
    </div>
  )
}
