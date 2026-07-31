'use client'

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
}

// กราฟเส้นจิ๋วท้ายการ์ดเมตริก — เส้น SVG ธรรมดา ไม่มีพื้นที่ใต้กราฟ ไม่มี glow filter (ตามสเปคที่ขอ
// "No fill" ให้เบา/เรียบแบบ Apple Health) เดิมเคยมี area-fill + glow 2 ชั้นซ้อนกัน (ดู git history
// MetricCard.tsx) ตัดออกให้เหลือแค่เส้น stroke เดียว — โค้งมนแบบ Catmull-Rom เหมือนเดิม
export default function Sparkline({ series, color, height = 26, width = 200, stretch = false }: SparklineProps) {
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

  return (
    <svg
      width={stretch ? '100%' : w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio={stretch ? 'none' : undefined}
      className={stretch ? 'block' : 'shrink-0'}
      aria-hidden="true"
    >
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
