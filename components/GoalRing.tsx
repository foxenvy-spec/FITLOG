'use client'

import { useCountUp } from '@/lib/useCountUp'

interface GoalRingProps {
  pct: number
  size?: number
  strokeWidth?: number
  color?: string
  trackColor?: string
  label?: string
  // ข้อความสำหรับ screen reader เท่านั้น ใช้ตอนที่มี caption แสดงอยู่นอกวงแล้ว (เช่น header ด้านบน)
  // และไม่อยากให้ label ไปแสดงซ้ำข้างในวงอีกที ถ้าไม่ระบุจะ fallback ไปใช้ label แทน
  ariaLabel?: string
  // ข้อความกลางวงแทนที่ "{pct}%" ตายตัว — ใช้ตอนอยากโชว์เป็นเศษส่วน (เช่น "7/10") แทน %
  // เช่นการ์ด Weekly Goal แบบมือถือที่นับ "กี่กลุ่มกล้ามเนื้อบรรลุเป้าหมายแล้ว" ไม่ใช่เปอร์เซ็นต์
  valueLabel?: string
  // v46: "Animated Ring — Spark วิ่งช้าๆ" — ดึงเทคนิค light-sweep + spark-flash เดียวกับ FitnessRing.tsx
  // (animate-ring-sweep-slow 12s + animate-ring-spark-flash ใน globals.css ที่มีอยู่แล้ว ไม่ได้สร้างใหม่)
  // มาใช้กับ GoalRing ด้วย — GoalRing ใช้กับหลายสีธีม (ฟ้า/อำพัน) จึงใช้จุดสีขาวจางๆ แบบ FitnessRing
  // (ไม่ใช่จุดสีครีม/ส้มแบบ ProgressRing ซึ่งผูกกับธีมไฟ) ให้เข้ากับทุกสีวง ปิดดีฟอลต์ (false) ไม่กระทบ
  // ที่เรียกใช้เดิมทั้งหมด — เปิดเฉพาะจุดที่อยากได้ (ดู DashboardView.tsx)
  glow?: boolean
}

export default function GoalRing({
  pct,
  size = 64,
  strokeWidth = 7,
  color = '#E8A33D',
  trackColor = '#23272D',
  label,
  ariaLabel,
  valueLabel,
  glow = false,
}: GoalRingProps) {
  const clamped = Math.max(0, Math.min(100, pct))
  const animatedPct = useCountUp(clamped)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - animatedPct / 100)

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(animatedPct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel ?? label ?? 'ความคืบหน้า'}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      {glow && (
        <>
          <div className="absolute inset-0 pointer-events-none animate-ring-sweep-slow" aria-hidden="true">
            <div
              className="absolute rounded-full"
              style={{
                width: Math.max(3, strokeWidth * 0.45),
                height: Math.max(3, strokeWidth * 0.45),
                left: '50%',
                top: strokeWidth / 2,
                transform: 'translate(-50%, -50%)',
                background: '#FFFFFF',
                opacity: 0.3,
                mixBlendMode: 'screen',
              }}
            />
          </div>
          <span
            className="animate-ring-spark-flash absolute rounded-full pointer-events-none"
            aria-hidden="true"
            style={{
              width: Math.max(3, strokeWidth * 0.45),
              height: Math.max(3, strokeWidth * 0.45),
              left: '50%',
              top: strokeWidth / 2,
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle, rgba(255,255,255,.95), transparent 70%)',
            }}
          />
        </>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-ink leading-none" style={{ fontSize: size * 0.24 }}>
          {valueLabel ?? `${Math.round(animatedPct)}%`}
        </span>
        {label && <span className="text-[9px] text-muted mt-0.5">{label}</span>}
      </div>
    </div>
  )
}
