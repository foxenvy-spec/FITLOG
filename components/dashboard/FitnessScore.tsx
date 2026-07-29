'use client'

import Link from 'next/link'
import type { FitnessScoreResult } from '@/lib/fitnessScore'
import { useCountUp } from '@/lib/useCountUp'
import FitnessRing from './FitnessRing'

interface FitnessScoreProps {
  score: FitnessScoreResult
  /** เส้นผ่านศูนย์กลางวงแหวน (px) — สเปก mockup ล่าสุดขอ 110–120px, ดีฟอลต์ 110 */
  size?: number
}

// วงแหวน Fitness Score — คะแนนรวมใหม่ (ไม่มีอยู่ใน FITLOG เดิม) ดูสูตรคำนวณเต็มที่ lib/fitnessScore.ts
// ลิงก์ไปหน้า /stats เพราะยังไม่มีหน้ารายละเอียดคะแนนนี้โดยเฉพาะ — /stats คือที่ที่ใกล้เคียงที่สุด
//
// v10: ตัว "วง" เปลี่ยนจาก ProgressRing (SVG stroke-dasharray) มาเป็น FitnessRing (conic-gradient +
// CSS mask) ตามสเปคเอฟเฟกต์ header ชุดใหม่ — ไฟล์นี้เหลือแค่ "ประกอบร่าง" เฉพาะหน้า dashboard
// (ลิงก์ /stats, label Fitness Score/tier,
// ตัวเลขนับขึ้นด้วย useCountUp ที่มีอยู่แล้วในโปรเจกต์ — ใช้ตัวเดียวกับ GoalRing.tsx ไม่ได้สร้างซ้ำ)
// เวลาคะแนนเปลี่ยน (เช่น 89 -> 90) ทั้งตัวเลขกลางวงและเส้น progress จะไล่ขึ้นพร้อมกันนุ่มๆ
// เพราะใช้ animatedScore ตัวเดียวกันทั้งสองจุด ไม่ใช่กระโดดทันที
//
// สีวง + tier label เปลี่ยนตาม tier ของคะแนนแล้ว (score.gradientStops / score.color จาก
// lib/fitnessScore.ts) แทนที่จะเป็นสีไฟคงที่ (FIRE_ACCENT) เดิม — เพิ่มบรรทัดคำแนะนำ (score.
// recommendation) ต่อท้าย tier label ให้ผู้ใช้เข้าใจ "ควรทำอะไรต่อ" ไม่ใช่แค่เห็นตัวเลข/ชื่อ tier เฉยๆ
export default function FitnessScore({ score, size = 110 }: FitnessScoreProps) {
  const animatedScore = Math.round(useCountUp(score.score, 900))

  return (
    <Link
      href="/stats"
      className="flex flex-col items-center gap-1.5"
      aria-label={`Fitness Score ${score.score} จาก 100 — ${score.tierLabelTh} — ${score.recommendation}`}
    >
      <FitnessRing value={animatedScore} size={size} gradientStops={score.gradientStops}>
        <span className="font-mono text-ink leading-none" style={{ fontSize: Math.round(size * 0.28) }}>
          {animatedScore}
        </span>
        <span className="text-muted leading-none mt-0.5" style={{ fontSize: Math.round(size * 0.12) }}>
          /100
        </span>
      </FitnessRing>
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
        <p className="text-muted leading-tight mt-0.5" style={{ fontSize: 9, maxWidth: 120 }}>
          {score.recommendation}
        </p>
      </div>
    </Link>
  )
}
