'use client'

import { useId } from 'react'

interface SparklineProps {
  series: number[]
  color: string
  height?: number
  /** ความกว้างอ้างอิงสำหรับคำนวณพิกัดจุด — ใช้ตรงๆ เป็นความกว้าง <svg> ถ้า stretch=false (ดีฟอลต์),
   *  ถ้า stretch=true ตัว <svg> ยืดเต็มความกว้าง container แทน (width param ยังใช้แค่คำนวณพิกัดจุด) */
  width?: number
  /** true = เต็มความกว้าง container (การ์ดมือถือ, กราฟเป็นแถบเดี่ยวเต็มการ์ด) — false (ดีฟอลต์) =
   *  ความกว้างคงที่ตาม width px (เดสก์ท็อป, กราฟเล็กอยู่ข้างตัวเลข) */
  stretch?: boolean
  /** ฟีดแบ็ก "เส้นน้ำหนัก = Titanium, จุดล่าสุด = เขียว" — จุดกลมเน้นตำแหน่งล่าสุดของกราฟ แยกสีจากเส้นได้
   *  (เช่น เส้นเทาไทเทเนียม + จุดเขียว) ไม่ระบุ = ไม่วาดจุด (ดีฟอลต์เดิม ไม่กระทบการ์ดอื่นที่ใช้อยู่แล้ว) */
  endpointColor?: string
  /** ฟีดแบ็ก "ลดความหนาเส้นกราฟลง 10-15%" (เฉพาะการ์ด Body Overview บนมือถือ) — ไม่ระบุ = 2 (ดีฟอลต์
   *  เดิม ไม่กระทบจุดอื่นที่ใช้ Sparkline อยู่แล้วทั้งเดสก์ท็อป/หน้าสุขภาพ) */
  strokeWidth?: number
  /** ฟีดแบ็ก "ใส่ Glowing Dot ที่จุดปลายสุด + Gradient Area Fill จางๆ ใต้เส้น ให้ดูพรีเมียมแบบ Apple
   *  Health/TradingView" — เดิมการ์ดนี้ตั้งใจตัด glow/fill ออกหมด (ดู comment เดิมด้านบน อ้าง "No fill"
   *  ตาม Apple Health เหมือนกัน) รอบนี้ขอกลับมาเพิ่มเฉพาะจุด แทนที่จะเปลี่ยนดีฟอลต์ทุกจุดที่ใช้ Sparkline
   *  อยู่แล้วทั่วแอป (เช่นหน้า /health) จึงทำเป็น opt-in 2 prop นี้ — ไม่ระบุ = พฤติกรรมเดิมทุกประการ */
  glowEndpoint?: boolean
  areaFill?: boolean
}

// กราฟเส้นจิ๋วท้ายการ์ดเมตริก — เส้น SVG ธรรมดา โค้งมนแบบ Catmull-Rom — ดีฟอลต์ยังไม่มีพื้นที่ใต้กราฟ/glow
// (ตามสเปคเดิม "No fill" แบบ Apple Health) areaFill/glowEndpoint เป็น opt-in เพิ่มเข้ามาทีหลัง ดู comment
// ที่ prop ทั้งสองด้านบน
export default function Sparkline({
  series,
  color,
  height = 26,
  width = 200,
  stretch = false,
  endpointColor,
  strokeWidth = 2,
  glowEndpoint = false,
  areaFill = false,
}: SparklineProps) {
  const gradId = useId()
  if (series.length < 2) return null
  const w = width
  const h = height
  const pad = 3
  const tension = 0.6
  const min = Math.min(...series)
  const max = Math.max(...series)
  const range = max - min || 1
  const step = w / (series.length - 1)
  const points: [number, number][] = series.map((v, i) => [i * step, h - pad - ((v - min) / range) * (h - pad * 2)])

  const n = points.length
  let path = `M ${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2 < n ? i + 2 : n - 1]
    const cp1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension
    const cp1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension
    const cp2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension
    const cp2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension
    path += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`
  }

  const endColor = endpointColor ?? color
  const areaPath = areaFill
    ? `${path} L ${points[n - 1][0].toFixed(2)},${h.toFixed(2)} L ${points[0][0].toFixed(2)},${h.toFixed(2)} Z`
    : null

  return (
    <svg
      width={stretch ? '100%' : w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio={stretch ? 'none' : undefined}
      className={stretch ? 'block' : 'shrink-0'}
      aria-hidden="true"
    >
      {areaFill && (
        <defs>
          <linearGradient id={`${gradId}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.1" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {areaPath && <path d={areaPath} fill={`url(#${gradId}-area)`} stroke="none" />}
      <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      {glowEndpoint && (
        <circle cx={points[n - 1][0]} cy={points[n - 1][1]} r={5} fill={endColor} opacity="0.35" style={{ filter: 'blur(2px)' }} />
      )}
      {endpointColor && <circle cx={points[n - 1][0]} cy={points[n - 1][1]} r={3} fill={endpointColor} />}
    </svg>
  )
}
