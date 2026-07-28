'use client'

import Link from 'next/link'
import { useId } from 'react'
import type { FitnessScoreResult } from '@/lib/fitnessScore'

interface FitnessScoreProps {
  score: FitnessScoreResult
  /** เส้นผ่านศูนย์กลางวงแหวน (px) — สเปก mockup ล่าสุดขอ 112–120px, ดีฟอลต์ 116 */
  size?: number
}

// วงแหวน Fitness Score — คะแนนรวมใหม่ (ไม่มีอยู่ใน FITLOG เดิม) ดูสูตรคำนวณเต็มที่ lib/fitnessScore.ts
// ลิงก์ไปหน้า /stats เพราะยังไม่มีหน้ารายละเอียดคะแนนนี้โดยเฉพาะ — /stats คือที่ที่ใกล้เคียงที่สุด
//
// v3 (ตามสเปก mockup): วงใหญ่ขึ้น (80 -> 112–120) + เส้น stroke เป็น gradient (ไม่ใช่สีทึบเดียว) +
// glow ฟุ้งรอบวง (SVG filter, ไม่ใช่แค่ drop-shadow ธรรมดา) + inner shadow บางๆ ให้ดูมีมิติ +
// label "Fitness Score / tier" อยู่กึ่งกลางใต้วงทันที (ไม่ชิดขวาแบบเวอร์ชันก่อน)
export default function FitnessScore({ score, size = 116 }: FitnessScoreProps) {
  const strokeWidth = Math.round(size * 0.075) // ~8-9px ที่ size 112-120
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - score.score / 100)
  const gradId = useId()
  const glowId = useId()

  return (
    <Link
      href="/stats"
      className="flex flex-col items-center gap-1.5"
      aria-label={`Fitness Score ${score.score} จาก 100 — ${score.tierLabelTh}`}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
          <defs>
            {/* gradient stroke — ปลายอ่อนกว่าต้นเล็กน้อย ให้วงดูมีความลึกแทนที่จะเป็นสีทึบแบน */}
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={score.color} stopOpacity="0.65" />
              <stop offset="100%" stopColor={score.color} stopOpacity="1" />
            </linearGradient>
            {/* outer glow — blur แล้ว merge กลับเข้ากับเส้นจริง ให้ฟุ้งแบบมีแกนสว่างชัดตรงกลาง
                ไม่ใช่แค่จางๆ แบบ drop-shadow เฉยๆ */}
            <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation={strokeWidth * 0.6} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#23272D" strokeWidth={strokeWidth} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            filter={`url(#${glowId})`}
          />
        </svg>
        {/* inner shadow บางๆ ด้านในวง ให้ตัวเลขตรงกลางดูจมลงไปนิดหนึ่งแทนที่จะลอยแบน */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{ inset: strokeWidth, boxShadow: 'inset 0 3px 8px rgba(0,0,0,.5)' }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-ink leading-none" style={{ fontSize: Math.round(size * 0.28) }}>
            {score.score}
          </span>
          <span className="text-muted leading-none mt-0.5" style={{ fontSize: Math.round(size * 0.12) }}>
            /100
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="tracked uppercase text-muted leading-none" style={{ fontSize: 10 }}>
          Fitness Score
        </p>
        <p
          className="font-display font-bold tracked uppercase leading-tight mt-1"
          style={{ fontSize: 14, color: score.color }}
        >
          {score.tierLabel}
        </p>
      </div>
    </Link>
  )
}
