'use client'

import Link from 'next/link'
import type { FitnessScoreResult } from '@/lib/fitnessScore'

interface FitnessScoreRingProps {
  score: FitnessScoreResult
}

// วงแหวน Fitness Score — คะแนนรวมใหม่ (ไม่มีอยู่ใน FITLOG เดิม) ดูสูตรคำนวณเต็มที่ lib/fitnessScore.ts
// ลิงก์ไปหน้า /stats เพราะยังไม่มีหน้ารายละเอียดคะแนนนี้โดยเฉพาะ — /stats คือที่ที่ใกล้เคียงที่สุด
export default function FitnessScoreRing({ score }: FitnessScoreRingProps) {
  const size = 92
  const strokeWidth = 8
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - score.score / 100)

  return (
    <Link href="/stats" className="flex flex-col items-center shrink-0 gap-1" aria-label={`Fitness Score ${score.score} จาก 100 — ${score.tierLabelTh}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#23272D" strokeWidth={strokeWidth} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={score.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ filter: `drop-shadow(0 0 6px ${score.color}99)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-2xl text-ink leading-none">{score.score}</span>
          <span className="text-[10px] text-muted leading-none mt-0.5">/100</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-[9px] tracked uppercase text-muted leading-none">Fitness Score</p>
        <p className="text-xs font-display tracked uppercase leading-tight mt-0.5" style={{ color: score.color }}>
          {score.tierLabel}
        </p>
      </div>
    </Link>
  )
}
