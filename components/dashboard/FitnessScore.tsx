'use client'

import Link from 'next/link'
import type { FitnessScoreResult } from '@/lib/fitnessScore'
import { FIRE_ACCENT } from '@/lib/theme'
import { useCountUp } from '@/lib/useCountUp'
import ProgressRing from '@/components/ui/ProgressRing'

interface FitnessScoreProps {
  score: FitnessScoreResult
  /** เส้นผ่านศูนย์กลางวงแหวน (px) — สเปก mockup ล่าสุดขอ 110–120px, ดีฟอลต์ 110 */
  size?: number
}

// วงแหวน Fitness Score — คะแนนรวมใหม่ (ไม่มีอยู่ใน FITLOG เดิม) ดูสูตรคำนวณเต็มที่ lib/fitnessScore.ts
// ลิงก์ไปหน้า /stats เพราะยังไม่มีหน้ารายละเอียดคะแนนนี้โดยเฉพาะ — /stats คือที่ที่ใกล้เคียงที่สุด
//
// v8 (Design System): ตัว "วง" ย้ายไปเป็น ProgressRing (components/ui/) generic primitive ล้วนๆ
// แล้ว — ไฟล์นี้เหลือแค่ "ประกอบร่าง" เฉพาะหน้า dashboard (ลิงก์ /stats, label Fitness Score/tier,
// ตัวเลขนับขึ้นด้วย useCountUp ที่มีอยู่แล้วในโปรเจกต์ — ใช้ตัวเดียวกับ GoalRing.tsx ไม่ได้สร้างซ้ำ)
// เวลาคะแนนเปลี่ยน (เช่น 89 -> 90) ทั้งตัวเลขกลางวงและเส้น progress จะไล่ขึ้นพร้อมกันนุ่มๆ
// เพราะใช้ animatedScore ตัวเดียวกันทั้งสองจุด ไม่ใช่กระโดดทันที
export default function FitnessScore({ score, size = 110 }: FitnessScoreProps) {
  const animatedScore = Math.round(useCountUp(score.score, 900))

  return (
    <Link
      href="/stats"
      className="flex flex-col items-center gap-1.5"
      aria-label={`Fitness Score ${score.score} จาก 100 — ${score.tierLabelTh}`}
    >
      <ProgressRing value={animatedScore} size={size}>
        <span className="font-mono text-ink leading-none" style={{ fontSize: Math.round(size * 0.28) }}>
          {animatedScore}
        </span>
        <span className="text-muted leading-none mt-0.5" style={{ fontSize: Math.round(size * 0.12) }}>
          /100
        </span>
      </ProgressRing>
      <div className="text-center">
        <p className="tracked uppercase text-muted leading-none" style={{ fontSize: 10 }}>
          Fitness Score
        </p>
        <p
          className="font-display font-bold tracked uppercase leading-tight mt-1"
          style={{ fontSize: 14, color: FIRE_ACCENT }}
        >
          {score.tierLabel}
        </p>
      </div>
    </Link>
  )
}
